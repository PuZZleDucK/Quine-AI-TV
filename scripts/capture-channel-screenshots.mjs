import fs from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';
import { chromium } from 'playwright';

function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}${p(d.getSeconds())}`;
}

function slugify(s) {
  return String(s)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

const BASE_URL = process.env.BASE_URL || 'http://localhost:5176';
const WAIT_MS = Number(process.env.WAIT_MS || 1200);
const SETTLE_MS = Number(process.env.SETTLE_MS || 500);
const CHANNEL_LIMIT = Number(process.env.CHANNEL_LIMIT || 0);
const CHANNEL_ID = process.env.CHANNEL_ID || '';
const CHANNEL_NUM = Number(process.env.CHANNEL_NUM || 0);
const SHOT_SCOPE = process.env.SHOT_SCOPE || 'screen-wrap'; // screen-wrap | screen | page
const FRAMES = Math.max(1, Number(process.env.FRAMES || 1));
const FRAME_GAP_MS = Math.max(0, Number(process.env.FRAME_GAP_MS || 350));
const OFFSETS_MS = String(process.env.OFFSETS_MS || '')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean)
  .map((s) => Number(s))
  .filter((n) => Number.isFinite(n) && n >= 0);
const FAIL_ON_ERRORS = process.env.FAIL_ON_ERRORS === '1';
const REQUIRE_READY = process.env.REQUIRE_READY !== '0';
const OUT_DIR = process.env.OUT_DIR || path.join('screenshots', `channels-${timestamp()}`);
const CLEAN_OUT_DIR = process.env.CLEAN_OUT_DIR === '1';

await fs.mkdir(OUT_DIR, { recursive: true });

if (CLEAN_OUT_DIR) {
  // When refreshing a stable folder like screenshots/all, remove stale captures first
  // so channel re-ordering doesn't leave behind misleading PNGs.
  const entries = await fs.readdir(OUT_DIR).catch(() => []);
  await Promise.all(
    entries
      .filter((f) => f.endsWith('.png') || f === 'report.json')
      .map((f) => fs.rm(path.join(OUT_DIR, f), { force: true }))
  );
}

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
const page = await context.newPage();

const errors = [];
const warnings = [];
let active = null;

page.on('pageerror', (err) => {
  errors.push({
    type: 'pageerror',
    channel: active,
    message: String(err?.message || err),
  });
});

page.on('console', (msg) => {
  if (msg.type() !== 'error' && msg.type() !== 'warning') return;
  const item = {
    type: `console:${msg.type()}`,
    channel: active,
    message: msg.text(),
  };
  if (msg.type() === 'error') errors.push(item);
  else warnings.push(item);
});

try {
  await page.goto(BASE_URL, { waitUntil: 'domcontentloaded', timeout: 30_000 });
  await page.waitForSelector('#btn-power', { timeout: 10_000 });

  let channels = await page.evaluate(async () => {
    const mod = await import('./src/channelList.js');
    return mod.CHANNELS.map((ch, i) => ({
      number: i + 1,
      id: ch.id,
      name: ch.name,
    }));
  });

  if (CHANNEL_ID) {
    channels = channels.filter((ch) => ch.id === CHANNEL_ID);
  } else if (CHANNEL_NUM > 0) {
    channels = channels.filter((ch) => ch.number === CHANNEL_NUM);
  }

  if (CHANNEL_LIMIT > 0) channels = channels.slice(0, CHANNEL_LIMIT);
  if (!channels.length) throw new Error('No channels found from src/channelList.js');

  async function waitForChannelReady(ch) {
    const num = String(ch.number).padStart(2, '0');
    const waitOsd = page.waitForFunction(
      ({ expectedNum, expectedName }) => {
        const chan = document.getElementById('osd-chan');
        const name = document.getElementById('osd-name');
        if (!chan || !name) return false;
        return chan.textContent === `CH ${expectedNum}` && name.textContent === expectedName;
      },
      { expectedNum: num, expectedName: ch.name },
      { timeout: 10_000 }
    );
    if (REQUIRE_READY) {
      await waitOsd;
    } else {
      await waitOsd.catch(() => {});
    }

    try {
      await page.waitForFunction(() => {
        const noise = document.getElementById('noise');
        if (!noise) return true;
        return getComputedStyle(noise).opacity === '0';
      }, { timeout: 4_000 });
    } catch {}

    await page.waitForTimeout(Math.max(0, SETTLE_MS));
  }

  // Ensure TV is powered on (boot state may be ON or OFF depending on src/main.js defaults).
  const isPoweredOn = async () => {
    return await page.evaluate(() => {
      const el = document.getElementById('osd-power');
      return (el?.textContent || '').trim().toUpperCase() === 'ON';
    });
  };

  if (!(await isPoweredOn())) {
    await page.click('#btn-power');
    await page.waitForTimeout(Math.max(900, WAIT_MS));
  }

  // Disable scan for deterministic captures (optional, but keeps OSD consistent).
  await page.evaluate(() => {
    const el = document.getElementById('osd-scan');
    const isOn = (el?.textContent || '').toUpperCase().includes('ON');
    if (isOn) document.getElementById('btn-scan')?.click();
  });

  async function clearTuneBuffer() {
    // Avoid Backspace key (can trigger browser navigation). Use the on-screen key instead.
    for (let i = 0; i < 4; i++) {
      await page.click('.keypad .key[data-action="back"]').catch(() => {});
    }
  }

  async function tuneToChannel(ch) {
    // Ensure keyboard events go to the app.
    await page.click('.screen-wrap', { position: { x: 20, y: 20 } }).catch(() => {});
    await clearTuneBuffer();
    for (const c of String(ch.number)) {
      await page.click(`.keypad .key[data-digit="${c}"]`);
    }
    await page.click('.keypad .key[data-action="enter"]');
    await page.waitForTimeout(WAIT_MS);
    await waitForChannelReady(ch);
  }

  const captures = [];
  for (const ch of channels) {
    active = { number: ch.number, id: ch.id, name: ch.name };
    const num = String(ch.number).padStart(2, '0');
    await tuneToChannel(ch);
    const tunedAt = Date.now();

    async function captureToFile(file) {
      const outFile = path.join(OUT_DIR, file);
      if (SHOT_SCOPE === 'screen') {
        await page.locator('#screen').screenshot({ path: outFile });
      } else if (SHOT_SCOPE === 'page') {
        await page.screenshot({ path: outFile, fullPage: true });
      } else {
        await page.locator('.screen-wrap').screenshot({ path: outFile });
      }
    }

    if (OFFSETS_MS.length) {
      const offsets = [...new Set(OFFSETS_MS)].sort((a, b) => a - b);
      for (const offsetMs of offsets) {
        const elapsed = Date.now() - tunedAt;
        const wait = Math.max(0, offsetMs - elapsed);
        if (wait) await page.waitForTimeout(wait);

        const secs = Math.round(offsetMs / 1000);
        const file = `${num}-${slugify(ch.id)}-t${String(secs).padStart(3, '0')}s.png`;
        await captureToFile(file);

        captures.push({
          number: ch.number,
          id: ch.id,
          name: ch.name,
          tMs: Date.now() - tunedAt,
          offsetMs,
          file,
        });
        process.stdout.write(`captured CH ${num} ${ch.id} t=${secs}s\n`);
      }
    } else {
      for (let frame = 0; frame < FRAMES; frame++) {
        if (frame > 0) await page.waitForTimeout(FRAME_GAP_MS);

        const file =
          FRAMES === 1
            ? `${num}-${slugify(ch.id)}.png`
            : `${num}-${slugify(ch.id)}-f${String(frame + 1).padStart(2, '0')}.png`;

        await captureToFile(file);

        captures.push({
          number: ch.number,
          id: ch.id,
          name: ch.name,
          frame: frame + 1,
          tMs: Date.now() - tunedAt,
          file,
        });
        process.stdout.write(`captured CH ${num} ${ch.id} frame ${frame + 1}/${FRAMES}\n`);
      }
    }
  }

  const report = {
    baseUrl: BASE_URL,
    generatedAt: new Date().toISOString(),
    outDir: OUT_DIR,
    count: captures.length,
    framesPerChannel: FRAMES,
    offsetsMs: OFFSETS_MS.length ? OFFSETS_MS : undefined,
    captures,
    errors,
    warnings,
  };
  await fs.writeFile(path.join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));

  process.stdout.write(`done: ${captures.length} screenshots in ${OUT_DIR}\n`);
  process.stdout.write(`errors: ${errors.length}, warnings: ${warnings.length}\n`);

  if (FAIL_ON_ERRORS && errors.length) process.exitCode = 1;
} finally {
  active = null;
  await browser.close();
}
