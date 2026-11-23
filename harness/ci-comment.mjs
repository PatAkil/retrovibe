import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const COMMENT_MARKER = '<!-- retrovibe-graphics -->';
const MAX_PAIRS = 8;
const ROW = /^ {2}(\S+)\s+(\S+)\s+(.+)$/;
const SAFE_IDENT = /^[A-Za-z0-9_-]+$/;
const NUMBERS = /^(\d+\.\d+) % \| +(\d+\.\d+) %$/;

const args = process.argv.slice(2);
const flag = (name, fallback) => {
  const i = args.indexOf(`--${name}`);
  const value = i < 0 ? undefined : args[i + 1];
  if (value === undefined && fallback === undefined) {
    throw new Error(`ci-comment: --${name} is required`);
  }
  return value ?? fallback;
};

function parseRow(line) {
  const m = ROW.exec(line);
  if (!m) {
    return null;
  }
  const name = String(m[1]);
  const moment = String(m[2]);
  if (!SAFE_IDENT.test(name) || !SAFE_IDENT.test(moment)) {
    return null;
  }
  const cell = String(m[3]).trim();
  const nums = NUMBERS.exec(cell.replace(/\s+/g, ' '));
  const any = nums ? Number(nums[1]) : null;
  const visible = nums ? Number(nums[2]) : null;
  return { name, moment, cell, any, visible, changed: any === null || any > 0 };
}

function parseLog(text) {
  const lines = text.split('\n');
  const start = lines.findIndex((l) => l.startsWith('pixels vs baseline'));
  if (start < 0) {
    return [];
  }
  return lines.slice(start + 1).map(parseRow).filter((r) => r !== null);
}

function readStatus(outDir) {
  try {
    return JSON.parse(readFileSync(join(outDir, 'status.json'), 'utf8'));
  } catch {
    return { ok: false, failures: ['verification/out/status.json missing: the capture did not finish'] };
  }
}

const pct = (value) => (value === null ? '' : `${value.toFixed(2)} %`);

function table(rows) {
  const body = rows.map((r) => {
    const any = r.any === null ? r.cell : pct(r.any);
    return `| \`${r.name}\` | ${r.moment} | ${any} | ${pct(r.visible)} | ${r.changed ? 'changed' : ''} |`;
  });
  return ['| Fixture | Moment | any change | visible change | |', '|---|---|---|---|---|', ...body].join('\n');
}

function publish(picked, dirs, target) {
  mkdirSync(target, { recursive: true });
  const compare = join(dirs.out, 'compare.png');
  const hasCompare = existsSync(compare);
  if (hasCompare) {
    copyFileSync(compare, join(target, 'compare.png'));
  }
  const pairs = picked.filter((r) => existsSync(join(dirs.out, `${r.name}-${r.moment}.png`)));
  for (const r of pairs) {
    const file = `${r.name}-${r.moment}.png`;
    copyFileSync(join(dirs.out, file), join(target, `head-${file}`));
    if (existsSync(join(dirs.baseline, file))) {
      copyFileSync(join(dirs.baseline, file), join(target, `base-${file}`));
    }
  }
  return { hasCompare, pairs };
}

function imagesSection(published, urlPrefix, baselineDir) {
  const lines = [];
  if (published.hasCompare) {
    lines.push('Composite (`verification/out/compare.png`, baseline vs this PR):', '', `<img src="${urlPrefix}/compare.png">`, '');
  }
  if (published.pairs.length > 0) {
    lines.push('| Moment | Approved baseline | This PR |', '|---|---|---|');
    for (const r of published.pairs) {
      const file = `${r.name}-${r.moment}.png`;
      const base = existsSync(join(baselineDir, file)) ? `<img src="${urlPrefix}/base-${file}" width="320">` : 'no baseline';
      lines.push(`| \`${r.name}\` ${r.moment} | ${base} | <img src="${urlPrefix}/head-${file}" width="320"> |`);
    }
  }
  return lines.join('\n');
}

function summaryLines(rows, status) {
  const changed = rows.filter((r) => r.changed);
  const head = rows.length === 0
    ? '**The capture printed no comparison table.** See the job log.'
    : `**${String(changed.length)} of ${String(rows.length)} moments differ from the committed baseline.**`;
  const reasons = Array.isArray(status.failures) && status.failures.length > 0 ? status.failures.join('; ') : 'unknown';
  const failures = status.ok === true ? [] : ['', `Capture failures: ${reasons}`];
  const body = rows.length > 0 ? ['', table(rows)] : [];
  return { changed, text: [head, ...failures, ...body].join('\n') };
}

function main() {
  const dirs = { out: flag('out-dir', 'verification/out'), baseline: flag('baseline-dir', 'verification/baseline') };
  const rows = parseLog(readFileSync(flag('log'), 'utf8'));
  const status = readStatus(dirs.out);
  const summary = summaryLines(rows, status);
  const title = '## Graphics verification: fixtures vs the approved baseline';
  writeFileSync(flag('summary'), `${title}\n\n${summary.text}\n`);
  const target = flag('publish', '');
  const picked = summary.changed.slice(0, MAX_PAIRS);
  const published = target !== '' && summary.changed.length > 0 ? publish(picked, dirs, target) : { hasCompare: false, pairs: [] };
  const images = imagesSection(published, flag('url-prefix', ''), dirs.baseline);
  const more = summary.changed.length > published.pairs.length && published.pairs.length > 0
    ? `\n\nBefore/after shown for the first ${String(published.pairs.length)} changed moments; every frame is in the run's \`graphics-frames\` artifact.`
    : '';
  const note = 'A graphics change is verified by looking: view the composite and the full-size frames against the verifying-graphics rubric before approving a new baseline (`node verification/capture.mjs --accept`, owner only).';
  const footer = `<sub>Informational, never blocks. Updated for ${flag('head-sha', 'HEAD')} · [run](${flag('run-url', '')})</sub>`;
  const body = [COMMENT_MARKER, title, '', summary.text, '', images + more, '', note, '', footer, ''].join('\n');
  writeFileSync(flag('out'), body);
  console.log(`ci-comment: ${String(summary.changed.length)} of ${String(rows.length)} moments changed, ${String(published.pairs.length)} image pairs`);
}

main();
