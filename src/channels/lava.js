// REVIEWED: 2026-02-12
import { mulberry32, clamp } from '../util/prng.js';

const CAPTIONS = [
  'slow heat • soft glow • no rush',
  'bubbles pending… please hold',
  'molten mood lighting (certified)',
  'gentle physics • loud colours',
  'warm drift • cool glass',
  'gravity: optional • vibe: mandatory',
  'viscosity doing its best',
  'the lamp is thinking',
  'low effort • high comfort',
  'bubble forecast: mostly rising',
  'deep magenta • shallow thoughts',
  'soft blur • hard limits',
  'ambient blob logistics',
  'please admire responsibly',
  'thermal dreams in progress',
  'a small universe of goop',
  'just add time',
  'slow-motion fireworks (indoors)',
  'ooze with purpose',
  'calm chaos • polite shimmer',
  'float • merge • separate • repeat',
  'quietly incandescent',
  'your eyes can rest here',
  'satisfying for no reason',
  'lava lamp: yes, still cool',
  'do not disturb: bubbling',
  'hot take, literally',
  'time dilation, but cosy',
  'dusk in a bottle',
  'glow maintenance window',
  'the blobs have a union',
  'screen saver, but emotional',
  'gentle turbulence • no drama',
  'this is what patience looks like',
  'warm gradients • warmer thoughts',
  'if you stare, it stares back',
  'bubble etiquette: single file',
  'soft neon • softer edges',
  'slow synth without the synth',
  'comfort loop: engaged',
  'mood: molten',
  'gravity and glitter, mostly',
  'everything rises eventually',
  'watching bubbles: a hobby',
  'heat map of feelings',
  'glow gently • think vaguely',
  'the blobs are plotting',
  'please remain in a state of awe',
  'liquid light, politely',
  'low frequency serenity',
  'wobbly, but determined',
  'soft focus • loud heart',
  'bubble choreography rehearsal',
  'this is your sign to breathe',
  'tiny suns • big calm',
  'a slow dance in glass',
  'minimum effort • maximum ambience',
];

function shuffleInPlace(arr, rand){
  for (let i = arr.length - 1; i > 0; i--){
    const j = Math.floor(rand() * (i + 1));
    const t = arr[i]; arr[i] = arr[j]; arr[j] = t;
  }
}

function smoothstep01(x){
  const t = clamp(x, 0, 1);
  return t * t * (3 - 2 * t);
}

export function createChannel({ seed, audio }){
  const seed32 = seed >>> 0;
  const rand = mulberry32(seed32);
  let w=0,h=0,t=0;
  let blobs=[];

  // Lava lives inside a lamp silhouette (not full-screen).
  let lampSpec = null;
  let simBounds = { x0: 0, y0: 0, x1: 0, y1: 0 };

  function computeLampSpec(W, H){
    const x = W * 0.5;

    const yTop = H * 0.14;
    const yBot = H * 0.86;
    const glassH = Math.max(1, yBot - yTop);

    const neckH = glassH * 0.12;

    const wNeck = W * 0.18;
    const wBelly = W * 0.44;
    const wFoot = W * 0.24;

    const pad = Math.max(10, Math.floor(Math.min(W, H) * 0.018));

    // Inner "liquid" bounds used for sim wrap (slightly inset from glass).
    const x0 = x - (wBelly * 0.5 - pad * 1.2);
    const x1 = x + (wBelly * 0.5 - pad * 1.2);
    const y0 = yTop + neckH + pad * 0.8;
    const y1 = yBot - pad * 1.25;

    return {
      x, yTop, yBot, glassH, neckH, wNeck, wBelly, wFoot, pad,
      bounds: { x0, y0, x1, y1 },
    };
  }

  function setLampSpec(){
    lampSpec = computeLampSpec(w, h);
    simBounds = lampSpec.bounds;
  }


  // Fixed-timestep simulation so motion is deterministic across 30fps vs 60fps.
  const FIXED_DT = 1/60;
  const MAX_STEPS_PER_UPDATE = 16;
  let acc = 0;

  // audio
  let ambience = null;

  // UI / text determinism: keep caption shuffles from perturbing visuals.
  let captions = CAPTIONS;
  let captionOffset = 0;
  let captionPeriod = 22;

  // Time structure: 2–4 min phase cycle (CALM→BLOOP→SURGE) + rare deterministic events.
  const phaseRand = mulberry32(seed32 ^ 0x51AFAE);
  let phasePeriod = 180;
  let phaseOffset = 0;
  let cycleIndex = -1;
  let cycleEvents = []; // [{ type, t0, t1 }]

  // Visual multipliers (computed in update; consumed in render)
  let speedMul = 1;
  let blurMul = 1;
  let intensityMul = 1;
  let swirlMul = 0;

  // Event accent: a bright deterministic glint sweep during special moments.
  let glintMul = 0;
  let glintPos = 0;

  // Perf: cache gradients + pre-render blob sprites so steady-state render allocates 0 gradients.
  const SPR_R_STEP = 12;
  const SPR_H_STEP = 10;

  const cache = {
    dirty: true,
    ctx: null,
    bg: null,
    shine: null,
    texture: null,
    blurPx: 8,

    lamp: null,
    capGrad: null,
    baseGrad: null,

    // Micro-perf: avoid per-frame template string churn for ctx.filter.
    filterBlurQ: -1,
    filterBlurStr: 'none',

    sprites: new Map(), // key -> { c, W, H, R }
  };

  function makeCanvas(W, H){
    if (!(W > 0 && H > 0)) return null;
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(W, H);
    if (typeof document !== 'undefined'){
      const c = document.createElement('canvas');
      c.width = W;
      c.height = H;
      return c;
    }
    return null;
  }

  function bucket(v, step){
    const s = Math.max(1, step | 0);
    return Math.max(s, Math.round(v / s) * s);
  }

  function bucketHue(hh){
    const h0 = bucket(hh, SPR_H_STEP);
    const h1 = ((h0 % 360) + 360) % 360;
    return h1;
  }

  function spriteKey(R, hue){
    return `${R}|${hue}`;
  }

  function buildBlobSprite(R, hue){
    const pad = Math.max(24, Math.ceil(R * 0.18));
    const span = Math.ceil(R + pad);
    const W = Math.max(1, span * 2);
    const H = W;

    const c = makeCanvas(W, H);
    if (!c) return null;

    const g = c.getContext('2d');
    if (!g) return null;

    const cx = W * 0.5;
    const cy = H * 0.5;

    g.clearRect(0, 0, W, H);

    const grad = g.createRadialGradient(cx, cy, 0, cx, cy, R);
    grad.addColorStop(0, `hsla(${hue},90%,60%,0.65)`);
    grad.addColorStop(0.6, `hsla(${hue + 20},90%,55%,0.22)`);
    grad.addColorStop(1, 'rgba(0,0,0,0)');

    g.fillStyle = grad;
    g.beginPath();
    g.arc(cx, cy, R, 0, Math.PI * 2);
    g.fill();

    return { c, W, H, R };
  }

  function primeBlobSprites(){
    cache.sprites.clear();

    for (const b of blobs){
      const R = bucket(b.r, SPR_R_STEP);
      const hue = bucketHue(b.hue);
      b._sprR = R;
      b._sprHue = hue;

      const key = spriteKey(R, hue);
      if (!cache.sprites.has(key)){
        const spr = buildBlobSprite(R, hue);
        if (spr) cache.sprites.set(key, spr);
      }
    }
  }

  function invalidateCaches(){
    cache.dirty = true;
    cache.ctx = null;
    cache.bg = null;
    cache.shine = null;
    cache.texture = null;
    cache.blurPx = 8;

    cache.lamp = null;
    cache.capGrad = null;
    cache.baseGrad = null;

    cache.filterBlurQ = -1;
    cache.filterBlurStr = 'none';
  }

  function ensureCaches(ctx){
    if (cache.dirty || cache.ctx !== ctx){
      cache.ctx = ctx;
      cache.dirty = false;

      cache.blurPx = Math.max(6, Math.floor(h / 80));

      // Background gradient (cached per ctx + resize)
      {
        const bg = ctx.createLinearGradient(0, 0, 0, h);
        bg.addColorStop(0, '#090018');
        bg.addColorStop(1, '#010208');
        cache.bg = bg;
      }

      // Glass shine gradient (cached per ctx + resize)
      {
        const shine = ctx.createLinearGradient(0, 0, w, 0);
        shine.addColorStop(0, 'rgba(255,255,255,0.0)');
        shine.addColorStop(0.2, 'rgba(255,255,255,0.05)');
        shine.addColorStop(0.35, 'rgba(255,255,255,0.02)');
        shine.addColorStop(1, 'rgba(255,255,255,0.0)');
        cache.shine = shine;
      }

      // Film grain + scanlines + vignette (cached per ctx + resize)
      {
        const tex = makeCanvas(w, h);
        if (tex){
          const g = tex.getContext('2d');
          if (g){
            g.setTransform(1,0,0,1,0,0);
            g.clearRect(0, 0, w, h);

            // Subtle monochrome grain (pattern fill; deterministic per seed+size)
            {
              const TW = 128;
              const tile = makeCanvas(TW, TW);
              const tg = tile?.getContext?.('2d');
              if (tg){
                const hmix = (((w * 2654435761) ^ (h * 1597334677)) >>> 0);
                const r = mulberry32((seed32 ^ 0x6F5A0B ^ hmix) >>> 0);

                const img = tg.createImageData(TW, TW);
                const d = img.data;
                for (let i = 0; i < d.length; i += 4){
                  const v = 120 + Math.floor(r() * 110);
                  d[i + 0] = v;
                  d[i + 1] = v;
                  d[i + 2] = v;
                  d[i + 3] = 255;
                }
                tg.putImageData(img, 0, 0);

                const pat = g.createPattern(tile, 'repeat');
                if (pat){
                  g.globalAlpha = 0.045;
                  g.fillStyle = pat;
                  g.fillRect(0, 0, w, h);
                }
              }
            }

            // Scanlines (keep very subtle so text/OSD stays clean)
            {
              g.globalAlpha = 0.055;
              g.fillStyle = 'rgba(0,0,0,1)';
              for (let y = 0; y < h; y += 2){
                if (((y / 2) | 0) % 2 === 0) g.fillRect(0, y, w, 1);
              }
            }

            // Vignette (darken edges slightly)
            {
              const r0 = Math.min(w, h) * 0.22;
              const r1 = Math.hypot(w, h) * 0.62;
              const vg = g.createRadialGradient(w * 0.5, h * 0.5, r0, w * 0.5, h * 0.5, r1);
              vg.addColorStop(0, 'rgba(0,0,0,0)');
              vg.addColorStop(0.72, 'rgba(0,0,0,0.06)');
              vg.addColorStop(1, 'rgba(0,0,0,0.24)');

              g.globalAlpha = 1;
              g.fillStyle = vg;
              g.fillRect(0, 0, w, h);
            }
          }
          cache.texture = tex;
        } else {
          cache.texture = null;
        }
      }

      if (!lampSpec) setLampSpec();

      // Lamp silhouette paths + cached metal gradients (rebuild on resize/ctx swap)
      {
        const spec = lampSpec;
        const outer = (typeof Path2D !== 'undefined') ? new Path2D() : null;
        const inner = (typeof Path2D !== 'undefined') ? new Path2D() : null;

        if (outer && inner){
          traceGlassPath(outer, spec, 0);
          traceGlassPath(inner, spec, spec.pad * 0.85);
        }

        const capW = spec.wNeck * 1.85;
        const capH = Math.max(10, spec.glassH * 0.06);
        const capX = spec.x - capW * 0.5;
        const capY = spec.yTop - capH * 0.85;

        const baseW = spec.wFoot * 2.05;
        const baseH = Math.max(12, spec.glassH * 0.09);
        const baseX = spec.x - baseW * 0.5;
        const baseY = spec.yBot - baseH * 0.10;

        cache.lamp = {
          spec,
          outer,
          inner,
          cap: { x: capX, y: capY, w: capW, h: capH, r: capH * 0.22 },
          base: { x: baseX, y: baseY, w: baseW, h: baseH, r: baseH * 0.22 },
        };

        const capGrad = ctx.createLinearGradient(0, capY, 0, capY + capH);
        capGrad.addColorStop(0, 'rgba(255,240,250,0.18)');
        capGrad.addColorStop(0.5, 'rgba(120,40,120,0.22)');
        capGrad.addColorStop(1, 'rgba(0,0,0,0.35)');
        cache.capGrad = capGrad;

        const baseGrad = ctx.createLinearGradient(0, baseY, 0, baseY + baseH);
        baseGrad.addColorStop(0, 'rgba(255,235,245,0.10)');
        baseGrad.addColorStop(0.4, 'rgba(140,50,160,0.20)');
        baseGrad.addColorStop(1, 'rgba(0,0,0,0.45)');
        cache.baseGrad = baseGrad;
      }
    }
  }

  function lerp(a, b, t){
    return a + (b - a) * t;
  }

  function traceGlassPath(p, spec, inset=0){
    const x = spec.x;
    const yTop = spec.yTop;
    const yBot = spec.yBot;
    const glassH = spec.glassH;
    const neckH = spec.neckH;

    const wNeck = Math.max(16, spec.wNeck - inset * 2);
    const wBelly = Math.max(26, spec.wBelly - inset * 2);
    const wFoot = Math.max(18, spec.wFoot - inset * 2);

    const yNeck = yTop + neckH;
    const yMid = yTop + glassH * 0.52;
    const yCtrl1 = yTop + glassH * 0.25;
    const yCtrl2 = yTop + glassH * 0.78;

    p.moveTo(x - wNeck * 0.5, yNeck);
    p.quadraticCurveTo(x - wBelly * 0.5, yCtrl1, x - wBelly * 0.5, yMid);
    p.quadraticCurveTo(x - wBelly * 0.5, yCtrl2, x - wFoot * 0.5, yBot);
    p.lineTo(x + wFoot * 0.5, yBot);
    p.quadraticCurveTo(x + wBelly * 0.5, yCtrl2, x + wBelly * 0.5, yMid);
    p.quadraticCurveTo(x + wBelly * 0.5, yCtrl1, x + wNeck * 0.5, yNeck);
    p.closePath();
  }

  function roundRect(ctx, x, y, W, H, r){
    const rr = Math.max(0, Math.min(r, W * 0.5, H * 0.5));
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(x, y, W, H, rr);
    else {
      ctx.moveTo(x + rr, y);
      ctx.arcTo(x + W, y, x + W, y + H, rr);
      ctx.arcTo(x + W, y + H, x, y + H, rr);
      ctx.arcTo(x, y + H, x, y, rr);
      ctx.arcTo(x, y, x + W, y, rr);
      ctx.closePath();
    }
  }

  function rebuildTimeStructure(){
    // 2–4 min loop, but with a per-seed offset so multiple TVs don’t phase-lock.
    phasePeriod = 120 + phaseRand() * 120;
    phaseOffset = phaseRand() * phasePeriod;
    cycleIndex = -1;
    cycleEvents = [];
  }

  function buildCycleEvents(cyc){
    // 1–2 deterministic “special moments” per cycle, usually after the channel has settled.
    const r = mulberry32((seed32 ^ 0xC1C1E) + ((cyc + 1) * 0x9E3779B9));
    const tMin = 45;
    const tMax = Math.min(120, Math.max(tMin + 5, phasePeriod - 25));

    const events = [];

    // Always schedule one event.
    {
      const t0 = tMin + (tMax - tMin) * r();
      const dur = 8 + 8 * r();
      events.push({ type: 'PULSE', t0, t1: t0 + dur });
    }

    // Often schedule a second, distinct event.
    if (r() < 0.55){
      const t0 = tMin + (tMax - tMin) * r();
      const dur = 10 + 12 * r();
      const type = (r() < 0.5) ? 'SWIRL' : 'HEAT';
      events.push({ type, t0, t1: t0 + dur });
    }

    events.sort((a,b) => a.t0 - b.t0);
    cycleEvents = events;
  }

  function init({width,height}){
    w=width; h=height; t=0; acc=0;
    setLampSpec();

    const BW = Math.max(1, simBounds.x1 - simBounds.x0);
    const BH = Math.max(1, simBounds.y1 - simBounds.y0);

    blobs = Array.from({ length: 7 }, () => {
      const baseR = 80 + rand() * 170;
      return {
        x: simBounds.x0 + rand() * BW,
        y: simBounds.y0 + rand() * BH,
        vx: (rand() * 2 - 1) * (24 + BW / 26),
        vy: (rand() * 2 - 1) * (24 + BH / 26),
        baseR,
        r: baseR * (h / 540),
        hue: 290 + rand() * 60,
        ph: rand() * 10,
      };
    });

    const uiRand = mulberry32(seed32 ^ 0xA11CE);
    captions = CAPTIONS.slice();
    shuffleInPlace(captions, uiRand);
    captionOffset = Math.floor(uiRand() * captions.length);
    captionPeriod = 18 + Math.floor(uiRand() * 10);

    rebuildTimeStructure();

    // Rebuild blob sprite cache for this blob set.
    primeBlobSprites();

    // Render gradients/blur depend on size + ctx.
    invalidateCaches();
  }

  function onResize(width,height){
    const oldW = w;
    const oldH = h;
    const oldBounds = simBounds;

    w = width;
    h = height;

    setLampSpec();
    const nb = simBounds;

    // Keep blob sizing proportional to viewport height so resizes don't make them absurdly big/small.
    const sx = (oldW > 0) ? (w / oldW) : 1;
    const sy = (oldH > 0) ? (h / oldH) : 1;

    const oldBW = Math.max(1, oldBounds.x1 - oldBounds.x0);
    const oldBH = Math.max(1, oldBounds.y1 - oldBounds.y0);
    const newBW = Math.max(1, nb.x1 - nb.x0);
    const newBH = Math.max(1, nb.y1 - nb.y0);

    for (const b of blobs){
      // Back-compat if a blob was created before baseR existed.
      if (!(b.baseR > 0)){
        const denom = (oldH > 0) ? (oldH / 540) : 1;
        b.baseR = (denom > 0) ? (b.r / denom) : b.r;
      }

      b.r = b.baseR * (h / 540);

      const ux = (b.x - oldBounds.x0) / oldBW;
      const uy = (b.y - oldBounds.y0) / oldBH;
      b.x = nb.x0 + clamp(ux, 0, 1) * newBW;
      b.y = nb.y0 + clamp(uy, 0, 1) * newBH;

      b.vx *= sx;
      b.vy *= sy;
    }

    // Sprite cache is radius-dependent; rebuild on resize.
    primeBlobSprites();

    invalidateCaches();
  }

  function stopAmbience(){
    try { ambience?.stop?.(); } catch {}

    // Only clear the global current handle if we still own it.
    try {
      if (audio.current === ambience) audio.current = null;
    } catch {}

    ambience = null;
  }

  function onAudioOn(){
    if (!audio.enabled) return;

    // Idempotent: don't stack sources.
    if (ambience) return;

    const ctx = audio.ensure();

    // master bus for this channel (lets us modulate without fighting AudioManager.master)
    const bus = ctx.createGain();
    bus.gain.value = 1.0;
    bus.connect(audio.master);

    // drone (low + gentle upper harmonic)
    const droneGain = ctx.createGain();
    droneGain.gain.value = 0.010;
    droneGain.connect(bus);

    const o1 = ctx.createOscillator();
    o1.type = 'sine';
    o1.frequency.value = 55;

    const o2 = ctx.createOscillator();
    o2.type = 'triangle';
    o2.frequency.value = 110;
    o2.detune.value = 18;

    const o2g = ctx.createGain();
    o2g.gain.value = 0.28;

    o1.connect(droneGain);
    o2.connect(o2g);
    o2g.connect(droneGain);

    o1.start();
    o2.start();

    // filtered noise (soft "air" + warmth)
    const noise = audio.noiseSource({ type: 'brown', gain: 0.06 });

    // Re-route: noiseSource defaults to master; we want it through a filter + our bus.
    try { noise.gain.disconnect(); } catch {}

    const nf = ctx.createBiquadFilter();
    nf.type = 'lowpass';
    nf.frequency.value = 220;
    nf.Q.value = 0.7;

    const noiseGain = ctx.createGain();
    noiseGain.gain.value = 0.004;

    noise.gain.connect(nf);
    nf.connect(noiseGain);
    noiseGain.connect(bus);

    noise.start();

    ambience = {
      ctx,
      bus,
      droneGain,
      noiseGain,
      nf,
      oscs: [o1, o2],
      stop(){
        const now = ctx.currentTime;
        try { droneGain.gain.setTargetAtTime(0.0001, now, 0.10); } catch {}
        try { noiseGain.gain.setTargetAtTime(0.0001, now, 0.12); } catch {}
        try { bus.gain.setTargetAtTime(0.0001, now, 0.12); } catch {}

        try { noise.stop(); } catch {}

        for (const o of [o1, o2]){
          try { o.stop(now + 0.25); } catch {}
        }

        // Avoid clicks: let gain ramps settle before disconnecting from master.
        // (disconnecting immediately can produce an audible pop on some outputs)
        const DISC_MS = 320;
        if (typeof setTimeout !== 'undefined'){
          setTimeout(() => {
            try { bus.disconnect(); } catch {}
          }, DISC_MS);
        } else {
          try { bus.disconnect(); } catch {}
        }
      },
    };

    audio.setCurrent(ambience);
  }

  function onAudioOff(){
    stopAmbience();
  }

  function destroy(){ onAudioOff(); }

  function stepSim(dt){
    t += dt;

    // Phase cycle (CALM→BLOOP→SURGE)
    const tt = t + phaseOffset;
    const u = ((tt % phasePeriod) + phasePeriod) % phasePeriod / phasePeriod; // [0,1)

    // Base phase multipliers
    const CALM_END = 0.45;
    const BLOOP_END = 0.75;

    let s0 = 1;
    let b0 = 1;
    let i0 = 1;

    if (u < CALM_END){
      s0 = 0.72;
      b0 = 1.18;
      i0 = 0.88;
    } else if (u < BLOOP_END){
      const p = (u - CALM_END) / (BLOOP_END - CALM_END);
      const pulse = Math.pow(Math.max(0, Math.sin(p * Math.PI * 6)), 2);
      s0 = 0.92 + 0.14 * pulse;
      b0 = 1.02 - 0.08 * pulse;
      i0 = 0.94 + 0.12 * pulse;
    } else {
      const p = (u - BLOOP_END) / (1 - BLOOP_END);
      const ramp = smoothstep01(p);
      s0 = 1.05 + 0.45 * ramp;
      b0 = 0.95 - 0.22 * ramp;
      i0 = 1.00 + 0.16 * ramp;
    }

    // Rare deterministic events per cycle (~45–120s)
    const cyc = Math.floor(tt / phasePeriod);
    if (cyc !== cycleIndex){
      cycleIndex = cyc;
      buildCycleEvents(cyc);
    }

    const tc = tt - cycleIndex * phasePeriod;
    let ePulse = 0;
    let eHeat = 0;
    let eSwirl = 0;

    let gMul = 0;
    let gPos = 0;

    for (const e of cycleEvents){
      if (tc < e.t0 || tc > e.t1) continue;

      const uev = (tc - e.t0) / Math.max(0.001, (e.t1 - e.t0));
      const aIn = smoothstep01(uev / 0.18);
      const aOut = smoothstep01((1 - uev) / 0.18);
      const amp = aIn * aOut;

      if (amp > gMul){
        gMul = amp;
        gPos = uev;
      }

      if (e.type === 'PULSE') ePulse = Math.max(ePulse, amp);
      else if (e.type === 'HEAT') eHeat = Math.max(eHeat, amp);
      else if (e.type === 'SWIRL') eSwirl = Math.max(eSwirl, amp);
    }

    glintMul = gMul;
    glintPos = gPos;

    speedMul = clamp(s0 + 0.10 * ePulse + 0.18 * eHeat + 0.25 * eSwirl, 0.55, 1.85);
    blurMul = clamp(b0 * (1 - 0.10 * ePulse) * (1 - 0.16 * eHeat), 0.55, 1.55);
    intensityMul = clamp(i0 * (1 + 0.18 * ePulse + 0.10 * eHeat), 0.75, 1.35);
    swirlMul = eSwirl;

    const dtv = dt * speedMul;

    // SWIRL moment: a gentle deterministic vortex around a slightly-lower-than-center point.
    const cx = (simBounds.x0 + simBounds.x1) * 0.5;
    const cy = lerp(simBounds.y0, simBounds.y1, 0.55);
    const swirlK = (swirlMul > 0) ? (0.00055 + 0.00025 * (w / Math.max(1, h))) * swirlMul : 0;

    for (const b of blobs){
      if (swirlK > 0){
        const dx = b.x - cx;
        const dy = b.y - cy;
        b.vx += (-dy) * swirlK;
        b.vy += (dx) * swirlK;
      }

      b.x += b.vx * dtv;
      b.y += b.vy * dtv;

      // soft bounds (inside the lamp)
      if (b.x < simBounds.x0 - b.r) { b.x = simBounds.x1 + b.r; }
      if (b.x > simBounds.x1 + b.r) { b.x = simBounds.x0 - b.r; }
      if (b.y < simBounds.y0 - b.r) { b.y = simBounds.y1 + b.r; }
      if (b.y > simBounds.y1 + b.r) { b.y = simBounds.y0 - b.r; }

      const drift = 0.24 + 0.22 * ((speedMul - 0.72) / (1.85 - 0.72));
      b.vx += Math.sin(t * 0.6 + b.ph) * 0.3 * drift;
      b.vy += Math.cos(t * 0.7 + b.ph) * 0.3 * drift;

      const vmax = 200 + 70 * (speedMul - 1);
      b.vx = clamp(b.vx, -vmax, vmax);
      b.vy = clamp(b.vy, -vmax, vmax);
    }
  }

  function update(dt){
    acc = Math.min(0.25, acc + dt);

    let steps = 0;
    while (acc >= FIXED_DT && steps < MAX_STEPS_PER_UPDATE){
      stepSim(FIXED_DT);
      acc -= FIXED_DT;
      steps++;
    }

    // If we hit the step cap, drop remainder so we don't spiral.
    if (steps >= MAX_STEPS_PER_UPDATE) acc = 0;

    // audio "breath" (slow, subtle) + phase "heat"
    if (ambience && audio.enabled){
      const ctx = ambience.ctx;
      const tt = t + phaseOffset;
      const u = ((tt % phasePeriod) + phasePeriod) % phasePeriod / phasePeriod; // [0,1)
      const hot = smoothstep01(clamp((u - 0.45) / 0.55, 0, 1));
      const p = 0.5 + 0.5 * Math.sin(t * (0.20 + 0.05 * hot));
      const dg = (0.0082 + 0.0048 * p) * lerp(0.92, 1.06, hot) * intensityMul;
      const ng = (0.0030 + 0.0062 * p) * lerp(0.88, 1.10, hot) * intensityMul;
      const cf = (165 + 390 * p) * lerp(0.90, 1.22, hot);
      try { ambience.droneGain.gain.setTargetAtTime(dg, ctx.currentTime, 0.18); } catch {}
      try { ambience.noiseGain.gain.setTargetAtTime(ng, ctx.currentTime, 0.22); } catch {}
      try { ambience.nf.frequency.setTargetAtTime(cf, ctx.currentTime, 0.25); } catch {}
    }
  }


  function render(ctx){
    ensureCaches(ctx);

    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,w,h);

    // background (cached gradient)
    ctx.fillStyle = cache.bg;
    ctx.fillRect(0,0,w,h);

    const lamp = cache.lamp;

    // Darken outside the glass silhouette so it reads as an actual lamp.
    if (lamp?.inner){
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.70;
      ctx.fillStyle = 'rgba(0,0,0,1)';
      ctx.fillRect(0, 0, w, h);

      ctx.globalCompositeOperation = 'destination-out';
      ctx.globalAlpha = 1;
      ctx.fill(lamp.inner);
      ctx.restore();
    }

    // blob field (cached sprites; clipped to the lamp glass)
    ctx.save();
    if (lamp?.inner) ctx.clip(lamp.inner);

    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.90 * intensityMul;
    const blurPx = Math.max(0.5, cache.blurPx * blurMul);
    const blurQ = Math.max(0.5, Math.round(blurPx * 4) / 4);
    if (cache.filterBlurQ !== blurQ){
      cache.filterBlurQ = blurQ;
      cache.filterBlurStr = `blur(${blurQ}px)`;
    }
    ctx.filter = cache.filterBlurStr;

    for (const b of blobs){
      const rr = b.r * (0.9 + 0.1*Math.sin(t*0.7 + b.ph));
      const R = b._sprR ?? bucket(b.r, SPR_R_STEP);
      const hue = b._sprHue ?? bucketHue(b.hue);
      const key = spriteKey(R, hue);

      let spr = cache.sprites.get(key);
      if (!spr){
        spr = buildBlobSprite(R, hue);
        if (spr) cache.sprites.set(key, spr);
      }

      if (spr){
        const s = rr / spr.R;
        const dw = spr.W * s;
        const dh = spr.H * s;
        ctx.drawImage(spr.c, b.x - dw * 0.5, b.y - dh * 0.5, dw, dh);
      } else {
        // Fallback (should be rare; e.g., no OffscreenCanvas/document)
        const g = ctx.createRadialGradient(b.x,b.y, 0, b.x,b.y, rr);
        g.addColorStop(0, `hsla(${b.hue},90%,60%,0.65)`);
        g.addColorStop(0.6, `hsla(${b.hue+20},90%,55%,0.22)`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(b.x,b.y, rr, 0, Math.PI*2);
        ctx.fill();
      }
    }

    ctx.restore();

    // glass outline + metal cap/base (cached)
    if (lamp?.outer){
      ctx.save();
      ctx.filter = 'none';

      // Outer glass edge
      ctx.globalCompositeOperation = 'screen';
      ctx.lineWidth = Math.max(2, h * 0.006);
      ctx.strokeStyle = 'rgba(255,220,255,0.14)';
      ctx.stroke(lamp.outer);

      // Inner rim
      ctx.lineWidth = Math.max(1, h * 0.0035);
      ctx.strokeStyle = 'rgba(255,255,255,0.06)';
      ctx.stroke(lamp.inner);

      // Cap
      if (cache.capGrad && lamp.cap){
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = cache.capGrad;
        roundRect(ctx, lamp.cap.x, lamp.cap.y, lamp.cap.w, lamp.cap.h, lamp.cap.r);
        ctx.fill();

        ctx.globalCompositeOperation = 'screen';
        ctx.lineWidth = Math.max(1, h * 0.0025);
        ctx.strokeStyle = 'rgba(255,255,255,0.10)';
        roundRect(ctx, lamp.cap.x, lamp.cap.y, lamp.cap.w, lamp.cap.h, lamp.cap.r);
        ctx.stroke();
      }

      // Base
      if (cache.baseGrad && lamp.base){
        ctx.globalCompositeOperation = 'source-over';
        ctx.fillStyle = cache.baseGrad;
        roundRect(ctx, lamp.base.x, lamp.base.y, lamp.base.w, lamp.base.h, lamp.base.r);
        ctx.fill();

        ctx.globalCompositeOperation = 'screen';
        ctx.lineWidth = Math.max(1, h * 0.003);
        ctx.strokeStyle = 'rgba(255,255,255,0.10)';
        roundRect(ctx, lamp.base.x, lamp.base.y, lamp.base.w, lamp.base.h, lamp.base.r);
        ctx.stroke();
      }

      ctx.restore();
    }

    // Special moments: a quick deterministic glint sweep so events are unmistakable.
    if (glintMul > 0.001){
      ctx.save();
      if (cache.lamp?.inner) ctx.clip(cache.lamp.inner);
      ctx.globalCompositeOperation = 'screen';
      ctx.filter = 'none';

      const x = (-0.2 + 1.4 * glintPos) * w;
      const y = h * 0.40;
      const stripeW = w * 0.18;
      const stripeH = h * 1.30;
      const a = clamp(0.05 + 0.22 * glintMul, 0, 0.35);

      ctx.translate(x, y);
      ctx.rotate(-0.10);

      const g = ctx.createLinearGradient(-stripeW * 0.5, 0, stripeW * 0.5, 0);
      g.addColorStop(0, 'rgba(255,240,220,0)');
      g.addColorStop(0.45, `rgba(255,240,220,${a * 0.35})`);
      g.addColorStop(0.5, `rgba(255,240,220,${a})`);
      g.addColorStop(0.55, `rgba(255,240,220,${a * 0.35})`);
      g.addColorStop(1, 'rgba(255,240,220,0)');

      ctx.fillStyle = g;
      ctx.fillRect(-stripeW * 0.5, -stripeH * 0.5, stripeW, stripeH);
      ctx.restore();
    }

    // glass shine (cached gradient)
    if (cache.lamp?.outer){
      ctx.save();
      ctx.clip(cache.lamp.outer);
      ctx.fillStyle = cache.shine;
      ctx.fillRect(0,0,w,h);
      ctx.restore();
    }

    // subtle texture (cached grain/scanlines/vignette)
    if (cache.texture){
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1;
      ctx.filter = 'none';
      ctx.drawImage(cache.texture, 0, 0);
      ctx.restore();
    }

    // label
    ctx.save();
    ctx.font = `${Math.floor(h/18)}px ui-rounded, ui-sans-serif, system-ui`;
    ctx.fillStyle = 'rgba(255,220,255,0.75)';
    ctx.shadowColor = 'rgba(255,75,216,0.7)';
    ctx.shadowBlur = 10;
    ctx.fillText('LAVA LAMP', w*0.05, h*0.12);
    ctx.restore();

    // rotating caption (seeded; no fast repeats)
    const slot = Math.floor(t / captionPeriod);
    const caption = captions[(captionOffset + slot) % captions.length];

    ctx.save();
    const stripH = Math.floor(h * 0.09);
    ctx.fillStyle = 'rgba(10,0,24,0.28)';
    ctx.fillRect(0, h - stripH, w, stripH);

    ctx.font = `${Math.floor(h/40)}px ui-rounded, ui-sans-serif, system-ui`;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(255,220,255,0.62)';
    ctx.shadowColor = 'rgba(0,0,0,0.25)';
    ctx.shadowBlur = 6;
    ctx.fillText(caption, w*0.05, h - stripH * 0.5);
    ctx.restore();
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
