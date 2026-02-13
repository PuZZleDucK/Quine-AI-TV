// REVIEWED: 2026-02-14
import { mulberry32, clamp } from '../util/prng.js';

// Sand Table Cartography
// Zen sand table draws evolving topographic patterns: ridges, rivers, and compass headings across timed phases.

function lerp(a, b, t){ return a + (b - a) * t; }
function clamp01(x){ return Math.max(0, Math.min(1, x)); }
function pick(rand, arr){ return arr[(rand() * arr.length) | 0]; }

function roundRect(ctx, x, y, w, h, r){
  r = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function polyPoint(pts, u){
  // cheap parameterization by vertex index (good enough for our deterministic strokes)
  const n = pts.length;
  if (n <= 1) return pts[0] || [0, 0];
  u = clamp01(u);
  const f = u * (n - 1);
  const i = Math.min(n - 2, Math.max(0, Math.floor(f)));
  const t = f - i;
  const [x0, y0] = pts[i];
  const [x1, y1] = pts[i + 1];
  return [lerp(x0, x1, t), lerp(y0, y1, t)];
}

function strokePartial(ctx, pts, u, {close=false}={}){
  if (!pts?.length) return;
  u = clamp01(u);
  const n = pts.length;
  const m = Math.max(2, Math.min(n, 1 + Math.floor(u * (n - 1))));

  ctx.beginPath();
  for (let i = 0; i < m; i++){
    const [x, y] = pts[i];
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  }
  if (close && u >= 0.999){
    const [x0, y0] = pts[0];
    ctx.lineTo(x0, y0);
  }
}

function genLoop(rand, cx, cy, r0, {points=96, wob1=3, wob2=5, a1=0.22, a2=0.12}={}){
  const p = [];
  const ph1 = rand() * Math.PI * 2;
  const ph2 = rand() * Math.PI * 2;
  for (let i = 0; i < points; i++){
    const th = (i / points) * Math.PI * 2;
    const bump = 1
      + a1 * Math.sin(th * wob1 + ph1)
      + a2 * Math.sin(th * wob2 + ph2);
    const jitter = 1 + (rand() * 2 - 1) * 0.02;
    const rr = r0 * bump * jitter;
    p.push([cx + Math.cos(th) * rr, cy + Math.sin(th) * rr]);
  }
  // repeat first point so partial strokes look smooth at the seam
  p.push(p[0]);
  return p;
}

function genMeander(rand, x0, y0, x1, y1, n=26, bend=0.18){
  const pts = [];
  const mx = (x0 + x1) * 0.5;
  const my = (y0 + y1) * 0.5;
  const bx = mx + (y0 - y1) * ((rand() * 2 - 1) * bend);
  const by = my + (x1 - x0) * ((rand() * 2 - 1) * bend);

  for (let i = 0; i < n; i++){
    const t = i / (n - 1);
    // quadratic-ish curve with extra wiggle
    const ax = lerp(x0, bx, t);
    const ay = lerp(y0, by, t);
    const cx = lerp(bx, x1, t);
    const cy = lerp(by, y1, t);
    let x = lerp(ax, cx, t);
    let y = lerp(ay, cy, t);

    const wig = (rand() * 2 - 1) * 0.012 * (0.3 + 0.7 * Math.sin(t * Math.PI));
    x += wig;
    y += Math.cos(t * Math.PI * 2) * wig * 0.5;

    pts.push([x, y]);
  }

  return pts;
}

function sandScrape(audio, rand, {gain=0.03}={}){
  const ctx = audio.ensure();

  // Use a local seeded PRNG so audio generation is deterministic and doesn't
  // consume large amounts of the channel RNG state (perf + repeatability).
  const arand = mulberry32((rand() * 0x100000000) >>> 0);

  const dur = 0.12 + arand() * 0.10;
  const sr = ctx.sampleRate;
  const len = Math.max(1, Math.floor(dur * sr));

  const flutterFreq = 18 + arand() * 18;
  const flutterPhase = arand() * Math.PI * 2;

  const buf = ctx.createBuffer(1, len, sr);
  const d = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++){
    const x = i / len;
    const env = Math.pow(1 - x, 1.4);
    const n = (arand() * 2 - 1) * 0.9;
    last = last * 0.72 + n * 0.28;
    // granular scrape: amplitude flutter
    const flutter = 0.6 + 0.4 * Math.sin(2 * Math.PI * flutterFreq * x + flutterPhase);
    d[i] = last * env * flutter;
  }

  const src = ctx.createBufferSource();
  src.buffer = buf;

  const bp = ctx.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 420 + arand() * 380;
  bp.Q.value = 0.9;

  const hp = ctx.createBiquadFilter();
  hp.type = 'highpass';
  hp.frequency.value = 110;
  hp.Q.value = 0.7;

  const g = ctx.createGain();
  g.gain.value = 0;

  src.connect(bp);
  bp.connect(hp);
  hp.connect(g);
  g.connect(audio.master);

  const t0 = ctx.currentTime;
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(gain, t0 + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  // Use a separate deterministic RNG for render-only noise so 30fps/60fps
  // captures match at fixed time offsets (render must not consume channel RNG).
  const speckleSeedBase = (seed ^ 0x9e3779b9) >>> 0;

  let w = 0, h = 0, dpr = 1;
  let t = 0;

  // tray layout (pixels)
  let trayX = 0, trayY = 0, trayW = 0, trayH = 0, trayR = 18;

  // sand texture (small cached canvas)
  let sandTex = null;
  let sandTexCtx = null;
  let sandScale = 1;

  // strokes in normalized tray coords (0..1), drawn in phases
  let contours = [];
  let ridges = [];
  let rivers = [];
  let compassA = 0;

  const PHASE_DUR = 56; // seconds
  const PHASES = 4;
  const CYCLE_DUR = PHASE_DUR * PHASES;

  let phase = 0;
  let lastPhase = -1;

  // effects
  let dust = [];
  let dustT = 0;
  let stamp = 0;
  let nextStampAt = 0;

  // stylus
  let stylus = { x: 0.5, y: 0.5, down: true };

  // audio
  let bed = null;

  function buildSandTexture(){
    const tw = 360;
    const th = 220;
    sandTex = document.createElement('canvas');
    sandTex.width = tw;
    sandTex.height = th;
    sandTexCtx = sandTex.getContext('2d');

    const ctx = sandTexCtx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);

    const g = ctx.createLinearGradient(0, 0, 0, th);
    g.addColorStop(0, '#d8caa6');
    g.addColorStop(0.6, '#d0bf98');
    g.addColorStop(1, '#c6b087');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, tw, th);

    // grain
    ctx.save();
    ctx.globalAlpha = 0.18;
    for (let i = 0; i < 5200; i++){
      const x = (rand() * tw) | 0;
      const y = (rand() * th) | 0;
      const v = 90 + ((rand() * 90) | 0);
      ctx.fillStyle = `rgba(${v}, ${70 + ((rand() * 40) | 0)}, ${30 + ((rand() * 20) | 0)}, 0.16)`;
      ctx.fillRect(x, y, 1, 1);
      if ((i & 31) === 0) ctx.fillRect(x + 1, y, 1, 1);
    }
    ctx.restore();

    // subtle rake lines
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.strokeStyle = 'rgba(70,45,20,0.9)';
    ctx.lineWidth = 1;
    const step = 8;
    for (let y = -th; y < th * 2; y += step){
      ctx.beginPath();
      ctx.moveTo(-20, y);
      ctx.lineTo(tw + 20, y + th * 0.22);
      ctx.stroke();
    }
    ctx.restore();
  }

  function rebuildScene(){
    t = 0;
    phase = 0;
    lastPhase = -1;
    dust = [];
    dustT = 0;
    stamp = 0;
    nextStampAt = 10 + rand() * 14;

    compassA = rand() * Math.PI * 2;

    contours = [];
    ridges = [];
    rivers = [];

    // primary hill
    const c1x = 0.47 + (rand() * 2 - 1) * 0.06;
    const c1y = 0.52 + (rand() * 2 - 1) * 0.06;
    const r1 = 0.33 + rand() * 0.05;
    const rings1 = 6 + ((rand() * 3) | 0);
    for (let i = 0; i < rings1; i++){
      const k = 1 - (i / (rings1 + 1));
      const rr = r1 * (0.22 + 0.78 * k);
      contours.push(genLoop(rand, c1x, c1y, rr, {
        points: 92,
        wob1: 2 + ((rand() * 4) | 0),
        wob2: 4 + ((rand() * 5) | 0),
        a1: 0.16 + rand() * 0.10,
        a2: 0.08 + rand() * 0.07,
      }));
    }

    // secondary hill
    if (rand() < 0.78){
      const c2x = 0.62 + (rand() * 2 - 1) * 0.08;
      const c2y = 0.42 + (rand() * 2 - 1) * 0.08;
      const r2 = 0.18 + rand() * 0.06;
      const rings2 = 4 + ((rand() * 3) | 0);
      for (let i = 0; i < rings2; i++){
        const k = 1 - (i / (rings2 + 1));
        const rr = r2 * (0.28 + 0.72 * k);
        contours.push(genLoop(rand, c2x, c2y, rr, {
          points: 86,
          wob1: 3 + ((rand() * 4) | 0),
          wob2: 5 + ((rand() * 5) | 0),
          a1: 0.18 + rand() * 0.10,
          a2: 0.07 + rand() * 0.07,
        }));
      }
    }

    // ridges (hachures): short curved strokes that roughly follow the contours
    const ridgeN = 26 + ((rand() * 12) | 0);
    for (let i = 0; i < ridgeN; i++){
      const base = rand() < 0.72 ? {x: c1x, y: c1y, r: r1} : {x: 0.58, y: 0.48, r: 0.26};
      const th = rand() * Math.PI * 2;
      const rr = base.r * (0.18 + rand() * 0.75);
      const x0 = base.x + Math.cos(th) * rr;
      const y0 = base.y + Math.sin(th) * rr;
      const x1 = base.x + Math.cos(th + 0.12 + (rand() * 2 - 1) * 0.22) * (rr * (0.88 + rand() * 0.25));
      const y1 = base.y + Math.sin(th + 0.12 + (rand() * 2 - 1) * 0.22) * (rr * (0.88 + rand() * 0.25));
      ridges.push(genMeander(rand, x0, y0, x1, y1, 10 + ((rand() * 8) | 0), 0.08));
    }

    // rivers: meandering channels with tributary-ish branches
    const riverMain = genMeander(rand, 0.12 + rand() * 0.10, 0.18, 0.86, 0.86, 30, 0.24);
    rivers.push(riverMain);

    if (rand() < 0.9){
      const join = 0.35 + rand() * 0.35;
      const [jx, jy] = polyPoint(riverMain, join);
      const trib = genMeander(rand, 0.18 + rand() * 0.12, 0.10 + rand() * 0.10, jx, jy, 18, 0.22);
      rivers.push(trib);
    }
    if (rand() < 0.8){
      const join = 0.55 + rand() * 0.30;
      const [jx, jy] = polyPoint(riverMain, join);
      const trib = genMeander(rand, 0.78 - rand() * 0.14, 0.16 + rand() * 0.12, jx, jy, 16, 0.20);
      rivers.push(trib);
    }

    // stylus start
    stylus = { x: contours[0]?.[0]?.[0] ?? 0.5, y: contours[0]?.[0]?.[1] ?? 0.5, down: true };
  }

  function init({ width, height, dpr: dp }){
    w = width;
    h = height;
    dpr = dp || 1;

    trayW = Math.floor(Math.min(w, h) * 0.88);
    trayH = Math.floor(trayW * 0.74);
    trayX = Math.floor(w * 0.5 - trayW * 0.5);
    trayY = Math.floor(h * 0.53 - trayH * 0.5);
    trayR = Math.max(14, Math.floor(Math.min(trayW, trayH) * 0.05));

    sandScale = Math.max(1, Math.min(2.4, Math.min(trayW / 360, trayH / 220)));

    buildSandTexture();
    rebuildScene();
  }

  function onResize(width, height, dp){ init({ width, height, dpr: dp }); }

  function onAudioOn(){
    if (!audio.enabled) return;
    const hdl = audio.noiseSource({ type: 'brown', gain: 0.015 });
    hdl.start();
    bed = { stop(){ hdl.stop(); } };
    audio.setCurrent(bed);
    audio.beep({ freq: 220 + rand() * 40, dur: 0.03, gain: 0.012, type: 'triangle' });
  }

  function onAudioOff(){ bed?.stop?.(); bed = null; }
  function destroy(){ onAudioOff(); }

  function makeDust(px, py){
    dust = [];
    dustT = 1;
    const n = 26;
    for (let i = 0; i < n; i++){
      dust.push({
        x: px + (rand() * 2 - 1) * 0.03,
        y: py + (rand() * 2 - 1) * 0.02,
        vx: (rand() * 2 - 1) * 0.06,
        vy: -0.02 - rand() * 0.05,
        r: 0.004 + rand() * 0.008,
      });
    }
  }

  function update(dt){
    t += dt;

    // phase clock
    const cycleT = (t % CYCLE_DUR + CYCLE_DUR) % CYCLE_DUR;
    phase = Math.floor(cycleT / PHASE_DUR);
    if (phase !== lastPhase){
      lastPhase = phase;
      // dust puff at phase change, centered around current stylus
      makeDust(stylus.x, stylus.y);
      stamp = 1;
      if (audio.enabled){
        sandScrape(audio, rand, { gain: 0.028 + rand() * 0.01 });
        audio.beep({ freq: 440 + phase * 70, dur: 0.035, gain: 0.015, type: 'sine' });
      }
    }

    stamp = Math.max(0, stamp - dt * 1.4);
    dustT = Math.max(0, dustT - dt * 1.1);

    // occasional "stamp" moment
    if (t >= nextStampAt){
      stamp = 1;
      nextStampAt = t + 14 + rand() * 16;
      if (audio.enabled) audio.beep({ freq: 660 + rand() * 80, dur: 0.03, gain: 0.01, type: 'triangle' });
    }

    // stylus follows the currently-active group
    const uPhase = clamp01((cycleT - phase * PHASE_DUR) / PHASE_DUR);

    let group = contours;
    let groupClose = true;
    if (phase === 1){ group = ridges; groupClose = false; }
    if (phase === 2){ group = rivers; groupClose = false; }
    if (phase === 3){ group = contours; groupClose = true; }

    const k = Math.max(1, group.length);
    const f = uPhase * k;
    const idx = Math.min(k - 1, Math.floor(f));
    const uu = clamp01(f - idx);
    const pts = group[idx] || [[0.5, 0.5]];
    const [sx, sy] = polyPoint(pts, uu);
    stylus.x = sx;
    stylus.y = sy;
    stylus.down = phase !== 3;

    // advance dust particles
    for (const p of dust){
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vy += 0.03 * dt;
    }
  }

  function drawTray(ctx){
    // background desk
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, '#070707');
    bg.addColorStop(0.6, '#050505');
    bg.addColorStop(1, '#020202');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // vignette
    ctx.save();
    const vg = ctx.createRadialGradient(w * 0.5, h * 0.48, Math.min(w, h) * 0.15, w * 0.5, h * 0.48, Math.max(w, h) * 0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.85)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    // tray shadow
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, trayX + 12, trayY + 12, trayW, trayH, trayR);
    ctx.fill();
    ctx.restore();

    // tray frame
    ctx.save();
    const frame = ctx.createLinearGradient(trayX, trayY, trayX, trayY + trayH);
    frame.addColorStop(0, '#2a2a2a');
    frame.addColorStop(1, '#111111');
    ctx.fillStyle = frame;
    roundRect(ctx, trayX, trayY, trayW, trayH, trayR);
    ctx.fill();

    // inner lip
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = 'rgba(255,255,255,0.18)';
    ctx.lineWidth = Math.max(1, 1.4 * dpr);
    roundRect(ctx, trayX + trayW * 0.03, trayY + trayH * 0.04, trayW * 0.94, trayH * 0.92, trayR * 0.8);
    ctx.stroke();
    ctx.restore();

    // sand bed
    const inset = Math.floor(Math.min(trayW, trayH) * 0.07);
    const sx = trayX + inset;
    const sy = trayY + inset;
    const sw = trayW - inset * 2;
    const sh = trayH - inset * 2;

    ctx.save();
    roundRect(ctx, sx, sy, sw, sh, trayR * 0.6);
    ctx.clip();

    // animate subtle drift of the texture (tile in both axes so drift never reveals blank sand)
    const driftX = Math.sin(t * 0.07) * 12;
    const driftY = Math.cos(t * 0.05) * 8;

    const tileW = sandTex.width * sandScale;
    const tileH = sandTex.height * sandScale;
    const offX = ((driftX % tileW) + tileW) % tileW;
    const offY = ((driftY % tileH) + tileH) % tileH;

    ctx.globalAlpha = 0.98;
    for (let y = sy - offY - tileH; y < sy + sh + tileH; y += tileH){
      for (let x = sx - offX - tileW; x < sx + sw + tileW; x += tileW){
        ctx.drawImage(sandTex, x, y, tileW, tileH);
      }
    }

    // lighting gradient
    const lg = ctx.createLinearGradient(sx, sy, sx, sy + sh);
    lg.addColorStop(0, 'rgba(255,255,255,0.16)');
    lg.addColorStop(0.5, 'rgba(255,255,255,0.04)');
    lg.addColorStop(1, 'rgba(0,0,0,0.10)');
    ctx.fillStyle = lg;
    ctx.fillRect(sx, sy, sw, sh);

    ctx.restore();

    return { sx, sy, sw, sh };
  }

  function drawGrooves(ctx, box){
    const { sx, sy, sw, sh } = box;

    const cycleT = (t % CYCLE_DUR + CYCLE_DUR) % CYCLE_DUR;
    const u0 = clamp01(cycleT / PHASE_DUR); // contours
    const u1 = clamp01((cycleT - PHASE_DUR) / PHASE_DUR); // ridges
    const u2 = clamp01((cycleT - PHASE_DUR * 2) / PHASE_DUR); // rivers
    const u3 = clamp01((cycleT - PHASE_DUR * 3) / PHASE_DUR); // stamps

    // helper to draw a group sequentially
    function drawGroup(list, u, {close=false, width=2, color='rgba(70,45,20,0.45)', shadow='rgba(0,0,0,0.12)'}={}){
      if (!list?.length) return;
      const k = list.length;
      const tt = clamp01(u) * k;
      for (let i = 0; i < k; i++){
        const pu = clamp01(tt - i);
        if (pu <= 0) break;

        // draw in tray space
        ctx.save();
        ctx.translate(sx, sy);
        ctx.scale(sw, sh);
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';

        // subtle groove shadow (bevel-ish)
        ctx.strokeStyle = shadow;
        ctx.lineWidth = (width / Math.min(sw, sh)) * 1.8;
        ctx.translate(0.0012, 0.0012);
        strokePartial(ctx, list[i], pu, { close });
        ctx.stroke();

        // main groove
        ctx.strokeStyle = color;
        ctx.lineWidth = (width / Math.min(sw, sh)) * 1.2;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.translate(sx, sy);
        ctx.scale(sw, sh);
        strokePartial(ctx, list[i], pu, { close });
        ctx.stroke();

        ctx.restore();
      }
    }

    // contours (phase 0)
    drawGroup(contours, u0, {
      close: true,
      width: Math.max(1.6, 2.2 * dpr),
      color: 'rgba(78,52,24,0.52)',
      shadow: 'rgba(0,0,0,0.14)'
    });

    // ridges (phase 1)
    if (u1 > 0){
      drawGroup(ridges, u1, {
        close: false,
        width: Math.max(1.2, 1.7 * dpr),
        color: 'rgba(70,45,20,0.38)',
        shadow: 'rgba(0,0,0,0.10)'
      });
    }

    // rivers (phase 2)
    if (u2 > 0){
      drawGroup(rivers, u2, {
        close: false,
        width: Math.max(1.8, 2.6 * dpr),
        color: 'rgba(55,35,18,0.40)',
        shadow: 'rgba(0,0,0,0.10)'
      });

      // water hint overlay
      ctx.save();
      ctx.globalAlpha = 0.10 + 0.08 * Math.sin(t * 0.6);
      ctx.translate(sx, sy);
      ctx.scale(sw, sh);
      ctx.strokeStyle = 'rgba(80,140,150,0.9)';
      ctx.lineWidth = (Math.max(0.8, 1.2 * dpr) / Math.min(sw, sh));
      for (const r of rivers){
        strokePartial(ctx, r, clamp01(u2 * 1.1), { close: false });
        ctx.stroke();
      }
      ctx.restore();
    }

    // stamps / compass (phase 3)
    if (u3 > 0){
      const a = 0.25 + 0.75 * u3;
      const cx = sx + sw * 0.86;
      const cy = sy + sh * 0.18;
      const cr = Math.min(sw, sh) * 0.09;

      ctx.save();
      ctx.globalAlpha = a * 0.8;
      ctx.translate(cx, cy);
      ctx.rotate(compassA * 0.2 + Math.sin(t * 0.08) * 0.04);
      ctx.strokeStyle = 'rgba(55,35,16,0.55)';
      ctx.lineWidth = Math.max(1, 1.4 * dpr);
      ctx.beginPath();
      ctx.arc(0, 0, cr, 0, Math.PI * 2);
      ctx.stroke();

      ctx.globalAlpha *= 0.85;
      ctx.beginPath();
      ctx.moveTo(0, -cr);
      ctx.lineTo(0, cr);
      ctx.moveTo(-cr, 0);
      ctx.lineTo(cr, 0);
      ctx.stroke();

      // needle
      ctx.globalAlpha *= 0.75;
      ctx.fillStyle = 'rgba(130,40,30,0.65)';
      ctx.beginPath();
      ctx.moveTo(0, -cr * 0.95);
      ctx.lineTo(-cr * 0.18, 0);
      ctx.lineTo(cr * 0.18, 0);
      ctx.closePath();
      ctx.fill();

      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(55,35,16,0.72)';
      ctx.font = `${Math.floor(Math.max(11, Math.min(w, h) / 48))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'bottom';
      ctx.fillText('N', 0, -cr - 3);
      ctx.restore();

      // headings
      ctx.save();
      ctx.globalAlpha = a * 0.7;
      ctx.fillStyle = 'rgba(55,35,16,0.62)';
      ctx.font = `${Math.floor(Math.max(12, Math.min(w, h) / 40))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.textBaseline = 'middle';
      ctx.fillText('TOPO LINES', sx + sw * 0.06, sy + sh * 0.10);
      ctx.globalAlpha *= 0.85;
      ctx.font = `${Math.floor(Math.max(11, Math.min(w, h) / 52))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.fillText('Ridges • Rivers • Bearings', sx + sw * 0.06, sy + sh * 0.14);
      ctx.restore();
    }

    // stamp flash
    if (stamp > 0){
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.12 * stamp;
      ctx.fillStyle = 'rgba(255,240,210,0.9)';
      ctx.fillRect(sx, sy, sw, sh);
      ctx.restore();
    }
  }

  function drawStylus(ctx, box){
    const { sx, sy, sw, sh } = box;
    const px = sx + stylus.x * sw;
    const py = sy + stylus.y * sh;

    // arm shadow
    ctx.save();
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = 'rgba(0,0,0,0.85)';
    ctx.lineWidth = Math.max(2, 3.2 * dpr);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sx + sw * 0.12, sy + sh * 0.96);
    ctx.lineTo(px + 8, py + 10);
    ctx.stroke();
    ctx.restore();

    // arm
    ctx.save();
    ctx.strokeStyle = 'rgba(220,220,220,0.12)';
    ctx.lineWidth = Math.max(2, 2.6 * dpr);
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(sx + sw * 0.12, sy + sh * 0.96);
    ctx.lineTo(px, py);
    ctx.stroke();

    // stylus tip
    const r = Math.max(3, 4.2 * dpr);
    ctx.fillStyle = stylus.down ? 'rgba(20,20,20,0.55)' : 'rgba(20,20,20,0.35)';
    ctx.beginPath();
    ctx.arc(px, py, r, 0, Math.PI * 2);
    ctx.fill();

    ctx.globalAlpha = 0.55;
    ctx.fillStyle = 'rgba(255,255,255,0.10)';
    ctx.beginPath();
    ctx.arc(px - r * 0.25, py - r * 0.25, r * 0.45, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function drawDust(ctx, box){
    if (dustT <= 0 || !dust.length) return;
    const { sx, sy, sw, sh } = box;

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.22 * dustT;
    ctx.fillStyle = 'rgba(255,245,220,0.9)';
    for (const p of dust){
      const x = sx + p.x * sw;
      const y = sy + p.y * sh;
      const r = p.r * Math.min(sw, sh);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function render(ctx){
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const box = drawTray(ctx);
    drawGrooves(ctx, box);
    drawDust(ctx, box);
    drawStylus(ctx, box);

    // broadcast speckle (render-only RNG: do not consume channel RNG state)
    ctx.save();
    ctx.globalAlpha = 0.035;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';

    const speckleFrame = Math.floor(t * 30); // lock noise to time, not render FPS
    const speckleRand = mulberry32((speckleSeedBase + speckleFrame) >>> 0);

    const n = 160 + ((120 * (0.5 + 0.5 * Math.sin(t * 0.55))) | 0);
    for (let i = 0; i < n; i++){
      const x = (speckleRand() * w) | 0;
      const y = (speckleRand() * h) | 0;
      if (((x + y + i) & 7) === 0) ctx.fillRect(x, y, 1, 1);
    }
    ctx.restore();
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
