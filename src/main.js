import { CHANNELS } from './channels/channelList.js';
import { hashStringToSeed, clamp } from './util/prng.js';
import { AudioManager } from './util/audio.js';

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

let powered = false;
let showOsd = true;
let showGuide = false;
let scanning = false;
let scanTimer = null;
const SCAN_PERIOD_MS = 30_000;

let currentIndex = 0;
let current = null; // channel instance
let lastTs = performance.now();
let tuneBuffer = '';
let tuneTimer = 0;

// ---- UI wiring
const $ = (id) => document.getElementById(id);
$('btn-power').addEventListener('click', () => togglePower());
$('btn-audio').addEventListener('click', () => toggleAudio());
$('btn-info').addEventListener('click', () => { showOsd = !showOsd; osd.classList.toggle('hidden', !showOsd); });
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
  else if (e.key.toLowerCase() === 'i') { showOsd = !showOsd; osd.classList.toggle('hidden', !showOsd); }
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
  flashOsd();
}

function backspaceTune(){
  if (!powered) return;
  tuneBuffer = tuneBuffer.slice(0, -1);
  tuneTimer = 1.5;
  setOsd();
  flashOsd();
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

function flashOsd(){
  osd.classList.remove('hidden');
  showOsd = true;
  clearTimeout(flashOsd._t);
  flashOsd._t = setTimeout(() => { if (!showOsd) osd.classList.add('hidden'); }, 1200);
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
    channelStep(+1);
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
  flashOsd();
}

async function toggleAudio(){
  await audio.toggle();
  if (audio.enabled && powered){
    current?.onAudioOn?.(audio);
  } else {
    current?.onAudioOff?.();
  }
  setOsd();
  flashOsd();
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
  flashOsd();
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
  flashOsd();
  if (showGuide) renderGuide();

  // dynamic import
  const mod = await import(ch.module);
  const factory = mod?.createChannel;
  if (typeof factory !== 'function') throw new Error(`Channel module missing createChannel: ${ch.module}`);

  current = factory({ seed, audio });
  resize();
  current?.init?.({ canvas: screen, ctx, width: screen.width, height: screen.height, dpr: Math.max(1, Math.min(2, window.devicePixelRatio||1)) });
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
  const img = nctx.createImageData(w, h);
  const d = img.data;
  for (let i=0; i<d.length; i+=4){
    const v = (Math.random() * 255) | 0;
    d[i] = v; d[i+1] = v; d[i+2] = v;
    d[i+3] = ((Math.random()*alpha) * 220) | 0;
  }
  nctx.putImageData(img, 0, 0);
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
    current?.update?.(dt);
    current?.render?.(ctx);
  }

  setOsd();
  requestAnimationFrame(tick);
}

// boot
resize();
setOsd();
requestAnimationFrame(tick);

// initial help hint
$('btn-info').addEventListener('dblclick', () => (help.hidden = false));
