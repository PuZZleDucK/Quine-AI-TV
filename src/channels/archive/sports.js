import { mulberry32 } from '../../util/prng.js';

const TEAMS = ['Kookaburras','Wombats','Sea Dragons','Pixel FC','Thunder Ducks','Orbital Roos','Laser Koalas','Night Owls'];

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);
  let w=0,h=0,t=0;
  let games=[];
  let nextWhistle=1.2;
  let crowd=null;

  function init({width,height}){
    w=width; h=height; t=0;
    games = Array.from({length: 5}, ()=>makeGame());
    nextWhistle = 0.8 + rand()*1.6;
  }

  function makeGame(){
    const a = TEAMS[(rand()*TEAMS.length)|0];
    let b = TEAMS[(rand()*TEAMS.length)|0];
    if (b===a) b = TEAMS[(rand()*TEAMS.length)|0];
    return {
      a,b,
      sa: (rand()*6)|0,
      sb: (rand()*6)|0,
      q: 1 + (rand()*4)|0,
      clock: 12*60 + (rand()*12*60)|0,
      mood: rand(),
    };
  }

  function onResize(width,height){ w=width; h=height; }

  function onAudioOn(){
    if (!audio.enabled) return;
    const n = audio.noiseSource({type:'brown', gain:0.028});
    n.start();
    crowd = {stop(){n.stop();}};
    audio.setCurrent(crowd);
  }
  function onAudioOff(){ try{crowd?.stop?.();}catch{} crowd=null; }
  function destroy(){ onAudioOff(); }

  function update(dt){
    t += dt;
    for (const g of games){
      g.clock = Math.max(0, g.clock - dt*(8+rand()*4));
      // occasional score change
      if (rand() < 0.02){
        if (rand()<0.5) g.sa += (rand()*2)|0; else g.sb += (rand()*2)|0;
      }
      if (g.clock === 0 && rand() < 0.01){
        Object.assign(g, makeGame());
      }
    }

    nextWhistle -= dt;
    if (nextWhistle <= 0){
      nextWhistle = 1.5 + rand()*3.0;
      if (audio.enabled) audio.beep({freq: 880 + rand()*220, dur: 0.08, gain: 0.05, type:'sine'});
    }
  }

  function mmss(sec){
    const m = Math.floor(sec/60);
    const s = Math.floor(sec%60);
    return `${String(m).padStart(2,'0')}:${String(s).padStart(2,'0')}`;
  }

  function render(ctx){
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,w,h);

    // background
    const bg = ctx.createLinearGradient(0,0,0,h);
    bg.addColorStop(0,'#070b14');
    bg.addColorStop(1,'#0b1a10');
    ctx.fillStyle = bg;
    ctx.fillRect(0,0,w,h);

    // title bar
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(0,0,w, Math.floor(h*0.14));
    ctx.fillStyle = 'rgba(108,242,255,0.9)';
    ctx.fillRect(0, Math.floor(h*0.14)-3, w, 3);

    ctx.save();
    ctx.font = `${Math.floor(h/18)}px ui-sans-serif, system-ui`;
    ctx.fillStyle = 'rgba(231,238,246,0.85)';
    ctx.fillText('SPORTSBOARD 3000', w*0.05, h*0.1);
    ctx.restore();

    // game cards
    const cardW = w*0.9;
    const cardX = w*0.05;
    const cardH = h*0.14;
    for (let i=0;i<games.length;i++){
      const g = games[i];
      const y = h*0.18 + i*(cardH + h*0.02);
      ctx.fillStyle = 'rgba(0,0,0,0.30)';
      ctx.fillRect(cardX, y, cardW, cardH);

      // left stripe
      ctx.fillStyle = `rgba(255,75,216,${0.12+0.12*Math.sin(t+i)})`;
      ctx.fillRect(cardX, y, 6, cardH);

      ctx.save();
      ctx.font = `${Math.floor(h/26)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.fillStyle = 'rgba(231,238,246,0.85)';
      ctx.fillText(`${g.a} vs ${g.b}`, cardX+16, y+cardH*0.42);
      ctx.fillStyle = 'rgba(231,238,246,0.7)';
      ctx.fillText(`Q${g.q}  ${mmss(g.clock)}`, cardX+16, y+cardH*0.75);

      ctx.font = `${Math.floor(h/18)}px ui-sans-serif, system-ui`;
      ctx.fillStyle = 'rgba(108,242,255,0.9)';
      ctx.fillText(String(g.sa), cardX+cardW-90, y+cardH*0.62);
      ctx.fillStyle = 'rgba(255,75,216,0.9)';
      ctx.fillText(String(g.sb), cardX+cardW-50, y+cardH*0.62);
      ctx.restore();
    }

    // tiny sparkline
    ctx.save();
    const sx=w*0.05, sy=h*0.93, sw=w*0.9, sh=h*0.05;
    ctx.strokeStyle = 'rgba(108,242,255,0.5)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    for (let i=0;i<64;i++){
      const x = sx + (i/63)*sw;
      const v = 0.5 + 0.5*Math.sin(t*0.8 + i*0.4) * Math.cos(t*0.3 + i*0.15);
      const y = sy + (1-v)*sh;
      if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
    }
    ctx.stroke();
    ctx.restore();
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
