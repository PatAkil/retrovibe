import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { FIXTURE_NAMES, MOMENTS, declaredMoments } from './fixtures.mjs';
import { BASELINE, OUT } from './session.mjs';

function cmpLoad(src) {
  return new Promise((res, rej) => {
    const i = new window.Image();
    i.onload = () => { res(i); };
    i.onerror = () => { rej(new Error(`failed to load image: ${src.slice(0, 64)}`)); };
    i.src = src;
  });
}

function cmpCell(src) {
  const i = document.createElement('img');
  i.src = src;
  i.style.width = '100%';
  i.style.imageRendering = 'pixelated';
  return i;
}

function cmpNote(text) {
  return Object.assign(document.createElement('div'), { textContent: text, style: 'text-align:center;color:#f66' });
}

function cmpPixels(a, b, out) {
  const tones = [[20, 20, 24], [110, 30, 30], [255, 60, 60]];
  let changed = 0;
  let visible = 0;
  for (let i = 0; i < a.length; i += 4) {
    const delta = Math.max(Math.abs(a[i] - b[i]), Math.abs(a[i + 1] - b[i + 1]), Math.abs(a[i + 2] - b[i + 2]));
    const tone = delta === 0 ? 0 : 1 + Number(delta >= 24);
    changed += Number(delta !== 0);
    visible += Number(delta >= 24);
    out.set([...tones[tone], 255], i);
  }
  return { changed, visible };
}

function cmpDiff(base, cand, diff) {
  const dctx = diff.getContext('2d');
  if (!(base && cand && base.width === cand.width && base.height === cand.height)) {
    dctx.fillStyle = '#222';
    dctx.fillRect(0, 0, diff.width, diff.height);
    return { changed: 0, visible: 0 };
  }
  const c = document.createElement('canvas');
  c.width = cand.width;
  c.height = cand.height;
  const x = c.getContext('2d');
  x.drawImage(base, 0, 0);
  const a = x.getImageData(0, 0, c.width, c.height).data;
  x.clearRect(0, 0, c.width, c.height);
  x.drawImage(cand, 0, 0);
  const b = x.getImageData(0, 0, c.width, c.height).data;
  const d = dctx.createImageData(c.width, c.height);
  const counts = cmpPixels(a, b, d.data);
  dctx.putImageData(d, 0, 0);
  return counts;
}

function cmpMissingText(r) {
  return r.declared === false
    ? 'stale baseline frame — no longer declared; --accept will prune it'
    : 'MISSING — the capture produced no frame for this moment';
}

function cmpSizeLabel(img) {
  return img ? `${img.width}x${img.height}` : null;
}

function cmpIsSizeMismatch(base, cand) {
  return Boolean(base && cand && (base.width !== cand.width || base.height !== cand.height));
}

function cmpDiffCell(base, cand) {
  if (cmpIsSizeMismatch(base, cand)) {
    return {
      node: cmpNote(`SIZE MISMATCH (${cmpSizeLabel(base)} vs ${cmpSizeLabel(cand)})`),
      counts: { changed: 0, visible: 0 },
    };
  }
  const diff = document.createElement('canvas');
  const ref = cand ?? base;
  diff.width = ref.width;
  diff.height = ref.height;
  const counts = cmpDiff(base, cand, diff);
  diff.style.width = '100%';
  return { node: diff, counts };
}

function cmpRowStats(r, base, cand, counts) {
  const baseSize = cmpSizeLabel(base);
  const candSize = cmpSizeLabel(cand);
  const common = {
    name: r.name, moment: r.moment, declared: r.declared,
    hasBase: Boolean(base), hasCand: Boolean(cand), baseSize, candSize,
  };
  if (cmpIsSizeMismatch(base, cand)) {
    return { ...common, sizeMismatch: true, pct: 100, vis: 100 };
  }
  const ref = cand ?? base;
  const total = ref.width * ref.height;
  const both = Boolean(base && cand);
  return {
    ...common, sizeMismatch: false,
    pct: both ? (100 * counts.changed) / total : null,
    vis: both ? (100 * counts.visible) / total : null,
  };
}

async function cmpRow(grid, r) {
  grid.appendChild(Object.assign(document.createElement('div'), { textContent: r.moment ? `${r.name} · ${r.moment}` : r.name }));
  const cand = r.cand ? await cmpLoad(r.cand) : null;
  const base = r.base ? await cmpLoad(r.base) : null;
  grid.appendChild(base ? cmpCell(r.base) : cmpNote('no baseline yet'));
  grid.appendChild(cand ? cmpCell(r.cand) : cmpNote(cmpMissingText(r)));
  const { node, counts } = cmpDiffCell(base, cand);
  grid.appendChild(node);
  return cmpRowStats(r, base, cand, counts);
}

const PAGE_HELPERS = [
  cmpLoad, cmpCell, cmpNote, cmpPixels, cmpDiff, cmpMissingText,
  cmpSizeLabel, cmpIsSizeMismatch, cmpDiffCell, cmpRowStats, cmpRow,
].map(String).join('\n');

function fixtureRows() {
  const rows = [];
  const baselineFiles = new Set(existsSync(BASELINE) ? readdirSync(BASELINE) : []);
  for (const name of FIXTURE_NAMES) {
    const declared = declaredMoments(name);
    for (const moment of MOMENTS) {
      const file = `${name}-${moment}.png`;
      const candFile = resolve(OUT, file);
      if (existsSync(candFile) || baselineFiles.has(file)) {
        rows.push({ name, moment, baseFile: resolve(BASELINE, file), candFile, declared: declared.has(moment) });
      }
    }
  }
  return rows;
}

const HTML_ENTITIES = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

function escapeHtml(text) {
  return String(text).replace(/[&<>"']/g, (ch) => HTML_ENTITIES[ch]);
}

function pageHtml(left, right) {
  return `<body style="margin:0;background:#101014;color:#ddd;font:13px system-ui">
    <div id="grid" style="display:grid;grid-template-columns:150px repeat(3,1fr);gap:6px;padding:8px;align-items:center">
      <div></div><b style="text-align:center">${escapeHtml(left)}</b><b style="text-align:center">${escapeHtml(right)}</b><b style="text-align:center">changed pixels (dim = subtle, bright = visible)</b>
    </div></body>`;
}

const asDataUrl = (file) => (existsSync(file) ? `data:image/png;base64,${readFileSync(file).toString('base64')}` : null);

export async function buildCompare(browser, options = {}) {
  const {
    rows: rowsIn = fixtureRows(),
    outFile = resolve(OUT, 'compare.png'),
    left = 'baseline (approved)',
    right = 'candidate (working tree)',
  } = options;
  const rows = rowsIn.map((r) => ({ ...r, base: asDataUrl(r.baseFile), cand: asDataUrl(r.candFile) }));
  const page = await browser.newPage({ viewport: { width: 1600, height: 900 } });
  let stats;
  let shot;
  try {
    await page.setContent(pageHtml(left, right));
    await page.addScriptTag({ content: PAGE_HELPERS });
    stats = await page.evaluate(async (all) => {
      const grid = document.getElementById('grid');
      const out = [];
      for (const r of all) {
        out.push(await window.cmpRow(grid, r));
      }
      return out;
    }, rows);
    shot = await page.screenshot({ fullPage: true });
  } finally {
    await page.close();
  }
  writeFileSync(outFile, shot);
  return stats;
}
