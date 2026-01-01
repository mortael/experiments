import React, { useEffect, useMemo, useState } from 'react';
import { AudioEngine } from './audio/AudioEngine';
import { generatePattern, GENRE_PRESETS, CHORD_PROGRESSIONS } from './lib/generator';
import { exportCombined, exportSplitTracks } from './lib/midi';
import { mulberry32, stringToSeed } from './lib/prng';
import { Genre, PatternBundle, PatternRecipe, TrackName } from './lib/types';

const audio = new AudioEngine();

const TRACKS: TrackName[] = ['Drums', 'Bass', 'Chords', 'Lead', 'Arp', 'FX Hits'];
const KEYS = ['C', 'C#', 'D', 'D#', 'E', 'F', 'F#', 'G', 'G#', 'A', 'A#', 'B'];
const SCALES = ['Major', 'Minor', 'Dorian', 'Phrygian', 'Mixolydian'];

function download(filename: string, data: Uint8Array) {
  const blob = new Blob([data], { type: 'audio/midi' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

function GridPreview({ bundle }: { bundle: PatternBundle }) {
  const maxBeats = bundle.recipe.bars * 4;
  return (
    <div className="stack">
      {bundle.tracks.map((track) => (
        <div key={track.name} className="card">
          <div className="track-header">
            <div>{track.name}</div>
            <div className="badge">{track.preset}</div>
          </div>
          <div className="grid-preview" style={{ gridTemplateColumns: `repeat(${maxBeats * 2}, minmax(6px, 1fr))` }}>
            {new Array(maxBeats * 2).fill(0).map((_, idx) => {
              const beat = idx / 2;
              const active = track.notes.some((n) => beat >= n.time && beat <= n.time + n.duration);
              return <div key={idx} className={`grid-cell ${active ? 'active' : ''}`} />;
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function RecipeBox({ bundle, onImport }: { bundle: PatternBundle; onImport: (text: string) => void }) {
  const text = JSON.stringify(bundle.recipe, null, 2);
  return (
    <div className="panel">
      <div className="track-header">
        <h2>Export &amp; Presets</h2>
        <div className="badge">Offline-ready</div>
      </div>
      <div className="stack">
        <div className="row">
          <button className="action" onClick={() => download('pattern-combined.mid', exportCombined(bundle))}>Download Combined MIDI</button>
          <button
            onClick={() => {
              exportSplitTracks(bundle).forEach((t) => download(`${t.name}.mid`, t.data));
            }}
          >
            Download Each Track MIDI
          </button>
        </div>
        <div>
          <div className="track-header">
            <h3>Pattern Recipe</h3>
            <div className="row">
              <button onClick={() => navigator.clipboard.writeText(text)}>Copy Recipe</button>
              <button
                onClick={() => {
                  const incoming = prompt('Paste recipe JSON');
                  if (incoming) onImport(incoming);
                }}
              >
                Import Recipe
              </button>
            </div>
          </div>
          <div className="recipe-box">{text}</div>
        </div>
        <div>
          <h3>Curated Presets</h3>
          <div className="tab-row">
            {Object.keys(GENRE_PRESETS).map((g) => (
              <span key={g} className="tab">{g}</span>
            ))}
          </div>
          <p className="small">Pick a preset from the genre dropdowns to lock in drum/bass/pad flavors.</p>
        </div>
      </div>
    </div>
  );
}

export default function App() {
  const [genre, setGenre] = useState<Genre>('DnB');
  const [bpm, setBpm] = useState(174);
  const [bars, setBars] = useState(4);
  const [timeSignature, setTimeSignature] = useState('4/4');
  const [swing, setSwing] = useState(0);
  const [complexity, setComplexity] = useState(0.7);
  const [humanizeTiming, setHumanizeTiming] = useState(0.03);
  const [humanizeVelocity, setHumanizeVelocity] = useState(0.05);
  const [key, setKey] = useState('F');
  const [scale, setScale] = useState('Phrygian');
  const [scaleLock, setScaleLock] = useState(true);
  const [seed, setSeed] = useState('AX9X-' + Math.random().toString(16).slice(2, 8));
  const [tracks, setTracks] = useState<Record<TrackName, boolean>>({
    Drums: true,
    Bass: true,
    Chords: true,
    Lead: true,
    Arp: true,
    'FX Hits': true
  });
  const [presets, setPresets] = useState<Record<TrackName, string>>({
    Drums: GENRE_PRESETS[genre][0],
    Bass: GENRE_PRESETS[genre][1],
    Chords: GENRE_PRESETS[genre][2],
    Lead: 'Lead',
    Arp: 'Arp',
    'FX Hits': 'FX'
  });
  const [bundle, setBundle] = useState<PatternBundle>(() =>
    generatePattern({
      seed,
      bpm,
      bars,
      timeSignature,
      swing,
      complexity,
      humanizeTiming,
      humanizeVelocity,
      key,
      scale,
      scaleLock,
      genre,
      tracks
    })
  );
  const [masterVolume, setMasterVolume] = useState(0.8);
  const [loop, setLoop] = useState(true);
  const [metronome, setMetronome] = useState(false);

  useEffect(() => {
    regenerate();
  }, [bpm, bars, timeSignature, swing, complexity, humanizeTiming, humanizeVelocity, key, scale, scaleLock, genre, tracks]);

  const regenerate = (seedValue = seed) => {
    const recipe: PatternRecipe = {
      seed: seedValue,
      bpm,
      bars,
      timeSignature,
      swing,
      complexity,
      humanizeTiming,
      humanizeVelocity,
      key,
      scale,
      scaleLock,
      genre,
      tracks
    };
    const newBundle = generatePattern(recipe);
    const seeded = GENRE_PRESETS[genre];
    setPresets((prev) => ({ ...prev, Drums: seeded[0], Bass: seeded[1], Chords: seeded[2] }));
    setBundle(newBundle);
  };

  const handleImport = (text: string) => {
    try {
      const incoming = JSON.parse(text) as PatternRecipe;
      setSeed(incoming.seed);
      setBpm(incoming.bpm);
      setBars(incoming.bars);
      setTimeSignature(incoming.timeSignature);
      setSwing(incoming.swing);
      setComplexity(incoming.complexity);
      setHumanizeTiming(incoming.humanizeTiming);
      setHumanizeVelocity(incoming.humanizeVelocity);
      setKey(incoming.key);
      setScale(incoming.scale);
      setScaleLock(incoming.scaleLock);
      setGenre(incoming.genre);
      setTracks(incoming.tracks);
      setBundle(generatePattern(incoming));
    } catch (e) {
      alert('Invalid recipe');
    }
  };

  const randomizeSeed = () => {
    const nextSeed = Math.random().toString(36).slice(2, 10);
    setSeed(nextSeed);
    regenerate(nextSeed);
  };

  const lockSeed = () => regenerate(seed);

  const seedPreview = useMemo(() => {
    const rng = mulberry32(stringToSeed(seed));
    return '#'+Math.floor(rng()*999).toString().padStart(3,'0');
  }, [seed]);

  return (
    <main className="app-shell">
      <div className="panel stack">
        <div className="track-header">
          <div>
            <p className="small">Pattern {seedPreview}</p>
            <h2>Generator</h2>
          </div>
          <div className="row">
            <button onClick={() => audio.start(bundle)} className="action">Play</button>
            <button onClick={() => audio.stop()}>Stop</button>
          </div>
        </div>

        <div className="tab-row">
          {(['DnB', 'Hardcore', 'Neurofunk', 'Techno'] as Genre[]).map((g) => (
            <button key={g} className={`tab ${genre === g ? 'active' : ''}`} onClick={() => { setGenre(g); regenerate(); }}>
              {g}
            </button>
          ))}
        </div>

        <div className="controls-row">
          <div>
            <label>Tempo</label>
            <input type="number" value={bpm} onChange={(e) => setBpm(parseInt(e.target.value) || 0)} min={60} max={200} />
          </div>
          <div>
            <label>Bars</label>
            <input type="number" value={bars} onChange={(e) => setBars(clampNumber(e.target.value, 1, 16))} />
          </div>
          <div>
            <label>Time Sig</label>
            <select value={timeSignature} onChange={(e) => setTimeSignature(e.target.value)}>
              {['4/4', '3/4', '6/8'].map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Swing</label>
            <input type="range" min={0} max={0.25} step={0.01} value={swing} onChange={(e) => setSwing(parseFloat(e.target.value))} />
          </div>
        </div>

        <div className="controls-row">
          <div>
            <label>Key</label>
            <select value={key} onChange={(e) => setKey(e.target.value)}>
              {KEYS.map((k) => (
                <option key={k}>{k}</option>
              ))}
            </select>
          </div>
          <div>
            <label>Scale</label>
            <select value={scale} onChange={(e) => setScale(e.target.value)}>
              {SCALES.map((s) => (
                <option key={s}>{s}</option>
              ))}
            </select>
          </div>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <label>Scale Lock</label>
            <input type="checkbox" checked={scaleLock} onChange={(e) => setScaleLock(e.target.checked)} />
          </div>
        </div>

        <div className="controls-row">
          <div>
            <label>Complexity</label>
            <input type="range" min={0} max={1} step={0.05} value={complexity} onChange={(e) => setComplexity(parseFloat(e.target.value))} />
          </div>
          <div>
            <label>Humanize Timing (beats)</label>
            <input type="range" min={0} max={0.1} step={0.005} value={humanizeTiming} onChange={(e) => setHumanizeTiming(parseFloat(e.target.value))} />
          </div>
          <div>
            <label>Humanize Velocity</label>
            <input type="range" min={0} max={0.3} step={0.01} value={humanizeVelocity} onChange={(e) => setHumanizeVelocity(parseFloat(e.target.value))} />
          </div>
        </div>

        <div className="controls-row">
          <div>
            <label>Seed</label>
            <input value={seed} onChange={(e) => setSeed(e.target.value)} />
          </div>
          <div className="row" style={{ alignItems: 'flex-end' }}>
            <button onClick={lockSeed}>Lock</button>
            <button onClick={randomizeSeed}>Randomize</button>
          </div>
        </div>

        <div className="card">
          <div className="track-header">
            <h3>Tracks</h3>
            <button onClick={() => regenerate()}>Generate MIDI</button>
          </div>
          <div className="stack">
            {TRACKS.map((t) => (
              <div key={t} className="controls-row">
                <div className="row">
                  <input type="checkbox" checked={tracks[t]} onChange={(e) => setTracks({ ...tracks, [t]: e.target.checked })} />
                  <strong>{t}</strong>
                </div>
                <select
                  value={presets[t] || ''}
                  onChange={(e) => setPresets({ ...presets, [t]: e.target.value })}
                >
                  {(GENRE_PRESETS[genre] || ['Default']).map((p) => (
                    <option key={p}>{p}</option>
                  ))}
                </select>
              </div>
            ))}
          </div>
        </div>

        <div className="card">
          <h3>Advanced Settings</h3>
          <div className="controls-row">
            <div>
              <label>Loop</label>
              <input type="checkbox" checked={loop} onChange={(e) => { setLoop(e.target.checked); audio.setLoop(e.target.checked); }} />
            </div>
            <div>
              <label>Metronome</label>
              <input type="checkbox" checked={metronome} onChange={(e) => { setMetronome(e.target.checked); audio.setMetronome(e.target.checked); }} />
            </div>
            <div>
              <label>Master Volume</label>
              <input type="range" min={0} max={1} step={0.01} value={masterVolume} onChange={(e) => { const v = parseFloat(e.target.value); setMasterVolume(v); audio.setVolume(v); }} />
            </div>
          </div>
        </div>

        <div className="card">
          <h3>Chord Progressions</h3>
          <div className="stack">
            {CHORD_PROGRESSIONS.map((prog, idx) => (
              <div key={idx} className="row">
                <span className="badge">Option {idx + 1}</span>
                <span className="small">{prog.map((p) => ['I', 'ii', 'iii', 'IV', 'V', 'vi', 'vii'][p] || 'I').join(' → ')}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="stack">
        <GridPreview bundle={bundle} />
        <RecipeBox bundle={bundle} onImport={handleImport} />
      </div>
    </main>
  );
}

function clampNumber(value: string, min: number, max: number) {
  const n = parseInt(value) || min;
  return Math.min(max, Math.max(min, n));
}
