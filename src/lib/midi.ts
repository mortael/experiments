import { Midi } from '@tonejs/midi';
import { PatternBundle, TrackPattern } from './types';

function trackToMidi(midi: Midi, track: TrackPattern, bpm: number) {
  const t = midi.addTrack();
  t.name = track.name;
  track.notes.forEach((note) => {
    t.addNote({
      midi: note.midi,
      time: note.time,
      duration: note.duration,
      velocity: note.velocity
    });
  });
  t.channel = 0;
  midi.header.setTempo(bpm);
}

export function exportCombined(bundle: PatternBundle) {
  const midi = new Midi();
  bundle.tracks.forEach((track) => trackToMidi(midi, track, bundle.recipe.bpm));
  return midi.toArray();
}

export function exportSplitTracks(bundle: PatternBundle) {
  return bundle.tracks.map((track) => {
    const midi = new Midi();
    trackToMidi(midi, track, bundle.recipe.bpm);
    return { name: track.name, data: midi.toArray() };
  });
}
