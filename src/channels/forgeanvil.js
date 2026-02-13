// REVIEWED: 2026-02-13

import { mulberry32 } from '../util/prng.js';
import { simpleDrone } from '../util/audio.js';

function roundRect(ctx, x, y, w, h, r) {
  const rr = Math.max(0, Math.min(r, w * 0.5, h * 0.5));
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

export function createChannel({ seed, audio }) {
  const rand = mulberry32(seed);

  let w = 0;
  let h = 0;
  let t = 0;

  const bpm = 84 + ((rand() * 22) | 0);
  const beatPeriod = 60 / bpm;
  let beatIndex = -1;

  const cycleBeats = 32;
  let perfectBeat = 16;

  // animation state
  let forgeHeat = 0.3;
  let hammerSwing = 0;
  let strikeGlow = 0;

  let ringFlash = 0;
  let ringWave = 0;

  // layout
  let cx = 0;
  let cy = 0;
  let s = 1;
  let floorY = 0;

  // particles (sparks)
  const MAX_SPARKS = 140;
  const sparks = Array.from({ length: MAX_SPARKS }, () => ({
    a: 0,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 0,
    hue: 28,
  }));

  // steam puffs (quench)
  const MAX_STEAM = 24;
  const steam = Array.from({ length: MAX_STEAM }, () => ({
    a: 0,
    x: 0,
    y: 0,
    vx: 0,
    vy: 0,
    life: 0,
  }));

  // flame tongues (precomputed so drawForge() doesn't consume rand() each frame)
  const FLAME_TONGUES = 7;
  let flameTongues = new Array(FLAME_TONGUES).fill(null);

  function reseedFlameTongues() {
    for (let i = 0; i < FLAME_TONGUES; i++) {
      flameTongues[i] = {
        u: 0.25 + 0.5 * rand(),
        v: 0.42 + 0.25 * rand(),
        r: 16 + rand() * 28,
        phase: rand() * Math.PI * 2,
        wobble: 10 + rand() * 18,
        squish: 0.9 + rand() * 0.35,
      };
    }
  }

  // palette
  const hotHue = 18 + rand() * 18; // orange
  const steelHue = 205 + rand() * 18; // blue-ish steel
  const brickHue = 18 + rand() * 10;

  // keep the brick pattern stable (no wall movement)
  const brickPhase = rand();

  // gradient cache (rebuild on resize or ctx swap)
  let gradientsDirty = true;
  let cachedCtx = null;
  let bgGradient = null;
  let vignetteGradient = null;
  let anvilHighlightGradient = null;
  let floorGradient = null;
  let floorGlowGradient = null;
  const FORGE_GRAD_STEPS = 20;
  let forgeOpeningGradients = null;

  function rebuildGradients(ctx) {
    // background gradient
    bgGradient = ctx.createLinearGradient(0, 0, 0, h);
    bgGradient.addColorStop(0, `hsl(${brickHue}, 26%, 6%)`);
    bgGradient.addColorStop(0.55, `hsl(${brickHue}, 20%, 4%)`);
    bgGradient.addColorStop(1, `hsl(${brickHue}, 22%, 3%)`);

    // subtle vignette
    vignetteGradient = ctx.createRadialGradient(
      cx,
      cy,
      Math.min(w, h) * 0.1,
      cx,
      cy,
      Math.max(w, h) * 0.8
    );
    vignetteGradient.addColorStop(0, 'rgba(0,0,0,0)');
    vignetteGradient.addColorStop(1, 'rgba(0,0,0,0.55)');

    // floor gradient + glow (alpha is controlled by globalAlpha at draw-time)
    {
      floorGradient = ctx.createLinearGradient(0, floorY, 0, h);
      floorGradient.addColorStop(0, `hsl(${brickHue}, 16%, 6%)`);
      floorGradient.addColorStop(1, `hsl(${brickHue}, 14%, 3%)`);

      const gx = cx - 280 * s;
      const gy = floorY + 10 * s;
      floorGlowGradient = ctx.createRadialGradient(gx, gy, 10 * s, gx, gy, 560 * s);
      floorGlowGradient.addColorStop(0, `hsla(${hotHue}, 95%, 55%, 1)`);
      floorGlowGradient.addColorStop(1, 'rgba(0,0,0,0)');
    }

    // anvil highlight gradient (alpha is controlled by globalAlpha at draw-time)
    {
      const ax = cx + 70 * s;
      const ay = cy + 110 * s;
      anvilHighlightGradient = ctx.createLinearGradient(ax - 240 * s, ay - 80 * s, ax + 220 * s, ay + 140 * s);
      anvilHighlightGradient.addColorStop(0, 'rgba(255,255,255,0)');
      anvilHighlightGradient.addColorStop(0.55, `hsla(${hotHue + 18}, 95%, 70%, 0.55)`);
      anvilHighlightGradient.addColorStop(1, 'rgba(255,255,255,0)');
    }

    // forge opening gradient buckets (quantized by forgeHeat)
    {
      const fx = cx - 280 * s;
      const fy = cy - 80 * s;
      const fw = 240 * s;
      const fh = 220 * s;
      const ox = fx + fw * 0.52;
      const oy = fy + fh * 0.72;
      const innerR = 10 * s;
      const outerR = fw * 0.75;

      forgeOpeningGradients = new Array(FORGE_GRAD_STEPS + 1);
      for (let i = 0; i <= FORGE_GRAD_STEPS; i++) {
        const heat = i / FORGE_GRAD_STEPS;
        const g = ctx.createRadialGradient(ox, oy, innerR, ox, oy, outerR);
        g.addColorStop(0, `hsla(${hotHue}, 95%, ${56 + heat * 12}%, ${0.95})`);
        g.addColorStop(0.35, `hsla(${hotHue + 10}, 95%, ${40 + heat * 8}%, ${0.55})`);
        g.addColorStop(1, 'rgba(0,0,0,0)');
        forgeOpeningGradients[i] = g;
      }
    }
  }

  function ensureGradients(ctx) {
    if (!gradientsDirty && cachedCtx === ctx) return;
    cachedCtx = ctx;
    gradientsDirty = false;
    rebuildGradients(ctx);
  }

  // audio
  let drone = null;
  let roomNoise = null;
  let musicHandle = null;

  // one-shot SFX handles (stop previous to avoid runaway stacking)
  let quenchHiss = null;

  function stopQuenchHiss() {
    try { quenchHiss?.stop?.(); } catch {}
    quenchHiss = null;
  }

  function noiseBurst({ dur = 0.08, gain = 0.02, hp = 400, bp = 1800, q = 0.8 } = {}) {
    const ctx = audio.ensure();
    const len = Math.max(1, Math.floor(ctx.sampleRate * dur));
    const buffer = ctx.createBuffer(1, len, ctx.sampleRate);
    const out = buffer.getChannelData(0);
    for (let i = 0; i < len; i++) {
      const u = i / len;
      const env = (1 - u) * (1 - u);
      out[i] = (Math.random() * 2 - 1) * env;
    }

    const src = ctx.createBufferSource();
    src.buffer = buffer;

    const hpF = ctx.createBiquadFilter();
    hpF.type = 'highpass';
    hpF.frequency.value = hp;

    const bpF = ctx.createBiquadFilter();
    bpF.type = 'bandpass';
    bpF.frequency.value = bp;
    bpF.Q.value = q;

    const g = ctx.createGain();
    g.gain.value = 0;

    src.connect(hpF);
    hpF.connect(bpF);
    bpF.connect(g);
    g.connect(audio.master);

    const t0 = ctx.currentTime;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.004);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);

    src.start();
    src.stop(t0 + dur + 0.02);

    return {
      stop() {
        try { src.stop(); } catch {}
      },
    };
  }

  function pick(arr) {
    return arr[(rand() * arr.length) | 0];
  }

  // ---- "shop talk" captions (seeded, 5+ minutes before repeating)
  // Use a dedicated RNG so caption variety doesn't perturb scene randomness.
  const talkRand = mulberry32((seed ^ 0x9e3779b9) >>> 0);

  function shuffleInPlace(arr, rng) {
    for (let i = arr.length - 1; i > 0; i--) {
      const j = (rng() * (i + 1)) | 0;
      const tmp = arr[i];
      arr[i] = arr[j];
      arr[j] = tmp;
    }
    return arr;
  }

  const SHOP_TALK_LINES = [
    'HEAT UP. STRIKE TRUE.',
    'MIND THE TONGS — HOT EDGE.',
    'THE ANVIL REMEMBERS.',
    'TEMPER, DON\'T PANIC.',
    'HAMMER FACE FLAT. EGO FLATTER.',
    'ONE MORE HEAT, THEN QUENCH.',
    'SCALE\'S JUST FREE TEXTURE.',
    'LISTEN: THE RING TELLS YOU.',
    'THE STEEL\'S TALKING. HEAR IT.',
    'KEEP THE RHYTHM. KEEP THE HEAT.',
    'BRIGHT ORANGE = MOVE FAST.',
    'DULL RED = YOU\'RE LATE.',
    'QUENCH LIGHTLY. DON\'T SHOCK IT.',
    'OIL\'S FOR BLADES. WATER\'S FOR REGRET.',
    'THE FORGE IS HUNGRY.',
    'BLOW THE BELLOWS LIKE YOU MEAN IT.',
    'HIT IT WHERE IT WANTS TO GO.',
    'DON\'T CHASE THE SPARKS.',
    'MORE HEAT, LESS DRAMA.',
    'GRIND LATER. FORGE NOW.',
    'IF IT\'S CRACKING, YOU\'RE RUSHING.',
    'HARDEN, THEN TEMPER.',
    'BRUSH THE SCALE. SAVE THE EDGE.',
    'RIVET DAY IS A GOOD DAY.',
    'MEASURE TWICE. FORGE ONCE.',
    'COLD WORK IS JUST HAMMERING A ROCK.',
    'HOLD THE LINE. HOLD THE TANG.',
    'A CLEAN STRIKE IS A KIND STRIKE.',
    'KEEP YOUR WRIST LOOSE.',
    'SPARKS ARE JUST STEEL APOLOGIZING.',
    'YES, IT\'S SUPPOSED TO BE LOUD.',
    'NO, YOU CAN\'T WELD IT WITH HOPE.',
    'THE FIRE\'S RIGHT. YOUR TIMING\'S NOT.',
    'DON\'T QUENCH THE ANVIL. EVER.',
    'WHEN IN DOUBT: NORMALIZE.',
    'HIT, TURN, HIT, TURN.',
    'HOTTER THAN IT LOOKS.',
    'IT\'LL STRAIGHTEN UP. EVENTUALLY.',
    'THE HAMMER SWINGS. THE SHOP LISTENS.',
    'SAVE YOUR ARM: LET THE MASS WORK.',
    'SLOW IS SMOOTH. SMOOTH IS FAST.',
    'STOP STARING. START STRIKING.',
  ];

  const shopTalk = shuffleInPlace([...SHOP_TALK_LINES], talkRand);
  // 42 lines * 9s = 378s (~6.3min) between repeats.
  const shopTalkPeriod = 9.0;
  const shopTalkPhase = talkRand() * shopTalkPeriod;

  function resetCycle() {
    // choose a “perfect ring” beat inside the hammer phase (even beats, deterministic)
    perfectBeat = 8 + 2 * (((rand() * 8) | 0) % 8); // {8,10,...,22}
  }

  function onResize(width, height) {
    w = width;
    h = height;
    cx = w * 0.5;
    cy = h * 0.55;
    s = Math.min(w, h) / 900;
    floorY = Math.min(h - 120 * s, cy + 205 * s);

    // clear particles
    for (const sp of sparks) sp.a = 0;
    for (const st of steam) st.a = 0;

    t = 0;
    beatIndex = -1;
    forgeHeat = 0.32;
    hammerSwing = 0;
    strikeGlow = 0;
    ringFlash = 0;
    ringWave = 0;
    resetCycle();
    reseedFlameTongues();

    gradientsDirty = true;
    cachedCtx = null;
  }

  function onAudioOn() {
    if (!audio.enabled) return;
    drone = simpleDrone(audio, { root: 55, detune: 1.1, gain: 0.05 });
    roomNoise = audio.noiseSource({ type: pick(['brown', 'pink']), gain: 0.01 });
    roomNoise.start();
    musicHandle = {
      stop() {
        try { drone?.stop?.(); } catch {}
        try { roomNoise?.stop?.(); } catch {}
      },
    };
    audio.setCurrent(musicHandle);
  }

  function onAudioOff() {
    try { musicHandle?.stop?.(); } catch {}
    stopQuenchHiss();
    drone = null;
    roomNoise = null;
    musicHandle = null;
  }

  function destroy() {
    onAudioOff();
  }

  function spawnSparks(x, y, n, heat) {
    for (let i = 0; i < n; i++) {
      const sp = sparks[(rand() * sparks.length) | 0];
      sp.a = 1;
      sp.x = x + (rand() * 10 - 5) * s;
      sp.y = y + (rand() * 10 - 5) * s;
      const ang = (-Math.PI / 2) + (rand() * 1.2 - 0.6);
      const v = (260 + rand() * 520) * s;
      sp.vx = Math.cos(ang) * v;
      sp.vy = Math.sin(ang) * v;
      sp.life = 0.35 + rand() * 0.55;
      sp.hue = hotHue + 8 + rand() * 18 + heat * 14;
    }
  }

  function spawnSteam(x, y) {
    for (let i = 0; i < steam.length; i++) {
      const st = steam[i];
      if (st.a > 0) continue;
      st.a = 1;
      st.x = x + (rand() * 26 - 13) * s;
      st.y = y + (rand() * 16 - 8) * s;
      st.vx = (rand() * 40 - 20) * s;
      st.vy = (-90 - rand() * 120) * s;
      st.life = 0.9 + rand() * 0.7;
    }
  }

  function strike({ perfect = false } = {}) {
    hammerSwing = 1;
    strikeGlow = 1;
    const hx = cx + 120 * s;
    const hy = cy + 90 * s;
    spawnSparks(hx, hy, perfect ? 28 : 18, forgeHeat);

    // quench steam gets triggered later; but perfect strike adds a little puff
    if (perfect) {
      for (let k = 0; k < 6; k++) spawnSteam(hx + (rand() * 30 - 15) * s, hy);
      ringFlash = 1;
      ringWave = 1;
    }

    if (!audio.enabled) return;

    // "metal hit" = noisy transient + short tone body (less "beep-y")
    noiseBurst({
      dur: 0.05,
      gain: perfect ? 0.016 : 0.013,
      hp: 520,
      bp: perfect ? 2100 : 1700,
      q: 0.9,
    });

    audio.beep({
      freq: perfect ? 340 : 240,
      dur: 0.075,
      gain: perfect ? 0.018 : 0.014,
      type: 'triangle',
    });

    if (perfect) {
      // "ring" (two quick overtones)
      audio.beep({ freq: 640, dur: 0.11, gain: 0.016, type: 'sine' });
      audio.beep({ freq: 960, dur: 0.095, gain: 0.011, type: 'triangle' });
    }
  }

  function quench() {
    const qx = cx + 210 * s;
    const qy = cy + 150 * s;
    for (let i = 0; i < 14; i++) spawnSteam(qx, qy);
    strikeGlow = Math.max(strikeGlow, 0.55);

    if (!audio.enabled) return;

    stopQuenchHiss();
    quenchHiss = noiseBurst({ dur: 0.22, gain: 0.022, hp: 650, bp: 2400, q: 0.7 });

    // a low "plunge" thump under the hiss
    audio.beep({ freq: 120, dur: 0.09, gain: 0.01, type: 'sine' });
  }

  function update(dt) {
    t += dt;

    hammerSwing = Math.max(0, hammerSwing - dt * 5.5);
    strikeGlow = Math.max(0, strikeGlow - dt * 2.7);
    ringFlash = Math.max(0, ringFlash - dt * 2.4);
    ringWave = Math.max(0, ringWave - dt * 1.8);

    // beats
    const idx = Math.floor(t / beatPeriod);
    if (idx !== beatIndex) {
      const prev = beatIndex;
      beatIndex = idx;

      // cycle boundary
      if (prev >= 0 && (beatIndex % cycleBeats) === 0) resetCycle();

      const b = beatIndex % cycleBeats;
      const inHeat = b >= 0 && b <= 7;
      const inHammer = b >= 8 && b <= 23;
      const inQuench = b >= 24 && b <= 27;
      // polish: 28..31

      if (inHammer && (beatIndex % 2 === 0)) {
        strike({ perfect: b === perfectBeat });
      }

      if (inQuench && b === 24) {
        quench();
      }

      // tiny “stoke” pulse while heating
      if (inHeat && (beatIndex % 2 === 0)) {
        forgeHeat = Math.min(1, forgeHeat + 0.06);
      }
    }

    // phase targets
    const b = ((beatIndex < 0 ? 0 : beatIndex) % cycleBeats);
    let targetHeat = 0.35;
    if (b <= 7) targetHeat = 0.95;
    else if (b <= 23) targetHeat = 0.78;
    else if (b <= 27) targetHeat = 0.45;
    else targetHeat = 0.55;

    forgeHeat += (targetHeat - forgeHeat) * (1 - Math.exp(-dt * 2.0));

    // particles
    for (const sp of sparks) {
      if (sp.a <= 0) continue;
      sp.life -= dt;
      sp.vy += 980 * s * dt;
      sp.x += sp.vx * dt;
      sp.y += sp.vy * dt;
      sp.vx *= Math.pow(0.3, dt);
      sp.vy *= Math.pow(0.55, dt);
      if (sp.life <= 0) sp.a = 0;
    }

    for (const st of steam) {
      if (st.a <= 0) continue;
      st.life -= dt;
      st.x += st.vx * dt;
      st.y += st.vy * dt;
      st.vx *= Math.pow(0.25, dt);
      st.vy *= Math.pow(0.5, dt);
      if (st.life <= 0) st.a = 0;
    }
  }

  function drawBricks(ctx) {
    ctx.save();
    ctx.globalAlpha = 0.26;

    const bw = 120 * s;
    const bh = 54 * s;
    const ox = brickPhase * (bw * 2);

    for (let y = 0; y < h + bh; y += bh) {
      const odd = ((y / bh) | 0) % 2;
      for (let x = -bw * 2; x < w + bw * 2; x += bw) {
        const xx = x + (odd ? bw * 0.5 : 0) - ox;
        const warm = forgeHeat * 0.55;
        ctx.fillStyle = `hsl(${brickHue}, ${32 + warm * 20}%, ${12 + warm * 10}%)`;
        ctx.fillRect(xx + 2 * s, y + 2 * s, bw - 6 * s, bh - 6 * s);
      }
    }

    ctx.restore();
  }

  function drawFloor(ctx) {
    if (floorY <= 0 || floorY >= h) return;

    ctx.save();
    ctx.fillStyle = floorGradient;
    ctx.fillRect(0, floorY, w, h - floorY);

    // floor edge (anchors objects; avoids "floating" look)
    ctx.globalAlpha = 0.45;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0, floorY - 2 * s, w, 4 * s);

    // subtle seams
    ctx.globalAlpha = 0.10;
    ctx.strokeStyle = `hsla(${brickHue}, 22%, ${10 + forgeHeat * 8}%, 1)`;
    ctx.lineWidth = 1.4 * s;
    const lines = 7;
    for (let i = 1; i <= lines; i++) {
      const x0 = (w * i) / (lines + 1);
      ctx.beginPath();
      ctx.moveTo(x0, floorY);
      ctx.lineTo(x0 + (x0 - cx) * 0.06, h);
      ctx.stroke();
    }

    ctx.restore();

    // warm glow near the forge
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.08 + forgeHeat * 0.18;
    ctx.fillStyle = floorGlowGradient;
    ctx.fillRect(0, floorY, w, h - floorY);
    ctx.restore();
  }

  function drawWorkshopPropsMidground(ctx) {
    // Midground props for depth: a quench bucket + faint wall tools.
    // Keep OSD clear (top-left) by staying below the HUD region.

    const parX = Math.sin(t * 0.55) * 4 * s;
    const parY = Math.cos(t * 0.42) * 2 * s;

    // --- Quench bucket (near the steam origin)
    {
      const bw = 96 * s;
      const bh = 104 * s;
      const bxTarget = cx + 340 * s + parX;
      const bx = Math.max(bw * 0.5 + 18 * s, Math.min(w - bw * 0.5 - 18 * s, bxTarget));
      const by = floorY - 6 * s + parY;

      // shadow
      ctx.save();
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = 'rgba(0,0,0,0.6)';
      ctx.beginPath();
      ctx.ellipse(bx + 8 * s, by + 10 * s, bw * 0.62, bw * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // body
      const steel = (l) => `hsl(${steelHue}, 14%, ${l}%)`;
      ctx.save();
      ctx.fillStyle = steel(10);
      roundRect(ctx, bx - bw * 0.5, by - bh, bw, bh, 14 * s);
      ctx.fill();

      // rim
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = steel(16);
      ctx.beginPath();
      ctx.ellipse(bx, by - bh + 10 * s, bw * 0.52, bw * 0.18, 0, 0, Math.PI * 2);
      ctx.fill();

      // inner opening
      ctx.globalAlpha = 1;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      ctx.beginPath();
      ctx.ellipse(bx, by - bh + 12 * s, bw * 0.42, bw * 0.14, 0, 0, Math.PI * 2);
      ctx.fill();

      // handle
      ctx.globalAlpha = 0.6;
      ctx.strokeStyle = steel(22);
      ctx.lineWidth = 3.2 * s;
      ctx.beginPath();
      ctx.arc(bx, by - bh + 18 * s, bw * 0.55, Math.PI * 1.05, Math.PI * 1.95);
      ctx.stroke();

      // warm glow (forgeHeat + strike moment)
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.06 + forgeHeat * 0.12 + strikeGlow * 0.08;
      ctx.fillStyle = `hsla(${hotHue + 6}, 95%, 58%, 0.9)`;
      ctx.beginPath();
      ctx.ellipse(bx - 10 * s, by - bh + 18 * s, bw * 0.55, bw * 0.22, 0.1, 0, Math.PI * 2);
      ctx.fill();

      ctx.restore();
    }

    // --- Wall tools silhouettes (subtle; adds depth without clutter)
    {
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = `hsl(${steelHue}, 10%, 8%)`;

      const wx = cx + 320 * s + parX * 0.35;
      const wy = cy - 150 * s + parY * 0.25;
      const toolW = 14 * s;
      const toolH = 110 * s;

      // hanging tongs silhouette
      ctx.fillRect(wx, wy, toolW, toolH);
      ctx.beginPath();
      ctx.ellipse(wx + toolW * 0.5, wy + toolH + 10 * s, 28 * s, 14 * s, -0.2, 0, Math.PI * 2);
      ctx.fill();

      // small hammer silhouette
      ctx.fillRect(wx - 60 * s, wy + 30 * s, toolW, toolH * 0.7);
      ctx.fillRect(wx - 86 * s, wy + 24 * s, 52 * s, 22 * s);

      ctx.restore();
    }
  }

  function drawWorkshopPropsForeground(ctx) {
    // Foreground prop: tongs on the floor (adds depth). Keep it low.

    const parX = Math.sin(t * 0.55) * 6 * s;
    const xTarget = cx + 330 * s + parX;
    const x = Math.max(120 * s, Math.min(w - 120 * s, xTarget));
    const y = floorY + 44 * s;

    ctx.save();
    ctx.globalAlpha = 0.78;
    ctx.strokeStyle = `hsl(${steelHue}, 10%, 10%)`;
    ctx.lineWidth = 5.6 * s;
    ctx.lineCap = 'round';

    // two arms
    ctx.beginPath();
    ctx.moveTo(x - 80 * s, y - 10 * s);
    ctx.lineTo(x + 10 * s, y - 32 * s);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x - 80 * s, y + 6 * s);
    ctx.lineTo(x + 10 * s, y - 18 * s);
    ctx.stroke();

    // jaws
    ctx.lineWidth = 6.4 * s;
    ctx.beginPath();
    ctx.moveTo(x + 10 * s, y - 34 * s);
    ctx.lineTo(x + 40 * s, y - 48 * s);
    ctx.stroke();

    ctx.beginPath();
    ctx.moveTo(x + 10 * s, y - 16 * s);
    ctx.lineTo(x + 40 * s, y - 26 * s);
    ctx.stroke();

    // tiny warm specular hint
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.05 + forgeHeat * 0.08;
    ctx.strokeStyle = `hsla(${hotHue + 18}, 95%, 70%, 0.8)`;
    ctx.lineWidth = 2.4 * s;
    ctx.beginPath();
    ctx.moveTo(x - 70 * s, y - 8 * s);
    ctx.lineTo(x - 10 * s, y - 22 * s);
    ctx.stroke();

    ctx.restore();
  }

  function drawForge(ctx) {
    // forge opening + flame
    const fx = cx - 280 * s;
    const fy = cy - 80 * s;
    const fw = 240 * s;
    const fh = 220 * s;

    // body
    ctx.fillStyle = `hsl(${brickHue}, 30%, ${8 + forgeHeat * 8}%)`;
    ctx.fillRect(fx - 20 * s, fy - 40 * s, fw + 40 * s, fh + 70 * s);

    // opening (cached gradients; quantized by forgeHeat)
    const heatIdx = Math.max(0, Math.min(FORGE_GRAD_STEPS, Math.round(forgeHeat * FORGE_GRAD_STEPS)));
    ctx.fillStyle = forgeOpeningGradients[heatIdx];

    roundRect(ctx, fx + 20 * s, fy + 30 * s, fw - 40 * s, fh - 60 * s, 26 * s);
    ctx.fill();

    // flame tongues
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const k = (0.5 + 0.5 * Math.sin(t * 3.3)) * forgeHeat;
    ctx.globalAlpha = 0.35 + k * 0.45;
    ctx.fillStyle = `hsla(${hotHue + 8}, 95%, 62%, 0.9)`;

    for (let i = 0; i < flameTongues.length; i++) {
      const ft = flameTongues[i];
      const wob = (ft.wobble * (0.5 + k)) * s;
      const px = fx + fw * ft.u + Math.sin(t * 2.1 + ft.phase) * wob;
      const py = fy + fh * ft.v + Math.sin(t * 2.7 + ft.phase * 1.3) * wob * 0.6;
      const r = ft.r * s * (0.7 + k) * (0.88 + 0.18 * Math.sin(t * 2.0 + ft.phase));
      ctx.beginPath();
      ctx.ellipse(
        px,
        py,
        r * 0.7,
        r * (1.1 + 0.4 * k) * ft.squish,
        0.3 + 0.2 * Math.sin(t * 2 + i + ft.phase),
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    ctx.restore();
  }

  function drawAnvil(ctx) {
    const ax = cx + 70 * s;
    const ay = cy + 110 * s;

    const steel = (l) => `hsl(${steelHue}, 18%, ${l}%)`;

    // shadow (wider than the stand so the anvil feels heavy)
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(ax + 8 * s, ay + 58 * s, 240 * s, 52 * s, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // --- stand
    ctx.save();
    ctx.fillStyle = steel(14);
    ctx.fillRect(ax - 98 * s, ay + 42 * s, 184 * s, 98 * s);

    // base plate
    ctx.globalAlpha = 0.75;
    ctx.fillStyle = steel(10);
    ctx.fillRect(ax - 120 * s, ay + 132 * s, 230 * s, 18 * s);

    // stand front bevel
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.08;
    ctx.fillStyle = steel(40);
    ctx.fillRect(ax - 98 * s, ay + 42 * s, 184 * s, 16 * s);
    ctx.restore();

    // --- main body silhouette
    ctx.save();
    ctx.fillStyle = steel(20);
    ctx.beginPath();

    // horn
    ctx.moveTo(ax - 250 * s, ay - 18 * s);
    ctx.lineTo(ax - 150 * s, ay - 66 * s);
    ctx.lineTo(ax + 132 * s, ay - 66 * s);

    // heel
    ctx.lineTo(ax + 220 * s, ay - 34 * s);
    ctx.lineTo(ax + 132 * s, ay - 10 * s);

    // waist to stand
    ctx.lineTo(ax + 98 * s, ay + 42 * s);
    ctx.lineTo(ax - 78 * s, ay + 42 * s);

    ctx.closePath();
    ctx.fill();

    // horn tip roundness
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = steel(18);
    ctx.beginPath();
    ctx.ellipse(ax - 246 * s, ay - 20 * s, 22 * s, 12 * s, -0.1, 0, Math.PI * 2);
    ctx.fill();

    // face plate (top) - brighter strip so it reads as steel, not clay
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = steel(28);
    ctx.beginPath();
    ctx.moveTo(ax - 170 * s, ay - 66 * s);
    ctx.lineTo(ax + 128 * s, ay - 66 * s);
    ctx.lineTo(ax + 188 * s, ay - 44 * s);
    ctx.lineTo(ax - 140 * s, ay - 44 * s);
    ctx.closePath();
    ctx.fill();

    // hardy + pritchel holes
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.fillRect(ax + 62 * s, ay - 60 * s, 14 * s, 14 * s);
    ctx.beginPath();
    ctx.ellipse(ax + 30 * s, ay - 54 * s, 6.2 * s, 5.4 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    // underside shading to give mass
    ctx.globalCompositeOperation = 'multiply';
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(ax - 260 * s, ay - 8 * s, 540 * s, 90 * s);

    // crisp outline
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = steel(6);
    ctx.lineWidth = 2.2 * s;
    ctx.lineJoin = 'round';
    ctx.beginPath();
    ctx.moveTo(ax - 250 * s, ay - 18 * s);
    ctx.lineTo(ax - 150 * s, ay - 66 * s);
    ctx.lineTo(ax + 132 * s, ay - 66 * s);
    ctx.lineTo(ax + 220 * s, ay - 34 * s);
    ctx.lineTo(ax + 132 * s, ay - 10 * s);
    ctx.lineTo(ax + 98 * s, ay + 42 * s);
    ctx.lineTo(ax - 78 * s, ay + 42 * s);
    ctx.closePath();
    ctx.stroke();

    // highlight wash (strike moment)
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.22 + strikeGlow * 0.2 + ringFlash * 0.25;
    ctx.fillStyle = anvilHighlightGradient;
    ctx.fillRect(ax - 280 * s, ay - 120 * s, 560 * s, 280 * s);

    // hot bar on anvil (kept subtle; boosted on HEAT)
    const heat = forgeHeat;
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.12 + heat * 0.55;
    ctx.fillStyle = `hsla(${hotHue}, 95%, ${55 + heat * 10}%, 1)`;
    ctx.fillRect(ax - 44 * s, ay - 72 * s, 170 * s, 18 * s);

    ctx.restore();
  }

  function drawHammer(ctx) {
    const baseX = cx + 40 * s;
    const baseY = cy - 20 * s;

    const swing = hammerSwing;
    const ang = -0.9 + (1 - swing) * 0.9;
    const px = baseX + 120 * s;
    const py = baseY + 150 * s;

    ctx.save();
    ctx.translate(px, py);
    ctx.rotate(ang);

    // handle
    ctx.fillStyle = `hsl(${brickHue + 15}, 32%, ${18 + swing * 4}%)`;
    ctx.fillRect(-18 * s, -230 * s, 36 * s, 220 * s);

    // head
    ctx.fillStyle = `hsl(${steelHue}, 18%, ${20 + swing * 6}%)`;
    ctx.fillRect(-70 * s, -270 * s, 140 * s, 56 * s);

    // head highlight
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.18 + strikeGlow * 0.2;
    ctx.fillStyle = `hsla(${hotHue + 20}, 95%, 70%, 0.5)`;
    ctx.fillRect(-70 * s, -270 * s, 140 * s, 20 * s);
    ctx.restore();

    ctx.restore();
  }

  function drawSparks(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    for (const sp of sparks) {
      if (sp.a <= 0) continue;
      const a = Math.min(1, sp.life * 2) * sp.a;
      ctx.strokeStyle = `hsla(${sp.hue}, 95%, 65%, ${0.1 + a * 0.9})`;
      ctx.lineWidth = 2.2 * s;
      ctx.beginPath();
      ctx.moveTo(sp.x, sp.y);
      ctx.lineTo(sp.x - sp.vx * 0.016, sp.y - sp.vy * 0.016);
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawSteam(ctx) {
    ctx.save();
    for (const st of steam) {
      if (st.a <= 0) continue;
      const a = Math.min(1, st.life) * st.a;
      ctx.fillStyle = `rgba(210, 220, 235, ${0.03 + a * 0.13})`;
      const r = (28 + (1 - st.life) * 48) * s;
      ctx.beginPath();
      ctx.ellipse(st.x, st.y, r * 0.9, r * 0.6, 0.2 * Math.sin(t * 2 + r), 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawHUD(ctx) {
    const pad = 28 * s;
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.38)';
    ctx.fillRect(pad, pad, 320 * s, 108 * s);

    ctx.fillStyle = 'rgba(255,255,255,0.78)';
    ctx.font = `${Math.floor(22 * s)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;
    ctx.fillText('FORGE & ANVIL RHYTHM', pad + 16 * s, pad + 34 * s);

    const beat = beatIndex < 0 ? 0 : beatIndex;
    const b = beat % cycleBeats;
    const phase = b <= 7 ? 'HEAT' : b <= 23 ? 'HAMMER' : b <= 27 ? 'QUENCH' : 'POLISH';

    ctx.globalAlpha = 0.86;
    ctx.font = `${Math.floor(18 * s)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;
    ctx.fillText(`BPM ${bpm}  PHASE ${phase}`, pad + 16 * s, pad + 62 * s);

    // heat bar
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255,255,255,0.14)';
    ctx.fillRect(pad + 16 * s, pad + 76 * s, 280 * s, 14 * s);
    ctx.fillStyle = `hsla(${hotHue + 6}, 95%, 60%, ${0.5 + forgeHeat * 0.4})`;
    ctx.fillRect(pad + 16 * s, pad + 76 * s, 280 * s * forgeHeat, 14 * s);

    // "shop talk" caption strip (seeded)
    if (shopTalk.length) {
      const time = t + shopTalkPhase;
      const idx = Math.floor(time / shopTalkPeriod) % shopTalk.length;
      const line = shopTalk[idx];

      const u = (time % shopTalkPeriod) / shopTalkPeriod;
      const fadeIn = 0.12;
      const fadeOut = 0.14;
      const a = u < fadeIn ? u / fadeIn : u > 1 - fadeOut ? (1 - u) / fadeOut : 1;

      const barW = Math.min(w - 2 * pad, 980 * s);
      const barH = 44 * s;
      const x = cx - barW * 0.5;
      const y = Math.max(pad + 140 * s, h - (barH + 92 * s));

      ctx.globalAlpha = 0.55 * a;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      roundRect(ctx, x, y, barW, barH, 12 * s);
      ctx.fill();

      ctx.globalAlpha = 0.86 * a;
      ctx.fillStyle = 'rgba(255,255,255,0.88)';
      ctx.font = `${Math.floor(18 * s)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", "Courier New", monospace`;
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(line, x + barW * 0.5, y + barH * 0.56);
      ctx.textAlign = 'start';
      ctx.textBaseline = 'alphabetic';
    }

    ctx.restore();
  }

  function draw(ctx) {
    ensureGradients(ctx);

    // background gradient (cached)
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, w, h);

    drawBricks(ctx);
    drawFloor(ctx);

    drawWorkshopPropsMidground(ctx);

    // forge glow wash
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.1 + forgeHeat * 0.22;
    ctx.fillStyle = `hsla(${hotHue}, 95%, 55%, 1)`;
    ctx.fillRect(0, h * 0.15, w, h * 0.6);
    ctx.restore();

    drawForge(ctx);
    drawAnvil(ctx);
    drawHammer(ctx);

    drawSparks(ctx);
    drawSteam(ctx);

    drawWorkshopPropsForeground(ctx);

    // ring wave (perfect moment)
    if (ringWave > 0) {
      ctx.save();
      const ax = cx + 110 * s;
      const ay = cy + 90 * s;
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.25 * ringWave;
      ctx.strokeStyle = `hsla(${hotHue + 18}, 95%, 70%, 0.9)`;
      ctx.lineWidth = 3.2 * s;
      const rr = (30 + (1 - ringWave) * 240) * s;
      ctx.beginPath();
      ctx.arc(ax, ay, rr, 0, Math.PI * 2);
      ctx.stroke();
      ctx.restore();
    }

    drawHUD(ctx);

    // subtle vignette (cached)
    ctx.save();
    ctx.fillStyle = vignetteGradient;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  return {
    onResize,
    update,
    draw,
    destroy,
    onAudioOn,
    onAudioOff,
  };
}
