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

  // palette
  const hotHue = 18 + rand() * 18; // orange
  const steelHue = 205 + rand() * 18; // blue-ish steel
  const brickHue = 18 + rand() * 10;

  // gradient cache (rebuild on resize or ctx swap)
  let gradientsDirty = true;
  let cachedCtx = null;
  let bgGradient = null;
  let vignetteGradient = null;
  let anvilHighlightGradient = null;
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

  function pick(arr) {
    return arr[(rand() * arr.length) | 0];
  }

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

    // “metal hit”
    audio.beep({
      freq: perfect ? 380 : 260,
      dur: 0.06,
      gain: perfect ? 0.03 : 0.022,
      type: perfect ? 'square' : 'triangle',
    });

    if (perfect) {
      // “ring” (two quick overtones)
      audio.beep({ freq: 640, dur: 0.11, gain: 0.018, type: 'sine' });
      audio.beep({ freq: 960, dur: 0.095, gain: 0.012, type: 'triangle' });
    }
  }

  function quench() {
    const qx = cx + 210 * s;
    const qy = cy + 150 * s;
    for (let i = 0; i < 14; i++) spawnSteam(qx, qy);
    strikeGlow = Math.max(strikeGlow, 0.55);

    if (!audio.enabled) return;
    audio.beep({ freq: 160, dur: 0.08, gain: 0.014, type: 'sine' });
    audio.beep({ freq: 220, dur: 0.06, gain: 0.012, type: 'triangle' });
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
    const ox = (t * 9) % (bw * 2);

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

    for (let i = 0; i < 7; i++) {
      const px = fx + fw * (0.25 + 0.5 * rand());
      const py = fy + fh * (0.42 + 0.25 * rand());
      const r = (16 + rand() * 28) * s * (0.7 + k);
      ctx.beginPath();
      ctx.ellipse(px, py, r * 0.7, r * (1.1 + 0.4 * k), 0.3 + 0.2 * Math.sin(t * 2 + i), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawAnvil(ctx) {
    const ax = cx + 70 * s;
    const ay = cy + 110 * s;

    // shadow
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.beginPath();
    ctx.ellipse(ax + 10 * s, ay + 55 * s, 220 * s, 48 * s, 0, 0, Math.PI * 2);
    ctx.fill();

    // body
    const steel = (l) => `hsl(${steelHue}, 18%, ${l}%)`;
    ctx.fillStyle = steel(22);
    ctx.beginPath();
    ctx.moveTo(ax - 220 * s, ay - 10 * s);
    ctx.lineTo(ax - 120 * s, ay - 60 * s);
    ctx.lineTo(ax + 140 * s, ay - 60 * s);
    ctx.lineTo(ax + 210 * s, ay - 30 * s);
    ctx.lineTo(ax + 120 * s, ay - 10 * s);
    ctx.lineTo(ax + 90 * s, ay + 40 * s);
    ctx.lineTo(ax - 70 * s, ay + 40 * s);
    ctx.closePath();
    ctx.fill();

    // stand
    ctx.fillStyle = steel(16);
    ctx.fillRect(ax - 90 * s, ay + 40 * s, 170 * s, 95 * s);

    // highlight
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.22 + strikeGlow * 0.2 + ringFlash * 0.25;
    ctx.fillStyle = anvilHighlightGradient;
    ctx.fillRect(ax - 260 * s, ay - 110 * s, 520 * s, 260 * s);
    ctx.restore();

    // hot bar on anvil
    ctx.save();
    const heat = forgeHeat;
    ctx.globalAlpha = 0.18 + heat * 0.55;
    ctx.fillStyle = `hsla(${hotHue}, 95%, ${55 + heat * 10}%, 1)`;
    ctx.fillRect(ax - 40 * s, ay - 72 * s, 160 * s, 18 * s);
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

    ctx.restore();
  }

  function draw(ctx) {
    ensureGradients(ctx);

    // background gradient (cached)
    ctx.fillStyle = bgGradient;
    ctx.fillRect(0, 0, w, h);

    drawBricks(ctx);

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
