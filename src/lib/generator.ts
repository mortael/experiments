import { mulberry32, stringToSeed } from './prng';
import { Genre, PatternBundle, PatternNote, PatternRecipe, TrackName, TrackPattern } from './types';

const SCALE_INTERVALS: Record<string, number[]> = {
  Major: [0, 2, 4, 5, 7, 9, 11],
  Minor: [0, 2, 3, 5, 7, 8, 10],
  Dorian: [0, 2, 3, 5, 7, 9, 10],
  Phrygian: [0, 1, 3, 5, 7, 8, 10],
  Mixolydian: [0, 2, 4, 5, 7, 9, 10]
};

const GENRE_PRESETS: Record<Genre, string[]> = {
  DnB: ['Roller', 'Neuro Stab', 'Liquid Pad'],
  Hardcore: ['Rave Stabs', 'Donk Bass', 'Hoover'],
  Neurofunk: ['Snarl', 'Reese', 'Machine'],
  Techno: ['Warehouse', 'Detroit', 'Minimal']
};

const CHORD_PROGRESSIONS: number[][] = [
  [0, 5, 3, 4],
  [0, 3, 4, 5],
  [0, 4, 5, 3],
  [0, 2, 5, 4]
];

function clamp(num: number, min: number, max: number) {
  return Math.min(max, Math.max(min, num));
}

function midiFor(scaleRoot: string, scale: string, degree: number, octave = 4) {
  const rootOffset = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'].indexOf(scaleRoot);
  const intervals = SCALE_INTERVALS[scale] || SCALE_INTERVALS.Major;
  const interval = intervals[degree % intervals.length] + 12 * Math.floor(degree / intervals.length);
  return 12 * octave + rootOffset + interval;
}

function addHumanize(note: PatternNote, random: () => number, timingRange: number, velocityRange: number) {
  const jitter = (random() * 2 - 1) * timingRange;
  const velJitter = (random() * 2 - 1) * velocityRange;
  return {
    ...note,
    time: note.time + jitter,
    velocity: clamp(note.velocity + velJitter, 0.1, 1)
  };
}

function applySwing(note: PatternNote, swing: number) {
  const eighthIndex = Math.round(note.time / 0.5);
  if (eighthIndex % 2 === 1) {
    return { ...note, time: note.time + swing };
  }
  return note;
}

function motif(random: () => number, length: number, scaleRoot: string, scale: string) {
  const notes: number[] = [];
  let current = Math.floor(random() * 5);
  for (let i = 0; i < length; i++) {
    const step = Math.floor(random() * 3) - 1;
    current = clamp(current + step, 0, 6);
    notes.push(midiFor(scaleRoot, scale, current, 5));
  }
  return notes;
}

export function generatePattern(recipe: PatternRecipe): PatternBundle {
  const seed = stringToSeed(recipe.seed);
  const random = mulberry32(seed);
  const totalBeats = recipe.bars * (parseInt(recipe.timeSignature.split('/')[0]) || 4);

  const tracks: TrackPattern[] = [];
  const progression = recipe.scaleLock
    ? CHORD_PROGRESSIONS[0]
    : CHORD_PROGRESSIONS[Math.floor(random() * CHORD_PROGRESSIONS.length)];

  const drumPreset = GENRE_PRESETS[recipe.genre][0];
  const bassPreset = GENRE_PRESETS[recipe.genre][1] || 'Bass';

  // Drums
  if (recipe.tracks['Drums']) {
    const notes: PatternNote[] = [];
    for (let bar = 0; bar < recipe.bars; bar++) {
      const barStart = bar * 4;
      notes.push({ time: barStart, duration: 0.5, velocity: 1, midi: 36 });
      notes.push({ time: barStart + 2, duration: 0.5, velocity: 0.85, midi: 38 });
      for (let h = 0; h < 4; h++) {
        if (random() < 0.95) {
          notes.push({ time: barStart + h, duration: 0.25, velocity: 0.6 + random() * 0.2, midi: 42 });
        }
      }
    }
    tracks.push({ name: 'Drums', enabled: true, preset: drumPreset, notes });
  }

  // Bass
  if (recipe.tracks['Bass']) {
    const notes: PatternNote[] = [];
    for (let bar = 0; bar < recipe.bars; bar++) {
      const degree = progression[bar % progression.length];
      const baseMidi = midiFor(recipe.key, recipe.scale, degree, 3);
      for (let beat = 0; beat < 4; beat++) {
        if (random() < recipe.complexity) {
          notes.push({
            time: bar * 4 + beat,
            duration: 0.75,
            velocity: 0.9,
            midi: baseMidi + (random() > 0.8 ? 12 : 0)
          });
        }
      }
    }
    tracks.push({ name: 'Bass', enabled: true, preset: bassPreset, notes });
  }

  // Chords/Pad
  if (recipe.tracks['Chords']) {
    const notes: PatternNote[] = [];
    for (let bar = 0; bar < recipe.bars; bar++) {
      const degree = progression[bar % progression.length];
      const root = midiFor(recipe.key, recipe.scale, degree, 4);
      const third = midiFor(recipe.key, recipe.scale, degree + 2, 4);
      const fifth = midiFor(recipe.key, recipe.scale, degree + 4, 4);
      notes.push({ time: bar * 4, duration: 4, velocity: 0.7, midi: root });
      notes.push({ time: bar * 4, duration: 4, velocity: 0.65, midi: third });
      notes.push({ time: bar * 4, duration: 4, velocity: 0.65, midi: fifth });
    }
    tracks.push({ name: 'Chords', enabled: true, preset: GENRE_PRESETS[recipe.genre][2] || 'Pad', notes });
  }

  // Lead motif
  if (recipe.tracks['Lead']) {
    const notes: PatternNote[] = [];
    const baseMotif = motif(random, 8, recipe.key, recipe.scale);
    for (let i = 0; i < baseMotif.length; i++) {
      notes.push({
        time: (i * totalBeats) / baseMotif.length,
        duration: 0.5,
        velocity: 0.8,
        midi: baseMotif[i]
      });
    }
    tracks.push({ name: 'Lead', enabled: true, preset: 'Lead', notes });
  }

  // Arp
  if (recipe.tracks['Arp']) {
    const notes: PatternNote[] = [];
    for (let bar = 0; bar < recipe.bars; bar++) {
      const degree = progression[bar % progression.length];
      for (let step = 0; step < 8; step++) {
        const midi = midiFor(recipe.key, recipe.scale, degree + step % 3, 5);
        notes.push({
          time: bar * 4 + step * 0.5,
          duration: 0.45,
          velocity: 0.5 + recipe.complexity * 0.4,
          midi
        });
      }
    }
    tracks.push({ name: 'Arp', enabled: true, preset: 'Arp', notes });
  }

  // FX
  if (recipe.tracks['FX Hits']) {
    const notes: PatternNote[] = [];
    for (let bar = 0; bar < recipe.bars; bar++) {
      if (random() < 0.5 + recipe.complexity * 0.3) {
        notes.push({ time: bar * 4 + random() * 3, duration: 0.2, velocity: 0.8, midi: 96 });
      }
    }
    tracks.push({ name: 'FX Hits', enabled: true, preset: 'FX', notes });
  }

  // humanize
  const humanized = tracks.map((track) => ({
    ...track,
    notes: track.notes.map((n) => addHumanize(applySwing(n, recipe.swing), random, recipe.humanizeTiming, recipe.humanizeVelocity))
  }));

  return { recipe, tracks: humanized };
}

export { GENRE_PRESETS, CHORD_PROGRESSIONS };
