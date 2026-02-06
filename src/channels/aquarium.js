import { mulberry32, clamp } from '../util/prng.js';

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);
  let w=0,h=0,t=0;
  let fish=[], bubbles=[];
  let noiseHandle=null;

  function init({width,height}){
    w=width; h=height; t=0;
    fish = Array.from({length: 10}, (_,i)=>makeFish(i));
    bubbles = Array.from({length: 90}, ()=>makeBubble(true));
  }

  function makeFish(i){
    const dir = rand() < 0.5 ? 1 : -1;
    return {
      x: dir>0 ? -rand()*w*0.6 : w + rand()*w*0.6,
      y: h*(0.18 + rand()*0.72),
      dir,
      sp: (0.25+rand()*0.9) * (w/800),
      amp: (12+rand()*40) * (h/540),
      ph: rand()*Math.PI*2,
      hue: 170 + rand()*120,
      size: (12+rand()*36) * (h/540),
    };
  }

  function makeBubble(reset=false){
    return {
      x: rand()*w,
      y: reset ? h + rand()*h : rand()*h,
      r: (1.5+rand()*6) * (h/540),
      sp: (14+rand()*60) * (h/540),
      drift: (rand()*2-1) * 0.6,
      wob: rand()*10,
      a: 0.08 + rand()*0.25,
    };
  }

  function onResize(width,height){ w=width; h=height; }

  function onAudioOn(){
    if (!audio.enabled) return;
    const hdl = audio.noiseSource({type:'pink', gain:0.03});
    hdl.start();
    noiseHandle = hdl;
    audio.setCurrent({ stop(){ hdl.stop(); } });
  }
  function onAudioOff(){ try{noiseHandle?.stop?.();}catch{} noiseHandle=null; }
  function destroy(){ onAudioOff(); }

  function update(dt){
    t += dt;
    // bubbles
    for (const b of bubbles){
      b.y -= b.sp*dt;
      b.x += Math.sin(t*1.6 + b.wob) * b.drift;
      if (b.y < -20) Object.assign(b, makeBubble(true));
    }
    // fish
    for (let i=0;i<fish.length;i++){
      const f = fish[i];
      f.x += f.dir * (80*f.sp) * dt;
      f.y += Math.sin(t*0.8 + f.ph) * (f.amp*0.02);
      if (f.dir>0 && f.x> w + 80) fish[i]=makeFish(i);
      if (f.dir<0 && f.x< -80) fish[i]=makeFish(i);
      f.y = clamp(f.y, h*0.12, h*0.88);
    }
  }

  function render(ctx){
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,w,h);

    // water gradient
    const g = ctx.createLinearGradient(0,0,0,h);
    g.addColorStop(0,'#041525');
    g.addColorStop(0.5,'#032a33');
    g.addColorStop(1,'#021015');
    ctx.fillStyle = g;
    ctx.fillRect(0,0,w,h);

    // caustics
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = 'rgba(120,255,230,0.8)';
    for (let i=0;i<60;i++){
      const x = (i/60)*w;
      const y = h*0.15 + Math.sin(t*0.8 + i)*h*0.03;
      ctx.fillRect(x, y, w/60, h*0.008);
    }
    ctx.restore();

    // seabed
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0,h*0.86,w,h*0.14);
    // sand specks
    ctx.save();
    ctx.globalAlpha=0.35;
    for (let i=0;i<420;i++){
      const x = (rand()*w)|0;
      const y = (h*0.86 + rand()*h*0.14)|0;
      ctx.fillStyle = `rgba(210,200,160,${0.08+rand()*0.2})`;
      ctx.fillRect(x,y,1,1);
    }
    ctx.restore();

    // fish
    for (const f of fish){
      drawFish(ctx, f);
    }

    // bubbles
    ctx.save();
    for (const b of bubbles){
      const gg = ctx.createRadialGradient(b.x, b.y, 1, b.x, b.y, b.r);
      gg.addColorStop(0, `rgba(255,255,255,${b.a})`);
      gg.addColorStop(0.6, `rgba(190,255,255,${b.a*0.45})`);
      gg.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.arc(b.x, b.y, b.r, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.restore();

    // vignette
    const vg = ctx.createRadialGradient(w/2,h/2, Math.min(w,h)*0.2, w/2,h/2, Math.max(w,h)*0.65);
    vg.addColorStop(0,'rgba(0,0,0,0)');
    vg.addColorStop(1,'rgba(0,0,0,0.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0,0,w,h);

    // label
    ctx.save();
    ctx.font = `${Math.floor(h/20)}px ui-serif, Georgia, serif`;
    ctx.fillStyle = 'rgba(210,255,250,0.75)';
    ctx.shadowColor = 'rgba(0,0,0,0.6)';
    ctx.shadowBlur = 8;
    ctx.fillText('MIDNIGHT AQUARIUM', w*0.05, h*0.12);
    ctx.restore();
  }

  function drawFish(ctx, f){
    const sway = Math.sin(t*4 + f.ph) * 0.25;
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.scale(f.dir, 1);
    ctx.rotate(sway*0.08);

    // body
    const body = ctx.createLinearGradient(-f.size,0,f.size,0);
    body.addColorStop(0, `hsla(${f.hue},85%,60%,0.9)`);
    body.addColorStop(1, `hsla(${(f.hue+40)%360},90%,55%,0.85)`);
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0,0,f.size*1.1,f.size*0.65,0,0,Math.PI*2);
    ctx.fill();

    // tail
    ctx.fillStyle = `hsla(${(f.hue+20)%360},90%,55%,0.75)`;
    ctx.beginPath();
    ctx.moveTo(-f.size*1.1,0);
    ctx.lineTo(-f.size*1.7, -f.size*0.45);
    ctx.lineTo(-f.size*1.65, f.size*0.45);
    ctx.closePath();
    ctx.fill();

    // fin
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = `hsla(${(f.hue+80)%360},80%,60%,0.6)`;
    ctx.beginPath();
    ctx.moveTo(-f.size*0.1,0);
    ctx.quadraticCurveTo(f.size*0.2, -f.size*0.9, f.size*0.55, -f.size*0.2);
    ctx.quadraticCurveTo(f.size*0.2, -f.size*0.1, -f.size*0.1,0);
    ctx.fill();

    // eye
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath(); ctx.arc(f.size*0.55, -f.size*0.1, f.size*0.12,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.beginPath(); ctx.arc(f.size*0.58, -f.size*0.1, f.size*0.06,0,Math.PI*2); ctx.fill();

    ctx.restore();
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
