import { CHANNELS } from './channelList.js';
import { hashStringToSeed, clamp } from './util/prng.js';
import { AudioManager } from './util/audio.js';

const CHANNEL_MODULES = import.meta.glob('./channels/*.js');

const screen = document.getElementById('screen');
const noise = document.getElementById('noise');
const ctx = screen.getContext('2d');
const nctx = noise.getContext('2d');

const osd = document.getElementById('osd');
const osdPower = document.getElementById('osd-power');
const osdChan = document.getElementById('osd-chan');
const osdName = document.getElementById('osd-name');
const osdAudio = document.getElementById('osd-audio');
const osdScan = document.getElementById('osd-scan');

const statusTune = document.getElementById('status-tune');
const statusSeed = document.getElementById('status-seed');

const help = document.getElementById('help');
const guide = document.getElementById('guide');

const audio = new AudioManager();
const STORAGE_KEY = 'quine-tv:state:v1';

// Default boot state: TV ON and SCAN enabled.
// (Audio remains OFF until user gesture, due to browser autoplay policies.)
let powered = true;
let osdPinned = false;
let osdVisible = true;
let showGuide = false;
let scanning = true;
let scanTimer = null;
const SCAN_PERIOD_MS = 30_000;
const OSD_AUTOHIDE_MS = 10_000;
let osdHideTimer = null;

let currentIndex = 0;
let current = null; // channel instance
let lastTs = performance.now();
let tuneBuffer = '';
let tuneTimer = 0;
let lastScanIndex = -1;

// Noise burst rendering cache.
// Avoid allocating a full-screen ImageData every frame during channel transitions (helps Playwright runs too).
let _noiseBuf = null;
let _noiseBufCtx = null;
let _noiseImg = null;
let _noiseBW = 0;
let _noiseBH = 0;

function loadPersistedState(){
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== 'object') return null;
    return parsed;
  } catch {
    return null;
  }
}

function saveState(){
  try {
    const state = {
      powered,
      scanning,
      osdPinned,
      currentIndex,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {}
}

{
  const st = loadPersistedState();
  if (st){
    if (typeof st.powered === 'boolean') powered = st.powered;
    if (typeof st.scanning === 'boolean') scanning = st.scanning;
    if (typeof st.osdPinned === 'boolean') osdPinned = st.osdPinned;
    if (Number.isInteger(st.currentIndex)){
      currentIndex = clamp(st.currentIndex, 0, CHANNELS.length - 1);
    }
  }
  // Pinned OSD should remain visible across reloads.
  osdVisible = osdPinned ? true : osdVisible;
}

// ---- UI wiring
const $ = (id) => document.getElementById(id);
$('btn-power').addEventListener('click', () => togglePower());
$('btn-audio').addEventListener('click', () => toggleAudio());
$('btn-info').addEventListener('click', () => toggleOsdPin());
$('btn-ch-up').addEventListener('click', () => channelStep(+1));
$('btn-ch-down').addEventListener('click', () => channelStep(-1));
$('btn-scan')?.addEventListener('click', () => toggleScan());
$('btn-close-help').addEventListener('click', () => (help.hidden = true));

// keypad
for (const btn of document.querySelectorAll('.keypad .key')){
  btn.addEventListener('click', () => {
    const d = btn.dataset.digit;
    const act = btn.dataset.action;
    if (d != null) addDigit(d);
    if (act === 'enter') confirmTune();
    if (act === 'back') backspaceTune();
  });
}

window.addEventListener('keydown', (e) => {
  if (e.key === ' ') { e.preventDefault(); togglePower(); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); channelStep(+1); }
  else if (e.key === 'ArrowDown') { e.preventDefault(); channelStep(-1); }
  else if (e.key === 'Enter') { confirmTune(); }
  else if (e.key === 'Backspace') { backspaceTune(); }
  else if (/^[0-9]$/.test(e.key)) { addDigit(e.key); }
  else if (e.key.toLowerCase() === 'a') { toggleAudio(); }
  else if (e.key.toLowerCase() === 's') { toggleScan(); }
  else if (e.key.toLowerCase() === 'i') { toggleOsdPin(); }
  else if (e.key.toLowerCase() === 'g') {
    showGuide = !showGuide;
    guide?.classList.toggle('hidden', !showGuide);
    if (showGuide) renderGuide();
  }
  else if (e.key.toLowerCase() === 'h' || e.key === '?') { help.hidden = !help.hidden; }
});

window.addEventListener('resize', () => resize());

function resize(){
  // match canvas backing size to CSS size * devicePixelRatio
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio || 1));
  const w = Math.floor(screen.clientWidth * dpr);
  const h = Math.floor(screen.clientHeight * dpr);
  if (w && h && (screen.width !== w || screen.height !== h)){
    screen.width = w; screen.height = h;
    noise.width = w; noise.height = h;
    current?.onResize?.(w, h, dpr);
  }
}

function setOsd(){
  osdPower.textContent = powered ? 'ON' : 'OFF';
  const chNum = String(currentIndex + 1).padStart(2,'0');
  osdChan.textContent = `CH ${chNum}`;
  osdName.textContent = CHANNELS[currentIndex]?.name || '—';
  osdAudio.textContent = `AUDIO: ${audio.enabled ? 'ON' : 'OFF'}`;
  if (osdScan) osdScan.textContent = `SCAN: ${scanning ? 'ON' : 'OFF'}`;
  statusTune.textContent = tuneBuffer ? tuneBuffer : `CH ${chNum} ${CHANNELS[currentIndex]?.id}`;
}

function escapeHtml(s){
  return String(s).replace(/[&<>"']/g, (c) => ({
    '&':'&amp;',
    '<':'&lt;',
    '>':'&gt;',
    '"':'&quot;',
    "'":'&#39;'
  }[c]));
}

function renderGuide(){
  if (!guide) return;
  const items = CHANNELS.map((ch, i) => {
    const num = String(i + 1).padStart(2,'0');
    const active = i === currentIndex ? 'active' : '';
    return `<div class="guide-item ${active}">`
      + `<span class="num">CH ${num}</span>`
      + `<span class="name">${escapeHtml(ch.name)}</span>`
      + `<span class="id">${escapeHtml(ch.id)}</span>`
      + `</div>`;
  }).join('');

  guide.innerHTML = `<div class="guide-title">Channel Guide</div><div class="guide-list">${items}</div>`;
}

function addDigit(d){
  if (!powered) return;
  tuneBuffer = (tuneBuffer + d).slice(0, 3);
  tuneTimer = 1.5;
  setOsd();
  showOsdTemporarily();
}

function backspaceTune(){
  if (!powered) return;
  tuneBuffer = tuneBuffer.slice(0, -1);
  tuneTimer = 1.5;
  setOsd();
  showOsdTemporarily();
}

function confirmTune(){
  if (!powered) return;
  if (!tuneBuffer) return;
  const n = parseInt(tuneBuffer, 10);
  tuneBuffer = '';
  tuneTimer = 0;
  if (Number.isFinite(n) && n >= 1 && n <= CHANNELS.length){
    switchTo(n - 1);
  } else {
    // error blip
    if (audio.enabled) audio.beep({freq: 180, dur: 0.08, gain: 0.06, type: 'square'});
  }
  setOsd();
}

async function channelStep(dir){
  if (!powered) return;
  const next = (currentIndex + dir + CHANNELS.length) % CHANNELS.length;
  await switchTo(next);
}

function setOsdVisibility(){
  osd.classList.toggle('hidden', !osdVisible);
}

function showOsdTemporarily(){
  osdVisible = true;
  setOsdVisibility();
  if (osdPinned) return;

  clearTimeout(osdHideTimer);
  osdHideTimer = setTimeout(() => {
    osdHideTimer = null;
    if (osdPinned) return;
    osdVisible = false;
    setOsdVisibility();
  }, OSD_AUTOHIDE_MS);
}

function toggleOsdPin(){
  osdPinned = !osdPinned;
  osdVisible = true;
  setOsdVisibility();
  if (osdPinned){
    clearTimeout(osdHideTimer);
    osdHideTimer = null;
  } else {
    showOsdTemporarily();
  }
  saveState();
}

function disarmScan(){
  if (scanTimer){
    clearTimeout(scanTimer);
    scanTimer = null;
  }
}

function armScan(){
  // schedule the next scan step from "now"; any manual tuning/channel change resets the timer.
  disarmScan();
  if (!(scanning && powered)) return;
  scanTimer = setTimeout(() => {
    scanTimer = null;
    if (!(scanning && powered)) return;
    // Random channel scan. Avoid immediate repeats.
    let next = currentIndex;
    if (CHANNELS.length > 1){
      for (let tries = 0; tries < 6; tries++){
        const cand = (Math.random() * CHANNELS.length) | 0;
        if (cand !== currentIndex && cand !== lastScanIndex) { next = cand; break; }
      }
      if (next === currentIndex) next = (currentIndex + 1) % CHANNELS.length;
    }
    lastScanIndex = currentIndex;
    switchTo(next);
    // next arm happens when the channel switch completes (switchTo())
  }, SCAN_PERIOD_MS);
}

function toggleScan(){
  scanning = !scanning;
  if (audio.enabled){
    audio.beep({freq: scanning ? 880 : 220, dur: 0.06, gain: 0.04, type: 'square'});
  }
  armScan();
  setOsd();
  showOsdTemporarily();
  saveState();
}

async function toggleAudio(){
  await audio.toggle();
  if (audio.enabled && powered){
    current?.onAudioOn?.(audio);
  } else {
    current?.onAudioOff?.();
  }
  setOsd();
  showOsdTemporarily();
}

async function togglePower(){
  powered = !powered;
  if (powered){
    await switchTo(currentIndex, {boot:true});
  } else {
    disarmScan();
    audio.stopCurrent();
    current?.destroy?.();
    current = null;
    showGuide = false;
    guide?.classList.add('hidden');
  }
  setOsd();
  showOsdTemporarily();
  saveState();
}

function seedForChannel(id, idx){
  const base = hashStringToSeed(id + ':' + idx);
  const day = Math.floor(Date.now() / (24*3600*1000));
  return (base ^ (day * 2654435761)) >>> 0;
}

async function switchTo(idx, {boot=false}={}){
  idx = clamp(idx, 0, CHANNELS.length-1);
  const ch = CHANNELS[idx];
  const seed = seedForChannel(ch.id, idx);
  statusSeed.textContent = String(seed);

  // transition noise
  await noiseBurst(boot ? 700 : 520);

  // tear down previous
  try { current?.onHide?.(); } catch {}
  try { current?.destroy?.(); } catch {}
  current = null;
  audio.stopCurrent();

  currentIndex = idx;
  setOsd();
  showOsdTemporarily();
  saveState();
  if (showGuide) renderGuide();

  // dynamic import through Vite's module graph so channel chunks are hashed in production.
  const loader = CHANNEL_MODULES[`./channels/${ch.file}`];
  if (!loader) throw new Error(`Channel module not found: ${ch.file}`);
  const mod = await loader();
  const factory = mod?.createChannel;
  if (typeof factory !== 'function') throw new Error(`Channel module missing createChannel: ${ch.file}`);

  current = factory({ seed, audio });
  resize();
  const dpr = Math.max(1, Math.min(2, window.devicePixelRatio||1));
  const initPayload = { canvas: screen, ctx, width: screen.width, height: screen.height, dpr };
  // Prefer init(), but fall back to onResize() for older channels that only implement onResize().
  if (current?.init) current.init(initPayload);
  else current?.onResize?.(initPayload.width, initPayload.height, initPayload.dpr);
  current?.onShow?.();
  if (audio.enabled) current?.onAudioOn?.(audio);

  // tuning beep
  if (audio.enabled) audio.beep({freq: 620, dur: 0.05, gain: 0.05});

  // reset scan timer on any successful channel switch
  armScan();
}

function noiseBurst(ms=520){
  return new Promise((resolve) => {
    const t0 = performance.now();
    noise.style.opacity = '1';
    function step(){
      const t = performance.now();
      const a = 1 - (t - t0) / ms;
      drawNoise(nctx, noise.width, noise.height, Math.max(0, Math.min(1, a)));
      if (t - t0 < ms){
        requestAnimationFrame(step);
      } else {
        noise.style.opacity = '0';
        resolve();
      }
    }
    step();
  });
}

function drawNoise(nctx, w, h, alpha=1){
  if (alpha <= 0) return;

  // Render noise to a smaller buffer then scale up. This keeps the effect
  // CRT-ish while dramatically reducing CPU + GC pressure during transitions.
  const targetW = Math.min(w, 360);
  const bw = Math.max(64, targetW | 0);
  const bh = Math.max(64, Math.floor(bw * (h / Math.max(1, w))));

  if (!_noiseBuf || !_noiseBufCtx || bw !== _noiseBW || bh !== _noiseBH){
    _noiseBW = bw;
    _noiseBH = bh;
    _noiseBuf = document.createElement('canvas');
    _noiseBuf.width = bw;
    _noiseBuf.height = bh;
    _noiseBufCtx = _noiseBuf.getContext('2d');
    _noiseImg = _noiseBufCtx.createImageData(bw, bh);
  }

  const d = _noiseImg.data;
  for (let i=0; i<d.length; i+=4){
    const v = (Math.random() * 255) | 0;
    d[i] = v; d[i+1] = v; d[i+2] = v;
    d[i+3] = ((Math.random() * alpha) * 220) | 0;
  }
  _noiseBufCtx.putImageData(_noiseImg, 0, 0);

  nctx.save();
  nctx.setTransform(1,0,0,1,0,0);
  nctx.clearRect(0,0,w,h);
  nctx.imageSmoothingEnabled = false;
  nctx.drawImage(_noiseBuf, 0, 0, w, h);
  nctx.restore();
}

// main loop
function tick(now){

  const dt = Math.min(0.05, (now - lastTs) / 1000);
  lastTs = now;

  if (tuneTimer > 0){
    tuneTimer -= dt;
    if (tuneTimer <= 0) tuneBuffer = '';
  }

  if (!powered){
    // powered off: faint glow
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,screen.width,screen.height);
    const g = ctx.createRadialGradient(screen.width*0.5, screen.height*0.5, 0, screen.width*0.5, screen.height*0.5, Math.max(screen.width,screen.height)*0.6);
    g.addColorStop(0,'rgba(108,242,255,0.06)');
    g.addColorStop(1,'rgba(0,0,0,1)');
    ctx.fillStyle = g;
    ctx.fillRect(0,0,screen.width,screen.height);
  } else {
    try {
      current?.update?.(dt);
      // Some channels implement `render(ctx)` and others implement `draw(ctx)`.
      // Support both so channel output doesn't silently freeze on the previous frame.
      if (current?.render) current.render(ctx);
      else current?.draw?.(ctx);
    } catch (err) {
      // Don't let a single channel kill the entire animation loop.
      console.error(err);
      ctx.setTransform(1,0,0,1,0,0);
      ctx.clearRect(0,0,screen.width,screen.height);
      ctx.fillStyle = '#000';
      ctx.fillRect(0,0,screen.width,screen.height);
      ctx.fillStyle = 'rgba(255,90,90,0.95)';
      ctx.font = `${Math.max(14, Math.floor(Math.min(screen.width, screen.height) * 0.05))}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      ctx.fillText('CHANNEL ERROR', Math.floor(screen.width * 0.07), Math.floor(screen.height * 0.18));
      ctx.fillStyle = 'rgba(255,255,255,0.75)';
      ctx.font = `${Math.max(12, Math.floor(Math.min(screen.width, screen.height) * 0.03))}px ui-monospace, SFMono-Regular, Menlo, monospace`;
      const msg = String(err?.message || err);
      ctx.fillText(msg.slice(0, 120), Math.floor(screen.width * 0.07), Math.floor(screen.height * 0.18) + 34);
    }
  }

  setOsd();
  requestAnimationFrame(tick);
}

// boot
resize();
setOsd();
// If we're starting powered-on, load the initial channel immediately.
if (powered) {
  switchTo(currentIndex, { boot: true }).catch((err) => console.error(err));
}
requestAnimationFrame(tick);

// initial help hint
$('btn-info').addEventListener('dblclick', () => (help.hidden = false));
