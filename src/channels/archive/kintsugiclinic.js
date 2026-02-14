// REVIEWED: 2026-02-12
import { mulberry32, clamp } from '../util/prng.js';
import { simpleDrone } from '../util/audio.js';

function pick(rand, arr){ return arr[(rand() * arr.length) | 0]; }
function lerp(a,b,t){ return a + (b-a)*t; }
function ease(t){ t = clamp(t, 0, 1); return t*t*(3 - 2*t); }

function distPointSeg(px, py, ax, ay, bx, by){
  const vx = bx - ax;
  const vy = by - ay;
  const wx = px - ax;
  const wy = py - ay;
  const vv = vx*vx + vy*vy || 1;
  let t = (wx*vx + wy*vy) / vv;
  t = clamp(t, 0, 1);
  const cx = ax + vx * t;
  const cy = ay + vy * t;
  const dx = px - cx;
  const dy = py - cy;
  return { d2: dx*dx + dy*dy, t };
}

function roundedRect(ctx, x, y, w, h, r){
  r = Math.min(r, w*0.5, h*0.5);
  ctx.beginPath();
  ctx.moveTo(x+r, y);
  ctx.arcTo(x+w, y, x+w, y+h, r);
  ctx.arcTo(x+w, y+h, x, y+h, r);
  ctx.arcTo(x, y+h, x, y, r);
  ctx.arcTo(x, y, x+w, y, r);
  ctx.closePath();
}

function polyTotalLen(pts){
  let L = 0;
  for (let i=1;i<pts.length;i++){
    const dx = pts[i].x - pts[i-1].x;
    const dy = pts[i].y - pts[i-1].y;
    L += Math.hypot(dx, dy);
  }
  return L || 1;
}

function drawPolylinePartial(ctx, pts, frac){
  frac = clamp(frac, 0, 1);
  if (pts.length < 2 || frac <= 0) return;

  const total = polyTotalLen(pts);
  const target = total * frac;
  let acc = 0;

  ctx.beginPath();
  ctx.moveTo(pts[0].x, pts[0].y);

  for (let i=1;i<pts.length;i++){
    const a = pts[i-1];
    const b = pts[i];
    const seg = Math.hypot(b.x - a.x, b.y - a.y);
    if (acc + seg >= target){
      const t = (target - acc) / (seg || 1);
      ctx.lineTo(lerp(a.x, b.x, t), lerp(a.y, b.y, t));
      return;
    }
    ctx.lineTo(b.x, b.y);
    acc += seg;
  }
}

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);
  // Audio determinism: never consume the visual PRNG from audio code paths.
  const arand = mulberry32((((seed | 0) ^ 0xA0D10) >>> 0));
  // UI/content determinism: keep subtitle/item shuffles from perturbing visual rand().
  const irand = mulberry32((((seed | 0) ^ 0x1E1A7E) >>> 0));

  let w = 0;
  let h = 0;
  let dpr = 1;
  let t = 0;

  // “Patient” rotation (5 min) for long-run interest.
  const ITEM_ROTATE_SEC = 5 * 60;
  const ITEMS = [
    { name: 'Tea bowl' },
    { name: 'Rice bowl' },
    { name: 'Soup bowl' },
    { name: 'Sake cup' },
    { name: 'Saucer' },
    { name: 'Serving plate' },
    { name: 'Small vase' },
    { name: 'Mini pitcher' },
    { name: 'Incense holder' },
    { name: 'Porcelain spoon' },
    { name: 'Sugar jar' },
    { name: 'Miso cup' },
  ];
  let itemOrder = [];
  let itemPos = 0;
  let item = ITEMS[0];
  let subtitle = '';
  let nextItemAt = ITEM_ROTATE_SEC;

  function shuffleInPlace(arr, r){
    for (let i = arr.length - 1; i > 0; i--){
      const j = (r() * (i + 1)) | 0;
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  function setItem(i){
    item = ITEMS[i] || ITEMS[0];
    subtitle = `${item.name} — crack • glue • dust • polish`;
  }

  function initItems(){
    itemOrder = shuffleInPlace(Array.from({ length: ITEMS.length }, (_, i) => i), irand);
    itemPos = 0;
    setItem(itemOrder[itemPos]);
    nextItemAt = ITEM_ROTATE_SEC;
  }

  function rotateItem(){
    itemPos = (itemPos + 1) % itemOrder.length;
    setItem(itemOrder[itemPos]);
    regen();
    onPhaseEnter();
    nextItemAt = ITEM_ROTATE_SEC;
  }

  let font = 16;
  let small = 12;
  let mono = 13;

  const palettes = [
    { wood: ['#24170f', '#17100b'], ceramic: ['#f1e9dd', '#dfd2c1'], ink: 'rgba(20,18,16,0.70)', gold: ['#f3d36a', '#b88b26'] },
    { wood: ['#2a1e16', '#1a120d'], ceramic: ['#f0f4f7', '#dfe7ee'], ink: 'rgba(18,20,24,0.70)', gold: ['#ffd884', '#b98c2d'] },
    { wood: ['#221915', '#151011'], ceramic: ['#efe2da', '#d7c4b8'], ink: 'rgba(25,18,18,0.70)', gold: ['#f5c86a', '#a87924'] },
  ];
  const pal = pick(rand, palettes);

  const PHASES = [
    { id: 'crack', label: 'CRACK' },
    { id: 'glue', label: 'GLUE' },
    { id: 'dust', label: 'DUST' },
    { id: 'polish', label: 'POLISH' },
  ];

  const PHASE_DUR = 18;
  let phaseIdx = 0;
  let phaseT = 0;

  // scene
  let pot = { x: 0, y: 0, r: 100 };

  // cracks: { pts:[{x,y}], len, depth, branches:[{pts:[{x,y}], depth}] }
  let cracks = [];

  // dust
  let dust = []; // {x,y,vx,vy,life,stuck,cr,shade}
  let dustAcc = 0;

  // glints
  let nextGlintAt = 0;
  let glint = null; // {cr, u}
  let glintFlash = 0;

  // polish glint “special moment” (rare, deterministic; 45–120s)
  // Keep explicit start/duration so we can ramp the signature in/out cleanly.
  let polishSpecial = { active: false, start: 0, dur: 0, until: 0 };
  let nextPolishSpecialAt = 0;

  // audio
  let ambience = null;

  // Perf: cache gradients so steady-state render allocates 0 gradients/frame.
  // Canvas gradients bake their creation coordinates/transform; time-varying
  // pottery sway/bob would force per-frame gradient rebuilds.
  const gradCache = {
    ctx: null,
    w: 0,
    h: 0,
    palKey: '',
    potKey: '',
    bench: null,
    benchSpot: null,
    ceramic: null,
    inner: null,
    gold: null,
    vignette: null,
  };

  function cacheKeyPal(){
    return `${pal.wood.join(',')}|${pal.ceramic.join(',')}|${pal.ink}|${pal.gold.join(',')}`;
  }
  function cacheKeyPot(){
    return `${pot.x.toFixed(2)}|${pot.y.toFixed(2)}|${pot.r.toFixed(2)}`;
  }

  function ensureGradients(ctx){
    const palKey = cacheKeyPal();
    const potKey = cacheKeyPot();
    const needs =
      gradCache.ctx !== ctx ||
      gradCache.w !== w ||
      gradCache.h !== h ||
      gradCache.palKey !== palKey ||
      gradCache.potKey !== potKey;

    if (!needs) return gradCache;

    gradCache.ctx = ctx;
    gradCache.w = w;
    gradCache.h = h;
    gradCache.palKey = palKey;
    gradCache.potKey = potKey;

    // bench
    const bench = ctx.createLinearGradient(0,0,0,h);
    bench.addColorStop(0, pal.wood[0]);
    bench.addColorStop(1, pal.wood[1]);
    gradCache.bench = bench;

    const benchSpot = ctx.createRadialGradient(w*0.5, h*0.48, Math.min(w,h)*0.05, w*0.5, h*0.48, Math.max(w,h)*0.7);
    benchSpot.addColorStop(0, 'rgba(0,0,0,0)');
    benchSpot.addColorStop(1, 'rgba(0,0,0,0.60)');
    gradCache.benchSpot = benchSpot;

    // pottery base
    const ceramic = ctx.createRadialGradient(pot.x - pot.r*0.22, pot.y - pot.r*0.18, pot.r*0.10, pot.x, pot.y, pot.r*1.12);
    ceramic.addColorStop(0, pal.ceramic[0]);
    ceramic.addColorStop(1, pal.ceramic[1]);
    gradCache.ceramic = ceramic;

    const inner = ctx.createRadialGradient(pot.x + pot.r*0.10, pot.y + pot.r*0.06, pot.r*0.18, pot.x, pot.y, pot.r*0.94);
    inner.addColorStop(0, 'rgba(0,0,0,0)');
    inner.addColorStop(1, 'rgba(0,0,0,0.22)');
    gradCache.inner = inner;

    // gold seams
    const gold = ctx.createLinearGradient(pot.x - pot.r, pot.y, pot.x + pot.r, pot.y);
    gold.addColorStop(0, pal.gold[1]);
    gold.addColorStop(0.5, pal.gold[0]);
    gold.addColorStop(1, pal.gold[1]);
    gradCache.gold = gold;

    // vignette
    const vg = ctx.createRadialGradient(w*0.5, h*0.50, Math.min(w,h)*0.18, w*0.5, h*0.50, Math.max(w,h)*0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.65)');
    gradCache.vignette = vg;

    return gradCache;
  }

  function swayBob(){
    // kept static so cached gradients remain valid
    return { sway: 0, bob: 0 };
  }

  function stopAmbience(){
    try { ambience?.stop?.(); } catch {}
    // Only clear current if we own it.
    if (audio.current === ambience) audio.current = null;
    ambience = null;
  }

  function safeBeep(opts){ if (audio.enabled) audio.beep(opts); }

  function nearestCrack(x, y){
    let best = { d2: 1e18, cr: -1, t: 0 };
    for (let ci=0;ci<cracks.length;ci++){
      const pts = cracks[ci].pts;
      for (let i=1;i<pts.length;i++){
        const a = pts[i-1];
        const b = pts[i];
        const r = distPointSeg(x, y, a.x, a.y, b.x, b.y);
        if (r.d2 < best.d2){
          // approximate u along this crack
          const pre = cracks[ci].segAcc[i-1] || 0;
          const segLen = cracks[ci].segLen[i-1] || 1;
          const u = (pre + segLen * r.t) / cracks[ci].len;
          best = { d2: r.d2, cr: ci, t: u };
        }
      }
    }
    return best;
  }

  function regen(){
    t = 0;
    phaseIdx = 0;
    phaseT = 0;

    // (pottery sway/bob disabled; see swayBob())

    pot = {
      x: w * (0.50 + (rand() - 0.5) * 0.04),
      y: h * (0.56 + (rand() - 0.5) * 0.04),
      r: Math.min(w, h) * (0.26 + rand() * 0.03),
    };

    // crack polylines
    cracks = [];
    const n = 3 + ((rand() * 3) | 0);
    for (let i=0;i<n;i++){
      const a0 = rand() * Math.PI * 2;
      const segs = 8 + ((rand() * 5) | 0);
      const pts = [];
      const startR = pot.r * (0.08 + rand() * 0.10);
      for (let s=0;s<=segs;s++){
        const rr = lerp(startR, pot.r * (0.96 + rand()*0.02), s / segs);
        const aa = a0 + (rand() - 0.5) * 0.55 * (s / segs);
        const j = (rand() - 0.5) * pot.r * 0.03;
        pts.push({
          x: pot.x + Math.cos(aa) * rr + Math.cos(aa + Math.PI/2) * j,
          y: pot.y + Math.sin(aa) * rr + Math.sin(aa + Math.PI/2) * j,
        });
      }

      // length + segment accumulators
      const segLen = [];
      const segAcc = [0];
      let L = 0;
      for (let k=1;k<pts.length;k++){
        const dx = pts[k].x - pts[k-1].x;
        const dy = pts[k].y - pts[k-1].y;
        const ll = Math.hypot(dx, dy);
        segLen.push(ll);
        L += ll;
        segAcc.push(L);
      }

      const depth = 0.55 + rand() * 0.70;

      // Tiny deterministic branching micro-cracks near endpoints (regen-time only).
      const branches = [];
      if (pts.length >= 3){
        const startAng = Math.atan2(pts[1].y - pts[0].y, pts[1].x - pts[0].x);
        const endAng = Math.atan2(pts[pts.length-1].y - pts[pts.length-2].y, pts[pts.length-1].x - pts[pts.length-2].x);

        const mkBranch = (x, y, baseAng, dMul) => {
          const len = pot.r * (0.04 + rand() * 0.06);
          const segs = 2 + ((rand() * 2) | 0);
          const ptsB = [{ x, y }];
          let ang = baseAng + (rand() < 0.5 ? -1 : 1) * (0.35 + rand() * 0.55);
          for (let s=1;s<=segs;s++){
            const f = s / segs;
            ang += (rand() - 0.5) * 0.25;
            const j = (rand() - 0.5) * pot.r * 0.01;
            ptsB.push({
              x: x + Math.cos(ang) * len * f + Math.cos(ang + Math.PI/2) * j,
              y: y + Math.sin(ang) * len * f + Math.sin(ang + Math.PI/2) * j,
            });
          }
          branches.push({ pts: ptsB, depth: depth * dMul });
        };

        const startBase = startAng + Math.PI;
        const endBase = endAng + Math.PI;

        if (rand() < 0.65) mkBranch(pts[0].x, pts[0].y, startBase, 0.55 + rand() * 0.35);
        if (rand() < 0.65) mkBranch(pts[pts.length-1].x, pts[pts.length-1].y, endBase, 0.55 + rand() * 0.35);

        // occasionally add a second micro-branch to one end
        if (rand() < 0.22){
          const atStart = rand() < 0.5;
          const p0 = atStart ? pts[0] : pts[pts.length-1];
          const base = atStart ? startBase : endBase;
          mkBranch(p0.x, p0.y, base, 0.45 + rand() * 0.25);
        }
      }

      cracks.push({ pts, len: L || 1, segLen, segAcc, depth, branches });
    }

    dust = [];
    dustAcc = 0;

    glint = null;
    glintFlash = 0;
    nextGlintAt = 1e9;

    polishSpecial.active = false;
    polishSpecial.start = 0;
    polishSpecial.dur = 0;
    polishSpecial.until = 0;
    nextPolishSpecialAt = t + 120 + rand() * 120;
  }

  function onPhaseEnter(){
    const ph = PHASES[phaseIdx].id;

    if (ph === 'dust'){
      dust = [];
      dustAcc = 0;
    }

    if (ph === 'polish'){
      glint = null;
      glintFlash = 0;
      nextGlintAt = 1e9;
    }

    // tiny UI click (audio RNG only)
    if (audio.enabled) safeBeep({ freq: 420 + arand()*140, dur: 0.016, gain: 0.008, type: 'square' });
  }

  function init({ width, height, dpr: dprIn }){
    w = width;
    h = height;
    dpr = dprIn || 1;

    font = Math.max(14, Math.floor(Math.min(w, h) / 32));
    small = Math.max(11, Math.floor(font * 0.78));
    mono = Math.max(12, Math.floor(font * 0.86));

    initItems();
    regen();
    onPhaseEnter();
  }

  function onResize(width, height, dprIn){
    init({ width, height, dpr: dprIn });
  }

  function onAudioOn(){
    if (!audio.enabled) return;

    // Idempotent: ensure we don't stack sources if this is called repeatedly.
    try { audio.stopCurrent?.(); } catch {}
    stopAmbience();

    const n = audio.noiseSource({ type: 'brown', gain: 0.0036 });
    n.start();

    const d = simpleDrone(audio, { root: 55 + arand()*18, detune: 1.0, gain: 0.015 });
    ambience = {
      stop(){
        try { n.stop(); } catch {}
        try { d.stop(); } catch {}
      },
    };

    audio.setCurrent(ambience);
  }

  function onAudioOff(){
    stopAmbience();
  }

  function destroy(){ onAudioOff(); }

  function update(dt){
    t += dt;
    phaseT += dt;

    if (t >= nextItemAt){
      rotateItem();
      return;
    }

    glintFlash = Math.max(0, glintFlash - dt * 1.8);

    // End polish glint special moment (forces a clean phase advance).
    if (polishSpecial.active && t >= polishSpecial.until){
      polishSpecial.active = false;
      polishSpecial.start = 0;
      polishSpecial.dur = 0;
      polishSpecial.until = 0;
      glint = null;
      glintFlash = 0;
      nextGlintAt = 1e9;
      nextPolishSpecialAt = t + 120 + rand() * 120;
      phaseT = PHASE_DUR;
    }

    if (phaseT >= PHASE_DUR){
      const cur = PHASES[phaseIdx].id;
      if (cur === 'polish' && polishSpecial.active){
        // Hold in polish while the special moment is active.
        phaseT = PHASE_DUR - 0.0001;
      } else {
        phaseT = phaseT % PHASE_DUR;
        phaseIdx = (phaseIdx + 1) % PHASES.length;
        onPhaseEnter();
      }
    }

    const ph = PHASES[phaseIdx].id;
    const p = phaseT / PHASE_DUR;

    // dust particles
    if (ph === 'dust'){
      const rate = lerp(18, 55, ease(p));
      dustAcc += dt * rate;
      while (dustAcc >= 1){
        dustAcc -= 1;
        const rx = (rand() - 0.5) * pot.r * 1.5;
        const ry = -pot.r * (0.9 + rand()*0.5);
        dust.push({
          x: pot.x + rx,
          y: pot.y + ry,
          vx: (rand() - 0.5) * pot.r * 0.18,
          vy: pot.r * (0.32 + rand()*0.25),
          life: 1.2 + rand() * 1.6,
          stuck: 0,
          cr: -1,
          shade: 0.65 + rand() * 0.35,
        });
        if (dust.length > 140) dust.shift();
      }

      const g = Math.min(w, h) * 0.65;
      for (const d of dust){
        if (!d.stuck){
          d.x += d.vx * dt;
          d.y += d.vy * dt;
          d.vy += g * dt;

          // only test for sticking when close to the pottery disk
          const dx = d.x - pot.x;
          const dy = d.y - pot.y;
          const rr = Math.hypot(dx, dy);
          if (rr < pot.r * 0.98){
            const near = nearestCrack(d.x, d.y);
            const thresh = Math.max(9, Math.min(w, h) * 0.012);
            if (near.d2 < thresh*thresh){
              d.stuck = 1;
              d.cr = near.cr;
              // snap a little toward seam
              const pull = 0.55 + rand()*0.25;
              d.x = lerp(d.x, d.x - dx*0.02, pull);
              d.y = lerp(d.y, d.y - dy*0.02, pull);
              if (audio.enabled && arand() < 0.08){
                safeBeep({ freq: 980 + arand()*380, dur: 0.010, gain: 0.0020, type: 'triangle' });
              }
            }
          }
        }
        d.life -= dt;
      }
      // In-place compaction to avoid per-frame array allocation.
      let keep = 0;
      for (let i=0;i<dust.length;i++){
        const d = dust[i];
        if (d.life > 0) dust[keep++] = d;
      }
      dust.length = keep;
    }

    // rare polish glint “special moment” (~45–120s)
    if (ph === 'polish'){
      if (!polishSpecial.active && t >= nextPolishSpecialAt){
        polishSpecial.active = true;
        polishSpecial.start = t;
        polishSpecial.dur = 45 + rand() * 75;
        polishSpecial.until = t + polishSpecial.dur;
        glint = null;
        glintFlash = 0;
        nextGlintAt = t + 0.15 + rand() * 0.25;

        if (audio.enabled){
          safeBeep({ freq: 620 + arand()*120, dur: 0.050, gain: 0.012, type: 'sine' });
          safeBeep({ freq: 1240 + arand()*240, dur: 0.020, gain: 0.010, type: 'triangle' });
        }
      }

      if (polishSpecial.active && t >= nextGlintAt){
        glintFlash = 1;
        const cr = (rand() * cracks.length) | 0;
        glint = { cr, u: 0.10 + rand() * 0.80 };
        // Slower cadence so the moment feels like a “sweep” rather than a strobe.
        nextGlintAt = t + 0.35 + rand() * 0.55;

        if (audio.enabled){
          safeBeep({ freq: 820 + arand()*180, dur: 0.028, gain: 0.010, type: 'triangle' });
          if (arand() < 0.35) safeBeep({ freq: 1520 + arand()*260, dur: 0.016, gain: 0.007, type: 'sine' });
        }
      }
    }

    // occasional tiny crack tick near end of crack phase
    if (audio.enabled && ph === 'crack' && p > 0.65 && arand() < 0.04){
      safeBeep({ freq: 160 + arand()*60, dur: 0.020, gain: 0.0045, type: 'square' });
    }

    if (audio.enabled && ph === 'glue' && p > 0.35 && arand() < 0.035){
      safeBeep({ freq: 420 + arand()*120, dur: 0.012, gain: 0.0035, type: 'sine' });
    }
  }

  function drawBench(ctx){
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,w,h);

    const gr = ensureGradients(ctx);

    ctx.fillStyle = gr.bench;
    ctx.fillRect(0,0,w,h);

    // subtle grain
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    const step = Math.max(18, Math.floor(Math.min(w,h) / 22));
    const drift = (t * 9) % step;
    for (let y = -step; y < h + step; y += step){
      const yy = y + drift;
      ctx.beginPath();
      ctx.moveTo(0, yy);
      const wob = Math.sin(y * 0.04 + t * 0.18) * 12;
      ctx.bezierCurveTo(w*0.3, yy + wob, w*0.7, yy - wob, w, yy);
      ctx.stroke();
    }
    ctx.restore();

    // spotlight
    ctx.fillStyle = gr.benchSpot;
    ctx.fillRect(0,0,w,h);
  }

  function header(ctx, title, subtitle, phaseLabel, phaseP){
    const pad = Math.floor(Math.min(w,h) * 0.055);

    ctx.fillStyle = 'rgba(0,0,0,0.40)';
    ctx.fillRect(pad, pad, w - pad*2, Math.max(56, font*2.6));

    ctx.fillStyle = 'rgba(231,238,246,0.94)';
    ctx.font = `800 ${font}px ui-sans-serif, system-ui, -apple-system`;
    ctx.textBaseline = 'top';
    ctx.fillText(title, pad + font, pad + Math.floor(font*0.50));

    ctx.fillStyle = 'rgba(231,238,246,0.70)';
    ctx.font = `${small}px ui-sans-serif, system-ui, -apple-system`;
    ctx.fillText(subtitle, pad + font, pad + Math.floor(font*1.58));

    // phase pill
    const pill = `${phaseLabel}`;
    ctx.font = `700 ${Math.max(11, Math.floor(small*0.95))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    const tw = ctx.measureText(pill).width;
    const px = w - pad - tw - font*1.2;
    const py = pad + Math.floor(font*0.65);
    ctx.fillStyle = 'rgba(231,238,246,0.12)';
    roundedRect(ctx, px - 10, py - 6, tw + 20, Math.floor(small*1.7), 10);
    ctx.fill();
    ctx.fillStyle = pal.gold[0];
    ctx.fillText(pill, px, py);

    // progress bar
    const barY = pad + Math.max(56, font*2.6) - 10;
    const barX = pad + font;
    const barW = w - pad*2 - font*2;
    ctx.fillStyle = 'rgba(231,238,246,0.10)';
    ctx.fillRect(barX, barY, barW, 3);
    ctx.fillStyle = pal.gold[0];
    ctx.fillRect(barX, barY, Math.floor(barW * clamp(phaseP, 0, 1)), 3);
  }

  function drawPotteryBase(ctx){
    const { sway, bob } = swayBob();

    const x = pot.x + sway;
    const y = pot.y + bob;
    const r = pot.r;

    const gr = ensureGradients(ctx);

    // drop shadow
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.beginPath();
    ctx.ellipse(x + r*0.06, y + r*0.12, r*1.02, r*0.78, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();

    // ceramic fill
    ctx.fillStyle = gr.ceramic;
    ctx.beginPath();
    ctx.ellipse(x, y, r, r*0.80, 0, 0, Math.PI*2);
    ctx.fill();

    // rim highlight
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.22;
    ctx.strokeStyle = 'rgba(255,255,255,0.8)';
    ctx.lineWidth = Math.max(2, Math.floor(h/320));
    ctx.beginPath();
    ctx.ellipse(x, y - r*0.02, r*0.96, r*0.72, 0, 0, Math.PI*2);
    ctx.stroke();
    ctx.restore();

    // inner bowl shading
    ctx.fillStyle = gr.inner;
    ctx.beginPath();
    ctx.ellipse(x, y + r*0.05, r*0.86, r*0.62, 0, 0, Math.PI*2);
    ctx.fill();
  }

  function clipPottery(ctx){
    // Keep surface effects (cracks/seams/dust/glints) inside the pottery silhouette.
    ctx.beginPath();
    ctx.ellipse(pot.x, pot.y, pot.r, pot.r*0.80, 0, 0, Math.PI*2);
    ctx.clip();
  }

  function strokePolyline(ctx, pts){
    if (!pts || pts.length < 2) return;
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i=1;i<pts.length;i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.stroke();
  }

  function drawCracks(ctx, crackAmt, gapAmt){
    // crackAmt: alpha/intensity, gapAmt: fake separation
    const { sway, bob } = swayBob();

    ctx.save();
    ctx.translate(sway, bob);
    clipPottery(ctx);

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    const baseShadow = Math.max(2, Math.floor(h/260));
    const baseInk = Math.max(1, Math.floor(h/340));

    // shadow under cracks (vary thickness/opacity by crack depth)
    ctx.strokeStyle = 'rgba(0,0,0,0.65)';
    for (const c of cracks){
      const d = c.depth || 1;
      ctx.globalAlpha = 0.18 * crackAmt * d;
      ctx.lineWidth = baseShadow + gapAmt + d * 1.8;
      strokePolyline(ctx, c.pts);

      if (c.branches){
        for (const b of c.branches){
          const bd = b.depth || (d * 0.6);
          ctx.globalAlpha = 0.14 * crackAmt * bd;
          ctx.lineWidth = baseShadow * 0.85 + gapAmt * 0.50 + bd * 1.1;
          strokePolyline(ctx, b.pts);
        }
      }
    }

    // ink crack (front layer)
    ctx.strokeStyle = pal.ink;
    for (const c of cracks){
      const d = c.depth || 1;
      ctx.globalAlpha = 0.45 * crackAmt * (0.65 + 0.55 * d);
      ctx.lineWidth = baseInk * (0.75 + 0.85 * d);
      strokePolyline(ctx, c.pts);

      if (c.branches){
        for (const b of c.branches){
          const bd = b.depth || (d * 0.6);
          ctx.globalAlpha = 0.34 * crackAmt * (0.55 + 0.75 * bd);
          ctx.lineWidth = baseInk * (0.60 + 0.65 * bd);
          strokePolyline(ctx, b.pts);
        }
      }
    }

    ctx.restore();
  }

  function drawGlueSheen(ctx, p){
    const { sway, bob } = swayBob();

    const s = ease(p);
    const shimmer = 0.5 + 0.5 * Math.sin(t * 2.4 + seed*0.003);

    ctx.save();
    ctx.translate(sway, bob);
    clipPottery(ctx);
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = (0.12 + 0.18 * shimmer) * s;
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = Math.max(2, Math.floor(h/300));
    ctx.lineCap = 'round';
    for (const c of cracks){
      ctx.beginPath();
      ctx.moveTo(c.pts[0].x, c.pts[0].y);
      for (let i=1;i<c.pts.length;i++) ctx.lineTo(c.pts[i].x, c.pts[i].y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawGoldSeams(ctx, fillFrac, polishAmt){
    const { sway, bob } = swayBob();

    const shimmer = 0.5 + 0.5 * Math.sin(t * 1.9 + seed*0.002);
    const gr = ensureGradients(ctx);

    ctx.save();
    ctx.translate(sway, bob);
    clipPottery(ctx);

    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // glow underlay
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = (0.10 + 0.14 * shimmer) * polishAmt;
    ctx.strokeStyle = pal.gold[0];
    ctx.lineWidth = Math.max(5, Math.floor(h/180));
    for (const c of cracks){
      drawPolylinePartial(ctx, c.pts, fillFrac);
      ctx.stroke();
    }

    // main seam
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = gr.gold;
    ctx.lineWidth = Math.max(2, Math.floor(h/300));
    for (const c of cracks){
      drawPolylinePartial(ctx, c.pts, fillFrac);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawDust(ctx, p){
    const fade = ease(p);

    const { sway, bob } = swayBob();

    ctx.save();
    ctx.translate(sway, bob);

    // floating dust
    for (const d of dust){
      if (d.stuck) continue;
      const a = clamp(d.life / 1.6, 0, 1);
      ctx.fillStyle = `rgba(243, 211, 106, ${0.10 + 0.20 * a * fade})`;
      ctx.fillRect(d.x, d.y, 2, 2);
    }

    // settled dust + powder veil: clip to pottery silhouette so nothing bleeds outside.
    ctx.save();
    clipPottery(ctx);

    // settled dust (foreground sparkles)
    ctx.globalCompositeOperation = 'screen';
    for (const d of dust){
      if (!d.stuck) continue;
      const a = clamp(d.life / 1.6, 0, 1);
      const tw = 0.6 + 0.4 * Math.sin(t * (2.2 + d.shade) + d.x * 0.02);
      ctx.fillStyle = `rgba(255, 222, 140, ${0.12 + 0.28 * a * tw * fade})`;
      ctx.fillRect(d.x, d.y, 2, 2);
    }

    // a faint powder veil
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.06 * fade;
    ctx.fillStyle = pal.gold[0];
    ctx.beginPath();
    ctx.ellipse(pot.x, pot.y, pot.r*0.98, pot.r*0.78, 0, 0, Math.PI*2);
    ctx.fill();

    ctx.restore();
    ctx.restore();
  }

  function crackPointAt(cr, u){
    const c = cracks[cr];
    if (!c) return { x: pot.x, y: pot.y };

    const target = c.len * clamp(u, 0, 1);
    let acc = 0;
    for (let i=1;i<c.pts.length;i++){
      const a = c.pts[i-1];
      const b = c.pts[i];
      const seg = Math.hypot(b.x - a.x, b.y - a.y);
      if (acc + seg >= target){
        const t = (target - acc) / (seg || 1);
        return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
      }
      acc += seg;
    }
    return c.pts[c.pts.length - 1];
  }

  function drawGlint(ctx, amt){
    if (!glint) return;
    const { sway, bob } = swayBob();

    const pt = crackPointAt(glint.cr, glint.u);
    const x = pt.x + sway;
    const y = pt.y + bob;

    const r = Math.max(10, Math.min(w,h) * 0.020);

    ctx.save();
    // Ensure the glint doesn't bloom outside the bowl silhouette.
    ctx.beginPath();
    ctx.ellipse(pot.x + sway, pot.y + bob, pot.r, pot.r*0.80, 0, 0, Math.PI*2);
    ctx.clip();

    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.55 * amt;

    const g = ctx.createRadialGradient(x, y, 1, x, y, r*1.6);
    g.addColorStop(0, 'rgba(255,255,255,1)');
    g.addColorStop(0.4, 'rgba(255,235,160,0.9)');
    g.addColorStop(1, 'rgba(255,235,160,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r*1.6, 0, Math.PI*2);
    ctx.fill();

    // little cross sparkle
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = Math.max(2, Math.floor(h/360));
    ctx.beginPath();
    ctx.moveTo(x - r*1.2, y);
    ctx.lineTo(x + r*1.2, y);
    ctx.moveTo(x, y - r*1.2);
    ctx.lineTo(x, y + r*1.2);
    ctx.stroke();

    ctx.restore();
  }

  function render(ctx){
    drawBench(ctx);

    const ph = PHASES[phaseIdx];
    const p = phaseT / PHASE_DUR;

    let specialAmt = 0;
    if (ph.id === 'polish' && polishSpecial.active){
      // Smooth fade-in/out so the special moment reads as a “sequence”, not a toggle.
      const aIn = ease((t - polishSpecial.start) / 2.5);
      const aOut = ease((polishSpecial.until - t) / 3.0);
      specialAmt = Math.min(aIn, aOut);
    }

    const phaseLabel = (ph.id === 'polish' && polishSpecial.active) ? 'POLISH • GLINT' : ph.label;

    header(ctx, 'Kintsugi Clinic', subtitle, phaseLabel, p);

    drawPotteryBase(ctx);

    if (ph.id === 'crack'){
      const crackAmt = 0.55 + 0.45 * ease(p);
      const gap = Math.floor((0.5 + 0.5 * Math.sin(t*6.0)) * (1 + ease(p) * 5));
      drawCracks(ctx, crackAmt, gap);
    } else if (ph.id === 'glue'){
      const close = 1 - ease(p);
      drawCracks(ctx, 0.65 + 0.30*close, Math.max(0, Math.floor(4 * close)));
      drawGlueSheen(ctx, p);
    } else if (ph.id === 'dust'){
      drawCracks(ctx, 0.70, 1);
      drawDust(ctx, p);
      const fill = 0.20 + 0.60 * ease(p);
      drawGoldSeams(ctx, fill, 0.20);
    } else {
      // polish
      drawCracks(ctx, 0.25, 0);
      const polishAmt = clamp((0.72 + 0.28 * (0.5 + 0.5*Math.sin(t*1.2))) + 0.18 * specialAmt, 0, 1);
      drawGoldSeams(ctx, 1.0, polishAmt);

      const glintAmt = polishSpecial.active ? Math.min(1, glintFlash * (1.15 + 0.70 * specialAmt)) : glintFlash;
      drawGlint(ctx, glintAmt);

      if (polishSpecial.active){
        // Clear, sustained signature without strobing (and with soft fades).
        ctx.save();
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = (0.04 + 0.08 * (0.5 + 0.5*Math.sin(t*0.9))) * specialAmt;
        ctx.fillStyle = 'rgba(255,220,150,1)';
        ctx.fillRect(0,0,w,h);
        ctx.restore();
      }

      if (glintFlash > 0){
        ctx.save();
        ctx.globalAlpha = glintFlash * 0.12;
        ctx.fillStyle = 'rgba(255,245,210,1)';
        ctx.fillRect(0,0,w,h);
        ctx.restore();
      }
    }

    // vignette
    const gr = ensureGradients(ctx);
    ctx.fillStyle = gr.vignette;
    ctx.fillRect(0,0,w,h);
  }

  return {
    init,
    onResize,
    update,
    render,
    onAudioOn,
    onAudioOff,
    destroy,
  };
}
