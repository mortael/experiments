#!/usr/bin/env python3
"""StreamLite: a slim RTMP webcam streamer with simple scene switching."""
from __future__ import annotations

import argparse
import json
import signal
import subprocess
import sys
import threading
from dataclasses import dataclass, field
from pathlib import Path
from typing import Dict, List, Optional


@dataclass
class Overlay:
    type: str
    enabled: bool = True
    x: int = 20
    y: int = 20
    width: int = 320
    height: int = 80
    text_file: Optional[str] = None
    gif_path: Optional[str] = None
    font_size: int = 28


@dataclass
class Scene:
    name: str
    animation: str = "none"
    overlays: List[Overlay] = field(default_factory=list)


@dataclass
class AppConfig:
    rtmp_url: str
    webcam: str = "/dev/video0"
    width: int = 1280
    height: int = 720
    fps: int = 30
    audio_device: Optional[str] = None
    scenes: List[Scene] = field(default_factory=list)


class SceneComposer:
    def __init__(self, config: AppConfig):
        self.config = config

    def _base_animation(self, animation: str) -> str:
        if animation == "pulse_frame":
            return (
                "drawbox=x=0:y=0:w=iw:h=ih:color=black@0.0:t=fill,"
                "drawbox=x=0:y=0:w=iw:h=6:color=0x31D0FF@0.85:t=fill,"
                "drawbox=x=0:y=ih-6:w=iw:h=6:color=0x31D0FF@0.85:t=fill,"
                "eq=brightness='0.03*sin(2*PI*t/2)'"
            )
        if animation == "slide_lower_third":
            return (
                "drawbox=x='max(iw-900, iw-(t*650))':y=ih-130:w=880:h=90:"
                "color=0x111111@0.55:t=fill"
            )
        return "null"

    def build_filter_complex(self, scene: Scene) -> str:
        graph: List[str] = [f"[0:v]scale={self.config.width}:{self.config.height},format=yuv420p[base]"]
        graph.append(f"[base]{self._base_animation(scene.animation)}[v0]")

        last_label = "v0"
        input_index = 1

        for overlay in scene.overlays:
            if not overlay.enabled:
                continue
            if overlay.type == "now_playing" and overlay.text_file:
                draw = (
                    f"[{last_label}]drawbox=x={overlay.x-12}:y={overlay.y-8}:"
                    f"w={overlay.width}:h={overlay.height}:color=0x000000@0.45:t=fill,"
                    f"drawtext=textfile='{overlay.text_file}':reload=1:"
                    f"fontcolor=white:fontsize={overlay.font_size}:"
                    f"x={overlay.x}:y={overlay.y + 12}[v{input_index}]"
                )
                graph.append(draw)
                last_label = f"v{input_index}"
                input_index += 1
            elif overlay.type == "gif" and overlay.gif_path:
                graph.append(f"[{input_index}:v]fps={self.config.fps},scale=200:-1[gif{input_index}]")
                graph.append(
                    f"[{last_label}][gif{input_index}]overlay={overlay.x}:{overlay.y}:shortest=1[v{input_index}]"
                )
                last_label = f"v{input_index}"
                input_index += 1

        graph.append(f"[{last_label}]format=yuv420p[outv]")
        return ";".join(graph)

    def ffmpeg_command(self, scene: Scene) -> List[str]:
        cmd = [
            "ffmpeg",
            "-hide_banner",
            "-loglevel",
            "warning",
            "-thread_queue_size",
            "512",
            "-f",
            "v4l2",
            "-framerate",
            str(self.config.fps),
            "-video_size",
            f"{self.config.width}x{self.config.height}",
            "-i",
            self.config.webcam,
        ]

        for overlay in scene.overlays:
            if overlay.enabled and overlay.type == "gif" and overlay.gif_path:
                cmd += ["-stream_loop", "-1", "-ignore_loop", "0", "-i", overlay.gif_path]

        if self.config.audio_device:
            cmd += ["-f", "alsa", "-thread_queue_size", "512", "-i", self.config.audio_device]

        cmd += [
            "-filter_complex",
            self.build_filter_complex(scene),
            "-map",
            "[outv]",
        ]

        if self.config.audio_device:
            cmd += ["-map", f"{1 + self._gif_count(scene)}:a"]
        else:
            cmd += ["-f", "lavfi", "-i", "anullsrc", "-shortest", "-map", "1:a"]

        cmd += [
            "-c:v",
            "libx264",
            "-preset",
            "veryfast",
            "-tune",
            "zerolatency",
            "-pix_fmt",
            "yuv420p",
            "-g",
            str(self.config.fps * 2),
            "-b:v",
            "3000k",
            "-maxrate",
            "3200k",
            "-bufsize",
            "6000k",
            "-c:a",
            "aac",
            "-b:a",
            "128k",
            "-f",
            "flv",
            self.config.rtmp_url,
        ]
        return cmd

    @staticmethod
    def _gif_count(scene: Scene) -> int:
        return sum(1 for o in scene.overlays if o.enabled and o.type == "gif" and o.gif_path)


class StreamEngine:
    def __init__(self, config: AppConfig):
        self.config = config
        self.scenes: Dict[str, Scene] = {s.name: s for s in config.scenes}
        self.composer = SceneComposer(config)
        self.process: Optional[subprocess.Popen[str]] = None
        self.current_scene: Optional[str] = None
        self._lock = threading.Lock()

    def start(self, scene_name: str) -> None:
        if scene_name not in self.scenes:
            raise ValueError(f"Scene not found: {scene_name}")
        with self._lock:
            self._start_process(self.scenes[scene_name])
            self.current_scene = scene_name

    def switch(self, scene_name: str) -> None:
        if scene_name not in self.scenes:
            raise ValueError(f"Scene not found: {scene_name}")
        with self._lock:
            self._stop_process()
            self._start_process(self.scenes[scene_name])
            self.current_scene = scene_name

    def stop(self) -> None:
        with self._lock:
            self._stop_process()
            self.current_scene = None

    def _start_process(self, scene: Scene) -> None:
        cmd = self.composer.ffmpeg_command(scene)
        self.process = subprocess.Popen(cmd)

    def _stop_process(self) -> None:
        if not self.process:
            return
        self.process.terminate()
        try:
            self.process.wait(timeout=2)
        except subprocess.TimeoutExpired:
            self.process.kill()
        self.process = None


def load_config(path: Path) -> AppConfig:
    data = json.loads(path.read_text())
    scenes = [
        Scene(
            name=s["name"],
            animation=s.get("animation", "none"),
            overlays=[Overlay(**o) for o in s.get("overlays", [])],
        )
        for s in data.get("scenes", [])
    ]
    return AppConfig(
        rtmp_url=data["rtmp_url"],
        webcam=data.get("webcam", "/dev/video0"),
        width=data.get("width", 1280),
        height=data.get("height", 720),
        fps=data.get("fps", 30),
        audio_device=data.get("audio_device"),
        scenes=scenes,
    )


def interactive_loop(engine: StreamEngine, now_playing_file: Optional[Path]) -> None:
    print("\nStreamLite controls:")
    for i, scene_name in enumerate(engine.scenes.keys(), start=1):
        print(f"  {i}: switch to {scene_name}")
    print("  n: update now playing text")
    print("  q: quit\n")

    scene_names = list(engine.scenes.keys())

    while True:
        cmd = input("streamlite> ").strip()
        if cmd == "q":
            return
        if cmd == "n" and now_playing_file:
            text = input("Now playing: ").strip()
            now_playing_file.write_text(text + "\n")
            print("Updated now playing overlay")
            continue
        if cmd.isdigit():
            idx = int(cmd) - 1
            if 0 <= idx < len(scene_names):
                scene = scene_names[idx]
                print(f"Switching to {scene}...")
                engine.switch(scene)
                continue
        print("Unknown command")


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description="Slim RTMP webcam streamer with scene switching")
    parser.add_argument("--config", default="streamlite.example.json", help="Path to config JSON")
    parser.add_argument("--scene", default=None, help="Initial scene name")
    return parser.parse_args()


def main() -> int:
    args = parse_args()
    config = load_config(Path(args.config))
    if not config.scenes:
        print("Config has no scenes", file=sys.stderr)
        return 1

    initial = args.scene or config.scenes[0].name
    now_playing_file = None
    for overlay in config.scenes[0].overlays:
        if overlay.type == "now_playing" and overlay.text_file:
            now_playing_file = Path(overlay.text_file)
            now_playing_file.parent.mkdir(parents=True, exist_ok=True)
            if not now_playing_file.exists():
                now_playing_file.write_text("Now Playing\n")
            break

    engine = StreamEngine(config)

    def _shutdown(_signum: int, _frame: object) -> None:
        engine.stop()
        sys.exit(0)

    signal.signal(signal.SIGINT, _shutdown)
    signal.signal(signal.SIGTERM, _shutdown)

    print(f"Starting stream on scene: {initial}")
    engine.start(initial)

    try:
        interactive_loop(engine, now_playing_file)
    finally:
        engine.stop()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
