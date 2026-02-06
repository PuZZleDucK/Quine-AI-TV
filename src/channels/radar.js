import { mulberry32 } from '../util/prng.js';

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);
  let w=0,h=0,t=0;
  let blips=[];
  let sweep=0;
  let nextPing=0;

  function init({width,height}){
    w=width; h=height; t=0; sweep=0;
    blips = Array.from({length: 24}, () => makeBlip());
    nextPing = 0.4 + rand()*1.2;
  }

  function makeBlip(){
    const r = 0.08 + rand()*0.45;
    const a = rand()*Math.PI*2;
    return {
      r,
      a,
      life: 0.3 + rand()*2.2,
      max: 0.4 + rand()*1.4,
    };
  }

  function onResize(width,height){ w=width; h=height; }

  function onAudioOn(){ /* beeps created in update */ }
  function onAudioOff(){}
  function destroy(){}

  function update(dt){
    t += dt;
    sweep = (sweep + dt*0.55) % 1;

    // decay blips
    for (const b of blips){
      b.life -= dt;
      if (b.life <= 0) Object.assign(b, makeBlip());
    }

    nextPing -= dt;
    if (nextPing <= 0){
      nextPing = 0.8 + rand()*1.6;
      if (audio.enabled) audio.beep({freq: 900 + rand()*240, dur: 0.05, gain: 0.05, type:'sine'});
    }
  }

  function render(ctx){
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,w,h);

    // background
    const bg = ctx.createRadialGradient(w/2,h/2, 0, w/2,h/2, Math.max(w,h)*0.7);
    bg.addColorStop(0,'#00150f');
    bg.addColorStop(1,'#000705');
    ctx.fillStyle = bg;
    ctx.fillRect(0,0,w,h);

    const cx=w/2, cy=h/2;
    const R = Math.min(w,h)*0.42;

    // grid circles
    ctx.save();
    ctx.strokeStyle = 'rgba(120,255,200,0.18)';
    ctx.lineWidth = Math.max(1, Math.floor(h/540));
    for (let i=1;i<=4;i++){
      ctx.beginPath();
      ctx.arc(cx,cy, R*i/4, 0, Math.PI*2);
      ctx.stroke();
    }
    // cross lines
    ctx.beginPath(); ctx.moveTo(cx-R,cy); ctx.lineTo(cx+R,cy); ctx.stroke();
    ctx.beginPath(); ctx.moveTo(cx,cy-R); ctx.lineTo(cx,cy+R); ctx.stroke();
    ctx.restore();

    // blips
    ctx.save();
    for (const b of blips){
      const age = 1 - b.life/b.max;
      const x = cx + Math.cos(b.a) * (b.r*R);
      const y = cy + Math.sin(b.a) * (b.r*R);
      const a = 0.05 + 0.55*Math.max(0,1-age);
      const gg = ctx.createRadialGradient(x,y, 0, x,y, 10);
      gg.addColorStop(0, `rgba(120,255,200,${a})`);
      gg.addColorStop(1, 'rgba(120,255,200,0)');
      ctx.fillStyle = gg;
      ctx.beginPath(); ctx.arc(x,y, 10, 0, Math.PI*2); ctx.fill();
    }
    ctx.restore();

    // sweep beam
    const ang = sweep * Math.PI*2;
    ctx.save();
    ctx.translate(cx,cy);
    ctx.rotate(ang);
    const grad = ctx.createRadialGradient(0,0,0,0,0,R);
    grad.addColorStop(0,'rgba(120,255,200,0.0)');
    grad.addColorStop(0.15,'rgba(120,255,200,0.08)');
    grad.addColorStop(0.6,'rgba(120,255,200,0.03)');
    grad.addColorStop(1,'rgba(120,255,200,0.0)');
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(0,0);
    ctx.arc(0,0,R, -0.18, 0.18);
    ctx.closePath();
    ctx.fill();

    // bright line
    ctx.strokeStyle = 'rgba(160,255,220,0.55)';
    ctx.beginPath(); ctx.moveTo(0,0); ctx.lineTo(R,0); ctx.stroke();
    ctx.restore();

    // frame
    ctx.save();
    ctx.strokeStyle = 'rgba(120,255,200,0.35)';
    ctx.lineWidth = Math.max(2, Math.floor(h/420));
    ctx.beginPath();
    ctx.arc(cx,cy,R+2,0,Math.PI*2);
    ctx.stroke();
    ctx.restore();

    // label
    ctx.save();
    ctx.font = `${Math.floor(h/22)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = 'rgba(170,255,230,0.75)';
    ctx.fillText('WEATHER RADAR', w*0.05, h*0.12);
    ctx.fillStyle = 'rgba(170,255,230,0.55)';
    ctx.fillText(`SWEEP ${(sweep*360)|0}°`, w*0.05, h*0.16);
    ctx.restore();
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
