# StreamLite

StreamLite is a tiny Python + FFmpeg streaming tool built for low-overhead webcam streaming to a custom RTMP server.

It gives you:
- Scene switching (1/2/3 hotkeys in the terminal)
- Built-in animated scene presets (`pulse_frame`, `slide_lower_third`)
- A `now playing` text overlay you can update live
- Optional GIF overlay in any scene

## Requirements

- Python 3.10+
- `ffmpeg` installed on your machine
- A webcam device (`/dev/video0` by default)

## Quick start

```bash
cp streamlite.example.json streamlite.json
mkdir -p state
printf 'Now Playing\n' > state/now_playing.txt
python3 streamlite.py --config streamlite.json
```

Then use terminal commands while streaming:
- `1`, `2`, `3` switch scenes quickly
- `n` updates the now-playing line
- `q` quits

## Notes on low memory / speed

- Runs a single FFmpeg process for active streaming.
- Uses `libx264` + `veryfast` + `zerolatency` settings for low latency and moderate CPU use.
- Keeps overlays in a single `filter_complex` graph.

## Customize scenes

Edit `streamlite.json` and tweak:
- `animation`: `none`, `pulse_frame`, `slide_lower_third`
- `now_playing` overlay coordinates and style
- `gif` overlay path and position

You can create extra scenes and they will automatically map to more numeric keys in the terminal UI.
