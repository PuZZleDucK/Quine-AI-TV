import { mulberry32 } from '../util/prng.js';
import { simpleDrone } from '../util/audio.js';

// REVIEWED: 2026-02-15

export function createChannel({ seed, audio }) {
  const rand = mulberry32(seed);
  const seedInt = seed | 0;

  let w = 0;
  let h = 0;
  let t = 0;

  const bpm = 72 + ((rand() * 12) | 0);
  const beatPeriod = 60 / bpm;
  let beatPulse = 0;
  let beatIndex = -1;

  let stars = [];
  let skylineFar = [];
  let skylineNear = [];

  let drone = null;
  let musicHandle = null;

  let nextMeteorAt = 0;
  let meteor = null;

  let flash = 0;
  let nextFlashAt = 0;

  let titleGlitch = 0;
  let nextTitleGlitchAt = 0;

  // Rare deterministic “special moment”
  let policeActive = false;
  let policeT = 0;
  let policeDur = 0;
  let nextPoliceAt = 0;
  let policeRepeat = 0;

  // Offscreen cached gradient layers/textures (rebuilt on init/resize/ctx swap)
  const layerCache = {
    ctxRef: null,
    w: 0,
    h: 0,
    sky: null,
    sunDisk: null,
    sunHaloOuter: null,
    sunHaloCore: null,
    sunRefl: null,
    gridGlow: null,
  };

  function makeCanvas(width, height) {
    if (typeof OffscreenCanvas !== 'undefined') return new OffscreenCanvas(width, height);
    const c = document.createElement('canvas');
    c.width = width;
    c.height = height;
    return c;
  }

  function invalidateLayers() {
    layerCache.ctxRef = null;
    layerCache.w = 0;
    layerCache.h = 0;
    layerCache.sky = null;
    layerCache.sunDisk = null;
    layerCache.sunHaloOuter = null;
    layerCache.sunHaloCore = null;
    layerCache.sunRefl = null;
    layerCache.gridGlow = null;
  }

  function rebuildLayers(ctx) {
    layerCache.ctxRef = ctx;
    layerCache.w = w;
    layerCache.h = h;

    // Sky gradient
    {
      const c = makeCanvas(w, h);
      const g = c.getContext('2d');
      if (g) {
        const sky = g.createLinearGradient(0, 0, 0, h);
        sky.addColorStop(0, '#050016');
        sky.addColorStop(0.42, '#15002f');
        sky.addColorStop(0.82, '#08091e');
        sky.addColorStop(1, '#03050b');
        g.fillStyle = sky;
        g.fillRect(0, 0, w, h);
      }
      layerCache.sky = c;
    }

    const TEX = 256;

    // Sun disk vertical gradient (drawn into clipped circle in main ctx)
    {
      const c = makeCanvas(TEX, TEX);
      const g = c.getContext('2d');
      if (g) {
        const disk = g.createLinearGradient(0, 0, 0, TEX);
        disk.addColorStop(0, '#ffd486');
        disk.addColorStop(0.44, '#ff6bcf');
        disk.addColorStop(1, '#d83be8');
        g.fillStyle = disk;
        g.fillRect(0, 0, TEX, TEX);
      }
      layerCache.sunDisk = c;
    }

    // Sun halo: decompose into a magenta outer and a warm core so we can animate alphas
    {
      const c = makeCanvas(TEX, TEX);
      const g = c.getContext('2d');
      if (g) {
        const r = TEX * 0.5;
        const halo = g.createRadialGradient(r, r, 1, r, r, r);
        halo.addColorStop(0, 'rgba(255,80,215,0.05)');
        halo.addColorStop(0.35, 'rgba(255,80,215,0.25)');
        halo.addColorStop(0.52, 'rgba(255,80,215,1)');
        halo.addColorStop(1, 'rgba(255,80,215,0)');
        g.fillStyle = halo;
        g.fillRect(0, 0, TEX, TEX);
      }
      layerCache.sunHaloOuter = c;
    }

    {
      const c = makeCanvas(TEX, TEX);
      const g = c.getContext('2d');
      if (g) {
        const r = TEX * 0.5;
        const core = g.createRadialGradient(r, r, 1, r, r, r * 0.52);
        core.addColorStop(0, 'rgba(255,210,120,1)');
        core.addColorStop(1, 'rgba(255,210,120,0)');
        g.fillStyle = core;
        g.fillRect(0, 0, TEX, TEX);
      }
      layerCache.sunHaloCore = c;
    }

    // Sun reflection gradient (stretched)
    {
      const c = makeCanvas(1, TEX);
      const g = c.getContext('2d');
      if (g) {
        const refl = g.createLinearGradient(0, 0, 0, TEX);
        refl.addColorStop(0, 'rgba(255,95,220,1)');
        refl.addColorStop(1, 'rgba(255,95,220,0)');
        g.fillStyle = refl;
        g.fillRect(0, 0, 1, TEX);
      }
      layerCache.sunRefl = c;
    }

    // Grid glow gradient (stretched)
    {
      const c = makeCanvas(1, TEX);
      const g = c.getContext('2d');
      if (g) {
        const glow = g.createLinearGradient(0, 0, 0, TEX);
        glow.addColorStop(0, 'rgba(108,242,255,1)');
        glow.addColorStop(1, 'rgba(108,242,255,0)');
        g.fillStyle = glow;
        g.fillRect(0, 0, 1, TEX);
      }
      layerCache.gridGlow = c;
    }
  }

  function ensureLayers(ctx) {
    if (!layerCache.sky || layerCache.w !== w || layerCache.h !== h || layerCache.ctxRef !== ctx) {
      rebuildLayers(ctx);
    }
  }

  function pick(arr) {
    return arr[(rand() * arr.length) | 0];
  }

  // Deterministic hash → [0, 1) (no per-frame RNG)
  function hashUnit32(x) {
    x |= 0;
    x ^= x >>> 16;
    x = Math.imul(x, 0x7feb352d);
    x ^= x >>> 15;
    x = Math.imul(x, 0x846ca68b);
    x ^= x >>> 16;
    return (x >>> 0) / 4294967296;
  }

  function clamp01(x) {
    return Math.max(0, Math.min(1, x));
  }

  function sceneInit(width, height) {
    w = width;
    h = height;
    t = 0;
    invalidateLayers();
    beatPulse = 0;
    beatIndex = -1;
    flash = 0;

    stars = Array.from({ length: 260 }, () => ({
      x: rand() * w,
      y: rand() * h * 0.56,
      z: 0.18 + rand() * 0.95,
      tw: rand() * 12,
      hue: 170 + rand() * 80,
    }));

    skylineFar = [];
    skylineNear = [];

    let x = -w * 0.1;
    while (x < w * 1.1) {
      const bw = Math.max(16, Math.floor(w * (0.012 + rand() * 0.03)));
      skylineFar.push({
        x,
        w: bw,
        h: Math.floor(h * (0.04 + rand() * 0.12)),
        lights: 2 + ((rand() * 5) | 0),
      });
      x += bw + Math.floor(3 + rand() * 6);
    }

    x = -w * 0.12;
    while (x < w * 1.15) {
      const bw = Math.max(20, Math.floor(w * (0.015 + rand() * 0.04)));
      skylineNear.push({
        x,
        w: bw,
        h: Math.floor(h * (0.07 + rand() * 0.2)),
        lights: 3 + ((rand() * 7) | 0),
      });
      x += bw + Math.floor(4 + rand() * 9);
    }

    meteor = null;
    nextMeteorAt = 3 + rand() * 5;
    nextFlashAt = 7 + rand() * 8;
    nextTitleGlitchAt = 2 + rand() * 4;
    titleGlitch = 0;

    policeActive = false;
    policeT = 0;
    policeDur = 0;

    // First “POLICE LIGHTS” moment somewhere between 2–5 minutes, deterministic per seed.
    const firstAt = 120 + hashUnit32(seedInt ^ 0x2b992ddf) * 180;
    policeRepeat = 150 + hashUnit32(seedInt ^ 0x7f4a7c15) * 150; // ~2.5–5 min between moments
    nextPoliceAt = firstAt;
  }

  function onResize(width, height) {
    sceneInit(width, height);
  }

  function triggerBeat() {
    beatPulse = 1;

    if (!audio.enabled) return;

    const ctx = audio.ensure();
    const beatMod = beatIndex % 8;

    audio.beep({
      freq: beatMod === 0 ? 64 : 78,
      dur: 0.09,
      gain: beatMod === 0 ? 0.03 : 0.018,
      type: 'square',
    });

    if (beatMod % 2 === 0) {
      const scale = [110, 123.47, 130.81, 146.83, 164.81, 174.61, 196, 220];
      const f = scale[(beatIndex / 2) % scale.length | 0];
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = pick(['triangle', 'sawtooth']);
      osc.frequency.value = f * 2;
      g.gain.value = 0;
      osc.connect(g);
      g.connect(audio.master);
      const t0 = ctx.currentTime;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.015, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
      osc.start(t0);
      osc.stop(t0 + 0.2);
    }
  }

  function onAudioOn() {
    if (!audio.enabled) return;
    drone = simpleDrone(audio, { root: 55, detune: 1.5, gain: 0.05 });
    musicHandle = {
      stop() {
        try { drone?.stop?.(); } catch {}
      },
    };
    audio.setCurrent(musicHandle);
  }

  function onAudioOff() {
    try { musicHandle?.stop?.(); } catch {}
    drone = null;
    musicHandle = null;
  }

  function playPoliceSting() {
    // Subtle one-shot siren-ish sting when the POLICE LIGHTS moment begins.
    if (!audio.enabled) return;

    const ctx = audio.ensure();
    const t0 = ctx.currentTime;

    const o = ctx.createOscillator();
    const f = ctx.createBiquadFilter();
    const g = ctx.createGain();

    o.type = 'triangle';
    f.type = 'lowpass';
    f.frequency.value = 1600;
    f.Q.value = 0.6;

    g.gain.value = 0;

    o.connect(f);
    f.connect(g);
    g.connect(audio.master);

    // Amplitude envelope (keep it quiet vs the beat beeps + drone).
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(0.014, t0 + 0.03);
    g.gain.linearRampToValueAtTime(0.010, t0 + 0.25);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.9);

    // Quick up/down siren motion (two short cycles).
    o.frequency.setValueAtTime(620, t0);
    o.frequency.linearRampToValueAtTime(920, t0 + 0.22);
    o.frequency.linearRampToValueAtTime(620, t0 + 0.44);
    o.frequency.linearRampToValueAtTime(920, t0 + 0.66);
    o.frequency.linearRampToValueAtTime(620, t0 + 0.88);

    o.start(t0);
    o.stop(t0 + 0.92);
  }

  function destroy() {
    onAudioOff();
  }

  function update(dt) {
    t += dt;
    beatPulse = Math.max(0, beatPulse - dt * 1.8);
    flash = Math.max(0, flash - dt * 1.35);
    titleGlitch = Math.max(0, titleGlitch - dt * 8);

    const idx = Math.floor(t / beatPeriod);
    if (idx !== beatIndex) {
      beatIndex = idx;
      triggerBeat();
    }

    if (!meteor && t >= nextMeteorAt) {
      meteor = {
        x: w * (0.15 + rand() * 0.7),
        y: h * (0.05 + rand() * 0.2),
        vx: -(w * (0.28 + rand() * 0.25)),
        vy: h * (0.11 + rand() * 0.15),
        life: 1.1 + rand() * 0.7,
      };
      nextMeteorAt = t + 5 + rand() * 11;
    }

    if (meteor) {
      meteor.x += meteor.vx * dt;
      meteor.y += meteor.vy * dt;
      meteor.life -= dt;
      if (meteor.life <= 0 || meteor.y > h * 0.58 || meteor.x < -w * 0.2) meteor = null;
    }

    if (t >= nextFlashAt) {
      flash = 0.85;
      nextFlashAt = t + 9 + rand() * 14;
    }

    if (t >= nextTitleGlitchAt) {
      titleGlitch = 1;
      nextTitleGlitchAt = t + 2 + rand() * 6;
    }

    if (!policeActive && t >= nextPoliceAt) {
      policeActive = true;
      policeT = 0;
      policeDur = 9 + hashUnit32((seedInt ^ 0x6c078965) + (beatIndex | 0)) * 3.5;
      nextPoliceAt = t + policeRepeat;
      playPoliceSting();
    }

    if (policeActive) {
      policeT += dt;
      if (policeT >= policeDur) {
        policeActive = false;
        policeT = 0;
      }
    }
  }

  function getPoliceState() {
    if (!policeActive || policeDur <= 0) return null;

    const p = clamp01(policeT / policeDur);
    const easeIn = clamp01(p / 0.12);
    const easeOut = clamp01((1 - p) / 0.18);
    const amt = Math.min(1, easeIn, easeOut);

    const flip = ((policeT * 4) | 0) & 1; // 4Hz red/blue
    const strobe = 0.55 + 0.45 * Math.sin(policeT * Math.PI * 2 * 9);
    const sweep = p;

    return { amt, flip, strobe, sweep };
  }

  function getSilhouetteState(horizon) {
    // Occasional deterministic foreground passes to break up the empty grid.
    // Keep OSD clear (title/HUD live in the left/top-left + bottom-left).

    const bucketDur = 42;
    const bucket = (t / bucketDur) | 0;
    const key = (Math.imul(seedInt ^ 0x3b2f6a1d, 1664525) + bucket) | 0;

    // ~12% of buckets spawn a pass (~once every ~6 minutes on average).
    if (hashUnit32(key) > 0.12) return null;

    const phase = (t - bucket * bucketDur) / bucketDur;
    if (phase < 0 || phase > 1) return null;

    // Ease in/out so it doesn't pop in, and avoid deep foreground where the HUD sits.
    const edge = Math.min(phase / 0.12, (1 - phase) / 0.18);
    const amt = clamp01(edge);

    const kind = (hashUnit32(key ^ 0x9e3779b9) * 3) | 0; // 0..2

    const xBase = 0.52 + hashUnit32(key ^ 0x7f4a7c15) * 0.42; // keep to right-ish side
    const drift = (hashUnit32(key ^ 0x2b992ddf) - 0.5) * 0.08;

    // Perspective motion: start near horizon, move down a bit then fade before HUD zone.
    const z = phase * phase;
    const y = horizon + h * (0.05 + 0.20 * z);
    const x = w * (xBase + drift * (0.3 + 0.7 * z));

    // Scale ramps with z but stays modest.
    const scale = 0.35 + z * 1.05;

    return { amt, kind, x, y, scale };
  }

  function drawForegroundSilhouette(ctx, horizon, beatAmt) {
    const s = getSilhouetteState(horizon);
    if (!s || s.amt <= 0) return;

    // Dark silhouette with a subtle neon rim that pulses slightly on beats.
    const a = 0.75 * s.amt;
    const rimA = (0.08 + 0.12 * beatAmt) * s.amt;

    ctx.save();
    ctx.translate(s.x, s.y);
    ctx.scale(s.scale, s.scale);

    ctx.globalCompositeOperation = 'source-over';
    ctx.fillStyle = `rgba(0,0,0,${a.toFixed(3)})`;

    // Keep it visually present but not a full-screen occluder.
    // All dimensions are in a pseudo world-space that gets scaled by perspective above.
    if (s.kind === 0) {
      // Road sign
      ctx.fillRect(-6, -70, 12, 92);
      ctx.fillRect(6, -66, 64, 34);
      ctx.fillRect(6, -66, 64, 7);
    } else if (s.kind === 1) {
      // Billboard
      ctx.fillRect(-6, -82, 12, 104);
      ctx.fillRect(58, -82, 12, 104);
      ctx.fillRect(-22, -114, 114, 44);
      ctx.fillRect(-22, -114, 114, 8);
    } else {
      // Gantry / bridge segment (high enough to avoid the HUD area)
      ctx.fillRect(-90, -118, 180, 16);
      ctx.fillRect(-76, -118, 12, 70);
      ctx.fillRect(64, -118, 12, 70);
    }

    // Rim light (screen blend)
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = rimA;
    ctx.strokeStyle = 'rgba(108,242,255,1)';
    ctx.lineWidth = 3;

    ctx.beginPath();
    if (s.kind === 0) {
      ctx.rect(6, -66, 64, 34);
    } else if (s.kind === 1) {
      ctx.rect(-22, -114, 114, 44);
    } else {
      ctx.rect(-90, -118, 180, 16);
    }
    ctx.stroke();

    ctx.restore();
  }

  function drawSky(ctx, horizon, beatAmt) {
    ctx.drawImage(layerCache.sky, 0, 0);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = `rgba(255, 120, 210, ${0.08 + beatAmt * 0.08})`;
    ctx.fillRect(0, horizon * 0.4, w, horizon * 0.5);
    ctx.restore();

    for (const s of stars) {
      const tw = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * (0.35 + s.z * 0.45) + s.tw));
      const a = (0.22 + 0.62 * tw) * (0.65 + beatAmt * 0.35);
      ctx.fillStyle = `hsla(${s.hue}, 90%, 78%, ${a})`;
      const sz = 0.8 + s.z * 1.6;
      const px = (s.x + t * 4 * s.z) % (w + 2);
      ctx.fillRect(px, s.y, sz, sz);
    }

    if (meteor) {
      ctx.save();
      ctx.strokeStyle = 'rgba(190,240,255,0.75)';
      ctx.lineWidth = Math.max(1, h / 520);
      ctx.beginPath();
      ctx.moveTo(meteor.x, meteor.y);
      ctx.lineTo(meteor.x + w * 0.08, meteor.y - h * 0.04);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawSun(ctx, horizon, beatAmt) {
    const sunX = w * 0.72;
    const sunY = h * 0.31 + Math.sin(t * 0.25) * h * 0.003;
    const sunR = Math.min(w, h) * (0.145 + beatAmt * 0.012);

    const shimmer = Math.sin(t * 3.8) * 0.5 + 0.5;
    const haloR = sunR * 1.4;
    const aCenter = 0.9 + beatAmt * 0.08;
    const aMid = 0.5 + shimmer * 0.15;

    ctx.save();
    ctx.globalAlpha = aMid;
    ctx.drawImage(layerCache.sunHaloOuter, sunX - haloR, sunY - haloR, haloR * 2, haloR * 2);
    ctx.restore();

    const coreBoost = Math.max(0, aCenter - aMid);
    if (coreBoost > 0.001) {
      ctx.save();
      ctx.globalAlpha = coreBoost;
      ctx.drawImage(layerCache.sunHaloCore, sunX - haloR, sunY - haloR, haloR * 2, haloR * 2);
      ctx.restore();
    }

    ctx.save();
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
    ctx.clip();

    ctx.drawImage(layerCache.sunDisk, sunX - sunR, sunY - sunR, sunR * 2, sunR * 2);

    const scanGap = Math.max(3, Math.floor(sunR / 11));
    const drift = Math.sin(t * 1.4) * 1.2;
    for (let yy = sunY - sunR; yy < sunY + sunR; yy += scanGap) {
      const wobble = Math.sin(yy * 0.045 + t * 4.5) * 3 + drift;
      ctx.strokeStyle = `rgba(${160 + ((yy * 3) % 80) | 0},0,80,0.22)`;
      ctx.lineWidth = Math.max(1, h / 540);
      ctx.beginPath();
      ctx.moveTo(sunX - sunR + wobble, yy);
      ctx.lineTo(sunX + sunR + wobble, yy);
      ctx.stroke();
    }

    ctx.restore();

    const reflA = 0.12 + beatAmt * 0.12;
    ctx.save();
    ctx.globalAlpha = reflA;
    ctx.drawImage(layerCache.sunRefl, sunX - sunR * 0.9, horizon * 0.9, sunR * 1.8, h - horizon * 0.9);
    ctx.restore();
  }

  function drawSkylineLayer(ctx, layer, horizon, offset, color, lightColor, amp) {
    ctx.save();
    ctx.translate(offset, 0);
    for (const b of layer) {
      const x = b.x;
      const y = horizon - b.h;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, b.w, b.h);

      ctx.fillStyle = `rgba(0,0,0,0.3)`;
      ctx.fillRect(x, y, b.w, Math.max(2, b.h * 0.08));

      const rows = Math.max(1, (b.h / 8) | 0);
      const cols = Math.max(1, (b.w / 7) | 0);
      const sx = b.w / (cols + 1);
      const sy = b.h / (rows + 1);
      for (let ry = 1; ry <= rows; ry++) {
        for (let cx = 1; cx <= cols; cx++) {
          const hv = Math.sin((b.x + 1) * 0.173 + cx * 12.9898 + ry * 78.233) * 43758.5453;
          const keep = hv - Math.floor(hv);
          if (keep > 0.45) continue;
          const tw = 0.4 + 0.6 * Math.sin(t * (0.0045 + ry * 0.0002) + cx + ry);
          ctx.fillStyle = `${lightColor.replace('ALPHA', String((0.1 + 0.35 * tw + amp * 0.25).toFixed(3)))}`;
          ctx.fillRect(x + cx * sx - 1.5, y + ry * sy - 1.5, 3, 3);
        }
      }
    }
    ctx.restore();
  }

  function drawPoliceSweep(ctx, horizon, police) {
    if (!police || police.amt <= 0) return;

    const amt = police.amt;
    const sweepX = w * (0.1 + police.sweep * 0.8);
    const band = w * 0.18;

    const red = `rgba(255,70,120,${(0.55 * amt).toFixed(3)})`;
    const blue = `rgba(90,170,255,${(0.55 * amt).toFixed(3)})`;

    const g = ctx.createLinearGradient(sweepX - band, 0, sweepX + band, 0);
    g.addColorStop(0, 'rgba(0,0,0,0)');
    g.addColorStop(0.3, red);
    g.addColorStop(0.5, blue);
    g.addColorStop(0.7, red);
    g.addColorStop(1, 'rgba(0,0,0,0)');

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = g;
    ctx.globalAlpha = 0.85 * (0.65 + 0.35 * police.strobe);

    const y0 = horizon - h * 0.03;
    ctx.fillRect(0, y0, w, h - y0);
    ctx.restore();
  }

  function drawGrid(ctx, horizon, beatAmt, police) {
    const camDriftX = Math.sin(t * 0.16) * w * 0.012 + Math.sin(t * 0.42) * w * 0.004;
    const camDriftY = Math.sin(t * 0.18) * h * 0.006;

    const pAmt = police?.amt || 0;
    const flip = police?.flip || 0;

    const base = { r: 108, g: 242, b: 255 };
    const alt = flip ? { r: 90, g: 170, b: 255 } : { r: 255, g: 70, b: 120 };
    const mix = pAmt * 0.65;
    const r = Math.round(base.r * (1 - mix) + alt.r * mix);
    const g = Math.round(base.g * (1 - mix) + alt.g * mix);
    const b = Math.round(base.b * (1 - mix) + alt.b * mix);

    ctx.save();
    ctx.translate(w * 0.5 + camDriftX, horizon + camDriftY);

    const glowA = 0.12 + beatAmt * 0.15;
    ctx.save();
    ctx.globalAlpha = glowA;
    ctx.drawImage(layerCache.gridGlow, -w, -6, w * 2, h * 1.1);
    ctx.restore();

    if (pAmt > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = pAmt * (0.12 + 0.25 * (0.65 + 0.35 * (police?.strobe || 0)));
      ctx.fillStyle = flip ? 'rgba(90,170,255,1)' : 'rgba(255,70,120,1)';
      ctx.fillRect(-w, -10, w * 2, h * 1.25);
      ctx.restore();
    }

    ctx.strokeStyle = `rgba(${r},${g},${b},${0.4 + beatAmt * 0.25 + pAmt * 0.18})`;
    ctx.lineWidth = Math.max(1, Math.floor(h / 560));

    const cols = 28;
    for (let i = -cols; i <= cols; i++) {
      const x = i / cols;
      ctx.globalAlpha = 0.14 + 0.6 * (1 - Math.abs(x));
      ctx.beginPath();
      ctx.moveTo(x * w * 0.62, 0);
      ctx.lineTo(x * w * 3.2, h * 1.8);
      ctx.stroke();
    }

    const rows = 28;
    const speed = 1.2 + beatAmt * 1.2;
    for (let r = 0; r < rows; r++) {
      const z = (r + (t * speed) % 1) / rows;
      const y = z * z * (h * 1.65);
      const half = (1 - z) * w * 1.85;
      ctx.globalAlpha = 0.06 + 0.72 * z;
      ctx.beginPath();
      ctx.moveTo(-half, y);
      ctx.lineTo(half, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCar(ctx, horizon, beatAmt, police) {
    const roadY = horizon + h * 0.33;
    const sway = Math.sin(t * 0.42) * w * 0.024;
    const x = w * 0.5 + sway;
    const bodyW = w * 0.12;
    const bodyH = h * 0.038;

    const pAmt = police?.amt || 0;
    const flip = police?.flip || 0;

    ctx.save();
    ctx.translate(x, roadY);

    if (pAmt > 0) {
      const c = flip ? 'rgba(90,170,255,1)' : 'rgba(255,70,120,1)';
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = pAmt * (0.35 + 0.25 * (police?.strobe || 0));
      ctx.fillStyle = c;
      ctx.fillRect(-bodyW * 0.62, -bodyH * 1.35, bodyW * 1.24, bodyH * 1.15);
      ctx.restore();
    }

    ctx.fillStyle = 'rgba(15,20,38,0.85)';
    ctx.beginPath();
    ctx.moveTo(-bodyW * 0.5, 0);
    ctx.lineTo(-bodyW * 0.32, -bodyH * 0.9);
    ctx.lineTo(bodyW * 0.26, -bodyH * 0.9);
    ctx.lineTo(bodyW * 0.5, 0);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(-bodyW * 0.22, -bodyH * 0.8, bodyW * 0.34, bodyH * 0.28);

    const tailGlow = 0.35 + beatAmt * 0.6 + pAmt * 0.25;
    ctx.shadowColor = `rgba(255,62,162,${tailGlow})`;
    ctx.shadowBlur = 18 + beatAmt * 10 + pAmt * 10;
    ctx.fillStyle = 'rgba(255,62,162,0.9)';
    ctx.fillRect(-bodyW * 0.36, -bodyH * 0.25, bodyW * 0.12, bodyH * 0.15);
    ctx.fillRect(bodyW * 0.24, -bodyH * 0.25, bodyW * 0.12, bodyH * 0.15);

    // Lightbar (special moment)
    if (pAmt > 0) {
      const cA = flip ? 'rgba(90,170,255,1)' : 'rgba(255,70,120,1)';
      const cB = flip ? 'rgba(255,70,120,1)' : 'rgba(90,170,255,1)';
      const a = pAmt * (0.55 + 0.35 * (police?.strobe || 0));

      ctx.shadowBlur = 14 + 10 * pAmt;
      ctx.shadowColor = cA;
      ctx.fillStyle = cA.replace(',1)', `,${a.toFixed(3)})`);
      ctx.fillRect(-bodyW * 0.1, -bodyH * 1.05, bodyW * 0.095, bodyH * 0.15);

      ctx.shadowColor = cB;
      ctx.fillStyle = cB.replace(',1)', `,${a.toFixed(3)})`);
      ctx.fillRect(bodyW * 0.005, -bodyH * 1.05, bodyW * 0.095, bodyH * 0.15);
    }

    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(108,242,255,0.15)';
    ctx.beginPath();
    ctx.moveTo(-bodyW * 0.18, -bodyH * 0.95);
    ctx.lineTo(0, -bodyH * 1.35);
    ctx.lineTo(bodyW * 0.18, -bodyH * 0.95);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  function drawHUD(ctx, beatAmt) {
    const size = Math.max(10, Math.floor(h / 42));
    const lineH = Math.floor(size * 1.25);
    const x = w * 0.055;
    const y = h * 0.84;
    const pad = Math.floor(size * 0.8);
    const boxW = Math.min(w * 0.24, pad * 2 + size * 15);
    const boxH = pad * 2 + lineH * 4;

    const drive = 0.5 + 0.5 * Math.sin(t * 0.35);
    const speed = Math.max(0, Math.round(72 + drive * 88 + beatAmt * 16));
    const gear = Math.max(1, Math.min(6, 1 + ((speed / 34) | 0)));
    const rpm = Math.max(900, Math.min(8200, Math.round(1300 + speed * 42 + 220 * Math.sin(t * 1.15) + beatAmt * 420)));

    const FLAVOR = [
      'NIGHT CRUISE',
      'SYNTH DRIVE',
      'AUTOPILOT',
      'NEON RUN',
      'GRID LOCK',
      'TURBO READY',
      'AUX LINK OK',
      'RADAR CLEAR',
      'BASSLINE +',
      'SIGNAL STABLE',
    ];

    const bucket = (t / 12) | 0;
    const key = (Math.imul(seedInt ^ 0x51d7348d, 1664525) + bucket) | 0;
    const flavor = FLAVOR[(hashUnit32(key) * FLAVOR.length) | 0];

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';

    ctx.fillStyle = 'rgba(5, 6, 18, 0.55)';
    ctx.strokeStyle = `rgba(108,242,255,${0.22 + beatAmt * 0.25})`;
    ctx.lineWidth = Math.max(1, Math.floor(h / 720));
    ctx.shadowColor = `rgba(108,242,255,${0.18 + beatAmt * 0.22})`;
    ctx.shadowBlur = 10 + beatAmt * 8;

    ctx.fillRect(x, y, boxW, boxH);
    ctx.shadowBlur = 0;
    ctx.strokeRect(x + 0.5, y + 0.5, boxW - 1, boxH - 1);

    ctx.font = `${size}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'top';

    ctx.fillStyle = 'rgba(90,245,255,0.9)';
    ctx.fillText(`SPEED ${String(speed).padStart(3, '0')}`, x + pad, y + pad + 0 * lineH);

    ctx.fillStyle = 'rgba(255,120,210,0.9)';
    ctx.fillText(`GEAR  ${gear}`, x + pad, y + pad + 1 * lineH);

    ctx.fillStyle = 'rgba(255,220,140,0.9)';
    ctx.fillText(`RPM   ${String(rpm).padStart(4, '0')}`, x + pad, y + pad + 2 * lineH);

    ctx.fillStyle = 'rgba(255,86,221,0.85)';
    ctx.fillText(flavor, x + pad, y + pad + 3 * lineH);

    ctx.restore();
  }

  function drawTitle(ctx, beatAmt) {
    const size = Math.floor(h / 20);
    const baseX = w * 0.055;
    const baseY = h * 0.2;
    const msgA = 'CH 01';
    const msgB = 'SYNTHWAVE DRIVE';

    const glitchOn = titleGlitch > 0;
    const timeBucket = glitchOn ? ((t * 60) | 0) : 0;

    // Deterministic jitter (don’t advance the channel RNG each frame).
    // Bucketed by time so captures at different FPS match for the same t.
    const jitterX = glitchOn ? (hashUnit32(seedInt ^ timeBucket) - 0.5) * 9 : 0;
    const jitterY = glitchOn ? (hashUnit32(seedInt ^ (timeBucket + 1)) - 0.5) * 5 : 0;

    ctx.save();
    ctx.textBaseline = 'middle';

    ctx.font = `${Math.floor(size * 0.9)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = 'rgba(255,120,210,0.95)';
    ctx.shadowColor = 'rgba(255,70,205,0.75)';
    ctx.shadowBlur = 12 + beatAmt * 10;
    ctx.fillText(msgA, baseX + jitterX, baseY + jitterY);

    const tagW = ctx.measureText(msgA).width + 18;

    ctx.font = `${size}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = 'rgba(255,86,221,0.92)';
    ctx.shadowBlur = 18 + beatAmt * 14;
    ctx.fillText(msgB, baseX + tagW + 10 + jitterX, baseY + jitterY);

    if (titleGlitch > 0) {
      const ghostA = 0.2 + titleGlitch * 0.25;
      ctx.fillStyle = `rgba(90,245,255,${ghostA})`;
      ctx.shadowBlur = 0;
      ctx.fillText(msgA, baseX + 2 + jitterX * 1.3, baseY - 1 + jitterY);
      ctx.fillText(msgB, baseX + tagW + 13 + jitterX * 1.3, baseY - 1 + jitterY);
    }

    ctx.restore();
  }

  function drawEventLabel(ctx, police) {
    if (!police || police.amt <= 0) return;

    const amt = police.amt;
    const flip = police.flip;
    const label = 'EVENT: POLICE LIGHTS';

    const size = Math.max(10, Math.floor(h / 34));
    const pad = Math.floor(size * 0.8);
    const y = h * 0.11;

    ctx.save();
    ctx.font = `${size}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    const tw = ctx.measureText(label).width;
    const boxW = tw + pad * 2;
    const boxH = Math.floor(size * 1.5);
    const x = w - boxW - w * 0.055;

    const border = flip ? 'rgba(90,170,255,0.9)' : 'rgba(255,70,120,0.9)';

    ctx.globalAlpha = 0.85 + 0.15 * amt;
    ctx.fillStyle = 'rgba(5, 6, 18, 0.55)';
    ctx.strokeStyle = border;
    ctx.lineWidth = Math.max(1, Math.floor(h / 720));

    ctx.fillRect(x, y, boxW, boxH);
    ctx.strokeRect(x + 0.5, y + 0.5, boxW - 1, boxH - 1);

    ctx.textBaseline = 'middle';
    ctx.fillStyle = flip ? 'rgba(120,210,255,0.95)' : 'rgba(255,120,210,0.95)';
    ctx.shadowColor = border;
    ctx.shadowBlur = 10 + 10 * amt;
    ctx.fillText(label, x + pad, y + boxH * 0.52);

    ctx.restore();
  }

  function render(ctx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    ensureLayers(ctx);

    const beatAmt = Math.max(0, Math.min(1, beatPulse));
    const horizon = h * 0.53;
    const police = getPoliceState();

    drawSky(ctx, horizon, beatAmt);
    drawSun(ctx, horizon, beatAmt);

    const farDrift = Math.sin(t * 0.06) * w * 0.006;
    const nearDrift = Math.sin(t * 0.09) * w * 0.01;
    drawSkylineLayer(ctx, skylineFar, horizon, farDrift, 'rgba(16,20,42,0.95)', 'rgba(130,235,255,ALPHA)', beatAmt * 0.7);
    drawSkylineLayer(ctx, skylineNear, horizon + h * 0.01, nearDrift, 'rgba(10,13,30,0.98)', 'rgba(255,70,210,ALPHA)', beatAmt);

    drawGrid(ctx, horizon, beatAmt, police);
    drawCar(ctx, horizon, beatAmt, police);

    drawForegroundSilhouette(ctx, horizon, beatAmt);

    // Keep HUD readable: apply police sweep before UI text.
    drawPoliceSweep(ctx, horizon, police);

    drawHUD(ctx, beatAmt);
    drawTitle(ctx, beatAmt);
    drawEventLabel(ctx, police);

    if (flash > 0) {
      ctx.fillStyle = `rgba(255, 170, 230, ${flash * 0.15})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  function init({ width, height }) {
    sceneInit(width, height);
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
