#!/usr/bin/env python3
"""WebcamStudio — A feature-rich webcam streaming & overlay GUI.

Requires: PySide6, opencv-python, numpy
Run with:  python webcam_studio.py
"""

import copy
import queue
import shutil
import subprocess
import sys
import threading
import time
from datetime import datetime
from pathlib import Path

import cv2
import numpy as np

try:
    import psutil as _psutil
    _HAS_PSUTIL = True
except ImportError:
    _psutil = None        # type: ignore
    _HAS_PSUTIL = False
from PySide6.QtCore import (
    QAbstractListModel,
    QMimeData,
    QModelIndex,
    QPointF,
    QRectF,
    QSize,
    Qt,
    QThread,
    QTimer,
    Signal,
)
from PySide6.QtGui import (
    QBrush,
    QColor,
    QCursor,
    QFont,
    QFontMetrics,
    QImage,
    QKeySequence,
    QLinearGradient,
    QPainter,
    QPen,
    QPixmap,
    QShortcut,
)
from PySide6.QtWidgets import (
    QApplication,
    QCheckBox,
    QColorDialog,
    QComboBox,
    QDoubleSpinBox,
    QFileDialog,
    QFormLayout,
    QFrame,
    QGroupBox,
    QHBoxLayout,
    QInputDialog,
    QLabel,
    QListWidget,
    QListWidgetItem,
    QMainWindow,
    QPushButton,
    QScrollArea,
    QSizePolicy,
    QSlider,
    QSpinBox,
    QSplitter,
    QStackedWidget,
    QToolBar,
    QVBoxLayout,
    QWidget,
    QLineEdit,
    QFontDialog,
    QGridLayout,
    QMenu,
    QMessageBox,
)


# ─── Dark Theme ────────────────────────────────────────────────────────────────

STYLE = """
* { font-family: "Segoe UI", "Inter", "SF Pro Text", Arial, sans-serif; }

QMainWindow, QWidget { background: #16181d; color: #cdd6f4; font-size: 13px; }

QToolBar#topbar {
    background: #0f1117;
    border-bottom: 1px solid #252632;
    padding: 3px 8px;
    spacing: 4px;
}

QWidget#leftpanel  { background: #12141a; border-right:  1px solid #252632; }
QWidget#rightpanel { background: #12141a; border-left:   1px solid #252632; }
QWidget#bottombar  { background: #0f1117; border-top:    1px solid #252632; }

/* ── Group boxes ── */
QGroupBox {
    border: 1px solid #2a2c38;
    border-radius: 7px;
    margin-top: 10px;
    padding: 12px 8px 8px 8px;
    color: #6c7086;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    letter-spacing: 0.8px;
}
QGroupBox::title { subcontrol-origin: margin; left: 10px; padding: 0 4px; }

/* ── Buttons ── */
QPushButton {
    background: #22242f;
    color: #bac2de;
    border: 1px solid #313244;
    border-radius: 6px;
    padding: 6px 14px;
    font-size: 12px;
}
QPushButton:hover  { background: #2d2f3e; border-color: #89b4fa; color: #fff; }
QPushButton:pressed { background: #1a1c26; }
QPushButton:checked { background: #b4202a; border-color: #f38ba8; color: #fff; }

QPushButton#addBtn {
    background: #1e3a5f;
    border-color: #89b4fa;
    color: #89b4fa;
    font-weight: 600;
}
QPushButton#addBtn:hover { background: #2563eb; color: #fff; }

QPushButton#recordBtn {
    background: #1a1c26;
    border: 1px solid #f38ba8;
    color: #f38ba8;
    font-weight: 700;
    padding: 8px 22px;
}
QPushButton#recordBtn:hover   { background: #f38ba8; color: #0f1117; }
QPushButton#recordBtn:checked { background: #b4202a; border-color: #f38ba8; color: #fff; }

QPushButton#snapBtn {
    background: #1e3a5f;
    border-color: #89b4fa;
    color: #89b4fa;
    font-weight: 600;
    padding: 8px 22px;
}
QPushButton#snapBtn:hover { background: #2563eb; color: #fff; }

QLabel#cpuLabel {
    color: #a6e3a1;
    font-size: 11px;
    font-weight: 700;
    font-family: "Courier New", monospace;
    padding: 0 8px;
    border: 1px solid #313244;
    border-radius: 4px;
}

QPushButton#iconBtn {
    background: transparent;
    border: none;
    padding: 4px 6px;
    color: #6c7086;
    font-size: 14px;
}
QPushButton#iconBtn:hover { color: #cdd6f4; }

QPushButton#liveBtn {
    background: #1a2e1a;
    border: 1px solid #a6e3a1;
    color: #a6e3a1;
    font-weight: 700;
    padding: 8px 22px;
}
QPushButton#liveBtn:hover   { background: #a6e3a1; color: #0f1117; }
QPushButton#liveBtn:checked { background: #2a6b2a; border-color: #a6e3a1; color: #fff; }

QLineEdit#rtmpInput {
    background: #1e2030;
    border: 1px solid #313244;
    border-radius: 6px;
    padding: 7px 10px;
    color: #cdd6f4;
    font-family: "Courier New", monospace;
    font-size: 12px;
    min-width: 280px;
}
QLineEdit#rtmpInput:focus { border-color: #a6e3a1; }

/* ── Combos ── */
QComboBox {
    background: #1e2030;
    border: 1px solid #313244;
    border-radius: 6px;
    padding: 5px 10px;
    color: #cdd6f4;
    min-width: 80px;
}
QComboBox:hover { border-color: #89b4fa; }
QComboBox::drop-down { border: none; width: 20px; }
QComboBox QAbstractItemView {
    background: #1e2030;
    border: 1px solid #313244;
    selection-background-color: #2563eb;
    color: #cdd6f4;
}

/* ── Sliders ── */
QSlider::groove:horizontal { height: 4px; background: #313244; border-radius: 2px; }
QSlider::handle:horizontal {
    background: #89b4fa;
    width: 14px; height: 14px;
    margin: -5px 0;
    border-radius: 7px;
}
QSlider::sub-page:horizontal { background: #2563eb; border-radius: 2px; }

/* ── Checkboxes ── */
QCheckBox::indicator {
    width: 16px; height: 16px;
    border: 2px solid #45475a;
    border-radius: 4px;
    background: #1e2030;
}
QCheckBox::indicator:checked { background: #2563eb; border-color: #89b4fa; }

/* ── Spin / Line edits ── */
QSpinBox, QDoubleSpinBox, QLineEdit {
    background: #1e2030;
    border: 1px solid #313244;
    border-radius: 6px;
    padding: 4px 8px;
    color: #cdd6f4;
}
QSpinBox:focus, QDoubleSpinBox:focus, QLineEdit:focus { border-color: #89b4fa; }
QSpinBox::up-button, QSpinBox::down-button,
QDoubleSpinBox::up-button, QDoubleSpinBox::down-button { width: 16px; }

/* ── Lists ── */
QListWidget {
    background: #181a23;
    border: 1px solid #2a2c38;
    border-radius: 6px;
    color: #bac2de;
    alternate-background-color: #1e2030;
    outline: none;
}
QListWidget::item { padding: 7px 10px; border-bottom: 1px solid #22242f; }
QListWidget::item:selected { background: #1d3461; color: #89b4fa; }
QListWidget::item:hover    { background: #22242f; }

/* ── Scroll bars ── */
QScrollBar:vertical   { background: #12141a; width: 6px; border-radius: 3px; }
QScrollBar::handle:vertical { background: #313244; border-radius: 3px; min-height: 20px; }
QScrollBar:horizontal { background: #12141a; height: 6px; border-radius: 3px; }
QScrollBar::handle:horizontal { background: #313244; border-radius: 3px; }
QScrollBar::add-line, QScrollBar::sub-line { width: 0; height: 0; }

/* ── Labels ── */
QLabel          { color: #6c7086; font-size: 11px; }
QLabel#heading  { color: #cdd6f4; font-size: 14px; font-weight: 700; }
QLabel#appname  { color: #89b4fa; font-size: 15px; font-weight: 800; letter-spacing: 1px; }
QLabel#status   { color: #585b70; font-size: 11px; }
QLabel#badge    { color: #a6e3a1; font-size: 10px; font-weight: 700; }

QFrame#vdiv { background: #252632; }

/* ── Splitter ── */
QSplitter::handle { background: #252632; }
"""


# ─── Overlay Elements ──────────────────────────────────────────────────────────

_uid = 0


def _next_id() -> int:
    global _uid
    _uid += 1
    return _uid


HANDLE_PX = 8


class Overlay:
    """Base class for all overlay elements."""

    kind: str = "base"

    def __init__(self, name: str, x: float = 80, y: float = 80,
                 w: float = 200, h: float = 60):
        self.uid = _next_id()
        self.name = name
        self.x = x
        self.y = y
        self.width = w
        self.height = h
        self.opacity = 1.0
        self.visible = True
        self.locked = False

    @property
    def rect(self) -> QRectF:
        return QRectF(self.x, self.y, self.width, self.height)

    def hit(self, fx: float, fy: float) -> bool:
        return self.rect.contains(fx, fy)

    def draw(self, p: QPainter):
        raise NotImplementedError

    def clone(self) -> "Overlay":
        c = copy.deepcopy(self)
        c.uid = _next_id()
        c.name = self.name + " copy"
        c.x += 24
        c.y += 24
        return c


class TextOverlay(Overlay):
    kind = "Text"

    def __init__(self, name="Text", x=80, y=80):
        super().__init__(name, x, y, 220, 56)
        self.text = "Sample Text"
        self.font_family = "Arial"
        self.font_size = 32
        self.bold = False
        self.italic = False
        self.color = QColor("#ffffff")
        self.bg_color = QColor(0, 0, 0, 150)
        self.show_bg = True
        self.padding = 10

    def _font(self) -> QFont:
        f = QFont(self.font_family, self.font_size)
        f.setBold(self.bold)
        f.setItalic(self.italic)
        return f

    def draw(self, p: QPainter):
        p.save()
        p.setOpacity(self.opacity)
        font = self._font()
        p.setFont(font)
        fm = QFontMetrics(font)
        br = fm.boundingRect(self.text)
        self.width = max(br.width() + self.padding * 2, 60)
        self.height = br.height() + self.padding * 2
        if self.show_bg:
            p.fillRect(self.rect, self.bg_color)
        p.setPen(QPen(self.color))
        p.drawText(self.rect, Qt.AlignmentFlag.AlignCenter, self.text)
        p.restore()


class ClockOverlay(Overlay):
    kind = "Clock"

    def __init__(self, name="Clock", x=10, y=10):
        super().__init__(name, x, y, 190, 52)
        self.fmt = "%H:%M:%S"
        self.font_family = "Courier New"
        self.font_size = 28
        self.color = QColor("#ffffff")
        self.bg_color = QColor(0, 0, 0, 160)
        self.show_bg = True

    def draw(self, p: QPainter):
        p.save()
        p.setOpacity(self.opacity)
        text = datetime.now().strftime(self.fmt)
        font = QFont(self.font_family, self.font_size)
        font.setBold(True)
        p.setFont(font)
        fm = QFontMetrics(font)
        br = fm.boundingRect(text)
        self.width = br.width() + 16
        self.height = br.height() + 10
        if self.show_bg:
            p.fillRect(self.rect, self.bg_color)
        p.setPen(QPen(self.color))
        p.drawText(self.rect, Qt.AlignmentFlag.AlignCenter, text)
        p.restore()


class ShapeOverlay(Overlay):
    kind = "Shape"

    def __init__(self, name="Shape", x=100, y=100, shape="rectangle"):
        super().__init__(name, x, y, 160, 100)
        self.shape = shape          # "rectangle" | "ellipse"
        self.fill   = QColor(137, 180, 250, 80)
        self.border = QColor(137, 180, 250, 220)
        self.border_w = 3
        self.radius = 8

    def draw(self, p: QPainter):
        p.save()
        p.setOpacity(self.opacity)
        p.setPen(QPen(self.border, self.border_w))
        p.setBrush(QBrush(self.fill))
        r = self.rect
        if self.shape == "rectangle":
            p.drawRoundedRect(r, self.radius, self.radius)
        else:
            p.drawEllipse(r)
        p.restore()


class ImageOverlay(Overlay):
    kind = "Image"

    def __init__(self, name="Image", x=100, y=100, path=""):
        super().__init__(name, x, y, 200, 150)
        self.path = path
        self._pm: QPixmap | None = None
        if path:
            self._load(path)

    def _load(self, path: str):
        self.path = path
        pm = QPixmap(path)
        if not pm.isNull():
            self._pm = pm
            self.width = float(min(300, pm.width()))
            self.height = float(int(self.width * pm.height() / pm.width()))

    def draw(self, p: QPainter):
        p.save()
        p.setOpacity(self.opacity)
        if self._pm and not self._pm.isNull():
            p.drawPixmap(self.rect.toRect(), self._pm)
        else:
            p.setPen(QPen(QColor("#585b70"), 2, Qt.PenStyle.DashLine))
            p.drawRect(self.rect)
            p.setPen(QColor("#585b70"))
            p.drawText(self.rect, Qt.AlignmentFlag.AlignCenter, "No Image\nDouble-click to load")
        p.restore()


# ─── Camera Thread ─────────────────────────────────────────────────────────────

RESOLUTIONS = {
    "1920 × 1080": (1920, 1080),
    "1280 × 720":  (1280,  720),
    "854 × 480":   ( 854,  480),
    "640 × 360":   ( 640,  360),
}


class CameraThread(QThread):
    frame_ready = Signal(np.ndarray)
    camera_error = Signal(str)

    def __init__(self):
        super().__init__()
        self._running = False
        self.camera_index = 0
        self.resolution = (1280, 720)
        self.target_fps = 30

    def set_resolution(self, label: str):
        self.resolution = RESOLUTIONS.get(label, (1280, 720))

    def set_fps(self, fps: int):
        self.target_fps = max(1, fps)

    def run(self):
        self._running = True
        cap: cv2.VideoCapture | None = None
        current_idx = -1

        while self._running:
            idx = self.camera_index
            fps = self.target_fps
            res = self.resolution

            if idx != current_idx:
                if cap:
                    cap.release()
                cap = cv2.VideoCapture(idx)
                if cap.isOpened():
                    cap.set(cv2.CAP_PROP_FRAME_WIDTH,  res[0])
                    cap.set(cv2.CAP_PROP_FRAME_HEIGHT, res[1])
                    cap.set(cv2.CAP_PROP_FPS, fps)
                else:
                    self.camera_error.emit(f"Cannot open camera {idx}")
                current_idx = idx

            if cap and cap.isOpened():
                ret, frame = cap.read()
                if ret:
                    self.frame_ready.emit(frame)

            self.msleep(int(1000 / fps))

        if cap:
            cap.release()

    def stop(self):
        self._running = False
        self.wait(3000)


# ─── RTMP Streamer ─────────────────────────────────────────────────────────────

class FFmpegStreamer:
    """Pipes BGR numpy frames into FFmpeg which encodes and pushes to RTMP.

    Runs a background writer thread so the Qt main thread never blocks on I/O.
    Frames are dropped (not queued) when FFmpeg can't keep up, to avoid lag.
    """

    BITRATES  = ["500k", "1000k", "2000k", "3000k", "4500k", "6000k", "8000k"]
    PRESETS   = ["ultrafast", "superfast", "veryfast", "faster", "fast", "medium"]
    # (display label, ffmpeg -c:v value)
    ENCODERS  = [
        ("libx264 (CPU)",      "libx264"),
        ("h264_nvenc (NVIDIA)","h264_nvenc"),
        ("h264_qsv (Intel)",   "h264_qsv"),
        ("h264_amf (AMD)",     "h264_amf"),
        ("h264_videotoolbox",  "h264_videotoolbox"),
    ]

    def __init__(self, url: str, width: int, height: int,
                 fps: int, bitrate: str = "3000k",
                 preset: str = "veryfast", encoder: str = "libx264",
                 stream_fps: int = 0):
        self._url      = url
        self._width    = width
        self._height   = height
        self._fps      = fps
        self._bitrate  = bitrate
        self._preset   = preset
        self._encoder  = encoder
        # stream_fps=0 means match camera FPS; otherwise cap push rate client-side
        self._stream_fps = stream_fps if stream_fps > 0 else fps
        self._interval   = 1.0 / self._stream_fps
        self._last_push  = 0.0
        self._q: queue.Queue = queue.Queue(maxsize=4)
        self._running = False
        self._proc: subprocess.Popen | None = None
        self._thread: threading.Thread | None = None
        self.error: str = ""
        self.pid: int = 0

    def start(self) -> bool:
        if not shutil.which("ffmpeg"):
            self.error = "ffmpeg not found in PATH"
            return False

        enc = self._encoder
        gop = self._stream_fps * 2

        # hardware encoders don't use -preset the same way
        hw = enc != "libx264"
        preset_args = [] if hw else ["-preset", self._preset, "-tune", "zerolatency"]

        cmd = [
            "ffmpeg", "-y", "-hide_banner", "-loglevel", "warning",
            # Raw BGR video on stdin
            "-f", "rawvideo", "-vcodec", "rawvideo",
            "-pix_fmt", "bgr24",
            "-s", f"{self._width}x{self._height}",
            "-r", str(self._stream_fps),
            "-i", "pipe:0",
            # Silent audio track
            "-f", "lavfi", "-i", "anullsrc=r=44100:cl=stereo",
            # Video encode
            "-c:v", enc,
            *preset_args,
            "-pix_fmt", "yuv420p",
            "-g", str(gop),
            "-b:v", self._bitrate, "-maxrate", self._bitrate,
            "-bufsize", str(int(self._bitrate[:-1]) * 2) + "k",
            # Audio encode
            "-c:a", "aac", "-b:a", "128k",
            "-shortest",
            "-f", "flv", self._url,
        ]
        try:
            self._proc = subprocess.Popen(
                cmd, stdin=subprocess.PIPE,
                stdout=subprocess.DEVNULL, stderr=subprocess.PIPE)
        except Exception as exc:
            self.error = str(exc)
            return False

        self.pid = self._proc.pid
        self._running = True
        self._thread = threading.Thread(target=self._writer, daemon=True)
        self._thread.start()
        return True

    def _writer(self):
        assert self._proc is not None
        while self._running:
            try:
                frame = self._q.get(timeout=1.0)
                if frame is None:
                    break
                self._proc.stdin.write(frame.tobytes())
            except queue.Empty:
                continue
            except (BrokenPipeError, OSError):
                # FFmpeg died
                _, err = self._proc.communicate()
                self.error = err.decode(errors="replace").strip()[-200:]
                self._running = False
                break

    def push(self, frame: np.ndarray):
        if not self._running:
            return
        now = time.monotonic()
        if now - self._last_push < self._interval:
            return   # throttle to _stream_fps
        self._last_push = now
        try:
            self._q.put_nowait(frame)
        except queue.Full:
            pass   # drop — better than buffering latency

    def alive(self) -> bool:
        return self._running and (self._proc is None or self._proc.poll() is None)

    def stop(self):
        self._running = False
        self._q.put(None)          # unblock writer thread
        if self._thread:
            self._thread.join(timeout=3)
        if self._proc:
            try:
                self._proc.stdin.close()
            except OSError:
                pass
            self._proc.terminate()
            try:
                self._proc.wait(timeout=3)
            except subprocess.TimeoutExpired:
                self._proc.kill()


# ─── Preview Widget ────────────────────────────────────────────────────────────

class PreviewWidget(QWidget):
    overlay_selected = Signal(object)   # Overlay | None
    overlays_changed = Signal()

    def __init__(self):
        super().__init__()
        self.setMinimumSize(640, 360)
        self.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Expanding)
        self.setMouseTracking(True)
        self.setFocusPolicy(Qt.FocusPolicy.StrongFocus)

        self.frame: np.ndarray | None = None
        self.overlays: list[Overlay] = []
        self.selected: Overlay | None = None

        # drag state
        self._drag: tuple | None = None      # (fx0, fy0, ox, oy, ow, oh)
        self._handle: int | None = None      # resize handle index

        # image processing
        self.mirror_h  = False
        self.mirror_v  = False
        self.brightness = 0
        self.contrast   = 1.0
        self.filter_mode = "none"

        # display extras
        self.show_fps  = True
        self.show_safe = False
        self.show_grid = False

        # fps counter
        self._fps = 0
        self._fc  = 0
        self._ft  = time.time()

        # recording
        self._writer: cv2.VideoWriter | None = None
        self._recording = False

        # streaming
        self._streamer: FFmpegStreamer | None = None
        self._streaming = False

        # performance
        self.eco_mode    = False   # skip every other display update
        self._eco_tick   = 0
        self.stream_fps  = 0       # 0 = same as camera; else throttled

    # ── frame update ──────────────────────────────────────────────────────────

    def update_frame(self, frame: np.ndarray):
        if self.mirror_h:
            frame = cv2.flip(frame, 1)
        if self.mirror_v:
            frame = cv2.flip(frame, 0)

        fm = self.filter_mode
        if fm == "grayscale":
            g = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            frame = cv2.cvtColor(g, cv2.COLOR_GRAY2BGR)
        elif fm == "blur":
            frame = cv2.GaussianBlur(frame, (31, 31), 0)
        elif fm == "edge":
            g = cv2.cvtColor(frame, cv2.COLOR_BGR2GRAY)
            e = cv2.Canny(g, 80, 160)
            frame = cv2.cvtColor(e, cv2.COLOR_GRAY2BGR)
        elif fm == "vintage":
            sepia = np.array([[0.272, 0.534, 0.131],
                               [0.349, 0.686, 0.168],
                               [0.393, 0.769, 0.189]], dtype=np.float32)
            rgb32 = frame.astype(np.float32)[:, :, ::-1]
            out   = rgb32 @ sepia.T
            frame = np.clip(out, 0, 255).astype(np.uint8)[:, :, ::-1]
        elif fm == "invert":
            frame = cv2.bitwise_not(frame)
        elif fm == "pixelate":
            h, w = frame.shape[:2]
            small = cv2.resize(frame, (w // 12, h // 12), interpolation=cv2.INTER_LINEAR)
            frame = cv2.resize(small, (w, h), interpolation=cv2.INTER_NEAREST)

        if self.brightness != 0 or abs(self.contrast - 1.0) > 0.01:
            frame = cv2.convertScaleAbs(frame, alpha=self.contrast, beta=self.brightness)

        self.frame = frame

        # fps
        self._fc += 1
        now = time.time()
        if now - self._ft >= 1.0:
            self._fps = self._fc
            self._fc  = 0
            self._ft  = now

        if self._recording and self._writer:
            self._writer.write(frame)

        if self._streaming and self._streamer and self._streamer.alive():
            composed = self._compose_frame()
            if composed is not None:
                self._streamer.push(composed)

        # eco mode: repaint only every other frame to save GPU/CPU
        self._eco_tick += 1
        if self.eco_mode and self._eco_tick % 2 == 0:
            return
        self.update()

    # ── coordinate helpers ────────────────────────────────────────────────────

    def _layout(self) -> tuple[float, float, float]:
        """Returns (scale, dx, dy) — how the frame maps into the widget."""
        if self.frame is None:
            return 1.0, 0.0, 0.0
        fh, fw = self.frame.shape[:2]
        ww, wh = self.width(), self.height()
        scale = min(ww / fw, wh / fh)
        dx = (ww - fw * scale) / 2
        dy = (wh - fh * scale) / 2
        return scale, dx, dy

    def _to_frame(self, wx: float, wy: float) -> tuple[float, float]:
        s, dx, dy = self._layout()
        return (wx - dx) / s, (wy - dy) / s

    # ── painting ───────────────────────────────────────────────────────────────

    def paintEvent(self, _):
        p = QPainter(self)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        p.setRenderHint(QPainter.RenderHint.SmoothPixmapTransform)
        p.fillRect(self.rect(), QColor("#0d0e13"))

        if self.frame is None:
            p.setPen(QColor("#45475a"))
            p.setFont(QFont("Arial", 18))
            p.drawText(self.rect(), Qt.AlignmentFlag.AlignCenter,
                       "No Camera Feed\n\nSelect a device in the left panel")
            p.end()
            return

        scale, dx, dy = self._layout()
        fh, fw = self.frame.shape[:2]

        # camera image
        rgb = cv2.cvtColor(self.frame, cv2.COLOR_BGR2RGB)
        h, w, ch = rgb.shape
        qimg = QImage(rgb.tobytes(), w, h, ch * w, QImage.Format.Format_RGB888)
        dest = QRectF(dx, dy, fw * scale, fh * scale)
        p.drawImage(dest, qimg)

        # overlays in frame-space
        p.save()
        p.translate(dx, dy)
        p.scale(scale, scale)

        for ov in self.overlays:
            if ov.visible:
                ov.draw(p)

        if self.selected and self.selected.visible:
            self._draw_handles(p, self.selected, 1.0 / scale)

        p.restore()

        # grid / safe area
        if self.show_grid:
            self._draw_grid(p, dx, dy, fw * scale, fh * scale)
        if self.show_safe:
            self._draw_safe(p, dx, dy, fw * scale, fh * scale)

        # FPS badge
        if self.show_fps:
            badge = f" {self._fps} fps "
            p.setFont(QFont("Courier New", 10, QFont.Weight.Bold))
            p.setPen(Qt.PenStyle.NoPen)
            p.setBrush(QColor(0, 0, 0, 140))
            fm_h = QFontMetrics(p.font()).height()
            fm_w = QFontMetrics(p.font()).horizontalAdvance(badge)
            p.drawRoundedRect(QRectF(dx + 4, dy + 4, fm_w + 4, fm_h + 4), 3, 3)
            p.setPen(QColor("#a6e3a1"))
            p.drawText(QPointF(dx + 6, dy + 4 + fm_h - 1), badge)

        # recording dot
        if self._recording:
            p.setPen(Qt.PenStyle.NoPen)
            p.setBrush(QColor("#f38ba8"))
            p.drawEllipse(QRectF(self.width() - 24, 12, 10, 10))

        p.end()

    def _draw_handles(self, p: QPainter, ov: Overlay, inv: float):
        pen = QPen(QColor("#89b4fa"), 1.5 * inv)
        pen.setStyle(Qt.PenStyle.DashLine)
        p.setPen(pen)
        p.setBrush(Qt.BrushStyle.NoBrush)
        p.drawRect(ov.rect)
        h = HANDLE_PX * inv
        p.setBrush(QBrush(QColor("#89b4fa")))
        p.setPen(Qt.PenStyle.NoPen)
        for hx, hy in self._handle_pts(ov):
            p.drawRect(QRectF(hx - h / 2, hy - h / 2, h, h))

    def _draw_grid(self, p, dx, dy, fw, fh):
        p.save()
        p.setPen(QPen(QColor(255, 255, 255, 22), 1))
        for i in range(1, 4):
            x = dx + fw * i / 4
            p.drawLine(QPointF(x, dy), QPointF(x, dy + fh))
        for i in range(1, 3):
            y = dy + fh * i / 3
            p.drawLine(QPointF(dx, y), QPointF(dx + fw, y))
        p.restore()

    def _draw_safe(self, p, dx, dy, fw, fh):
        p.save()
        p.setPen(QPen(QColor(255, 220, 0, 60), 1, Qt.PenStyle.DotLine))
        p.setBrush(Qt.BrushStyle.NoBrush)
        margin_w, margin_h = fw * 0.05, fh * 0.05
        p.drawRect(QRectF(dx + margin_w, dy + margin_h,
                          fw - 2 * margin_w, fh - 2 * margin_h))
        p.restore()

    # ── handle math ───────────────────────────────────────────────────────────

    def _handle_pts(self, ov: Overlay) -> list[tuple[float, float]]:
        x, y, w, h = ov.x, ov.y, ov.width, ov.height
        cx, cy = x + w / 2, y + h / 2
        return [
            (x,     y),    # 0 TL
            (cx,    y),    # 1 TC
            (x + w, y),    # 2 TR
            (x,     cy),   # 3 ML
            (x + w, cy),   # 4 MR
            (x,     y + h),# 5 BL
            (cx,    y + h),# 6 BC
            (x + w, y + h),# 7 BR
        ]

    def _handle_at(self, fx: float, fy: float) -> int | None:
        if self.selected is None:
            return None
        s = self._layout()[0]
        tol = HANDLE_PX / s
        for i, (hx, hy) in enumerate(self._handle_pts(self.selected)):
            if abs(fx - hx) <= tol and abs(fy - hy) <= tol:
                return i
        return None

    def _overlay_at(self, fx: float, fy: float) -> Overlay | None:
        for ov in reversed(self.overlays):
            if ov.visible and not ov.locked and ov.hit(fx, fy):
                return ov
        return None

    # ── mouse events ─────────────────────────────────────────────────────────

    def mousePressEvent(self, e):
        if e.button() != Qt.MouseButton.LeftButton:
            if e.button() == Qt.MouseButton.RightButton:
                self._context_menu(e.globalPosition().toPoint())
            return
        fx, fy = self._to_frame(e.position().x(), e.position().y())
        hi = self._handle_at(fx, fy)
        if hi is not None and self.selected:
            self._handle = hi
            ov = self.selected
            self._drag = (fx, fy, ov.x, ov.y, ov.width, ov.height)
            return
        ov = self._overlay_at(fx, fy)
        if ov:
            if ov is not self.selected:
                self.selected = ov
                self.overlay_selected.emit(ov)
            self._drag = (fx, fy, ov.x, ov.y, ov.width, ov.height)
            self._handle = None
        else:
            self.selected = None
            self.overlay_selected.emit(None)
            self._drag = None
        self.update()

    def mouseMoveEvent(self, e):
        fx, fy = self._to_frame(e.position().x(), e.position().y())
        if self._drag is None:
            if self._handle_at(fx, fy) is not None:
                self.setCursor(Qt.CursorShape.SizeFDiagCursor)
            elif self._overlay_at(fx, fy):
                self.setCursor(Qt.CursorShape.SizeAllCursor)
            else:
                self.setCursor(Qt.CursorShape.ArrowCursor)
            return

        dx = fx - self._drag[0]
        dy = fy - self._drag[1]
        ox, oy, ow, oh = self._drag[2], self._drag[3], self._drag[4], self._drag[5]
        ov = self.selected
        if ov is None:
            return

        MIN = 20.0
        h = self._handle
        if h is not None:
            if   h == 0: ov.x = ox+dx; ov.y = oy+dy; ov.width = max(MIN, ow-dx); ov.height = max(MIN, oh-dy)
            elif h == 1: ov.y = oy+dy; ov.height = max(MIN, oh-dy)
            elif h == 2: ov.y = oy+dy; ov.width = max(MIN, ow+dx); ov.height = max(MIN, oh-dy)
            elif h == 3: ov.x = ox+dx; ov.width = max(MIN, ow-dx)
            elif h == 4: ov.width = max(MIN, ow+dx)
            elif h == 5: ov.x = ox+dx; ov.width = max(MIN, ow-dx); ov.height = max(MIN, oh+dy)
            elif h == 6: ov.height = max(MIN, oh+dy)
            elif h == 7: ov.width = max(MIN, ow+dx); ov.height = max(MIN, oh+dy)
        else:
            ov.x = ox + dx
            ov.y = oy + dy

        self.overlays_changed.emit()
        self.update()

    def mouseReleaseEvent(self, _):
        self._drag = None
        self._handle = None

    def mouseDoubleClickEvent(self, e):
        fx, fy = self._to_frame(e.position().x(), e.position().y())
        ov = self._overlay_at(fx, fy)
        if isinstance(ov, TextOverlay):
            text, ok = QInputDialog.getText(self, "Edit Text", "Content:", text=ov.text)
            if ok:
                ov.text = text
                self.overlays_changed.emit()
                self.update()
        elif isinstance(ov, ImageOverlay):
            path, _ = QFileDialog.getOpenFileName(
                self, "Open Image", "",
                "Images (*.png *.jpg *.jpeg *.bmp *.webp *.gif)")
            if path:
                ov._load(path)
                self.overlays_changed.emit()
                self.update()

    def keyPressEvent(self, e):
        ov = self.selected
        if ov is None:
            return
        step = 10 if e.modifiers() & Qt.KeyboardModifier.ShiftModifier else 1
        k = e.key()
        if k in (Qt.Key.Key_Delete, Qt.Key.Key_Backspace):
            self._remove(ov)
        elif k == Qt.Key.Key_Left:  ov.x -= step; self._emit_changed()
        elif k == Qt.Key.Key_Right: ov.x += step; self._emit_changed()
        elif k == Qt.Key.Key_Up:    ov.y -= step; self._emit_changed()
        elif k == Qt.Key.Key_Down:  ov.y += step; self._emit_changed()
        self.update()

    def _emit_changed(self):
        self.overlays_changed.emit()

    def _remove(self, ov: Overlay):
        if ov in self.overlays:
            self.overlays.remove(ov)
            self.selected = None
            self.overlay_selected.emit(None)
            self.overlays_changed.emit()
            self.update()

    def _context_menu(self, gpos):
        if self.selected is None:
            return
        menu = QMenu(self)
        menu.setStyleSheet("""
            QMenu { background:#1e2030; border:1px solid #313244; color:#cdd6f4; }
            QMenu::item:selected { background:#2563eb; }
        """)
        menu.addAction("Duplicate",    lambda: self.parent()._duplicate_overlay())
        menu.addAction("Move Forward", lambda: self.parent()._move_up())
        menu.addAction("Move Back",    lambda: self.parent()._move_down())
        menu.addSeparator()
        vis_label = "Hide" if self.selected.visible else "Show"
        menu.addAction(vis_label, lambda: self._toggle_visible())
        menu.addSeparator()
        menu.addAction("Delete", lambda: self._remove(self.selected))
        menu.exec(gpos)

    def _toggle_visible(self):
        if self.selected:
            self.selected.visible = not self.selected.visible
            self.overlays_changed.emit()
            self.update()

    # ── compose (frame + overlays → BGR ndarray) ──────────────────────────────

    def _compose_frame(self) -> np.ndarray | None:
        """Render self.frame with all visible overlays painted on top.

        Returns a BGR uint8 ndarray at the camera's native resolution,
        suitable for piping to FFmpeg or writing to a VideoWriter.
        """
        if self.frame is None:
            return None
        fh, fw = self.frame.shape[:2]

        # paint into an off-screen RGB QImage at native resolution
        qimg = QImage(fw, fh, QImage.Format.Format_RGB888)
        rgb = cv2.cvtColor(self.frame, cv2.COLOR_BGR2RGB)
        src = QImage(rgb.tobytes(), fw, fh, fw * 3, QImage.Format.Format_RGB888)

        p = QPainter(qimg)
        p.setRenderHint(QPainter.RenderHint.Antialiasing)
        p.drawImage(0, 0, src)
        for ov in self.overlays:
            if ov.visible:
                ov.draw(p)
        p.end()

        # QImage (RGB) → numpy → BGR
        ptr = qimg.bits()
        arr = np.frombuffer(ptr, dtype=np.uint8).reshape((fh, fw, 3)).copy()
        return arr[:, :, ::-1]   # RGB → BGR

    # ── streaming ─────────────────────────────────────────────────────────────

    def start_streaming(self, url: str, fps: int, bitrate: str,
                        preset: str = "veryfast", encoder: str = "libx264",
                        stream_fps: int = 0) -> bool:
        if self.frame is None:
            return False
        fh, fw = self.frame.shape[:2]
        self._streamer = FFmpegStreamer(
            url, fw, fh, fps, bitrate, preset, encoder, stream_fps)
        ok = self._streamer.start()
        if ok:
            self._streaming = True
        return ok

    def stop_streaming(self):
        self._streaming = False
        if self._streamer:
            self._streamer.stop()
            self._streamer = None

    # ── recording / capture ────────────────────────────────────────────────────

    def start_recording(self, path: str, fps: int) -> bool:
        if self.frame is None:
            return False
        h, w = self.frame.shape[:2]
        fourcc = cv2.VideoWriter_fourcc(*"mp4v")
        self._writer = cv2.VideoWriter(path, fourcc, fps, (w, h))
        self._recording = self._writer.isOpened()
        return self._recording

    def stop_recording(self):
        self._recording = False
        if self._writer:
            self._writer.release()
            self._writer = None

    def snapshot(self) -> QImage | None:
        if self.frame is None:
            return None
        rgb = cv2.cvtColor(self.frame, cv2.COLOR_BGR2RGB)
        h, w, ch = rgb.shape
        return QImage(rgb.tobytes(), w, h, ch * w, QImage.Format.Format_RGB888).copy()


# ─── Properties Panel ─────────────────────────────────────────────────────────

class PropertiesPanel(QScrollArea):
    changed = Signal()

    def __init__(self):
        super().__init__()
        self.setWidgetResizable(True)
        self.setFrameShape(QFrame.Shape.NoFrame)
        self._ov: Overlay | None = None
        self._body = QWidget()
        self._vl = QVBoxLayout(self._body)
        self._vl.setSpacing(8)
        self._vl.setContentsMargins(2, 2, 2, 2)
        self._vl.addStretch()
        self.setWidget(self._body)

    def show_overlay(self, ov: Overlay | None):
        self._ov = ov
        while self._vl.count():
            item = self._vl.takeAt(0)
            if item.widget():
                item.widget().deleteLater()

        if ov is None:
            lbl = QLabel("Select an overlay\nto edit its properties")
            lbl.setAlignment(Qt.AlignmentFlag.AlignCenter)
            lbl.setStyleSheet("color:#45475a; font-size:12px; padding:20px;")
            self._vl.addWidget(lbl)
            self._vl.addStretch()
            return

        self._add_common(ov)
        if isinstance(ov, TextOverlay):
            self._add_text(ov)
        elif isinstance(ov, ClockOverlay):
            self._add_clock(ov)
        elif isinstance(ov, ShapeOverlay):
            self._add_shape(ov)
        elif isinstance(ov, ImageOverlay):
            self._add_image(ov)
        self._vl.addStretch()

    # ── helpers ───────────────────────────────────────────────────────────────

    def _group(self, title: str) -> tuple[QGroupBox, QFormLayout]:
        g = QGroupBox(title)
        fl = QFormLayout(g)
        fl.setLabelAlignment(Qt.AlignmentFlag.AlignRight)
        fl.setSpacing(6)
        fl.setContentsMargins(8, 14, 8, 8)
        return g, fl

    def _color_btn(self, color: QColor, setter) -> QPushButton:
        btn = QPushButton()
        btn.setFixedSize(44, 24)
        btn.setStyleSheet(f"background:{color.name(QColor.NameFormat.HexArgb)};"
                          f"border-radius:4px; border:1px solid #45475a;")
        def _pick():
            c = QColorDialog.getColor(
                color, self, "Pick Colour",
                QColorDialog.ColorDialogOption.ShowAlphaChannel)
            if c.isValid():
                btn.setStyleSheet(f"background:{c.name(QColor.NameFormat.HexArgb)};"
                                  f"border-radius:4px; border:1px solid #89b4fa;")
                setter(c)
                self.changed.emit()
        btn.clicked.connect(_pick)
        return btn

    def _slider(self, lo, hi, val, setter, scale=1) -> QSlider:
        s = QSlider(Qt.Orientation.Horizontal)
        s.setRange(lo, hi)
        s.setValue(int(val * scale))
        s.valueChanged.connect(lambda v: (setter(v / scale), self.changed.emit()))
        return s

    def _spin(self, lo, hi, val, setter) -> QSpinBox:
        sp = QSpinBox()
        sp.setRange(lo, hi)
        sp.setValue(int(val))
        sp.valueChanged.connect(lambda v: (setter(v), self.changed.emit()))
        return sp

    def _dspin(self, lo, hi, val, setter, step=1.0) -> QDoubleSpinBox:
        sp = QDoubleSpinBox()
        sp.setRange(lo, hi)
        sp.setValue(val)
        sp.setSingleStep(step)
        sp.valueChanged.connect(lambda v: (setter(v), self.changed.emit()))
        return sp

    def _check(self, val: bool, setter) -> QCheckBox:
        cb = QCheckBox()
        cb.setChecked(val)
        cb.toggled.connect(lambda v: (setter(v), self.changed.emit()))
        return cb

    def _ledit(self, text: str, setter) -> QLineEdit:
        le = QLineEdit(text)
        le.textChanged.connect(lambda v: (setter(v), self.changed.emit()))
        return le

    # ── common props ──────────────────────────────────────────────────────────

    def _add_common(self, ov: Overlay):
        g, fl = self._group("Transform")

        fl.addRow("Name", self._ledit(ov.name, lambda v: setattr(ov, "name", v)))

        xy = QWidget(); xyl = QHBoxLayout(xy); xyl.setContentsMargins(0,0,0,0)
        xyl.addWidget(self._dspin(-9999, 9999, ov.x, lambda v: setattr(ov, "x", v)))
        xyl.addWidget(self._dspin(-9999, 9999, ov.y, lambda v: setattr(ov, "y", v)))
        fl.addRow("X / Y", xy)

        wh = QWidget(); whl = QHBoxLayout(wh); whl.setContentsMargins(0,0,0,0)
        whl.addWidget(self._dspin(10, 9999, ov.width,  lambda v: setattr(ov, "width",  v)))
        whl.addWidget(self._dspin(10, 9999, ov.height, lambda v: setattr(ov, "height", v)))
        fl.addRow("W / H", wh)

        fl.addRow("Opacity", self._slider(0, 100, ov.opacity, lambda v: setattr(ov, "opacity", v), 100))

        flags = QWidget(); fl2 = QHBoxLayout(flags); fl2.setContentsMargins(0,0,0,0)
        vis = self._check(ov.visible, lambda v: setattr(ov, "visible", v))
        lck = QCheckBox(); lck.setChecked(ov.locked)
        lck.toggled.connect(lambda v: setattr(ov, "locked", v))
        fl2.addWidget(QLabel("Visible")); fl2.addWidget(vis)
        fl2.addSpacing(10)
        fl2.addWidget(QLabel("Locked")); fl2.addWidget(lck)
        fl2.addStretch()
        fl.addRow("", flags)

        self._vl.addWidget(g)

    def _add_text(self, ov: TextOverlay):
        g, fl = self._group("Text")
        fl.addRow("Content", self._ledit(ov.text, lambda v: setattr(ov, "text", v)))
        fl.addRow("Size",    self._spin(6, 200, ov.font_size,
                                        lambda v: setattr(ov, "font_size", v)))

        font_btn = QPushButton(ov.font_family)
        def _pick_font():
            f = QFont(ov.font_family, ov.font_size)
            f.setBold(ov.bold); f.setItalic(ov.italic)
            font, ok = QFontDialog.getFont(f, self)
            if ok:
                ov.font_family = font.family()
                ov.font_size   = font.pointSize()
                ov.bold        = font.bold()
                ov.italic      = font.italic()
                font_btn.setText(font.family())
                self.changed.emit()
        font_btn.clicked.connect(_pick_font)
        fl.addRow("Font", font_btn)

        bi = QWidget(); bil = QHBoxLayout(bi); bil.setContentsMargins(0,0,0,0)
        bd = self._check(ov.bold,   lambda v: setattr(ov, "bold",   v))
        it = self._check(ov.italic, lambda v: setattr(ov, "italic", v))
        bil.addWidget(QLabel("Bold")); bil.addWidget(bd)
        bil.addSpacing(10)
        bil.addWidget(QLabel("Italic")); bil.addWidget(it)
        bil.addStretch()
        fl.addRow("", bi)

        fl.addRow("Colour",  self._color_btn(ov.color,    lambda c: setattr(ov, "color",    c)))
        fl.addRow("Show BG", self._check(ov.show_bg,      lambda v: setattr(ov, "show_bg",  v)))
        fl.addRow("BG Col.", self._color_btn(ov.bg_color, lambda c: setattr(ov, "bg_color", c)))
        self._vl.addWidget(g)

    def _add_clock(self, ov: ClockOverlay):
        g, fl = self._group("Clock")
        fl.addRow("Format",  self._ledit(ov.fmt, lambda v: setattr(ov, "fmt", v)))
        fl.addRow("Size",    self._spin(8, 120, ov.font_size,
                                        lambda v: setattr(ov, "font_size", v)))
        fl.addRow("Colour",  self._color_btn(ov.color,    lambda c: setattr(ov, "color",    c)))
        fl.addRow("Show BG", self._check(ov.show_bg,      lambda v: setattr(ov, "show_bg",  v)))
        fl.addRow("BG Col.", self._color_btn(ov.bg_color, lambda c: setattr(ov, "bg_color", c)))
        self._vl.addWidget(g)

    def _add_shape(self, ov: ShapeOverlay):
        g, fl = self._group("Shape")
        sc = QComboBox()
        sc.addItems(["rectangle", "ellipse"])
        sc.setCurrentText(ov.shape)
        sc.currentTextChanged.connect(lambda v: (setattr(ov, "shape", v), self.changed.emit()))
        fl.addRow("Type",     sc)
        fl.addRow("Fill",     self._color_btn(ov.fill,   lambda c: setattr(ov, "fill",   c)))
        fl.addRow("Border",   self._color_btn(ov.border, lambda c: setattr(ov, "border", c)))
        fl.addRow("Border W", self._spin(0, 20, ov.border_w, lambda v: setattr(ov, "border_w", v)))
        fl.addRow("Radius",   self._spin(0, 100, ov.radius, lambda v: setattr(ov, "radius", v)))
        self._vl.addWidget(g)

    def _add_image(self, ov: ImageOverlay):
        g, fl = self._group("Image")
        fname = QLabel(Path(ov.path).name if ov.path else "—")
        fname.setWordWrap(True)
        fname.setStyleSheet("color:#cdd6f4; font-size:11px;")
        fl.addRow("File", fname)

        def _browse():
            path, _ = QFileDialog.getOpenFileName(
                self, "Open Image", "",
                "Images (*.png *.jpg *.jpeg *.bmp *.webp *.gif)")
            if path:
                ov._load(path)
                fname.setText(Path(path).name)
                self.changed.emit()

        fl.addRow("", QPushButton("Browse…"))
        g.findChild(QPushButton).clicked.connect(_browse)
        self._vl.addWidget(g)


# ─── Overlay list widget ───────────────────────────────────────────────────────

class OverlayList(QListWidget):
    """Drag-reorderable overlay list."""
    reordered = Signal()

    def __init__(self):
        super().__init__()
        self.setDragDropMode(QListWidget.DragDropMode.InternalMove)
        self.setAlternatingRowColors(True)
        self.setSpacing(1)

    def dropEvent(self, e):
        super().dropEvent(e)
        self.reordered.emit()


# ─── Main Window ───────────────────────────────────────────────────────────────

class MainWindow(QMainWindow):

    def __init__(self):
        super().__init__()
        self.setWindowTitle("WebcamStudio")
        self.resize(1440, 880)
        self._cam = CameraThread()
        self._rec_fps = 30
        self._build_ui()
        self.setStyleSheet(STYLE)
        self._detect_cameras()
        self._cam.frame_ready.connect(self.preview.update_frame)
        self._cam.camera_error.connect(self._on_cam_error)
        self._cam.start()

        # clock overlay refresh
        self._clock_timer = QTimer()
        self._clock_timer.timeout.connect(self.preview.update)
        self._clock_timer.start(100)

        # CPU usage monitor (2 s interval)
        if _HAS_PSUTIL:
            self._self_proc = _psutil.Process()
            self._self_proc.cpu_percent()   # first call returns 0; prime it
        self._cpu_timer = QTimer()
        self._cpu_timer.timeout.connect(self._update_cpu)
        self._cpu_timer.start(2000)

    # ── camera detection ──────────────────────────────────────────────────────

    def _detect_cameras(self):
        self._cam_combo.blockSignals(True)
        self._cam_combo.clear()
        found = []
        for i in range(8):
            cap = cv2.VideoCapture(i)
            if cap.isOpened():
                found.append(i)
                cap.release()
        if found:
            for i in found:
                self._cam_combo.addItem(f"Camera {i}", i)
            self._cam.camera_index = found[0]
        else:
            self._cam_combo.addItem("No camera found", -1)
        self._cam_combo.blockSignals(False)

    def _on_cam_error(self, msg: str):
        self._status.setText(f"⚠  {msg}")

    # ── UI construction ───────────────────────────────────────────────────────

    def _build_ui(self):
        self._build_topbar()
        central = QWidget()
        self.setCentralWidget(central)
        root = QHBoxLayout(central)
        root.setSpacing(0)
        root.setContentsMargins(0, 0, 0, 0)
        root.addWidget(self._build_left())
        root.addWidget(self._build_center(), 1)
        root.addWidget(self._build_right())

    def _build_topbar(self):
        tb = self.addToolBar("top")
        tb.setObjectName("topbar")
        tb.setMovable(False)
        tb.setFloatable(False)

        name = QLabel("  ⬛ WebcamStudio  ")
        name.setObjectName("appname")
        tb.addWidget(name)

        sep = QFrame(); sep.setFrameShape(QFrame.Shape.VLine)
        sep.setObjectName("vdiv"); sep.setFixedWidth(1)
        tb.addWidget(sep)

        sp = QWidget(); sp.setSizePolicy(QSizePolicy.Policy.Expanding, QSizePolicy.Policy.Preferred)
        tb.addWidget(sp)

        self._cpu_label = QLabel("CPU –")
        self._cpu_label.setObjectName("cpuLabel")
        self._cpu_label.setToolTip(
            "Combined CPU usage of this process + FFmpeg streamer.\n"
            "Requires: pip install psutil" if not _HAS_PSUTIL else
            "Combined CPU usage of this process + FFmpeg streamer.")
        tb.addWidget(self._cpu_label)
        tb.addWidget(QLabel("  "))

        self._status = QLabel("Ready")
        self._status.setObjectName("status")
        tb.addWidget(self._status)
        tb.addWidget(QLabel("   "))

    def _section(self, title: str) -> QGroupBox:
        return QGroupBox(title)

    # ─── left panel: camera & filters ─────────────────────────────────────────

    def _build_left(self) -> QWidget:
        p = QWidget(); p.setObjectName("leftpanel"); p.setFixedWidth(226)
        vl = QVBoxLayout(p); vl.setSpacing(10); vl.setContentsMargins(10, 12, 10, 12)

        # Camera
        cam = self._section("Camera Input"); cl = QFormLayout(cam)
        cl.setSpacing(6); cl.setContentsMargins(8, 14, 8, 8)
        self._cam_combo = QComboBox()
        self._cam_combo.currentIndexChanged.connect(self._on_cam_change)
        cl.addRow("Device", self._cam_combo)

        self._res_combo = QComboBox()
        for r in RESOLUTIONS:
            self._res_combo.addItem(r)
        self._res_combo.setCurrentIndex(1)
        self._res_combo.currentTextChanged.connect(lambda t: self._cam.set_resolution(t))
        cl.addRow("Resolution", self._res_combo)

        fps_spin = QSpinBox(); fps_spin.setRange(5, 60); fps_spin.setValue(30)
        fps_spin.valueChanged.connect(self._on_fps_change)
        cl.addRow("FPS", fps_spin)

        ref_btn = QPushButton("↻  Refresh")
        ref_btn.clicked.connect(self._detect_cameras)
        cl.addRow("", ref_btn)
        vl.addWidget(cam)

        # Transform
        tf = self._section("Transform"); tfl = QVBoxLayout(tf)
        tfl.setContentsMargins(8, 14, 8, 8); tfl.setSpacing(6)
        mh = QCheckBox("Flip Horizontal")
        mh.toggled.connect(lambda v: setattr(self.preview, "mirror_h", v))
        mv = QCheckBox("Flip Vertical")
        mv.toggled.connect(lambda v: setattr(self.preview, "mirror_v", v))
        tfl.addWidget(mh); tfl.addWidget(mv)
        vl.addWidget(tf)

        # Filters
        fi = self._section("Filter"); fil = QVBoxLayout(fi)
        fil.setContentsMargins(8, 14, 8, 8); fil.setSpacing(6)
        fc = QComboBox()
        filters = [("None","none"),("Grayscale","grayscale"),("Blur","blur"),
                   ("Edge Detection","edge"),("Vintage / Sepia","vintage"),
                   ("Invert","invert"),("Pixelate","pixelate")]
        for label, val in filters:
            fc.addItem(label, val)
        fc.currentIndexChanged.connect(
            lambda i: setattr(self.preview, "filter_mode", fc.itemData(i)))
        fil.addWidget(fc)
        vl.addWidget(fi)

        # Adjustments
        adj = self._section("Adjustments"); adfl = QFormLayout(adj)
        adfl.setSpacing(6); adfl.setContentsMargins(8, 14, 8, 8)

        br = QSlider(Qt.Orientation.Horizontal); br.setRange(-100, 100); br.setValue(0)
        br.valueChanged.connect(lambda v: setattr(self.preview, "brightness", v))
        adfl.addRow("Brightness", br)

        ct = QSlider(Qt.Orientation.Horizontal); ct.setRange(50, 300); ct.setValue(100)
        ct.valueChanged.connect(lambda v: setattr(self.preview, "contrast", v / 100.0))
        adfl.addRow("Contrast", ct)
        vl.addWidget(adj)

        vl.addStretch()
        return p

    # ─── center: preview + bottom bar ─────────────────────────────────────────

    def _build_center(self) -> QWidget:
        w = QWidget()
        vl = QVBoxLayout(w); vl.setSpacing(0); vl.setContentsMargins(0, 0, 0, 0)
        self.preview = PreviewWidget()
        self.preview.overlay_selected.connect(self._on_ov_selected)
        self.preview.overlays_changed.connect(self._refresh_list)
        vl.addWidget(self.preview, 1)
        vl.addWidget(self._build_bottom())
        return w

    def _build_bottom(self) -> QWidget:
        bar = QWidget(); bar.setObjectName("bottombar")
        outer = QVBoxLayout(bar); outer.setSpacing(0); outer.setContentsMargins(0, 0, 0, 0)

        # ── row 1: view toggles + record/screenshot ───────────────────────────
        row1 = QWidget(); row1.setObjectName("bottombar")
        bl = QHBoxLayout(row1); bl.setContentsMargins(20, 8, 20, 6); bl.setSpacing(12)

        fps_cb = QCheckBox("FPS"); fps_cb.setChecked(True)
        fps_cb.toggled.connect(lambda v: setattr(self.preview, "show_fps", v))
        grid_cb = QCheckBox("Grid")
        grid_cb.toggled.connect(lambda v: setattr(self.preview, "show_grid", v))
        safe_cb = QCheckBox("Safe Area")
        safe_cb.toggled.connect(lambda v: setattr(self.preview, "show_safe", v))
        eco_cb = QCheckBox("Eco")
        eco_cb.setToolTip(
            "Eco mode: repaint preview every other frame (~half GPU load).\n"
            "Streaming and recording are unaffected.")
        eco_cb.toggled.connect(lambda v: setattr(self.preview, "eco_mode", v))

        self._snap_btn = QPushButton("📷  Screenshot")
        self._snap_btn.setObjectName("snapBtn")
        self._snap_btn.clicked.connect(self._take_screenshot)

        self._rec_btn = QPushButton("⏺  Record")
        self._rec_btn.setObjectName("recordBtn")
        self._rec_btn.setCheckable(True)
        self._rec_btn.toggled.connect(self._toggle_recording)

        bl.addWidget(fps_cb); bl.addWidget(grid_cb); bl.addWidget(safe_cb)
        bl.addSpacing(8); bl.addWidget(eco_cb)
        bl.addStretch()
        bl.addWidget(self._snap_btn); bl.addWidget(self._rec_btn)

        # ── divider ───────────────────────────────────────────────────────────
        div = QFrame(); div.setFrameShape(QFrame.Shape.HLine)
        div.setStyleSheet("background:#252632; max-height:1px;")

        # ── row 2: RTMP streaming ─────────────────────────────────────────────
        row2 = QWidget(); row2.setObjectName("bottombar")
        sl = QHBoxLayout(row2); sl.setContentsMargins(20, 6, 20, 8); sl.setSpacing(10)

        def _lbl(t: str) -> QLabel:
            l = QLabel(t); l.setStyleSheet("color:#6c7086; font-size:11px;"); return l

        self._rtmp_edit = QLineEdit()
        self._rtmp_edit.setObjectName("rtmpInput")
        self._rtmp_edit.setPlaceholderText("rtmp://live.twitch.tv/app/your_stream_key")

        self._bitrate_combo = QComboBox()
        for br in FFmpegStreamer.BITRATES:
            self._bitrate_combo.addItem(br)
        self._bitrate_combo.setCurrentText("3000k")
        self._bitrate_combo.setFixedWidth(78)
        self._bitrate_combo.setToolTip("Streaming bitrate")

        self._preset_combo = QComboBox()
        for p in FFmpegStreamer.PRESETS:
            self._preset_combo.addItem(p)
        self._preset_combo.setCurrentText("veryfast")
        self._preset_combo.setFixedWidth(92)
        self._preset_combo.setToolTip(
            "libx264 encoding speed/quality preset.\n"
            "ultrafast = lowest CPU; medium = best quality.\n"
            "Ignored for hardware encoders.")

        self._encoder_combo = QComboBox()
        for label, _ in FFmpegStreamer.ENCODERS:
            self._encoder_combo.addItem(label)
        self._encoder_combo.setFixedWidth(170)
        self._encoder_combo.setToolTip(
            "Video encoder. Hardware encoders (NVENC/QSV/AMF)\n"
            "offload encoding to GPU, drastically cutting CPU load.\n"
            "Requires matching GPU drivers.")

        self._sfps_combo = QComboBox()
        for v in ["cam fps", "10", "15", "20", "24", "30"]:
            self._sfps_combo.addItem(v)
        self._sfps_combo.setFixedWidth(72)
        self._sfps_combo.setToolTip(
            "Stream FPS — cap how many frames per second are sent to FFmpeg.\n"
            "Lower = less CPU. 'cam fps' = match camera setting.")

        self._live_btn = QPushButton("▶  Go Live")
        self._live_btn.setObjectName("liveBtn")
        self._live_btn.setCheckable(True)
        self._live_btn.toggled.connect(self._toggle_streaming)

        sl.addWidget(_lbl("RTMP"))
        sl.addWidget(self._rtmp_edit, 1)
        sl.addWidget(_lbl("bps")); sl.addWidget(self._bitrate_combo)
        sl.addWidget(_lbl("preset")); sl.addWidget(self._preset_combo)
        sl.addWidget(_lbl("enc")); sl.addWidget(self._encoder_combo)
        sl.addWidget(_lbl("fps")); sl.addWidget(self._sfps_combo)
        sl.addWidget(self._live_btn)

        outer.addWidget(row1)
        outer.addWidget(div)
        outer.addWidget(row2)
        return bar

    # ─── right panel: overlays + properties ──────────────────────────────────

    def _build_right(self) -> QWidget:
        p = QWidget(); p.setObjectName("rightpanel"); p.setFixedWidth(258)
        vl = QVBoxLayout(p); vl.setSpacing(10); vl.setContentsMargins(10, 12, 10, 12)

        # Add overlay
        add = self._section("Add Overlay"); ag = QGridLayout(add)
        ag.setSpacing(5); ag.setContentsMargins(8, 14, 8, 8)
        btns = [
            ("✏  Text",    self._add_text),
            ("🕐 Clock",   self._add_clock),
            ("▭  Rect",    self._add_rect),
            ("⬭  Ellipse", self._add_ellipse),
            ("🖼  Image",   self._add_image),
        ]
        for i, (lbl, fn) in enumerate(btns):
            b = QPushButton(lbl); b.setObjectName("addBtn")
            b.clicked.connect(fn)
            ag.addWidget(b, i // 2, i % 2)
        vl.addWidget(add)

        # Overlay list
        lst_g = self._section("Layers"); ll = QVBoxLayout(lst_g)
        ll.setSpacing(5); ll.setContentsMargins(8, 14, 8, 8)

        self._ov_list = OverlayList()
        self._ov_list.setFixedHeight(160)
        self._ov_list.currentRowChanged.connect(self._on_list_row)
        self._ov_list.reordered.connect(self._on_list_reorder)
        ll.addWidget(self._ov_list)

        row = QHBoxLayout(); row.setSpacing(4)
        up  = QPushButton("▲"); up.setObjectName("iconBtn"); up.setFixedWidth(30); up.clicked.connect(self._move_up)
        dn  = QPushButton("▼"); dn.setObjectName("iconBtn"); dn.setFixedWidth(30); dn.clicked.connect(self._move_down)
        dup = QPushButton("Duplicate"); dup.clicked.connect(self._duplicate_overlay)
        dl  = QPushButton("Delete");    dl.clicked.connect(self._delete_overlay)
        row.addWidget(up); row.addWidget(dn); row.addStretch()
        row.addWidget(dup); row.addWidget(dl)
        ll.addLayout(row)
        vl.addWidget(lst_g)

        # Properties
        prop_g = self._section("Properties"); pl = QVBoxLayout(prop_g)
        pl.setContentsMargins(4, 14, 4, 4)
        self._props = PropertiesPanel()
        self._props.changed.connect(self._on_props_changed)
        pl.addWidget(self._props)
        vl.addWidget(prop_g, 1)

        return p

    # ── overlay CRUD ──────────────────────────────────────────────────────────

    def _add_ov(self, ov: Overlay):
        self.preview.overlays.append(ov)
        self.preview.selected = ov
        self.preview.overlay_selected.emit(ov)
        self._refresh_list()
        self.preview.setFocus()
        self.preview.update()

    def _add_text(self):
        self._add_ov(TextOverlay(f"Text {len(self.preview.overlays)+1}", 80, 80))

    def _add_clock(self):
        self._add_ov(ClockOverlay(f"Clock {len(self.preview.overlays)+1}", 10, 10))

    def _add_rect(self):
        self._add_ov(ShapeOverlay(f"Rect {len(self.preview.overlays)+1}", 100, 100, "rectangle"))

    def _add_ellipse(self):
        self._add_ov(ShapeOverlay(f"Ellipse {len(self.preview.overlays)+1}", 180, 150, "ellipse"))

    def _add_image(self):
        path, _ = QFileDialog.getOpenFileName(
            self, "Open Image", "",
            "Images (*.png *.jpg *.jpeg *.bmp *.webp *.gif)")
        name = Path(path).stem if path else f"Image {len(self.preview.overlays)+1}"
        self._add_ov(ImageOverlay(name, 100, 100, path))

    def _delete_overlay(self):
        ov = self.preview.selected
        if ov and ov in self.preview.overlays:
            self.preview._remove(ov)

    def _duplicate_overlay(self):
        ov = self.preview.selected
        if ov:
            self._add_ov(ov.clone())

    def _move_up(self):
        ov = self.preview.selected
        ovs = self.preview.overlays
        if ov and ov in ovs:
            i = ovs.index(ov)
            if i < len(ovs) - 1:
                ovs[i], ovs[i+1] = ovs[i+1], ovs[i]
                self._refresh_list()
                self.preview.update()

    def _move_down(self):
        ov = self.preview.selected
        ovs = self.preview.overlays
        if ov and ov in ovs:
            i = ovs.index(ov)
            if i > 0:
                ovs[i], ovs[i-1] = ovs[i-1], ovs[i]
                self._refresh_list()
                self.preview.update()

    # ── list sync ─────────────────────────────────────────────────────────────

    def _refresh_list(self):
        sel = self.preview.selected
        self._ov_list.blockSignals(True)
        self._ov_list.clear()
        for ov in self.preview.overlays:
            vis  = "👁" if ov.visible else "🚫"
            lock = " 🔒" if ov.locked else ""
            item = QListWidgetItem(f"{vis}{lock}  {ov.name}  [{ov.kind}]")
            item.setData(Qt.ItemDataRole.UserRole, ov)
            if ov is sel:
                item.setSelected(True)
            self._ov_list.addItem(item)
        self._ov_list.blockSignals(False)

        # select the right row
        if sel:
            for i in range(self._ov_list.count()):
                if self._ov_list.item(i).data(Qt.ItemDataRole.UserRole) is sel:
                    self._ov_list.blockSignals(True)
                    self._ov_list.setCurrentRow(i)
                    self._ov_list.blockSignals(False)
                    break

    def _on_list_row(self, row: int):
        if 0 <= row < self._ov_list.count():
            ov = self._ov_list.item(row).data(Qt.ItemDataRole.UserRole)
            self.preview.selected = ov
            self._props.show_overlay(ov)
            self.preview.update()

    def _on_list_reorder(self):
        new_order = [self._ov_list.item(i).data(Qt.ItemDataRole.UserRole)
                     for i in range(self._ov_list.count())]
        self.preview.overlays = new_order
        self.preview.update()

    def _on_ov_selected(self, ov: Overlay | None):
        self._props.show_overlay(ov)
        self._refresh_list()

    def _on_props_changed(self):
        self._refresh_list()
        self.preview.update()

    # ── camera callbacks ──────────────────────────────────────────────────────

    def _on_cam_change(self, idx: int):
        val = self._cam_combo.itemData(idx)
        if val is not None and val >= 0:
            self._cam.camera_index = val

    def _on_fps_change(self, fps: int):
        self._cam.set_fps(fps)
        self._rec_fps = fps

    # ── CPU monitor ───────────────────────────────────────────────────────────

    def _update_cpu(self):
        if not _HAS_PSUTIL:
            self._cpu_label.setText("CPU (pip install psutil)")
            return
        try:
            cpu = self._self_proc.cpu_percent()
            # add FFmpeg child if streaming
            streamer = self.preview._streamer
            if streamer and streamer.pid:
                try:
                    ffp = _psutil.Process(streamer.pid)
                    cpu += ffp.cpu_percent()
                except _psutil.NoSuchProcess:
                    pass
            color = "#a6e3a1" if cpu < 50 else "#f9e2af" if cpu < 80 else "#f38ba8"
            self._cpu_label.setText(f"CPU {cpu:5.1f}%")
            self._cpu_label.setStyleSheet(
                f"color:{color}; font-size:11px; font-weight:700;"
                f"font-family:'Courier New',monospace;"
                f"padding:0 8px; border:1px solid #313244; border-radius:4px;")
        except Exception:
            pass

    # ── streaming ─────────────────────────────────────────────────────────────

    def _streaming_controls(self, enabled: bool):
        self._rtmp_edit.setEnabled(enabled)
        self._bitrate_combo.setEnabled(enabled)
        self._preset_combo.setEnabled(enabled)
        self._encoder_combo.setEnabled(enabled)
        self._sfps_combo.setEnabled(enabled)

    def _toggle_streaming(self, on: bool):
        if on:
            url = self._rtmp_edit.text().strip()
            if not url:
                QMessageBox.warning(self, "No URL", "Enter an RTMP URL before going live.")
                self._live_btn.setChecked(False)
                return
            bitrate  = self._bitrate_combo.currentText()
            preset   = self._preset_combo.currentText()
            enc_idx  = self._encoder_combo.currentIndex()
            encoder  = FFmpegStreamer.ENCODERS[enc_idx][1]
            sfps_txt = self._sfps_combo.currentText()
            stream_fps = 0 if sfps_txt == "cam fps" else int(sfps_txt)
            ok = self.preview.start_streaming(
                url, self._rec_fps, bitrate, preset, encoder, stream_fps)
            if ok:
                self._live_btn.setText("⏹  End Stream")
                self._streaming_controls(False)
                self._status.setText(
                    f"🔴  Live → {url[:50]}{'…' if len(url) > 50 else ''}")
                self._stream_timer = QTimer()
                self._stream_timer.timeout.connect(self._check_stream_health)
                self._stream_timer.start(2000)
            else:
                err = self.preview._streamer.error if self.preview._streamer else "unknown"
                self._live_btn.setChecked(False)
                self._status.setText(f"⚠  Stream failed: {err}")
        else:
            if hasattr(self, "_stream_timer"):
                self._stream_timer.stop()
            self.preview.stop_streaming()
            self._live_btn.setText("▶  Go Live")
            self._streaming_controls(True)
            self._status.setText("Stream ended.")

    def _check_stream_health(self):
        """Detect if FFmpeg died unexpectedly and reset the UI."""
        if self.preview._streamer and not self.preview._streamer.alive():
            err = self.preview._streamer.error or "FFmpeg exited unexpectedly"
            self._stream_timer.stop()
            self.preview.stop_streaming()
            self._live_btn.setChecked(False)
            self._live_btn.setText("▶  Go Live")
            self._streaming_controls(True)
            self._status.setText(f"⚠  Stream stopped: {err[:80]}")

    # ── recording / screenshot ────────────────────────────────────────────────

    def _toggle_recording(self, on: bool):
        if on:
            path, _ = QFileDialog.getSaveFileName(
                self, "Save Recording As",
                f"rec_{datetime.now():%Y%m%d_%H%M%S}.mp4",
                "MP4 Video (*.mp4)")
            if not path:
                self._rec_btn.setChecked(False)
                return
            ok = self.preview.start_recording(path, self._rec_fps)
            if ok:
                self._rec_btn.setText("⏹  Stop Recording")
                self._status.setText(f"🔴  Recording → {Path(path).name}")
            else:
                self._rec_btn.setChecked(False)
                self._status.setText("⚠  Could not start recording")
        else:
            self.preview.stop_recording()
            self._rec_btn.setText("⏺  Record")
            self._status.setText("Recording saved.")

    def _take_screenshot(self):
        img = self.preview.snapshot()
        if img is None:
            return
        path, _ = QFileDialog.getSaveFileName(
            self, "Save Screenshot",
            f"shot_{datetime.now():%Y%m%d_%H%M%S}.png",
            "PNG (*.png);;JPEG (*.jpg)")
        if path:
            img.save(path)
            self._status.setText(f"Screenshot saved → {Path(path).name}")

    # ── cleanup ────────────────────────────────────────────────────────────────

    def closeEvent(self, e):
        self.preview.stop_streaming()
        self.preview.stop_recording()
        self._cam.stop()
        e.accept()


# ─── Entry point ───────────────────────────────────────────────────────────────

def main():
    app = QApplication(sys.argv)
    app.setStyle("Fusion")
    app.setApplicationName("WebcamStudio")
    win = MainWindow()
    win.show()
    sys.exit(app.exec())


if __name__ == "__main__":
    main()
