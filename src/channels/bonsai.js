import { mulberry32 } from '../util/prng.js';

// REVIEWED: 2026-02-10
// Bonsai Time Machine
// Calm plant care + subtle time-lapse jumps (growth / pruning / wiring / seasons).

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

function lerp(a,b,t){ return a + (b-a)*t; }
function clamp01(x){ return Math.max(0, Math.min(1, x)); }

function leafColor(season){
  // season: 0..1 (0=summer green, 0.6=autumn, 1=winter)
  if (season < 0.55){
    const t = season / 0.55;
    return {
      a: [54, 160, 92],
      b: [120, 190, 110],
      t
    };
  }
  if (season < 0.82){
    const t = (season - 0.55) / 0.27;
    return {
      a: [120, 190, 110],
      b: [210, 150, 70],
      t
    };
  }
  const t = (season - 0.82) / 0.18;
  return {
    a: [210, 150, 70],
    b: [190, 190, 190],
    t
  };
}

function mixRGB(ca, cb, t){
  return [
    Math.round(lerp(ca[0], cb[0], t)),
    Math.round(lerp(ca[1], cb[1], t)),
    Math.round(lerp(ca[2], cb[2], t)),
  ];
}

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0, h = 0, t = 0;

  // Background gradient cache (rebuilt on init/resize).
  const bgCache = {
    w: 0,
    h: 0,
    bg: null,
    lamp: null,
    vignette: null,
  };

  function ensureBackgroundCache(ctx){
    if (bgCache.bg && bgCache.w === w && bgCache.h === h) return;

    bgCache.w = w;
    bgCache.h = h;

    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#05070c');
    g.addColorStop(0.55, '#070c12');
    g.addColorStop(1, '#030409');
    bgCache.bg = g;

    // dim lamp glow (static center; animate intensity via globalAlpha)
    const lx = w * 0.62;
    const ly = h * 0.18;
    const rg = ctx.createRadialGradient(lx, ly, 0, lx, ly, Math.max(w, h) * 0.55);
    rg.addColorStop(0, 'rgba(255,220,140,0.10)');
    rg.addColorStop(0.5, 'rgba(255,220,140,0.03)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    bgCache.lamp = rg;

    // vignette
    const vg = ctx.createRadialGradient(w*0.5, h*0.55, Math.min(w, h)*0.2, w*0.5, h*0.55, Math.max(w, h)*0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.72)');
    bgCache.vignette = vg;
  }

  // Foreground gradient cache (bench + pot body; rebuilt on init/resize).
  const fgCache = {
    w: 0,
    h: 0,
    benchY: 0,
    bench: null,
    potBody: null,
  };

  function ensureForegroundCache(ctx){
    if (fgCache.bench && fgCache.potBody && fgCache.w === w && fgCache.h === h) return;

    fgCache.w = w;
    fgCache.h = h;

    // bench
    const y = Math.floor(h * 0.70);
    fgCache.benchY = y;
    const gg = ctx.createLinearGradient(0, y, 0, h);
    gg.addColorStop(0, '#0c0f14');
    gg.addColorStop(1, '#07090d');
    fgCache.bench = gg;

    // pot body (matches render() placement)
    const s = Math.min(w, h);
    const cx = w * 0.49;
    const cy = h * 0.63;
    const potW = s * 0.42;
    const potH = s * 0.16;

    const body = ctx.createLinearGradient(cx - potW*0.5, cy, cx + potW*0.5, cy + potH);
    body.addColorStop(0, '#1b2a34');
    body.addColorStop(0.55, '#0f1820');
    body.addColorStop(1, '#0a1016');
    fgCache.potBody = body;
  }

  // Leaf puff sprite cache (avoid per-puff radial gradients in drawTree).
  // We build a white alpha mask per radius bucket, then lazily build a tinted sprite
  // per (radius bucket, leafFill) so the render loop stays gradient-free.
  const LEAFPUFF_R_STEP = 3; // px
  let leafPuffMaskSprites = null; // Map<radiusPx:number, CanvasImageSource>
  let leafPuffTintKey = '';
  let leafPuffTintedSprites = null; // Map<radiusPx:number, CanvasImageSource>

  function makeCanvas(W,H){
    let c = null;
    if (typeof OffscreenCanvas !== 'undefined') c = new OffscreenCanvas(W,H);
    else if (typeof document !== 'undefined'){
      const el = document.createElement('canvas');
      el.width = W; el.height = H;
      c = el;
    }
    return c;
  }

  function bucketLeafPuffRadiusPx(radiusPx){
    const r = Math.max(2, radiusPx|0);
    return Math.max(2, Math.round(r / LEAFPUFF_R_STEP) * LEAFPUFF_R_STEP);
  }

  function clearLeafPuffSprites(){
    leafPuffMaskSprites = null;
    leafPuffTintedSprites = null;
    leafPuffTintKey = '';
  }

  function getLeafPuffMaskSprite(radiusPx){
    const r = bucketLeafPuffRadiusPx(radiusPx);
    if (!leafPuffMaskSprites) leafPuffMaskSprites = new Map();
    const hit = leafPuffMaskSprites.get(r);
    if (hit) return hit;

    const size = r*2 + 4;
    const c = makeCanvas(size, size);
    if (!c) return null;
    const g = c.getContext('2d');
    g.setTransform(1,0,0,1,0,0);
    g.clearRect(0,0,size,size);

    const cx = size/2;
    const grad = g.createRadialGradient(cx, cx, r*0.15, cx, cx, r);
    grad.addColorStop(0, 'rgba(255,255,255,1)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = grad;
    g.fillRect(0,0,size,size);

    leafPuffMaskSprites.set(r, c);
    return c;
  }

  function getLeafPuffSprite(radiusPx, leafFill){
    if (leafPuffTintKey !== leafFill){
      leafPuffTintKey = leafFill;
      leafPuffTintedSprites = null;
    }

    const r = bucketLeafPuffRadiusPx(radiusPx);
    if (!leafPuffTintedSprites) leafPuffTintedSprites = new Map();
    const hit = leafPuffTintedSprites.get(r);
    if (hit) return hit;

    const mask = getLeafPuffMaskSprite(r);
    if (!mask) return null;

    const size = mask.width;
    const c = makeCanvas(size, size);
    if (!c) return null;
    const g = c.getContext('2d');
    g.setTransform(1,0,0,1,0,0);
    g.clearRect(0,0,size,size);

    g.drawImage(mask, 0, 0);
    g.globalCompositeOperation = 'source-in';
    g.fillStyle = leafFill;
    g.fillRect(0,0,size,size);

    leafPuffTintedSprites.set(r, c);
    return c;
  }

  // Growth timeline
  let day = 1 + ((seed >>> 0) % 90);
  let stage = 0; // 0..STAGES-1
  const STAGES = 6;
  let jumpTimer = 0;
  let jumpFx = 0; // 0..1
  let jumpLabel = '';

  // precomputed tree skeleton (in normalized units)
  const skeleton = {
    trunk: [],
    branches: [],
    leafPuffs: []
  };

  // audio handle
  let ah = null;

  function buildSkeleton(){
    // trunk as 4 control points from base to top
    const baseX = -0.03 + rand() * 0.06;
    const pts = [];
    for (let i=0; i<5; i++){
      const u = i / 4;
      pts.push({
        x: baseX + (rand()*2-1) * 0.06 * (1-u) * (1-u),
        y: u,
        wob: rand() * Math.PI * 2,
      });
    }
    skeleton.trunk = pts;

    const nBranches = 5 + Math.floor(rand() * 3);
    skeleton.branches = Array.from({length: nBranches}, (_,i) => {
      const at = 0.25 + rand() * 0.55; // along trunk
      const side = i % 2 === 0 ? -1 : 1;
      const baseAng = (side * (0.7 + rand() * 0.5));
      return {
        at,
        side,
        ang: baseAng,
        len: 0.22 + rand() * 0.28,
        bend: (rand()*2-1) * 0.35,
        thick: 0.022 + rand() * 0.012,
        wob: rand() * Math.PI * 2,
      };
    });

    // leaf puffs: anchored near branch ends
    const nPuffs = 12 + Math.floor(rand() * 9);
    skeleton.leafPuffs = Array.from({length: nPuffs}, () => ({
      b: Math.floor(rand() * skeleton.branches.length),
      u: 0.6 + rand() * 0.55, // beyond end slightly
      r: 0.04 + rand() * 0.06,
      dx: (rand()*2-1) * 0.05,
      dy: (rand()*2-1) * 0.04,
      wob: rand() * Math.PI * 2,
    }));
  }

  function init({ width, height }){
    w = width; h = height; t = 0;
    bgCache.bg = bgCache.lamp = bgCache.vignette = null;
    fgCache.bench = fgCache.potBody = null;
    clearLeafPuffSprites();
    buildSkeleton();

    stage = (seed >>> 0) % STAGES;
    jumpTimer = 10 + rand() * 10;
    jumpFx = 0;
    jumpLabel = '';
  }

  function onResize(width, height){
    w = width; h = height;
    bgCache.bg = bgCache.lamp = bgCache.vignette = null;
    fgCache.bench = fgCache.potBody = null;
    clearLeafPuffSprites();
  }

  function makeAudioHandle(){
    const ctx = audio.ensure();

    const out = ctx.createGain();
    out.gain.value = 0.85;
    out.connect(audio.master);

    // soft air/room tone
    const air = audio.noiseSource({ type: 'pink', gain: 0.06 });

    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 700;
    lpf.Q.value = 0.8;

    // reroute noise through filter -> out
    air.src.disconnect();
    air.src.connect(air.gain);
    air.gain.disconnect();
    air.gain.connect(lpf);
    lpf.connect(out);

    air.start();

    return {
      stop(){
        const now = ctx.currentTime;
        try { out.gain.setTargetAtTime(0.0001, now, 0.10); } catch {}
        try { air.stop(); } catch {}
      }
    };
  }

  function stopAudio({ clearCurrent=false } = {}){
    const handle = ah;
    const isCurrent = audio.current === handle;

    if (clearCurrent && isCurrent){
      // clears audio.current and stops via handle.stop()
      audio.stopCurrent();
    } else {
      try { handle?.stop?.(); } catch {}
    }

    ah = null;
  }

  function onAudioOn(){
    if (!audio.enabled) return;

    // defensively stop any existing ambience we started
    stopAudio({ clearCurrent: true });

    const handle = makeAudioHandle();
    ah = handle;
    audio.setCurrent(handle);
  }

  function onAudioOff(){
    // stop/clear everything we own; only clear AudioManager.current if it's ours
    stopAudio({ clearCurrent: true });
  }

  function destroy(){
    stopAudio({ clearCurrent: true });
  }

  function nextJump(){
    // rotate through a tiny care loop
    const actions = [
      { label: 'WATER', days: 3 + Math.floor(rand()*5), tone: 320 },
      { label: 'PRUNE', days: 7 + Math.floor(rand()*11), tone: 780 },
      { label: 'WIRE', days: 10 + Math.floor(rand()*15), tone: 520 },
      { label: 'REPOT', days: 14 + Math.floor(rand()*22), tone: 420 },
    ];
    const a = actions[(stage + ((seed>>>0)&3)) % actions.length];

    const d = a.days;
    day += d;
    stage = (stage + 1) % STAGES;

    jumpLabel = `TIME-LAPSE +${d} DAYS • ${a.label}`;
    jumpFx = 1.0;
    jumpTimer = 14 + rand() * 14;

    if (audio.enabled){
      // tiny “snip / click / splash” hint
      const base = a.tone;
      audio.beep({ freq: base, dur: 0.03, gain: 0.035, type: 'square' });
      audio.beep({ freq: base*1.2, dur: 0.02, gain: 0.022, type: 'triangle' });
    }
  }

  function update(dt){
    t += dt;

    jumpTimer -= dt;
    if (jumpTimer <= 0){
      nextJump();
    }

    if (jumpFx > 0){
      jumpFx = Math.max(0, jumpFx - dt * 0.9);
    }
  }

  function trunkPoint(u, sway){
    // interpolate along skeleton trunk points
    const pts = skeleton.trunk;
    const f = u * (pts.length - 1);
    const i = Math.floor(f);
    const a = pts[Math.max(0, Math.min(pts.length-1, i))];
    const b = pts[Math.max(0, Math.min(pts.length-1, i+1))];
    const tt = f - i;
    const x = lerp(a.x, b.x, tt) + Math.sin(t*0.28 + lerp(a.wob,b.wob,tt)) * 0.006 * (1-u);
    const y = lerp(a.y, b.y, tt);
    // apply sway
    const xx = x * Math.cos(sway) - (y-0.0) * Math.sin(sway);
    return { x: xx, y };
  }

  function branchEnd(b, sway, grow){
    const tp = trunkPoint(b.at, sway);
    const ang = b.ang + Math.sin(t*0.22 + b.wob) * 0.08 + sway * 0.8;
    const len = b.len * grow;
    const ex = tp.x + Math.cos(ang) * len + Math.cos(ang + b.bend) * len * 0.25;
    const ey = tp.y - Math.sin(ang) * len * 0.85;
    return { x0: tp.x, y0: tp.y, x1: ex, y1: ey, ang };
  }

  function drawBackground(ctx){
    ensureBackgroundCache(ctx);

    ctx.fillStyle = bgCache.bg;
    ctx.fillRect(0, 0, w, h);

    // dim lamp glow (intensity breathes; gradient is cached)
    ctx.save();
    ctx.globalAlpha = 0.85 + 0.15 * Math.sin(t * 0.06);
    ctx.fillStyle = bgCache.lamp;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    // vignette
    ctx.fillStyle = bgCache.vignette;
    ctx.fillRect(0, 0, w, h);
  }

  function drawBench(ctx){
    ensureForegroundCache(ctx);

    const y = fgCache.benchY;
    ctx.fillStyle = fgCache.bench;
    ctx.fillRect(0, y, w, h - y);

    // subtle wood-ish lines
    ctx.save();
    ctx.globalAlpha = 0.15;
    ctx.strokeStyle = '#1a2430';
    ctx.lineWidth = 1;
    for (let i=0; i<18; i++){
      const yy = y + (i/18) * (h-y);
      ctx.beginPath();
      ctx.moveTo(0, yy + Math.sin(t*0.07 + i)*1.5);
      ctx.lineTo(w, yy + Math.sin(t*0.07 + i + 1.7)*1.5);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawPot(ctx, cx, cy, s){
    ensureForegroundCache(ctx);

    const potW = s * 0.42;
    const potH = s * 0.16;
    const rimH = potH * 0.32;

    // shadow
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = '#000';
    ctx.beginPath();
    ctx.ellipse(cx, cy + potH*0.75, potW*0.52, potH*0.22, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();

    // body (gradient cached; matches render() placement)
    ctx.fillStyle = fgCache.potBody;
    ctx.strokeStyle = 'rgba(120,210,255,0.14)';
    ctx.lineWidth = 2;
    roundRect(ctx, cx - potW*0.5, cy, potW, potH, 10);
    ctx.fill();
    ctx.stroke();

    // rim
    ctx.fillStyle = 'rgba(10,16,22,0.9)';
    ctx.fillRect(cx - potW*0.5, cy, potW, rimH);

    // soil
    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#0b0b0d';
    ctx.beginPath();
    ctx.ellipse(cx, cy + rimH*0.75, potW*0.42, rimH*0.48, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();
  }

  function drawTree(ctx, cx, cy, s){
    const sway = Math.sin(t * 0.22) * 0.06;

    // growth factor per stage: smooth-ish saw with gentle reset
    const grow = 0.72 + (stage / (STAGES-1)) * 0.42;

    // season cycles across stages (plus time)
    const season = (stage / (STAGES-1)) * 0.85 + 0.15 * (0.5 + 0.5*Math.sin(t*0.03));
    const lc = leafColor(clamp01(season));
    const leafRGB = mixRGB(lc.a, lc.b, lc.t);

    ctx.save();
    ctx.translate(cx, cy);
    ctx.scale(s, s);

    // trunk + branches
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // trunk path
    ctx.strokeStyle = '#2a1f18';
    ctx.lineWidth = 0.055;
    ctx.beginPath();
    for (let i=0; i<=24; i++){
      const u = i / 24;
      const p = trunkPoint(u, sway);
      const x = p.x;
      const y = -p.y;
      if (i===0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // trunk highlight
    ctx.strokeStyle = 'rgba(220,190,140,0.12)';
    ctx.lineWidth = 0.020;
    ctx.beginPath();
    for (let i=0; i<=22; i++){
      const u = i / 22;
      const p = trunkPoint(u, sway);
      const x = p.x + 0.018 * (1-u);
      const y = -p.y;
      if (i===0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // branches
    for (const b of skeleton.branches){
      const e = branchEnd(b, sway, grow);
      const thick = b.thick * (0.7 + grow*0.6);
      ctx.strokeStyle = '#2a1f18';
      ctx.lineWidth = thick;
      ctx.beginPath();
      ctx.moveTo(e.x0, -e.y0);
      const mx = lerp(e.x0, e.x1, 0.55) + Math.cos(e.ang + 1.6) * 0.03;
      const my = lerp(e.y0, e.y1, 0.55) - 0.02;
      ctx.quadraticCurveTo(mx, -my, e.x1, -e.y1);
      ctx.stroke();

      // wiring hint (subtle copper spiral) on later stages
      if (stage >= 3){
        ctx.save();
        ctx.globalAlpha = 0.20;
        ctx.strokeStyle = 'rgba(190,120,70,0.8)';
        ctx.lineWidth = 0.006;
        for (let k=0; k<10; k++){
          const u = k / 10;
          const x = lerp(e.x0, e.x1, u);
          const y = lerp(-e.y0, -e.y1, u);
          const rr = 0.012 + u*0.008;
          ctx.beginPath();
          ctx.arc(x, y, rr, 0, Math.PI*2);
          ctx.stroke();
        }
        ctx.restore();
      }
    }

    // leaves: fade density down in winter-ish season
    const leafiness = clamp01(1.15 - season * 1.05);
    const puffAlpha = 0.10 + 0.35 * leafiness;

    // leaf puffs (sprite-based: no per-puff gradients in steady-state)
    const leafFill = `rgb(${leafRGB[0]},${leafRGB[1]},${leafRGB[2]})`;
    for (const p of skeleton.leafPuffs){
      const b = skeleton.branches[p.b];
      const e = branchEnd(b, sway, grow);
      const x = lerp(e.x0, e.x1, p.u) + p.dx + Math.sin(t*0.35 + p.wob) * 0.006;
      const y = lerp(-e.y0, -e.y1, p.u) + p.dy + Math.cos(t*0.32 + p.wob) * 0.006;
      const r = p.r * (0.65 + 0.65*grow);

      // ctx is scaled by s; compute sprite size in pixel space then draw with model-space dimensions.
      const rPx = Math.max(2, Math.round(r * s));
      const spr = getLeafPuffSprite(rPx, leafFill);
      if (!spr) continue;

      const sizePx = spr.width;
      const size = sizePx / s;
      const x0 = x - size * 0.5;
      const y0 = y - size * 0.5;

      ctx.save();
      ctx.globalAlpha = puffAlpha;
      ctx.drawImage(spr, x0, y0, size, size);
      ctx.restore();
    }

    ctx.restore();
  }

  function drawOverlay(ctx){
    const s = Math.min(w, h);
    const pad = Math.max(12, Math.floor(s * 0.02));

    // label box
    const boxW = Math.floor(s * 0.52);
    const boxH = Math.floor(s * 0.11);
    const x = pad;
    const y = pad;

    ctx.save();
    ctx.fillStyle = 'rgba(6, 10, 18, 0.62)';
    ctx.strokeStyle = 'rgba(108, 242, 255, 0.18)';
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, boxW, boxH, 10);
    ctx.fill();
    ctx.stroke();

    ctx.font = `${Math.floor(boxH*0.34)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = 'rgba(210, 245, 255, 0.92)';
    ctx.fillText('BONSAI TIME MACHINE', x + 14, y + Math.floor(boxH*0.46));

    ctx.font = `${Math.floor(boxH*0.30)}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial`;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.fillText(`Day ${String(day).padStart(3,'0')}`, x + 14, y + Math.floor(boxH*0.82));

    // jump banner
    if (jumpFx > 0 && jumpLabel){
      const a = clamp01(jumpFx);
      const bx = pad;
      const by = y + boxH + Math.floor(pad*0.6);
      const bw = Math.floor(s * 0.70);
      const bh = Math.floor(s * 0.07);

      ctx.save();
      ctx.globalAlpha = 0.75 * a;
      ctx.fillStyle = 'rgba(255, 220, 140, 0.18)';
      ctx.strokeStyle = 'rgba(255, 220, 140, 0.30)';
      roundRect(ctx, bx, by, bw, bh, 10);
      ctx.fill();
      ctx.stroke();

      ctx.globalAlpha = 0.95 * a;
      ctx.fillStyle = 'rgba(255,240,210,0.92)';
      ctx.font = `${Math.floor(bh*0.52)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.fillText(jumpLabel, bx + 14, by + Math.floor(bh*0.68));
      ctx.restore();

      // flash wash (subtle)
      ctx.save();
      ctx.globalAlpha = 0.10 * a;
      ctx.fillStyle = '#fff';
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }

    ctx.restore();
  }

  function render(ctx){
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    drawBackground(ctx);
    drawBench(ctx);

    const s = Math.min(w, h);
    const cx = w * 0.49;
    const potY = h * 0.63;

    drawPot(ctx, cx, potY, s);

    // tree anchor: pot center (normalized coordinates are in roughly -0.5..0.5)
    const treeScale = s * 0.62;
    const treeCx = cx;
    const treeCy = potY + s*0.02;
    drawTree(ctx, treeCx, treeCy, treeScale);

    // tiny dust motes
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = 'rgba(255,240,210,1)';
    const n = 28;
    for (let i=0; i<n; i++){
      const u = i / n;
      const x = (0.12 + 0.76 * ((i*97 + (seed>>>0)) % 1000) / 1000) * w;
      const y = (0.10 + 0.60 * ((i*53 + ((seed>>>0)>>8)) % 1000) / 1000) * h;
      const r = 0.6 + ((i*13) % 10) * 0.08;
      const dx = Math.sin(t*0.20 + u*12.0) * 6;
      const dy = Math.cos(t*0.17 + u*9.0) * 5;
      ctx.globalAlpha = 0.05 + 0.08 * (0.5 + 0.5*Math.sin(t*0.25 + i));
      ctx.beginPath();
      ctx.arc(x + dx, y + dy, r, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.restore();

    drawOverlay(ctx);
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
