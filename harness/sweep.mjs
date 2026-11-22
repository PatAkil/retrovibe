const TYPES = ['gameOver', 'scoreChanged', 'stateChanged'];
const SHIP_SPEED = 90;
const STEP_MS = Math.round((4 / SHIP_SPEED) * 1000);
const POLL_MS = 90;
const ROWS = 26;
const SWEEP_DEADLINE_MS = 150_000;

export function received(page) {
  return page.evaluate(() => ({
    types: [...new Set(window.__messages.map((m) => m.type))],
    msgs: window.__messages,
    violations: window.__violations,
  }));
}

async function allSeen(page) {
  const r = await received(page);
  return TYPES.every((t) => r.types.includes(t));
}

async function gameOverNow(page) {
  const r = await received(page);
  const last = [...r.msgs].reverse().find((m) => m.type === 'stateChanged');
  return last?.payload?.state === 'GAME_OVER';
}

async function roundOver(page) {
  return (await allSeen(page)) || gameOverNow(page);
}

async function hold(page, keys, ms) {
  for (const k of keys) {
    await page.keyboard.down(k);
  }
  const until = Date.now() + ms;
  while (Date.now() < until) {
    const slice = Math.min(POLL_MS, until - Date.now());
    await page.waitForTimeout(slice);
    if (slice === POLL_MS && (await roundOver(page))) {
      break;
    }
  }
  for (const k of keys) {
    await page.keyboard.up(k);
  }
  return roundOver(page);
}

async function sweepRound(page) {
  if (await hold(page, ['ArrowUp', 'ArrowLeft'], 2200)) {
    return;
  }
  for (let row = 0; row < ROWS; row++) {
    const dir = row % 2 === 0 ? 'ArrowRight' : 'ArrowLeft';
    if ((await hold(page, [dir], 2700)) || (await hold(page, ['ArrowDown'], STEP_MS))) {
      return;
    }
  }
}

export async function startAndPause(page) {
  await page.keyboard.press('Space');
  await page.waitForTimeout(300);
  await page.keyboard.press('KeyP');
  await page.waitForTimeout(200);
  await page.keyboard.press('KeyP');
  await page.waitForTimeout(200);
}

export async function sweep(page) {
  const deadline = Date.now() + SWEEP_DEADLINE_MS;
  while (Date.now() < deadline && !(await allSeen(page))) {
    if (await gameOverNow(page)) {
      await page.keyboard.press('Space');
      await page.waitForTimeout(300);
    }
    await sweepRound(page);
  }
}
