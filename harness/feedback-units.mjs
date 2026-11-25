import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { gatedFiles, git, hashFiles } from './feedback-state.mjs';

const GAME_PATH = /^(workspace|verification)\/([^/]+)\//;
const NOT_GAMES = new Set(['out', 'baseline']);
const SHARED = /^(?:eslint\.config\.mjs|knip\.config\.js|package\.json|package-lock\.json|\.jscpd\.json|\.dependency-cruiser\.cjs|tools\/.*)$/;
const TEMPLATE_DIR = 'workspace/game-template';
const TEMPLATE_ENGINE = `${TEMPLATE_DIR}/engine/`;
export const TOOLING = { id: 'tooling', kind: 'tooling', dir: '' };

function kindOf(area, name) {
  if (area === 'verification') {
    return 'fixture';
  }
  return name === 'game-template' ? 'template' : 'user';
}

const isGameFolder = (root, dir) => existsSync(join(root, dir, 'game', 'main.ts')) && existsSync(join(root, dir, 'package.json'));

export function unitOf(root, path) {
  const m = GAME_PATH.exec(path);
  if (!m || NOT_GAMES.has(String(m[2]))) {
    return TOOLING;
  }
  const dir = `${String(m[1])}/${String(m[2])}`;
  if (isGameFolder(root, dir)) {
    return { id: dir, kind: kindOf(String(m[1]), String(m[2])), dir };
  }
  return existsSync(join(root, dir)) ? TOOLING : { id: dir, kind: 'gone', dir };
}

export function unitsOf(root, paths) {
  const units = new Map();
  for (const path of paths) {
    const unit = unitOf(root, path);
    const entry = units.get(unit.id) ?? { ...unit, files: [] };
    entry.files.push(path);
    units.set(unit.id, entry);
  }
  return [...units.values()].sort((a, b) => a.id.localeCompare(b.id));
}

const inUnit = (root, unit) => (path) => unitOf(root, path).id === unit.id;

export function unitFiles(root, unit, all = gatedFiles(root)) {
  return all.filter(inUnit(root, unit));
}

function sharedInputs(unit, all, own) {
  const shared = all.filter((p) => SHARED.test(p) && !own.includes(p));
  const engine = unit.kind === 'fixture' ? all.filter((p) => p.startsWith(TEMPLATE_ENGINE)) : [];
  return [...shared, ...engine];
}

export function unitFingerprint(root, unit, all = gatedFiles(root)) {
  if (unit.kind === 'gone') {
    return 'gone';
  }
  const own = unitFiles(root, unit, all);
  return hashFiles(root, [...own, ...sharedInputs(unit, all, own)]);
}

export function ownFingerprints(root, all = gatedFiles(root)) {
  const fps = {};
  for (const unit of unitsOf(root, all)) {
    fps[unit.id] = hashFiles(root, unit.files);
  }
  return fps;
}

function relativeFiles(dir, files) {
  const prefix = `${dir}/`;
  return files.filter((f) => f.startsWith(prefix)).map((f) => f.slice(prefix.length)).sort();
}

export function isPristineClone(root, unit, all = gatedFiles(root)) {
  if (unit.kind !== 'user') {
    return false;
  }
  const own = relativeFiles(unit.dir, all);
  const tpl = relativeFiles(TEMPLATE_DIR, all);
  if (own.length === 0 || own.length !== tpl.length) {
    return false;
  }
  if (git(root, ['status', '--porcelain', '--', TEMPLATE_DIR]) !== '') {
    return false;
  }
  return hashFiles(join(root, unit.dir), own) === hashFiles(join(root, TEMPLATE_DIR), tpl);
}

export const touchesGraphics = (units) => units.some((u) => u.kind === 'template' || u.kind === 'fixture');

export const GRAPHICS_REMINDER = 'Reminder (non-blocking): this change touches workspace/game-template/ or verification/. It is not done until the verifying-graphics loop has run: node verification/capture.mjs, then view verification/out/compare.png and the full-size frames, report per-criterion verdicts, and get the user to approve the baseline.';
