import { mulberry32 } from '../../util/prng.js';

const TAU = Math.PI * 2;

export function createChannel({ seed, audio }) {
  const rand = mulberry32(seed);

  let w = 0;
  let h = 0;
  let t = 0;

  // Globe layout
  let cx = 0;
  let cy = 0;
  let r = 0;

  // Weather sim
  const particles = [];
  const MAX_PARTICLES = 850;

  let centers = []; // pressure centers
  let fronts = []; // warm/cold fronts

  let shakeT = 0;
  let shakeDur = 2.6;
  let nextShakeAt = 18 + rand() * 26;

  let bed = null;

  function rr(a, b) { return a + (b - a) * rand(); }
  function pick(arr) { return arr[(rand() * arr.length) | 0]; }

  function randInUnitDisk() {
    // rejection sampling: fine at init / shake
    for (let k = 0; k < 30; k++) {
      const x = rand() * 2 - 1;
      const y = rand() * 2 - 1;
      if (x * x + y * y <= 1) return { x, y };
    }
    return { x: 0, y: 0 };
  }

  function resetWeather() {
    const nC = 2 + ((rand() * 2) | 0);
    centers = Array.from({ length: nC }, () => {
      const p = randInUnitDisk();
      return {
        x: p.x * 0.65,
        y: p.y * 0.55,
        s: rr(-1, 1) * rr(0.5, 1.1), // signed strength
        drift: rr(0.1, 0.6),
      };
    });

    const nF = 2 + ((rand() * 2) | 0);
    fronts = Array.from({ length: nF }, () => {
      const a0 = rr(0, TAU);
      const rad = rr(0.25, 0.92);
      return {
        a0,
        a1: a0 + rr(0.9, 1.7),
        rad,
        dir: pick([-1, 1]),
        kind: pick(['warm', 'cold']),
        wob: rr(0.6, 1.6),
      };
    });

    // Re-seed particle positions so each shake visibly changes the pattern.
    for (let i = 0; i < particles.length; i++) {
      const p = randInUnitDisk();
      particles[i].x = p.x * 0.95;
      particles[i].y = p.y * 0.95;
      particles[i].vx = rr(-0.05, 0.05);
      particles[i].vy = rr(-0.15, -0.02);
      particles[i].a = rr(0.15, 0.85);
      particles[i].sz = rr(0.7, 2.1);
    }
  }

  function ensureParticles(target) {
    const want = Math.min(MAX_PARTICLES, target | 0);
    while (particles.length < want) {
      const p = randInUnitDisk();
      particles.push({
        x: p.x * 0.95,
        y: p.y * 0.95,
        vx: rr(-0.04, 0.04),
        vy: rr(-0.12, -0.01),
        a: rr(0.12, 0.9),
        sz: rr(0.8, 2.3),
      });
    }
    while (particles.length > want) particles.pop();
  }

  function sceneInit(width, height) {
    w = width;
    h = height;
    t = 0;

    r = Math.min(w, h) * 0.33;
    cx = w * 0.5;
    cy = h * 0.52;

    shakeT = 0;
    shakeDur = 2.4 + rand() * 0.9;
    nextShakeAt = 18 + rand() * 26;

    ensureParticles(540 + rand() * 240);
    resetWeather();
  }

  function onResize(width, height) {
    sceneInit(width, height);
  }

  function startShake() {
    shakeDur = 2.2 + rand() * 1.1;
    shakeT = shakeDur;
    nextShakeAt = t + 45 + rand() * 80;
    resetWeather();

    if (audio.enabled) {
      // little "glass rattle" motif
      audio.beep({ freq: 980, dur: 0.05, gain: 0.03, type: 'triangle' });
      setTimeout(() => { try { audio.enabled && audio.beep({ freq: 620, dur: 0.06, gain: 0.02, type: 'square' }); } catch {} }, 70);
    }
  }

  function onAudioOn() {
    if (!audio.enabled) return;
    const src = audio.noiseSource({ type: 'pink', gain: 0.055 });
    src.start();

    // add a faint sub tone under the noise (keeps it cozy)
    const ctx = audio.ensure();
    const osc = ctx.createOscillator();
    const g = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = 62;
    g.gain.value = 0.02;
    osc.connect(g);
    g.connect(audio.master);
    osc.start();

    bed = {
      stop() {
        try { src.stop(); } catch {}
        try { g.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.08); } catch {}
        try { osc.stop(ctx.currentTime + 0.25); } catch {}
      },
    };

    audio.setCurrent(bed);
  }

  function onAudioOff() {
    try { bed?.stop?.(); } catch {}
    bed = null;
  }

  function destroy() {
    onAudioOff();
  }

  function update(dt) {
    t += dt;

    if (shakeT > 0) shakeT = Math.max(0, shakeT - dt);
    if (shakeT <= 0 && t >= nextShakeAt) startShake();

    const cycle = 480; // 8 minutes
    const u = (t % cycle) / cycle; // 0..1
    const seg = Math.floor(u * 4); // 0..3
    const su = (u * 4) % 1;

    const stormAmt = seg === 2 ? (0.25 + 0.75 * Math.sin(su * Math.PI)) : (seg === 1 ? su * 0.35 : (seg === 3 ? (1 - su) * 0.2 : 0));
    const calmAmt = seg === 0 ? 1 : seg === 3 ? su : 0;

    const shakeAmt = shakeT > 0 ? (shakeT / shakeDur) : 0;

    // Drift pressure centers slowly.
    for (const c of centers) {
      c.x += Math.sin(t * 0.06 + c.drift) * dt * 0.02;
      c.y += Math.cos(t * 0.05 + c.drift * 2) * dt * 0.016;
      c.x = Math.max(-0.72, Math.min(0.72, c.x));
      c.y = Math.max(-0.62, Math.min(0.45, c.y));
    }

    // Move fronts around the globe.
    for (const f of fronts) {
      f.a0 += f.dir * dt * (0.09 + stormAmt * 0.13);
      f.a1 += f.dir * dt * (0.09 + stormAmt * 0.13);
    }

    // Wind field (normalized globe space).
    let wx = 0.06 + Math.sin(t * 0.08) * 0.02;
    let wy = -0.05 + Math.cos(t * 0.07) * 0.015;
    for (const c of centers) {
      const dx = -c.x;
      const dy = -c.y;
      const d2 = dx * dx + dy * dy + 0.06;
      // rotate gradient for a little cyclonic swirl
      wx += (-dy / d2) * c.s * 0.022;
      wy += (dx / d2) * c.s * 0.022;
    }

    const swirl = shakeAmt * 0.35;

    const spawnPerSec = 18 + stormAmt * 42 + shakeAmt * 90;
    const target = 460 + stormAmt * 250 + shakeAmt * 160;
    ensureParticles(target);

    // Update snow.
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];

      const ang = Math.atan2(p.y, p.x);
      const swx = -Math.sin(ang) * swirl;
      const swy = Math.cos(ang) * swirl;

      p.vx += (wx + swx - p.vx) * dt * (0.9 + stormAmt * 0.7);
      p.vy += (wy + swy - p.vy) * dt * (0.7 + stormAmt * 0.6);

      p.x += p.vx * dt;
      p.y += p.vy * dt;

      // gentle buoyancy: calm snow drifts down, storm swirls
      p.y += (0.05 + calmAmt * 0.12 - stormAmt * 0.05) * dt;

      const d2 = p.x * p.x + p.y * p.y;
      if (d2 > 1) {
        // respawn near top rim
        const a = rr(-Math.PI * 0.9, -Math.PI * 0.1);
        const rad = rr(0.75, 0.98);
        p.x = Math.cos(a) * rad;
        p.y = Math.sin(a) * rad;
        p.vx = rr(-0.08, 0.08);
        p.vy = rr(-0.12, -0.02);
        p.a = rr(0.15, 0.85);
        p.sz = rr(0.7, 2.1);
      }
    }

    // Subtle stochastic density changes (deterministic due to PRNG order).
    if (rand() < spawnPerSec * dt * 0.02 && particles.length < MAX_PARTICLES) {
      const p = randInUnitDisk();
      particles.push({ x: p.x * 0.95, y: p.y * 0.95, vx: rr(-0.05, 0.05), vy: rr(-0.12, -0.01), a: rr(0.15, 0.9), sz: rr(0.8, 2.2) });
    }
  }

  function drawDesk(ctx) {
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#081018');
    g.addColorStop(0.5, '#070b12');
    g.addColorStop(1, '#05060a');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // subtle "workbench" band
    const y = h * 0.72;
    const wood = ctx.createLinearGradient(0, y, 0, h);
    wood.addColorStop(0, 'rgba(40,26,18,0.0)');
    wood.addColorStop(0.2, 'rgba(40,26,18,0.45)');
    wood.addColorStop(1, 'rgba(18,10,8,0.75)');
    ctx.fillStyle = wood;
    ctx.fillRect(0, y, w, h - y);

    // lab grid glow (very faint)
    ctx.save();
    ctx.globalAlpha = 0.10;
    ctx.strokeStyle = 'rgba(120,200,255,0.22)';
    ctx.lineWidth = Math.max(1, h / 700);
    const step = Math.max(18, Math.floor(Math.min(w, h) * 0.04));
    const ox = (t * 6) % step;
    for (let x = -step; x < w + step; x += step) {
      ctx.beginPath();
      ctx.moveTo(x + ox, h * 0.06);
      ctx.lineTo(x + ox, h * 0.72);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawInner(ctx, stormAmt, shakeAmt) {
    // sky inside the globe
    const sky = ctx.createLinearGradient(0, -r, 0, r);
    sky.addColorStop(0, '#0b1522');
    sky.addColorStop(0.6, '#0b0f18');
    sky.addColorStop(1, '#07070c');
    ctx.fillStyle = sky;
    ctx.fillRect(-r, -r, r * 2, r * 2);

    // distant glow
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.25 + stormAmt * 0.25;
    ctx.fillStyle = 'rgba(120,220,255,0.18)';
    ctx.beginPath();
    ctx.arc(-r * 0.22, -r * 0.15, r * (0.9 + stormAmt * 0.35), 0, TAU);
    ctx.fill();
    ctx.restore();

    // terrain silhouette
    ctx.save();
    ctx.translate(0, r * 0.38);
    ctx.fillStyle = '#06060a';
    ctx.beginPath();
    ctx.moveTo(-r, r);
    ctx.quadraticCurveTo(-r * 0.55, -r * 0.06, -r * 0.1, r * 0.06);
    ctx.quadraticCurveTo(r * 0.2, -r * 0.12, r * 0.55, r * 0.04);
    ctx.quadraticCurveTo(r * 0.82, -r * 0.03, r, r * 0.12);
    ctx.lineTo(r, r);
    ctx.closePath();
    ctx.fill();

    // tiny cabin light
    ctx.globalAlpha = 0.7;
    ctx.fillStyle = 'rgba(255,210,120,0.65)';
    ctx.fillRect(-r * 0.08, -r * 0.03, r * 0.04, r * 0.03);
    ctx.restore();

    // pressure rings
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.lineWidth = Math.max(1, h / 640);
    for (const c of centers) {
      const px = c.x * r;
      const py = c.y * r;
      const hue = c.s > 0 ? 195 : 22;
      for (let k = 1; k <= 5; k++) {
        const rad = r * (0.12 * k + stormAmt * 0.02);
        const a = (0.11 - k * 0.015) * (0.55 + stormAmt * 0.75);
        ctx.strokeStyle = `hsla(${hue}, 95%, 70%, ${a})`;
        ctx.beginPath();
        ctx.arc(px, py, rad, 0, TAU);
        ctx.stroke();
      }
    }
    ctx.restore();

    // fronts
    ctx.save();
    ctx.lineWidth = Math.max(1, h / 520);
    ctx.globalAlpha = 0.5 + stormAmt * 0.25;
    for (const f of fronts) {
      const hue = f.kind === 'warm' ? 208 : 10;
      ctx.strokeStyle = `hsla(${hue}, 95%, 70%, ${0.35 + stormAmt * 0.25})`;
      ctx.beginPath();
      const a0 = f.a0 + Math.sin(t * 0.25 * f.wob) * 0.08;
      const a1 = f.a1 + Math.cos(t * 0.22 * f.wob) * 0.08;
      ctx.arc(0, 0, f.rad * r, a0, a1);
      ctx.stroke();

      // little markers
      const steps = 6;
      for (let i = 0; i <= steps; i++) {
        const a = a0 + (a1 - a0) * (i / steps);
        const x = Math.cos(a) * f.rad * r;
        const y = Math.sin(a) * f.rad * r;
        ctx.fillStyle = `hsla(${hue}, 95%, 75%, ${0.28 + stormAmt * 0.25})`;
        if (f.kind === 'warm') {
          ctx.beginPath();
          ctx.arc(x, y, Math.max(1.5, r * 0.014), 0, Math.PI);
          ctx.fill();
        } else {
          ctx.beginPath();
          ctx.moveTo(x, y - r * 0.012);
          ctx.lineTo(x - r * 0.01, y + r * 0.012);
          ctx.lineTo(x + r * 0.01, y + r * 0.012);
          ctx.closePath();
          ctx.fill();
        }
      }
    }
    ctx.restore();

    // clouds
    ctx.save();
    ctx.globalAlpha = 0.25 + stormAmt * 0.55;
    ctx.fillStyle = 'rgba(180,220,255,0.18)';
    const n = 5;
    for (let i = 0; i < n; i++) {
      const x = Math.sin(t * (0.08 + i * 0.015) + i) * r * 0.35;
      const y = -r * 0.35 + Math.cos(t * (0.06 + i * 0.02) + i * 2) * r * 0.12;
      const s = (0.18 + i * 0.05) * r * (1 + stormAmt * 0.6);
      ctx.beginPath();
      ctx.ellipse(x, y, s * 1.2, s * 0.8, 0, 0, TAU);
      ctx.fill();
    }
    ctx.restore();

    // snow (foreground inside globe)
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < particles.length; i++) {
      const p = particles[i];
      const px = p.x * r;
      const py = p.y * r;
      const tw = 0.55 + 0.45 * Math.sin(t * 1.4 + p.x * 3 + p.y * 2);
      const a = (0.12 + p.a * 0.75) * (0.55 + stormAmt * 0.7 + shakeAmt * 0.5) * tw;
      ctx.fillStyle = `rgba(245, 250, 255, ${a})`;
      const sz = p.sz * (1 + stormAmt * 0.12 + shakeAmt * 0.18);
      ctx.fillRect(px, py, sz, sz);
    }
    ctx.restore();
  }

  function drawGlobe(ctx) {
    // glass outline
    ctx.save();
    ctx.lineWidth = Math.max(1.5, h / 520);

    // outer rim
    ctx.strokeStyle = 'rgba(210,245,255,0.32)';
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.01, 0, TAU);
    ctx.stroke();

    // inner rim
    ctx.strokeStyle = 'rgba(120,210,255,0.16)';
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.96, 0, TAU);
    ctx.stroke();

    // gloss arcs
    ctx.globalCompositeOperation = 'screen';
    ctx.strokeStyle = 'rgba(220,250,255,0.22)';
    ctx.lineWidth = Math.max(1.5, h / 420);
    ctx.beginPath();
    ctx.arc(-r * 0.12, -r * 0.06, r * 0.82, -1.2, -0.2);
    ctx.stroke();

    ctx.strokeStyle = 'rgba(140,220,255,0.15)';
    ctx.lineWidth = Math.max(1, h / 700);
    ctx.beginPath();
    ctx.arc(r * 0.16, -r * 0.03, r * 0.9, -1.0, -0.3);
    ctx.stroke();

    // subtle vignette
    ctx.globalCompositeOperation = 'source-over';
    const vg = ctx.createRadialGradient(0, 0, r * 0.2, 0, 0, r * 1.05);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.28)');
    ctx.fillStyle = vg;
    ctx.beginPath();
    ctx.arc(0, 0, r, 0, TAU);
    ctx.fill();

    ctx.restore();

    // base
    ctx.save();
    ctx.translate(0, r * 0.95);
    const bw = r * 1.35;
    const bh = r * 0.34;
    const base = ctx.createLinearGradient(0, -bh, 0, bh);
    base.addColorStop(0, '#2a1a12');
    base.addColorStop(1, '#140b08');
    ctx.fillStyle = base;
    roundRect(ctx, -bw * 0.5, -bh * 0.45, bw, bh, r * 0.12);
    ctx.fill();

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = 'rgba(255,210,160,0.18)';
    roundRect(ctx, -bw * 0.45, -bh * 0.35, bw * 0.9, bh * 0.22, r * 0.1);
    ctx.fill();
    ctx.restore();

    ctx.restore();
  }

  function roundRect(ctx, x, y, w, h, rad) {
    const r = Math.min(rad, Math.min(w, h) * 0.5);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function drawHud(ctx, stormAmt, shakeAmt) {
    const cycle = 480;
    const u = (t % cycle) / cycle;

    // derive some "readouts" from sim (fake, but coherent)
    let pBase = 1012;
    for (const c of centers) pBase += c.s * 7;
    pBase += Math.sin(t * 0.07) * 2;
    const pressure = Math.round(pBase);

    const temp = Math.round(-3 + 9 * (1 - stormAmt) + Math.sin(t * 0.04) * 1.5);
    const wind = Math.round((8 + stormAmt * 22 + shakeAmt * 28));

    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.font = `${Math.max(10, Math.floor(h / 42))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;

    const pad = Math.max(10, Math.floor(h / 50));
    const x = pad;
    const y = pad;

    // panel
    ctx.fillStyle = 'rgba(0,0,0,0.36)';
    roundRect(ctx, x - 6, y - 6, Math.min(w - pad * 2, r * 1.2), Math.max(64, h * 0.12), 10);
    ctx.fill();

    ctx.fillStyle = 'rgba(200,245,255,0.9)';
    ctx.fillText('SNOW GLOBE WX LAB', x, y + 14);

    ctx.fillStyle = 'rgba(170,225,255,0.85)';
    ctx.fillText(`P ${pressure} hPa`, x, y + 34);
    ctx.fillText(`T ${temp}°C`, x + 150, y + 34);
    ctx.fillText(`W ${wind} km/h`, x, y + 52);

    const seg = Math.floor(u * 4);
    const label = seg === 0 ? 'CALM' : seg === 1 ? 'FRONTS' : seg === 2 ? 'STORM' : 'CLEAR';
    ctx.fillStyle = seg === 2 ? 'rgba(255,220,170,0.9)' : 'rgba(170,225,255,0.85)';
    ctx.fillText(`PHASE ${label}`, x + 150, y + 52);

    if (shakeAmt > 0.01) {
      ctx.fillStyle = 'rgba(255,240,200,0.95)';
      ctx.fillText('SHAKE EVENT', x, y + 70);
    }

    ctx.restore();
  }

  function render(ctx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const cycle = 480;
    const u = (t % cycle) / cycle;
    const seg = Math.floor(u * 4);
    const su = (u * 4) % 1;

    const stormAmt = seg === 2 ? (0.25 + 0.75 * Math.sin(su * Math.PI)) : (seg === 1 ? su * 0.35 : (seg === 3 ? (1 - su) * 0.2 : 0));
    const shakeAmt = shakeT > 0 ? (shakeT / shakeDur) : 0;

    drawDesk(ctx);

    // shadow
    const sh = ctx.createRadialGradient(cx, cy + r * 1.15, r * 0.2, cx, cy + r * 1.15, r * 1.05);
    sh.addColorStop(0, 'rgba(0,0,0,0.35)');
    sh.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sh;
    ctx.fillRect(cx - r * 1.2, cy + r * 0.5, r * 2.4, r * 1.6);

    // shake jitter
    const j = shakeAmt * shakeAmt;
    const jx = (Math.sin(t * 32) + Math.sin(t * 21.2)) * r * 0.01 * j;
    const jy = (Math.cos(t * 29) + Math.sin(t * 19.7)) * r * 0.01 * j;

    ctx.save();
    ctx.translate(cx + jx, cy + jy);

    // inner clip
    ctx.save();
    ctx.beginPath();
    ctx.arc(0, 0, r * 0.965, 0, TAU);
    ctx.clip();
    drawInner(ctx, stormAmt, shakeAmt);
    ctx.restore();

    drawGlobe(ctx);
    ctx.restore();

    drawHud(ctx, stormAmt, shakeAmt);

    // subtle end-of-shake flash
    if (shakeAmt > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = `rgba(220,250,255,${0.05 * shakeAmt})`;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }

  function init({ width, height }) {
    sceneInit(width, height);
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
