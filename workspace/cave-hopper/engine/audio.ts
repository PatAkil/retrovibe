// audio.ts — WebAudio chiptune synth. Zero asset files; every sound is
// generated from oscillators/noise on the fly.
//
// Autoplay policy is handled BY DESIGN: the AudioContext is NOT created at
// module load. It is created/resumed lazily inside unlock(), which input.ts
// calls from the first keydown (the TITLE→PLAYING keypress — the documented
// unlock point). play() before unlock() is a silent no-op.

export type Sfx = 'jump' | 'pickup' | 'explosion' | 'hit' | 'blip';

export interface Audio {
  readonly ready: boolean;
  /** Create/resume the AudioContext. MUST be called inside a user gesture. */
  unlock(): void;
  play(sfx: Sfx): void;
}

type Ctx = AudioContext;

export function createAudio(): Audio {
  let ctx: Ctx | null = null;
  let master: GainNode | null = null;

  function tone(
    freq: number,
    dur: number,
    type: OscillatorType,
    when = 0,
    vol = 0.18,
    endFreq?: number,
  ): void {
    if (!ctx || !master) return;
    const t0 = ctx.currentTime + when;
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, t0);
    if (endFreq) osc.frequency.exponentialRampToValueAtTime(Math.max(1, endFreq), t0 + dur);
    g.gain.setValueAtTime(vol, t0);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    osc.connect(g).connect(master);
    osc.start(t0);
    osc.stop(t0 + dur);
  }

  function noise(dur: number, vol = 0.3): void {
    if (!ctx || !master) return;
    const t0 = ctx.currentTime;
    const buf = ctx.createBuffer(1, Math.max(1, Math.floor(ctx.sampleRate * dur)), ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    const src = ctx.createBufferSource();
    src.buffer = buf;
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

  return {
    get ready() {
      return ctx !== null && ctx.state === 'running';
    },
    unlock() {
      try {
        if (!ctx) {
          ctx = new AudioContext();
          master = ctx.createGain();
          master.gain.value = 0.35;
          master.connect(ctx.destination);
        }
        if (ctx.state === 'suspended') void ctx.resume();
      } catch {
        ctx = null;
        master = null;
      }
    },
    play(sfx) {
      if (!ctx || ctx.state !== 'running') return;
      switch (sfx) {
        case 'jump':
          tone(220, 0.16, 'square', 0, 0.16, 660);
          break;
        case 'pickup':
          tone(660, 0.08, 'triangle', 0, 0.2);
          tone(990, 0.1, 'triangle', 0.07, 0.2);
          break;
        case 'explosion':
          noise(0.45, 0.35);
          tone(90, 0.4, 'sawtooth', 0, 0.2, 30);
          break;
        case 'hit':
          tone(300, 0.14, 'square', 0, 0.2, 90);
          break;
        case 'blip':
          tone(880, 0.05, 'square', 0, 0.12);
          break;
      }
    },
  };
}
