// REVIEWED: 2026-02-12
import { mulberry32 } from '../util/prng.js';

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);
  let w=0,h=0,t=0;
  let pts=[];
  let fieldScale=0.0025;

  // Fixed-timestep simulation so motion is deterministic across 30fps vs 60fps.
  const FIXED_DT = 1/60;
  const MAX_STEPS_PER_UPDATE = 8;
  let acc = 0;

  // Offscreen buffer so we can advance the "paint" at fixed timesteps too.
  // (Render just blits the buffer + draws UI.)
  let buf = null;
  let bctx = null;

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

  function clearBuffer(){
    ensureBuffer();
    bctx.setTransform(1,0,0,1,0,0);
    bctx.globalCompositeOperation = 'source-over';
    bctx.globalAlpha = 1;
    bctx.fillStyle = 'rgb(5,6,12)';
    bctx.fillRect(0,0,w,h);
  }

  function init({ width, height }){
    w=width; h=height; t=0; acc = 0;
    fieldScale = 0.0015 + (Math.min(w,h)/1000)*0.0012;
    pts = Array.from({ length: 1600 }, () => ({
      x: rand()*w,
      y: rand()*h,
      hue: (rand()*360)|0,
      a: 0.04 + rand()*0.07,
    }));

    buf = null;
    bctx = null;
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

    bctx.setTransform(1,0,0,1,0,0);

    // subtle fade
    bctx.globalCompositeOperation = 'source-over';
    bctx.globalAlpha = 1;
    bctx.fillStyle = 'rgba(5,6,12,0.10)';
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
      ctx.fillStyle = 'rgb(5,6,12)';
      ctx.fillRect(0,0,w,h);
    }

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
