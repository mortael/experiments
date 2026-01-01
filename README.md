# Offline Pattern Generator

This project is a React + TypeScript single-page interface for generating deterministic genre-based patterns with offline-first support.

## Features
- Genre-aware pattern generator with seeded PRNG for repeatable results.
- Controls for genre, BPM, bars (1–16), time signature, swing, complexity, key/scale with lock, seed lock/randomize, and per-track toggles/presets.
- Humanize ranges for timing and velocity.
- Tracks for Drums, Bass, Chords/Pad, Lead, Arp, and FX hits, plus motif-based lead and chord progressions.
- Grid/piano-roll previews and WebAudio playback (drum sampler + subtractive synth) with loop, metronome, start/stop, and master volume.
- Export combined or per-track MIDI via `@tonejs/midi`, plus JSON recipe import/export.
- Responsive styling with lightweight assets, manifest, and service worker for offline use.

## Getting started
1. Install dependencies (requires npm registry access):
   ```bash
   npm install
   ```
2. Run the dev server:
   ```bash
   npm run dev
   ```
3. Build for production:
   ```bash
   npm run build
   npm run preview
   ```

If you are behind a proxy, configure npm appropriately so packages such as `react`, `@vitejs/plugin-react`, and `@tonejs/midi` can be installed.

## Usage
- Adjust generator controls in the left column, toggle tracks, and pick presets per genre.
- Click **Generate MIDI** to refresh the deterministic pattern and use **Play/Stop** to audition it.
- Export MIDI (combined or per track) from the Export & Presets panel; copy or import recipe JSON to recreate patterns.
- Enable offline installation via the browser prompt; the service worker caches the shell so the UI remains available offline.
