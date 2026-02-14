import { mulberry32, clamp } from '../util/prng.js';

const PRODUCTS = [
  {name:'Pocket Nebula', tagline:'Genuine-ish cosmic vibes'},
  {name:'Self-Stirring Mug', tagline:'For the truly busy wizard'},
  {name:'Laser Sock Pair', tagline:'Keeps feet warm, intimidates rivals'},
  {name:'Quantum Waffle Iron', tagline:'Breakfast in superposition'},
  {name:'Emergency Cabbage', tagline:'Always have a plan B'},
  {name:'Mini Lava Lamp', tagline:'Hypnosis, but portable'},
  {name:'Tactical Umbrella', tagline:'Rain. Wind. Dramatic exits.'},
  {name:'Retro Keycap Set', tagline:'Type louder. Feel faster.'},
];

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);
  let w=0,h=0,t=0;
  let idx=0;
  let cardT=0;
  let price=0;
  let countdown=20;
  let jingle=null;

  function init({width,height}){
    w=width; h=height; t=0;
    idx = (rand()*PRODUCTS.length)|0;
    cardT = 0;
    price = 9 + ((rand()*180)|0);
    countdown = 14 + (rand()*18)|0;
  }

  function onResize(width,height){ w=width; h=height; }

  function onAudioOn(){
    // a light "shopping channel" bleeps
    if (!audio.enabled) return;
    jingle = {
      stop(){}
    };
    audio.setCurrent(jingle);
  }
  function onAudioOff(){}
  function destroy(){}

  function nextProduct(){
    idx = (idx + 1 + ((rand()*3)|0)) % PRODUCTS.length;
    cardT = 0;
    price = 9 + ((rand()*180)|0);
    countdown = 12 + (rand()*20)|0;
    if (audio.enabled){
      audio.beep({freq: 988, dur: 0.05, gain: 0.045, type:'square'});
      setTimeout(()=>audio.beep({freq: 740, dur:0.05, gain:0.04, type:'triangle'}), 80);
    }
  }

  function update(dt){
    t += dt;
    cardT += dt;
    if (cardT > 9.5) nextProduct();

    // countdown ticks
    const prev = countdown;
    countdown = clamp(countdown - dt, 0, 999);
    if ((prev|0) !== (countdown|0) && audio.enabled && (countdown|0) <= 10){
      audio.beep({freq: 420 + (10-(countdown|0))*30, dur: 0.025, gain: 0.03, type:'sine'});
    }
  }

  function render(ctx){
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,w,h);

    // loud gradient
    const bg = ctx.createLinearGradient(0,0,w,h);
    bg.addColorStop(0,'#24072a');
    bg.addColorStop(0.5,'#0a2133');
    bg.addColorStop(1,'#07201a');
    ctx.fillStyle = bg;
    ctx.fillRect(0,0,w,h);

    // confetti
    ctx.save();
    ctx.globalAlpha = 0.25;
    for (let i=0;i<120;i++){
      const x = (i*97 + (t*80)) % w;
      const y = (i*53 + (t*120)) % h;
      ctx.fillStyle = `hsla(${(i*13 + t*60)%360},90%,60%,0.6)`;
      ctx.fillRect(x, y, 2, 8);
    }
    ctx.restore();

    const p = PRODUCTS[idx];

    // main card
    const cw = w*0.82;
    const ch = h*0.62;
    const cx = w*0.09;
    const cy = h*0.18;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(cx+10, cy+12, cw, ch);

    const gg = ctx.createLinearGradient(cx,cy,cx+cw,cy+ch);
    gg.addColorStop(0,'rgba(108,242,255,0.22)');
    gg.addColorStop(0.5,'rgba(255,75,216,0.18)');
    gg.addColorStop(1,'rgba(255,220,120,0.12)');
    ctx.fillStyle = gg;
    ctx.fillRect(cx, cy, cw, ch);

    ctx.strokeStyle = 'rgba(231,238,246,0.25)';
    ctx.strokeRect(cx, cy, cw, ch);

    // product blob
    const bx = cx + cw*0.72;
    const by = cy + ch*0.45;
    const br = Math.min(w,h)*0.14;
    const blob = ctx.createRadialGradient(bx,by, 0, bx,by, br);
    blob.addColorStop(0, `hsla(${(t*70)%360},90%,65%,0.95)`);
    blob.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = blob;
    ctx.beginPath();
    ctx.arc(bx,by, br, 0, Math.PI*2);
    ctx.fill();

    // text
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.font = `${Math.floor(h/14)}px ui-sans-serif, system-ui`;
    ctx.fillText(p.name, cx+24, cy+90);

    ctx.fillStyle = 'rgba(231,238,246,0.85)';
    ctx.font = `${Math.floor(h/20)}px ui-sans-serif, system-ui`;
    ctx.fillText(p.tagline, cx+26, cy+130);

    ctx.fillStyle = 'rgba(255,220,120,0.95)';
    ctx.font = `${Math.floor(h/10)}px ui-sans-serif, system-ui`;
    ctx.fillText(`$${price}.99`, cx+26, cy+220);

    // call-to-action
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(cx+26, cy+260, cw*0.52, 56);
    ctx.fillStyle = 'rgba(108,242,255,0.95)';
    ctx.font = `${Math.floor(h/20)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText('CALL NOW: 1-800-QUINE-TV', cx+40, cy+298);

    // countdown
    ctx.fillStyle = 'rgba(0,0,0,0.65)';
    ctx.fillRect(cx+cw-190, cy+ch-80, 170, 60);
    ctx.fillStyle = 'rgba(255,75,216,0.95)';
    ctx.font = `${Math.floor(h/22)}px ui-sans-serif, system-ui`;
    ctx.fillText('DEAL ENDS', cx+cw-175, cy+ch-52);
    ctx.fillStyle = 'rgba(231,238,246,0.92)';
    ctx.font = `${Math.floor(h/18)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText(`${Math.ceil(countdown)}s`, cx+cw-95, cy+ch-26);

    ctx.restore();

    // bug
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0,0,w, Math.floor(h*0.12));
    ctx.fillStyle = 'rgba(231,238,246,0.85)';
    ctx.font = `${Math.floor(h/18)}px ui-sans-serif, system-ui`;
    ctx.fillText('HYPERMALL LIVE', w*0.05, h*0.09);
    ctx.restore();
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
