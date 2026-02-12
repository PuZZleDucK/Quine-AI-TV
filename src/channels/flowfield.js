// REVIEWED: 2026-02-12
import { mulberry32 } from '../util/prng.js';

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);
  let w=0,h=0,t=0;
  let pts=[];
  let fieldScale=0.0025;

  // Separate RNG for cached texture layers so we can add visual richness
  // without affecting the point-field sequence.
  let texRand = mulberry32((seed ^ 0x9E3779B9) >>> 0);

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
    fieldScale = 0.0015 + (Math.min(w,h)/1000)*0.0012;

    texRand = mulberry32((seed ^ 0x9E3779B9) >>> 0);
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

  function stepSim(dt){
    t += dt;

    for (const p of pts){
      const a = flowAngle(p.x,p.y);
      const sp = 25 * (h/540);
      p.x += Math.cos(a) * sp * dt;
      p.y += Math.sin(a) * sp * dt;
      if (p.x < 0) p.x += w;
      if (p.x > w) p.x -= w;
      if (p.y < 0) p.y += h;
      if (p.y > h) p.y -= h;
      p.hue = (p.hue + dt*6) % 360;
    }

    // Advance the paint buffer at the same fixed timestep.
    ensureBuffer();
    ensureBackground();

    bctx.setTransform(1,0,0,1,0,0);

    // Gently re-bias towards the cached background so the scene reads
    // less like pure black + neon trails, without per-frame allocations.
    bctx.globalCompositeOperation = 'source-over';
    bctx.globalAlpha = 0.045;
    bctx.drawImage(bg, 0, 0);

    // subtle fade
    bctx.globalAlpha = 1;
    bctx.fillStyle = 'rgba(5,6,12,0.08)';
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
