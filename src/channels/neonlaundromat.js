// REVIEWED: 2026-02-15
import { mulberry32, clamp } from '../util/prng.js';
import { simpleDrone } from '../util/audio.js';

function pick(rand, arr){ return arr[(rand() * arr.length) | 0]; }
function lerp(a, b, t){ return a + (b - a) * t; }
function ease(t){ t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }

function roundedRect(ctx, x, y, w, h, r){
  r = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);
  let audioRand = mulberry32((seed ^ 0x6e0f1f2b) >>> 0);

  let w = 0;
  let h = 0;
  let dpr = 1;
  let t = 0;

  let font = 16;
  let small = 12;
  let mono = 13;

  const pal = {
    bg0: '#05060b',
    bg1: '#07111a',
    floor0: '#f2f5f8',
    floor1: '#d7e0e8',
    grout: 'rgba(30,44,62,0.20)',
    machine: '#121a24',
    machineHi: '#1c2a3b',
    metal: 'rgba(220,240,255,0.22)',
    glass: 'rgba(160,210,255,0.13)',
    text: 'rgba(235,245,255,0.92)',
    subtext: 'rgba(235,245,255,0.72)',
    neonC: '#6cf2ff',
    neonM: '#ff66d9',
    neonO: '#ffcf6a',
    warn: '#ff4e52',
  };

  const PHASES = [
    { id: 'wash',  label: 'WASH',  rot: 0.75, water: 0.72, bubbles: 0.55, glow: 0.12 },
    { id: 'rinse', label: 'RINSE', rot: 0.95, water: 0.60, bubbles: 0.80, glow: 0.16 },
    { id: 'spin',  label: 'SPIN',  rot: 5.2,  water: 0.20, bubbles: 0.15, glow: 0.20 },
    { id: 'dry',   label: 'DRY',   rot: 1.25, water: 0.05, bubbles: 0.05, glow: 0.26 },
  ];

  const PHASE_DUR = 16; // seconds
  const CYCLE_DUR = PHASE_DUR * PHASES.length;

  let phaseIndex = -1;
  let beatPulse = 0;

  let machines = []; // {x,y,w,h,doorR,rot,tint}
  let dryers = [];   // {x,y,w,h,doorR,tint}
  let counter = { x: 0, y: 0, w: 0, h: 0 };
  let floorY = 0;

  // midground window details
  let windowFx = { x: 0, y: 0, w: 0, h: 0, lights: [] };


  // perf: cache static background/window/placard gradients into offscreen layers (rebuild on init/resize)
  const cache = {
    bg: null, bgW: 0, bgH: 0,
    window: null, winW: 0, winH: 0,
    placard: null, placW: 0, placH: 0,
  };

  function makeCanvas(W, H){
    try {
      if (typeof document === 'undefined') return null;
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      return c;
    } catch {
      return null;
    }
  }

  function ensureBGCache(){
    const W = Math.max(1, Math.floor(w));
    const H = Math.max(1, Math.floor(h));
    if (cache.bg !== null && cache.bgW === W && cache.bgH === H) return;

    cache.bgW = W;
    cache.bgH = H;

    const c = makeCanvas(W, H);
    if (!c) {
      cache.bg = false;
      return;
    }

    const gctx = c.getContext('2d');
    gctx.setTransform(1, 0, 0, 1, 0, 0);
    gctx.clearRect(0, 0, W, H);

    const g = gctx.createLinearGradient(0, 0, 0, H);
    g.addColorStop(0, pal.bg0);
    g.addColorStop(0.55, pal.bg1);
    g.addColorStop(1, '#030407');
    gctx.fillStyle = g;
    gctx.fillRect(0, 0, W, H);

    // pale interior wall panel between window band and floor
    const wallTop = H * 0.29;
    const wallBottom = floorY || (H * 0.55);
    if (wallBottom > wallTop){
      const wg = gctx.createLinearGradient(0, wallTop, 0, wallBottom);
      wg.addColorStop(0, 'rgba(233,239,247,0.26)');
      wg.addColorStop(1, 'rgba(214,225,236,0.34)');
      gctx.fillStyle = wg;
      gctx.fillRect(0, wallTop, W, wallBottom - wallTop);

      const mid = wallTop + (wallBottom - wallTop) * 0.52;
      const topLift = gctx.createLinearGradient(0, wallTop, 0, mid);
      topLift.addColorStop(0, 'rgba(242,246,252,0.26)');
      topLift.addColorStop(1, 'rgba(242,246,252,0.06)');
      gctx.fillStyle = topLift;
      gctx.fillRect(0, wallTop, W, mid - wallTop);

      gctx.strokeStyle = 'rgba(32,48,68,0.28)';
      gctx.lineWidth = Math.max(1, Math.floor(dpr));
      gctx.beginPath();
      gctx.moveTo(0, wallBottom - 1);
      gctx.lineTo(W, wallBottom - 1);
      gctx.stroke();
    }

    cache.bg = c;
  }

  function ensureWindowCache(){
    const W = Math.max(1, Math.floor(w));
    const H = Math.max(1, Math.floor(h));
    if (cache.window !== null && cache.winW === W && cache.winH === H) return;

    cache.winW = W;
    cache.winH = H;

    const c = makeCanvas(W, H);
    if (!c) {
      cache.window = false;
      return;
    }

    const gctx = c.getContext('2d');
    gctx.setTransform(1, 0, 0, 1, 0, 0);
    gctx.clearRect(0, 0, W, H);

    const wx = windowFx.x;
    const wy = windowFx.y;
    const ww = windowFx.w;
    const wh = windowFx.h;

    const frame = Math.max(8, Math.floor(Math.min(W, H) * 0.012));
    const rad = Math.max(16, Math.floor(Math.min(ww, wh) * 0.08));

    // frame
    gctx.fillStyle = 'rgba(0,0,0,0.52)';
    roundedRect(gctx, wx - frame, wy - frame, ww + frame * 2, wh + frame * 2, rad + frame);
    gctx.fill();

    gctx.strokeStyle = 'rgba(220,240,255,0.10)';
    gctx.lineWidth = Math.max(1, Math.floor(dpr));
    roundedRect(gctx, wx - frame + 1, wy - frame + 1, ww + frame * 2 - 2, wh + frame * 2 - 2, rad + frame - 1);
    gctx.stroke();

    // glass
    const gg = gctx.createLinearGradient(0, wy, 0, wy + wh);
    gg.addColorStop(0, 'rgba(24,34,48,0.65)');
    gg.addColorStop(0.55, 'rgba(12,18,26,0.56)');
    gg.addColorStop(1, 'rgba(6,10,16,0.72)');
    gctx.fillStyle = gg;
    roundedRect(gctx, wx, wy, ww, wh, rad);
    gctx.fill();

    // clip to glass area for static interior details (reflection band + mullions)
    gctx.save();
    gctx.beginPath();
    roundedRect(gctx, wx, wy, ww, wh, rad);
    gctx.clip();

    // soft reflection band
    const rg = gctx.createLinearGradient(wx, wy, wx + ww, wy + wh);
    rg.addColorStop(0, 'rgba(255,255,255,0.00)');
    rg.addColorStop(0.35, 'rgba(255,255,255,0.06)');
    rg.addColorStop(0.7, 'rgba(255,255,255,0.00)');
    gctx.fillStyle = rg;
    gctx.fillRect(wx, wy, ww, wh);

    // mullions
    gctx.strokeStyle = 'rgba(235,245,255,0.08)';
    gctx.lineWidth = Math.max(1, Math.floor(dpr));
    for (const f of [1/3, 2/3]){
      const x = wx + ww * f;
      gctx.beginPath();
      gctx.moveTo(x, wy);
      gctx.lineTo(x, wy + wh);
      gctx.stroke();
    }
    const hy = wy + wh * 0.58;
    gctx.beginPath();
    gctx.moveTo(wx, hy);
    gctx.lineTo(wx + ww, hy);
    gctx.stroke();

    gctx.restore();

    // sill
    gctx.fillStyle = 'rgba(0,0,0,0.28)';
    gctx.fillRect(wx - frame, wy + wh + frame * 0.25, ww + frame * 2, Math.max(4, Math.floor(frame * 0.35)));

    cache.window = c;
  }

  function ensurePlacardCache(){
    const W = Math.max(1, Math.floor(w));
    const H = Math.max(1, Math.floor(h));
    if (cache.placard !== null && cache.placW === W && cache.placH === H) return;

    cache.placW = W;
    cache.placH = H;

    const c = makeCanvas(W, H);
    if (!c) {
      cache.placard = false;
      return;
    }

    const gctx = c.getContext('2d');
    gctx.setTransform(1, 0, 0, 1, 0, 0);
    gctx.clearRect(0, 0, W, H);

    const wx = windowFx.x;
    const wy = windowFx.y;
    const ww = windowFx.w;
    const wh = windowFx.h;

    const sx = wx + ww * 0.08;
    const sy = wy + wh * 0.18;
    const sw = ww * 0.50;
    const sh = wh * 0.42;
    const sr = Math.max(10, sh * 0.24);

    // mounts
    gctx.fillStyle = 'rgba(48,58,78,0.88)';
    gctx.fillRect(sx + sw * 0.16, sy - sh * 0.22, Math.max(2, sw * 0.01), sh * 0.22);
    gctx.fillRect(sx + sw * 0.84, sy - sh * 0.22, Math.max(2, sw * 0.01), sh * 0.22);

    // sign plate
    const sg = gctx.createLinearGradient(0, sy, 0, sy + sh);
    sg.addColorStop(0, 'rgba(16,22,34,0.88)');
    sg.addColorStop(1, 'rgba(8,12,20,0.90)');
    gctx.fillStyle = sg;
    roundedRect(gctx, sx, sy, sw, sh, sr);
    gctx.fill();

    gctx.strokeStyle = 'rgba(220,240,255,0.24)';
    gctx.lineWidth = Math.max(1.2, Math.floor(dpr * 1.1));
    roundedRect(gctx, sx + 1, sy + 1, sw - 2, sh - 2, sr - 1);
    gctx.stroke();

    cache.placard = c;
  }

  function ensureStaticLayers(){
    ensureBGCache();
    ensureWindowCache();
    ensurePlacardCache();
  }

  function regenWindow(){
    const wx = w * 0.06;
    const wy = h * 0.09;
    const ww = w * 0.78;
    const wh = h * 0.18;

    windowFx.x = wx;
    windowFx.y = wy;
    windowFx.w = ww;
    windowFx.h = wh;

    const rng = mulberry32((seed ^ 0x9c5a3d17) >>> 0);
    const density = clamp((ww * wh) / (900 * 260), 0.7, 1.5);
    const N = Math.floor(clamp(70 * density, 48, 120));
    const cols = [pal.neonC, pal.neonM, pal.neonO, 'rgba(235,245,255,1)'];

    windowFx.lights = [];
    for (let i = 0; i < N; i++){
      windowFx.lights.push({
        x: rng() * ww,
        y: rng() * wh,
        r: 0.6 + rng() * 1.6,
        tw: 0.25 + rng() * 1.25,
        ph: rng() * Math.PI * 2,
        col: cols[(rng() * cols.length) | 0],
      });
    }
  }

  let neonFlicker = 0;
  let nextFlickerAt = 0;

  let surgeRand = mulberry32((seed ^ 0x5a17f3d1) >>> 0);
  let powerSurge = { a: 0, startAt: 0, dur: 0 };
  let nextSurgeAt = 0;

  // second special moment stream: COIN JAM (separate seeded RNG; cadence-stable).
  let jamRand = mulberry32((seed ^ 0x1c83f2a9) >>> 0);
  let coinJam = { a: 0, startAt: 0, machine: 0 };
  let nextJamAt = 0;

  const ALERT_FADE_IN = 0.18;
  const ALERT_HOLD = 3.6;
  const ALERT_FADE_OUT = 1.1;

  const JAM_FADE_IN = 0.14;
  const JAM_HOLD = 2.6;
  const JAM_FADE_OUT = 0.9;

  let alert = { a: 0, machine: 0, msg: '', startAt: 0 };
  let nextAlertAt = 0;

  // LOST SOCK alert message variety (seeded shuffle-bag, separate RNG).
  // Keep strings short since we append " • CHECK LINT TRAP" in the HUD.
  const SOCK_VARIANTS = [
    'LEFT SOCK',
    'RIGHT SOCK',
    'MISMATCHED SOCK',
    'TINY SOCK',
    'GIANT SOCK',
    'NO-SHOW SOCK',
    'ANKLE SOCK',
    'KNEE SOCK',
    'DRESS SOCK',
    'SPORT SOCK',
    'WOOL SOCK',
    'FUZZY SOCK',
    'STRIPED SOCK',
    'POLKA SOCK',
    'ARGYLE SOCK',
    'NEON SOCK',
    'BLACK SOCK',
    'WHITE SOCK',
    'RED SOCK',
    'BLUE SOCK',
    'GREEN SOCK',
    'PURPLE SOCK',
    'GOLD SOCK',
    'SILVER SOCK',
    'INSIDE-OUT SOCK',
    'HOLE-Y SOCK',
    'SOGGY SOCK',
    'STATIC SOCK',
    'GLITCH SOCK',
    'CYBER SOCK',
    'MAGNETIC SOCK',
    'SINGLE SOCK',
    'SPARE SOCK',
    'MYSTERY SOCK',
    'GHOST SOCK',
    'PHANTOM SOCK',
    'ESCAPED SOCK',
    'SOCK VANISHED',
    'SOCK INCIDENT',
    'SOCK CRISIS',
    'SOCK MELTDOWN',
    'SOCK RANSOM',
    'IN THE LINT',
    'UNDER MACHINE',
    'BEHIND COUNTER',
    'IN THE VENT',
    'IN THE DRUM',
    'IN SOCK VOID',
    'IN NARNIA',
    'ALIEN SOCK',
    'TIMEWARP SOCK',
    'DIMENSIONAL SOCK',
    'SOCK OF DOOM',
  ];

  let sockRand = mulberry32((seed ^ 0x3b79a20f) >>> 0);
  let sockBag = [];
  let sockBagIndex = 0;
  let lastSockMsg = '';

  function refillSockBag(){
    sockBag = SOCK_VARIANTS.slice();
    for (let i = sockBag.length - 1; i > 0; i--){
      const j = (sockRand() * (i + 1)) | 0;
      const tmp = sockBag[i];
      sockBag[i] = sockBag[j];
      sockBag[j] = tmp;
    }
    sockBagIndex = 0;
    // avoid immediate repeat across refills
    if (lastSockMsg && sockBag.length > 1 && sockBag[0] === lastSockMsg){
      const tmp = sockBag[0];
      sockBag[0] = sockBag[1];
      sockBag[1] = tmp;
    }
  }

  function nextSockMsg(){
    if (!sockBag.length || sockBagIndex >= sockBag.length) refillSockBag();
    const msg = sockBag[sockBagIndex++];
    lastSockMsg = msg;
    return msg;
  }

  // audio
  let ambience = null;
  let humOsc = null;
  let humGain = null;
  let noise = null;
  let drone = null;

  function safeBeep(opts){ if (audio.enabled) audio.beep(opts); }

  function regenLayout(){
    // Rebalanced room composition:
    // keep machines in the middle band (not parked on the bottom edge)
    // and align fixtures around them so the scene reads as one space.
    floorY = h * 0.55;
    const marginB = Math.max(62, h * 0.14);
    const baseY = floorY - h * 0.12;

    let mh = clamp(h * 0.205, 98, 150);
    mh = Math.min(mh, Math.max(96, h - baseY - marginB));

    let mw = Math.min(w * 0.24, 232);
    mw = Math.min(mw, mh * 0.98);

    let gap = clamp(w * 0.035, 14, 44);

    const n = 3;
    let totalW = mw * n + gap * (n - 1);
    if (totalW > w * 0.92){
      const s = (w * 0.92) / totalW;
      mw *= s;
      gap *= s;
      totalW = mw * n + gap * (n - 1);
    }

    const x0 = w * 0.5 - totalW * 0.5;

    machines = [];
    for (let i = 0; i < n; i++){
      const x = x0 + i * (mw + gap);
      const y = baseY;
      const tint = pick(rand, [pal.neonC, pal.neonM, pal.neonO]);
      machines.push({
        x, y,
        w: mw,
        h: mh,
        doorR: Math.min(mw, mh) * 0.29,
        rot: rand() * Math.PI * 2,
        tint,
      });
    }

    // Room fixtures (dryers + folding counter). Use a separate RNG so we don't
    // perturb the main `rand()` sequence that drives timing/special moments.
    const frand = mulberry32((seed ^ 0x2c9ab33f) >>> 0);

    dryers = [];
    const bankBaseY = baseY + mh * 0.86;
    const gapY = clamp(h * 0.022, 12, 26);
    const dh = clamp(h * 0.105, 74, 118);
    const dw = clamp(dh * 0.92, 72, 138);
    const gapX = clamp(w * 0.025, 14, 28);

    const cols = 2;
    const rows = 2;
    const bankW = cols * dw + (cols - 1) * gapX;
    const bankH = rows * dh + (rows - 1) * gapY;

    const washersRight = x0 + totalW;
    const maxX = Math.max(w * 0.52, w - bankW - w * 0.05);
    const minX = Math.max(w * 0.60, washersRight + w * 0.04);
    const dx0 = clamp(minX, w * 0.52, maxX);
    const dy0 = bankBaseY - bankH;

    const dryerCols = [pal.neonO, pal.neonC, pal.neonM];
    for (let r = 0; r < rows; r++){
      for (let c = 0; c < cols; c++){
        dryers.push({
          x: dx0 + c * (dw + gapX),
          y: dy0 + r * (dh + gapY),
          w: dw,
          h: dh,
          doorR: Math.min(dw, dh) * 0.27,
          tint: dryerCols[(frand() * dryerCols.length) | 0],
        });
      }
    }

    // Folding counter under the window (left side), kept intentionally subtle.
    const cw = Math.min(w * 0.44, Math.max(200, w * 0.34));
    const ch = clamp(h * 0.060, 40, 62);
    const cx = w * 0.08;
    const cy = floorY + h * 0.19;
    counter = { x: cx, y: cy, w: cw, h: ch };
  }

  function drawWallSigns(ctx, P){
    const signs = [
      { text: 'OPEN ALL NIGHT', x: w * 0.07, y: h * 0.285, w: w * 0.23, h: h * 0.057, col: pal.neonC },
      { text: 'NO DYE AFTER 10PM', x: w * 0.33, y: h * 0.285, w: w * 0.25, h: h * 0.057, col: pal.neonM },
      { text: 'SOAP + TOKENS', x: w * 0.58, y: h * 0.285, w: w * 0.14, h: h * 0.057, col: pal.neonO },
    ];

    ctx.save();
    for (let i = 0; i < signs.length; i++){
      const s = signs[i];
      const rr = Math.max(8, s.h * 0.25);

      // hanging mounts
      ctx.fillStyle = 'rgba(46,58,78,0.82)';
      ctx.fillRect(s.x + s.w * 0.12, s.y - s.h * 0.20, Math.max(2, s.w * 0.012), s.h * 0.20);
      ctx.fillRect(s.x + s.w * 0.86, s.y - s.h * 0.20, Math.max(2, s.w * 0.012), s.h * 0.20);

      // plate
      const g = ctx.createLinearGradient(0, s.y, 0, s.y + s.h);
      g.addColorStop(0, 'rgba(28,36,50,0.94)');
      g.addColorStop(1, 'rgba(12,16,24,0.97)');
      ctx.fillStyle = g;
      roundedRect(ctx, s.x, s.y, s.w, s.h, rr);
      ctx.fill();

      ctx.strokeStyle = 'rgba(220,240,255,0.34)';
      ctx.lineWidth = Math.max(1.2, Math.floor(dpr * 1.1));
      roundedRect(ctx, s.x + 1, s.y + 1, s.w - 2, s.h - 2, rr - 1);
      ctx.stroke();

      // neon border tube
      const flick = 0.75 + 0.25 * Math.sin(t * 4.2 + i * 1.7);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.strokeStyle = s.col;
      ctx.lineWidth = Math.max(2.4, s.h * 0.10);
      ctx.shadowColor = s.col;
      ctx.shadowBlur = 16 + 18 * (0.42 + P.glow) * flick;
      ctx.globalAlpha = 0.56 + (0.34 + P.glow * 0.40) * flick;
      roundedRect(ctx, s.x + 4, s.y + 4, s.w - 8, s.h - 8, rr - 3);
      ctx.stroke();
      ctx.restore();

      // text
      ctx.font = `${Math.floor(small * 0.94)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'rgba(232,245,255,0.98)';
      ctx.shadowColor = s.col;
      ctx.shadowBlur = 10 + 8 * P.glow;
      ctx.fillText(s.text, s.x + s.w * 0.08, s.y + s.h * 0.54);
      ctx.shadowBlur = 0;
    }

    const tubes = [
      { x: w * 0.09, y: h * 0.357, w: w * 0.21, col: pal.neonM },
      { x: w * 0.37, y: h * 0.357, w: w * 0.18, col: pal.neonC },
      { x: w * 0.60, y: h * 0.357, w: w * 0.11, col: pal.neonO },
    ];
    for (let i = 0; i < tubes.length; i++){
      const n = tubes[i];
      const tw = Math.max(2.4, h * 0.0065);
      const flick = 0.75 + 0.25 * Math.sin(t * 3.7 + i * 1.3);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.strokeStyle = n.col;
      ctx.lineWidth = tw;
      ctx.shadowColor = n.col;
      ctx.shadowBlur = 18 + 18 * (0.5 + P.glow) * flick;
      ctx.globalAlpha = 0.60 + (0.24 + P.glow * 0.34) * flick;
      ctx.beginPath();
      ctx.moveTo(n.x, n.y);
      ctx.lineTo(n.x + n.w, n.y);
      ctx.stroke();
      ctx.restore();
    }
    ctx.restore();
  }

  function reset(){
    t = 0;
    phaseIndex = -1;
    beatPulse = 0;

    audioRand = mulberry32((seed ^ 0x6e0f1f2b) >>> 0);

    neonFlicker = 0;
    nextFlickerAt = 1.2 + rand() * 3.4;

    surgeRand = mulberry32((seed ^ 0x5a17f3d1) >>> 0);
    powerSurge = { a: 0, startAt: 0, dur: 0 };
    nextSurgeAt = 45 + surgeRand() * 75;

    jamRand = mulberry32((seed ^ 0x1c83f2a9) >>> 0);
    coinJam = { a: 0, startAt: 0, machine: 0 };
    nextJamAt = 90 + jamRand() * 150;

    alert = { a: 0, machine: 0, msg: '' };
    nextAlertAt = 12 + rand() * 18;

    sockRand = mulberry32((seed ^ 0x3b79a20f) >>> 0);
    sockBag = [];
    sockBagIndex = 0;
    lastSockMsg = '';

    for (const m of machines) m.rot = rand() * Math.PI * 2;
  }

  function init({ width, height, dpr: dprIn }){
    w = width;
    h = height;
    dpr = dprIn || 1;

    font = Math.max(14, Math.floor(Math.min(w, h) / 32));
    small = Math.max(11, Math.floor(font * 0.78));
    mono = Math.max(12, Math.floor(font * 0.86));

    regenLayout();
    regenWindow();
    ensureStaticLayers();
    reset();
  }

  function onResize(width, height, dprIn){
    init({ width, height, dpr: dprIn });
  }

  function makeAmbienceHandle(){
    const ctx = audio.ensure();

    // soft room hum + a little sudsy noise
    const humOscLocal = ctx.createOscillator();
    humOscLocal.type = 'triangle';
    humOscLocal.frequency.value = 58 + audioRand() * 8;

    const humGainLocal = ctx.createGain();
    humGainLocal.gain.value = 0.0;
    humOscLocal.connect(humGainLocal);
    humGainLocal.connect(audio.master);

    const noiseLocal = audio.noiseSource({ type: 'pink', gain: 0.0 });

    humOscLocal.start();
    noiseLocal.start();

    const droneLocal = simpleDrone(audio, { root: 46 + audioRand() * 10, detune: 0.6, gain: 0.010 });

    // Publish current nodes for `update()`.
    humOsc = humOscLocal;
    humGain = humGainLocal;
    noise = noiseLocal;
    drone = droneLocal;

    // IMPORTANT: capture locals so stop() always tears down the correct nodes,
    // even if onAudioOn() is called again and the globals are reassigned.
    return {
      stop(){
        try { noiseLocal?.stop?.(); } catch {}
        try {
          humGainLocal?.gain?.setTargetAtTime?.(0.0001, ctx.currentTime, 0.06);
          humOscLocal?.stop?.(ctx.currentTime + 0.2);
        } catch {}
        try { droneLocal?.stop?.(); } catch {}
      }
    };
  }

  function stopAmbience({ clearCurrent = false } = {}){
    const handle = ambience;
    if (!handle) return;

    const isCurrent = audio.current === handle;
    if (clearCurrent && isCurrent){
      // Clears audio.current and stops via handle.stop().
      audio.stopCurrent();
    } else {
      try { handle?.stop?.(); } catch {}
    }

    ambience = null;
    humOsc = null;
    humGain = null;
    noise = null;
    drone = null;
  }

  function onAudioOn(){
    if (!audio.enabled) return;

    // Defensive: avoid stacking our own ambience if onAudioOn gets called repeatedly.
    stopAmbience({ clearCurrent: true });

    ambience = makeAmbienceHandle();
    audio.setCurrent(ambience);
  }

  function onAudioOff(){
    stopAmbience({ clearCurrent: true });
  }

  function destroy(){ onAudioOff(); }

  function currentPhase(){
    const p = ((t / PHASE_DUR) | 0) % PHASES.length;
    const within = t - Math.floor(t / PHASE_DUR) * PHASE_DUR;
    return { idx: p, within, frac: within / PHASE_DUR };
  }

  function update(dt){
    t += dt;
    beatPulse = Math.max(0, beatPulse - dt * 1.8);

    const ph = currentPhase();
    if (ph.idx !== phaseIndex){
      phaseIndex = ph.idx;
      beatPulse = 1;

      if (phaseIndex === 0) safeBeep({ freq: 220, dur: 0.06, gain: 0.014, type: 'sine' });
      if (phaseIndex === 1) safeBeep({ freq: 330, dur: 0.05, gain: 0.012, type: 'triangle' });
      if (phaseIndex === 2) safeBeep({ freq: 520, dur: 0.04, gain: 0.010, type: 'square' });
      if (phaseIndex === 3) safeBeep({ freq: 260, dur: 0.06, gain: 0.012, type: 'sine' });
    }

    const P = PHASES[phaseIndex];

    // machine rotation
    const wob = 0.15 * Math.sin(t * 0.9);
    for (let i = 0; i < machines.length; i++){
      const m = machines[i];
      const local = (0.9 + 0.1 * Math.sin(t * (0.7 + i * 0.2))) * (1 + wob * 0.25);
      m.rot = (m.rot + dt * P.rot * local) % (Math.PI * 2);
    }

    // rare deterministic power surge (special moment)
    if (t >= nextSurgeAt){
      while (t >= nextSurgeAt){
        const startAt = nextSurgeAt;
        const dur = 2.0 + surgeRand() * 3.0;
        powerSurge = { a: 0, startAt, dur };
        nextSurgeAt += 45 + surgeRand() * 75;
      }
      safeBeep({ freq: 110, dur: 0.08, gain: 0.016, type: 'sawtooth' });
      safeBeep({ freq: 55, dur: 0.14, gain: 0.014, type: 'square' });
    }

    if (powerSurge.dur > 0){
      const u = (t - powerSurge.startAt) / powerSurge.dur;
      if (u >= 1){
        powerSurge = { a: 0, startAt: 0, dur: 0 };
      } else {
        const tri = 1 - Math.abs(u * 2 - 1);
        powerSurge.a = ease(tri);
      }
    } else {
      powerSurge.a = 0;
    }

    // rare deterministic COIN JAM moment (special moment)
    if (t >= nextJamAt){
      while (t >= nextJamAt){
        const startAt = nextJamAt;
        const machine = (jamRand() * machines.length) | 0;
        coinJam = { a: 0, startAt, machine };
        nextJamAt += 90 + jamRand() * 150;
      }
      safeBeep({ freq: 660, dur: 0.05, gain: 0.012, type: 'square' });
      safeBeep({ freq: 330, dur: 0.09, gain: 0.010, type: 'sawtooth' });
    }

    if (coinJam.startAt > 0){
      const u = t - coinJam.startAt;
      if (u < 0){
        coinJam.a = 0;
      } else if (u < JAM_FADE_IN){
        coinJam.a = u / JAM_FADE_IN;
      } else if (u < JAM_FADE_IN + JAM_HOLD){
        coinJam.a = 1;
      } else if (u < JAM_FADE_IN + JAM_HOLD + JAM_FADE_OUT){
        coinJam.a = 1 - (u - JAM_FADE_IN - JAM_HOLD) / JAM_FADE_OUT;
      } else {
        coinJam = { a: 0, startAt: 0, machine: 0 };
      }
    } else {
      coinJam.a = 0;
    }

    // neon flicker moments
    neonFlicker = Math.max(0, neonFlicker - dt * 5.0);
    if (t >= nextFlickerAt){
      neonFlicker = 1;
      nextFlickerAt = t + 2.2 + rand() * 6.5;
      if (audio.enabled && audioRand() < 0.25) safeBeep({ freq: 780 + audioRand() * 120, dur: 0.03, gain: 0.006, type: 'square' });
    }

    // lost sock alert card (popup)
    if (alert.startAt > 0){
      const u = t - alert.startAt;
      if (u < 0){
        alert.a = 0;
      } else if (u < ALERT_FADE_IN){
        alert.a = u / ALERT_FADE_IN;
      } else if (u < ALERT_FADE_IN + ALERT_HOLD){
        alert.a = 1;
      } else if (u < ALERT_FADE_IN + ALERT_HOLD + ALERT_FADE_OUT){
        alert.a = 1 - (u - ALERT_FADE_IN - ALERT_HOLD) / ALERT_FADE_OUT;
      } else {
        alert = { a: 0, machine: 0, msg: '', startAt: 0 };
      }
    } else {
      alert.a = 0;
    }

    if (t >= nextAlertAt){
      const m = (rand() * machines.length) | 0;

      // Preserve the main RNG sequence: we used to call rand() here via pick().
      rand();

      const sock = nextSockMsg();
      alert = { a: 0, machine: m + 1, msg: sock, startAt: t };
      safeBeep({ freq: 880, dur: 0.06, gain: 0.014, type: 'square' });
      safeBeep({ freq: 440, dur: 0.08, gain: 0.010, type: 'triangle' });
      nextAlertAt = t + 22 + rand() * 26;
    }

    // audio intensity follows phase
    if (audio.enabled && humGain && noise){
      const wantHum = (phaseIndex === 2 ? 0.020 : 0.012) + beatPulse * 0.006;
      const wantNoise = (phaseIndex === 0 ? 0.004 : phaseIndex === 1 ? 0.005 : phaseIndex === 2 ? 0.003 : 0.002);
      humGain.gain.value = lerp(humGain.gain.value, wantHum, 1 - Math.exp(-dt * 3.2));
      noise.gain.gain.value = lerp(noise.gain.gain.value, wantNoise, 1 - Math.exp(-dt * 2.8));

      // subtle "spin-up" pitch bend
      try {
        const base = 58 + (seed % 7);
        const bend = phaseIndex === 2 ? 18 * ease(ph.frac) : 0;
        humOsc.frequency.value = base + bend;
      } catch {}
    }
  }

  function drawBackground(ctx, P){
    ensureStaticLayers();

    if (cache.bg && cache.bg !== false){
      ctx.drawImage(cache.bg, 0, 0);
    } else {
      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, pal.bg0);
      g.addColorStop(0.55, pal.bg1);
      g.addColorStop(1, '#030407');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);

      // pale interior wall panel between window band and floor
      const wallTop = h * 0.29;
      const wallBottom = floorY || (h * 0.55);
      if (wallBottom > wallTop){
        const wg = ctx.createLinearGradient(0, wallTop, 0, wallBottom);
        wg.addColorStop(0, 'rgba(233,239,247,0.26)');
        wg.addColorStop(1, 'rgba(214,225,236,0.34)');
        ctx.fillStyle = wg;
        ctx.fillRect(0, wallTop, w, wallBottom - wallTop);

        const mid = wallTop + (wallBottom - wallTop) * 0.52;
        const topLift = ctx.createLinearGradient(0, wallTop, 0, mid);
        topLift.addColorStop(0, 'rgba(242,246,252,0.26)');
        topLift.addColorStop(1, 'rgba(242,246,252,0.06)');
        ctx.fillStyle = topLift;
        ctx.fillRect(0, wallTop, w, mid - wallTop);

        ctx.strokeStyle = 'rgba(32,48,68,0.28)';
        ctx.lineWidth = Math.max(1, Math.floor(dpr));
        ctx.beginPath();
        ctx.moveTo(0, wallBottom - 1);
        ctx.lineTo(w, wallBottom - 1);
        ctx.stroke();
      }
    }

    const drift = Math.sin(t * 0.08) * w * 0.01;

    // window (midground)
    ctx.save();
    ctx.translate(drift, 0);

    const wx = windowFx.x;
    const wy = windowFx.y;
    const ww = windowFx.w;
    const wh = windowFx.h;

    const frame = Math.max(8, Math.floor(Math.min(w, h) * 0.012));
    const rad = Math.max(16, Math.floor(Math.min(ww, wh) * 0.08));

    if (cache.window && cache.window !== false){
      ctx.drawImage(cache.window, 0, 0);
    } else {
      // frame
      ctx.fillStyle = 'rgba(0,0,0,0.52)';
      roundedRect(ctx, wx - frame, wy - frame, ww + frame * 2, wh + frame * 2, rad + frame);
      ctx.fill();

      ctx.strokeStyle = 'rgba(220,240,255,0.10)';
      ctx.lineWidth = Math.max(1, Math.floor(dpr));
      roundedRect(ctx, wx - frame + 1, wy - frame + 1, ww + frame * 2 - 2, wh + frame * 2 - 2, rad + frame - 1);
      ctx.stroke();

      // glass
      const gg = ctx.createLinearGradient(0, wy, 0, wy + wh);
      gg.addColorStop(0, 'rgba(24,34,48,0.65)');
      gg.addColorStop(0.55, 'rgba(12,18,26,0.56)');
      gg.addColorStop(1, 'rgba(6,10,16,0.72)');
      ctx.fillStyle = gg;
      roundedRect(ctx, wx, wy, ww, wh, rad);
      ctx.fill();

      // clip to glass area for static interior details
      ctx.save();
      ctx.beginPath();
      roundedRect(ctx, wx, wy, ww, wh, rad);
      ctx.clip();

      // soft reflection band
      const rg = ctx.createLinearGradient(wx, wy, wx + ww, wy + wh);
      rg.addColorStop(0, 'rgba(255,255,255,0.00)');
      rg.addColorStop(0.35, 'rgba(255,255,255,0.06)');
      rg.addColorStop(0.7, 'rgba(255,255,255,0.00)');
      ctx.fillStyle = rg;
      ctx.fillRect(wx, wy, ww, wh);

      // mullions
      ctx.strokeStyle = 'rgba(235,245,255,0.08)';
      ctx.lineWidth = Math.max(1, Math.floor(dpr));
      for (const f of [1/3, 2/3]){
        const x = wx + ww * f;
        ctx.beginPath();
        ctx.moveTo(x, wy);
        ctx.lineTo(x, wy + wh);
        ctx.stroke();
      }
      const hy = wy + wh * 0.58;
      ctx.beginPath();
      ctx.moveTo(wx, hy);
      ctx.lineTo(wx + ww, hy);
      ctx.stroke();

      ctx.restore();

      // sill
      ctx.fillStyle = 'rgba(0,0,0,0.28)';
      ctx.fillRect(wx - frame, wy + wh + frame * 0.25, ww + frame * 2, Math.max(4, Math.floor(frame * 0.35)));
    }

    // clip to glass area for exterior details
    ctx.save();
    ctx.beginPath();
    roundedRect(ctx, wx, wy, ww, wh, rad);
    ctx.clip();

    // distant city/neon specks (subtle)
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < windowFx.lights.length; i++){
      const L = windowFx.lights[i];
      const tw = 0.5 + 0.5 * Math.sin(t * L.tw + L.ph);
      const a = 0.05 + 0.10 * tw;
      ctx.globalAlpha = a;
      ctx.fillStyle = L.col;
      ctx.beginPath();
      ctx.arc(wx + L.x, wy + L.y, L.r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
    ctx.globalAlpha = 1;

    // rain streaks (on glass)
    ctx.globalCompositeOperation = 'screen';
    ctx.strokeStyle = 'rgba(120,190,255,0.08)';
    ctx.lineWidth = Math.max(1, Math.floor(dpr));
    const streaks = 52;
    for (let i = 0; i < streaks; i++){
      const x = wx + (i / streaks) * ww;
      const y0 = wy + ((t * (42 + i * 0.6)) % wh);
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x - ww * 0.015, y0 + wh * 0.22);
      ctx.stroke();
    }
    ctx.globalCompositeOperation = 'source-over';

    ctx.restore(); // clip
    ctx.restore(); // drift translate

    // placard base (kept un-drifted for legacy composition/legibility)
    if (cache.placard && cache.placard !== false){
      ctx.drawImage(cache.placard, 0, 0);
    } else {
      const sx = wx + ww * 0.08;
      const sy = wy + wh * 0.18;
      const sw = ww * 0.50;
      const sh = wh * 0.42;
      const sr = Math.max(10, sh * 0.24);

      // mounts
      ctx.fillStyle = 'rgba(48,58,78,0.88)';
      ctx.fillRect(sx + sw * 0.16, sy - sh * 0.22, Math.max(2, sw * 0.01), sh * 0.22);
      ctx.fillRect(sx + sw * 0.84, sy - sh * 0.22, Math.max(2, sw * 0.01), sh * 0.22);

      // sign plate
      const sg = ctx.createLinearGradient(0, sy, 0, sy + sh);
      sg.addColorStop(0, 'rgba(16,22,34,0.88)');
      sg.addColorStop(1, 'rgba(8,12,20,0.90)');
      ctx.fillStyle = sg;
      roundedRect(ctx, sx, sy, sw, sh, sr);
      ctx.fill();

      ctx.strokeStyle = 'rgba(220,240,255,0.24)';
      ctx.lineWidth = Math.max(1.2, Math.floor(dpr * 1.1));
      roundedRect(ctx, sx + 1, sy + 1, sw - 2, sh - 2, sr - 1);
      ctx.stroke();
    }

    // keep the top-left clear; title and 24H now live on the mirrored window placard
    const surge = powerSurge.a;
    const flick = (neonFlicker > 0 || surge > 0)
      ? ((surge > 0 ? 0.12 : 0.35) + (surge > 0 ? 0.88 : 0.65) * (0.5 + 0.5 * Math.sin(t * (surge > 0 ? 86 : 42))))
      : 1;
    const neonA = (0.92 + 0.18 * flick) * (0.92 + P.glow) * (1 + 0.38 * surge);

    // mirrored outward-facing channel sign inside window
    ctx.save();
    const sx = wx + ww * 0.08;
    const sy = wy + wh * 0.18;
    const sw = ww * 0.50;
    const sh = wh * 0.42;
    const sr = Math.max(10, sh * 0.24);

    // neon tube edge
    const sf = 0.75 + 0.25 * Math.sin(t * 4.5);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.strokeStyle = pal.neonM;
    ctx.lineWidth = Math.max(2.2, sh * 0.10);
    ctx.shadowColor = pal.neonM;
    ctx.shadowBlur = 16 + 16 * (0.4 + P.glow) * sf;
    ctx.globalAlpha = 0.55 + (0.30 + P.glow * 0.36) * sf;
    roundedRect(ctx, sx + 4, sy + 4, sw - 8, sh - 8, sr - 3);
    ctx.stroke();
    ctx.restore();

    // mirrored text to simulate outward-facing sign seen from inside
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.floor(font * 0.92)}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`;
    const tx = sx + sw * 0.50;
    const ty = sy + sh * 0.54;
    ctx.translate(tx, ty);
    ctx.scale(-1, 1);
    ctx.shadowColor = `rgba(255,102,217,${0.50 * neonA})`;
    ctx.shadowBlur = 12 + beatPulse * 8;
    ctx.fillStyle = `rgba(255,102,217,${0.90 * neonA})`;
    ctx.textAlign = 'center';
    ctx.fillText('NEON LAUNDROMAT  •  24H', 0, 0);
    ctx.restore();
  }
  function drawFloor(ctx, P){
    const yH = floorY || (h * 0.48);

    const g = ctx.createLinearGradient(0, yH, 0, h);
    g.addColorStop(0, pal.floor0);
    g.addColorStop(1, pal.floor1);
    ctx.fillStyle = g;
    ctx.fillRect(0, yH, w, h - yH);

    // tiles
    const tile = Math.max(28, Math.floor(Math.min(w, h) * 0.065));
    const dx = (t * 8) % tile;
    const dy = (t * 6) % tile;

    ctx.strokeStyle = pal.grout;
    ctx.lineWidth = Math.max(1, Math.floor(dpr));

    for (let x = -tile; x <= w + tile; x += tile){
      ctx.beginPath();
      ctx.moveTo(x + dx, yH);
      ctx.lineTo(x + dx, h);
      ctx.stroke();
    }

    for (let y = yH - tile; y <= h + tile; y += tile){
      ctx.beginPath();
      ctx.moveTo(0, y + dy);
      ctx.lineTo(w, y + dy);
      ctx.stroke();
    }

    // soft cool reflection over white tile
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const r = ctx.createLinearGradient(0, yH, 0, h);
    r.addColorStop(0, `rgba(108,242,255,${0.04 + P.glow * 0.10})`);
    r.addColorStop(1, 'rgba(108,242,255,0)');
    ctx.fillStyle = r;
    ctx.fillRect(0, yH, w, h - yH);
    ctx.restore();

    // vignette
    const v = ctx.createRadialGradient(w * 0.5, h * 0.72, Math.min(w, h) * 0.1, w * 0.5, h * 0.72, Math.min(w, h) * 0.7);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.42)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
  }

  function drawFixtures(ctx, P){
    drawCounter(ctx, P);
    drawDryers(ctx, P);
  }

  function drawCounter(ctx, P){
    if (!counter || counter.w <= 0) return;

    const x = counter.x;
    const y = counter.y;
    const cw = counter.w;
    const ch = counter.h;
    const rr = Math.max(8, Math.floor(Math.min(cw, ch) * 0.20));

    ctx.save();
    // table shadow
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.beginPath();
    ctx.ellipse(x + cw * 0.50, y + ch * 1.55, cw * 0.52, ch * 0.30, 0, 0, Math.PI * 2);
    ctx.fill();

    // table top
    const tg = ctx.createLinearGradient(0, y, 0, y + ch);
    tg.addColorStop(0, 'rgba(34,46,64,0.78)');
    tg.addColorStop(1, 'rgba(14,18,24,0.92)');
    ctx.fillStyle = tg;
    roundedRect(ctx, x, y, cw, ch, rr);
    ctx.fill();

    ctx.strokeStyle = 'rgba(220,240,255,0.14)';
    ctx.lineWidth = Math.max(1, Math.floor(dpr));
    roundedRect(ctx, x + 1, y + 1, cw - 2, ch - 2, rr);
    ctx.stroke();

    // legs so it clearly reads as a table
    const legW = Math.max(4, cw * 0.026);
    const legH = ch * 0.92;
    ctx.fillStyle = 'rgba(14,18,24,0.88)';
    ctx.fillRect(x + cw * 0.14, y + ch * 0.90, legW, legH);
    ctx.fillRect(x + cw * 0.80, y + ch * 0.90, legW, legH);

    // folded towels
    const stackW = cw * 0.22;
    const stackH = ch * 0.24;
    const tx = x + cw * 0.68;
    const ty = y + ch * 0.20;
    const towelCols = [pal.neonC, pal.neonM, pal.neonO];
    for (let i = 0; i < 3; i++){
      ctx.fillStyle = 'rgba(0,0,0,0.22)';
      roundedRect(ctx, tx - i * 2, ty + i * (stackH * 0.85), stackW, stackH, stackH * 0.35);
      ctx.fill();
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.12 + P.glow * 0.10;
      ctx.fillStyle = towelCols[i % towelCols.length];
      roundedRect(ctx, tx - i * 2, ty + i * (stackH * 0.85), stackW, stackH, stackH * 0.35);
      ctx.fill();
      ctx.restore();
    }

    ctx.restore();
  }

  function drawDryers(ctx, P){
    if (!dryers || dryers.length === 0) return;

    // sign
    const left = dryers.reduce((m, d) => Math.min(m, d.x), dryers[0].x);
    const top = dryers.reduce((m, d) => Math.min(m, d.y), dryers[0].y);
    const right = dryers.reduce((m, d) => Math.max(m, d.x + d.w), dryers[0].x + dryers[0].w);

    const sw = right - left;
    const sh = Math.min(h * 0.05, 42);
    const sx = left;
    const sy = Math.max(h * 0.42, top - sh - h * 0.012);

    ctx.save();
    ctx.globalAlpha = 0.88;
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    roundedRect(ctx, sx, sy, sw, sh, 10);
    ctx.fill();

    ctx.font = `${Math.floor(small * 0.92)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = `rgba(255,207,106,${0.78 + 0.22 * P.glow})`;
    ctx.fillText('DRYERS', sx + 14, sy + sh * 0.5);
    ctx.restore();

    for (let i = 0; i < dryers.length; i++){
      drawDryerUnit(ctx, dryers[i], P, i);
    }
  }

  function drawDryerUnit(ctx, d, P, idx){
    const x = d.x;
    const y = d.y;
    const dw = d.w;
    const dh = d.h;

    const r = Math.max(14, Math.floor(Math.min(dw, dh) * 0.10));

    // shadow
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.36)';
    ctx.beginPath();
    ctx.ellipse(x + dw * 0.52, y + dh * 0.92, dw * 0.50, dh * 0.10, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // body
    const bg = ctx.createLinearGradient(x, y, x + dw, y + dh);
    bg.addColorStop(0, '#182332');
    bg.addColorStop(0.55, '#0f1722');
    bg.addColorStop(1, '#090c12');
    ctx.fillStyle = bg;
    roundedRect(ctx, x, y, dw, dh, r);
    ctx.fill();

    // trim
    ctx.strokeStyle = 'rgba(220,240,255,0.18)';
    ctx.lineWidth = Math.max(1, Math.floor(dpr));
    roundedRect(ctx, x + 1, y + 1, dw - 2, dh - 2, r);
    ctx.stroke();

    // vent panel
    const vx = x + dw * 0.10;
    const vy = y + dh * 0.10;
    const vw = dw * 0.80;
    const vh = dh * 0.18;
    ctx.fillStyle = 'rgba(0,0,0,0.32)';
    roundedRect(ctx, vx, vy, vw, vh, r * 0.65);
    ctx.fill();

    ctx.save();
    ctx.globalAlpha = 0.12 + P.glow * 0.18;
    ctx.fillStyle = d.tint;
    const slits = 6;
    for (let i = 0; i < slits; i++){
      const yy = vy + vh * (0.22 + (i / (slits - 1)) * 0.56);
      ctx.fillRect(vx + vw * 0.10, yy, vw * 0.80, Math.max(1, Math.floor(dpr)));
    }
    ctx.restore();

    // door
    const cx = x + dw * 0.5;
    const topBound = y + dh * 0.30;
    const bottomBound = y + dh * 0.80;
    const fitR = Math.max(8, ((bottomBound - topBound) * 0.5) / 1.18);
    const R = Math.min(d.doorR, fitR);
    const cy = clamp(y + dh * 0.60, topBound + R * 1.18, bottomBound - R * 1.18);

    ctx.fillStyle = 'rgba(0,0,0,0.36)';
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.18, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(255,207,106,0.14)';
    ctx.lineWidth = Math.max(2, Math.floor(dpr * 1.2));
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.18, 0, Math.PI * 2);
    ctx.stroke();

    // glass
    const gg = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.35, 1, cx, cy, R * 1.2);
    gg.addColorStop(0, 'rgba(255,255,255,0.10)');
    gg.addColorStop(0.35, pal.glass);
    gg.addColorStop(1, 'rgba(0,0,0,0.72)');
    ctx.fillStyle = gg;
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.fill();

    // heat glow (stronger during DRY phase)
    const heatBase = (P.id === 'dry' ? 1.0 : 0.35);
    const heat = heatBase * (0.5 + 0.5 * Math.sin(t * 1.0 + idx * 1.7));
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.06 + 0.18 * heat;
    ctx.fillStyle = pal.neonO;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 0.92, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // label
    ctx.save();
    ctx.font = `${Math.floor(small * 0.86)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(235,245,255,0.55)';
    ctx.fillText(`D${idx + 1}`, x + dw * 0.10, y + dh * 0.86);
    ctx.restore();

    // subtle edge glow
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.strokeStyle = `rgba(255,207,106,${0.04 + 0.12 * P.glow})`;
    ctx.lineWidth = Math.max(2, Math.floor(dpr * 1.2));
    roundedRect(ctx, x + 4, y + 4, dw - 8, dh - 8, r * 0.95);
    ctx.stroke();
    ctx.restore();
  }

  function drawMachine(ctx, m, P, idx){
    const x = m.x;
    const y = m.y;

    const bodyW = m.w;
    const bodyH = m.h;
    const r = Math.max(16, Math.floor(Math.min(bodyW, bodyH) * 0.08));

    const jam = (coinJam.a > 0 && coinJam.machine === idx) ? ease(coinJam.a) : 0;
    const jamStrobe = jam > 0 ? (0.5 + 0.5 * Math.sin(t * 38 + idx * 2.1)) : 0;

    // shadow
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.40)';
    ctx.beginPath();
    ctx.ellipse(x + bodyW * 0.52, y + bodyH * 0.92, bodyW * 0.48, bodyH * 0.11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // body
    const bg = ctx.createLinearGradient(x, y, x + bodyW, y + bodyH);
    bg.addColorStop(0, pal.machineHi);
    bg.addColorStop(0.5, pal.machine);
    bg.addColorStop(1, '#0b0f16');

    ctx.fillStyle = bg;
    roundedRect(ctx, x, y, bodyW, bodyH, r);
    ctx.fill();

    // trim
    ctx.strokeStyle = pal.metal;
    ctx.lineWidth = Math.max(1, Math.floor(dpr));
    roundedRect(ctx, x + 1, y + 1, bodyW - 2, bodyH - 2, r);
    ctx.stroke();

    // control panel
    const px = x + bodyW * 0.08;
    const py = y + bodyH * 0.10;
    const pw = bodyW * 0.84;
    const ph = bodyH * 0.15;
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    roundedRect(ctx, px, py, pw, ph, r * 0.7);
    ctx.fill();

    const light = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 1.2 + idx));
    ctx.save();
    ctx.globalAlpha = (0.10 + P.glow * 0.22) * (0.65 + 0.35 * light);
    ctx.fillStyle = m.tint;
    ctx.fillRect(px + pw * 0.02, py + ph * 0.78, pw * (0.20 + 0.18 * P.glow), Math.max(2, Math.floor(dpr)));
    ctx.restore();

    // COIN JAM signature: control-panel strobe.
    if (jam > 0){
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = jam * (0.12 + 0.58 * jamStrobe);
      ctx.fillStyle = pal.warn;
      roundedRect(ctx, px + 2, py + 2, pw - 4, ph - 4, r * 0.7);
      ctx.fill();
      ctx.restore();

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.strokeStyle = pal.warn;
      ctx.lineWidth = Math.max(2, Math.floor(dpr * 1.6));
      ctx.shadowColor = pal.warn;
      ctx.shadowBlur = 18;
      ctx.globalAlpha = jam * (0.25 + 0.55 * jamStrobe);
      roundedRect(ctx, px + 1, py + 1, pw - 2, ph - 2, r * 0.7);
      ctx.stroke();
      ctx.restore();
    }

    // panel UI (display + dial + buttons) so the machines read a bit more “real”
    const dispX = px + pw * 0.06;
    const dispY = py + ph * 0.20;
    const dispW = pw * 0.34;
    const dispH = ph * 0.52;

    ctx.fillStyle = 'rgba(0,0,0,0.42)';
    roundedRect(ctx, dispX, dispY, dispW, dispH, r * 0.45);
    ctx.fill();

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.10 + (0.14 + 0.18 * P.glow) * (0.65 + 0.35 * light);
    ctx.fillStyle = m.tint;
    ctx.fillRect(dispX + 2, dispY + dispH - Math.max(2, Math.floor(dpr)), dispW - 4, Math.max(2, Math.floor(dpr)));
    ctx.restore();

    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(235,245,255,0.06)';
    ctx.fillRect(dispX + 7, dispY + 6, dispW - 14, Math.max(2, Math.floor(dpr)));
    ctx.restore();

    // Dial + buttons spacing: avoid overlap on smaller viewports by
    // pushing the dial right a touch and keeping buttons further left.
    const dialX = px + pw * 0.87;
    const dialY = py + ph * 0.50;
    const dialR = Math.min(ph * 0.26, pw * 0.095);

    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.arc(dialX, dialY, dialR * 1.25, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = 'rgba(220,240,255,0.12)';
    ctx.beginPath();
    ctx.arc(dialX, dialY, dialR, 0, Math.PI * 2);
    ctx.fill();

    const notch = -1.25 + 0.85 * (0.5 + 0.5 * Math.sin(t * 0.22 + idx * 1.7));
    ctx.strokeStyle = 'rgba(235,245,255,0.32)';
    ctx.lineWidth = Math.max(2, Math.floor(dpr));
    ctx.beginPath();
    ctx.moveTo(dialX + Math.cos(notch) * dialR * 0.20, dialY + Math.sin(notch) * dialR * 0.20);
    ctx.lineTo(dialX + Math.cos(notch) * dialR * 0.95, dialY + Math.sin(notch) * dialR * 0.95);
    ctx.stroke();

    const btnY = py + ph * 0.50;
    const btnR = Math.max(2, Math.floor(Math.min(pw, ph) * 0.06));
    for (let b = 0; b < 2; b++){
      const bx = px + pw * (0.57 + b * 0.085);
      ctx.fillStyle = 'rgba(0,0,0,0.42)';
      ctx.beginPath();
      ctx.arc(bx, btnY, btnR * 1.25, 0, Math.PI * 2);
      ctx.fill();

      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = (0.08 + 0.18 * P.glow) * (0.65 + 0.35 * light);
      ctx.fillStyle = m.tint;
      ctx.beginPath();
      ctx.arc(bx, btnY, btnR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // door
    const cx = x + bodyW * 0.5;
    const topBound = y + bodyH * 0.30;
    const bottomBound = y + bodyH * 0.80;
    const fitR = Math.max(10, ((bottomBound - topBound) * 0.5) / 1.18);
    const R = Math.min(m.doorR, fitR);
    const cy = clamp(y + bodyH * 0.60, topBound + R * 1.18, bottomBound - R * 1.18);

    // COIN JAM signature: door shake.
    ctx.save();
    if (jam > 0){
      const shake = jam * (0.45 + 0.55 * jamStrobe);
      const shx = Math.sin(t * 55 + idx * 1.7) * shake * 3.4;
      const shy = Math.cos(t * 61 + idx * 1.1) * shake * 2.6;
      ctx.translate(shx, shy);
    }

    // bezel
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.18, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(220,240,255,0.20)';
    ctx.lineWidth = Math.max(2, Math.floor(dpr * 1.4));
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.18, 0, Math.PI * 2);
    ctx.stroke();

    // clip for drum
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();

    // drum interior
    const dg = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.2, cx, cy, R * 1.2);
    dg.addColorStop(0, 'rgba(10,12,16,1)');
    dg.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = dg;
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

    // tint glow rim (per-machine identity)
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = (0.06 + P.glow * 0.14) * (0.65 + 0.35 * light);
    const tg = ctx.createRadialGradient(cx, cy, R * 0.25, cx, cy, R * 1.05);
    tg.addColorStop(0, 'rgba(0,0,0,0)');
    tg.addColorStop(0.55, 'rgba(0,0,0,0)');
    tg.addColorStop(1, m.tint);
    ctx.fillStyle = tg;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.02, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // water level + slosh
    const slosh = Math.sin(t * 2.0 + idx) * 0.04;
    const level = P.water;
    const waterY = cy + R * (0.65 - level) + slosh * R;

    if (level > 0.08){
      const wg = ctx.createLinearGradient(0, waterY - R, 0, cy + R);
      wg.addColorStop(0, `rgba(108,242,255,${0.06 + P.glow * 0.10})`);
      wg.addColorStop(0.55, `rgba(108,242,255,${0.13 + P.glow * 0.18})`);
      wg.addColorStop(1, 'rgba(108,242,255,0)');
      ctx.fillStyle = wg;
      ctx.fillRect(cx - R, waterY, R * 2, cy + R - waterY);

      // bubbles
      const bubN = 18;
      for (let i = 0; i < bubN; i++){
        const a = (i / bubN) * Math.PI * 2 + (t * 0.6 + idx) * 0.4;
        const rr = (0.1 + (i % 6) * 0.12) * R;
        const bx = cx + Math.cos(a) * rr;
        const by = lerp(waterY + 6, cy + R * 0.85, (i / bubN)) + Math.sin(t * 1.2 + i) * 1.5;
        const br = (1.5 + (i % 4)) * (0.8 + P.bubbles);
        ctx.fillStyle = `rgba(245,250,255,${0.08 + 0.12 * P.bubbles})`;
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // cloth swirl
    const swirlA = (P.id === 'spin') ? 0.18 : 0.35;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(m.rot);

    const stripes = 8;
    for (let i = 0; i < stripes; i++){
      const ang0 = (i / stripes) * Math.PI * 2;
      const ang1 = ang0 + Math.PI / stripes;
      ctx.strokeStyle = `rgba(255,102,217,${swirlA * (0.6 + 0.4 * light)})`;
      ctx.lineWidth = Math.max(2, Math.floor(dpr * 1.2));
      ctx.beginPath();
      ctx.arc(0, 0, R * (0.18 + i * 0.08), ang0, ang1);
      ctx.stroke();
    }

    // spin blur
    if (P.id === 'spin'){
      const blur = 0.55 + 0.45 * ease((Math.sin(t * 3.2) * 0.5 + 0.5));
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < 22; i++){
        const a = (i / 22) * Math.PI * 2 + t * 2.2;
        ctx.strokeStyle = `rgba(108,242,255,${0.03 + 0.06 * blur})`;
        ctx.lineWidth = Math.max(1, Math.floor(dpr));
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * R * 0.15, Math.sin(a) * R * 0.15);
        ctx.lineTo(Math.cos(a) * R * 0.95, Math.sin(a) * R * 0.95);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    // dry heat glow
    if (P.id === 'dry'){
      const heat = 0.5 + 0.5 * Math.sin(t * 1.1 + idx);
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = `rgba(255,207,106,${0.06 + 0.12 * heat})`;
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.95, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }

    ctx.restore();

    ctx.restore(); // clip

    // glass highlight
    const gg = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.35, 1, cx, cy, R * 1.2);
    gg.addColorStop(0, 'rgba(255,255,255,0.12)');
    gg.addColorStop(0.35, pal.glass);
    gg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gg;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.05, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore(); // coinJam door shake

    // tiny machine label
    ctx.save();
    ctx.font = `${Math.floor(small * 0.9)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(235,245,255,0.55)';
    ctx.fillText(`M${idx + 1}`, x + bodyW * 0.10, y + bodyH * 0.86);

    // phase indicator light
    const lx = x + bodyW * 0.86;
    const ly = y + bodyH * 0.14;
    const lr = Math.max(3, Math.floor(Math.min(bodyW, bodyH) * 0.02));
    ctx.fillStyle = `rgba(0,0,0,0.45)`;
    ctx.beginPath();
    ctx.arc(lx, ly, lr * 1.6, 0, Math.PI * 2);
    ctx.fill();

    const a = 0.35 + 0.55 * P.glow + 0.25 * beatPulse;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = m.tint;
    ctx.shadowColor = m.tint;
    ctx.shadowBlur = 10 + beatPulse * 10;
    ctx.beginPath();
    ctx.arc(lx, ly, lr, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.restore();

    // subtle neon edge on machine
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.strokeStyle = `rgba(255,102,217,${0.05 + 0.12 * P.glow})`;
    ctx.lineWidth = Math.max(2, Math.floor(dpr * 1.3));
    roundedRect(ctx, x + 4, y + 4, bodyW - 8, bodyH - 8, r * 0.95);
    ctx.stroke();
    ctx.restore();
  }

  function drawOverlay(ctx, P){
    // Keep the base scene clean; rely on the TV OSD for always-on labels.
    // This overlay is reserved for special moment UI (POWER SURGE, alerts).

    // POWER SURGE banner (special moment)
    if (powerSurge.a > 0){
      const a = powerSurge.a;
      const bw = Math.min(w * 0.30, 340);
      const bh = Math.min(h * 0.06, 56);
      const bx = w - bw - w * 0.04;
      const by = h - bh - h * 0.26;
      const blink = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(t * 18));

      ctx.save();
      ctx.globalAlpha = 0.92 * a;
      ctx.fillStyle = `rgba(10,12,14,${0.78 * blink})`;
      roundedRect(ctx, bx, by, bw, bh, 12);
      ctx.fill();

      ctx.globalAlpha = 1;
      ctx.strokeStyle = `rgba(255,207,106,${0.85 * blink})`;
      ctx.lineWidth = Math.max(2, Math.floor(dpr * 1.2));
      roundedRect(ctx, bx, by, bw, bh, 12);
      ctx.stroke();

      ctx.font = `${Math.floor(small * 0.95)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.textBaseline = 'middle';
      ctx.fillStyle = `rgba(255,207,106,${0.95 * blink})`;
      ctx.fillText('POWER SURGE', bx + 16, by + bh * 0.5);

      ctx.restore();
    }

    // COIN JAM banner (special moment)
    if (coinJam.a > 0){
      const a = ease(coinJam.a);
      const bw = Math.min(w * 0.28, 320);
      const bh = Math.min(h * 0.06, 56);
      const bx = w * 0.05;
      const by = h - bh - h * 0.26;
      const blink = 0.55 + 0.45 * (0.5 + 0.5 * Math.sin(t * 22));

      ctx.save();
      ctx.globalAlpha = 0.92 * a;
      ctx.fillStyle = `rgba(10,12,14,${0.78 * blink})`;
      roundedRect(ctx, bx, by, bw, bh, 12);
      ctx.fill();

      ctx.globalAlpha = 1;
      ctx.strokeStyle = `rgba(255,78,82,${0.88 * blink})`;
      ctx.lineWidth = Math.max(2, Math.floor(dpr * 1.2));
      roundedRect(ctx, bx, by, bw, bh, 12);
      ctx.stroke();

      ctx.font = `${Math.floor(small * 0.95)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.textBaseline = 'middle';
      ctx.fillStyle = `rgba(255,78,82,${0.95 * blink})`;
      ctx.fillText('COIN JAM', bx + 16, by + bh * 0.5);

      ctx.textAlign = 'right';
      ctx.fillStyle = `rgba(235,245,255,${0.78 + 0.22 * blink})`;
      ctx.fillText(`M${coinJam.machine + 1}`, bx + bw - 16, by + bh * 0.5);

      ctx.restore();
      ctx.textAlign = 'left';
    }

    // alert card
    if (alert.a > 0){
      const a = ease(alert.a);
      const cw = Math.min(w * 0.44, 460);
      const ch = Math.min(h * 0.18, 150);
      const cx0 = w - cw - w * 0.05;
      const cy0 = h - ch - h * 0.10;

      const pop = 1 - (1 - a) * (1 - a);
      const yoff = (1 - pop) * 18;
      const blink = 0.65 + 0.35 * (0.5 + 0.5 * Math.sin(t * 14));

      ctx.save();
      ctx.globalAlpha = 0.92 * a;
      ctx.fillStyle = `rgba(10,12,14,${0.85 * blink})`;
      roundedRect(ctx, cx0, cy0 + yoff, cw, ch, 14);
      ctx.fill();

      ctx.globalAlpha = 1;
      ctx.strokeStyle = `rgba(255,78,82,${0.72 * blink})`;
      ctx.lineWidth = Math.max(2, Math.floor(dpr * 1.5));
      roundedRect(ctx, cx0, cy0 + yoff, cw, ch, 14);
      ctx.stroke();

      ctx.font = `${Math.floor(small * 0.95)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.fillStyle = `rgba(255,78,82,${0.95 * blink})`;
      ctx.textBaseline = 'middle';
      ctx.fillText('LOST SOCK ALERT', cx0 + 18, cy0 + yoff + 22);

      ctx.font = `${font}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`;
      ctx.fillStyle = pal.text;
      ctx.fillText(`MACHINE ${alert.machine}`, cx0 + 18, cy0 + yoff + 56);

      ctx.font = `${Math.floor(font * 0.95)}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`;
      ctx.fillStyle = pal.subtext;
      ctx.fillText(`${alert.msg}  •  CHECK LINT TRAP`, cx0 + 18, cy0 + yoff + 86);

      ctx.font = `${Math.floor(small * 0.95)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.fillStyle = `rgba(255,207,106,0.82)`;
      ctx.fillText('PLEASE REMAIN CALM', cx0 + 18, cy0 + yoff + 116);

      ctx.restore();
    }
  }

  function render(ctx){
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const P = PHASES[phaseIndex < 0 ? 0 : phaseIndex];

    drawBackground(ctx, P);
    drawWallSigns(ctx, P);
    drawFloor(ctx, P);
    drawFixtures(ctx, P);

    // machines (foreground)
    for (let i = 0; i < machines.length; i++){
      drawMachine(ctx, machines[i], P, i);
    }

    // dim room briefly during POWER SURGE, but keep OSD crisp by applying before overlay
    if (powerSurge.a > 0){
      const a = 0.18 + 0.45 * powerSurge.a;
      ctx.fillStyle = `rgba(0,0,0,${a})`;
      ctx.fillRect(0, 0, w, h);
    }

    drawOverlay(ctx, P);
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
