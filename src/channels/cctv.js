// REVIEWED: 2026-02-10
import { mulberry32 } from '../util/prng.js';

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);
  const seed32 = (seed|0) >>> 0;
  const clockBaseSeconds = (Math.imul(seed32 ^ 0x9e3779b9, 2654435761) >>> 0) % 86400;

  let w=0,h=0,t=0;
  let cams=[];
  let noiseHandle=null; // audio.noiseSource handle
  let audioHandle=null; // {stop()}
  let nextMotion=0;

  function init({width,height}){
    w=width; h=height; t=0;
    cams = Array.from({length: 4}, (_,i)=>({
      id:i,
      ph: rand()*10,
      boxes: [],
      msg: 'IDLE',
    }));
    nextMotion = 0.6 + rand()*2.0;
  }

  function onResize(width,height){ w=width; h=height; }

  function onAudioOn(){
    if (!audio.enabled) return;

    // Defensive hygiene: if called twice while audio is on, avoid stacking noise sources.
    onAudioOff();

    const hdl = audio.noiseSource({ type:'white', gain:0.006 });
    hdl.start();
    noiseHandle = hdl;

    audioHandle = {
      stop(){
        try { hdl.stop?.(); } catch {}
        if (noiseHandle === hdl) noiseHandle = null;
      },
    };
    audio.setCurrent(audioHandle);
  }

  function onAudioOff(){
    // Stop the source we started.
    try { noiseHandle?.stop?.(); } catch {}
    noiseHandle = null;

    // If our handle is still registered as current, clear it.
    try {
      if (audio.current === audioHandle) audio.stopCurrent();
      else audioHandle?.stop?.();
    } catch {}
    audioHandle = null;
  }

  function destroy(){ onAudioOff(); }

  function spawnMotion(cam){
    cam.boxes = Array.from({length: 1 + (rand()*3)|0}, ()=>({
      x: rand()*0.7,
      y: rand()*0.6,
      w: 0.15 + rand()*0.25,
      h: 0.12 + rand()*0.25,
      life: 0.25 + rand()*0.8,
      max: 0.25 + rand()*0.8,
    }));
    cam.msg = rand()<0.5 ? 'MOTION' : 'TRACK';
    if (audio.enabled) audio.beep({freq: 260 + rand()*60, dur: 0.03, gain: 0.02, type:'square'});
  }

  function update(dt){
    t += dt;
    for (const cam of cams){
      cam.boxes = cam.boxes.filter(b => (b.life -= dt) > 0);
      if (cam.boxes.length === 0) cam.msg = 'IDLE';
    }

    nextMotion -= dt;
    if (nextMotion <= 0){
      nextMotion = 0.7 + rand()*2.5;
      spawnMotion(cams[(rand()*cams.length)|0]);
    }
  }

  function formatClock(totalSeconds){
    const s = ((totalSeconds % 86400) + 86400) % 86400;
    const hh = (s/3600) | 0;
    const mm = ((s%3600)/60) | 0;
    const ss = (s%60) | 0;
    const pad2 = (n)=> String(n).padStart(2,'0');
    return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`;
  }

  function renderCam(ctx, cam, x, y, cw, ch, ts){

    // background
    ctx.fillStyle = 'rgba(0,0,0,0.9)';
    ctx.fillRect(x,y,cw,ch);

    // fake scene: moving light + noise
    ctx.save();
    ctx.globalAlpha = 0.25;
    for (let i=0;i<120;i++){
      const px = x + ((i*97 + t*120) % cw);
      const py = y + ((i*53 + t*70) % ch);
      ctx.fillStyle = 'rgba(200,255,210,0.12)';
      ctx.fillRect(px, py, 1, 1);
    }
    ctx.restore();

    const lx = x + cw*(0.2 + 0.6*(0.5+0.5*Math.sin(t*0.4+cam.ph)));
    const ly = y + ch*(0.2 + 0.6*(0.5+0.5*Math.cos(t*0.33+cam.ph)));
    const lg = ctx.createRadialGradient(lx,ly,0,lx,ly, cw*0.6);
    lg.addColorStop(0,'rgba(120,255,160,0.10)');
    lg.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(x,y,cw,ch);

    // boxes
    ctx.save();
    ctx.strokeStyle = 'rgba(120,255,160,0.85)';
    ctx.lineWidth = 2;
    for (const b of cam.boxes){
      const a = b.life/b.max;
      ctx.globalAlpha = 0.25 + 0.75*a;
      ctx.strokeRect(x + b.x*cw, y + b.y*ch, b.w*cw, b.h*ch);
    }
    ctx.restore();

    // overlays
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(x,y,cw, 24);
    ctx.fillStyle = 'rgba(180,255,210,0.9)';
    ctx.font = '14px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    ctx.fillText(`CAM ${cam.id+1}  ${cam.msg}`, x+8, y+17);
    ctx.fillText(ts, x+cw-110, y+17);
    ctx.restore();
  }

  function render(ctx){
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,w,h);

    // overall
    ctx.fillStyle = '#05070a';
    ctx.fillRect(0,0,w,h);

    const pad = 18;
    const cw = (w - pad*3)/2;
    const ch = (h - pad*3)/2;
    const ts = formatClock(clockBaseSeconds + (t|0));

    renderCam(ctx, cams[0], pad, pad, cw, ch, ts);
    renderCam(ctx, cams[1], pad*2 + cw, pad, cw, ch, ts);
    renderCam(ctx, cams[2], pad, pad*2 + ch, cw, ch, ts);
    renderCam(ctx, cams[3], pad*2 + cw, pad*2 + ch, cw, ch, ts);

    // label bar
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0,0,w, Math.floor(h*0.12));
    ctx.fillStyle = 'rgba(231,238,246,0.85)';
    ctx.font = `${Math.floor(h/18)}px ui-sans-serif, system-ui`;
    ctx.fillText('CCTV NIGHT WATCH', w*0.05, h*0.09);
    ctx.restore();
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
