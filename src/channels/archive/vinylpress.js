import { mulberry32, clamp } from '../../util/prng.js';
import { simpleDrone } from '../../util/audio.js';

// Vinyl Pressing Plant
// Heat → Press → Cool → Sleeve. Includes QC waveform + “perfect press” glint.

function pick(rand, arr){ return arr[(rand() * arr.length) | 0]; }
function lerp(a, b, t){ return a + (b - a) * t; }
function ease(t){ t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }

function roundRect(ctx, x, y, w, h, r){
  r = Math.max(0, Math.min(r, Math.min(w, h) * 0.5));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fract(x){ return x - Math.floor(x); }
function hash01(x){ return fract(Math.sin(x) * 43758.5453123); }

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0;
  let h = 0;
  let dpr = 1;
  let t = 0;

  // typography
  let font = 16;
  let small = 12;
  let mono = 13;

  const palettes = [
    { bg0: '#06090d', bg1: '#0c1119', metal0: '#141b23', metal1: '#1f2832', press: '#2a3440', ink: 'rgba(240,248,255,0.88)', sub: 'rgba(240,248,255,0.62)', accent: '#ff4f86', ok: '#7cffc9', warn: '#ffd36a', steam: 'rgba(255,255,255,0.10)' },
    { bg0: '#070610', bg1: '#140a1a', metal0: '#201626', metal1: '#2d1b33', press: '#382040', ink: 'rgba(255,244,251,0.88)', sub: 'rgba(255,244,251,0.62)', accent: '#7dff67', ok: '#68ffb6', warn: '#ff78d2', steam: 'rgba(255,255,255,0.10)' },
    { bg0: '#050b0a', bg1: '#0b1612', metal0: '#14241d', metal1: '#1b2f26', press: '#1f3a2e', ink: 'rgba(245,255,252,0.88)', sub: 'rgba(245,255,252,0.60)', accent: '#6cf2ff', ok: '#7cffc9', warn: '#ffd26a', steam: 'rgba(255,255,255,0.10)' },
  ];
  const pal = pick(rand, palettes);

  // phases
  const DUR_HEAT = 10;
  const DUR_PRESS = 12;
  const DUR_COOL = 10;
  const DUR_SLEEVE = 8;
  const CYCLE = DUR_HEAT + DUR_PRESS + DUR_COOL + DUR_SLEEVE;

  function phaseInfo(tt){
    const m = ((tt % CYCLE) + CYCLE) % CYCLE;
    if (m < DUR_HEAT) return { id: 'heat', t: m, dur: DUR_HEAT, label: 'HEAT' };
    if (m < DUR_HEAT + DUR_PRESS) return { id: 'press', t: m - DUR_HEAT, dur: DUR_PRESS, label: 'PRESS' };
    if (m < DUR_HEAT + DUR_PRESS + DUR_COOL) return { id: 'cool', t: m - DUR_HEAT - DUR_PRESS, dur: DUR_COOL, label: 'COOL' };
    return { id: 'sleeve', t: m - DUR_HEAT - DUR_PRESS - DUR_COOL, dur: DUR_SLEEVE, label: 'SLEEVE' };
  }

  // layout
  let pressArea = { x: 0, y: 0, w: 0, h: 0 };
  let qc = { x: 0, y: 0, w: 0, h: 0 };

  // scene state
  let cycleIndex = 0;
  let lastPhaseId = 'heat';

  let platen = 0;   // 0 open .. 1 closed
  let heatGlow = 0;
  let steamAcc = 0;
  let glint = 0;
  let glintArmed = true;

  let conveyor = 0; // 0..1 for sleeve phase
  let recordSpin = 0;

  // steam particles (fixed pool)
  const MAX_STEAM = 44;
  let steam = [];

  // audio
  let hum = null;
  let hiss = null;
  let audioHandle = null;
  let thumpTimer = 0;

  function safeBeep(opts){ if (audio.enabled) audio.beep(opts); }

  function initSteam(){
    steam = Array.from({ length: MAX_STEAM }, () => ({
      x: 0, y: 0, vx: 0, vy: 0, life: 0,
      r: 4,
    }));
  }

  function spawnSteam(n = 2, strength = 1){
    // reuse dead particles; keep deterministic selection by scanning forward.
    const cx = pressArea.x + pressArea.w * (0.48 + 0.04 * Math.sin(t * 0.6));
    const cy = pressArea.y + pressArea.h * 0.40;

    for (let k = 0; k < n; k++){
      for (let i = 0; i < steam.length; i++){
        const p = steam[i];
        if (p.life > 0) continue;
        const a = (-Math.PI / 2) + (rand() * 2 - 1) * 0.55;
        const sp = (40 + rand() * 85) * strength;
        p.x = cx + (rand() * 2 - 1) * pressArea.w * 0.05;
        p.y = cy + (rand() * 2 - 1) * pressArea.h * 0.03;
        p.vx = Math.cos(a) * sp;
        p.vy = Math.sin(a) * sp - (40 + rand() * 60) * strength;
        p.life = 0.7 + rand() * 0.6;
        p.r = (6 + rand() * 12) * (0.7 + 0.5 * strength);
        break;
      }
    }
  }

  function onResize(width, height, devicePixelRatio){
    w = width;
    h = height;
    dpr = devicePixelRatio || 1;

    font = Math.max(14, Math.floor(Math.min(w, h) * 0.030));
    small = Math.max(11, Math.floor(font * 0.78));
    mono = Math.max(11, Math.floor(font * 0.82));

    const pad = Math.floor(Math.min(w, h) * 0.07);
    const pw = Math.floor(Math.min(w * 0.72, h * 0.78));
    const ph = Math.floor(pw * 0.78);

    pressArea = {
      x: Math.floor((w - pw) * 0.45),
      y: Math.floor((h - ph) * 0.54),
      w: pw,
      h: ph,
    };

    qc = {
      w: Math.floor(Math.min(w * 0.32, 420)),
      h: Math.floor(Math.min(h * 0.18, 180)),
      x: Math.floor(w - pad - Math.min(w * 0.32, 420)),
      y: pad,
    };

    initSteam();
  }

  function init({ width, height, dpr: dprIn }){
    t = 0;
    cycleIndex = 0;
    lastPhaseId = 'heat';

    platen = 0;
    heatGlow = 0;
    steamAcc = 0;
    glint = 0;
    glintArmed = true;
    conveyor = 0;
    recordSpin = 0;
    thumpTimer = 0;

    onResize(width, height, dprIn || 1);
  }

  function onAudioOn(){
    if (!audio.enabled) return;
    hum = simpleDrone(audio, { root: 42 + ((rand() * 10) | 0), detune: 1.1, gain: 0.045 });
    hiss = audio.noiseSource({ type: 'pink', gain: 0.014 });
    hiss.start();
    audioHandle = {
      stop(){
        try { hum?.stop?.(); } catch {}
        try { hiss?.stop?.(); } catch {}
      }
    };
    audio.setCurrent(audioHandle);
  }

  function onAudioOff(){
    try { audioHandle?.stop?.(); } catch {}
    hum = null;
    hiss = null;
    audioHandle = null;
  }

  function destroy(){
    onAudioOff();
  }

  function update(dt){
    t += dt;

    // cycle detection (for one-shot events)
    const ci = Math.floor(t / CYCLE);
    if (ci !== cycleIndex){
      cycleIndex = ci;
      glintArmed = true;
    }

    const ph = phaseInfo(t);

    // transitions
    if (ph.id !== lastPhaseId){
      if (audio.enabled){
        const f = ph.id === 'press' ? 140 : ph.id === 'cool' ? 520 : ph.id === 'sleeve' ? 780 : 360;
        safeBeep({ freq: f, dur: 0.05, gain: 0.02, type: 'square' });
      }
      lastPhaseId = ph.id;
      if (ph.id === 'sleeve') conveyor = 0;
    }

    // core motion
    const p = clamp(ph.t / ph.dur, 0, 1);

    if (ph.id === 'heat'){
      platen = lerp(platen, 0.08, 1 - Math.pow(0.0008, dt));
      heatGlow = lerp(heatGlow, 0.85, 1 - Math.pow(0.001, dt));
    } else if (ph.id === 'press'){
      // close fast then settle
      const close = p < 0.22 ? ease(p / 0.22) : 1;
      platen = lerp(platen, close, 1 - Math.pow(0.0003, dt));
      heatGlow = lerp(heatGlow, 0.55, 1 - Math.pow(0.0012, dt));

      // steam + thumps
      steamAcc += dt * (2.4 + 1.6 * (0.5 + 0.5 * Math.sin(t * 2.4)));
      while (steamAcc >= 1){
        steamAcc -= 1;
        spawnSteam(1, 0.7 + 0.6 * (0.5 + 0.5 * Math.sin(t * 1.4)));
      }

      thumpTimer -= dt;
      if (thumpTimer <= 0){
        thumpTimer = 0.55 + rand() * 0.25;
        safeBeep({ freq: 88 + rand() * 20, dur: 0.06, gain: 0.028, type: 'square' });
      }

      // perfect press glint near the end
      if (glintArmed && p > 0.90){
        glintArmed = false;
        glint = 1;
        safeBeep({ freq: 1260, dur: 0.08, gain: 0.05, type: 'sine' });
        safeBeep({ freq: 820, dur: 0.10, gain: 0.03, type: 'triangle' });
      }

    } else if (ph.id === 'cool'){
      const open = p < 0.6 ? ease(p / 0.6) : 1;
      platen = lerp(platen, 1 - open, 1 - Math.pow(0.0006, dt));
      heatGlow = lerp(heatGlow, 0.15, 1 - Math.pow(0.001, dt));
      // occasional last wisp
      if (p < 0.25) spawnSteam(rand() < 0.25 ? 1 : 0, 0.45);
    } else {
      platen = lerp(platen, 0.06, 1 - Math.pow(0.0009, dt));
      heatGlow = lerp(heatGlow, 0.10, 1 - Math.pow(0.001, dt));
      conveyor = clamp(conveyor + dt / ph.dur, 0, 1);
    }

    glint = Math.max(0, glint - dt * 1.25);

    // record spin (slower during press)
    const spinRate = ph.id === 'press' ? 0.45 : ph.id === 'sleeve' ? 0.20 : 0.8;
    recordSpin = (recordSpin + dt * spinRate) % (Math.PI * 2);

    // steam update
    for (const p0 of steam){
      if (p0.life <= 0) continue;
      p0.life -= dt;
      p0.x += p0.vx * dt;
      p0.y += p0.vy * dt;
      // rise + drift
      p0.vx *= Math.pow(0.25, dt);
      p0.vy = p0.vy * Math.pow(0.18, dt) - 32 * dt;
      if (p0.life <= 0) p0.life = 0;
    }
  }

  function drawBackground(ctx){
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, pal.bg0);
    g.addColorStop(1, pal.bg1);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // subtle factory stripes
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.translate(0, (t * 22) % 42);
    ctx.fillStyle = '#000';
    for (let y = -80; y < h + 80; y += 42){
      ctx.fillRect(0, y, w, 10);
    }
    ctx.restore();
  }

  function drawMachine(ctx, ph){
    const x = pressArea.x;
    const y = pressArea.y;
    const ww = pressArea.w;
    const hh = pressArea.h;

    const baseH = hh * 0.24;
    const headH = hh * 0.18;

    const cx = x + ww * 0.46;
    const cy = y + hh * 0.52;
    const r = Math.min(ww, hh) * 0.20;

    // base platform
    ctx.save();
    ctx.fillStyle = pal.metal1;
    roundRect(ctx, x + ww * 0.10, y + hh * 0.70, ww * 0.72, baseH, 18);
    ctx.fill();

    // base highlight
    const bg = ctx.createLinearGradient(0, y + hh * 0.70, 0, y + hh * 0.70 + baseH);
    bg.addColorStop(0, 'rgba(255,255,255,0.06)');
    bg.addColorStop(1, 'rgba(0,0,0,0.18)');
    ctx.fillStyle = bg;
    ctx.fillRect(x + ww * 0.10, y + hh * 0.70, ww * 0.72, baseH);

    // press pillars
    ctx.fillStyle = pal.metal0;
    const pW = ww * 0.065;
    const pH = hh * 0.60;
    roundRect(ctx, x + ww * 0.18, y + hh * 0.18, pW, pH, 10);
    ctx.fill();
    roundRect(ctx, x + ww * 0.70, y + hh * 0.18, pW, pH, 10);
    ctx.fill();

    // record disc (under platen)
    ctx.save();
    const recordY = cy + hh * 0.05;
    ctx.translate(cx, recordY);

    // shadow
    ctx.globalAlpha = 0.20;
    ctx.fillStyle = 'rgba(0,0,0,0.7)';
    ctx.beginPath();
    ctx.ellipse(4, r * 0.85, r * 1.05, r * 0.44, 0, 0, Math.PI * 2);
    ctx.fill();

    // vinyl
    ctx.globalAlpha = 0.96;
    ctx.fillStyle = 'rgba(8,10,14,0.92)';
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, Math.PI * 2);
    ctx.fill();

    // grooves
    ctx.save();
    ctx.globalAlpha = 0.20;
    ctx.strokeStyle = 'rgba(255,255,255,0.12)';
    ctx.lineWidth = Math.max(1, Math.floor(1.2 * dpr));
    const rings = 8;
    for (let i = 0; i < rings; i++){
      const rr = r * (0.28 + (i / rings) * 0.66);
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, Math.PI * 2);
      ctx.stroke();
    }
    ctx.restore();

    // label
    ctx.rotate(recordSpin);
    const labR = r * 0.32;
    const labG = ctx.createRadialGradient(0, 0, 1, 0, 0, labR * 1.2);
    labG.addColorStop(0, pal.accent);
    labG.addColorStop(1, 'rgba(255,255,255,0.08)');
    ctx.fillStyle = labG;
    ctx.beginPath();
    ctx.arc(0, 0, labR, 0, Math.PI * 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.arc(0, 0, labR * 0.18, 0, Math.PI * 2);
    ctx.fill();

    // label ticks
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = 'rgba(255,255,255,0.20)';
    ctx.lineWidth = Math.max(1, Math.floor(1.0 * dpr));
    for (let i = 0; i < 10; i++){
      const a = (i / 10) * Math.PI * 2;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * labR * 0.62, Math.sin(a) * labR * 0.62);
      ctx.lineTo(Math.cos(a) * labR * 0.90, Math.sin(a) * labR * 0.90);
      ctx.stroke();
    }

    ctx.restore();

    // platen head (moves with platen)
    const openY = y + hh * 0.20;
    const closedY = y + hh * 0.33;
    const headY = lerp(openY, closedY, platen);

    ctx.save();
    ctx.fillStyle = pal.press;
    roundRect(ctx, x + ww * 0.20, headY, ww * 0.60, headH, 16);
    ctx.fill();

    // heater glow
    const glow = heatGlow * (0.6 + 0.4 * (0.5 + 0.5 * Math.sin(t * 2.6)));
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = `rgba(255, 110, 80, ${0.06 + 0.16 * glow})`;
    roundRect(ctx, x + ww * 0.22, headY + headH * 0.62, ww * 0.56, headH * 0.20, 10);
    ctx.fill();

    // small bolts
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    const boltY = headY + headH * 0.22;
    for (let i = 0; i < 6; i++){
      const bx = x + ww * (0.26 + i * 0.10);
      ctx.beginPath();
      ctx.arc(bx, boltY, 2.2 * dpr, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();

    // sleeve / conveyor (right side)
    ctx.save();
    const beltX = x + ww * 0.62;
    const beltY = y + hh * 0.72;
    const beltW = ww * 0.30;
    const beltH = hh * 0.12;

    // belt bed
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = pal.metal0;
    roundRect(ctx, beltX, beltY, beltW, beltH, 14);
    ctx.fill();

    // belt stripes
    ctx.save();
    ctx.clip();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    const off = (t * 90) % 48;
    for (let xx = beltX - 100; xx < beltX + beltW + 100; xx += 48){
      ctx.fillRect(xx - off, beltY, 18, beltH);
    }
    ctx.restore();

    // sleeve card
    const sleeveX = beltX + beltW * 0.78;
    const sleeveY = beltY - beltH * 0.72;
    const sleeveW = beltW * 0.40;
    const sleeveH = beltH * 2.1;

    ctx.globalAlpha = 0.92;
    ctx.fillStyle = 'rgba(255,255,255,0.06)';
    roundRect(ctx, sleeveX, sleeveY, sleeveW, sleeveH, 10);
    ctx.fill();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.lineWidth = Math.max(1, Math.floor(1.2 * dpr));
    ctx.stroke();

    // sleeve label stamp moment
    if (ph.id === 'sleeve'){
      const p2 = ease(clamp(ph.t / ph.dur, 0, 1));
      const stampDown = p2 < 0.35 ? ease(p2 / 0.35) : (p2 < 0.55 ? 1 : 1 - ease((p2 - 0.55) / 0.45));
      const sx = sleeveX + sleeveW * 0.52;
      const sy = sleeveY + sleeveH * 0.22 + (1 - stampDown) * 16 * dpr;
      ctx.save();
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = pal.accent;
      roundRect(ctx, sx - sleeveW * 0.26, sy, sleeveW * 0.52, sleeveH * 0.14, 8);
      ctx.fill();
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.font = `800 ${Math.floor(small * 0.9)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(rand() < 0.5 ? 'SIDE A' : 'SIDE B', sx, sy + sleeveH * 0.07);
      ctx.restore();
    }

    // record traveling on belt during sleeve
    if (ph.id === 'sleeve'){
      const p3 = ease(conveyor);
      const rx = lerp(cx + ww * 0.18, sleeveX + sleeveW * 0.20, p3);
      const ry = lerp(recordY + hh * 0.20, beltY + beltH * 0.50, p3);
      const rr = r * (1 - 0.18 * p3);

      ctx.save();
      ctx.translate(rx, ry);
      ctx.globalAlpha = 0.90;
      ctx.fillStyle = 'rgba(10,12,16,0.9)';
      ctx.beginPath();
      ctx.arc(0, 0, rr, 0, Math.PI * 2);
      ctx.fill();

      ctx.globalAlpha = 0.20;
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = Math.max(1, Math.floor(1.0 * dpr));
      ctx.beginPath();
      ctx.arc(0, 0, rr * 0.72, 0, Math.PI * 2);
      ctx.stroke();

      ctx.restore();
    }

    ctx.restore();

    // perfect press glint
    if (glint > 0.01){
      const gx = cx + ww * 0.05;
      const gy = recordY - r * 0.35;
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.55 * glint;
      ctx.strokeStyle = pal.ok;
      ctx.lineWidth = Math.max(1, Math.floor(2.0 * dpr));
      ctx.beginPath();
      ctx.moveTo(gx - 40 * dpr, gy);
      ctx.lineTo(gx + 60 * dpr, gy);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(gx, gy - 26 * dpr);
      ctx.lineTo(gx, gy + 26 * dpr);
      ctx.stroke();
      ctx.restore();
    }

    ctx.restore();
  }

  function drawSteam(ctx){
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const p0 of steam){
      if (p0.life <= 0) continue;
      const a = clamp(p0.life / 1.2, 0, 1);
      ctx.globalAlpha = 0.22 * a;
      ctx.fillStyle = pal.steam;
      ctx.beginPath();
      ctx.arc(p0.x, p0.y, p0.r * dpr * (0.7 + 0.5 * (1 - a)), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawQC(ctx, ph){
    // QC panel (waveform + stamps)
    ctx.save();
    ctx.globalAlpha = 0.92;
    roundRect(ctx, qc.x, qc.y, qc.w, qc.h, 14);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,0.14)';
    ctx.lineWidth = Math.max(1, Math.floor(1.2 * dpr));
    ctx.stroke();

    const ix = qc.x + 14;
    const iy = qc.y + 12;

    ctx.fillStyle = pal.ink;
    ctx.font = `800 ${small}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    ctx.fillText('QC PANEL', ix, iy);

    ctx.globalAlpha = 0.75;
    ctx.fillStyle = pal.sub;
    ctx.font = `700 ${Math.floor(small * 0.92)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText(`PHASE: ${ph.label}`, ix, iy + small + 6);

    // waveform area
    const wx = ix;
    const wy = iy + small * 2 + 14;
    const ww = qc.w - 28;
    const wh = qc.h - (small * 2 + 28);

    ctx.globalAlpha = 0.10;
    ctx.strokeStyle = 'rgba(255,255,255,0.16)';
    ctx.beginPath();
    for (let i = 0; i <= 4; i++){
      const yy = wy + (i / 4) * wh;
      ctx.moveTo(wx, yy);
      ctx.lineTo(wx + ww, yy);
    }
    ctx.stroke();

    // waveform (deterministic time function, dt-independent)
    const speed = ph.id === 'press' ? 3.0 : ph.id === 'heat' ? 1.8 : 2.2;
    const off = t * speed;

    const amp = ph.id === 'press' ? 0.95 : ph.id === 'heat' ? 0.45 : ph.id === 'cool' ? 0.35 : 0.55;
    const ok = (ph.id !== 'heat') || (ph.t / ph.dur > 0.45);

    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = ok ? pal.ok : pal.warn;
    ctx.lineWidth = Math.max(1, Math.floor(1.6 * dpr));
    ctx.beginPath();
    for (let i = 0; i <= 48; i++){
      const u = i / 48;
      const x = wx + u * ww;
      const s = off + u * 8;
      const n = (hash01((seed + 1) * 0.0003 + Math.floor(s * 6)) - 0.5) * 0.45;
      const v = (Math.sin(s * 2.1) * 0.52 + Math.sin(s * 0.72 + 1.2) * 0.35 + n) * amp;
      const y = wy + wh * 0.5 - v * wh * 0.32;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // status stamp
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = ok ? pal.ok : pal.warn;
    ctx.font = `900 ${Math.floor(small * 0.95)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textAlign = 'right';
    ctx.textBaseline = 'top';
    ctx.fillText(ok ? 'OK' : 'CHECK', qc.x + qc.w - 14, iy);

    ctx.restore();
  }

  function render(ctx){
    const ph = phaseInfo(t);

    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    drawBackground(ctx);

    // floor glow
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const glow = 0.06 + 0.06 * (0.5 + 0.5 * Math.sin(t * 0.8));
    ctx.fillStyle = `rgba(120, 210, 255, ${glow})`;
    ctx.fillRect(0, Math.floor(h * 0.76), w, Math.floor(h * 0.24));
    ctx.restore();

    drawMachine(ctx, ph);
    drawSteam(ctx);
    drawQC(ctx, ph);

    // HUD title
    ctx.save();
    ctx.fillStyle = pal.ink;
    ctx.globalAlpha = 0.92;
    ctx.font = `800 ${font}px system-ui, -apple-system, Segoe UI, Roboto, Ubuntu, Cantarell, Noto Sans, sans-serif`;
    ctx.textBaseline = 'top';
    ctx.textAlign = 'left';
    const hx = Math.floor(w * 0.06);
    const hy = Math.floor(h * 0.08);
    ctx.fillText('Vinyl Pressing Plant', hx, hy);

    ctx.globalAlpha = 0.72;
    ctx.fillStyle = pal.sub;
    ctx.font = `700 ${small}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText(`PHASE: ${ph.label}`, hx, hy + font + 6);

    const mm = Math.floor((t % CYCLE) / 60);
    const ss = Math.floor((t % CYCLE) % 60).toString().padStart(2, '0');
    ctx.fillText(`CYCLE: ${mm}:${ss} / ${CYCLE}s`, hx, hy + font + 6 + small + 6);

    // footer hint
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = pal.sub;
    ctx.font = `${mono}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'bottom';
    ctx.fillText('Watch the QC waveform and glint.', hx, Math.floor(h * 0.95));

    ctx.restore();
  }

  // compatibility: many existing channels use draw() instead of render().
  function draw(ctx){ render(ctx); }

  return { init, update, render, draw, onResize, onAudioOn, onAudioOff, destroy };
}
