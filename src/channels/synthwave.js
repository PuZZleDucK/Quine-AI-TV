import { mulberry32 } from '../util/prng.js';
import { simpleDrone } from '../util/audio.js';

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);
  let w=0,h=0,t=0;
  let stars=[];
  let drone=null;

  function init({width,height}){
    w=width; h=height; t=0;
    stars = Array.from({length: 220}, () => ({
      x: rand()*w,
      y: rand()*h*0.55,
      z: 0.2 + rand()*0.8,
      tw: rand()*10,
    }));
  }

  function onResize(width,height){ w=width; h=height; }

  function onAudioOn(){
    if (!audio.enabled) return;
    drone = simpleDrone(audio, {root: 55, detune: 1.2, gain: 0.06});
    audio.setCurrent(drone);
  }
  function onAudioOff(){ drone?.stop?.(); drone=null; }
  function destroy(){ onAudioOff(); }

  function update(dt){ t += dt; }

  function render(ctx){
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,w,h);

    // sky gradient
    const g = ctx.createLinearGradient(0,0,0,h);
    g.addColorStop(0,'#060018');
    g.addColorStop(0.55,'#14002b');
    g.addColorStop(1,'#04030a');
    ctx.fillStyle = g;
    ctx.fillRect(0,0,w,h);

    // stars
    ctx.save();
    ctx.globalAlpha = 0.9;
    for (const s of stars){
      const tw = 0.35 + 0.65*Math.sin(t*0.9 + s.tw);
      ctx.fillStyle = `rgba(190,240,255,${0.25 + 0.55*tw})`;
      ctx.fillRect(s.x, s.y, 1.2*s.z, 1.2*s.z);
    }
    ctx.restore();

    // sun
    const sunY = h*0.32;
    const sunR = Math.min(w,h)*0.15;
    const sg = ctx.createRadialGradient(w*0.72, sunY, 1, w*0.72, sunY, sunR);
    sg.addColorStop(0,'rgba(255,190,95,0.95)');
    sg.addColorStop(0.55,'rgba(255,75,216,0.55)');
    sg.addColorStop(1,'rgba(255,75,216,0)');
    ctx.fillStyle = sg;
    ctx.beginPath(); ctx.arc(w*0.72, sunY, sunR, 0, Math.PI*2); ctx.fill();

    // scanlines on sun
    ctx.save();
    ctx.globalCompositeOperation = 'source-atop';
    ctx.strokeStyle = 'rgba(0,0,0,0.15)';
    ctx.lineWidth = Math.max(1, Math.floor(h/540));
    for (let y=sunY-sunR; y<sunY+sunR; y += sunR/10){
      ctx.beginPath();
      ctx.moveTo(w*0.72 - sunR, y);
      ctx.lineTo(w*0.72 + sunR, y);
      ctx.stroke();
    }
    ctx.restore();

    // horizon glow
    const hg = ctx.createLinearGradient(0,h*0.5,0,h);
    hg.addColorStop(0,'rgba(108,242,255,0.0)');
    hg.addColorStop(0.55,'rgba(108,242,255,0.12)');
    hg.addColorStop(1,'rgba(108,242,255,0.0)');
    ctx.fillStyle = hg;
    ctx.fillRect(0,h*0.48,w,h);

    // perspective grid
    const horizon = h*0.52;
    ctx.save();
    ctx.translate(w/2, horizon);
    ctx.strokeStyle = 'rgba(108,242,255,0.55)';
    ctx.lineWidth = Math.max(1, Math.floor(h/540));
    // vertical lines
    const cols = 26;
    for (let i=-cols; i<=cols; i++){
      const x = i/cols;
      ctx.globalAlpha = 0.12 + 0.65*(1-Math.abs(x));
      ctx.beginPath();
      ctx.moveTo(x*w*0.65, 0);
      ctx.lineTo(x*w*3.2, h*1.8);
      ctx.stroke();
    }
    // horizontal lines (moving)
    const rows = 24;
    for (let r=0; r<rows; r++){
      const z = (r + (t*3.2)%1) / rows;
      const y = (z*z) * (h*1.6);
      const half = (1 - z) * w*1.8;
      ctx.globalAlpha = 0.06 + 0.7*z;
      ctx.beginPath();
      ctx.moveTo(-half, y);
      ctx.lineTo(half, y);
      ctx.stroke();
    }
    ctx.restore();

    // neon road sign text
    ctx.save();
    ctx.font = `${Math.floor(h/18)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = 'rgba(255,75,216,0.85)';
    ctx.shadowColor = 'rgba(255,75,216,0.7)';
    ctx.shadowBlur = 18;
    const msg = 'CH 01  SYNTHWAVE DRIVE';
    ctx.fillText(msg, w*0.05, h*0.12);
    ctx.restore();
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
