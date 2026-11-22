function vgInstallRandom() {
  let seed = 0x9e3779b9 | 0;
  Math.random = () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function vgInstallClock() {
  let now = 0;
  let queue = [];
  window.performance.now = () => now;
  window.requestAnimationFrame = (cb) => {
    queue.push(cb);
    return queue.length;
  };
  window.cancelAnimationFrame = () => undefined;
  window.__step = () => {
    now += 1000 / 60;
    const cbs = queue;
    queue = [];
    for (const cb of cbs) {
      cb(now);
    }
  };
}

function vgInert() {
  const noop = () => undefined;
  const param = () => ({ value: 0, setValueAtTime: noop, linearRampToValueAtTime: noop, exponentialRampToValueAtTime: noop });
  const node = { gain: param(), frequency: param(), disconnect: noop, start: noop, stop: noop };
  node.connect = () => node;
  return node;
}

function vgInstallSilentAudio() {
  class SilentAudioContext {
    constructor() {
      this.state = 'suspended';
      this.currentTime = 0;
      this.sampleRate = 48000;
      this.destination = vgInert();
    }
    resume() { return Promise.resolve(); }
    createGain() { return vgInert(); }
    createOscillator() { return vgInert(); }
    createBiquadFilter() { return vgInert(); }
    createBufferSource() { return Object.assign(vgInert(), { buffer: null }); }
    createBuffer(_channels, length) { return { getChannelData: () => new Float32Array(length) }; }
  }
  window.AudioContext = SilentAudioContext;
  window.webkitAudioContext = SilentAudioContext;
}

function vgInstallEventLog() {
  window.__events = [];
  window.addEventListener('retrovibe', (e) => {
    const m = e.detail;
    if (m && typeof m === 'object') {
      window.__events.push({ type: m.type, state: m.payload?.state, won: m.payload?.won });
    }
  });
}

function vgRing(canvas, size) {
  const ring = [];
  for (let i = 0; i < size; i++) {
    const c = document.createElement('canvas');
    c.width = canvas.width;
    c.height = canvas.height;
    ring.push(c);
  }
  let head = 0;
  return {
    snapshot: () => {
      ring[head % size].getContext('2d').drawImage(canvas, 0, 0);
      head++;
    },
    back: (k) => ring[(head - 1 - k + size * 4) % size].toDataURL('image/png'),
  };
}

function vgLumProbe(canvas) {
  const probe = document.createElement('canvas');
  probe.width = Math.max(1, Math.floor(canvas.width / 10));
  probe.height = Math.max(1, Math.floor(canvas.height / 10));
  const pctx = probe.getContext('2d', { willReadFrequently: true });
  return () => {
    pctx.drawImage(canvas, 0, 0, probe.width, probe.height);
    const d = pctx.getImageData(0, 0, probe.width, probe.height).data;
    let sum = 0;
    for (let i = 0; i < d.length; i += 4) {
      sum += 0.2126 * d[i] + 0.7152 * d[i + 1] + 0.0722 * d[i + 2];
    }
    return sum / (d.length / 4) / 255;
  };
}

function vgState(run, ringSize) {
  const canvas = document.querySelector('canvas');
  return {
    run, canvas,
    ring: vgRing(canvas, ringSize),
    meanLum: vgLumProbe(canvas),
    shots: {},
    scored: false,
    events: [...run.events].sort((a, b) => a.at - b.at),
    ei: 0,
    scoreAt: -1, endAt: -1, winAt: -1, impactAt: -1,
    stopAt: run.stopAt ?? -1,
    sweepFrom: run.sweepFrom ?? -1,
    prevLum: -1,
    terminal: null,
    frames: 0,
  };
}

function vgDispatch(st, frame) {
  while (st.ei < st.events.length && st.events[st.ei].at === frame) {
    const ev = st.events[st.ei++];
    if (st.terminal && ev.type === 'down') {
      continue;
    }
    const type = ev.type === 'down' ? 'keydown' : 'keyup';
    window.dispatchEvent(new window.KeyboardEvent(type, { code: ev.key, bubbles: true }));
  }
}

function vgOnMessage(st, ev, frame) {
  if (ev.type === 'scoreChanged' && !st.scored) {
    st.scored = true;
    st.scoreAt = frame + 2;
  }
  const ending = ev.type === 'stateChanged' && (ev.state === 'GAME_OVER' || ev.state === 'WIN');
  if (!ending || st.terminal) {
    return;
  }
  st.terminal = ev.state;
  if (ev.state === 'GAME_OVER') {
    st.shots.impact = st.ring.back(1);
    st.endAt = frame + 30;
  } else {
    st.winAt = frame + 30;
  }
}

function vgSweep(st, frame) {
  if (!(st.sweepFrom > 0 && frame >= st.sweepFrom && !st.shots.impact && st.impactAt < 0)) {
    return;
  }
  const lum = st.meanLum();
  if (st.prevLum >= 0 && lum - st.prevLum > 0.12) {
    st.impactAt = frame + 4;
  }
  st.prevLum = lum;
}

function vgShoot(st, frame) {
  const grab = () => st.canvas.toDataURL('image/png');
  if (frame === st.impactAt && !st.shots.impact) {
    st.shots.impact = grab();
  }
  if (frame === st.scoreAt) {
    st.shots.score = grab();
  }
  if (frame === st.endAt) {
    st.shots.end = grab();
    return true;
  }
  if (frame === st.winAt) {
    st.shots.win = grab();
    return true;
  }
  return frame === st.stopAt;
}

function vgFrame(st, frame) {
  vgDispatch(st, frame);
  window.__step();
  st.frames = frame;
  st.ring.snapshot();
  for (const [moment, at] of Object.entries(st.run.fixed)) {
    if (at === frame) {
      st.shots[moment] = st.canvas.toDataURL('image/png');
    }
  }
  for (const ev of window.__events.splice(0)) {
    vgOnMessage(st, ev, frame);
  }
  vgSweep(st, frame);
  return vgShoot(st, frame);
}

function vgInstallRunner() {
  window.__run = (run, maxFrames, ringSize) => {
    const st = vgState(run, ringSize);
    for (let frame = 1; frame <= maxFrames; frame++) {
      if (vgFrame(st, frame)) {
        break;
      }
    }
    return { shots: st.shots, frames: st.frames, terminal: st.terminal };
  };
}

const HELPERS = [vgInert, vgRing, vgLumProbe, vgState, vgDispatch, vgOnMessage, vgSweep, vgShoot, vgFrame];
const INSTALLERS = [vgInstallRandom, vgInstallClock, vgInstallSilentAudio, vgInstallEventLog, vgInstallRunner];

export const INIT_SCRIPT = [
  ...HELPERS.map(String),
  ...INSTALLERS.map(String),
  ...INSTALLERS.map((fn) => `${fn.name}();`),
].join('\n');
