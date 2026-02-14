import { mulberry32, clamp } from '../util/prng.js';
import { simpleDrone } from '../util/audio.js';

function lerp(a, b, t){ return a + (b - a) * t; }
function ease(t){ t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }
function easeInOutQuad(t){ t = clamp(t, 0, 1); return t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2; }

function roundRect(ctx, x, y, w, h, r){
  const rr = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function segPhase(cycleBeat){
  // 64-beat loop.
  if (cycleBeat < 16) return 'warmup';
  if (cycleBeat < 32) return 'duet';
  if (cycleBeat < 48) return 'ensemble';
  if (cycleBeat < 56) return 'maintenance';
  return 'finale';
}

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0, h = 0, dpr = 1;
  let t = 0;

  const bpm = 84 + ((rand() * 34) | 0);
  const beatPeriod = 60 / bpm;
  const cycleBeats = 64;
  const cycleTime = beatPeriod * cycleBeats;

  let beatIndex = -1;
  let beatPulse = 0;

  // Visual identity: industrial stage + safety HUD.
  const hue = 28 + rand() * 24; // amber/orange safety range
  const steelHue = (hue + 190) % 360;

  const bgTop = `hsl(${steelHue}, 26%, 10%)`;
  const bgBot = `hsl(${(steelHue + 10) % 360}, 28%, 6%)`;
  const steelA = `hsla(${steelHue}, 18%, 24%, 0.96)`;
  const steelB = `hsla(${steelHue}, 16%, 16%, 0.96)`;
  const steelEdge = `hsla(${steelHue}, 20%, 55%, 0.30)`;

  const ink = `hsla(${hue}, 92%, 62%, 0.92)`;
  const inkDim = `hsla(${hue}, 85%, 60%, 0.35)`;
  const warn = `hsla(${(hue + 350) % 360}, 92%, 60%, 0.95)`;
  const ok = `hsla(${(hue + 40) % 360}, 92%, 58%, 0.85)`;

  // Arms
  const armCount = 3 + ((rand() * 3) | 0); // 3..5
  const arms = [];

  // Sparks pool (fixed size; no hot-path allocations)
  const SPARKS = 42;
  const sparks = Array.from({ length: SPARKS }, () => ({ x: 0, y: 0, vx: 0, vy: 0, life: 0 }));
  let sparkCursor = 0;

  let font = 16;
  let mono = 14;

  let flash = 0;
  let finaleSync = rand() < 0.28;
  let finaleFlashAtBeat = -999;

  let drone = null;
  let audioHandle = null;

  function rebuildArms(){
    arms.length = 0;
    const baseY = h * 0.78;
    const span = w * 0.76;
    const x0 = w * 0.12;

    for (let i = 0; i < armCount; i++){
      const u = armCount === 1 ? 0.5 : i / (armCount - 1);
      const baseX = x0 + span * u;

      const scale = 0.72 + rand() * 0.35;
      const L1 = Math.max(26, w * (0.085 * scale));
      const L2 = Math.max(22, w * (0.070 * scale));
      const L3 = Math.max(16, w * (0.050 * scale));

      const side = u * 2 - 1;
      const home = {
        a1: -Math.PI / 2 + side * (0.22 + rand() * 0.10),
        a2: 0.55 + rand() * 0.35,
        a3: -0.65 + rand() * 0.25,
      };

      const tint = (steelHue + (rand() * 20 - 10)) % 360;
      arms.push({
        i,
        baseX,
        baseY,
        L1, L2, L3,
        home,
        tint,
        accent: rand() < 0.55 ? ink : ok,
      });
    }
  }

  function onResize(width, height, _dpr=1){
    w = width;
    h = height;
    dpr = _dpr || 1;
    t = 0;
    beatIndex = -1;
    beatPulse = 0;
    flash = 0;

    font = Math.max(14, Math.floor(h * 0.034));
    mono = Math.max(12, Math.floor(h * 0.030));

    rebuildArms();
  }

  function spawnSparks(x, y, strength=1){
    const n = 2 + ((strength * 3) | 0);
    for (let k = 0; k < n; k++){
      const s = sparks[sparkCursor++ % SPARKS];
      const a = (-Math.PI / 2) + (rand() * 1.2 - 0.6);
      const sp = (w * 0.22) * (0.3 + rand() * 0.9) * strength;
      s.x = x;
      s.y = y;
      s.vx = Math.cos(a) * sp;
      s.vy = Math.sin(a) * sp;
      s.life = 0.35 + rand() * 0.35;
    }
  }

  function onAudioOn(){
    if (!audio.enabled) return;
    drone = simpleDrone(audio, { root: 62, detune: 1.1, gain: 0.05 });
    audioHandle = { stop(){ try { drone?.stop?.(); } catch {} } };
    audio.setCurrent(audioHandle);
  }

  function onAudioOff(){
    try { audioHandle?.stop?.(); } catch {}
    drone = null;
    audioHandle = null;
  }

  function destroy(){
    onAudioOff();
  }

  function triggerBeat(cycleBeat, phase){
    beatPulse = 1;

    // Visual little "servo twitch" sparks now and then.
    const sparkChance = phase === 'maintenance' ? 0.10 : 0.28;
    if (rand() < sparkChance){
      // sample a pseudo end-effector point: center-ish
      spawnSparks(w * (0.45 + rand() * 0.1), h * (0.52 + rand() * 0.06), phase === 'finale' ? 1.3 : 1.0);
    }

    if (!audio.enabled) return;

    const down = (cycleBeat % 8) === 0;
    const freqByPhase = {
      warmup: down ? 220 : 320,
      duet: down ? 260 : 420,
      ensemble: down ? 300 : 520,
      maintenance: down ? 140 : 190,
      finale: down ? 360 : 680,
    };

    audio.beep({
      freq: freqByPhase[phase] || 440,
      dur: down ? 0.08 : 0.06,
      gain: down ? 0.035 : 0.020,
      type: down ? 'square' : 'triangle',
    });
  }

  function poseFor(arm, phase, u){
    // Returns joint angles (a1 absolute, a2/a3 relative).
    // Choreo is deterministic, but varies slightly per arm.
    const s = (arm.i * 0.17 + 0.13) % 1;

    const home = arm.home;

    const reach = {
      a1: -Math.PI / 2 + (arm.i - (armCount - 1) / 2) * 0.09,
      a2: 0.25,
      a3: -0.25,
    };

    const sweep = {
      a1: -Math.PI / 2 + Math.sin((u + s) * Math.PI * 2) * 0.45,
      a2: 0.35 + Math.sin((u + s * 0.6) * Math.PI * 2) * 0.20,
      a3: -0.55 + Math.cos((u + s * 0.8) * Math.PI * 2) * 0.22,
    };

    const tuck = {
      a1: home.a1 + 0.05,
      a2: 0.95,
      a3: -0.95,
    };

    const point = {
      a1: -Math.PI / 2 + (arm.i % 2 ? 1 : -1) * 0.22,
      a2: 0.15,
      a3: 0.10,
    };

    if (phase === 'warmup'){
      const tt = easeInOutQuad(0.5 + 0.5 * Math.sin((u + s) * Math.PI * 2));
      return {
        a1: lerp(home.a1, sweep.a1, tt),
        a2: lerp(home.a2, sweep.a2, tt),
        a3: lerp(home.a3, sweep.a3, tt),
      };
    }

    if (phase === 'duet'){
      const isLead = arm.i === 0 || arm.i === 1;
      const tt = ease(0.5 + 0.5 * Math.sin((u + s) * Math.PI * 2));
      const a = isLead ? sweep : tuck;
      const b = isLead ? point : home;
      return {
        a1: lerp(a.a1, b.a1, tt * 0.6),
        a2: lerp(a.a2, b.a2, tt * 0.6),
        a3: lerp(a.a3, b.a3, tt * 0.6),
      };
    }

    if (phase === 'ensemble'){
      const tt = ease(0.5 + 0.5 * Math.sin((u + s) * Math.PI * 2));
      const tt2 = ease(0.5 + 0.5 * Math.sin((u * 0.5 + s * 0.9) * Math.PI * 2));
      return {
        a1: lerp(sweep.a1, reach.a1, tt2),
        a2: lerp(sweep.a2, reach.a2, tt2),
        a3: lerp(sweep.a3, reach.a3, tt),
      };
    }

    if (phase === 'maintenance'){
      // Drift gently toward "safe" posture and hold.
      const tt = ease(u);
      return {
        a1: lerp(sweep.a1, home.a1, tt),
        a2: lerp(sweep.a2, 0.85, tt),
        a3: lerp(sweep.a3, -0.85, tt),
      };
    }

    // finale
    if (finaleSync){
      // Big sync arc.
      const tt = easeInOutQuad(u);
      const arc = {
        a1: -Math.PI / 2 + Math.sin(u * Math.PI) * 0.48,
        a2: lerp(0.15, 0.45, tt),
        a3: lerp(-0.15, -0.55, tt),
      };
      return arc;
    }

    // Not perfectly synced: staggered flourish.
    const tt = easeInOutQuad(u);
    const twist = Math.sin((u + s) * Math.PI * 2) * 0.18;
    return {
      a1: lerp(reach.a1, sweep.a1, tt) + twist,
      a2: lerp(reach.a2, 0.18, tt),
      a3: lerp(reach.a3, -0.28, tt),
    };
  }

  function armJoints(arm, pose, out){
    // out: [x1,y1,x2,y2,x3,y3,x4,y4]
    const x1 = arm.baseX;
    const y1 = arm.baseY;

    const a1 = pose.a1;
    const a2 = a1 + pose.a2;
    const a3 = a2 + pose.a3;

    const x2 = x1 + Math.cos(a1) * arm.L1;
    const y2 = y1 + Math.sin(a1) * arm.L1;
    const x3 = x2 + Math.cos(a2) * arm.L2;
    const y3 = y2 + Math.sin(a2) * arm.L2;
    const x4 = x3 + Math.cos(a3) * arm.L3;
    const y4 = y3 + Math.sin(a3) * arm.L3;

    out[0] = x1; out[1] = y1;
    out[2] = x2; out[3] = y2;
    out[4] = x3; out[5] = y3;
    out[6] = x4; out[7] = y4;
    return out;
  }

  const tmpJ = new Float32Array(8);

  function drawArm(ctx, arm, pose, glow=0){
    const j = armJoints(arm, pose, tmpJ);

    const lw = Math.max(4, Math.floor(h * 0.010));
    const jointR = lw * 0.78;

    ctx.save();
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // subtle shadow
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = 'rgba(0,0,0,0.55)';
    ctx.lineWidth = lw + 2;
    ctx.beginPath();
    ctx.moveTo(j[0] + 2, j[1] + 2);
    ctx.lineTo(j[2] + 2, j[3] + 2);
    ctx.lineTo(j[4] + 2, j[5] + 2);
    ctx.lineTo(j[6] + 2, j[7] + 2);
    ctx.stroke();

    // steel stroke
    ctx.globalAlpha = 1;
    ctx.strokeStyle = `hsla(${arm.tint}, 16%, 62%, ${0.72 + glow * 0.18})`;
    ctx.lineWidth = lw;
    ctx.beginPath();
    ctx.moveTo(j[0], j[1]);
    ctx.lineTo(j[2], j[3]);
    ctx.lineTo(j[4], j[5]);
    ctx.lineTo(j[6], j[7]);
    ctx.stroke();

    // accent (safety paint stripe)
    ctx.strokeStyle = arm.accent;
    ctx.globalAlpha = 0.25 + glow * 0.10;
    ctx.lineWidth = Math.max(1, Math.floor(lw * 0.28));
    ctx.beginPath();
    ctx.moveTo(j[0], j[1]);
    ctx.lineTo(j[2], j[3]);
    ctx.lineTo(j[4], j[5]);
    ctx.stroke();

    // joints
    ctx.globalAlpha = 1;
    ctx.fillStyle = `hsla(${arm.tint}, 14%, 30%, 0.95)`;
    for (let k = 0; k < 3; k++){
      const x = j[k * 2];
      const y = j[k * 2 + 1];
      ctx.beginPath();
      ctx.arc(x, y, jointR, 0, Math.PI * 2);
      ctx.fill();
      ctx.strokeStyle = steelEdge;
      ctx.lineWidth = 1;
      ctx.stroke();
    }

    // end effector / claw
    const ex = j[6], ey = j[7];
    const claw = Math.max(8, lw * 1.25);
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = `hsla(${arm.tint}, 18%, 18%, 0.95)`;
    roundRect(ctx, ex - claw * 0.9, ey - claw * 0.35, claw * 1.8, claw * 0.7, claw * 0.25);
    ctx.fill();
    ctx.strokeStyle = arm.accent;
    ctx.globalAlpha = 0.35 + glow * 0.15;
    ctx.lineWidth = Math.max(1, Math.floor(lw * 0.22));
    ctx.stroke();

    ctx.restore();

    return { x: ex, y: ey };
  }

  function update(dt){
    t += dt;

    beatPulse = Math.max(0, beatPulse - dt * 2.4);
    flash = Math.max(0, flash - dt * 1.4);

    const idx = Math.floor(t / beatPeriod);
    if (idx !== beatIndex){
      beatIndex = idx;
      const cyc = t % cycleTime;
      const cycBeat = Math.floor(cyc / beatPeriod);
      const phase = segPhase(cycBeat);

      if (finaleSync && phase === 'finale' && cycBeat === 56 && cycBeat !== finaleFlashAtBeat){
        flash = 0.85;
        finaleFlashAtBeat = cycBeat;
      }

      triggerBeat(cycBeat, phase);
    }

    // Sparks update
    for (let i = 0; i < SPARKS; i++){
      const s = sparks[i];
      if (s.life <= 0) continue;
      s.life -= dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.vx *= Math.pow(0.08, dt);
      s.vy += h * 0.85 * dt;
    }
  }

  function drawBackdrop(ctx, cyc, phase){
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, bgTop);
    g.addColorStop(1, bgBot);
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // moving safety stripes
    ctx.save();
    ctx.globalAlpha = 0.06;
    ctx.translate(0, h * 0.06);
    ctx.rotate(-0.18);
    const stripe = Math.max(24, w * 0.05);
    const off = (cyc * w * 0.035) % stripe;
    for (let x = -w; x < w * 2; x += stripe){
      ctx.fillStyle = (x / stripe) % 2 === 0 ? ink : 'rgba(255,255,255,0.10)';
      ctx.fillRect(x + off, 0, stripe * 0.45, h * 1.2);
    }
    ctx.restore();

    // overhead "light bar" sweep
    const sweep = 0.5 + 0.5 * Math.sin(cyc * 0.9);
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.08 + beatPulse * 0.08 + (phase === 'finale' ? 0.04 : 0);
    ctx.fillStyle = ink;
    const sw = w * 0.32;
    ctx.fillRect(w * (sweep * 0.72) - sw * 0.5, h * 0.08, sw, h * 0.42);
    ctx.restore();

    if (flash > 0.01){
      ctx.save();
      ctx.globalAlpha = flash * 0.12;
      ctx.fillStyle = 'white';
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }

  function drawStage(ctx, cyc){
    const floorY = h * 0.80;

    // platform
    const pad = w * 0.06;
    const px = pad;
    const py = floorY - h * 0.08;
    const pw = w - pad * 2;
    const ph = h * 0.16;

    const plat = ctx.createLinearGradient(0, py, 0, py + ph);
    plat.addColorStop(0, steelA);
    plat.addColorStop(1, steelB);
    ctx.fillStyle = plat;
    roundRect(ctx, px, py, pw, ph, Math.max(10, h * 0.02));
    ctx.fill();

    // grid lines (subtle motion)
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = steelEdge;
    ctx.lineWidth = 1;
    ctx.beginPath();
    const step = Math.max(18, w * 0.04);
    const off = (cyc * 40) % step;
    for (let x = px; x <= px + pw + step; x += step){
      ctx.moveTo(x - off, py);
      ctx.lineTo(x - off, py + ph);
    }
    for (let y = py; y <= py + ph + step; y += step){
      ctx.moveTo(px, y);
      ctx.lineTo(px + pw, y);
    }
    ctx.stroke();
    ctx.restore();

    // stage lip
    ctx.save();
    ctx.globalAlpha = 0.75;
    ctx.strokeStyle = inkDim;
    ctx.lineWidth = Math.max(2, Math.floor(h * 0.006));
    ctx.beginPath();
    ctx.moveTo(px, py);
    ctx.lineTo(px + pw, py);
    ctx.stroke();
    ctx.restore();

    // floor reflection band
    ctx.save();
    const rg = ctx.createLinearGradient(0, floorY - h * 0.02, 0, h);
    rg.addColorStop(0, 'rgba(255,255,255,0.06)');
    rg.addColorStop(1, 'rgba(0,0,0,0.0)');
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = rg;
    ctx.fillRect(0, floorY - h * 0.02, w, h);
    ctx.restore();

    return floorY;
  }

  function drawHUD(ctx, phase, cycBeat){
    const pad = Math.max(10, Math.floor(w * 0.014));
    ctx.save();

    ctx.font = `${mono}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;

    const lines = [
      `ROBOTIC ARM BALLET`,
      `BPM ${String(bpm).padStart(3,' ')}  BEAT ${String(cycBeat).padStart(2,'0')}/64`,
      `MODE ${phase.toUpperCase()}`,
    ];

    const boxW = Math.min(w * 0.52, w - pad * 2);
    const boxH = pad * 2 + lines.length * (mono * 1.15);

    ctx.globalAlpha = 0.78;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    roundRect(ctx, pad, pad, boxW, boxH, Math.max(10, h * 0.018));
    ctx.fill();

    ctx.globalAlpha = 1;
    ctx.fillStyle = ink;
    for (let i = 0; i < lines.length; i++){
      ctx.fillText(lines[i], pad * 1.6, pad * 1.75 + i * (mono * 1.15));
    }

    // Maintenance banner
    if (phase === 'maintenance'){
      const msg = 'MAINTENANCE PAUSE';
      ctx.font = `600 ${font}px system-ui, -apple-system, Segoe UI, Roboto, sans-serif`;
      const tw = ctx.measureText(msg).width;
      const bw = tw + pad * 2.2;
      const bh = font * 1.6;
      const bx = (w - bw) / 2;
      const by = h * 0.12;
      ctx.globalAlpha = 0.92;
      ctx.fillStyle = 'rgba(0,0,0,0.55)';
      roundRect(ctx, bx, by, bw, bh, bh * 0.35);
      ctx.fill();
      ctx.strokeStyle = warn;
      ctx.lineWidth = 2;
      ctx.stroke();
      ctx.fillStyle = warn;
      ctx.globalAlpha = 0.95;
      ctx.fillText(msg, bx + pad * 1.1, by + bh * 0.72);
    }

    ctx.restore();
  }

  function draw(ctx){
    if (!w || !h) return;

    const cyc = t % cycleTime;
    const cycBeat = Math.floor(cyc / beatPeriod);
    const phase = segPhase(cycBeat);

    drawBackdrop(ctx, cyc, phase);
    drawStage(ctx, cyc);

    // Arms (midground)
    const phaseStartBeat = phase === 'warmup' ? 0
      : phase === 'duet' ? 16
      : phase === 'ensemble' ? 32
      : phase === 'maintenance' ? 48
      : 56;
    const phaseDurBeats = phase === 'maintenance' ? 8 : 16;
    const phaseU = clamp((cycBeat + (cyc / beatPeriod - cycBeat) - phaseStartBeat) / phaseDurBeats, 0, 1);

    // Staggered tiny beat pulse glow
    const glow = beatPulse * 0.6 + (phase === 'finale' ? 0.25 : 0);

    // draw arms back-to-front for nicer overlap
    for (let i = 0; i < arms.length; i++){
      const arm = arms[i];
      const u = phaseU;
      const pose = poseFor(arm, phase, u);
      const ee = drawArm(ctx, arm, pose, glow);

      // More sparks during finale downbeat
      if (phase === 'finale' && (cycBeat % 8) === 0 && rand() < 0.06){
        spawnSparks(ee.x, ee.y, 1.4);
      }
    }

    // sparks (foreground)
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i = 0; i < SPARKS; i++){
      const s = sparks[i];
      if (s.life <= 0) continue;
      const a = clamp(s.life / 0.7, 0, 1);
      ctx.globalAlpha = a * 0.85;
      ctx.fillStyle = `hsla(${hue}, 95%, 68%, ${0.65 + a * 0.25})`;
      const r = Math.max(1, h * 0.003) * (0.7 + (1 - a) * 0.8);
      ctx.beginPath();
      ctx.arc(s.x, s.y, r, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();

    // HUD
    drawHUD(ctx, phase, cycBeat);
  }

  function render(ctx){
    draw(ctx);
  }

  function init({ width, height, dpr: _dpr }={}){
    if (width && height) onResize(width, height, _dpr || 1);
  }

  return {
    init,
    onResize,
    update,
    render,
    destroy,
    onAudioOn,
    onAudioOff,
  };
}
