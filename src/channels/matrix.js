// REVIEWED: 2026-02-13
import { mulberry32 } from '../util/prng.js';

const GLYPHS = 'アイウエオカキクケコサシスセソタチツテトナニヌネノ0123456789#$%&*+<>~';

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);
  const pickGlyph = () => GLYPHS[(rand()*GLYPHS.length)|0];

  let w=0,h=0,t=0;
  let cols=[];
  let cell=18;
  let hiss=null;
  let nextClick=0;

  // OSD-safer overlay title: smaller banner + gentle fade + deterministic rotation.
  let titlePeriod = 360;      // seconds (set in init)
  let titleFadePeriod = 20;   // seconds (set in init)
  let titleFadePhase0 = 0;    // 0..1 (set in init)
  let titles = ['TERMINAL RAIN — ACCESS GRANTED'];

  function init({width,height}){
    w=width; h=height; t=0;
    cell = Math.max(14, Math.floor(Math.min(w,h)/34));
    const n = Math.ceil(w/cell);
    cols = Array.from({length:n}, (_,i)=>{
      const len = 8 + (rand()*22)|0;
      return {
        x: i*cell,
        y: rand()*-h,
        sp: (80+rand()*240) * (h/540),
        len,
        ph: rand()*10,
        glyphEvery: 0.08 + rand()*0.06,
        glyphT: rand()*0.08,
        glyphs: Array.from({ length: len }, pickGlyph),
      };
    });
    nextClick = 0.4;

    // deterministic title list + cadence
    const baseTitles = [
      'TERMINAL RAIN — ACCESS GRANTED',
      'TERMINAL RAIN — AUTH OK',
      'TERMINAL RAIN — SHELL READY',
      'TERMINAL RAIN — LINK STABLE',
      'TERMINAL RAIN — PACKET TRACE',
      'TERMINAL RAIN — KEY EXCHANGE',
      'TERMINAL RAIN — NODE ONLINE',
      'TERMINAL RAIN — GREEN MODE',
    ];
    titles = baseTitles.slice();
    for (let i=titles.length-1;i>0;i--){
      const j = (rand()*(i+1))|0;
      const tmp = titles[i];
      titles[i] = titles[j];
      titles[j] = tmp;
    }

    titlePeriod = 300 + ((rand()*180)|0); // 5–8 min
    titleFadePeriod = 14 + rand()*10;    // 14–24 s
    titleFadePhase0 = rand();
  }

  function onResize(width,height){ w=width; h=height; init({width,height}); }

  function onAudioOn(){
    if (!audio.enabled) return;

    // idempotent: don’t stack sources if we already own the current handle
    if (hiss && audio.current===hiss) return;

    // if we have a stale handle (someone else took over), make sure it’s stopped
    if (hiss && audio.current!==hiss){
      try{ hiss.stop?.(); }catch{}
      hiss = null;
    }

    const ctx = audio.ensure();
    const n = audio.noiseSource({type:'white', gain:0.012});
    n.start();

    const handle = {
      stop(){
        // gentle-ish fade, then stop
        try{ n.gain.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.08); }catch{}
        try{ n.src.stop(ctx.currentTime + 0.25); }catch{ try{ n.stop(); }catch{} }
      }
    };

    hiss = audio.setCurrent(handle);
  }

  function onAudioOff(){
    const mine = hiss;
    try{ mine?.stop?.(); }catch{}
    if (audio.current===mine) audio.current = null;
    hiss = null;
  }

  function destroy(){ onAudioOff(); }

  function update(dt){
    t += dt;
    for (const c of cols){
      c.y += c.sp*dt;
      if (c.y > h + c.len*cell){
        c.y = rand()*-h;
        c.glyphEvery = 0.08 + rand()*0.06;
        c.glyphT = 0;
        for (let i=0;i<c.glyphs.length;i++) c.glyphs[i] = pickGlyph();
      }

      c.glyphT += dt;
      // Update glyphs on a fixed cadence so render() is deterministic and FPS-stable.
      while (c.glyphT >= c.glyphEvery){
        c.glyphT -= c.glyphEvery;
        c.glyphs[0] = pickGlyph();
        if (c.glyphs.length > 1 && rand() < 0.35){
          const k = 1 + ((rand()*(c.glyphs.length-1))|0);
          c.glyphs[k] = pickGlyph();
        }
      }
    }
    nextClick -= dt;
    if (nextClick <= 0){
      // less clicky + don’t beep if another channel took over audio.current
      nextClick = 0.25 + rand()*0.65;
      if (audio.enabled && audio.current===hiss){
        audio.beep({freq: 1100 + rand()*600, dur: 0.012, gain: 0.015, type:'square'});
      }
    }
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
        const ch = c.glyphs[i] || ' ';
        ctx.fillText(ch, c.x, y);
      }
    }

    // overlay title (OSD-safer)
    const overlayH = Math.max(cell*2, Math.floor(h*0.085));
    const phase = ((t / titleFadePeriod) + titleFadePhase0) % 1;
    const pulse = 0.5 - 0.5*Math.cos(Math.PI*2*phase); // cosine ease 0..1
    const bannerA = 0.05 + 0.14*pulse;
    const textA = 0.55 + 0.35*pulse;
    const title = titles[(Math.floor(t / titlePeriod) % titles.length) | 0] || titles[0];

    ctx.save();
    ctx.globalAlpha = bannerA;
    ctx.fillStyle = 'rgb(80,255,140)';
    ctx.fillRect(0,0,w, overlayH);

    ctx.globalAlpha = textA;
    ctx.fillStyle = 'rgb(0,0,0)';
    ctx.font = `${Math.floor(h/24)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText(title, w*0.05, overlayH*0.28);
    ctx.restore();
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
