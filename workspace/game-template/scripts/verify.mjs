import { availableParallelism } from 'node:os';
import { gates, recordGreen, stopChildren, stopServer } from './gates.mjs';

const envSlots = Number(process.env.VERIFY_SLOTS);
const SLOTS = Number.isInteger(envSlots) && envSlots > 0
  ? envSlots
  : Math.max(2, Math.min(6, availableParallelism() - 1));

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
  const note = r.note ?? (g.note ? g.note(r.out) : '');
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
    state.failed.add(g.name);
  }
  printResult(g, r, secs);
}

function depsDone(g, state) {
  return (g.after ?? []).every((d) => state.done.has(d));
}

function prereqFailed(g, state) {
  return (g.after ?? []).some((d) => state.failed.has(d));
}

function skipBlocked(pending, state) {
  let progressed = true;
  while (progressed) {
    progressed = false;
    for (const g of [...pending]) {
      if (!depsDone(g, state) || !prereqFailed(g, state)) {
        continue;
      }
      pending.splice(pending.indexOf(g), 1);
      state.done.add(g.name);
      if (!g.info) {
        state.failed.add(g.name);
      }
      printResult(g, { code: 1, out: '', note: 'skipped (prerequisite failed)' }, 0);
      progressed = true;
    }
  }
}

function ready(g, state) {
  if (!depsDone(g, state)) {
    return false;
  }
  return g.light === true || state.busy < SLOTS;
}

function schedule(pending, state, running) {
  skipBlocked(pending, state);
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
  const state = { busy: 0, done: new Set(), failed: new Set() };
  const running = new Set();
  while (pending.length > 0 || running.size > 0) {
    schedule(pending, state, running);
    if (running.size === 0) {
      break;
    }
    await Promise.race(running);
  }
  return [...state.failed];
}

async function main() {
  const t0 = Date.now();
  for (const signal of ['SIGINT', 'SIGTERM']) {
    process.once(signal, () => {
      stopChildren();
      stopServer();
      process.exit(signal === 'SIGINT' ? 130 : 143);
    });
  }
  const failed = await runAll().finally(stopServer);
  const total = ((Date.now() - t0) / 1000).toFixed(1);
  console.log(`TOTAL ${failed.length > 0 ? `FAIL (${failed.join(', ')})` : 'PASS'} in ${total}s`);
  if (failed.length > 0) {
    process.exitCode = 1;
  } else {
    await recordGreen();
  }
}

await main();
