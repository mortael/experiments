#!/usr/bin/env python3
"""WebcamStudio — RTMP Ingest & Live Web Player

Accepts one RTMP publisher, transcodes to HLS via FFmpeg, and serves a
modern dark-themed HTML viewer over HTTP.

Dependencies: ffmpeg (in PATH), Python 3.9+

Usage:
    python rtmp_server.py [--rtmp-port 1935] [--http-port 8080] [--host 0.0.0.0]

Stream to:  rtmp://<host>:<rtmp-port>/live
Watch at:   http://<host>:<http-port>
"""

import argparse
import http.server
import json
import os
import shutil
import signal
import subprocess
import sys
import tempfile
import threading
import time
from pathlib import Path
from urllib.parse import urlparse


# ─── RTMP → HLS ingest ────────────────────────────────────────────────────────

class RTMPIngest:
    """Runs FFmpeg in RTMP-server (listen) mode, writing HLS segments to hls_dir.

    A watchdog thread restarts FFmpeg automatically after each publisher
    disconnects, so the viewer page can pick up the next stream without
     a page refresh.
    """

    def __init__(self, rtmp_port: int, hls_dir: Path,
                 video_codec: str = "copy", preset: str = "veryfast"):
        self.rtmp_port   = rtmp_port
        self.hls_dir     = hls_dir
        self.video_codec = video_codec   # "copy" or "libx264"
        self.preset      = preset

        self._proc: subprocess.Popen | None = None
        self._lock   = threading.Lock()
        self._stop   = threading.Event()
        self._thread: threading.Thread | None = None

        self.publisher_connected = False
        self.stream_start: float = 0.0
        self.last_error: str = ""

    # ── public API ────────────────────────────────────────────────────────────

    def start(self):
        self.hls_dir.mkdir(parents=True, exist_ok=True)
        if not shutil.which("ffmpeg"):
            print("ERROR: ffmpeg not found in PATH. Install FFmpeg and try again.",
                  file=sys.stderr)
            sys.exit(1)
        self._thread = threading.Thread(target=self._loop, daemon=True)
        self._thread.start()

    def stop(self):
        self._stop.set()
        with self._lock:
            if self._proc and self._proc.poll() is None:
                self._proc.terminate()
                try:
                    self._proc.wait(timeout=3)
                except subprocess.TimeoutExpired:
                    self._proc.kill()

    def is_live(self) -> bool:
        return self.publisher_connected

    def uptime(self) -> float:
        return time.time() - self.stream_start if self.publisher_connected else 0.0

    # ── internals ─────────────────────────────────────────────────────────────

    def _build_cmd(self) -> list[str]:
        m3u8 = str(self.hls_dir / "stream.m3u8")
        seg  = str(self.hls_dir / "seg%05d.ts")

        enc_args: list[str]
        if self.video_codec == "copy":
            enc_args = ["-c:v", "copy"]
        else:
            enc_args = [
                "-c:v", self.video_codec,
                "-preset", self.preset,
                "-tune", "zerolatency",
                "-pix_fmt", "yuv420p",
            ]

        return [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "info",
            # RTMP server — listen for one incoming publisher
            "-listen", "1",
            "-i", f"rtmp://0.0.0.0:{self.rtmp_port}/live",
            *enc_args,
            "-c:a", "aac", "-b:a", "128k",
            # HLS output
            "-f", "hls",
            "-hls_time", "1",
            "-hls_list_size", "8",
            "-hls_flags", "delete_segments+append_list+split_by_time",
            "-hls_segment_type", "mpegts",
            "-hls_segment_filename", seg,
            m3u8,
        ]

    def _clear_hls(self):
        for f in self.hls_dir.glob("*.ts"):
            try:
                f.unlink()
            except OSError:
                pass
        m3u8 = self.hls_dir / "stream.m3u8"
        if m3u8.exists():
            try:
                m3u8.unlink()
            except OSError:
                pass

    def _loop(self):
        while not self._stop.is_set():
            self._clear_hls()
            print(f"\n[ingest] Listening for RTMP publisher on "
                  f"rtmp://0.0.0.0:{self.rtmp_port}/live …", flush=True)

            cmd = self._build_cmd()
            try:
                proc = subprocess.Popen(
                    cmd, stderr=subprocess.PIPE, stdout=subprocess.DEVNULL)
            except FileNotFoundError:
                print("[ingest] ffmpeg not found!", file=sys.stderr)
                self._stop.wait(5)
                continue

            with self._lock:
                self._proc = proc

            # Read stderr line-by-line; detect when the stream actually starts
            for raw in proc.stderr:
                line = raw.decode(errors="replace").rstrip()
                if line:
                    print(f"[ffmpeg] {line}", flush=True)
                # FFmpeg prints "Stream #0" when it starts muxing
                if "Stream #0" in line and "Video" in line:
                    with self._lock:
                        if not self.publisher_connected:
                            self.publisher_connected = True
                            self.stream_start = time.time()
                            print("[ingest] Publisher connected — streaming!", flush=True)

            proc.wait()
            with self._lock:
                self.last_error = ""
                self.publisher_connected = False
                self._proc = None

            if not self._stop.is_set():
                print("[ingest] Publisher disconnected. Ready for next connection.", flush=True)
                self._stop.wait(0.3)  # tiny pause before re-binding


# ─── HTTP handler ─────────────────────────────────────────────────────────────

_HTML = """\
<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>WebcamStudio Live</title>
<style>
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

  :root {
    --bg0: #0d0e13;
    --bg1: #181926;
    --bg2: #1e2030;
    --border: #313244;
    --text: #cdd6f4;
    --sub: #6c7086;
    --green: #a6e3a1;
    --red: #f38ba8;
    --yellow: #f9e2af;
    --blue: #89b4fa;
    --mauve: #cba6f7;
  }

  html, body { height: 100%; background: var(--bg0); color: var(--text);
    font-family: 'Inter', 'Segoe UI', system-ui, sans-serif; }

  /* ── layout ── */
  body { display: grid;
    grid-template-rows: 56px 1fr auto;
    grid-template-columns: 1fr;
    min-height: 100vh; }

  /* ── header ── */
  header {
    display: flex; align-items: center; gap: 14px;
    padding: 0 28px;
    background: var(--bg1);
    border-bottom: 1px solid var(--border);
  }
  header .logo { font-size: 20px; font-weight: 800; letter-spacing: -0.5px; }
  header .logo span { color: var(--blue); }

  .badge {
    display: inline-flex; align-items: center; gap: 6px;
    padding: 3px 10px; border-radius: 999px;
    font-size: 11px; font-weight: 700; letter-spacing: 0.05em;
    text-transform: uppercase;
  }
  .badge.live  { background: rgba(243,139,168,.18); color: var(--red); border: 1px solid rgba(243,139,168,.35); }
  .badge.idle  { background: rgba(108,112,134,.12); color: var(--sub); border: 1px solid var(--border); }
  .badge.live::before {
    content: '';
    width: 7px; height: 7px; border-radius: 50%;
    background: var(--red);
    animation: pulse 1.4s ease-in-out infinite;
  }
  @keyframes pulse {
    0%,100% { opacity: 1; transform: scale(1); }
    50%      { opacity: .4; transform: scale(0.7); }
  }

  header .spacer { flex: 1; }
  header .meta { font-size: 12px; color: var(--sub); }
  header .meta strong { color: var(--text); }

  /* ── main area ── */
  main {
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    padding: 24px;
    gap: 20px;
  }

  .player-wrap {
    position: relative;
    width: 100%; max-width: 1080px;
    background: #000;
    border-radius: 12px;
    overflow: hidden;
    box-shadow: 0 8px 40px rgba(0,0,0,.6);
    border: 1px solid var(--border);
    aspect-ratio: 16/9;
  }
  video {
    width: 100%; height: 100%;
    display: block;
    object-fit: contain;
  }

  .overlay-center {
    position: absolute; inset: 0;
    display: flex; flex-direction: column;
    align-items: center; justify-content: center;
    gap: 14px;
    background: rgba(13,14,19,.85);
    backdrop-filter: blur(4px);
    transition: opacity .4s;
  }
  .overlay-center.hidden { opacity: 0; pointer-events: none; }
  .overlay-center .icon  { font-size: 48px; opacity: .5; }
  .overlay-center .msg   { font-size: 18px; color: var(--sub); }
  .overlay-center .sub   { font-size: 13px; color: var(--border); }

  /* ── stats bar ── */
  .stats {
    display: flex; gap: 24px; flex-wrap: wrap; justify-content: center;
    width: 100%; max-width: 1080px;
  }
  .stat {
    display: flex; flex-direction: column; align-items: center;
    background: var(--bg1); border: 1px solid var(--border);
    border-radius: 8px; padding: 10px 20px; min-width: 90px;
  }
  .stat .val { font-size: 20px; font-weight: 700; color: var(--blue); }
  .stat .key { font-size: 11px; color: var(--sub); margin-top: 2px;
    text-transform: uppercase; letter-spacing: .05em; }

  /* ── footer ── */
  footer {
    text-align: center; padding: 12px;
    font-size: 11px; color: var(--border);
    border-top: 1px solid var(--border);
  }
</style>
</head>
<body>

<header>
  <div class="logo">Webcam<span>Studio</span></div>
  <div id="badge" class="badge idle">Offline</div>
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
    <div class="stat"><div class="val" id="stat-uptime">–</div><div class="key">Uptime</div></div>
    <div class="stat"><div class="val" id="stat-fps">–</div><div class="key">FPS</div></div>
    <div class="stat"><div class="val" id="stat-res">–</div><div class="key">Resolution</div></div>
    <div class="stat"><div class="val" id="stat-buf">–</div><div class="key">Buffer</div></div>
  </div>
</main>

<footer>WebcamStudio RTMP Server &nbsp;·&nbsp; powered by FFmpeg + hls.js</footer>

<script src="https://cdn.jsdelivr.net/npm/hls.js@1/dist/hls.min.js"></script>
<script>
"use strict";

const video   = document.getElementById("video");
const badge   = document.getElementById("badge");
const overlay = document.getElementById("overlay");
const overlayMsg = document.getElementById("overlay-msg");
const overlaySub = document.getElementById("overlay-sub");
const meta    = document.getElementById("meta");

const statUptime = document.getElementById("stat-uptime");
const statFps    = document.getElementById("stat-fps");
const statRes    = document.getElementById("stat-res");
const statBuf    = document.getElementById("stat-buf");

let hls      = null;
let wasLive  = false;
let pollTimer = null;

// ── format helpers ────────────────────────────────────────────────────────────
function fmtTime(sec) {
  sec = Math.floor(sec);
  const h = Math.floor(sec / 3600);
  const m = Math.floor((sec % 3600) / 60);
  const s = sec % 60;
  if (h) return `${h}h ${m.toString().padStart(2,"0")}m`;
  return `${m.toString().padStart(2,"0")}:${s.toString().padStart(2,"0")}`;
}

// ── HLS player ────────────────────────────────────────────────────────────────
function startHls() {
  if (hls) { hls.destroy(); hls = null; }

  if (!Hls.isSupported()) {
    // Safari native HLS
    video.src = "/stream.m3u8";
    video.play().catch(() => {});
    return;
  }

  hls = new Hls({
    liveSyncDurationCount: 2,
    liveMaxLatencyDurationCount: 4,
    lowLatencyMode: true,
    enableWorker: true,
  });

  hls.loadSource("/stream.m3u8");
  hls.attachMedia(video);

  hls.on(Hls.Events.MANIFEST_PARSED, () => {
    video.play().catch(() => {});
    overlay.classList.add("hidden");
  });

  hls.on(Hls.Events.FRAG_CHANGED, (_, data) => {
    const track = hls.levels[hls.currentLevel];
    if (track) {
      statRes.textContent = `${track.width}×${track.height}`;
      statFps.textContent = track.attrs["FRAME-RATE"]
        ? parseFloat(track.attrs["FRAME-RATE"]).toFixed(0) : "–";
    }
    statBuf.textContent = video.buffered.length
      ? `${(video.buffered.end(0) - video.currentTime).toFixed(1)}s` : "–";
  });

  hls.on(Hls.Events.ERROR, (_, data) => {
    if (data.fatal) {
      hls.destroy(); hls = null;
    }
  });
}

function stopHls() {
  if (hls) { hls.destroy(); hls = null; }
  video.removeAttribute("src");
  video.load();
}

// ── poll /status.json ─────────────────────────────────────────────────────────
async function poll() {
  let status;
  try {
    const r = await fetch("/status.json", { cache: "no-store" });
    status = await r.json();
  } catch {
    return;
  }

  if (status.live) {
    badge.className = "badge live";
    badge.textContent = "LIVE";
    meta.innerHTML = `Stream up for <strong>${fmtTime(status.uptime)}</strong>`;
    statUptime.textContent = fmtTime(status.uptime);

    if (!wasLive) {
      wasLive = true;
      overlayMsg.textContent = "Connecting…";
      overlaySub.textContent = "";
      overlay.classList.remove("hidden");
      setTimeout(startHls, 1500); // small delay — let FFmpeg write first segments
    }
  } else {
    if (wasLive) {
      wasLive = false;
      stopHls();
      overlayMsg.textContent = "Stream ended";
      overlaySub.textContent = "Waiting for next broadcast…";
      overlay.classList.remove("hidden");
      statUptime.textContent = "–";
      statFps.textContent    = "–";
      statRes.textContent    = "–";
      statBuf.textContent    = "–";
    }
    badge.className = "badge idle";
    badge.textContent = "Offline";
    meta.innerHTML = "&nbsp;";
  }
}

// start polling immediately and every 2 s
poll();
pollTimer = setInterval(poll, 2000);
</script>
</body>
</html>
"""


class _Handler(http.server.BaseHTTPRequestHandler):

    ingest: "RTMPIngest"        # set by _make_handler()
    hls_dir: Path

    def log_message(self, fmt, *args):
        pass  # silence default access log; use our own below

    def do_GET(self):
        path = urlparse(self.path).path.lstrip("/")

        if path == "" or path == "index.html":
            self._send(200, "text/html; charset=utf-8", _HTML.encode())

        elif path == "status.json":
            payload = json.dumps({
                "live":   self.ingest.is_live(),
                "uptime": round(self.ingest.uptime(), 1),
            }).encode()
            self._send(200, "application/json", payload)

        elif path == "stream.m3u8":
            self._serve_file(self.hls_dir / "stream.m3u8", "application/vnd.apple.mpegurl")

        elif path.endswith(".ts"):
            self._serve_file(self.hls_dir / path, "video/MP2T")

        else:
            self._send(404, "text/plain", b"Not found")

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


def _make_handler(ingest: RTMPIngest, hls_dir: Path):
    class H(_Handler):
        pass
    H.ingest   = ingest
    H.hls_dir  = hls_dir
    return H


# ─── entry point ──────────────────────────────────────────────────────────────

def main():
    ap = argparse.ArgumentParser(
        description="WebcamStudio RTMP ingest server with live HLS web player")
    ap.add_argument("--rtmp-port",  type=int, default=1935,
                    help="Port to listen for RTMP publishers (default 1935)")
    ap.add_argument("--http-port",  type=int, default=8080,
                    help="Port to serve the web player on (default 8080)")
    ap.add_argument("--host",       default="0.0.0.0",
                    help="Bind host for the HTTP server (default 0.0.0.0)")
    ap.add_argument("--transcode",  action="store_true",
                    help="Re-encode video with libx264 instead of copying "
                         "(needed if publisher doesn't send H.264)")
    ap.add_argument("--preset",     default="veryfast",
                    choices=["ultrafast","superfast","veryfast","faster","fast","medium"],
                    help="libx264 preset used with --transcode (default veryfast)")
    args = ap.parse_args()

    # temp dir for HLS segments — cleaned up on exit
    hls_dir = Path(tempfile.mkdtemp(prefix="wcs_hls_"))
    print(f"[server] HLS working directory: {hls_dir}")

    ingest = RTMPIngest(
        rtmp_port=args.rtmp_port,
        hls_dir=hls_dir,
        video_codec="libx264" if args.transcode else "copy",
        preset=args.preset,
    )
    ingest.start()

    handler = _make_handler(ingest, hls_dir)
    httpd   = http.server.HTTPServer((args.host, args.http_port), handler)

    def _shutdown(sig, _frame):
        print("\n[server] Shutting down…")
        ingest.stop()
        httpd.shutdown()
        shutil.rmtree(hls_dir, ignore_errors=True)
        sys.exit(0)

    signal.signal(signal.SIGINT,  _shutdown)
    signal.signal(signal.SIGTERM, _shutdown)

    print(f"[server] RTMP listen : rtmp://0.0.0.0:{args.rtmp_port}/live")
    print(f"[server] Web player  : http://{args.host}:{args.http_port}")
    print(f"[server] Stream from WebcamStudio → RTMP URL = "
          f"rtmp://127.0.0.1:{args.rtmp_port}/live")
    print("[server] Press Ctrl+C to stop.\n")

    try:
        httpd.serve_forever()
    finally:
        ingest.stop()
        shutil.rmtree(hls_dir, ignore_errors=True)


if __name__ == "__main__":
    main()
