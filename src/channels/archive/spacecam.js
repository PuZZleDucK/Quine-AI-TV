import { mulberry32 } from '../util/prng.js';

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);
  let w=0,h=0,t=0;
  let stars=[];
  let neb=[];
  let sat=null;
  let radio=null;
  let nextBeep=0;

  function init({width,height}){
    w=width; h=height; t=0;
    stars = Array.from({length: 900}, () => ({
      x: rand()*w,
      y: rand()*h,
      z: 0.2 + rand()*0.8,
      tw: rand()*10,
    }));
    neb = Array.from({length: 60}, () => ({
      x: rand()*w,
      y: rand()*h,
      r: (60+rand()*220)*(h/540),
      hue: 190 + rand()*120,
      a: 0.03 + rand()*0.07,
      ph: rand()*10,
    }));
    sat = {
      x: -w*0.2,
      y: h*(0.25+rand()*0.5),
      vx: (40+rand()*80)*(w/960),
      phase: rand()*10,
    };
    nextBeep = 0.7 + rand()*1.8;
  }

  function onResize(width,height){ w=width; h=height; }

  function onAudioOn(){
    if (!audio.enabled) return;
    const n = audio.noiseSource({type:'pink', gain:0.012});
    n.start();
    radio = {stop(){n.stop();}};
    audio.setCurrent(radio);
  }
  function onAudioOff(){ try{radio?.stop?.();}catch{} radio=null; }
  function destroy(){ onAudioOff(); }

  function update(dt){
    t += dt;
    // satellite drift
    sat.x += sat.vx*dt;
    sat.y += Math.sin(t*0.6 + sat.phase) * (h*0.002);
    if (sat.x > w*1.2){
      sat.x = -w*0.2;
      sat.y = h*(0.2+rand()*0.6);
      sat.vx = (50+rand()*90)*(w/960);
    }

    nextBeep -= dt;
    if (nextBeep <= 0){
      nextBeep = 0.8 + rand()*2.2;
      if (audio.enabled) audio.beep({freq: 650 + rand()*900, dur: 0.03, gain: 0.03, type:'sine'});
    }
  }

  function render(ctx){
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,w,h);

    // deep space
    const bg = ctx.createLinearGradient(0,0,0,h);
    bg.addColorStop(0,'#020315');
    bg.addColorStop(1,'#000008');
    ctx.fillStyle = bg;
    ctx.fillRect(0,0,w,h);

    // nebula clouds
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const n of neb){
      const rr = n.r * (0.9 + 0.1*Math.sin(t*0.15 + n.ph));
      const g = ctx.createRadialGradient(n.x,n.y, 0, n.x,n.y, rr);
      g.addColorStop(0, `hsla(${n.hue},90%,60%,${n.a})`);
      g.addColorStop(0.55, `hsla(${(n.hue+40)%360},90%,55%,${n.a*0.35})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(n.x,n.y, rr, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.restore();

    // stars
    ctx.save();
    for (const s of stars){
      const tw = 0.4 + 0.6*Math.sin(t*0.8 + s.tw);
      const a = 0.10 + 0.55*tw;
      ctx.fillStyle = `rgba(220,240,255,${a})`;
      ctx.fillRect(s.x, s.y, 1.2*s.z, 1.2*s.z);
    }
    ctx.restore();

    // satellite silhouette
    ctx.save();
    ctx.translate(sat.x, sat.y);
    ctx.fillStyle = 'rgba(220,240,255,0.45)';
    ctx.fillRect(-18, -4, 36, 8);
    ctx.fillRect(-42, -14, 18, 28);
    ctx.fillRect(24, -14, 18, 28);
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(-2,-12,4,24);
    ctx.restore();

    // scan UI overlay
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(0,0,w, Math.floor(h*0.14));
    ctx.fillStyle = 'rgba(108,242,255,0.85)';
    ctx.fillRect(0, Math.floor(h*0.14)-3, w, 3);

    ctx.font = `${Math.floor(h/18)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = 'rgba(231,238,246,0.85)';
    ctx.fillText('DEEP SPACE CAM', w*0.05, h*0.1);
    ctx.fillStyle = 'rgba(231,238,246,0.65)';
    ctx.fillText(`SIG ${Math.floor((Math.sin(t*0.7)+1)*50)}%  ·  LAT ${sat.y.toFixed(1)}  ·  PKT ${(t*10|0)%999}`, w*0.05, h*0.135);
    ctx.restore();
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
