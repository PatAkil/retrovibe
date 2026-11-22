import { gates, stopServer } from './gates.mjs';

const SLOTS = 2;

function tail(out, n = 15) {
  return out.trimEnd().split('\n').slice(-n).map((l) => `    ${l}`).join('\n');
}

function label(g, pass) {
  if (g.info) {
    return 'INFO';
  }
  return pass ? 'PASS' : 'FAIL';
}

function printResult(g, r, secs) {
  const pass = r.code === 0;
  const note = g.note ? g.note(r.out) : (r.note ?? '');
  console.log(`${label(g, pass).padEnd(4)}  ${g.name.padEnd(12)} ${secs.toFixed(1).padStart(5)}s${note ? `  ${note}` : ''}`);
  if (!pass && r.out.trim() !== '') {
    console.log(tail(r.out));
  }
}

async function execute(g, state) {
  const t = Date.now();
  const r = await g.exec();
  const secs = (Date.now() - t) / 1000;
  state.done.add(g.name);
  if (!g.light) {
    state.busy -= 1;
  }
  if (r.code !== 0 && !g.info) {
    state.failed.push(g.name);
  }
  printResult(g, r, secs);
}

function ready(g, state) {
  if (!(g.after ?? []).every((d) => state.done.has(d))) {
    return false;
  }
  return g.light === true || state.busy < SLOTS;
}

function schedule(pending, state, running) {
  for (const g of [...pending]) {
    if (!ready(g, state)) {
      continue;
    }
    if (!g.light) {
      state.busy += 1;
    }
    pending.splice(pending.indexOf(g), 1);
    const p = execute(g, state).then(() => running.delete(p));
    running.add(p);
  }
}

async function runAll() {
  const pending = gates();
  const state = { busy: 0, done: new Set(), failed: [] };
  const running = new Set();
  while (pending.length > 0 || running.size > 0) {
    schedule(pending, state, running);
    if (running.size === 0) {
      break;
    }
    await Promise.race(running);
  }
  return state.failed;
}

async function main() {
  const t0 = Date.now();
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      stopServer();
      process.exit(130);
    });
  }
  const failed = await runAll().finally(stopServer);
  const total = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`TOTAL ${failed.length > 0 ? `FAIL (${failed.join(', ')})` : 'PASS'} in ${total}s`);
  if (failed.length > 0) {
    process.exitCode = 1;
  }
}

await main();
