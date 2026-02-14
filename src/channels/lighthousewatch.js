import { mulberry32 } from '../util/prng.js';

// REVIEWED: 2026-02-14
// Tiny Lighthouse Watch
// Coastal vignette: rotating Fresnel beam, fog banks, ship silhouettes;
// timed storm pulses and a calm dawn reset.

function clamp01(x){ return Math.max(0, Math.min(1, x)); }
function lerp(a,b,t){ return a + (b-a)*t; }
function smoothstep(a,b,x){
  const t = clamp01((x-a)/(b-a));
  return t*t*(3-2*t);
}

// deterministic integer hash helpers (avoid `rand()` in render/update hot paths)
function hashU32(n){
  n |= 0;
  n = (n ^ 61) ^ (n >>> 16);
  n = Math.imul(n, 9);
  n = n ^ (n >>> 4);
  n = Math.imul(n, 0x27d4eb2d);
  n = n ^ (n >>> 15);
  return n >>> 0;
}

function hash01(n){
  return hashU32(n) / 4294967296;
}

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

function cliffHillPath(ctx, w, h, horizon){
  ctx.beginPath();
  ctx.moveTo(0, h);
  ctx.lineTo(0, horizon + h * 0.12);
  ctx.quadraticCurveTo(w * 0.18, horizon + h * 0.02, w * 0.35, horizon + h * 0.10);
  ctx.quadraticCurveTo(w * 0.48, horizon + h * 0.18, w * 0.6, h);
  ctx.closePath();
}

function cliffRidgePath(ctx, w, h, horizon){
  ctx.beginPath();
  ctx.moveTo(0, horizon + h * 0.12);
  ctx.quadraticCurveTo(w * 0.18, horizon + h * 0.02, w * 0.35, horizon + h * 0.10);
  ctx.quadraticCurveTo(w * 0.48, horizon + h * 0.18, w * 0.6, h);
}

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);
  // Derive stable salts without consuming the channel PRNG (keeps existing seeds/visuals stable).
  const rainSalt = hashU32((seed | 0) ^ 0x4a39b70d);
  const cliffSalt = hashU32((seed | 0) ^ 0x73c1fe21);

  let w = 0, h = 0, t = 0;

  // gradient caches (rebuilt on init/resize/ctx swap)
  const SKY_STEPS = 48;
  const SEA_STEPS = 48;
  const BEAM_ANGLE_STEPS = 64;

  let gradCache = {
    ctx: null,
    w: 0,
    h: 0,
    horizon: 0,
    sky: [],
    sea: [],
    horizonGlow: null,
    moon: null,
    moonGeom: null,
    beam: [],
    beamLen: 0,
    core: null,
    cliffPattern: null,
    cliffShade: null,
  };

  function bucket01(x, steps){
    return Math.max(0, Math.min(steps - 1, Math.round(x * (steps - 1))));
  }

  function rebuildGradients(ctx){
    gradCache.ctx = ctx;
    gradCache.w = w;
    gradCache.h = h;
    gradCache.horizon = horizon;

    // Sky gradient steps (dawn-driven)
    const topN = [5, 8, 20];
    const midN = [7, 18, 40];
    const botN = [5, 7, 15];

    const topD = [14, 28, 65];
    const midD = [150, 78, 115];
    const botD = [210, 140, 95];

    function mixRGB(a, b, t){
      return [
        Math.round(lerp(a[0], b[0], t)),
        Math.round(lerp(a[1], b[1], t)),
        Math.round(lerp(a[2], b[2], t)),
      ];
    }

    gradCache.sky = Array.from({ length: SKY_STEPS }, (_, i) => {
      const dawn = SKY_STEPS <= 1 ? 0 : i / (SKY_STEPS - 1);
      const c0 = mixRGB(topN, topD, dawn);
      const c1 = mixRGB(midN, midD, dawn);
      const c2 = mixRGB(botN, botD, dawn);

      const g = ctx.createLinearGradient(0, 0, 0, h);
      g.addColorStop(0, `rgb(${c0[0]},${c0[1]},${c0[2]})`);
      g.addColorStop(0.55, `rgb(${c1[0]},${c1[1]},${c1[2]})`);
      g.addColorStop(1, `rgb(${c2[0]},${c2[1]},${c2[2]})`);
      return g;
    });

    gradCache.sea = Array.from({ length: SEA_STEPS }, (_, i) => {
      const dawn = SEA_STEPS <= 1 ? 0 : i / (SEA_STEPS - 1);
      const rt = Math.round(lerp(8, 35, dawn));
      const gt = Math.round(lerp(22, 70, dawn));
      const bt = Math.round(lerp(42, 95, dawn));
      const g = ctx.createLinearGradient(0, horizon, 0, h);
      g.addColorStop(0, `rgba(${rt},${gt},${bt},1)`);
      g.addColorStop(1, 'rgba(2, 4, 8, 1)');
      return g;
    });

    // Cliff texture (cached pattern + shade)
    try {
      const sz = 96;
      const tile = (typeof OffscreenCanvas !== 'undefined')
        ? new OffscreenCanvas(sz, sz)
        : (typeof document !== 'undefined' ? Object.assign(document.createElement('canvas'), { width: sz, height: sz }) : null);

      if (tile){
        const tctx = tile.getContext('2d');
        if (tctx){
          tctx.fillStyle = 'rgb(6,7,10)';
          tctx.fillRect(0, 0, sz, sz);

          // Speckle + chips (deterministic).
          for (let i = 0; i < 260; i++){
            const r0 = hash01(cliffSalt + i * 1013);
            const r1 = hash01(cliffSalt + i * 2029);
            const r2 = hash01(cliffSalt + i * 3049);
            const x = (r0 * sz) | 0;
            const y = (r1 * sz) | 0;
            const s = 1 + ((r2 * 3) | 0);
            const a = 0.10 + r2 * 0.22;
            tctx.fillStyle = `rgba(110,130,160,${a})`;
            tctx.fillRect(x, y, s, s);
          }

          // Faint strata lines.
          tctx.globalAlpha = 0.22;
          tctx.strokeStyle = 'rgba(60,70,90,1)';
          tctx.lineWidth = 1;
          for (let j = 0; j < 10; j++){
            const rr = hash01(cliffSalt + 9000 + j * 17);
            const yy = rr * sz;
            tctx.beginPath();
            tctx.moveTo(-10, yy);
            tctx.lineTo(sz + 10, yy + (rr * 18 - 9));
            tctx.stroke();
          }
          tctx.globalAlpha = 1;

          gradCache.cliffPattern = ctx.createPattern(tile, 'repeat');
        }
      }
    } catch {
      gradCache.cliffPattern = null;
    }

    gradCache.cliffShade = ctx.createLinearGradient(0, horizon, 0, h);
    gradCache.cliffShade.addColorStop(0, 'rgba(150,170,210,0.22)');
    gradCache.cliffShade.addColorStop(0.65, 'rgba(20,25,35,0)');
    gradCache.cliffShade.addColorStop(1, 'rgba(0,0,0,0)');

    // Horizon glow (alpha is scaled at draw time)
    const hx = w * 0.6;
    const hy = horizon - h * 0.03;
    gradCache.horizonGlow = ctx.createRadialGradient(hx, hy, 1, hx, hy, w * 0.9);
    gradCache.horizonGlow.addColorStop(0, 'rgba(255,190,150,1)');
    gradCache.horizonGlow.addColorStop(1, 'rgba(255,190,150,0)');

    // Moon glow (alpha is scaled at draw time)
    const mx = w * 0.72;
    const my = h * 0.22;
    const mr = Math.min(w, h) * 0.055;
    gradCache.moonGeom = { mx, my, mr };
    gradCache.moon = ctx.createRadialGradient(mx - mr * 0.25, my - mr * 0.2, 1, mx, my, mr);
    gradCache.moon.addColorStop(0, 'rgba(235,245,255,1)');
    gradCache.moon.addColorStop(1, 'rgba(235,245,255,0)');

    // Beam/core gradients: create in world coords (anchored to lighthouse)
    gradCache.beamLen = Math.max(w, h) * 0.85;
    gradCache.beam = Array.from({ length: BEAM_ANGLE_STEPS }, (_, i) => {
      const a = (i / BEAM_ANGLE_STEPS) * Math.PI * 2;
      ctx.save();
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.translate(lighthouseX, lighthouseY);
      ctx.rotate(a);

      const g = ctx.createLinearGradient(0, 0, gradCache.beamLen, 0);
      g.addColorStop(0, 'rgba(255, 245, 210, 1)');
      g.addColorStop(0.25, 'rgba(255, 240, 200, 0.35)');
      g.addColorStop(1, 'rgba(255, 240, 200, 0)');
      ctx.restore();
      return g;
    });

    // Lantern core is radial (no angle bins needed)
    const towerH = h * 0.28;
    const topW = w * 0.05;
    const lrW = topW * 1.25;
    const lrH = towerH * 0.12;

    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.translate(lighthouseX, lighthouseY);
    gradCache.core = ctx.createRadialGradient(0, -towerH - lrH * 0.5, 1, 0, -towerH - lrH * 0.5, lrW * 0.9);
    gradCache.core.addColorStop(0, 'rgba(255, 250, 220, 1)');
    gradCache.core.addColorStop(1, 'rgba(255, 250, 220, 0)');
    ctx.restore();
  }

  function ensureGradients(ctx){
    if (gradCache.ctx !== ctx || gradCache.w !== w || gradCache.h !== h || gradCache.horizon !== horizon){
      rebuildGradients(ctx);
    }
  }


  // layout
  let horizon = 0;
  let lighthouseX = 0;
  let lighthouseY = 0;

  // time structure
  const beamPeriod = 6.2 + rand() * 2.8; // seconds per rotation
  const beamWidth = 0.18 + rand() * 0.06; // radians
  const cycle = {
    night: 92 + (rand() * 28) | 0,
    fog: 82 + (rand() * 26) | 0,
    storm: 72 + (rand() * 26) | 0,
    dawn: 58 + (rand() * 18) | 0,
  };
  const cycleTotal = cycle.night + cycle.fog + cycle.storm + cycle.dawn;

  // scene elements
  let stars = [];
  let fogLayers = []; // [{speed, a, blobs:[{x,y,r,tw}]}]
  let rain = []; // streaks for storm overlay

  // events
  let ship = null; // {x,y,s, vx, life, horned}
  let nextShipAt = 0;

  let lightning = 0;
  let nextLightningAt = 1e9;
  let wasStorm = false;

  // audio handle
  let ah = null;

  function pick(arr){ return arr[(rand() * arr.length) | 0]; }

  function sceneInit(width, height){
    w = width;
    h = height;
    horizon = h * 0.62;

    lighthouseX = w * (0.18 + rand() * 0.12);
    lighthouseY = horizon + h * 0.02;

    // stars: precomputed so render stays deterministic.
    const nStars = Math.floor(140 + (w * h) / 180_000);
    stars = Array.from({ length: nStars }, () => ({
      x: rand() * w,
      y: rand() * (h * 0.55),
      z: 0.25 + rand() * 0.95,
      tw: rand() * 10,
      hue: 185 + rand() * 50,
    }));

    // fog banks: layered parallax blobs.
    const layerSpecs = [
      { a: 0.16, speed: 8 + rand() * 10, y: horizon - h * 0.06, spread: h * 0.05, blobs: 13 },
      { a: 0.12, speed: 14 + rand() * 14, y: horizon - h * 0.02, spread: h * 0.06, blobs: 16 },
      { a: 0.09, speed: 22 + rand() * 18, y: horizon + h * 0.02, spread: h * 0.06, blobs: 18 },
    ];

    fogLayers = layerSpecs.map((s, li) => ({
      a: s.a,
      speed: s.speed,
      blobs: Array.from({ length: s.blobs }, () => ({
        x: rand() * w,
        y: s.y + (rand() - 0.5) * s.spread,
        r: (w * (0.04 + rand() * 0.08)) * (1 + li * 0.15),
        tw: rand() * 10,
      })),
    }));

    // rain streaks (used only when storming)
    // NOTE: keep params deterministic; positions are derived analytically from time in drawStormOverlay.
    const nRain = Math.floor(90 + (w * h) / 160_000);
    rain = Array.from({ length: nRain }, (_, id) => ({
      id,
      x0: rand() * w,
      y0: rand() * h,
      len: 10 + rand() * 26,
      sp: (260 + rand() * 420) * (0.75 + (w / 1000) * 0.25),
      a: 0.05 + rand() * 0.10,
      wob: rand() * 10,
    }));

    ship = null;
    nextShipAt = 8 + rand() * 18;
    lightning = 0;
    nextLightningAt = 1e9;
    wasStorm = false;

    // force gradient cache rebuild on next render()
    gradCache.ctx = null;
  }

  function init({ width, height }){
    t = 0;
    sceneInit(width, height);
  }

  function onResize(width, height){
    sceneInit(width, height);
  }

  function phaseAt(tt){
    const u = ((tt % cycleTotal) + cycleTotal) % cycleTotal;
    if (u < cycle.night) return { name: 'night', u, k: u / cycle.night };
    if (u < cycle.night + cycle.fog){
      const x = u - cycle.night;
      return { name: 'fog', u, k: x / cycle.fog };
    }
    if (u < cycle.night + cycle.fog + cycle.storm){
      const x = u - cycle.night - cycle.fog;
      return { name: 'storm', u, k: x / cycle.storm };
    }
    const x = u - cycle.night - cycle.fog - cycle.storm;
    return { name: 'dawn', u, k: x / cycle.dawn };
  }

  function makeAudioHandle(){
    const ctx = audio.ensure();

    const out = ctx.createGain();
    out.gain.value = 0.9;
    out.connect(audio.master);

    // Ocean/wind bed (pink noise, lowpassed)
    const bed = audio.noiseSource({ type: 'pink', gain: 0.06 });

    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 820;
    lpf.Q.value = 0.8;

    // gentle swell
    const lfo = ctx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = 0.08;
    const lfoGain = ctx.createGain();
    lfoGain.gain.value = 0.018;

    // subtle tonal hum (lighthouse machinery vibe)
    const hum = ctx.createOscillator();
    hum.type = 'triangle';
    hum.frequency.value = pick([55, 65.4, 73.4]);
    const humGain = ctx.createGain();

    const t0 = ctx.currentTime;
    humGain.gain.setValueAtTime(0.0001, t0);
    humGain.gain.exponentialRampToValueAtTime(0.022, t0 + 0.5);

    // wire
    bed.src.disconnect();
    bed.src.connect(bed.gain);
    bed.gain.disconnect();
    bed.gain.connect(lpf);

    lfo.connect(lfoGain);
    lfoGain.connect(out.gain);

    hum.connect(humGain);
    humGain.connect(lpf);

    lpf.connect(out);

    bed.start();
    lfo.start();
    hum.start();

    return {
      stop(){
        const now = ctx.currentTime;
        try { out.gain.setTargetAtTime(0.0001, now, 0.08); } catch {}
        try { bed.stop(); } catch {}
        try { lfo.stop(now + 0.15); } catch {}
        try { hum.stop(now + 0.15); } catch {}
      },
    };
  }

  function stopAmbience({ clearCurrent = false } = {}){
    const handle = ah;
    if (!handle) return;

    const isCurrent = audio.current === handle;
    if (clearCurrent && isCurrent){
      // clears audio.current and stops via handle.stop()
      try { audio.stopCurrent(); } catch {}
    } else {
      try { handle?.stop?.(); } catch {}
    }

    ah = null;
  }

  function onAudioOn(){
    if (!audio.enabled) return;

    // Defensive: if onAudioOn is called repeatedly while audio is enabled,
    // ensure we don't stack/overlap our own ambience.
    stopAmbience({ clearCurrent: true });

    ah = makeAudioHandle();
    audio.setCurrent(ah);
  }

  function onAudioOff(){
    stopAmbience({ clearCurrent: true });
  }

  function destroy(){
    onAudioOff();
  }

  function spawnShip(){
    const y = horizon + h * (0.03 + rand() * 0.06);
    const s = 0.55 + rand() * 0.65;
    const fromLeft = rand() < 0.5;
    ship = {
      x: fromLeft ? -w * 0.15 : w * 1.15,
      y,
      s,
      vx: (fromLeft ? 1 : -1) * (w * (0.018 + rand() * 0.02)),
      life: 18 + rand() * 16,
      horned: false,
    };
  }

  function update(dt){
    t += dt;

    // update storm entrance/exit state
    const ph = phaseAt(t);
    const stormNow = ph.name === 'storm';
    if (stormNow && !wasStorm){
      nextLightningAt = t + 0.6 + rand() * 1.1;
    }
    wasStorm = stormNow;

    // lightning only during storm
    lightning = Math.max(0, lightning - dt * 2.6);
    if (stormNow && t >= nextLightningAt){
      lightning = 1.0;
      // clustered flashes sometimes
      const cluster = rand() < 0.22;
      nextLightningAt = t + (cluster ? (0.12 + rand() * 0.25) : (1.6 + rand() * 3.4));

      if (audio.enabled){
        audio.beep({ freq: 140 + rand() * 60, dur: 0.06, gain: 0.03, type: 'square' });
      }
    }

    // ship schedule
    if (!ship && t >= nextShipAt){
      spawnShip();
      nextShipAt = t + 24 + rand() * 40;
    }

    if (ship){
      ship.x += ship.vx * dt;
      ship.life -= dt;

      // very occasional fog-horn when entering (if audio on)
      if (audio.enabled && !ship.horned){
        ship.horned = true;
        audio.beep({ freq: 92 + rand() * 18, dur: 0.11, gain: 0.03, type: 'sine' });
      }

      if (ship.life <= 0 || ship.x < -w * 0.25 || ship.x > w * 1.25){
        ship = null;
      }
    }

    // rain streaks are computed analytically in drawStormOverlay (from x0/y0/sp + time),
    // so 30fps vs 60fps captures match. Nothing to update per-frame here.
  }

  function drawSky(ctx, nightAmt, dawnAmt){
    const idx = bucket01(dawnAmt, SKY_STEPS);
    ctx.fillStyle = gradCache.sky[idx];
    ctx.fillRect(0, 0, w, h);

    // faint horizon glow that grows at dawn
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.05 + dawnAmt * 0.12;
    ctx.fillStyle = gradCache.horizonGlow;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();

    // stars fade out as dawn rises
    const starA = 0.65 * nightAmt * (1 - dawnAmt);
    if (starA > 0.001){
      for (const s of stars){
        const tw = 0.4 + 0.6 * (0.5 + 0.5 * Math.sin(t * (0.25 + s.z * 0.5) + s.tw));
        const a = starA * (0.25 + 0.75 * tw);
        ctx.fillStyle = `hsla(${s.hue}, 90%, 82%, ${a})`;
        const sz = 0.8 + s.z * 1.6;
        const px = (s.x + t * (6 + s.z * 18)) % (w + 2);
        ctx.fillRect(px, s.y, sz, sz);
      }
    }

    // moon (subtle)
    const moonA = 0.22 * nightAmt * (1 - dawnAmt);
    if (moonA > 0.001){
      const { mx, my, mr } = gradCache.moonGeom;
      ctx.save();
      ctx.globalAlpha = moonA;
      ctx.fillStyle = gradCache.moon;
      ctx.beginPath();
      ctx.arc(mx, my, mr, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }


  function drawSea(ctx, stormAmt, dawnAmt){
    const seaTop = horizon;

    // ocean body
    const idx = bucket01(dawnAmt, SEA_STEPS);
    ctx.fillStyle = gradCache.sea[idx];
    ctx.fillRect(0, seaTop, w, h - seaTop);

    // wave highlights
    const amp = (h * 0.007) * (1 + stormAmt * 2.6);
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = `rgba(190, 230, 255, ${0.08 + stormAmt * 0.10})`;
    ctx.lineWidth = Math.max(1, Math.floor(Math.min(w, h) / 540));

    const bands = 7;
    for (let i = 0; i < bands; i++){
      const yy = seaTop + (h - seaTop) * ((i + 1) / (bands + 1));
      const f = 0.8 + i * 0.25;
      const sp = (0.6 + i * 0.08) * (1 + stormAmt * 1.2);
      ctx.beginPath();
      for (let x = -10; x <= w + 10; x += 18){
        const y = yy + Math.sin(t * sp + x * 0.012 * f) * amp * (0.6 + i * 0.22);
        if (x === -10) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }
      ctx.stroke();
    }

    // horizon mist line
    ctx.globalAlpha = 1;
    ctx.fillStyle = `rgba(230,245,255,${0.05 + stormAmt * 0.04})`;
    ctx.fillRect(0, seaTop - 1, w, 2);

    ctx.restore();
  }


  function drawShip(ctx, fogAmt){
    if (!ship) return;

    // ship sits behind some fog
    const a = 0.65 * (1 - fogAmt * 0.55);
    if (a <= 0.01) return;

    const x = ship.x;
    const y = ship.y;
    const s = ship.s * Math.min(w, h) * 0.0014;

    ctx.save();
    ctx.globalAlpha = a;
    ctx.translate(x, y);
    ctx.scale(s, s);

    ctx.fillStyle = 'rgba(0,0,0,0.85)';

    // hull
    ctx.beginPath();
    ctx.moveTo(-120, 10);
    ctx.lineTo(120, 10);
    ctx.lineTo(90, 40);
    ctx.lineTo(-90, 40);
    ctx.closePath();
    ctx.fill();

    // cabin
    ctx.beginPath();
    ctx.moveTo(-30, 10);
    ctx.lineTo(30, 10);
    ctx.lineTo(30, -25);
    ctx.lineTo(-30, -25);
    ctx.closePath();
    ctx.fill();

    // mast
    ctx.fillRect(0, -25, 4, -55);
    ctx.fillRect(-18, -62, 38, 4);

    ctx.restore();
  }

  function drawFog(ctx, fogAmt, stormAmt){
    if (fogAmt <= 0.001) return;

    for (let li = 0; li < fogLayers.length; li++){
      const layer = fogLayers[li];
      const sp = layer.speed * (1 + stormAmt * 0.6);
      const a = layer.a * fogAmt;
      if (a <= 0.001) continue;

      ctx.save();
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(220, 240, 255, 1)';

      for (const b of layer.blobs){
        const drift = (t * sp + Math.sin(t * 0.2 + b.tw) * (6 + li * 4));
        let x = (b.x + drift) % (w + b.r * 2);
        x -= b.r;
        const y = b.y + Math.sin(t * (0.12 + li * 0.05) + b.tw) * (3 + li * 2);

        ctx.beginPath();
        ctx.arc(x, y, b.r, 0, Math.PI * 2);
        ctx.fill();

        // wrap clone
        if (x + b.r < 0){
          ctx.beginPath();
          ctx.arc(x + w + b.r * 2, y, b.r, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      ctx.restore();
    }

    // slight cool tint over the whole horizon band
    ctx.save();
    ctx.globalCompositeOperation = 'multiply';
    ctx.fillStyle = `rgba(150, 190, 220, ${0.08 * fogAmt})`;
    ctx.fillRect(0, horizon - h * 0.1, w, h * 0.22);
    ctx.restore();
  }

  function drawLighthouse(ctx, beamAmt, stormAmt, dawnAmt){
    // rocky foreground hill (add subtle cached texture so it reads as rock, not a flat wedge)
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.85)';
    cliffHillPath(ctx, w, h, horizon);
    ctx.fill();

    if (gradCache.cliffPattern){
      ctx.save();
      cliffHillPath(ctx, w, h, horizon);
      ctx.clip();

      // texture speckle (static + deterministic)
      ctx.globalCompositeOperation = 'overlay';
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = gradCache.cliffPattern;
      ctx.translate(cliffSalt & 31, (cliffSalt >>> 5) & 31);
      ctx.fillRect(-96, horizon - 96, w + 192, (h - horizon) + 192);

      // slight ridge lift (keeps it readable in the left foreground)
      if (gradCache.cliffShade){
        ctx.globalCompositeOperation = 'screen';
        ctx.globalAlpha = (0.14 * (1 - stormAmt * 0.6)) + (0.07 * dawnAmt);
        ctx.fillStyle = gradCache.cliffShade;
        ctx.fillRect(0, horizon - h * 0.08, w, h * 0.26);
      }

      ctx.restore();
    }

    // rim-light along the ridge
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = (0.10 + 0.18 * dawnAmt) * (1 - stormAmt * 0.55);
    ctx.strokeStyle = 'rgba(160,190,220,0.9)';
    ctx.lineWidth = Math.max(1, h / 520);
    ctx.lineJoin = 'round';
    cliffRidgePath(ctx, w, h, horizon);
    ctx.stroke();
    ctx.restore();

    ctx.restore();

    // tower
    const towerH = h * 0.28;
    const baseW = w * 0.08;
    const topW = w * 0.05;

    ctx.save();
    ctx.translate(lighthouseX, lighthouseY);

    // beam (behind tower)
    const ang = (t * (Math.PI * 2 / beamPeriod)) + Math.sin(t * 0.7) * 0.03 * stormAmt;
    const beamLen = gradCache.beamLen || (Math.max(w, h) * 0.85);

    if (beamAmt > 0.001){
      const a0 = (0.18 + beamAmt * 0.38) * (1 - dawnAmt * 0.5);

      const angNorm = ((ang % (Math.PI * 2)) + (Math.PI * 2)) % (Math.PI * 2);
      const bi = (Math.floor((angNorm / (Math.PI * 2)) * BEAM_ANGLE_STEPS)) % BEAM_ANGLE_STEPS;
      const g = gradCache.beam[bi];

      ctx.save();
      ctx.rotate(ang);

      ctx.globalAlpha = a0;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(beamLen, Math.tan(beamWidth) * beamLen);
      ctx.lineTo(beamLen, -Math.tan(beamWidth) * beamLen);
      ctx.closePath();
      ctx.fill();

      // beam edge glow
      ctx.strokeStyle = 'rgba(255, 240, 200, 0.18)';
      ctx.lineWidth = Math.max(1, h / 700);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(beamLen, Math.tan(beamWidth) * beamLen);
      ctx.stroke();
      ctx.beginPath();
      ctx.moveTo(0, 0);
      ctx.lineTo(beamLen, -Math.tan(beamWidth) * beamLen);
      ctx.stroke();

      ctx.restore();
    }

    // tower body
    ctx.fillStyle = `rgba(18, 18, 22, ${0.95 - dawnAmt * 0.15})`;
    ctx.beginPath();
    ctx.moveTo(-baseW * 0.5, 0);
    ctx.lineTo(-topW * 0.5, -towerH);
    ctx.lineTo(topW * 0.5, -towerH);
    ctx.lineTo(baseW * 0.5, 0);
    ctx.closePath();
    ctx.fill();

    // stripes
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < 4; i++){
      const yy = -towerH * (0.22 + i * 0.18);
      ctx.fillStyle = `rgba(255, 90, 110, ${0.05 + i * 0.015})`;
      ctx.fillRect(-baseW * 0.25, yy, baseW * 0.5, towerH * 0.04);
    }
    ctx.restore();

    // lantern room
    const lrW = topW * 1.25;
    const lrH = towerH * 0.12;
    ctx.fillStyle = 'rgba(10, 10, 14, 0.95)';
    ctx.fillRect(-lrW * 0.5, -towerH - lrH, lrW, lrH);

    // light core
    const coreA = 0.35 + beamAmt * 0.55;
    ctx.save();
    ctx.globalAlpha = coreA;
    ctx.fillStyle = gradCache.core;
    ctx.beginPath();
    ctx.arc(0, -towerH - lrH * 0.5, lrW * 0.9, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // tiny railing
    ctx.strokeStyle = 'rgba(210, 230, 255, 0.18)';
    ctx.lineWidth = Math.max(1, h / 900);
    ctx.beginPath();
    ctx.rect(-lrW * 0.58, -towerH - lrH * 1.05, lrW * 1.16, lrH * 1.25);
    ctx.stroke();

    ctx.restore();
  }


  function drawStormOverlay(ctx, stormAmt){
    if (stormAmt <= 0.001) return;

    // rain streaks (FPS-stable): derive x/y from initial params + absolute time.
    // Previous behaviour re-rolled x via rand() on wrap, which made 30fps/60fps diverge.
    ctx.save();
    ctx.lineWidth = Math.max(1, Math.floor(Math.min(w, h) / 560));

    const span = h + 80; // [-40 .. h+40)
    for (const r of rain){
      const yRaw = r.y0 + t * r.sp;
      const wraps = Math.floor((yRaw + 40) / span) | 0;
      const y = -40 + ((yRaw + 40) % span);

      // deterministic per-wrap x jitter (~previous +/-45px), keyed by (seed, streak id, wrap index)
      const key = (rainSalt ^ Math.imul(r.id + 1, 0x9e3779b1) ^ Math.imul(wraps + 1, 0x85ebca6b)) | 0;
      const jx = (hash01(key) - 0.5) * 90;
      const x = (r.x0 + jx + w) % w;

      const wob = Math.sin(t * 0.9 + r.wob) * 8;
      ctx.strokeStyle = `rgba(200, 230, 255, ${(r.a * stormAmt).toFixed(3)})`;
      ctx.beginPath();
      ctx.moveTo(x + wob, y);
      ctx.lineTo(x + wob - 12, y + r.len);
      ctx.stroke();
    }
    ctx.restore();

    // darken / vignette a bit
    ctx.save();
    ctx.fillStyle = `rgba(0,0,0,${0.12 * stormAmt})`;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  function drawTitle(ctx, nightAmt, fogAmt, stormAmt, dawnAmt){
    const s = Math.min(w, h);
    const pad = Math.max(12, Math.floor(s * 0.02));
    const boxW = Math.floor(s * 0.50);
    const boxH = Math.floor(s * 0.11);
    const x = pad;
    const y = pad;

    const uiA = 0.55 + 0.25 * nightAmt;

    ctx.save();
    ctx.fillStyle = `rgba(6, 10, 18, ${0.62 * uiA})`;
    ctx.strokeStyle = `rgba(108, 242, 255, ${0.16 * uiA})`;
    ctx.lineWidth = 1;
    roundRect(ctx, x, y, boxW, boxH, 10);
    ctx.fill();
    ctx.stroke();

    ctx.font = `${Math.floor(boxH * 0.34)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = `rgba(210, 245, 255, ${0.9 * uiA})`;
    ctx.fillText('TINY LIGHTHOUSE WATCH', x + 14, y + Math.floor(boxH * 0.46));

    ctx.font = `${Math.floor(boxH * 0.28)}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Arial`;
    ctx.fillStyle = `rgba(255,255,255, ${0.78 * uiA})`;

    let sub = 'Night watch — steady beam';
    if (dawnAmt > 0.6) sub = 'Dawn reset — clear horizon';
    else if (stormAmt > 0.35) sub = 'Storm pulses — lightning & rain';
    else if (fogAmt > 0.35) sub = 'Fog banks — silhouettes in mist';

    ctx.fillText(sub, x + 14, y + Math.floor(boxH * 0.82));

    // tiny status pill
    const pill = stormAmt > 0.25 ? 'STORM' : (fogAmt > 0.25 ? 'FOG' : (dawnAmt > 0.25 ? 'DAWN' : 'CALM'));
    ctx.font = `${Math.floor(boxH * 0.26)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    const tw = ctx.measureText(pill).width;
    const px = x + boxW - 14 - tw - 16;
    const py = y + Math.floor(boxH * 0.24);
    ctx.fillStyle = `rgba(255, 190, 110, ${0.22 * uiA})`;
    roundRect(ctx, px, py, tw + 16, Math.floor(boxH * 0.36), 9);
    ctx.fill();
    ctx.fillStyle = `rgba(255, 210, 150, ${0.85 * uiA})`;
    ctx.fillText(pill, px + 8, py + Math.floor(boxH * 0.27));

    ctx.restore();
  }

  function render(ctx){
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    ensureGradients(ctx);

    const ph = phaseAt(t);

    // fade params
    const dawnAmt = ph.name === 'dawn' ? smoothstep(0, 1, ph.k) : 0;
    const fogRise = ph.name === 'fog' ? smoothstep(0.1, 0.9, ph.k) : 0;
    const fogCarry = ph.name === 'storm' ? 0.55 : 0;
    const fogFade = ph.name === 'dawn' ? (1 - smoothstep(0.1, 0.9, ph.k)) : 0;
    const fogAmt = clamp01(Math.max(fogRise, fogCarry) * (0.6 + 0.4 * fogFade));

    const stormAmt = ph.name === 'storm' ? smoothstep(0.05, 0.35, ph.k) * (1 - smoothstep(0.75, 1, ph.k) * 0.35) : 0;

    const nightAmt = ph.name === 'night' ? 1 : (1 - dawnAmt);

    // beam intensity: always on, but muted a bit at dawn.
    const beamAmt = (0.55 + 0.45 * Math.sin(t * (Math.PI * 2 / beamPeriod)) * 0.5 + 0.5) * (0.85 - dawnAmt * 0.35);

    drawSky(ctx, nightAmt, dawnAmt);
    drawSea(ctx, stormAmt, dawnAmt);

    // ship silhouette (behind fog)
    drawShip(ctx, fogAmt);

    // fog layer(s)
    drawFog(ctx, fogAmt, stormAmt);

    // lighthouse + beam on top
    drawLighthouse(ctx, beamAmt, stormAmt, dawnAmt);

    // storm / rain overlay
    drawStormOverlay(ctx, stormAmt);

    // lightning flash
    if (lightning > 0.001){
      // quick, cool flash
      const a = lightning * (0.16 + stormAmt * 0.14);
      ctx.fillStyle = `rgba(235, 245, 255, ${a})`;
      ctx.fillRect(0, 0, w, h);
    }

    drawTitle(ctx, nightAmt, fogAmt, stormAmt, dawnAmt);
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
