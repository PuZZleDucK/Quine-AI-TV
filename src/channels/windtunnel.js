import { mulberry32, clamp } from '../util/prng.js';
import { simpleDrone } from '../util/audio.js';

function lerp(a, b, t) { return a + (b - a) * t; }
function ease(t){ t = clamp(t, 0, 1); return t*t*(3 - 2*t); }
function pick(rand, arr){ return arr[(rand() * arr.length) | 0]; }

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

function shuffle(rand, arr){
  const a = arr.slice();
  for (let i = a.length - 1; i > 0; i--){
    const j = (rand() * (i + 1)) | 0;
    const t = a[i]; a[i] = a[j]; a[j] = t;
  }
  return a;
}

export function createChannel({ seed, audio }) {
  const rand = mulberry32(seed);

  let w = 0;
  let h = 0;
  let t = 0;

  // Wind tunnel chamber in screen coords
  let chamber = { x: 0, y: 0, w: 0, h: 0 };

  // Phases / test series
  const phaseOrder = shuffle(rand, [
    { id: 'cyl', name: 'CYLINDER', type: 'cylinder' },
    { id: 'wing', name: 'WING', type: 'wing' },
    { id: 'car', name: 'TOY CAR', type: 'car' },
    { id: 'kite', name: 'KITE', type: 'kite' },
  ]);

  let phaseIndex = 0;
  let phaseT = 0;
  let phaseDur = 12 + rand() * 5;

  // Streamlines
  let lines = [];

  // Smoke particles riding streamlines
  let puffs = [];

  // Body under test
  let body = {
    type: phaseOrder[0].type,
    size: 1,
    aoa: 0,
    aoaTarget: 0,
    spin: 0,
    hue: 190,
  };

  // HUD values (smoothed)
  let lift = 0;
  let drag = 0;
  let liftTgt = 0;
  let dragTgt = 0;

  // Special moments
  let stall = 0;
  let stallFlash = 0;
  let nextStallAt = 6 + rand() * 10;

  let burst = 0;
  let nextBurstAt = 4 + rand() * 8;

  // Audio
  let drone = null;
  let windNoise = null;

  function setPhase(i){
    phaseIndex = (i + phaseOrder.length) % phaseOrder.length;
    phaseT = 0;
    phaseDur = 12 + rand() * 6;

    body.type = phaseOrder[phaseIndex].type;
    body.size = 0.8 + rand() * 0.55;
    body.aoa = (rand() * 2 - 1) * 0.25;
    body.aoaTarget = (rand() * 2 - 1) * 0.35;
    body.spin = rand() * Math.PI * 2;
    body.hue = pick(rand, [185, 197, 210, 225, 170]);

    // Reset specials with phase
    stall = 0;
    stallFlash = 0;
    nextStallAt = 5 + rand() * 12;
    burst = 0;
    nextBurstAt = 3 + rand() * 10;

    // Fresh puffs
    puffs = [];
    for (let k = 0; k < 46; k++) puffs.push(spawnPuff(true));
  }

  function spawnPuff(initial=false){
    const li = (rand() * lines.length) | 0;
    const l = lines[li];
    const x = initial ? (rand() * (chamber.w * 1.1) - chamber.w * 0.1) : (-chamber.w * 0.1);
    return {
      li,
      x,
      spd: 0.22 + rand() * 0.65,
      a: 0.18 + rand() * 0.55,
      r: 1 + rand() * 2.2,
      wob: rand() * 10,
      seed: rand() * 1000,
      y0: l ? l.y0 : 0,
    };
  }

  function sceneInit(width, height){
    w = width;
    h = height;
    t = 0;

    chamber = {
      x: w * 0.1,
      y: h * 0.18,
      w: w * 0.8,
      h: h * 0.54,
    };

    // Streamlines (y0 in [0..1] across chamber height)
    const n = Math.max(24, Math.min(36, Math.floor(chamber.h / 14)));
    lines = Array.from({ length: n }, (_, i) => {
      const u = (i + 0.5) / n;
      return {
        y0: u,
        amp: 0.006 + rand() * 0.02,
        f: 0.6 + rand() * 1.2,
        ph: rand() * Math.PI * 2,
        hueJ: (rand() * 14 - 7),
      };
    });

    puffs = [];
    for (let k = 0; k < 46; k++) puffs.push(spawnPuff(true));

    // Keep current phase but re-derive geometry-dependent targets
    setPhase(phaseIndex);
  }

  function onResize(width, height){
    sceneInit(width, height);
  }

  function bodyCenter(){
    return {
      x: chamber.x + chamber.w * 0.58,
      y: chamber.y + chamber.h * 0.5,
    };
  }

  function flowOffset(nx, ny, sideBias = 0){
    // nx,ny in chamber-local [0..1]
    const c = bodyCenter();
    const cx = (c.x - chamber.x) / chamber.w;
    const cy = (c.y - chamber.y) / chamber.h;

    const dx = nx - cx;
    const dy = ny - cy;
    // Keep the left side laminar: deflection ramps in near the test body.
    const upStart = cx - 0.13;
    const upEnd = cx - 0.01;
    const upstreamRamp = ease(clamp((nx - upStart) / Math.max(0.0001, upEnd - upStart), 0, 1));
    if (upstreamRamp <= 0 && nx < cx) return 0;

    // Approximate per-body influence footprint so streamlines "fit" the tested shape.
    const profile = body.type === 'wing'
      ? { rx: 0.18, ry: 0.07, push: 0.0044, liftMul: 1.00, wakeW: 0.20 }
      : body.type === 'kite'
        ? { rx: 0.14, ry: 0.11, push: 0.0040, liftMul: 0.85, wakeW: 0.22 }
        : body.type === 'car'
          ? { rx: 0.13, ry: 0.085, push: 0.0037, liftMul: 0.35, wakeW: 0.18 }
          : { rx: 0.105, ry: 0.105, push: 0.0034, liftMul: 0.20, wakeW: 0.16 };

    const sdx = dx / profile.rx;
    const sdy = dy / profile.ry;
    const dist2 = sdx * sdx + sdy * sdy;
      const core = Math.exp(-dist2 * 1.2);

    let off = 0;

    // Object displacement: split flow above/below body, starting near the body.
    let split = dy / (Math.abs(dy) + profile.ry * 0.45);
    if (Math.abs(split) < 0.12) {
      const sb = sideBias / (Math.abs(sideBias) + profile.ry * 0.35);
      split = sb === 0 ? (dy >= 0 ? 1 : -1) * 0.12 : sb;
    }
    off += split * profile.push * body.size * core * (0.15 + 0.85 * upstreamRamp);

    // Strong local displacement around the object to force clear split flow.
    const centerWeight = Math.exp(-(dx * dx) / (profile.rx * profile.rx * 0.9)) *
      Math.exp(-(dy * dy) / (profile.ry * profile.ry * 0.55));
    const expel = (0.45 + 1.25 * (1 - clamp(Math.abs(dy) / (profile.ry * 1.05), 0, 1))) * centerWeight;
    off += (split >= 0 ? 1 : -1) * profile.push * 0.95 * body.size * expel * (0.2 + 0.8 * upstreamRamp);

    // Lift-ish bias (mainly wing/kite).
    const liftSign = Math.sin(body.aoa);
    off += (-liftSign) * profile.push * 0.8 * body.size * profile.liftMul * core * upstreamRamp;

    // Wake/turbulence only downstream.
    if (dx > 0) {
      const wake = Math.sin(t * (3.5 + body.size * 1.2) + nx * 22 + (ny * 18)) * 0.0010;
      const streamDecay = Math.exp(-dx * 4.2);
      const crossDecay = Math.exp(-Math.abs(dy) / profile.wakeW);
      off += wake * streamDecay * crossDecay * (0.75 + 1.1 * stall);
    }

    // Stall and burst effects are local to body/downstream so upstream stays laminar.
    if (stall > 0 && nx > cx - 0.04) {
      const k = ease(stall);
      off += Math.sin(nx * Math.PI * 2 + t * 6) * 0.0016 * k * (0.2 + Math.abs(dy) * 1.1);
      off += split * profile.push * 0.8 * k * core;
    }
    if (burst > 0 && nx > cx - 0.08) {
      off += Math.sin(t * 14 + nx * 40 + ny * 30) * 0.0006 * burst;
    }

    return off;
  }

  function obstacleSplitOffset(nx, baseY, cx, cy, profile, fallbackSign = 1){
    // Force a visible streamline split around the obstacle while preserving
    // laminar flow on the left side of the tunnel.
    const start = cx - 0.18;
    const ramp = ease(clamp((nx - start) / 0.24, 0, 1));
    if (ramp <= 0) return 0;

    const xBell = Math.exp(-Math.pow((nx - cx) / (profile.rx * 1.25), 2));
    const yn = (baseY - cy) / (profile.ry * 1.08);
    const center = Math.exp(-(yn * yn));

    let sign = yn >= 0 ? 1 : -1;
    if (Math.abs(yn) < 0.05) sign = fallbackSign >= 0 ? 1 : -1;

    // Strongest at centerlines near body, taper away from obstacle.
    const amp = (0.018 + 0.055 * center) * body.size;
    return sign * amp * xBell * ramp;
  }

  function computeTargets(){
    const aoa = body.aoa;
    const abs = Math.abs(aoa);

    // Baseline drag for each body
    const baseDrag = body.type === 'cylinder' ? 0.55 : body.type === 'car' ? 0.45 : 0.35;

    // Lift curve: wings/kites get more lift with AOA, stalls hard.
    let l = 0;
    if (body.type === 'wing' || body.type === 'kite') {
      l = Math.sin(aoa * 1.8) * (body.type === 'wing' ? 0.95 : 0.75);
      // pseudo-stall around ~0.45 rad
      const stallK = clamp((abs - 0.42) / 0.18, 0, 1);
      l *= (1 - 0.6 * stallK);
    } else {
      l = Math.sin(aoa * 1.2) * 0.18;
    }

    // Drag rises with AOA, with extra during stall moments
    let d = baseDrag + abs * (body.type === 'car' ? 0.55 : 0.75);
    d += stall * 0.35;

    liftTgt = clamp(l, -1, 1);
    dragTgt = clamp(d, 0, 1.2);
  }

  function onAudioOn(){
    if (!audio.enabled) return;
    const root = 70 + ((rand() * 22) | 0);
    drone = simpleDrone(audio, { root, detune: 0.9, gain: 0.04 });
    windNoise = audio.noiseSource({ type: 'pink', gain: 0.02 });
    windNoise.start();
    audio.setCurrent({
      stop(){
        try { drone?.stop?.(); } catch {}
        try { windNoise?.stop?.(); } catch {}
        drone = null;
        windNoise = null;
      }
    });
  }

  function onAudioOff(){
    audio.stopCurrent();
    drone = null;
    windNoise = null;
  }

  function destroy(){
    try { onAudioOff(); } catch {}
  }

  function update(dt){
    t += dt;
    phaseT += dt;

    // gentle AOA wandering
    body.aoaTarget += (rand() * 2 - 1) * dt * 0.04;
    body.aoaTarget = clamp(body.aoaTarget, -0.62, 0.62);
    const k = 1 - Math.pow(0.001, dt);
    body.aoa = lerp(body.aoa, body.aoaTarget, k * 0.22);

    // occasional micro-adjust: makes it feel "labby"
    if ((t * 0.2) % 1 < dt * 0.2) {
      if (rand() < 0.35) body.aoaTarget += (rand() * 2 - 1) * 0.08;
    }

    // specials
    nextStallAt -= dt;
    if (nextStallAt <= 0) {
      nextStallAt = 10 + rand() * 14;
      stall = 1;
      stallFlash = 1;
      // kick AOA toward a "too high" value briefly
      body.aoaTarget = clamp(body.aoaTarget + (rand() < 0.5 ? 1 : -1) * (0.26 + rand() * 0.22), -0.75, 0.75);
      if (audio.enabled) audio.beep({ freq: 220 + rand() * 80, dur: 0.08, gain: 0.03, type: 'square' });
    }

    nextBurstAt -= dt;
    if (nextBurstAt <= 0) {
      nextBurstAt = 7 + rand() * 12;
      burst = 1;
      for (let i = 0; i < 18; i++) puffs.push(spawnPuff(false));
      if (audio.enabled) audio.beep({ freq: 740 + rand() * 120, dur: 0.05, gain: 0.02, type: 'triangle' });
    }

    stall = Math.max(0, stall - dt * 0.42);
    burst = Math.max(0, burst - dt * 0.75);
    stallFlash = Math.max(0, stallFlash - dt * 1.4);

    // phase switch
    if (phaseT >= phaseDur) {
      setPhase(phaseIndex + 1);
      if (audio.enabled) audio.beep({ freq: 520, dur: 0.05, gain: 0.02, type: 'sine' });
    }

    computeTargets();
    lift = lerp(lift, liftTgt, 1 - Math.pow(0.002, dt));
    drag = lerp(drag, dragTgt, 1 - Math.pow(0.002, dt));

    // Move puffs
    for (const p of puffs) {
      p.x += dt * chamber.w * p.spd;
      p.a -= dt * 0.01;
      p.wob += dt;
      if (p.x > chamber.w * 1.05 || p.a <= 0.01) {
        // respawn
        const np = spawnPuff(false);
        p.li = np.li;
        p.x = np.x;
        p.spd = np.spd;
        p.a = np.a;
        p.r = np.r;
        p.wob = np.wob;
        p.seed = np.seed;
        p.y0 = np.y0;
      }
    }

    // cap puffs list size
    if (puffs.length > 140) puffs.length = 140;
  }

  function drawBackground(ctx){
    // Lab backdrop
    ctx.fillStyle = '#070912';
    ctx.fillRect(0, 0, w, h);

    // Subtle blueprint-ish grid
    ctx.save();
    ctx.globalAlpha = 0.22;
    const step = Math.max(18, Math.floor(Math.min(w, h) / 28));
    ctx.strokeStyle = 'rgba(120,200,255,0.18)';
    ctx.lineWidth = 1;
    for (let x = 0; x <= w; x += step) {
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = 0; y <= h; y += step) {
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.restore();

    // Vignette
    const vg = ctx.createRadialGradient(w * 0.5, h * 0.5, Math.min(w, h) * 0.2, w * 0.5, h * 0.5, Math.max(w, h) * 0.82);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.65)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
  }

  function drawChamber(ctx){
    const x = chamber.x;
    const y = chamber.y;

    // Outer housing
    ctx.save();
    roundedRect(ctx, x - w*0.012, y - h*0.02, chamber.w + w*0.024, chamber.h + h*0.04, 14);
    ctx.fillStyle = 'rgba(18, 22, 40, 0.95)';
    ctx.fill();
    ctx.restore();

    // Glass window
    ctx.save();
    roundedRect(ctx, x, y, chamber.w, chamber.h, 12);
    ctx.fillStyle = 'rgba(7, 14, 24, 0.85)';
    ctx.fill();
    ctx.clip();

    // Inner glow
    const g = ctx.createLinearGradient(x, y, x + chamber.w, y);
    g.addColorStop(0, 'rgba(60, 220, 255, 0.10)');
    g.addColorStop(0.5, 'rgba(60, 220, 255, 0.03)');
    g.addColorStop(1, 'rgba(60, 220, 255, 0.07)');
    ctx.fillStyle = g;
    ctx.fillRect(x, y, chamber.w, chamber.h);

    // Fan column (left)
    const fanW = chamber.w * 0.11;
    const fanX = x;
    ctx.fillStyle = 'rgba(10, 18, 30, 0.9)';
    ctx.fillRect(fanX, y, fanW, chamber.h);

    // Rotating "blades"
    const cx = fanX + fanW * 0.5;
    const cy = y + chamber.h * 0.5;
    const r = Math.min(fanW, chamber.h) * 0.28;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(t * 2.6);
    for (let i = 0; i < 8; i++) {
      ctx.rotate(Math.PI * 2 / 8);
      ctx.fillStyle = `rgba(120, 240, 255, ${0.05 + (i%2)*0.06})`;
      ctx.fillRect(r * 0.15, -r * 0.06, r * 0.9, r * 0.12);
    }
    ctx.restore();

    // Streamlines
    drawStreamlines(ctx);

    // Body
    drawBody(ctx);

    // Smoke puffs (foreground)
    drawPuffs(ctx);

    // Glass highlight
    ctx.save();
    ctx.globalAlpha = 0.18;
    const hl = ctx.createLinearGradient(x, y, x + chamber.w, y + chamber.h);
    hl.addColorStop(0, 'rgba(255,255,255,0.16)');
    hl.addColorStop(0.25, 'rgba(255,255,255,0.02)');
    hl.addColorStop(0.65, 'rgba(255,255,255,0.00)');
    hl.addColorStop(1, 'rgba(255,255,255,0.10)');
    ctx.fillStyle = hl;
    ctx.fillRect(x, y, chamber.w, chamber.h);
    ctx.restore();

    ctx.restore();

    // Border
    ctx.save();
    roundedRect(ctx, x, y, chamber.w, chamber.h, 12);
    ctx.strokeStyle = 'rgba(120, 240, 255, 0.22)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();
  }

  function drawStreamlines(ctx){
    const x0 = chamber.x;
    const y0 = chamber.y;
    const cw = chamber.w;
    const ch = chamber.h;
    const c = bodyCenter();
    const cx = (c.x - chamber.x) / chamber.w;
    const cy = (c.y - chamber.y) / chamber.h;
    const profile = body.type === 'wing'
      ? { rx: 0.18, ry: 0.07 }
      : body.type === 'kite'
        ? { rx: 0.14, ry: 0.11 }
        : body.type === 'car'
          ? { rx: 0.13, ry: 0.085 }
          : { rx: 0.105, ry: 0.105 };

    const steps = 70;
    const dx = 1 / steps;

    ctx.save();
    ctx.globalAlpha = 0.9;
    ctx.lineWidth = Math.max(1, Math.floor(Math.min(w, h) / 420));

    for (let i = 0; i < lines.length; i++) {
      const L = lines[i];
      const baseY = L.y0;
      const hue = 190 + L.hueJ;
      const sat = 82;
      const lum = 62;

      ctx.beginPath();
      for (let s = 0; s <= steps; s++) {
        const nx = s * dx;
        let ny = baseY;

        // Keep the left side relatively laminar, then grow waviness toward/after the body.
        const wiggleRamp = ease(clamp((nx - (cx - 0.20)) / 0.40, 0, 1));
        ny += Math.sin((t * 0.7 + L.ph) * L.f + nx * 10) * L.amp * (0.08 + 0.92 * wiggleRamp);

        // flow deflection near body
        ny += flowOffset(nx, ny, baseY - cy) * 1.22;

        // Explicit obstacle shell so lines clearly split around the body silhouette.
        const rx = profile.rx * 1.05;
        const ry = profile.ry * 1.20;
        const ex = (nx - cx) / rx;
        const ey = (ny - cy) / ry;
        const shell = Math.exp(-(ex * ex * 2.0 + ey * ey * 2.6));
        const nearCenter = 1 - clamp(Math.abs(ey), 0, 1);
        const side = (baseY - cy) >= 0 ? 1 : -1;
        const splitRamp = ease(clamp((nx - (cx - 0.16)) / 0.28, 0, 1));
        ny += side * 0.015 * shell * nearCenter * splitRamp;

        // Additional forced split so deformation is clearly readable on-screen.
        ny += obstacleSplitOffset(nx, baseY, cx, cy, profile, (i % 2 ? 1 : -1));

        const x = x0 + nx * cw;
        const y = y0 + ny * ch;

        if (s === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      }

      const a = 0.22 + (burst * 0.18) + (stall * 0.15);
      ctx.strokeStyle = `hsla(${hue}, ${sat}%, ${lum}%, ${a})`;
      ctx.stroke();
    }

    ctx.restore();
  }

  function drawPuffs(ctx){
    const x0 = chamber.x;
    const y0 = chamber.y;
    const cw = chamber.w;
    const ch = chamber.h;
    const cy = (bodyCenter().y - chamber.y) / chamber.h;
    const cx = (bodyCenter().x - chamber.x) / chamber.w;
    const profile = body.type === 'wing'
      ? { rx: 0.18, ry: 0.07 }
      : body.type === 'kite'
        ? { rx: 0.14, ry: 0.11 }
        : body.type === 'car'
          ? { rx: 0.13, ry: 0.085 }
          : { rx: 0.105, ry: 0.105 };

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of puffs) {
      const L = lines[p.li];
      if (!L) continue;

      const nx = clamp((p.x / cw), -0.2, 1.2);
      let ny = L.y0;
      ny += Math.sin((t * 0.7 + L.ph) * L.f + nx * 10) * L.amp;
      ny += flowOffset(nx, ny, L.y0 - cy) * 1.15;
      const ex = (nx - cx) / (profile.rx * 1.05);
      const ey = (ny - cy) / (profile.ry * 1.20);
      const shell = Math.exp(-(ex * ex * 1.8 + ey * ey * 2.2));
      const side = (L.y0 - cy) >= 0 ? 1 : -1;
      const splitRamp = ease(clamp((nx - (cx - 0.16)) / 0.28, 0, 1));
      ny += side * 0.010 * shell * splitRamp;
      ny += obstacleSplitOffset(nx, L.y0, cx, cy, profile, ((p.li % 2) ? 1 : -1)) * 0.7;

      const x = x0 + p.x;
      const y = y0 + ny * ch + Math.sin(p.wob * 2 + p.seed) * 1.2;

      const a = clamp(p.a + burst * 0.25, 0, 1) * 0.55;
      const r = p.r * (1 + stall * 0.3);

      const g = ctx.createRadialGradient(x, y, 0, x, y, r * 3.2);
      g.addColorStop(0, `rgba(180, 250, 255, ${a})`);
      g.addColorStop(1, 'rgba(180, 250, 255, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(x, y, r * 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawBody(ctx){
    const c = bodyCenter();
    const s = Math.min(chamber.w, chamber.h) * 0.12 * body.size;

    ctx.save();
    ctx.translate(c.x, c.y);

    // angle of attack tilt for wing-ish bodies
    const tilt = (body.type === 'wing' || body.type === 'kite') ? body.aoa : body.aoa * 0.4;
    ctx.rotate(tilt);

    // Body fill
    ctx.fillStyle = `hsla(${body.hue}, 85%, 62%, 0.9)`;
    ctx.strokeStyle = 'rgba(220, 255, 255, 0.25)';
    ctx.lineWidth = 2;

    if (body.type === 'cylinder') {
      ctx.beginPath();
      ctx.ellipse(0, 0, s * 0.65, s * 0.65, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.stroke();
    } else if (body.type === 'car') {
      roundedRect(ctx, -s * 0.95, -s * 0.35, s * 1.9, s * 0.7, s * 0.18);
      ctx.fill();
      ctx.stroke();
      // cabin
      ctx.fillStyle = 'rgba(10, 20, 35, 0.6)';
      roundedRect(ctx, -s * 0.35, -s * 0.28, s * 0.7, s * 0.38, s * 0.12);
      ctx.fill();
    } else if (body.type === 'kite') {
      ctx.beginPath();
      ctx.moveTo(0, -s * 0.95);
      ctx.lineTo(s * 0.65, 0);
      ctx.lineTo(0, s * 0.95);
      ctx.lineTo(-s * 0.65, 0);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      // tail
      ctx.strokeStyle = 'rgba(180, 250, 255, 0.22)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-s * 0.15, s * 0.85);
      const tailLen = s * (1.8 + 0.6 * Math.sin(t * 0.9));
      for (let i = 0; i < 8; i++) {
        const u = i / 7;
        const xx = -s * 0.2 - u * tailLen;
        const yy = s * 0.9 + Math.sin(t * 2.2 + u * 8) * s * 0.12;
        ctx.lineTo(xx, yy);
      }
      ctx.stroke();
    } else {
      // wing
      roundedRect(ctx, -s * 1.15, -s * 0.20, s * 2.3, s * 0.40, s * 0.18);
      ctx.fill();
      ctx.stroke();
      // camber line
      ctx.strokeStyle = 'rgba(10, 240, 255, 0.26)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(-s * 1.05, 0);
      ctx.quadraticCurveTo(0, -s * 0.22, s * 1.05, 0);
      ctx.stroke();
    }

    // tiny shadow / mount line
    ctx.restore();

    // Mount / sting (not rotated)
    ctx.save();
    ctx.strokeStyle = 'rgba(180, 250, 255, 0.14)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(c.x - s * 1.4, c.y + s * 0.75);
    ctx.lineTo(c.x + s * 0.2, c.y + s * 0.22);
    ctx.stroke();
    ctx.restore();
  }

  function drawHud(ctx){
    const pad = Math.max(14, Math.floor(Math.min(w, h) * 0.02));
    const boxH = Math.max(72, Math.floor(h * 0.14));
    const x = chamber.x;
    const y = chamber.y + chamber.h + pad * 0.65;
    const bw = chamber.w;

    // panel
    ctx.save();
    roundedRect(ctx, x, y, bw, boxH, 12);
    ctx.fillStyle = 'rgba(8, 12, 22, 0.82)';
    ctx.fill();
    ctx.strokeStyle = 'rgba(120, 240, 255, 0.18)';
    ctx.lineWidth = 2;
    ctx.stroke();
    ctx.restore();

    // text
    ctx.save();
    ctx.fillStyle = 'rgba(200, 255, 255, 0.9)';
    ctx.font = `${Math.max(12, Math.floor(h * 0.022))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'top';

    const phase = phaseOrder[phaseIndex];
    const left = x + pad;
    const top = y + pad * 0.55;

    ctx.globalAlpha = 0.95;
    ctx.fillText('WIND TUNNEL TOY LAB', left, top);

    ctx.globalAlpha = 0.7;
    ctx.fillText(`TEST: ${phase.name}`, left, top + pad * 1.35);

    // AOA line
    const aoaDeg = (body.aoa * 180 / Math.PI);
    ctx.fillText(`AOA: ${aoaDeg.toFixed(1)}°`, left, top + pad * 2.3);

    // Lift/Drag bars
    const barX = x + bw * 0.48;
    const barY = top + pad * 1.25;
    const barW = bw * 0.48 - pad;
    const barH = Math.max(10, Math.floor(boxH * 0.18));

    function bar(label, v, yy, col){
      ctx.globalAlpha = 0.7;
      ctx.fillStyle = 'rgba(200, 255, 255, 0.7)';
      ctx.fillText(label, barX, yy - pad * 0.65);

      // track
      ctx.globalAlpha = 1;
      roundedRect(ctx, barX, yy, barW, barH, 8);
      ctx.fillStyle = 'rgba(120, 240, 255, 0.08)';
      ctx.fill();

      // center line
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = 'rgba(200, 255, 255, 0.25)';
      ctx.fillRect(barX + barW * 0.5, yy, 2, barH);

      // value
      const vv = clamp((v + 1) / 2, 0, 1);
      ctx.globalAlpha = 0.95;
      const fillW = barW * vv;
      roundedRect(ctx, barX, yy, fillW, barH, 8);
      ctx.fillStyle = col;
      ctx.fill();
    }

    bar('LIFT', lift, barY, 'rgba(100, 255, 190, 0.55)');
    bar('DRAG', clamp(drag * 0.85 - 0.2, -1, 1), barY + barH + pad * 0.95, 'rgba(255, 170, 110, 0.55)');

    // Stall overlay
    if (stallFlash > 0) {
      ctx.globalAlpha = 0.55 * stallFlash;
      ctx.fillStyle = 'rgba(255, 90, 90, 0.55)';
      ctx.fillRect(x, y, bw, boxH);

      ctx.globalAlpha = 0.9 * stallFlash;
      ctx.fillStyle = 'rgba(255, 240, 240, 0.95)';
      ctx.font = `${Math.max(14, Math.floor(h * 0.03))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.fillText('STALL RECOVERY', x + bw * 0.62, y + pad * 0.75);
    }

    ctx.restore();
  }

  function render(ctx){
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    drawBackground(ctx);
    drawChamber(ctx);
    drawHud(ctx);
  }

  function init({ width, height }) {
    sceneInit(width, height);
  }

  // Prime initial phase
  setPhase(0);

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
