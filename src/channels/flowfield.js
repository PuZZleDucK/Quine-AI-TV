// REVIEWED: 2026-02-12
import { mulberry32 } from '../util/prng.js';

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);
  let w=0,h=0,t=0;
  let pts=[];

  let baseFieldScale = 0.0025;
  let fieldScale = baseFieldScale;
  let baseSpeed = 25;

  // 2–4 minute deterministic phase cycle (CALM→SURGE→DRIFT) for long-run interest.
  // Uses its own RNG so it doesn't perturb the point-field sequence.
  let phaseRand = mulberry32((seed ^ 0xC2B2AE35) >>> 0);
  let phaseTotalS = 180;
  let phaseDurS = [60, 45, 75];
  let phaseOffsetS = 0;

  let phaseFieldScaleMul = 1;
  let phaseSpeedMul = 1;
  let phaseBgBiasAlpha = 0.045;
  let phaseFadeAlpha = 0.08;

  // Separate RNG for cached texture layers so we can add visual richness
  // without affecting the point-field sequence.
  let texRand = mulberry32((seed ^ 0x9E3779B9) >>> 0);

  // Long-run composition: periodically reseed a small % of points so the
  // field doesn't collapse into a couple of bright ribbons over time.
  // Uses its own RNG so the behaviour is deterministic and doesn't perturb
  // other sequences.
  let reseedRand = mulberry32((seed ^ 0x85EBCA6B) >>> 0);
  let reseedClock = 0;
  const RESEED_INTERVAL_S = 9.5;
  const RESEED_FRACTION = 0.015;

  // Fixed-timestep simulation so motion is deterministic across 30fps vs 60fps.
  const FIXED_DT = 1/60;
  const MAX_STEPS_PER_UPDATE = 8;
  let acc = 0;

  // Offscreen buffer so we can advance the "paint" at fixed timesteps too.
  // (Render just blits the buffer + draws UI.)
  let buf = null;
  let bctx = null;

  // Cached background + midground mist/grain layers (rebuild on resize).
  let bg = null;
  let bgctx = null;
  let mist = null;
  let mistctx = null;
  const MIST_SIZE = 512;
  let mistFilter = 'blur(18px)';

  const HUE_BUCKETS = 48;
  const hueStyles = Array.from({ length: HUE_BUCKETS }, (_, i) =>
    `hsl(${Math.round((i * 360) / HUE_BUCKETS)},90%,60%)`
  );

  const PHASE_PARAMS = [
    // CALM: slower, slightly stronger fade (shorter trails), larger structures.
    { fieldScaleMul: 0.92, speedMul: 0.75, bgBiasAlpha: 0.058, fadeAlpha: 0.105 },
    // SURGE: faster, longer trails, tighter curls.
    { fieldScaleMul: 1.18, speedMul: 1.25, bgBiasAlpha: 0.030, fadeAlpha: 0.055 },
    // DRIFT: medium, stable.
    { fieldScaleMul: 0.98, speedMul: 0.92, bgBiasAlpha: 0.045, fadeAlpha: 0.082 },
  ];

  function lerp(a, b, u){ return a + (b - a) * u; }
  function smoothstep01(x){
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    return x*x*(3 - 2*x);
  }

  function buildPhasePlan(){
    // Total cycle duration: 2–4 minutes.
    phaseTotalS = 120 + phaseRand() * 120;

    // Seeded but gentle duration variation.
    const calmFrac = 0.34 + (phaseRand() - 0.5) * 0.08;
    const surgeFrac = 0.24 + (phaseRand() - 0.5) * 0.06;
    let calm = phaseTotalS * calmFrac;
    let surge = phaseTotalS * surgeFrac;
    let drift = phaseTotalS - calm - surge;

    // Ensure drift isn't starved.
    const minDrift = phaseTotalS * 0.25;
    if (drift < minDrift){
      const need = minDrift - drift;
      calm = Math.max(30, calm - need * 0.6);
      surge = Math.max(30, surge - need * 0.4);
      drift = phaseTotalS - calm - surge;
    }

    // Normalize to exact total.
    const sum = calm + surge + drift;
    phaseDurS = [
      (calm * phaseTotalS) / sum,
      (surge * phaseTotalS) / sum,
      (drift * phaseTotalS) / sum,
    ];

    phaseOffsetS = phaseRand() * phaseTotalS;
  }

  function applyPhase(nowT){
    const u = (nowT + phaseOffsetS) % phaseTotalS;

    let idx = 0;
    let start = 0;
    for (let i = 0; i < 3; i++){
      const d = phaseDurS[i];
      if (u < start + d){ idx = i; break; }
      start += d;
    }

    const d = phaseDurS[idx];
    const local = u - start;
    const next = (idx + 1) % 3;

    // Blend near the end of each phase so transitions read smooth.
    const blendWindow = Math.min(10, d * 0.22);
    const m = (local > d - blendWindow)
      ? smoothstep01((local - (d - blendWindow)) / blendWindow)
      : 0;

    const a = PHASE_PARAMS[idx];
    const b = PHASE_PARAMS[next];

    phaseFieldScaleMul = lerp(a.fieldScaleMul, b.fieldScaleMul, m);
    phaseSpeedMul = lerp(a.speedMul, b.speedMul, m);
    phaseBgBiasAlpha = lerp(a.bgBiasAlpha, b.bgBiasAlpha, m);
    phaseFadeAlpha = lerp(a.fadeAlpha, b.fadeAlpha, m);

    fieldScale = baseFieldScale * phaseFieldScaleMul;
  }

  function ensureBuffer(){
    if (buf && bctx) return;
    buf = document.createElement('canvas');
    buf.width = w;
    buf.height = h;
    bctx = buf.getContext('2d');
  }

  function ensureBackground(){
    if (bg && bgctx) return;
    bg = document.createElement('canvas');
    bg.width = w;
    bg.height = h;
    bgctx = bg.getContext('2d');

    const hue0 = (texRand()*360) | 0;
    const hue1 = (hue0 + 22 + ((texRand()*18) | 0)) % 360;

    bgctx.setTransform(1,0,0,1,0,0);
    bgctx.globalCompositeOperation = 'source-over';
    bgctx.globalAlpha = 1;

    const g = bgctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, `hsl(${hue0},45%,7%)`);
    g.addColorStop(0.6, `hsl(${hue1},55%,5%)`);
    g.addColorStop(1, 'rgb(3,4,10)');
    bgctx.fillStyle = g;
    bgctx.fillRect(0,0,w,h);

    // Subtle vignette so the edges feel less digital/flat.
    bgctx.globalCompositeOperation = 'multiply';
    const vg = bgctx.createRadialGradient(
      w*0.5,
      h*0.42,
      Math.min(w,h)*0.15,
      w*0.5,
      h*0.42,
      Math.max(w,h)*0.85
    );
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.70)');
    bgctx.fillStyle = vg;
    bgctx.fillRect(0,0,w,h);

    bgctx.globalCompositeOperation = 'source-over';
    bgctx.globalAlpha = 1;
  }

  function ensureMist(){
    if (mist && mistctx) return;
    mist = document.createElement('canvas');
    mist.width = MIST_SIZE;
    mist.height = MIST_SIZE;
    mistctx = mist.getContext('2d');

    const img = mistctx.createImageData(MIST_SIZE, MIST_SIZE);
    for (let i=0; i<img.data.length; i+=4){
      const v = 120 + ((texRand()*120) | 0);
      img.data[i+0] = v;
      img.data[i+1] = v;
      img.data[i+2] = v;
      img.data[i+3] = 18 + ((texRand()*52) | 0);
    }
    mistctx.putImageData(img, 0, 0);
  }

  function clearBuffer(){
    ensureBuffer();
    ensureBackground();

    bctx.setTransform(1,0,0,1,0,0);
    bctx.globalCompositeOperation = 'source-over';
    bctx.globalAlpha = 1;
    bctx.drawImage(bg, 0, 0);
  }

  function init({ width, height }){
    w=width; h=height; t=0; acc = 0;

    baseFieldScale = 0.0015 + (Math.min(w,h)/1000)*0.0012;
    baseSpeed = 25 * (h/540);

    phaseRand = mulberry32((seed ^ 0xC2B2AE35) >>> 0);
    buildPhasePlan();
    applyPhase(0);

    texRand = mulberry32((seed ^ 0x9E3779B9) >>> 0);
    reseedRand = mulberry32((seed ^ 0x85EBCA6B) >>> 0);
    reseedClock = 0;
    mistFilter = `blur(${Math.max(12, Math.floor(Math.min(w,h)/90))}px)`;

    pts = Array.from({ length: 1600 }, () => ({
      x: rand()*w,
      y: rand()*h,
      hue: (rand()*360)|0,
      a: 0.04 + rand()*0.07,
    }));

    buf = null;
    bctx = null;
    bg = null;
    bgctx = null;
    mist = null;
    mistctx = null;

    clearBuffer();
  }

  function onResize(width, height){ w=width; h=height; init({ width, height }); }
  function onAudioOn(){}
  function onAudioOff(){}
  function destroy(){}

  function flowAngle(x, y){
    const nx = x*fieldScale;
    const ny = y*fieldScale;
    // cheap pseudo-noise
    const v = Math.sin(nx*2.3 + t*0.3) + Math.cos(ny*2.1 - t*0.27) + Math.sin((nx+ny)*1.4);
    return v * Math.PI;
  }

  function reseedSomePoints(){
    const n = Math.max(1, Math.floor(pts.length * RESEED_FRACTION));
    for (let i = 0; i < n; i++){
      const idx = (reseedRand() * pts.length) | 0;
      const p = pts[idx];
      p.x = reseedRand() * w;
      p.y = reseedRand() * h;
      p.hue = (reseedRand() * 360) | 0;
    }
  }

  function stepSim(dt){
    t += dt;
    applyPhase(t);

    for (const p of pts){
      const a = flowAngle(p.x,p.y);
      const sp = baseSpeed * phaseSpeedMul;
      p.x += Math.cos(a) * sp * dt;
      p.y += Math.sin(a) * sp * dt;
      if (p.x < 0) p.x += w;
      if (p.x > w) p.x -= w;
      if (p.y < 0) p.y += h;
      if (p.y > h) p.y -= h;
      p.hue = (p.hue + dt*6) % 360;
    }

    reseedClock += dt;
    if (reseedClock >= RESEED_INTERVAL_S){
      reseedClock -= RESEED_INTERVAL_S;
      reseedSomePoints();
    }

    // Advance the paint buffer at the same fixed timestep.
    ensureBuffer();
    ensureBackground();

    bctx.setTransform(1,0,0,1,0,0);

    // Gently re-bias towards the cached background so the scene reads
    // less like pure black + neon trails, without per-frame allocations.
    bctx.globalCompositeOperation = 'source-over';
    bctx.globalAlpha = phaseBgBiasAlpha;
    bctx.drawImage(bg, 0, 0);

    // subtle fade (avoid per-step rgba string allocations by using globalAlpha)
    bctx.globalAlpha = phaseFadeAlpha;
    bctx.fillStyle = 'rgb(5,6,12)';
    bctx.fillRect(0,0,w,h);

    bctx.save();
    bctx.globalCompositeOperation = 'lighter';
    let lastB = -1;
    for (const p of pts){
      const b = ((p.hue * HUE_BUCKETS) / 360) | 0;
      if (b !== lastB){
        bctx.fillStyle = hueStyles[b];
        lastB = b;
      }
      bctx.globalAlpha = p.a;
      bctx.fillRect(p.x, p.y, 1.2, 1.2);
    }
    bctx.restore();
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
  }

  function render(ctx){
    ctx.setTransform(1,0,0,1,0,0);

    if (buf) ctx.drawImage(buf, 0, 0);
    else {
      ensureBackground();
      ctx.drawImage(bg, 0, 0);
    }

    // Midground mist/grain layer: cached tile, slow deterministic drift.
    ensureMist();
    ctx.save();
    ctx.globalCompositeOperation = 'soft-light';
    ctx.globalAlpha = 0.14;
    ctx.filter = mistFilter;

    const ox = -((t * 10) % MIST_SIZE);
    const oy = -((t * 7) % MIST_SIZE);
    for (let x = ox - MIST_SIZE; x < w + MIST_SIZE; x += MIST_SIZE){
      for (let y = oy - MIST_SIZE; y < h + MIST_SIZE; y += MIST_SIZE){
        ctx.drawImage(mist, x, y);
      }
    }
    ctx.restore();

    // header
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0,0,w, Math.floor(h*0.12));
    ctx.fillStyle = 'rgba(231,238,246,0.75)';
    ctx.font = `${Math.floor(h/18)}px ui-sans-serif, system-ui`;
    ctx.fillText('FLOW FIELD', w*0.05, h*0.09);
    ctx.restore();
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
