import { mulberry32 } from '../util/prng.js';

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);
  let w=0,h=0,t=0;
  let palette=[];

  function init({width,height}){
    w=width; h=height; t=0;
    const base = rand()*360;
    palette = [0,40,120,200].map((d,i)=>`hsl(${(base+d)%360} ${70+i*5}% ${55-i*6}%)`);
  }

  function onResize(width,height){ w=width; h=height; }
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
    const slices = 12;
    const R = Math.max(w,h)*0.7;

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
      ctx.arc(0,0,R, -Math.PI/slices, Math.PI/slices);
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

      // sparkle dots
      ctx.globalAlpha = 0.28;
      for (let i=0;i<18;i++){
        const rr = rand()*R*0.7;
        const aa = -Math.PI/slices + rand()*(2*Math.PI/slices);
        const x = Math.cos(aa)*rr;
        const y = Math.sin(aa)*rr;
        ctx.fillStyle = 'rgba(255,255,255,0.45)';
        ctx.fillRect(x,y,1,1);
      }

      ctx.restore();
    }

    ctx.restore();

    // soft vignette
    const vg = ctx.createRadialGradient(cx,cy, Math.min(w,h)*0.25, cx,cy, Math.max(w,h)*0.65);
    vg.addColorStop(0,'rgba(0,0,0,0)');
    vg.addColorStop(1,'rgba(0,0,0,0.55)');
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
