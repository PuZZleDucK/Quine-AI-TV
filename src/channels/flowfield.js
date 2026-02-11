// REVIEWED: 2026-02-12
import { mulberry32 } from '../util/prng.js';

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);
  let w=0,h=0,t=0;
  let pts=[];
  let fieldScale=0.0025;

  function init({width,height}){
    w=width; h=height; t=0;
    fieldScale = 0.0015 + (Math.min(w,h)/1000)*0.0012;
    pts = Array.from({length: 1600}, ()=>({
      x: rand()*w,
      y: rand()*h,
      hue: (rand()*360)|0,
      a: 0.04 + rand()*0.07,
    }));
  }

  function onResize(width,height){ w=width; h=height; init({width,height}); }
  function onAudioOn(){}
  function onAudioOff(){}
  function destroy(){}

  function flowAngle(x,y){
    const nx = x*fieldScale;
    const ny = y*fieldScale;
    // cheap pseudo-noise
    const v = Math.sin(nx*2.3 + t*0.3) + Math.cos(ny*2.1 - t*0.27) + Math.sin((nx+ny)*1.4);
    return v * Math.PI;
  }

  function update(dt){
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
  }

  function render(ctx){
    ctx.setTransform(1,0,0,1,0,0);
    // subtle fade
    ctx.fillStyle = 'rgba(5,6,12,0.10)';
    ctx.fillRect(0,0,w,h);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const p of pts){
      ctx.fillStyle = `hsla(${p.hue},90%,60%,${p.a})`;
      ctx.fillRect(p.x, p.y, 1.2, 1.2);
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
