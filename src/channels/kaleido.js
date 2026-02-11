// REVIEWED: 2026-02-12
import { mulberry32 } from '../util/prng.js';

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);
  let w=0,h=0,t=0;
  let palette=[];

  const slices = 12;
  let wedgeSparkles = [];

  let vg = null;
  let vgCtx = null;
  let vgW = 0;
  let vgH = 0;

  function rebuildSparkles(){
    wedgeSparkles = [];

    // Deterministic set of sparkle dots inside a wedge.
    // Positions are generated once (seeded), then animation is time-only.
    for (let i=0;i<24;i++){
      wedgeSparkles.push({
        rFrac: rand()*0.7,
        aFrac: rand(), // [0..1] mapped to wedge angle
        phase: rand()*Math.PI*2,
        speed: 0.7 + rand()*1.4,
        size: rand() < 0.85 ? 1 : 2,
      });
    }
  }

  function ensureVignette(ctx){
    if (vg && vgCtx===ctx && vgW===w && vgH===h) return;
    const cx=w/2, cy=h/2;
    vg = ctx.createRadialGradient(cx,cy, Math.min(w,h)*0.25, cx,cy, Math.max(w,h)*0.65);
    vg.addColorStop(0,'rgba(0,0,0,0)');
    vg.addColorStop(1,'rgba(0,0,0,0.55)');
    vgCtx = ctx;
    vgW = w;
    vgH = h;
  }

  function init({ width, height }){
    w=width; h=height; t=0;
    const base = rand()*360;
    palette = [0,40,120,200].map((d,i)=>`hsl(${(base+d)%360} ${70+i*5}% ${55-i*6}%)`);
    rebuildSparkles();
  }

  function onResize(width, height){ w=width; h=height; }
  function onAudioOn(){}
  function onAudioOff(){}
  function destroy(){}

  function update(dt){ t += dt; }

  function render(ctx){
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,w,h);
    ctx.fillStyle = '#04040a';
    ctx.fillRect(0,0,w,h);

    const cx=w/2, cy=h/2;
    const R = Math.max(w,h)*0.7;
    const halfWedge = Math.PI/slices;

    ctx.save();
    ctx.translate(cx,cy);

    for (let s=0;s<slices;s++){
      ctx.save();
      const ang = (s/slices)*Math.PI*2;
      ctx.rotate(ang);
      if (s%2) ctx.scale(1,-1);

      // draw wedge content
      ctx.beginPath();
      ctx.moveTo(0,0);
      ctx.arc(0,0,R, -halfWedge, halfWedge);
      ctx.closePath();
      ctx.clip();

      // layers
      for (let i=0;i<22;i++){
        const a = t*0.8 + i*0.35;
        const rr = (i/22)*R;
        const x = Math.cos(a*1.7) * rr*0.22;
        const y = Math.sin(a*1.1) * rr*0.18;
        ctx.fillStyle = palette[i%palette.length];
        ctx.globalAlpha = 0.08 + (i/22)*0.12;
        ctx.beginPath();
        ctx.ellipse(x,y, rr*0.25, rr*0.12, a*0.7, 0, Math.PI*2);
        ctx.fill();
      }

      // deterministic sparkle dots (position from init, brightness from time)
      ctx.fillStyle = '#fff';
      for (let i=0;i<wedgeSparkles.length;i++){
        const sp = wedgeSparkles[i];
        const rr = sp.rFrac * R;
        const aa = -halfWedge + sp.aFrac*(2*halfWedge);
        const x = Math.cos(aa)*rr;
        const y = Math.sin(aa)*rr;

        const tw = 0.18 + 0.32*(0.5 + 0.5*Math.sin(t*sp.speed + sp.phase));
        ctx.globalAlpha = tw;
        ctx.fillRect(x,y,sp.size,sp.size);
      }

      ctx.restore();
    }

    ctx.restore();

    // soft vignette (cached per ctx+size)
    ensureVignette(ctx);
    ctx.fillStyle = vg;
    ctx.fillRect(0,0,w,h);

    // label
    ctx.save();
    ctx.fillStyle = 'rgba(231,238,246,0.75)';
    ctx.font = `${Math.floor(h/18)}px ui-sans-serif, system-ui`;
    ctx.fillText('KALEIDOSCOPE', w*0.05, h*0.12);
    ctx.restore();
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
