import { mulberry32, clamp } from '../../util/prng.js';
import { simpleDrone } from '../../util/audio.js';

function lerp(a, b, t){ return a + (b - a) * t; }
function ease(t){ t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }

function roundRect(ctx, x, y, w, h, r){
  r = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function hsl(h, s, l, a=1){ return `hsla(${h}, ${s}%, ${l}%, ${a})`; }

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0;
  let h = 0;
  let t = 0;

  // scene
  let bokeh = []; // {x,y,r,z,hue}
  let slots = []; // {x,y,w,h}
  let machine = { x: 0, y: 0, w: 0, h: 0 };
  let glass = { x: 0, y: 0, w: 0, h: 0 };
  let chute = { x: 0, y: 0, w: 0, h: 0 };

  // inventory pool (stable), then reshuffle like tarot
  const catalog = [
    { id: 'MOON', label: 'MOON SODA', hue: 195 },
    { id: 'LCKY', label: 'LUCKY GUM', hue: 330 },
    { id: 'SPRK', label: 'SPARK WAFER', hue: 55 },
    { id: 'BYTE', label: 'BYTE BAR', hue: 120 },
    { id: 'NOVA', label: 'NOVA MINT', hue: 170 },
    { id: 'PEAR', label: 'PEARL TEA', hue: 210 },
    { id: 'STAR', label: 'STAR JELLY', hue: 290 },
    { id: 'DUST', label: 'PIXEL DUST', hue: 265 },
    { id: 'HUSH', label: 'HUSH CHIPS', hue: 25 },
    { id: 'TIDE', label: 'TIDE CANDY', hue: 175 },
    { id: 'CRPT', label: 'CRYPT POP', hue: 310 },
    { id: 'SUN', label: 'SUN COIN', hue: 44 },
    { id: 'RUNE', label: 'RUNE MINTS', hue: 140 },
    { id: 'VOID', label: 'VOID COLA', hue: 205 },
    { id: 'GLIM', label: 'GLIMMER GEL', hue: 305 },
    { id: 'AURA', label: 'AURA WATER', hue: 185 },
  ];

  const fortunes = [
    'A SMALL DETOUR IS LUCKY.',
    'TODAY, DO THE TIDY THING.',
    'SAY LESS. DO MORE.',
    'THE NEXT TRY WORKS.',
    'ANSWER LATER. REST NOW.',
    'YOU ALREADY KNOW THE FIX.',
    'DON\'T CHASE. ATTRACT.',
    'TRADE SPEED FOR CLARITY.',
    'MAKE IT BORING. SHIP IT.',
    'ASK A BETTER QUESTION.',
    'YOUR FUTURE SELF SAYS HI.',
    'TIDY INPUTS, TIDY OUTPUTS.',
    'A QUIET YES IS STILL YES.',
    'DO THE SIMPLE VERSION FIRST.',
    'THE SIGNAL IS IN THE NOISE.',
    'KEEP THE RECEIPT.',
    'CHECK THE OBVIOUS SETTING.',
    'SMALL HABITS, LARGE MAGIC.',
    'YOU CAN STOP OPTIMIZING.',
    'THE MACHINE IS FRIENDLY.',
  ];

  const poolN = 12;
  let pool = []; // chosen unique items from catalog
  let items = []; // current order (pool objects)
  let nextItems = [];
  let oldIndex = new Int16Array(poolN);

  // time structure
  const cycleLen = 26;
  const shuffleA = 10;
  const shuffleB = 14;
  const pickA = 14;
  const pickB = 18;
  const printA = 18;
  const dropA = 19;
  const dropB = 21;

  let cycleIndex = -1;
  let shuffledApplied = false;
  let printed = false;
  let selectedSlot = 0;
  let fortune = fortunes[0];

  // receipts (reuse small pool)
  const RMAX = 6;
  let receipts = []; // {on,t0,text,code}

  // special moments
  let nextGlitchAt = 0;
  let glitch = 0;

  // audio
  let drone = null;
  let noise = null;
  let musicHandle = null;

  function pick(arr, r){ return arr[(r() * arr.length) | 0]; }

  function safeBeep(opts){
    if (!audio.enabled) return;
    audio.beep(opts);
  }

  function initPool(){
    const used = new Set();
    pool = [];
    while (pool.length < poolN){
      const it = catalog[(rand() * catalog.length) | 0];
      if (used.has(it.id)) continue;
      used.add(it.id);
      pool.push(it);
    }
    items = pool.slice();
    // initial mild shuffle
    for (let i = items.length - 1; i > 0; i--){
      const j = (rand() * (i + 1)) | 0;
      const tmp = items[i];
      items[i] = items[j];
      items[j] = tmp;
    }
  }

  function layoutSlots(){
    const mx = w * 0.22;
    const my = h * 0.12;
    const mw = w * 0.56;
    const mh = h * 0.76;
    machine = { x: mx, y: my, w: mw, h: mh };

    glass = {
      x: mx + mw * 0.08,
      y: my + mh * 0.10,
      w: mw * 0.70,
      h: mh * 0.68,
    };

    chute = {
      x: glass.x,
      y: my + mh * 0.81,
      w: glass.w,
      h: mh * 0.10,
    };

    const cols = 4;
    const rows = 3;
    slots = [];

    const padX = glass.w * 0.06;
    const padY = glass.h * 0.10;
    const gapX = glass.w * 0.06;
    const gapY = glass.h * 0.10;

    const cellW = (glass.w - padX * 2 - gapX * (cols - 1)) / cols;
    const cellH = (glass.h - padY * 2 - gapY * (rows - 1)) / rows;

    for (let r = 0; r < rows; r++){
      for (let c = 0; c < cols; c++){
        slots.push({
          x: glass.x + padX + c * (cellW + gapX),
          y: glass.y + padY + r * (cellH + gapY),
          w: cellW,
          h: cellH,
        });
      }
    }
  }

  function initBokeh(){
    bokeh = Array.from({ length: 18 }, () => ({
      x: rand(),
      y: rand(),
      r: 0.02 + rand() * 0.08,
      z: 0.15 + rand() * 0.95,
      hue: 175 + rand() * 120,
    }));
  }

  function planCycle(){
    const r = mulberry32((seed ^ (cycleIndex * 0x9e3779b1)) >>> 0);

    nextItems = items.slice();
    // reshuffle like tarot cards
    for (let i = nextItems.length - 1; i > 0; i--){
      const j = (r() * (i + 1)) | 0;
      const tmp = nextItems[i];
      nextItems[i] = nextItems[j];
      nextItems[j] = tmp;
    }

    const oldPos = new Map();
    for (let i = 0; i < items.length; i++) oldPos.set(items[i].id, i);
    for (let j = 0; j < nextItems.length; j++) oldIndex[j] = oldPos.get(nextItems[j].id) ?? j;

    selectedSlot = (r() * poolN) | 0;
    fortune = fortunes[(r() * fortunes.length) | 0];

    shuffledApplied = false;
    printed = false;
  }

  function onResize(width, height){
    w = width;
    h = height;
    t = 0;
    receipts = [];
    glitch = 0;
    nextGlitchAt = 22 + rand() * 28;

    initPool();
    initBokeh();
    layoutSlots();

    cycleIndex = -1; // force plan on first update
  }

  function onAudioOn(){
    if (!audio.enabled) return;
    drone = simpleDrone(audio, { root: 62, detune: 1.2, gain: 0.045 });
    noise = audio.noiseSource({ type: 'pink', gain: 0.010 });
    try { noise.start(); } catch {}

    musicHandle = {
      stop(){
        try { drone?.stop?.(); } catch {}
        try { noise?.stop?.(); } catch {}
      },
    };
    audio.setCurrent(musicHandle);
  }

  function onAudioOff(){
    try { musicHandle?.stop?.(); } catch {}
    drone = null;
    noise = null;
    musicHandle = null;
  }

  function destroy(){
    onAudioOff();
  }

  function pushReceipt(text){
    // reuse if possible
    if (receipts.length >= RMAX) receipts.shift();
    const code = String(((seed ^ ((t * 1000) | 0)) >>> 0) % 100000).padStart(5, '0');
    receipts.push({ t0: t, text, code });
  }

  function update(dt){
    t += dt;
    glitch = Math.max(0, glitch - dt * 1.25);

    const newCycle = Math.floor(t / cycleLen);
    if (newCycle !== cycleIndex){
      cycleIndex = newCycle;
      planCycle();
    }

    const phase = t - cycleIndex * cycleLen;

    if (!shuffledApplied && phase >= shuffleB){
      items = nextItems;
      shuffledApplied = true;
    }

    if (!printed && phase >= printA){
      printed = true;
      pushReceipt(fortune);
      safeBeep({ freq: 740, dur: 0.05, gain: 0.012, type: 'square' });
      safeBeep({ freq: 520, dur: 0.08, gain: 0.010, type: 'triangle' });
    }

    if (t >= nextGlitchAt){
      glitch = 1;
      nextGlitchAt = t + 42 + rand() * 55;
      safeBeep({ freq: 1200, dur: 0.04, gain: 0.008, type: 'sawtooth' });
    }
  }

  function drawBackground(ctx){
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#050512');
    g.addColorStop(0.55, '#09061a');
    g.addColorStop(1, '#03020a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // neon fog
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = `rgba(120, 70, 255, ${0.05 + 0.02 * Math.sin(t * 0.4)})`;
    ctx.fillRect(0, h * 0.2, w, h * 0.6);
    ctx.fillStyle = `rgba(40, 220, 210, ${0.04 + 0.02 * Math.sin(t * 0.33 + 1.7)})`;
    ctx.fillRect(0, h * 0.25, w, h * 0.5);
    ctx.restore();

    // bokeh parallax
    for (const b of bokeh){
      const dx = (t * 0.014 * (0.2 + b.z)) % 1;
      const dy = (t * 0.010 * (0.15 + b.z)) % 1;
      const x = ((b.x + dx) % 1) * w;
      const y = ((b.y + dy) % 1) * h;
      const rr = b.r * Math.min(w, h) * (0.7 + 0.8 * b.z);
      const a = 0.05 + 0.09 * b.z;

      ctx.fillStyle = hsl(b.hue, 90, 60, a);
      ctx.beginPath();
      ctx.arc(x, y, rr, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  function drawMachine(ctx){
    const { x, y, w: mw, h: mh } = machine;

    // shadow
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(ctx, x + mw * 0.02, y + mh * 0.03, mw, mh, mw * 0.06);
    ctx.fill();
    ctx.restore();

    // body
    const bodyGrad = ctx.createLinearGradient(x, y, x + mw, y + mh);
    bodyGrad.addColorStop(0, '#1a1133');
    bodyGrad.addColorStop(0.6, '#100a22');
    bodyGrad.addColorStop(1, '#070512');
    ctx.fillStyle = bodyGrad;
    roundRect(ctx, x, y, mw, mh, mw * 0.06);
    ctx.fill();

    // neon edge
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.strokeStyle = `rgba(255, 80, 210, ${0.45 + 0.18 * Math.sin(t * 0.8)})`;
    ctx.lineWidth = Math.max(2, h / 240);
    ctx.shadowColor = 'rgba(255, 80, 210, 0.55)';
    ctx.shadowBlur = 18;
    roundRect(ctx, x, y, mw, mh, mw * 0.06);
    ctx.stroke();

    ctx.strokeStyle = `rgba(80, 240, 230, ${0.22 + 0.14 * Math.sin(t * 0.7 + 2.2)})`;
    ctx.shadowColor = 'rgba(80, 240, 230, 0.35)';
    ctx.shadowBlur = 16;
    roundRect(ctx, x + mw * 0.012, y + mh * 0.012, mw * 0.976, mh * 0.976, mw * 0.055);
    ctx.stroke();
    ctx.restore();

    // coin slot / keypad panel
    const px = x + mw * 0.82;
    const py = y + mh * 0.16;
    const pw = mw * 0.13;
    const ph = mh * 0.56;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    roundRect(ctx, px, py, pw, ph, mw * 0.03);
    ctx.fill();

    // tiny LEDs
    for (let i = 0; i < 9; i++){
      const lx = px + pw * 0.2 + (i % 3) * pw * 0.26;
      const ly = py + ph * 0.2 + ((i / 3) | 0) * ph * 0.08;
      const on = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * (0.9 + i * 0.12) + i * 2.2));
      ctx.fillStyle = `rgba(60, 240, 220, ${0.06 + 0.12 * on})`;
      ctx.fillRect(lx, ly, pw * 0.08, ph * 0.02);
    }

    // receipt printer
    const rx = px + pw * 0.08;
    const ry = y + mh * 0.78;
    const rw = pw * 0.84;
    const rh = mh * 0.16;
    ctx.fillStyle = 'rgba(0,0,0,0.5)';
    roundRect(ctx, rx, ry, rw, rh, mw * 0.02);
    ctx.fill();

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = 'rgba(255, 255, 255, 0.06)';
    ctx.fillRect(rx + rw * 0.1, ry + rh * 0.15, rw * 0.8, rh * 0.15);
    ctx.restore();
  }

  function drawItem(ctx, it, x, y, ww, hh, opts={}){
    const { glow=0, alpha=1, tilt=0 } = opts;

    ctx.save();
    ctx.globalAlpha = alpha;

    const cx = x + ww * 0.5;
    const cy = y + hh * 0.5;
    if (tilt !== 0){
      ctx.translate(cx, cy);
      ctx.rotate(tilt);
      ctx.translate(-cx, -cy);
    }

    // card
    const g = ctx.createLinearGradient(x, y, x + ww, y + hh);
    g.addColorStop(0, hsl(it.hue, 75, 26, 0.95));
    g.addColorStop(0.55, hsl(it.hue + 18, 85, 18, 0.95));
    g.addColorStop(1, 'rgba(0,0,0,0.65)');
    ctx.fillStyle = g;
    roundRect(ctx, x, y, ww, hh, Math.min(ww, hh) * 0.16);
    ctx.fill();

    // border glow
    if (glow > 0){
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.strokeStyle = hsl(it.hue, 90, 65, 0.25 + glow * 0.55);
      ctx.lineWidth = Math.max(2, hh / 22);
      ctx.shadowColor = hsl(it.hue, 95, 60, 0.45);
      ctx.shadowBlur = 14 + glow * 18;
      roundRect(ctx, x, y, ww, hh, Math.min(ww, hh) * 0.16);
      ctx.stroke();
      ctx.restore();
    }

    // label
    ctx.fillStyle = 'rgba(255,255,255,0.88)';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.floor(hh * 0.20)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    const lines = it.label.split(' ');
    if (lines.length >= 2){
      ctx.fillText(lines[0], x + ww * 0.5, y + hh * 0.46);
      ctx.fillText(lines.slice(1).join(' '), x + ww * 0.5, y + hh * 0.62);
    } else {
      ctx.fillText(it.label, x + ww * 0.5, y + hh * 0.54);
    }

    // shine
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.beginPath();
    ctx.moveTo(x + ww * 0.08, y + hh * 0.12);
    ctx.lineTo(x + ww * 0.52, y + hh * 0.12);
    ctx.lineTo(x + ww * 0.30, y + hh * 0.36);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    ctx.restore();
  }

  function drawInventory(ctx, phase){
    const sMix = ease((phase - shuffleA) / (shuffleB - shuffleA));
    const inShuffle = phase >= shuffleA && phase < shuffleB;

    // shelves
    ctx.save();
    ctx.strokeStyle = 'rgba(255,255,255,0.10)';
    ctx.lineWidth = Math.max(1, h / 520);
    for (let r = 0; r < 3; r++){
      const y = slots[r * 4].y + slots[r * 4].h + h * 0.01;
      ctx.beginPath();
      ctx.moveTo(glass.x + glass.w * 0.03, y);
      ctx.lineTo(glass.x + glass.w * 0.97, y);
      ctx.stroke();
    }
    ctx.restore();

    const pulse = 0.5 + 0.5 * Math.sin(t * 2.2);

    if (inShuffle){
      // draw each item once at interpolated position
      for (let j = 0; j < poolN; j++){
        const it = nextItems[j];
        const oi = oldIndex[j];
        const a = slots[oi];
        const b = slots[j];
        const x = lerp(a.x, b.x, sMix);
        const y = lerp(a.y, b.y, sMix);
        const tilt = (1 - sMix) * (0.10 * Math.sin((oi + 1) * 1.9)) + sMix * (0.08 * Math.sin((j + 3) * 2.1));
        drawItem(ctx, it, x, y, b.w, b.h, { alpha: 1, tilt });
      }
      return;
    }

    for (let i = 0; i < poolN; i++){
      const slot = slots[i];
      const it = items[i];

      // selection highlight
      let glow = 0;
      if (phase >= pickA && phase < pickB && i === selectedSlot){
        glow = 0.35 + 0.55 * pulse;
      }

      // dispense animation
      if (phase >= printA && i === selectedSlot){
        const dropT = ease((phase - dropA) / (dropB - dropA));
        const yoff = dropT * chute.h * 0.85;
        const a = 1 - dropT;
        drawItem(ctx, it, slot.x, slot.y + yoff, slot.w, slot.h, { alpha: a, glow: glow * 0.7, tilt: (dropT - 0.5) * 0.12 });
        continue;
      }

      drawItem(ctx, it, slot.x, slot.y, slot.w, slot.h, { glow });
    }
  }

  function drawGlass(ctx, phase){
    // glass plate
    ctx.save();
    ctx.fillStyle = 'rgba(10, 20, 30, 0.22)';
    roundRect(ctx, glass.x, glass.y, glass.w, glass.h, Math.min(glass.w, glass.h) * 0.04);
    ctx.fill();

    // subtle reflections
    ctx.globalCompositeOperation = 'screen';
    const shine = 0.06 + 0.03 * Math.sin(t * 0.8);
    ctx.fillStyle = `rgba(255,255,255,${shine})`;
    ctx.beginPath();
    ctx.moveTo(glass.x + glass.w * 0.10, glass.y + glass.h * 0.06);
    ctx.lineTo(glass.x + glass.w * 0.42, glass.y + glass.h * 0.06);
    ctx.lineTo(glass.x + glass.w * 0.20, glass.y + glass.h * 0.32);
    ctx.closePath();
    ctx.fill();

    // scanline
    const yy = glass.y + ((t * 26) % 1) * glass.h;
    ctx.fillStyle = 'rgba(80, 240, 230, 0.06)';
    ctx.fillRect(glass.x, yy, glass.w, Math.max(2, h / 260));

    // mystery spiral glitch
    if (glitch > 0){
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.translate(glass.x + glass.w * 0.52, glass.y + glass.h * 0.52);
      ctx.rotate(t * 0.7);
      ctx.strokeStyle = `rgba(255, 90, 220, ${0.05 + glitch * 0.22})`;
      ctx.lineWidth = Math.max(1, h / 520);
      ctx.beginPath();
      const turns = 5;
      const maxR = Math.min(glass.w, glass.h) * 0.48;
      for (let i = 0; i <= 240; i++){
        const u = i / 240;
        const ang = u * Math.PI * 2 * turns;
        const rr = u * maxR;
        const x = Math.cos(ang) * rr;
        const y = Math.sin(ang) * rr;
        if (i === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
      ctx.restore();

      // tiny chroma offset flash
      ctx.fillStyle = `rgba(80, 240, 230, ${0.02 + glitch * 0.06})`;
      ctx.fillRect(glass.x, glass.y, glass.w, glass.h);
    }

    ctx.restore();

    // chute window
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    roundRect(ctx, chute.x + chute.w * 0.05, chute.y, chute.w * 0.90, chute.h, chute.h * 0.35);
    ctx.fill();

    ctx.globalCompositeOperation = 'screen';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.10)';
    ctx.lineWidth = Math.max(1, h / 520);
    roundRect(ctx, chute.x + chute.w * 0.05, chute.y, chute.w * 0.90, chute.h, chute.h * 0.35);
    ctx.stroke();
    ctx.restore();
  }

  function drawReceipts(ctx){
    if (receipts.length === 0) return;

    const baseX = machine.x + machine.w * 0.84;
    const baseY = machine.y + machine.h * 0.82;
    const rw = machine.w * 0.12;

    for (let i = 0; i < receipts.length; i++){
      const r = receipts[i];
      const age = t - r.t0;
      const life = 10;
      if (age > life) continue;

      const out = ease(age / 1.1);
      const y = baseY + i * machine.h * 0.012 + out * machine.h * 0.08;
      const rh = machine.h * 0.11;

      ctx.save();
      ctx.fillStyle = 'rgba(240,240,240,0.92)';
      roundRect(ctx, baseX, y, rw, rh, rw * 0.08);
      ctx.fill();

      ctx.fillStyle = 'rgba(0,0,0,0.75)';
      ctx.textAlign = 'left';
      ctx.textBaseline = 'top';
      ctx.font = `${Math.floor(rh * 0.13)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.fillText('FORTUNE', baseX + rw * 0.10, y + rh * 0.10);

      ctx.font = `${Math.floor(rh * 0.12)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      const words = r.text.split(' ');
      let line = '';
      let yy = y + rh * 0.30;
      for (let wi = 0; wi < words.length; wi++){
        const test = (line ? line + ' ' : '') + words[wi];
        if (ctx.measureText(test).width > rw * 0.80){
          ctx.fillText(line, baseX + rw * 0.10, yy);
          yy += rh * 0.14;
          line = words[wi];
        } else {
          line = test;
        }
      }
      if (line) ctx.fillText(line, baseX + rw * 0.10, yy);

      ctx.globalAlpha = 0.65;
      ctx.fillText(`#${r.code}`, baseX + rw * 0.10, y + rh * 0.84);

      ctx.restore();
    }

    // clean expired (bounded)
    receipts = receipts.filter(r => (t - r.t0) <= 10.5);
  }

  function drawTitle(ctx){
    const size = Math.floor(h / 20);
    const x = w * 0.06;
    const y = h * 0.18;

    ctx.save();
    ctx.textBaseline = 'middle';

    ctx.font = `${Math.floor(size * 0.9)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = 'rgba(80, 240, 230, 0.95)';
    ctx.shadowColor = 'rgba(80, 240, 230, 0.55)';
    ctx.shadowBlur = 14;
    ctx.fillText('CH 02', x, y);

    const tagW = ctx.measureText('CH 02').width + 18;

    ctx.font = `${size}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = 'rgba(255, 90, 220, 0.92)';
    ctx.shadowColor = 'rgba(255, 90, 220, 0.55)';
    ctx.shadowBlur = 18;
    ctx.fillText('VENDING MACHINE ORACLE', x + tagW, y);

    ctx.shadowBlur = 0;
    ctx.font = `${Math.floor(size * 0.55)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = 'rgba(255,255,255,0.45)';
    ctx.fillText('items reshuffle • fortunes print', x, y + size * 1.2);

    ctx.restore();
  }

  function render(ctx){
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const phase = (t % cycleLen);

    drawBackground(ctx);
    drawMachine(ctx);

    // inventory behind glass
    drawInventory(ctx, phase);
    drawGlass(ctx, phase);
    drawReceipts(ctx);
    drawTitle(ctx);

    // tiny vignette
    ctx.save();
    const vg = ctx.createRadialGradient(w * 0.5, h * 0.55, Math.min(w, h) * 0.1, w * 0.5, h * 0.55, Math.min(w, h) * 0.7);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  function init({ width, height }){
    onResize(width, height);
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
