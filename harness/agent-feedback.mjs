import { readFileSync } from 'node:fs';
import { killChildren } from './feedback-checks.mjs';
import { gateByHand, precommit } from './feedback-commit.mjs';
import { handleEdit } from './feedback-edit.mjs';
import { handleStop } from './feedback-stop.mjs';
import { agentKey, findRepo, freshAgent, logEvent, readState, releaseActiveLocks, updateState } from './feedback-state.mjs';
import { ownFingerprints } from './feedback-units.mjs';

const LIMIT_MS = { edit: 55000, stop: 580000, 'session-start': 25000, 'subagent-start': 25000, precommit: 590000, gate: 590000 };
const READS_HOOK_INPUT = new Set(['edit', 'stop', 'session-start', 'subagent-start']);

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
  const fps = session in existing.baselines ? null : ownFingerprints(repo.root);
  const agent = `main:${session}` in existing.agents ? null : freshAgent(repo.root, {});
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
  const agent = freshAgent(repo.root, { startFps: ownFingerprints(repo.root) });
  updateState(repo.dir, (state) => {
    state.agents[key] = agent;
    state.active[key] = Date.now();
  });
  return { code: 0 };
}

const COMMANDS = {
  edit: handleEdit,
  stop: handleStop,
  'session-start': sessionStart,
  'subagent-start': subagentStart,
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
