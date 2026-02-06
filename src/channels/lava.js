import { mulberry32, clamp } from '../util/prng.js';

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);
  let w=0,h=0,t=0;
  let blobs=[];
  let hum=null;

  function init({width,height}){
    w=width; h=height; t=0;
    blobs = Array.from({length: 7}, () => ({
      x: rand()*w,
      y: rand()*h,
      vx: (rand()*2-1) * (30+w/30),
      vy: (rand()*2-1) * (30+h/30),
      r: (80+rand()*170) * (h/540),
      hue: 290 + rand()*60,
      ph: rand()*10,
    }));
  }

  function onResize(width,height){ w=width; h=height; }

  function onAudioOn(){
    if (!audio.enabled) return;
    const n = audio.noiseSource({type:'brown', gain:0.012});
    n.start();
    hum = { stop(){ n.stop(); } };
    audio.setCurrent(hum);
  }
  function onAudioOff(){ try{hum?.stop?.();}catch{} hum=null; }
  function destroy(){ onAudioOff(); }

  function update(dt){
    t += dt;
    for (const b of blobs){
      b.x += b.vx*dt;
      b.y += b.vy*dt;
      // soft bounds
      if (b.x < -b.r) { b.x = w + b.r; }
      if (b.x > w + b.r) { b.x = -b.r; }
      if (b.y < -b.r) { b.y = h + b.r; }
      if (b.y > h + b.r) { b.y = -b.r; }
      b.vx += Math.sin(t*0.6 + b.ph)*0.3;
      b.vy += Math.cos(t*0.7 + b.ph)*0.3;
      b.vx = clamp(b.vx, -220, 220);
      b.vy = clamp(b.vy, -220, 220);
    }
  }

  function render(ctx){
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,w,h);

    // background
    const bg = ctx.createLinearGradient(0,0,0,h);
    bg.addColorStop(0,'#090018');
    bg.addColorStop(1,'#010208');
    ctx.fillStyle = bg;
    ctx.fillRect(0,0,w,h);

    // blob field
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.filter = `blur(${Math.max(6, Math.floor(h/80))}px)`;
    for (const b of blobs){
      const rr = b.r * (0.9 + 0.1*Math.sin(t*0.7 + b.ph));
      const g = ctx.createRadialGradient(b.x,b.y, 0, b.x,b.y, rr);
      g.addColorStop(0, `hsla(${b.hue},90%,60%,0.65)`);
      g.addColorStop(0.6, `hsla(${b.hue+20},90%,55%,0.22)`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(b.x,b.y, rr, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.restore();

    // glass shine
    ctx.save();
    const shine = ctx.createLinearGradient(0,0,w,0);
    shine.addColorStop(0,'rgba(255,255,255,0.0)');
    shine.addColorStop(0.2,'rgba(255,255,255,0.05)');
    shine.addColorStop(0.35,'rgba(255,255,255,0.02)');
    shine.addColorStop(1,'rgba(255,255,255,0.0)');
    ctx.fillStyle = shine;
    ctx.fillRect(0,0,w,h);
    ctx.restore();

    // label
    ctx.save();
    ctx.font = `${Math.floor(h/18)}px ui-rounded, ui-sans-serif, system-ui`;
    ctx.fillStyle = 'rgba(255,220,255,0.75)';
    ctx.shadowColor = 'rgba(255,75,216,0.7)';
    ctx.shadowBlur = 10;
    ctx.fillText('LAVA LAMP', w*0.05, h*0.12);
    ctx.restore();
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
