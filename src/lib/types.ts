export type Genre = 'DnB' | 'Hardcore' | 'Neurofunk' | 'Techno';
export type TrackName = 'Drums' | 'Bass' | 'Chords' | 'Lead' | 'Arp' | 'FX Hits';

export interface PatternNote {
  time: number; // quarter-note units
  duration: number;
  velocity: number;
  midi: number;
}

export interface TrackPattern {
  name: TrackName;
  enabled: boolean;
  preset: string;
  notes: PatternNote[];
}

export interface PatternRecipe {
  seed: string;
  bpm: number;
  bars: number;
  timeSignature: string;
  swing: number;
  complexity: number;
  humanizeTiming: number;
  humanizeVelocity: number;
  key: string;
  scale: string;
  scaleLock: boolean;
  genre: Genre;
  tracks: Record<TrackName, boolean>;
}

export interface PatternBundle {
  recipe: PatternRecipe;
  tracks: TrackPattern[];
}
