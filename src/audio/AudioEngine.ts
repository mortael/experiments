import { PatternBundle, TrackPattern } from '../lib/types';

interface Scheduled {
  cancel: () => void;
}

export class AudioEngine {
  private context: AudioContext | null = null;
  private masterGain: GainNode | null = null;
  private isPlaying = false;
  private loop = true;
  private metronome = false;
  private bpm = 128;
  private scheduler: Scheduled[] = [];

  ensureContext() {
    if (!this.context) {
      this.context = new AudioContext();
      this.masterGain = this.context.createGain();
      this.masterGain.gain.value = 0.8;
      this.masterGain.connect(this.context.destination);
    }
    return this.context!;
  }

  setVolume(value: number) {
    if (this.masterGain) this.masterGain.gain.value = value;
  }

  setLoop(loop: boolean) {
    this.loop = loop;
  }

  setMetronome(enabled: boolean) {
    this.metronome = enabled;
  }

  async start(bundle: PatternBundle) {
    const ctx = this.ensureContext();
    await ctx.resume();
    this.stop();
    this.bpm = bundle.recipe.bpm;
    const beat = 60 / this.bpm;
    const loopLength = bundle.recipe.bars * 4 * beat;
    const startTime = ctx.currentTime + 0.05;

    const scheduleTrack = (track: TrackPattern) => {
      track.notes.forEach((note) => {
        const time = startTime + note.time * beat;
        this.scheduleSynth(ctx, time, note, track.name);
      });
    };

    bundle.tracks.forEach((t) => scheduleTrack(t));

    if (this.metronome) {
      for (let i = 0; i < bundle.recipe.bars * 4; i++) {
        const time = startTime + i * beat;
        this.scheduler.push(this.tick(time));
      }
    }

    if (this.loop) {
      const loopEvent = setInterval(() => this.start(bundle), loopLength * 1000);
      this.scheduler.push({ cancel: () => clearInterval(loopEvent) });
    }

    this.isPlaying = true;
  }

  stop() {
    this.scheduler.forEach((s) => s.cancel());
    this.scheduler = [];
    this.isPlaying = false;
  }

  private tick(time: number): Scheduled {
    const ctx = this.ensureContext();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.frequency.value = 880;
    gain.gain.value = 0.15;
    osc.connect(gain).connect(this.masterGain!);
    osc.start(time);
    osc.stop(time + 0.05);
    return { cancel: () => osc.disconnect() };
  }

  private scheduleSynth(ctx: AudioContext, time: number, note: { midi: number; duration: number; velocity: number }, track: string) {
    const isDrum = track === 'Drums' || track === 'FX Hits';
    if (isDrum) {
      this.scheduleDrum(ctx, time, note, track);
      return;
    }
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';
    filter.frequency.value = track === 'Bass' ? 600 : 1800;
    osc.type = 'sawtooth';
    osc.frequency.value = 440 * Math.pow(2, (note.midi - 69) / 12);
    gain.gain.value = note.velocity * 0.35;
    osc.connect(filter).connect(gain).connect(this.masterGain!);
    osc.start(time);
    osc.stop(time + note.duration * (60 / this.bpm));
    this.scheduler.push({ cancel: () => osc.disconnect() });
  }

  private scheduleDrum(ctx: AudioContext, time: number, note: { midi: number; duration: number; velocity: number }, track: string) {
    const gain = ctx.createGain();
    gain.gain.value = note.velocity * 0.8;
    gain.connect(this.masterGain!);
    if (note.midi === 36) {
      const osc = ctx.createOscillator();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(120, time);
      osc.frequency.exponentialRampToValueAtTime(40, time + 0.2);
      osc.connect(gain);
      osc.start(time);
      osc.stop(time + 0.25);
      this.scheduler.push({ cancel: () => osc.disconnect() });
    } else {
      const buffer = ctx.createBuffer(1, ctx.sampleRate * 0.2, ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < data.length; i++) {
        data[i] = (Math.random() * 2 - 1) * Math.exp(-i / (data.length / 6));
      }
      const noise = ctx.createBufferSource();
      noise.buffer = buffer;
      const filter = ctx.createBiquadFilter();
      filter.type = note.midi === 42 ? 'highpass' : 'bandpass';
      filter.frequency.value = note.midi === 42 ? 8000 : 2500;
      noise.connect(filter).connect(gain);
      noise.start(time);
      noise.stop(time + 0.2);
      this.scheduler.push({ cancel: () => noise.disconnect() });
    }
  }
}
