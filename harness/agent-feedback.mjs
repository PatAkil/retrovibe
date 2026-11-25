import { readFileSync, realpathSync } from 'node:fs';
import { relative, resolve } from 'node:path';
import { killChildren } from './feedback-checks.mjs';
import { gateByHand, precommit } from './feedback-commit.mjs';
import { handleEdit } from './feedback-edit.mjs';
import { handleStop } from './feedback-stop.mjs';
import { agentKey, findRepo, freshAgent, gatedFiles, logEvent, readState, releaseActiveLocks, updateState } from './feedback-state.mjs';
import { ownFingerprints, unitFingerprint, unitOf } from './feedback-units.mjs';

const LIMIT_MS = {
  edit: 55000,
  stop: 580000,
  'session-start': 25000,
  'subagent-start': 25000,
  'record-green': 15000,
  precommit: 590000,
  gate: 590000,
};
const READS_HOOK_INPUT = new Set(['edit', 'stop', 'session-start', 'subagent-start']);

function realPathOrSelf(path) {
  try {
    return realpathSync(path);
  } catch {
    return path;
  }
}

function readInput(command) {
  if (!READS_HOOK_INPUT.has(command) || process.stdin.isTTY) {
    return {};
  }
  try {
    return JSON.parse(readFileSync(0, 'utf8'));
  } catch {
    return {};
  }
}

function sessionStart(input, repo) {
  const session = String(input.session_id ?? 'cli');
  const existing = readState(repo.dir);
  const needsFps = !(session in existing.baselines);
  const needsAgent = !(`main:${session}` in existing.agents);
  const all = needsFps || needsAgent ? gatedFiles(repo.root) : null;
  const fps = needsFps ? ownFingerprints(repo.root, all) : null;
  const agent = needsAgent ? freshAgent(repo.root, {}, all) : null;
  updateState(repo.dir, (state) => {
    if (fps !== null) {
      state.baselines[session] ??= fps;
    }
    if (agent !== null) {
      state.agents[`main:${session}`] ??= agent;
    }
  });
  return { code: 0 };
}

function subagentStart(input, repo) {
  const key = `agent:${String(input.agent_id ?? 'unknown')}`;
  const all = gatedFiles(repo.root);
  const agent = freshAgent(repo.root, { startFps: ownFingerprints(repo.root, all) }, all);
  updateState(repo.dir, (state) => {
    state.agents[key] = agent;
    state.active[key] = Date.now();
  });
  return { code: 0 };
}

function recordGreen(_input, repo) {
  const arg = process.argv[3];
  if (!arg) {
    return { code: 0 };
  }
  const rel = relative(realPathOrSelf(repo.root), realPathOrSelf(resolve(arg))).replace(/\\/g, '/').replace(/\/+$/, '');
  if (rel === '' || rel.startsWith('..')) {
    return { code: 0 };
  }
  const unit = unitOf(repo.root, `${rel}/`);
  if (unit.kind === 'gone' || unit.kind === 'tooling') {
    return { code: 0 };
  }
  const all = gatedFiles(repo.root);
  if (all.length === 0) {
    return { code: 0 };
  }
  const fp = unitFingerprint(repo.root, unit, all);
  updateState(repo.dir, (state) => {
    state.green[unit.id] = fp;
  });
  return { code: 0 };
}

const COMMANDS = {
  edit: handleEdit,
  stop: handleStop,
  'session-start': sessionStart,
  'subagent-start': subagentStart,
  'record-green': recordGreen,
  precommit: (_input, repo) => precommit(repo),
  gate: (_input, repo) => gateByHand(repo),
};

function emit(result) {
  if (result.json) {
    process.stdout.write(`${JSON.stringify(result.json)}\n`);
  }
  if (result.stderr) {
    process.stderr.write(result.stderr);
  }
  process.exitCode = result.code;
}

async function main() {
  const command = process.argv[2] ?? '';
  const handler = COMMANDS[command];
  if (!handler) {
    emit({ code: 1, stderr: `usage: agent-feedback.mjs ${Object.keys(COMMANDS).join('|')}\n` });
    return;
  }
  setTimeout(() => {
    killChildren();
    releaseActiveLocks();
    process.stderr.write(`agent-feedback ${command}: gave up after ${String(LIMIT_MS[command] / 1000)}s\n`);
    process.exit(command === 'precommit' || command === 'gate' ? 1 : 0);
  }, LIMIT_MS[command]).unref();
  const input = readInput(command);
  const repo = findRepo(typeof input.cwd === 'string' ? input.cwd : process.cwd());
  const t0 = Date.now();
  const result = await handler(input, repo);
  emit(result);
  const who = READS_HOOK_INPUT.has(command) ? agentKey(input) : 'git';
  logEvent(repo.dir, { command, event: input.hook_event_name ?? command, who, tool: input.tool_name, code: result.code, ms: Date.now() - t0 });
}

try {
  await main();
} catch (e) {
  killChildren();
  releaseActiveLocks();
  emit({ code: 1, stderr: `agent-feedback: internal error, skipped: ${e instanceof Error ? e.message : String(e)}\n` });
}
