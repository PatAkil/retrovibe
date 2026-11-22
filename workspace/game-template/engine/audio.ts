export type Sfx = 'jump' | 'pickup' | 'explosion' | 'hit' | 'blip';

export interface Audio {
  readonly ready: boolean;
  unlock(): void;
  play(sfx: Sfx): void;
}

interface Voice {
  ctx: AudioContext;
  master: GainNode;
}

interface Tone {
  freq: number;
  dur: number;
  type: OscillatorType;
  when?: number;
  vol?: number;
  endFreq?: number;
}

function tone(v: Voice, t: Tone): void {
  const { ctx, master } = v;
  const { freq, dur, endFreq } = t;
  const t0 = ctx.currentTime + (t.when ?? 0);
  const osc = ctx.createOscillator();
  const g = ctx.createGain();
  osc.type = t.type;
  osc.frequency.setValueAtTime(freq, t0);
  if (endFreq) {osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t0 + dur);}
  g.gain.setValueAtTime(t.vol ?? 0.18, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(g).connect(master);
  osc.start(t0);
  osc.stop(t0 + dur);
}

function whiteNoise(ctx: AudioContext, dur: number): AudioBuffer {
  const buf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * dur)), ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) {data[i] = Math.random() * 2 - 1;}
  return buf;
}

function noise(v: Voice, dur: number, vol = 0.3): void {
  const { ctx, master } = v;
  const t0 = ctx.currentTime;
  const src = ctx.createBufferSource();
  src.buffer = whiteNoise(ctx, dur);
  const filter = ctx.createBiquadFilter();
  filter.type = 'lowpass';
  filter.frequency.setValueAtTime(1400, t0);
  filter.frequency.exponentialRampToValueAtTime(180, t0 + dur);
  const g = ctx.createGain();
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(filter).connect(g).connect(master);
  src.start(t0);
  src.stop(t0 + dur);
}

const SFX: Readonly<Record<Sfx, (v: Voice) => void>> = {
  jump: (v) => {
    tone(v, { freq: 220, dur: 0.16, type: 'square', vol: 0.16, endFreq: 660 });
  },
  pickup: (v) => {
    tone(v, { freq: 660, dur: 0.08, type: 'triangle', vol: 0.2 });
    tone(v, { freq: 990, dur: 0.1, type: 'triangle', when: 0.07, vol: 0.2 });
  },
  explosion: (v) => {
    noise(v, 0.45, 0.35);
    tone(v, { freq: 90, dur: 0.4, type: 'sawtooth', vol: 0.2, endFreq: 30 });
  },
  hit: (v) => {
    tone(v, { freq: 300, dur: 0.14, type: 'square', vol: 0.2, endFreq: 90 });
  },
  blip: (v) => {
    tone(v, { freq: 880, dur: 0.05, type: 'square', vol: 0.12 });
  },
};

function openVoice(): Voice {
  const ctx = new AudioContext();
  const master = ctx.createGain();
  master.gain.value = 0.35;
  master.connect(ctx.destination);
  return { ctx, master };
}

export function createAudio(): Audio {
  let voice: Voice | null = null;
  return {
    get ready() {
      return voice?.ctx.state === 'running';
    },
    unlock() {
      try {
        voice ??= openVoice();
        if (voice.ctx.state === 'suspended') {void voice.ctx.resume();}
      } catch {
        voice = null;
      }
    },
    play(sfx) {
      if (voice?.ctx.state !== 'running') {return;}
      SFX[sfx](voice);
    },
  };
}
