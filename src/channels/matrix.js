import { mulberry32 } from '../util/prng.js';

const GLYPHS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789#$%&*+<>~';

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);
  let w=0,h=0,t=0;
  let cols=[];
  let cell=18;
  let hiss=null;
  let nextClick=0;

  function init({width,height}){
    w=width; h=height; t=0;
    cell = Math.max(14, Math.floor(Math.min(w,h)/34));
    const n = Math.ceil(w/cell);
    cols = Array.from({length:n}, (_,i)=>({
      x: i*cell,
      y: rand()*-h,
      sp: (80+rand()*240) * (h/540),
      len: 8 + (rand()*22)|0,
      ph: rand()*10,
    }));
    nextClick = 0.2;
  }

  function onResize(width,height){ w=width; h=height; init({width,height}); }

  function onAudioOn(){
    if (!audio.enabled) return;
    const n = audio.noiseSource({type:'white', gain:0.012});
    n.start();
    hiss = {stop(){n.stop();}};
    audio.setCurrent(hiss);
  }
  function onAudioOff(){ try{hiss?.stop?.();}catch{} hiss=null; }
  function destroy(){ onAudioOff(); }

  function update(dt){
    t += dt;
    for (const c of cols){
      c.y += c.sp*dt;
      if (c.y > h + c.len*cell) c.y = rand()*-h;
    }
    nextClick -= dt;
    if (nextClick <= 0){
      nextClick = 0.08 + rand()*0.25;
      if (audio.enabled) audio.beep({freq: 1400 + rand()*900, dur: 0.015, gain: 0.02, type:'square'});
    }
  }

  function glyph(){
    return GLYPHS[(rand()*GLYPHS.length)|0];
  }

  function render(ctx){
    ctx.setTransform(1,0,0,1,0,0);
    // motion blur / decay
    ctx.fillStyle = 'rgba(0,0,0,0.25)';
    ctx.fillRect(0,0,w,h);

    ctx.font = `${cell}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'top';

    for (const c of cols){
      for (let i=0;i<c.len;i++){
        const y = c.y - i*cell;
        if (y < -cell || y > h) continue;
        const a = 1 - i/c.len;
        const head = i===0;
        ctx.fillStyle = head ? `rgba(210,255,230,${0.9})` : `rgba(80,255,140,${0.06 + 0.35*a})`;
        const ch = glyph();
        ctx.fillText(ch, c.x, y);
      }
    }

    // overlay title
    ctx.save();
    ctx.fillStyle = 'rgba(80,255,140,0.35)';
    ctx.fillRect(0,0,w, Math.floor(h*0.12));
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.font = `${Math.floor(h/22)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText('TERMINAL RAIN — ACCESS GRANTED', w*0.05, h*0.045);
    ctx.restore();
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
