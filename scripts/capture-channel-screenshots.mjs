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
const SHOT_SCOPE = process.env.SHOT_SCOPE || 'screen-wrap'; // screen-wrap | screen | page
const FAIL_ON_ERRORS = process.env.FAIL_ON_ERRORS === '1';
const OUT_DIR = process.env.OUT_DIR || path.join('screenshots', `channels-${timestamp()}`);

await fs.mkdir(OUT_DIR, { recursive: true });

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
    const mod = await import('./src/channels/channelList.js');
    return mod.CHANNELS.map((ch, i) => ({
      number: i + 1,
      id: ch.id,
      name: ch.name,
    }));
  });

  if (CHANNEL_LIMIT > 0) channels = channels.slice(0, CHANNEL_LIMIT);
  if (!channels.length) throw new Error('No channels found from src/channels/channelList.js');

  async function waitForChannelReady(ch) {
    const num = String(ch.number).padStart(2, '0');
    try {
      await page.waitForFunction(
        ({ expectedNum, expectedName }) => {
          const chan = document.getElementById('osd-chan');
          const name = document.getElementById('osd-name');
          if (!chan || !name) return false;
          return chan.textContent === `CH ${expectedNum}` && name.textContent === expectedName;
        },
        { expectedNum: num, expectedName: ch.name },
        { timeout: 4_000 }
      );
    } catch {}

    try {
      await page.waitForFunction(() => {
        const noise = document.getElementById('noise');
        if (!noise) return true;
        return getComputedStyle(noise).opacity === '0';
      }, { timeout: 4_000 });
    } catch {}

    await page.waitForTimeout(Math.max(0, SETTLE_MS));
  }

  await page.click('#btn-power');
  await page.waitForTimeout(Math.max(900, WAIT_MS));
  await waitForChannelReady(channels[0]);

  const captures = [];
  for (let i = 0; i < channels.length; i++) {
    const ch = channels[i];
    active = { number: ch.number, id: ch.id, name: ch.name };
    const num = String(ch.number).padStart(2, '0');
    const file = `${num}-${slugify(ch.id)}.png`;
    const outFile = path.join(OUT_DIR, file);

    // TV powers on to CH 01. For subsequent captures, step channel-up once.
    if (i > 0) {
      await page.click('#btn-ch-up');
      await page.waitForTimeout(WAIT_MS);
      await waitForChannelReady(ch);
    }

    if (SHOT_SCOPE === 'screen') {
      await page.locator('#screen').screenshot({ path: outFile });
    } else if (SHOT_SCOPE === 'page') {
      await page.screenshot({ path: outFile, fullPage: true });
    } else {
      await page.locator('.screen-wrap').screenshot({ path: outFile });
    }

    captures.push({ number: ch.number, id: ch.id, name: ch.name, file });
    process.stdout.write(`captured CH ${num} ${ch.id}\n`);
  }

  const report = {
    baseUrl: BASE_URL,
    generatedAt: new Date().toISOString(),
    outDir: OUT_DIR,
    count: captures.length,
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
