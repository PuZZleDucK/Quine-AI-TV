import { mulberry32 } from '../util/prng.js';

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);
  let w=0,h=0,t=0;
  let layers=[];
  let drops=[];
  let rain=null;

  function init({width,height}){
    w=width; h=height; t=0;
    layers = [0.35, 0.55, 0.8].map((depth,i)=>makeLayer(depth,i));
    drops = Array.from({length: 520}, ()=>({
      x: rand()*w,
      y: rand()*h,
      sp: (600 + rand()*1200) * (h/540),
      a: 0.05 + rand()*0.12,
    }));
  }

  function makeLayer(depth, i){
    const buildings=[];
    let x=0;
    while (x < w + 100){
      const bw = (40 + rand()*140) * (w/960);
      const bh = (h*(0.25 + rand()*0.55)) * depth;
      buildings.push({x, w:bw, h:bh, winSeed: rand()*999});
      x += bw + (10+rand()*30)*(w/960);
    }
    return {depth, buildings, hue: 220 + i*15};
  }

  function onResize(width,height){ w=width; h=height; init({width,height}); }

  function onAudioOn(){
    if (!audio.enabled) return;
    const n = audio.noiseSource({type:'pink', gain:0.03});
    n.start();
    rain = {stop(){n.stop();}};
    audio.setCurrent(rain);
  }
  function onAudioOff(){ try{rain?.stop?.();}catch{} rain=null; }
  function destroy(){ onAudioOff(); }

  function update(dt){
    t += dt;
    for (const d of drops){
      d.y += d.sp*dt;
      d.x += dt*(80*(w/960));
      if (d.y > h){ d.y = -10; d.x = rand()*w; }
      if (d.x > w) d.x = 0;
    }
  }

  function render(ctx){
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,w,h);

    // sky
    const g = ctx.createLinearGradient(0,0,0,h);
    g.addColorStop(0,'#03081a');
    g.addColorStop(0.65,'#0a0f2a');
    g.addColorStop(1,'#02010a');
    ctx.fillStyle = g;
    ctx.fillRect(0,0,w,h);

    // neon moon
    const mx=w*0.78, my=h*0.22, mr=Math.min(w,h)*0.09;
    const mg = ctx.createRadialGradient(mx,my,0,mx,my,mr);
    mg.addColorStop(0,'rgba(255,255,255,0.9)');
    mg.addColorStop(0.5,'rgba(108,242,255,0.35)');
    mg.addColorStop(1,'rgba(108,242,255,0.0)');
    ctx.fillStyle = mg;
    ctx.beginPath(); ctx.arc(mx,my,mr,0,Math.PI*2); ctx.fill();

    // buildings
    for (const layer of layers){
      for (const b of layer.buildings){
        const baseY = h*0.92;
        const topY = baseY - b.h;
        ctx.fillStyle = `rgba(0,0,0,${0.22 + 0.6*layer.depth})`;
        ctx.fillRect(b.x, topY, b.w, b.h);

        // windows
        const cols = Math.max(2, Math.floor(b.w/18));
        const rows = Math.max(3, Math.floor(b.h/22));
        const ww = b.w/(cols+1);
        const wh = b.h/(rows+1);
        for (let r=1;r<=rows;r++){
          for (let c=1;c<=cols;c++){
            const tw = Math.sin(t*0.5 + b.winSeed + r*0.7 + c*0.9);
            const on = tw > 0.7;
            if (!on) continue;
            const x = b.x + c*ww;
            const y = topY + r*wh;
            ctx.fillStyle = 'rgba(255,200,120,0.22)';
            ctx.fillRect(x,y, ww*0.35, wh*0.35);
          }
        }
      }
    }

    // street glow
    const sg = ctx.createLinearGradient(0,h*0.82,0,h);
    sg.addColorStop(0,'rgba(255,75,216,0)');
    sg.addColorStop(0.6,'rgba(255,75,216,0.10)');
    sg.addColorStop(1,'rgba(108,242,255,0.08)');
    ctx.fillStyle = sg;
    ctx.fillRect(0,h*0.78,w,h*0.22);

    // rain
    ctx.save();
    ctx.strokeStyle = 'rgba(180,220,255,0.18)';
    ctx.lineWidth = Math.max(1, Math.floor(h/720));
    for (const d of drops){
      ctx.globalAlpha = d.a;
      ctx.beginPath();
      ctx.moveTo(d.x, d.y);
      ctx.lineTo(d.x - 10, d.y - 26);
      ctx.stroke();
    }
    ctx.restore();

    // title
    ctx.save();
    ctx.font = `${Math.floor(h/18)}px ui-sans-serif, system-ui`;
    ctx.fillStyle = 'rgba(231,238,246,0.75)';
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 10;
    ctx.fillText('PIXEL CITY NIGHTS', w*0.05, h*0.12);
    ctx.restore();
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
