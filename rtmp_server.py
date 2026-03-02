#!/usr/bin/env python3
"""WebcamStudio — RTMP Ingest, Live Web Player & Admin Panel

Accepts one RTMP publisher, transcodes to HLS via FFmpeg, serves a modern
viewer page, and exposes a password-protected admin dashboard at /admin.

Dependencies: ffmpeg (in PATH), Python 3.9+

Usage:
    python rtmp_server.py [--rtmp-port 1935] [--http-port 8080]
                          [--admin-password SECRET] [--config config.json]

Stream to:  rtmp://<host>:<rtmp-port>/live
Watch at:   http://<host>:<http-port>
Admin at:   http://<host>:<http-port>/admin
"""

import argparse
import hashlib
import hmac
import http.server
import json
import os
import secrets
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
import time
from html import escape as _esc
from pathlib import Path
from string import Template
from urllib.parse import parse_qs, urlparse


# ─── Config ───────────────────────────────────────────────────────────────────

class Config:
    """Thread-safe, optionally file-backed server configuration."""

    DEFAULTS: dict = {
        # Ingest
        "rtmp_port":     1935,
        "stream_path":   "live",
        # Transcoding
        "video_codec":   "copy",       # "copy" | "libx264" | "h264_nvenc" | …
        "preset":        "veryfast",
        "video_bitrate": "",            # "" = let FFmpeg decide
        # HLS
        "hls_time":      1,
        "hls_list_size": 8,
        # Audio
        "audio_bitrate": "128k",
        # Appearance
        "page_title":    "WebcamStudio Live",
        # Auth (written by set_password; never read as plain-text)
        "pw_hash": "",
        "pw_salt": "",
    }

    def __init__(self, path: Path | None = None, **overrides):
        self._lock = threading.Lock()
        self._d    = {**self.DEFAULTS}
        self._path = path
        if path and path.exists():
            try:
                self._d.update(json.loads(path.read_text()))
            except Exception as exc:
                print(f"[config] Could not load {path}: {exc}", file=sys.stderr)
        self._d.update(overrides)

    def get(self, key: str, default=None):
        with self._lock:
            return self._d.get(key, default)

    def update(self, d: dict):
        with self._lock:
            self._d.update(d)
        self._save()

    def snapshot(self) -> dict:
        with self._lock:
            return dict(self._d)

    def set_password(self, password: str):
        salt = secrets.token_hex(16)
        h    = hashlib.sha256((salt + password).encode()).hexdigest()
        self.update({"pw_hash": h, "pw_salt": salt})

    def verify_password(self, password: str) -> bool:
        with self._lock:
            h    = self._d.get("pw_hash", "")
            salt = self._d.get("pw_salt", "")
        if not h:
            return False
        candidate = hashlib.sha256((salt + password).encode()).hexdigest()
        return hmac.compare_digest(h, candidate)

    def _save(self):
        if not self._path:
            return
        try:
            with self._lock:
                data = dict(self._d)
            self._path.write_text(json.dumps(data, indent=2))
        except OSError as exc:
            print(f"[config] Save failed: {exc}", file=sys.stderr)


# ─── Sessions ─────────────────────────────────────────────────────────────────

class SessionStore:
    TTL = 8 * 3600   # 8 hours

    def __init__(self):
        self._s: dict[str, float] = {}   # token → expires_at
        self._lock = threading.Lock()

    def create(self) -> str:
        token = secrets.token_urlsafe(32)
        with self._lock:
            self._s[token] = time.time() + self.TTL
        return token

    def valid(self, token: str | None) -> bool:
        if not token:
            return False
        with self._lock:
            exp = self._s.get(token)
            if exp is None or time.time() > exp:
                self._s.pop(token, None)
                return False
            return True

    def revoke(self, token: str):
        with self._lock:
            self._s.pop(token, None)


# ─── Log buffer ───────────────────────────────────────────────────────────────

class LogBuffer:
    def __init__(self, maxlines: int = 400):
        self._lines: list[str] = []
        self._max  = maxlines
        self._lock = threading.Lock()

    def append(self, line: str):
        with self._lock:
            self._lines.append(line)
            if len(self._lines) > self._max:
                self._lines = self._lines[-self._max :]

    def tail(self, n: int = 100) -> list[str]:
        with self._lock:
            return list(self._lines[-n:])


# ─── RTMP → HLS ingest ────────────────────────────────────────────────────────

class RTMPIngest:
    """FFmpeg RTMP listener → HLS segments.  Watchdog restarts on disconnect."""

    def __init__(self, config: Config, hls_dir: Path, log_buf: LogBuffer):
        self._cfg  = config
        self.hls_dir = hls_dir
        self._log  = log_buf

        self._proc: subprocess.Popen | None = None
        self._lock   = threading.Lock()
        self._stop   = threading.Event()
        self._thread: threading.Thread | None = None

        self.publisher_connected = False
        self.stream_start: float = 0.0

    # ── public ────────────────────────────────────────────────────────────────

    def start(self):
        self.hls_dir.mkdir(parents=True, exist_ok=True)
        if not shutil.which("ffmpeg"):
            print("ERROR: ffmpeg not found in PATH.", file=sys.stderr)
            sys.exit(1)
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def stop(self):
        self._stop.set()
        self.kick()

    def kick(self):
        """Terminate current FFmpeg process; watchdog restarts listener."""
        with self._lock:
            if self._proc and self._proc.poll() is None:
                self._proc.terminate()

    def is_live(self) -> bool:
        return self.publisher_connected

    def uptime(self) -> float:
        return time.time() - self.stream_start if self.publisher_connected else 0.0

    # ── internals ─────────────────────────────────────────────────────────────

    def _build_cmd(self) -> list[str]:
        c    = self._cfg.snapshot()
        port = int(c["rtmp_port"])
        path = str(c["stream_path"]).strip("/")
        codec  = c["video_codec"]
        preset = c["preset"]
        vbr    = c["video_bitrate"]
        abr    = c["audio_bitrate"]
        ht     = int(c["hls_time"])
        hs     = int(c["hls_list_size"])

        if codec == "copy":
            enc = ["-c:v", "copy"]
        else:
            enc = ["-c:v", codec, "-preset", preset,
                   "-tune", "zerolatency", "-pix_fmt", "yuv420p"]
            if vbr:
                enc += ["-b:v", vbr, "-maxrate", vbr]

        return [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "info",
            "-listen", "1",
            "-i", f"rtmp://0.0.0.0:{port}/{path}",
            *enc,
            "-c:a", "aac", "-b:a", abr,
            "-f", "hls",
            "-hls_time",     str(ht),
            "-hls_list_size", str(hs),
            "-hls_flags", "delete_segments+append_list+split_by_time",
            "-hls_segment_type", "mpegts",
            "-hls_segment_filename", str(self.hls_dir / "seg%05d.ts"),
            str(self.hls_dir / "stream.m3u8"),
        ]

    def _clear_hls(self):
        for f in self.hls_dir.glob("*.ts"):
            try: f.unlink()
            except OSError: pass
        m = self.hls_dir / "stream.m3u8"
        if m.exists():
            try: m.unlink()
            except OSError: pass

    def _log_print(self, msg: str):
        print(msg, flush=True)
        self._log.append(msg)

    def _loop(self):
        while not self._stop.is_set():
            self._clear_hls()
            port = self._cfg.get("rtmp_port", 1935)
            path = str(self._cfg.get("stream_path", "live")).strip("/")
            self._log_print(f"[ingest] Listening on rtmp://0.0.0.0:{port}/{path} …")

            try:
                proc = subprocess.Popen(
                    self._build_cmd(),
                    stderr=subprocess.PIPE, stdout=subprocess.DEVNULL)
            except FileNotFoundError:
                self._log_print("[ingest] ERROR: ffmpeg not found")
                self._stop.wait(5)
                continue

            with self._lock:
                self._proc = proc

            for raw in proc.stderr:
                line = raw.decode(errors="replace").rstrip()
                if line:
                    self._log_print(line)
                if "Stream #0" in line and "Video" in line:
                    with self._lock:
                        if not self.publisher_connected:
                            self.publisher_connected = True
                            self.stream_start = time.time()
                            self._log_print("[ingest] Publisher connected — streaming!")

            proc.wait()
            with self._lock:
                self.publisher_connected = False
                self._proc = None

            if not self._stop.is_set():
                self._log_print("[ingest] Publisher disconnected. Ready for next connection.")
                self._stop.wait(0.3)


# ─── HTML pages ───────────────────────────────────────────────────────────────

# Shared CSS variables and base styles embedded in every page.
_CSS_VARS = """
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
  :root {
    --bg0:#0d0e13; --bg1:#181926; --bg2:#1e2030; --bg3:#24273a;
    --border:#313244; --text:#cdd6f4; --sub:#6c7086;
    --green:#a6e3a1; --red:#f38ba8; --yellow:#f9e2af;
    --blue:#89b4fa; --mauve:#cba6f7; --peach:#fab387;
  }
  html,body { height:100%; background:var(--bg0); color:var(--text);
    font-family:'Inter','Segoe UI',system-ui,sans-serif; font-size:14px; }
  a { color:var(--blue); text-decoration:none; }
  a:hover { text-decoration:underline; }
  input,select,textarea {
    background:var(--bg2); border:1px solid var(--border);
    border-radius:6px; color:var(--text); padding:7px 10px;
    font-size:13px; width:100%; outline:none;
    transition:border-color .15s;
  }
  input:focus,select:focus,textarea:focus { border-color:var(--blue); }
  input[type=checkbox] { width:auto; cursor:pointer; }
  button,.btn {
    display:inline-flex; align-items:center; gap:6px;
    padding:8px 18px; border-radius:7px; border:none; cursor:pointer;
    font-size:13px; font-weight:600; transition:opacity .15s,background .15s;
  }
  button:hover,.btn:hover { opacity:.88; }
  .btn-primary { background:var(--blue); color:#0d0e13; }
  .btn-danger  { background:var(--red);  color:#0d0e13; }
  .btn-ghost   { background:transparent; border:1px solid var(--border);
    color:var(--sub); }
  .badge {
    display:inline-flex; align-items:center; gap:6px;
    padding:3px 10px; border-radius:999px;
    font-size:11px; font-weight:700; letter-spacing:.05em; text-transform:uppercase;
  }
  .badge-live { background:rgba(243,139,168,.18); color:var(--red);
    border:1px solid rgba(243,139,168,.35); }
  .badge-idle { background:rgba(108,112,134,.12); color:var(--sub);
    border:1px solid var(--border); }
  .badge-live::before {
    content:''; width:7px; height:7px; border-radius:50%;
    background:var(--red); animation:pulse 1.4s ease-in-out infinite;
  }
  @keyframes pulse {
    0%,100%{opacity:1;transform:scale(1)} 50%{opacity:.4;transform:scale(.7)}
  }
"""

# ── Viewer page ───────────────────────────────────────────────────────────────
_HTML_VIEWER = Template("""\
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>$page_title</title>
<style>
""" + _CSS_VARS + """
  body { display:grid; grid-template-rows:56px 1fr auto; min-height:100vh; }
  header { display:flex; align-items:center; gap:14px; padding:0 28px;
    background:var(--bg1); border-bottom:1px solid var(--border); }
  .logo { font-size:20px; font-weight:800; letter-spacing:-.5px; }
  .logo span { color:var(--blue); }
  .spacer { flex:1; }
  .meta { font-size:12px; color:var(--sub); }
  .meta strong { color:var(--text); }
  main { display:flex; flex-direction:column; align-items:center;
    justify-content:center; padding:24px; gap:20px; }
  .player-wrap { position:relative; width:100%; max-width:1080px;
    background:#000; border-radius:12px; overflow:hidden;
    box-shadow:0 8px 40px rgba(0,0,0,.6); border:1px solid var(--border);
    aspect-ratio:16/9; }
  video { width:100%; height:100%; display:block; object-fit:contain; }
  .overlay-center { position:absolute; inset:0; display:flex; flex-direction:column;
    align-items:center; justify-content:center; gap:14px;
    background:rgba(13,14,19,.85); backdrop-filter:blur(4px); transition:opacity .4s; }
  .overlay-center.hidden { opacity:0; pointer-events:none; }
  .overlay-center .icon { font-size:48px; opacity:.5; }
  .overlay-center .msg  { font-size:18px; color:var(--sub); }
  .overlay-center .sub  { font-size:13px; color:var(--border); }
  .stats { display:flex; gap:24px; flex-wrap:wrap; justify-content:center;
    width:100%; max-width:1080px; }
  .stat { display:flex; flex-direction:column; align-items:center;
    background:var(--bg1); border:1px solid var(--border);
    border-radius:8px; padding:10px 20px; min-width:90px; }
  .stat .val { font-size:20px; font-weight:700; color:var(--blue); }
  .stat .key { font-size:11px; color:var(--sub); margin-top:2px;
    text-transform:uppercase; letter-spacing:.05em; }
  footer { text-align:center; padding:12px; font-size:11px; color:var(--border);
    border-top:1px solid var(--border); }
</style>
</head>
<body>
<header>
  <div class="logo">Webcam<span>Studio</span></div>
  <div id="badge" class="badge badge-idle">Offline</div>
  <div class="spacer"></div>
  <div class="meta" id="meta">&nbsp;</div>
</header>
<main>
  <div class="player-wrap">
    <video id="video" autoplay muted playsinline controls></video>
    <div class="overlay-center" id="overlay">
      <div class="icon">📡</div>
      <div class="msg" id="overlay-msg">Waiting for stream…</div>
      <div class="sub" id="overlay-sub">Stream to rtmp://HOST:PORT/live</div>
    </div>
  </div>
  <div class="stats">
    <div class="stat"><div class="val" id="s-uptime">–</div><div class="key">Uptime</div></div>
    <div class="stat"><div class="val" id="s-fps">–</div><div class="key">FPS</div></div>
    <div class="stat"><div class="val" id="s-res">–</div><div class="key">Resolution</div></div>
    <div class="stat"><div class="val" id="s-buf">–</div><div class="key">Buffer</div></div>
  </div>
</main>
<footer>$page_title &nbsp;·&nbsp; powered by FFmpeg + hls.js &nbsp;·&nbsp;
  <a href="/admin">Admin</a></footer>
<script src="https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js"></script>
<script>
"use strict";
const video=document.getElementById("video"),badge=document.getElementById("badge"),
  overlay=document.getElementById("overlay"),
  overlayMsg=document.getElementById("overlay-msg"),
  overlaySub=document.getElementById("overlay-sub"),
  meta=document.getElementById("meta");
const sUptime=document.getElementById("s-uptime"),sFps=document.getElementById("s-fps"),
  sRes=document.getElementById("s-res"),sBuf=document.getElementById("s-buf");
let hls=null,wasLive=false;
function fmtTime(s){s=Math.floor(s);const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;
  return h?`${h}h ${String(m).padStart(2,"0")}m`:`${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;}
function startHls(){
  if(hls){hls.destroy();hls=null;}
  if(!Hls.isSupported()){video.src="/stream.m3u8";video.play().catch(()=>{});return;}
  hls=new Hls({liveSyncDurationCount:2,liveMaxLatencyDurationCount:4,lowLatencyMode:true,enableWorker:true});
  hls.loadSource("/stream.m3u8");hls.attachMedia(video);
  hls.on(Hls.Events.MANIFEST_PARSED,()=>{video.play().catch(()=>{});overlay.classList.add("hidden");});
  hls.on(Hls.Events.FRAG_CHANGED,(_,d)=>{
    const t=hls.levels[hls.currentLevel];
    if(t){sRes.textContent=`${t.width}×${t.height}`;
      sFps.textContent=t.attrs["FRAME-RATE"]?parseFloat(t.attrs["FRAME-RATE"]).toFixed(0):"–";}
    sBuf.textContent=video.buffered.length?`${(video.buffered.end(0)-video.currentTime).toFixed(1)}s`:"–";});
  hls.on(Hls.Events.ERROR,(_,d)=>{if(d.fatal){hls.destroy();hls=null;}});}
function stopHls(){if(hls){hls.destroy();hls=null;}video.removeAttribute("src");video.load();}
async function poll(){
  let st;try{const r=await fetch("/status.json",{cache:"no-store"});st=await r.json();}catch{return;}
  if(st.live){
    badge.className="badge badge-live";badge.textContent="LIVE";
    meta.innerHTML=`Stream up for <strong>${fmtTime(st.uptime)}</strong>`;
    sUptime.textContent=fmtTime(st.uptime);
    if(!wasLive){wasLive=true;overlayMsg.textContent="Connecting…";overlaySub.textContent="";
      overlay.classList.remove("hidden");setTimeout(startHls,1500);}
  }else{
    if(wasLive){wasLive=false;stopHls();overlayMsg.textContent="Stream ended";
      overlaySub.textContent="Waiting for next broadcast…";overlay.classList.remove("hidden");
      sUptime.textContent=sFps.textContent=sRes.textContent=sBuf.textContent="–";}
    badge.className="badge badge-idle";badge.textContent="Offline";meta.innerHTML="&nbsp;";}
}
poll();setInterval(poll,2000);
</script>
</body></html>
""")

# ── Login page ────────────────────────────────────────────────────────────────
_HTML_LOGIN = """\
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Admin Login — WebcamStudio</title>
<style>
""" + _CSS_VARS + """
  body { display:flex; align-items:center; justify-content:center; min-height:100vh; }
  .card {
    background:var(--bg1); border:1px solid var(--border); border-radius:14px;
    padding:40px 44px; width:100%; max-width:380px;
    box-shadow:0 12px 48px rgba(0,0,0,.5);
  }
  .logo { font-size:22px; font-weight:800; letter-spacing:-.5px; margin-bottom:4px; }
  .logo span { color:var(--blue); }
  .subtitle { color:var(--sub); font-size:13px; margin-bottom:32px; }
  label { display:block; color:var(--sub); font-size:11px; font-weight:600;
    text-transform:uppercase; letter-spacing:.06em; margin-bottom:6px; }
  .field { margin-bottom:18px; }
  .btn-primary { width:100%; justify-content:center; margin-top:8px;
    padding:10px; font-size:14px; }
  .error { background:rgba(243,139,168,.12); border:1px solid rgba(243,139,168,.3);
    color:var(--red); border-radius:7px; padding:10px 14px; font-size:13px;
    margin-bottom:16px; }
  .back { display:block; text-align:center; margin-top:20px;
    font-size:12px; color:var(--sub); }
</style>
</head>
<body>
<div class="card">
  <div class="logo">Webcam<span>Studio</span></div>
  <div class="subtitle">Admin Panel</div>
  ERRBLOCK
  <form method="POST" action="/admin/login">
    <div class="field">
      <label for="pw">Password</label>
      <input id="pw" type="password" name="password" autofocus
             autocomplete="current-password" placeholder="••••••••">
    </div>
    <button type="submit" class="btn btn-primary">Sign in</button>
  </form>
  <a class="back" href="/">← Back to stream</a>
</div>
</body></html>
"""

# ── Admin dashboard ───────────────────────────────────────────────────────────
# Uses $-style Template placeholders; CSS braces are literal.
_HTML_ADMIN = Template("""\
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Admin — WebcamStudio</title>
<style>
""" + _CSS_VARS + """
  body { display:grid; grid-template-rows:56px 1fr; grid-template-columns:220px 1fr;
    grid-template-areas:"hdr hdr" "nav main"; height:100vh; overflow:hidden; }

  /* header */
  header { grid-area:hdr; display:flex; align-items:center; gap:14px; padding:0 24px;
    background:var(--bg1); border-bottom:1px solid var(--border); z-index:10; }
  .logo { font-size:18px; font-weight:800; letter-spacing:-.5px; }
  .logo span { color:var(--blue); }
  .logo small { font-size:11px; color:var(--sub); font-weight:400;
    margin-left:6px; letter-spacing:.03em; }
  .spacer { flex:1; }
  header .view-link { font-size:12px; color:var(--sub); }

  /* sidebar */
  nav { grid-area:nav; background:var(--bg1); border-right:1px solid var(--border);
    overflow-y:auto; padding:16px 0; display:flex; flex-direction:column; gap:2px; }
  .nav-section { padding:4px 16px 2px; font-size:10px; color:var(--sub);
    text-transform:uppercase; letter-spacing:.1em; font-weight:700; margin-top:12px; }
  .nav-section:first-child { margin-top:0; }
  nav button { background:none; border:none; width:100%; text-align:left; cursor:pointer;
    padding:8px 20px; border-radius:0; font-size:13px; color:var(--sub); font-weight:500;
    border-left:2px solid transparent; transition:color .12s,background .12s; }
  nav button:hover { background:var(--bg2); color:var(--text); opacity:1; }
  nav button.active { color:var(--blue); background:var(--bg2);
    border-left-color:var(--blue); font-weight:600; }

  /* content */
  main { grid-area:main; overflow-y:auto; padding:32px 40px; }
  section { display:none; max-width:680px; }
  section.visible { display:block; }

  h2 { font-size:20px; font-weight:700; margin-bottom:6px; }
  .section-desc { color:var(--sub); font-size:13px; margin-bottom:28px; }
  hr { border:none; border-top:1px solid var(--border); margin:28px 0; }

  /* form layout */
  .field { margin-bottom:18px; }
  .field label { display:block; color:var(--sub); font-size:11px; font-weight:700;
    text-transform:uppercase; letter-spacing:.06em; margin-bottom:6px; }
  .field .hint  { font-size:11px; color:var(--sub); margin-top:5px; }
  .field input, .field select { max-width:360px; }
  .row { display:flex; gap:16px; align-items:flex-start; flex-wrap:wrap; }
  .row .field { flex:1; min-width:140px; }

  /* alert banners */
  .alert { border-radius:8px; padding:12px 16px; font-size:13px; margin-bottom:20px; }
  .alert-success { background:rgba(166,227,161,.12); border:1px solid rgba(166,227,161,.3);
    color:var(--green); }
  .alert-warn    { background:rgba(249,226,175,.1);  border:1px solid rgba(249,226,175,.25);
    color:var(--yellow); }
  .alert-danger  { background:rgba(243,139,168,.1);  border:1px solid rgba(243,139,168,.25);
    color:var(--red); }

  /* status card */
  .status-card { background:var(--bg1); border:1px solid var(--border); border-radius:12px;
    padding:24px; margin-bottom:24px; }
  .status-row { display:flex; align-items:center; gap:16px; flex-wrap:wrap; }
  .stat-grid { display:grid; grid-template-columns:repeat(auto-fill,minmax(110px,1fr));
    gap:12px; margin-top:20px; }
  .stat-box { background:var(--bg2); border:1px solid var(--border); border-radius:8px;
    padding:12px 16px; }
  .stat-box .val { font-size:22px; font-weight:700; color:var(--blue); }
  .stat-box .key { font-size:10px; color:var(--sub); text-transform:uppercase;
    letter-spacing:.06em; margin-top:2px; }

  /* log */
  .log-wrap { background:var(--bg1); border:1px solid var(--border); border-radius:10px;
    padding:0; overflow:hidden; }
  .log-toolbar { display:flex; justify-content:space-between; align-items:center;
    padding:10px 16px; border-bottom:1px solid var(--border); font-size:12px;
    color:var(--sub); }
  pre#log-pre { margin:0; padding:14px 16px; font-size:11px; line-height:1.6;
    font-family:'Courier New',Courier,monospace; color:#a6adc8;
    overflow-y:auto; max-height:420px; white-space:pre-wrap; word-break:break-all; }

  /* danger zone */
  .danger-box { background:rgba(243,139,168,.06); border:1px solid rgba(243,139,168,.2);
    border-radius:10px; padding:20px 24px; margin-bottom:16px; }
  .danger-box h3 { font-size:14px; color:var(--red); margin-bottom:6px; }
  .danger-box p  { font-size:13px; color:var(--sub); margin-bottom:14px; }
</style>
</head>
<body>

<header>
  <div class="logo">Webcam<span>Studio</span> <small>Admin</small></div>
  <div class="spacer"></div>
  <a class="view-link" href="/">← View stream</a>
  &nbsp;&nbsp;
  <form method="POST" action="/admin/logout" style="margin:0">
    <button class="btn btn-ghost" style="padding:6px 14px;font-size:12px">Logout</button>
  </form>
</header>

<nav>
  <div class="nav-section">Overview</div>
  <button data-sec="status"   class="active">📊  Status</button>

  <div class="nav-section">Ingest</div>
  <button data-sec="ingest">  📡  RTMP</button>
  <button data-sec="transcode">🎞  Transcoding</button>
  <button data-sec="hls">    📦  HLS</button>
  <button data-sec="audio">  🔊  Audio</button>

  <div class="nav-section">Viewer</div>
  <button data-sec="appear">  🎨  Appearance</button>

  <div class="nav-section">System</div>
  <button data-sec="security">🔑  Security</button>
  <button data-sec="log">     📋  Log</button>
  <button data-sec="danger">  ⚠️   Danger Zone</button>
</nav>

<main>
$flash

<!-- ── Status ── -->
<section id="sec-status" class="visible">
  <h2>Status</h2>
  <p class="section-desc">Live stream and server health at a glance.</p>

  <div class="status-card">
    <div class="status-row">
      <div id="st-badge" class="badge $badge_cls">$badge_txt</div>
      <span id="st-uptime" style="color:var(--sub);font-size:13px">$uptime_txt</span>
      $kick_btn
    </div>
    <div class="stat-grid">
      <div class="stat-box"><div class="val" id="st-port">$rtmp_port</div>
        <div class="key">RTMP Port</div></div>
      <div class="stat-box"><div class="val" id="st-path">/$stream_path</div>
        <div class="key">Stream Path</div></div>
      <div class="stat-box"><div class="val">$video_codec</div>
        <div class="key">Video Codec</div></div>
      <div class="stat-box"><div class="val">$audio_bitrate</div>
        <div class="key">Audio</div></div>
    </div>
  </div>

  <p style="font-size:12px;color:var(--sub)">
    Publisher URL:
    <code style="background:var(--bg2);padding:2px 7px;border-radius:4px;font-size:12px">
      rtmp://HOST:$rtmp_port/$stream_path
    </code>
  </p>
</section>

<!-- ── RTMP ── -->
<section id="sec-ingest">
  <h2>RTMP Ingest</h2>
  <p class="section-desc">
    Connection settings for incoming publishers.
    Changes take effect when the next publisher connects.
  </p>
  <form method="POST" action="/admin/config">
    <input type="hidden" name="section" value="ingest">
    <div class="field">
      <label>RTMP Port</label>
      <input type="number" name="rtmp_port" value="$rtmp_port" min="1" max="65535">
      <div class="hint">Default: 1935. Requires server restart to rebind.</div>
    </div>
    <div class="field">
      <label>Stream Path</label>
      <input type="text" name="stream_path" value="$stream_path"
             placeholder="live" pattern="[A-Za-z0-9_/-]+">
      <div class="hint">The path segment after the host:port in the RTMP URL.
        Publishers stream to <code>rtmp://host:port/PATH</code>.</div>
    </div>
    <button type="submit" class="btn btn-primary">Save RTMP settings</button>
  </form>
</section>

<!-- ── Transcoding ── -->
<section id="sec-transcode">
  <h2>Transcoding</h2>
  <p class="section-desc">
    How incoming video is processed before being written to HLS segments.
    <strong>copy</strong> passes the stream through unchanged (lowest CPU).
    Re-encoding lets you normalise quality/bitrate.
  </p>
  <form method="POST" action="/admin/config">
    <input type="hidden" name="section" value="transcode">
    <div class="field">
      <label>Video codec</label>
      <select name="video_codec">
        $codec_options
      </select>
    </div>
    <div class="row">
      <div class="field">
        <label>Preset <span style="font-weight:400;text-transform:none">(libx264 only)</span></label>
        <select name="preset">
          $preset_options
        </select>
        <div class="hint">ultrafast = least CPU; medium = best quality</div>
      </div>
      <div class="field">
        <label>Video bitrate</label>
        <input type="text" name="video_bitrate" value="$video_bitrate"
               placeholder="e.g. 3000k (blank = auto)">
        <div class="hint">Only used when transcoding. Leave blank for auto.</div>
      </div>
    </div>
    <button type="submit" class="btn btn-primary">Save transcoding</button>
  </form>
</section>

<!-- ── HLS ── -->
<section id="sec-hls">
  <h2>HLS Output</h2>
  <p class="section-desc">Controls how HLS segments are generated for viewers.</p>
  <form method="POST" action="/admin/config">
    <input type="hidden" name="section" value="hls">
    <div class="row">
      <div class="field">
        <label>Segment duration (seconds)</label>
        <input type="number" name="hls_time" value="$hls_time" min="1" max="10">
        <div class="hint">Shorter = lower latency; longer = fewer HTTP requests</div>
      </div>
      <div class="field">
        <label>Playlist length (segments)</label>
        <input type="number" name="hls_list_size" value="$hls_list_size" min="2" max="30">
        <div class="hint">How many segments the m3u8 playlist holds</div>
      </div>
    </div>
    <button type="submit" class="btn btn-primary">Save HLS settings</button>
  </form>
</section>

<!-- ── Audio ── -->
<section id="sec-audio">
  <h2>Audio</h2>
  <p class="section-desc">Audio is always re-encoded to AAC for HLS compatibility.</p>
  <form method="POST" action="/admin/config">
    <input type="hidden" name="section" value="audio">
    <div class="field">
      <label>Audio bitrate</label>
      <select name="audio_bitrate">
        $audio_options
      </select>
    </div>
    <button type="submit" class="btn btn-primary">Save audio settings</button>
  </form>
</section>

<!-- ── Appearance ── -->
<section id="sec-appear">
  <h2>Appearance</h2>
  <p class="section-desc">Customise the public viewer page.</p>
  <form method="POST" action="/admin/config">
    <input type="hidden" name="section" value="appear">
    <div class="field">
      <label>Page title</label>
      <input type="text" name="page_title" value="$page_title" maxlength="80">
      <div class="hint">Shown in the browser tab and viewer page footer.</div>
    </div>
    <button type="submit" class="btn btn-primary">Save appearance</button>
  </form>
</section>

<!-- ── Security ── -->
<section id="sec-security">
  <h2>Security</h2>
  <p class="section-desc">Change the admin panel password.</p>
  <form method="POST" action="/admin/config" id="pw-form">
    <input type="hidden" name="section" value="security">
    <div class="field">
      <label>New password</label>
      <input type="password" name="new_password" id="pw1" autocomplete="new-password"
             minlength="6" placeholder="Minimum 6 characters">
    </div>
    <div class="field">
      <label>Confirm new password</label>
      <input type="password" name="confirm_password" id="pw2"
             autocomplete="new-password" placeholder="Repeat password">
    </div>
    <button type="submit" class="btn btn-primary" id="pw-btn">Change password</button>
  </form>
</section>

<!-- ── Log ── -->
<section id="sec-log">
  <h2>FFmpeg Log</h2>
  <p class="section-desc">Live tail of the FFmpeg ingest process output.</p>
  <div class="log-wrap">
    <div class="log-toolbar">
      <span>Last 100 lines &nbsp;·&nbsp; auto-refreshes every 3 s</span>
      <button class="btn btn-ghost" style="padding:4px 10px;font-size:11px"
              onclick="fetchLog()">↻ Refresh now</button>
    </div>
    <pre id="log-pre">Loading…</pre>
  </div>
</section>

<!-- ── Danger ── -->
<section id="sec-danger">
  <h2>Danger Zone</h2>
  <p class="section-desc">Irreversible or disruptive actions.</p>

  <div class="danger-box">
    <h3>Kick current publisher</h3>
    <p>Terminates the active RTMP connection and restarts the listener.
       The publisher will be immediately disconnected.</p>
    <form method="POST" action="/admin/kick">
      <button type="submit" class="btn btn-danger">⚡ Kick publisher</button>
    </form>
  </div>

  <div class="danger-box">
    <h3>Apply settings &amp; kick</h3>
    <p>Kick the current publisher so the new Ingest / Transcoding / HLS
       configuration takes effect immediately instead of waiting for the
       next connection.</p>
    <form method="POST" action="/admin/kick">
      <input type="hidden" name="apply_first" value="1">
      <button type="submit" class="btn btn-danger">↺ Kick &amp; restart ingest</button>
    </form>
  </div>
</section>

</main>

<script>
"use strict";
// ── section switching ────────────────────────────────────────────────────────
const sections = document.querySelectorAll("section");
const navBtns  = document.querySelectorAll("nav button[data-sec]");

function showSection(id) {
  sections.forEach(s => s.classList.toggle("visible", s.id === "sec-" + id));
  navBtns.forEach(b => b.classList.toggle("active", b.dataset.sec === id));
  if (id === "log") startLogPoll();
  else stopLogPoll();
}

navBtns.forEach(b => b.addEventListener("click", () => showSection(b.dataset.sec)));

// restore section from URL hash
const initSec = (location.hash || "#status").slice(1);
if (document.getElementById("sec-" + initSec)) showSection(initSec);

navBtns.forEach(b => b.addEventListener("click", () => {
  location.hash = b.dataset.sec;
}));

// ── live status polling ──────────────────────────────────────────────────────
function fmtTime(s) {
  s = Math.floor(s);
  const h=Math.floor(s/3600),m=Math.floor((s%3600)/60),sec=s%60;
  return h ? `${h}h ${String(m).padStart(2,"0")}m`
           : `${String(m).padStart(2,"0")}:${String(sec).padStart(2,"0")}`;
}

async function pollStatus() {
  try {
    const r  = await fetch("/status.json", { cache: "no-store" });
    const st = await r.json();
    const badge = document.getElementById("st-badge");
    const upt   = document.getElementById("st-uptime");
    if (st.live) {
      badge.className = "badge badge-live"; badge.textContent = "LIVE";
      upt.textContent = "Uptime: " + fmtTime(st.uptime);
    } else {
      badge.className = "badge badge-idle"; badge.textContent = "Offline";
      upt.textContent = "";
    }
  } catch {}
}
pollStatus();
setInterval(pollStatus, 3000);

// ── FFmpeg log polling ───────────────────────────────────────────────────────
let logTimer = null;
const logPre = document.getElementById("log-pre");

async function fetchLog() {
  try {
    const r = await fetch("/admin/log", { cache: "no-store" });
    const d = await r.json();
    logPre.textContent = d.lines.join("\\n") || "(no output yet)";
    logPre.scrollTop   = logPre.scrollHeight;
  } catch {}
}

function startLogPoll() { fetchLog(); logTimer = setInterval(fetchLog, 3000); }
function stopLogPoll()  { clearInterval(logTimer); logTimer = null; }

// ── password form validation ─────────────────────────────────────────────────
document.getElementById("pw-form").addEventListener("submit", e => {
  const p1 = document.getElementById("pw1").value;
  const p2 = document.getElementById("pw2").value;
  if (p1 !== p2) { e.preventDefault(); alert("Passwords do not match."); }
});
</script>
</body></html>
""")


# ─── Template helpers ─────────────────────────────────────────────────────────

def _select_options(choices: list[str], current: str) -> str:
    out = []
    for c in choices:
        sel = ' selected' if c == current else ''
        out.append(f'<option value="{_esc(c)}"{sel}>{_esc(c)}</option>')
    return "\n".join(out)


def _render_admin(cfg: "Config", ingest: "RTMPIngest",
                  flash: str = "") -> str:
    c   = cfg.snapshot()
    live = ingest.is_live()

    badge_cls = "badge-live" if live else "badge-idle"
    badge_txt = "LIVE" if live else "Offline"
    uptime_txt = (f"Uptime: {ingest.uptime():.0f}s") if live else ""
    kick_btn   = (
        '<form method="POST" action="/admin/kick" style="margin:0">'
        '<button class="btn btn-danger" style="padding:6px 14px;font-size:12px">'
        '⚡ Kick publisher</button></form>'
    ) if live else ""

    CODECS   = ["copy", "libx264", "h264_nvenc", "h264_qsv",
                 "h264_amf", "h264_videotoolbox"]
    PRESETS  = ["ultrafast", "superfast", "veryfast", "faster", "fast", "medium"]
    AUDIO_BR = ["64k", "96k", "128k", "192k", "256k", "320k"]

    return _HTML_ADMIN.safe_substitute(
        flash          = flash,
        badge_cls      = badge_cls,
        badge_txt      = badge_txt,
        uptime_txt     = _esc(uptime_txt),
        kick_btn       = kick_btn,
        rtmp_port      = _esc(str(c["rtmp_port"])),
        stream_path    = _esc(str(c["stream_path"])),
        video_codec    = _esc(str(c["video_codec"])),
        audio_bitrate  = _esc(str(c["audio_bitrate"])),
        codec_options  = _select_options(CODECS,  c["video_codec"]),
        preset_options = _select_options(PRESETS, c["preset"]),
        audio_options  = _select_options(AUDIO_BR,c["audio_bitrate"]),
        video_bitrate  = _esc(str(c["video_bitrate"])),
        hls_time       = _esc(str(c["hls_time"])),
        hls_list_size  = _esc(str(c["hls_list_size"])),
        page_title     = _esc(str(c["page_title"])),
    )


# ─── HTTP handler ─────────────────────────────────────────────────────────────

class _Handler(http.server.BaseHTTPRequestHandler):
    # injected by _make_handler()
    ingest:   RTMPIngest
    hls_dir:  Path
    config:   Config
    sessions: SessionStore
    log_buf:  LogBuffer

    def log_message(self, fmt, *args):
        pass   # suppress default access log

    # ── routing ───────────────────────────────────────────────────────────────

    def do_GET(self):
        path = urlparse(self.path).path.rstrip("/")

        if path in ("", "/"):
            cfg = self.config.snapshot()
            body = _HTML_VIEWER.safe_substitute(
                page_title=_esc(cfg["page_title"])).encode()
            return self._send(200, "text/html; charset=utf-8", body)

        if path == "/status.json":
            payload = json.dumps({
                "live":   self.ingest.is_live(),
                "uptime": round(self.ingest.uptime(), 1),
            }).encode()
            return self._send(200, "application/json", payload)

        if path == "/stream.m3u8":
            return self._serve_file(
                self.hls_dir / "stream.m3u8",
                "application/vnd.apple.mpegurl")

        if path.endswith(".ts"):
            fname = Path(path).name
            return self._serve_file(self.hls_dir / fname, "video/MP2T")

        # ── admin routes ──────────────────────────────────────────────────────
        if path == "/admin/login":
            return self._send(200, "text/html; charset=utf-8",
                              _HTML_LOGIN.replace("ERRBLOCK", "").encode())

        if path == "/admin/log":
            if not self._authed():
                return self._send(403, "application/json", b'{"error":"forbidden"}')
            lines = self.log_buf.tail(100)
            return self._send(200, "application/json",
                              json.dumps({"lines": lines}).encode())

        if path == "/admin":
            if not self._authed():
                return self._redirect("/admin/login")
            body = _render_admin(self.config, self.ingest).encode()
            return self._send(200, "text/html; charset=utf-8", body)

        return self._send(404, "text/plain", b"Not found")

    def do_POST(self):
        path = urlparse(self.path).path.rstrip("/")

        if path == "/admin/login":
            return self._handle_login()

        if path == "/admin/logout":
            token = self._get_cookie("wcs_admin")
            if token:
                self.sessions.revoke(token)
            self._clear_cookie()
            return self._redirect("/admin/login")

        if not self._authed():
            return self._redirect("/admin/login")

        if path == "/admin/config":
            return self._handle_config()

        if path == "/admin/kick":
            self.ingest.kick()
            return self._redirect("/admin#danger")

        return self._send(404, "text/plain", b"Not found")

    # ── auth helpers ──────────────────────────────────────────────────────────

    def _authed(self) -> bool:
        return self.sessions.valid(self._get_cookie("wcs_admin"))

    def _get_cookie(self, name: str) -> str | None:
        raw = self.headers.get("Cookie", "")
        for part in raw.split(";"):
            part = part.strip()
            if part.startswith(name + "="):
                return part[len(name) + 1:]
        return None

    def _set_cookie(self, name: str, value: str):
        self.send_header(
            "Set-Cookie",
            f"{name}={value}; Path=/; HttpOnly; SameSite=Strict; Max-Age=28800")

    def _clear_cookie(self):
        self.send_header(
            "Set-Cookie",
            "wcs_admin=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0")

    # ── POST handlers ─────────────────────────────────────────────────────────

    def _handle_login(self):
        form = self._parse_form()
        pw   = form.get("password", "")
        if self.config.verify_password(pw):
            token = self.sessions.create()
            self.send_response(303)
            self.send_header("Location", "/admin")
            self._set_cookie("wcs_admin", token)
            self.send_header("Content-Length", "0")
            self.end_headers()
        else:
            err = ('<div class="error">Incorrect password. Please try again.</div>')
            body = _HTML_LOGIN.replace("ERRBLOCK", err).encode()
            self._send(401, "text/html; charset=utf-8", body)

    def _handle_config(self):
        form    = self._parse_form()
        section = form.get("section", "")
        flash   = ""

        try:
            if section == "ingest":
                self.config.update({
                    "rtmp_port":   int(form.get("rtmp_port", 1935)),
                    "stream_path": form.get("stream_path", "live").strip("/") or "live",
                })
                flash = self._ok("RTMP settings saved. Take effect on next publisher connect.")

            elif section == "transcode":
                self.config.update({
                    "video_codec":   form.get("video_codec",   "copy"),
                    "preset":        form.get("preset",        "veryfast"),
                    "video_bitrate": form.get("video_bitrate", "").strip(),
                })
                flash = self._ok("Transcoding settings saved.")

            elif section == "hls":
                self.config.update({
                    "hls_time":      max(1, int(form.get("hls_time",      1))),
                    "hls_list_size": max(2, int(form.get("hls_list_size", 8))),
                })
                flash = self._ok("HLS settings saved.")

            elif section == "audio":
                self.config.update({"audio_bitrate": form.get("audio_bitrate", "128k")})
                flash = self._ok("Audio settings saved.")

            elif section == "appear":
                title = form.get("page_title", "WebcamStudio Live").strip() \
                        or "WebcamStudio Live"
                self.config.update({"page_title": title[:80]})
                flash = self._ok("Appearance saved.")

            elif section == "security":
                pw1 = form.get("new_password",    "")
                pw2 = form.get("confirm_password", "")
                if len(pw1) < 6:
                    flash = self._warn("Password must be at least 6 characters.")
                elif pw1 != pw2:
                    flash = self._warn("Passwords do not match.")
                else:
                    self.config.set_password(pw1)
                    flash = self._ok("Password changed successfully.")

        except (ValueError, KeyError) as exc:
            flash = self._warn(f"Invalid input: {_esc(str(exc))}")

        body = _render_admin(self.config, self.ingest, flash).encode()
        self._send(200, "text/html; charset=utf-8", body)

    # ── util ──────────────────────────────────────────────────────────────────

    @staticmethod
    def _ok(msg: str) -> str:
        return f'<div class="alert alert-success">✓ {_esc(msg)}</div>'

    @staticmethod
    def _warn(msg: str) -> str:
        return f'<div class="alert alert-warn">⚠ {_esc(msg)}</div>'

    def _parse_form(self) -> dict[str, str]:
        length = int(self.headers.get("Content-Length", 0))
        body   = self.rfile.read(length).decode(errors="replace")
        raw    = parse_qs(body, keep_blank_values=True)
        return {k: v[0] for k, v in raw.items()}

    def _redirect(self, url: str):
        self.send_response(303)
        self.send_header("Location", url)
        self.send_header("Content-Length", "0")
        self.end_headers()

    def _send(self, code: int, ctype: str, body: bytes):
        self.send_response(code)
        self.send_header("Content-Type", ctype)
        self.send_header("Content-Length", str(len(body)))
        self.send_header("Cache-Control", "no-cache")
        self.send_header("Access-Control-Allow-Origin", "*")
        self.end_headers()
        self.wfile.write(body)

    def _serve_file(self, path: Path, ctype: str):
        try:
            data = path.read_bytes()
            self._send(200, ctype, data)
        except FileNotFoundError:
            self._send(404, "text/plain", b"Not found (yet)")
        except OSError as exc:
            self._send(500, "text/plain", str(exc).encode())


def _make_handler(ingest: RTMPIngest, hls_dir: Path,
                  config: Config, sessions: SessionStore,
                  log_buf: LogBuffer):
    class H(_Handler):
        pass
    H.ingest   = ingest
    H.hls_dir  = hls_dir
    H.config   = config
    H.sessions = sessions
    H.log_buf  = log_buf
    return H


# ─── Entry point ──────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(
        description="WebcamStudio RTMP ingest server with live HLS player + admin panel")
    ap.add_argument("--rtmp-port",       type=int,   default=1935)
    ap.add_argument("--http-port",       type=int,   default=8080)
    ap.add_argument("--host",            default="0.0.0.0")
    ap.add_argument("--admin-password",  default="",
                    help="Admin panel password (auto-generated if omitted)")
    ap.add_argument("--config",          default="",
                    help="Path to JSON config file for persistent settings")
    ap.add_argument("--transcode",       action="store_true",
                    help="Re-encode video with libx264 (needed if publisher ≠ H.264)")
    ap.add_argument("--preset",          default="veryfast",
                    choices=["ultrafast","superfast","veryfast","faster","fast","medium"])
    args = ap.parse_args()

    config_path = Path(args.config) if args.config else None
    config = Config(
        path          = config_path,
        rtmp_port     = args.rtmp_port,
        video_codec   = "libx264" if args.transcode else "copy",
        preset        = args.preset,
    )

    # Password setup
    admin_pw = args.admin_password
    if not admin_pw:
        if config.get("pw_hash"):
            # loaded from config file — don't overwrite
            admin_pw = None
        else:
            admin_pw = secrets.token_urlsafe(10)
            print(f"\n{'─'*52}")
            print(f"  Admin password (auto-generated):  {admin_pw}")
            print(f"  Change it at /admin → Security")
            print(f"{'─'*52}\n")
    if admin_pw:
        config.set_password(admin_pw)

    hls_dir  = Path(tempfile.mkdtemp(prefix="wcs_hls_"))
    log_buf  = LogBuffer()
    sessions = SessionStore()
    ingest   = RTMPIngest(config, hls_dir, log_buf)
    ingest.start()

    handler = _make_handler(ingest, hls_dir, config, sessions, log_buf)
    httpd   = http.server.HTTPServer((args.host, args.http_port), handler)

    def _shutdown(sig, _frame):
        print("\n[server] Shutting down…")
        ingest.stop()
        httpd.shutdown()
        shutil.rmtree(hls_dir, ignore_errors=True)
        sys.exit(0)

    signal.signal(signal.SIGINT,  _shutdown)
    signal.signal(signal.SIGTERM, _shutdown)

    print(f"[server] RTMP  →  rtmp://0.0.0.0:{args.rtmp_port}/live")
    print(f"[server] Watch →  http://{args.host}:{args.http_port}")
    print(f"[server] Admin →  http://{args.host}:{args.http_port}/admin")
    if config_path:
        print(f"[server] Config file: {config_path}")
    print("[server] Press Ctrl+C to stop.\n")

    try:
        httpd.serve_forever()
    finally:
        ingest.stop()
        shutil.rmtree(hls_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
