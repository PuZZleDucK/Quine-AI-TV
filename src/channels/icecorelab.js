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

  // Scene
  let core = null; // {x,y,w,h,r}
  let layers = []; // [{y0,y1, tone, ash}]
  let dust = []; // [{x,y,z,a}]

  // UI panel
  let panel = null; // {x,y,w,h}
  let chart = []; // [{x,y}] in panel coords (0..1)

  // Loop timing
  const scanDur = 11;
  const cutDur = 9;
  const analyzeDur = 12;
  const volcanoDur = 9;
  const loopDur = scanDur + cutDur + analyzeDur + volcanoDur;

  let mode = 'SCAN';
  let lastMode = '';

  // Effects
  let glint = 0;
  let nextGlintAt = 0;
  let volcanoPulse = 0;

  // Audio
  let drone = null;
  let noise = null;
  let musicHandle = null;

  function safeBeep(opts){ if (audio.enabled) audio.beep(opts); }

  function pick(arr, r){ return arr[(r() * arr.length) | 0]; }

  function sceneInit(width, height, nextDpr){
    w = width;
    h = height;
    dpr = nextDpr || dpr;

    t = 0;
    loopT = 0;

    // Deterministic per-cycle content.
    const r = mulberry32((seed ^ (cycle * 2654435761)) >>> 0);

    // Layout
    const margin = Math.min(w, h) * 0.06;
    const panelW = Math.min(w * 0.34, Math.max(220, w * 0.28));
    panel = {
      x: w - panelW - margin,
      y: margin,
      w: panelW,
      h: h - margin * 2,
    };

    const coreW = Math.min(w * 0.22, Math.max(120, w * 0.18));
    const coreH = Math.min(h * 0.78, Math.max(220, h * 0.72));
    core = {
      x: margin + coreW * 0.15,
      y: h * 0.5 - coreH * 0.5,
      w: coreW,
      h: coreH,
      r: coreW * 0.22,
    };

    // Layers: thin stratified bands.
    layers = [];
    const target = 44 + ((r() * 16) | 0);
    let y = 0;

    // Volcanic ash layer(s)
    const volcanoIdx = 10 + ((r() * (target - 20)) | 0);
    const volcanoIdx2 = r() < 0.35 ? (6 + ((r() * (target - 12)) | 0)) : -1;

    for (let i = 0; i < target; i++){
      const thick = (0.012 + r() * 0.03) * (1 + 0.55 * Math.sin(i * 0.33 + r() * 1.1));
      const y0 = y;
      y = Math.min(1, y + thick);
      const y1 = y;

      const cold = 190 + r() * 35;
      const lum = 70 + r() * 18;
      const sat = 12 + r() * 10;
      const ash = (i === volcanoIdx || i === volcanoIdx2);

      layers.push({
        y0,
        y1,
        tone: { h: cold, s: sat, l: lum },
        ash,
      });

      if (y >= 1) break;
    }

    // Fill remainder if we ended early.
    if (layers.length){
      layers[layers.length - 1].y1 = 1;
    }

    // Chart: pretend isotope ratio line; derived from layers.
    const n = 42;
    chart = [];
    let v = 0.5 + r() * 0.2;
    for (let i = 0; i < n; i++){
      const x = i / (n - 1);
      const drift = (r() * 2 - 1) * 0.08;
      v = clamp(v * 0.92 + 0.08 * (0.5 + drift), 0.12, 0.88);
      chart.push({ x, y: v });
    }

    // Dust/parallax specks
    dust = [];
    const dn = 180;
    for (let i = 0; i < dn; i++){
      dust.push({
        x: r() * w,
        y: r() * h,
        z: 0.25 + r() * 1.2,
        a: 0.04 + r() * 0.12,
      });
    }

    glint = 0;
    volcanoPulse = 0;
    nextGlintAt = 2.5 + r() * 4.5;
  }

  function onResize(width, height, nextDpr){
    sceneInit(width, height, nextDpr);
  }

  function init({ width, height, dpr: nextDpr }){
    sceneInit(width, height, nextDpr || 1);
  }

  function onAudioOn(){
    if (!audio.enabled) return;
    drone = simpleDrone(audio, { root: 52, detune: 0.9, gain: 0.04 });
    noise = audio.noiseSource({ type: 'pink', gain: 0.02 });
    try { noise.start(); } catch {}

    musicHandle = {
      stop(){
        try { drone?.stop?.(); } catch {}
        try { noise?.stop?.(); } catch {}
      }
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

  function update(dt){
    t += dt;
    loopT += dt;

    // Modes
    const s0 = scanDur;
    const s1 = scanDur + cutDur;
    const s2 = scanDur + cutDur + analyzeDur;

    if (loopT < s0) mode = 'SCAN';
    else if (loopT < s1) mode = 'CUT';
    else if (loopT < s2) mode = 'ANALYZE';
    else mode = 'VOLCANO';

    if (mode !== lastMode){
      if (mode === 'CUT'){
        safeBeep({ freq: 520, dur: 0.05, gain: 0.03, type: 'square' });
      } else if (mode === 'ANALYZE'){
        safeBeep({ freq: 660, dur: 0.05, gain: 0.02, type: 'triangle' });
      } else if (mode === 'VOLCANO'){
        volcanoPulse = 1;
        safeBeep({ freq: 240, dur: 0.08, gain: 0.035, type: 'sine' });
        safeBeep({ freq: 380, dur: 0.06, gain: 0.02, type: 'square' });
      } else if (mode === 'SCAN'){
        safeBeep({ freq: 880, dur: 0.03, gain: 0.012, type: 'sine' });
      }
      lastMode = mode;
    }

    volcanoPulse = Math.max(0, volcanoPulse - dt * 0.85);

    glint = Math.max(0, glint - dt * 1.7);
    if (loopT >= nextGlintAt){
      glint = 1;
      nextGlintAt = loopT + 5.5 + baseRand() * 7;
      if (audio.enabled) safeBeep({ freq: 990, dur: 0.03, gain: 0.012, type: 'sine' });
    }

    // Next cycle
    if (loopT >= loopDur){
      loopT -= loopDur;
      cycle++;
      sceneInit(w, h, dpr);
    }
  }

  function drawBackground(ctx){
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#05070b');
    g.addColorStop(0.55, '#04070c');
    g.addColorStop(1, '#020406');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // Lab glow
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const rg = ctx.createRadialGradient(w * 0.35, h * 0.45, 0, w * 0.35, h * 0.45, Math.max(w, h) * 0.8);
    rg.addColorStop(0, 'rgba(140, 220, 255, 0.07)');
    rg.addColorStop(0.55, 'rgba(120, 140, 255, 0.04)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    // Dust parallax
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const p of dust){
      const px = (p.x + t * 12 * p.z) % (w + 2);
      const py = (p.y + t * 4 * p.z) % (h + 2);
      ctx.fillStyle = `rgba(220, 245, 255, ${p.a})`;
      const s = 0.6 + p.z * 0.8;
      ctx.fillRect(px, py, s, s);
    }
    ctx.restore();
  }

  function roundRectPath(ctx, x, y, ww, hh, rr){
    const r = Math.min(rr, ww * 0.5, hh * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + ww, y, x + ww, y + hh, r);
    ctx.arcTo(x + ww, y + hh, x, y + hh, r);
    ctx.arcTo(x, y + hh, x, y, r);
    ctx.arcTo(x, y, x + ww, y, r);
    ctx.closePath();
  }

  function drawCore(ctx){
    const { x, y, w: cw, h: ch, r } = core;

    // Shadow
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.filter = `blur(${Math.max(2, Math.floor(Math.min(w, h) * 0.008))}px)`;
    roundRectPath(ctx, x + cw * 0.06, y + ch * 0.02, cw, ch, r);
    ctx.fill();
    ctx.restore();

    // Clip to cylinder
    ctx.save();
    roundRectPath(ctx, x, y, cw, ch, r);
    ctx.clip();

    // Cylinder base shading (rotation)
    const rot = t * 0.65;
    const shade = 0.5 + 0.5 * Math.sin(rot);

    const body = ctx.createLinearGradient(x, 0, x + cw, 0);
    body.addColorStop(0, `rgba(40, 60, 80, ${0.55})`);
    body.addColorStop(0.25, `rgba(220, 245, 255, ${0.16 + 0.08 * shade})`);
    body.addColorStop(0.55, `rgba(255, 255, 255, ${0.06 + 0.04 * shade})`);
    body.addColorStop(1, `rgba(20, 30, 45, ${0.7})`);
    ctx.fillStyle = body;
    ctx.fillRect(x, y, cw, ch);

    // Layers
    for (let i = 0; i < layers.length; i++){
      const L = layers[i];
      const yy0 = y + L.y0 * ch;
      const yy1 = y + L.y1 * ch;
      const hh = Math.max(1, yy1 - yy0);

      const wob = 0.5 + 0.5 * Math.sin(rot * (0.8 + i * 0.03) + i * 1.7);
      const edge = (cw * 0.02) * (wob - 0.5);

      const col = L.ash
        ? `hsla(210, 12%, ${18 + wob * 8}%, 0.75)`
        : `hsla(${L.tone.h}, ${L.tone.s}%, ${L.tone.l - 6 + wob * 6}%, 0.45)`;

      ctx.fillStyle = col;
      ctx.fillRect(x + edge, yy0, cw - edge * 2, hh);

      // Frost sparkle for non-ash layers
      if (!L.ash && (i % 6 === 0)){
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.fillStyle = `rgba(220,245,255,${0.05 + wob * 0.03})`;
        ctx.fillRect(x + cw * 0.12, yy0 + hh * 0.15, cw * 0.76, Math.max(1, hh * 0.08));
        ctx.restore();
      }
    }

    // Scan line / cut mark overlay
    const s = loopT;
    let scanA = 0;
    let scanPos = 0.5;
    if (mode === 'SCAN'){
      const u = ease(s / scanDur);
      scanPos = u;
      scanA = 0.7;
    } else if (mode === 'CUT'){
      scanPos = 1;
      scanA = 0.15;
    }

    if (scanA > 0){
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const yy = y + scanPos * ch;
      ctx.fillStyle = `rgba(160, 240, 255, ${0.08 * scanA})`;
      ctx.fillRect(x, yy - ch * 0.05, cw, ch * 0.1);
      ctx.fillStyle = `rgba(180, 250, 255, ${0.35 * scanA})`;
      ctx.fillRect(x, yy - 1, cw, 2);
      ctx.restore();
    }

    if (mode === 'CUT'){
      const local = (loopT - scanDur) / cutDur;
      const u = ease(local);
      const yy = y + (0.18 + 0.62 * u) * ch;

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.strokeStyle = 'rgba(255,255,255,0.6)';
      ctx.lineWidth = Math.max(1, Math.floor(Math.min(w, h) * 0.0018));
      ctx.setLineDash([Math.max(6, cw * 0.06), Math.max(4, cw * 0.03)]);
      ctx.beginPath();
      ctx.moveTo(x + cw * 0.08, yy);
      ctx.lineTo(x + cw * 0.92, yy);
      ctx.stroke();

      // notch marks
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(190,240,255,0.45)';
      for (let k = 0; k < 4; k++){
        const ny = yy + (k - 1.5) * ch * 0.03;
        ctx.beginPath();
        ctx.moveTo(x + cw * 0.1, ny);
        ctx.lineTo(x + cw * 0.16, ny);
        ctx.stroke();
      }
      ctx.restore();
    }

    // Volcano highlight
    if (mode === 'VOLCANO'){
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const pulse = 0.35 + 0.65 * Math.sin(t * 3.1);
      ctx.fillStyle = `rgba(255, 160, 90, ${0.08 + pulse * 0.07})`;
      ctx.fillRect(x, y, cw, ch);
      ctx.restore();
    }

    // Specular glint
    if (glint > 0){
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const gx = x + cw * (0.22 + 0.56 * (0.5 + 0.5 * Math.sin(t * 0.9)));
      const gg = ctx.createLinearGradient(gx - cw * 0.12, 0, gx + cw * 0.12, 0);
      gg.addColorStop(0, 'rgba(255,255,255,0)');
      gg.addColorStop(0.5, `rgba(255,255,255,${0.18 * glint})`);
      gg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gg;
      ctx.fillRect(x, y, cw, ch);
      ctx.restore();
    }

    ctx.restore();

    // Outline
    ctx.save();
    ctx.strokeStyle = 'rgba(190, 230, 255, 0.18)';
    ctx.lineWidth = Math.max(1, Math.floor(Math.min(w, h) * 0.002));
    roundRectPath(ctx, x, y, cw, ch, r);
    ctx.stroke();
    ctx.restore();
  }

  function drawPanel(ctx){
    const { x, y, w: pw, h: ph } = panel;

    // Panel body
    ctx.save();
    ctx.fillStyle = 'rgba(10, 14, 18, 0.86)';
    ctx.strokeStyle = 'rgba(170, 220, 255, 0.18)';
    ctx.lineWidth = Math.max(1, Math.floor(Math.min(w, h) * 0.002));
    ctx.beginPath();
    ctx.roundRect(x, y, pw, ph, Math.max(10, pw * 0.04));
    ctx.fill();
    ctx.stroke();
    ctx.restore();

    // Header
    ctx.save();
    ctx.fillStyle = 'rgba(200,240,255,0.85)';
    ctx.font = `${Math.max(12, Math.floor(ph * 0.034))}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto`;
    ctx.textBaseline = 'top';
    ctx.fillText('ICE CORE ANALYSIS', x + pw * 0.08, y + ph * 0.06);
    ctx.fillStyle = 'rgba(200,240,255,0.55)';
    ctx.font = `${Math.max(10, Math.floor(ph * 0.026))}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto`;
    ctx.fillText('isotope proxy (stylised)', x + pw * 0.08, y + ph * 0.11);
    ctx.restore();

    // Chart area
    const cx0 = x + pw * 0.1;
    const cy0 = y + ph * 0.2;
    const cww = pw * 0.8;
    const chh = ph * 0.33;

    ctx.save();
    ctx.strokeStyle = 'rgba(190,230,255,0.14)';
    ctx.lineWidth = Math.max(1, Math.floor(Math.min(w, h) * 0.0016));

    // grid
    for (let i = 0; i <= 6; i++){
      const xx = cx0 + (i / 6) * cww;
      ctx.beginPath();
      ctx.moveTo(xx, cy0);
      ctx.lineTo(xx, cy0 + chh);
      ctx.stroke();
    }
    for (let i = 0; i <= 4; i++){
      const yy = cy0 + (i / 4) * chh;
      ctx.beginPath();
      ctx.moveTo(cx0, yy);
      ctx.lineTo(cx0 + cww, yy);
      ctx.stroke();
    }

    // line
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.strokeStyle = 'rgba(140, 220, 255, 0.65)';
    ctx.lineWidth = Math.max(1, Math.floor(Math.min(w, h) * 0.0022));
    ctx.beginPath();
    for (let i = 0; i < chart.length; i++){
      const p = chart[i];
      const wig = 0.02 * Math.sin(t * 0.9 + i * 0.55);
      const xx = cx0 + p.x * cww;
      const yy = cy0 + (1 - clamp(p.y + wig, 0, 1)) * chh;
      if (i === 0) ctx.moveTo(xx, yy);
      else ctx.lineTo(xx, yy);
    }
    ctx.stroke();
    ctx.restore();

    // marker shows current scan depth
    let depth = 0.5;
    if (mode === 'SCAN') depth = ease(loopT / scanDur);
    else if (mode === 'CUT') depth = 0.18 + 0.62 * ease((loopT - scanDur) / cutDur);
    else if (mode === 'ANALYZE') depth = 0.74 + 0.06 * Math.sin(t * 0.8);
    else depth = 0.5;

    const my = cy0 + depth * chh;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.strokeStyle = 'rgba(255, 255, 255, 0.55)';
    ctx.lineWidth = Math.max(1, Math.floor(Math.min(w, h) * 0.0017));
    ctx.beginPath();
    ctx.moveTo(cx0, my);
    ctx.lineTo(cx0 + cww, my);
    ctx.stroke();
    ctx.restore();

    ctx.restore();

    // Status pills
    const pillsY = y + ph * 0.58;
    const pillsX = x + pw * 0.08;
    const pillH = Math.max(18, ph * 0.05);
    const pillW = pw * 0.36;

    function pill(label, active, row){
      const px = pillsX + (row % 2) * (pillW + pw * 0.06);
      const py = pillsY + Math.floor(row / 2) * (pillH + ph * 0.03);
      ctx.save();
      ctx.fillStyle = active ? 'rgba(120, 220, 255, 0.18)' : 'rgba(255,255,255,0.06)';
      ctx.strokeStyle = active ? 'rgba(150, 240, 255, 0.32)' : 'rgba(190,230,255,0.14)';
      ctx.lineWidth = Math.max(1, Math.floor(Math.min(w, h) * 0.0015));
      ctx.beginPath();
      ctx.roundRect(px, py, pillW, pillH, pillH * 0.5);
      ctx.fill();
      ctx.stroke();
      ctx.fillStyle = active ? 'rgba(210,250,255,0.9)' : 'rgba(210,250,255,0.55)';
      ctx.font = `${Math.max(10, Math.floor(pillH * 0.46))}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto`;
      ctx.textBaseline = 'middle';
      ctx.fillText(label, px + pillW * 0.12, py + pillH * 0.54);
      ctx.restore();
    }

    pill('SCAN', mode === 'SCAN', 0);
    pill('CUT', mode === 'CUT', 1);
    pill('ANALYZE', mode === 'ANALYZE', 2);
    pill('VOLCANIC', mode === 'VOLCANO', 3);

    // Volcano readout
    if (mode === 'VOLCANO'){
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const px = x + pw * 0.08;
      const py = y + ph * 0.85;
      ctx.fillStyle = 'rgba(255, 190, 140, 0.9)';
      ctx.font = `${Math.max(11, Math.floor(ph * 0.03))}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto`;
      const s = 0.5 + 0.5 * Math.sin(t * 3.1);
      ctx.fillText(`VOLCANIC LAYER DETECTED  ${Math.floor(80 + s * 19)}%`, px, py);
      ctx.restore();
    }
  }

  function draw(ctx){
    drawBackground(ctx);

    // scene title / bench label
    ctx.save();
    ctx.fillStyle = 'rgba(200,240,255,0.45)';
    ctx.font = `${Math.max(11, Math.floor(Math.min(w, h) * 0.022))}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto`;
    ctx.textBaseline = 'top';
    ctx.fillText('LAB: CORE-7  •  TEMP -18°C  •  LIGHT: RAKING', Math.min(w * 0.5, core.x), Math.max(6, h * 0.03));
    ctx.restore();

    drawCore(ctx);
    drawPanel(ctx);

    // Subtle vignette
    ctx.save();
    const vg = ctx.createRadialGradient(w * 0.5, h * 0.52, Math.min(w, h) * 0.2, w * 0.5, h * 0.52, Math.max(w, h) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  return {
    init,
    onResize,
    update,
    draw,
    onAudioOn,
    onAudioOff,
    destroy,
  };
}
