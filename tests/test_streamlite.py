import sys
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[1]))

from streamlite import AppConfig, Overlay, Scene, SceneComposer


def test_filter_includes_animated_scene_and_now_playing():
    config = AppConfig(
        rtmp_url="rtmp://example/live/key",
        scenes=[],
    )
    scene = Scene(
        name="pulse",
        animation="pulse_frame",
        overlays=[Overlay(type="now_playing", text_file="./state/now_playing.txt")],
    )
    graph = SceneComposer(config).build_filter_complex(scene)
    assert "drawtext=textfile='./state/now_playing.txt':reload=1" in graph
    assert "eq=brightness='0.03*sin(2*PI*t/2)'" in graph


def test_command_contains_gif_input_and_rtmp_output():
    config = AppConfig(
        rtmp_url="rtmp://example/live/key",
        audio_device="default",
        scenes=[],
    )
    scene = Scene(
        name="with-gif",
        overlays=[Overlay(type="gif", gif_path="./assets/hype.gif")],
    )
    cmd = SceneComposer(config).ffmpeg_command(scene)
    joined = " ".join(cmd)
    assert "-stream_loop -1 -ignore_loop 0 -i ./assets/hype.gif" in joined
    assert "-f flv rtmp://example/live/key" in joined
