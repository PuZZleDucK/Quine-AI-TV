import { mulberry32, clamp } from '../util/prng.js';
import { simpleDrone } from '../util/audio.js';

function lerp(a, b, t){ return a + (b - a) * t; }
function ease(t){ t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }

export function createChannel({ seed, audio }){
  const baseRand = mulberry32(seed);

  let w = 0;
  let h = 0;
  let dpr = 1;

  let t = 0;
  let loopT = 0;
  let cycle = 0;

  // segments (seconds)
  const rotateDur = 7.5;
  const identifyDur = 9.0;
  const flipDur = 1.3;
  const settleDur = 6.2;
  const loopDur = rotateDur + identifyDur + flipDur + settleDur;

  // scene
  let cx = 0;
  let cy = 0;
  let r = 0;
  let vignette = null;

  let grains = []; // {pts:[{x,y}], ori, hue, name, size, cx, cy}
  let specks = []; // {x,y,a}
  let picks = []; // indices into grains

  // motion/state
  let stageTheta = 0;
  let stageVel = 0.22;
  let mode = 'ROTATE';

  let focusIdx = 0;
  let focusPulse = 0;

  let flipPulse = 0;
  let lastMode = '';

  // audio
  let drone = null;
  let musicHandle = null;

  function safeBeep(opts){ if (audio.enabled) audio.beep(opts); }

  function sceneInit(width, height, nextDpr){
    w = width;
    h = height;
    dpr = nextDpr || dpr;

    t = 0;
    loopT = 0;

    cx = w * 0.5;
    cy = h * 0.53;
    r = Math.min(w, h) * 0.33;

    // deterministic per-cycle content
    const prng = mulberry32((seed ^ (cycle * 2654435761)) >>> 0);

    // grains
    const minerals = [
      { name: 'Quartz', hue: 205 },
      { name: 'Feldspar', hue: 42 },
      { name: 'Biotite', hue: 285 },
      { name: 'Olivine', hue: 120 },
      { name: 'Calcite', hue: 12 },
      { name: 'Hornblende', hue: 165 },
    ];

    grains = [];
    const count = 18 + ((prng() * 8) | 0);
    for (let i = 0; i < count; i++){
      const m = minerals[(prng() * minerals.length) | 0];
      const gx = (prng() * 2 - 1) * 0.78;
      const gy = (prng() * 2 - 1) * 0.78;
      const size = 0.08 + prng() * 0.16;
      const n = 10 + ((prng() * 10) | 0);
      const rot = prng() * Math.PI * 2;

      const pts = [];
      for (let k = 0; k < n; k++){
        const a = rot + (k / n) * Math.PI * 2;
        const wob = 0.55 + prng() * 0.55;
        const rr = size * wob * (0.85 + 0.3 * Math.sin(a * (2 + prng() * 4)));
        pts.push({ x: gx + Math.cos(a) * rr, y: gy + Math.sin(a) * rr });
      }

      grains.push({
        pts,
        ori: prng() * Math.PI,
        hue: m.hue + (prng() * 70 - 35),
        name: m.name,
        size,
        cx: gx,
        cy: gy,
      });
    }

    // pick a few grains to label (largest first)
    picks = grains
      .map((g, idx) => ({ idx, size: g.size }))
      .sort((a, b) => b.size - a.size)
      .slice(0, 4)
      .map((o) => o.idx);

    focusIdx = 0;
    focusPulse = 0;

    // dust/specks
    specks = [];
    const spN = 420;
    for (let i = 0; i < spN; i++){
      const a = prng() * Math.PI * 2;
      const rr = Math.sqrt(prng()) * 0.98;
      specks.push({
        x: Math.cos(a) * rr,
        y: Math.sin(a) * rr,
        a: 0.12 + prng() * 0.25,
      });
    }

    // vignette cache
    vignette = document.createElement('canvas');
    vignette.width = Math.max(2, Math.floor(r * 2));
    vignette.height = Math.max(2, Math.floor(r * 2));
    const vg = vignette.getContext('2d');
    const grad = vg.createRadialGradient(r, r, r * 0.15, r, r, r);
    grad.addColorStop(0, 'rgba(0,0,0,0)');
    grad.addColorStop(0.7, 'rgba(0,0,0,0.06)');
    grad.addColorStop(1, 'rgba(0,0,0,0.55)');
    vg.fillStyle = grad;
    vg.fillRect(0, 0, r * 2, r * 2);
  }

  function onResize(width, height, nextDpr){
    sceneInit(width, height, nextDpr);
  }

  function init({ width, height, dpr: nextDpr }){
    sceneInit(width, height, nextDpr || 1);
  }

  function onAudioOn(){
    if (!audio.enabled) return;
    drone = simpleDrone(audio, { root: 55, detune: 1.0, gain: 0.045 });
    musicHandle = { stop(){ try { drone?.stop?.(); } catch {} } };
    audio.setCurrent(musicHandle);
  }

  function onAudioOff(){
    try { musicHandle?.stop?.(); } catch {}
    drone = null;
    musicHandle = null;
  }

  function destroy(){
    onAudioOff();
  }

  function update(dt){
    t += dt;
    loopT += dt;

    // segment mode
    const s0 = rotateDur;
    const s1 = rotateDur + identifyDur;
    const s2 = rotateDur + identifyDur + flipDur;

    if (loopT < s0) mode = 'ROTATE';
    else if (loopT < s1) mode = 'IDENTIFY';
    else if (loopT < s2) mode = 'PHASE FLIP';
    else mode = 'SETTLE';

    // stage velocity profile
    if (mode === 'ROTATE') stageVel = lerp(0.18, 0.28, ease(loopT / rotateDur));
    else if (mode === 'IDENTIFY') stageVel = 0.12;
    else if (mode === 'PHASE FLIP') stageVel = (Math.PI * 0.5) / flipDur;
    else stageVel = 0.08;

    stageTheta += stageVel * dt;

    // focus changes during identify
    if (mode === 'IDENTIFY' && picks.length){
      const local = loopT - rotateDur;
      const idx = Math.floor(local / 2.6) % picks.length;
      if (idx !== focusIdx){
        focusIdx = idx;
        focusPulse = 1;
        safeBeep({ freq: 880, dur: 0.04, gain: 0.018, type: 'sine' });
      }
    }
    focusPulse = Math.max(0, focusPulse - dt * 1.6);

    // special moment: phase flip entry
    if (mode !== lastMode){
      if (mode === 'PHASE FLIP'){
        flipPulse = 1;
        safeBeep({ freq: 520, dur: 0.09, gain: 0.03, type: 'triangle' });
        safeBeep({ freq: 780, dur: 0.06, gain: 0.018, type: 'square' });
      }
      lastMode = mode;
    }

    flipPulse = Math.max(0, flipPulse - dt * 2.2);

    // next cycle
    if (loopT >= loopDur){
      loopT -= loopDur;
      cycle++;
      sceneInit(w, h, dpr);
    }
  }

  function drawMicroscopeBody(ctx){
    // table
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#05070b');
    g.addColorStop(1, '#020305');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // soft lab glow
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const gg = ctx.createRadialGradient(cx, cy, 0, cx, cy, Math.max(w, h) * 0.7);
    gg.addColorStop(0, 'rgba(120, 220, 255, 0.08)');
    gg.addColorStop(0.55, 'rgba(140, 120, 255, 0.05)');
    gg.addColorStop(1, 'rgba(0, 0, 0, 0)');
    ctx.fillStyle = gg;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    // microscope silhouette (simple)
    ctx.save();
    ctx.translate(cx, cy);

    // base
    ctx.fillStyle = 'rgba(18, 24, 30, 0.95)';
    ctx.strokeStyle = 'rgba(170, 220, 255, 0.12)';
    ctx.lineWidth = Math.max(1, Math.floor(Math.min(w, h) * 0.002));

    ctx.beginPath();
    ctx.roundRect(-r * 1.05, r * 0.85, r * 2.1, r * 0.45, r * 0.12);
    ctx.fill();
    ctx.stroke();

    // arm
    ctx.fillStyle = 'rgba(12, 16, 22, 0.98)';
    ctx.beginPath();
    ctx.roundRect(-r * 0.9, -r * 0.2, r * 0.38, r * 1.15, r * 0.14);
    ctx.fill();

    // tube
    ctx.fillStyle = 'rgba(14, 18, 24, 0.98)';
    ctx.beginPath();
    ctx.roundRect(-r * 0.7, -r * 0.78, r * 0.55, r * 0.35, r * 0.12);
    ctx.fill();

    ctx.restore();
  }

  function render(ctx){
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    drawMicroscopeBody(ctx);

    // viewport / slide
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI * 2);
    ctx.clip();

    // slide background
    ctx.fillStyle = 'rgba(4, 6, 8, 1)';
    ctx.fillRect(cx - r, cy - r, r * 2, r * 2);

    // interference colors
    ctx.save();
    ctx.translate(cx, cy);

    // subtle scan drift in SETTLE
    const drift = mode === 'SETTLE' ? Math.sin(t * 0.4) * r * 0.02 : 0;
    ctx.translate(drift, -drift * 0.6);

    for (let i = 0; i < grains.length; i++){
      const g = grains[i];
      const inten = 0.18 + 0.82 * Math.abs(Math.sin(2 * stageTheta + g.ori));
      const hue = (g.hue + inten * 80 + 360) % 360;
      const sat = 78 + inten * 18;
      const lit = 20 + inten * 55;
      const alpha = 0.62 + inten * 0.32;

      ctx.beginPath();
      const p0 = g.pts[0];
      ctx.moveTo(p0.x * r, p0.y * r);
      for (let k = 1; k < g.pts.length; k++){
        const p = g.pts[k];
        ctx.lineTo(p.x * r, p.y * r);
      }
      ctx.closePath();

      ctx.fillStyle = `hsla(${hue}, ${sat}%, ${lit}%, ${alpha})`;
      ctx.fill();

      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.strokeStyle = 'rgba(0,0,0,0.55)';
      ctx.lineWidth = Math.max(1, r * 0.006);
      ctx.stroke();
      ctx.restore();

      // cleavage-ish lines
      ctx.save();
      ctx.globalAlpha = 0.12 + inten * 0.08;
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = Math.max(1, r * 0.002);
      const a = g.ori + Math.PI * 0.25;
      const len = r * g.size * 1.6;
      for (let n = -1; n <= 1; n++){
        const off = n * r * g.size * 0.22;
        ctx.beginPath();
        ctx.moveTo(g.cx * r + Math.cos(a + Math.PI / 2) * off - Math.cos(a) * len * 0.5,
                   g.cy * r + Math.sin(a + Math.PI / 2) * off - Math.sin(a) * len * 0.5);
        ctx.lineTo(g.cx * r + Math.cos(a + Math.PI / 2) * off + Math.cos(a) * len * 0.5,
                   g.cy * r + Math.sin(a + Math.PI / 2) * off + Math.sin(a) * len * 0.5);
        ctx.stroke();
      }
      ctx.restore();
    }

    // specks
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const s of specks){
      const px = s.x * r;
      const py = s.y * r;
      const a = s.a * (0.65 + 0.35 * (0.5 + 0.5 * Math.sin(t * 0.6 + (px + py) * 0.01)));
      ctx.fillStyle = `rgba(255,255,255,${a})`;
      ctx.fillRect(px, py, Math.max(1, r * 0.006), Math.max(1, r * 0.006));
    }
    ctx.restore();

    ctx.restore();

    // vignette overlay
    if (vignette){
      ctx.drawImage(vignette, cx - r, cy - r);
    }

    ctx.restore();

    // stage ring + ticks
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(stageTheta * 0.35);
    ctx.strokeStyle = 'rgba(210, 240, 255, 0.18)';
    ctx.lineWidth = Math.max(1, r * 0.01);
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.98, 0, Math.PI * 2);
    ctx.stroke();

    ctx.lineWidth = Math.max(1, r * 0.006);
    for (let i = 0; i < 24; i++){
      const a = (i / 24) * Math.PI * 2;
      const L = i % 6 === 0 ? r * 0.09 : r * 0.05;
      ctx.beginPath();
      ctx.moveTo(Math.cos(a) * (r * 0.93), Math.sin(a) * (r * 0.93));
      ctx.lineTo(Math.cos(a) * (r * 0.93 - L), Math.sin(a) * (r * 0.93 - L));
      ctx.stroke();
    }
    ctx.restore();

    // polarizer crosshair (fixed)
    ctx.save();
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = Math.max(1, r * 0.01);
    ctx.beginPath();
    ctx.moveTo(cx - r * 1.05, cy);
    ctx.lineTo(cx + r * 1.05, cy);
    ctx.moveTo(cx, cy - r * 1.05);
    ctx.lineTo(cx, cy + r * 1.05);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(160, 230, 255, 0.12)';
    ctx.lineWidth = Math.max(1, r * 0.003);
    ctx.stroke();
    ctx.restore();

    // labels/callouts
    if (mode === 'IDENTIFY' && picks.length){
      const idx = picks[focusIdx % picks.length];
      const g = grains[idx];
      if (g){
        const pulse = 0.35 + 0.65 * (1 - focusPulse);
        const tx = cx + g.cx * r + (g.cx > 0 ? r * 0.34 : -r * 0.34);
        const ty = cy + g.cy * r - r * 0.18;

        ctx.save();
        ctx.strokeStyle = `rgba(255, 255, 255, ${0.55 * pulse})`;
        ctx.fillStyle = `rgba(8, 10, 12, ${0.55 + 0.25 * pulse})`;
        ctx.lineWidth = Math.max(1, r * 0.006);

        // point on grain
        const px = cx + g.cx * r;
        const py = cy + g.cy * r;
        ctx.beginPath();
        ctx.arc(px, py, r * 0.035, 0, Math.PI * 2);
        ctx.stroke();

        // leader
        ctx.beginPath();
        ctx.moveTo(px, py);
        ctx.lineTo(tx, ty);
        ctx.stroke();

        // label box
        const font = Math.max(12, Math.floor(Math.min(w, h) * 0.018));
        ctx.font = `${font}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;
        const text = `${g.name}  \u2022  \u03b8 ${(stageTheta % (Math.PI * 2)) * 57.2958 | 0}\u00b0`;
        const pad = font * 0.55;
        const tw = ctx.measureText(text).width;
        const bw = tw + pad * 2;
        const bh = font + pad * 1.35;
        const bx = tx + (g.cx > 0 ? 0 : -bw);
        const by = ty - bh * 0.5;
        ctx.beginPath();
        ctx.roundRect(bx, by, bw, bh, Math.max(6, font * 0.45));
        ctx.fill();
        ctx.stroke();

        ctx.fillStyle = `rgba(230, 250, 255, ${0.9 * pulse})`;
        ctx.textBaseline = 'middle';
        ctx.fillText(text, bx + pad, by + bh * 0.5);
        ctx.restore();
      }
    }

    // HUD
    ctx.save();
    const hudFont = Math.max(12, Math.floor(Math.min(w, h) * 0.018));
    ctx.font = `${hudFont}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;
    ctx.textBaseline = 'top';
    ctx.fillStyle = 'rgba(210, 245, 255, 0.85)';
    ctx.fillText("GEOLOGIST'S POLARIZED MICROSCOPE", Math.floor(w * 0.05), Math.floor(h * 0.06));

    ctx.fillStyle = 'rgba(210, 245, 255, 0.6)';
    ctx.fillText(`MODE: ${mode}`, Math.floor(w * 0.05), Math.floor(h * 0.06) + hudFont * 1.35);

    const deg = ((stageTheta % (Math.PI * 2)) * 57.2958 + 360) % 360;
    ctx.fillText(`STAGE: ${deg | 0}\u00b0`, Math.floor(w * 0.05), Math.floor(h * 0.06) + hudFont * 2.55);
    ctx.restore();

    // phase flip flash
    if (flipPulse > 0){
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = `rgba(255, 230, 180, ${flipPulse * 0.14})`;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
