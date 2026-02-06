import { mulberry32 } from '../util/prng.js';

const WORDS = [
  'platypus','meteor','quantum','mushroom','satellite','fudge','hologram','sausage','tornado','waffle',
  'dolphin','caffeine','robot','cabbage','penguin','volcano','biscuit','mystery','dungeon','laser',
  'unicorn','traffic','anomaly','banana','pancake','spacetime','librarian','wizard','sock','chimera',
];

function headline(rand){
  const w = (n)=>WORDS[(rand()*WORDS.length)|0];
  const caps=(s)=>s.charAt(0).toUpperCase()+s.slice(1);
  const a = caps(w());
  const b = w();
  const c = w();
  const forms = [
    `${a} spotted near ${b} festival; experts baffled`,
    `${a} economy enters ${b}-${c} phase`,
    `Local ${b} reveals surprising ${c} workaround`,
    `${a} declares "${b}"; markets respond with ${c}`,
    `BREAKING: ${a} causes mild ${b} incident, ${c} deployed`,
  ];
  return forms[(rand()*forms.length)|0];
}

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);
  let w=0,h=0,t=0;
  let tickerX=0;
  let headlines=[];
  let logo = {x:40,y:40,vx:120,vy:90};
  let murmur=null;

  function init({width,height}){
    w=width; h=height; t=0;
    headlines = Array.from({length: 18}, () => headline(rand));
    tickerX = w;
    logo = {x:w*0.2,y:h*0.25,vx: 160+rand()*100, vy: 120+rand()*80};
  }

  function onResize(width,height){ w=width; h=height; }

  function onAudioOn(){
    if (!audio.enabled) return;
    const n = audio.noiseSource({type:'brown', gain:0.02});
    n.start();
    murmur = {stop(){n.stop();}};
    audio.setCurrent(murmur);
  }
  function onAudioOff(){ try{murmur?.stop?.();}catch{} murmur=null; }
  function destroy(){ onAudioOff(); }

  function update(dt){
    t += dt;
    tickerX -= dt*(140 + (w/12));
    if (tickerX < -measureTickerWidth()){
      tickerX = w;
      // rotate headlines
      headlines.shift();
      headlines.push(headline(rand));
      if (audio.enabled) audio.beep({freq: 520, dur: 0.04, gain: 0.04, type:'triangle'});
    }

    // logo bounce
    logo.x += logo.vx*dt;
    logo.y += logo.vy*dt;
    const pad = 18;
    if (logo.x < pad || logo.x > w - pad - 140) logo.vx *= -1;
    if (logo.y < pad || logo.y > h*0.65) logo.vy *= -1;
  }

  function measureTickerWidth(){
    // approximate
    return (headlines.join('  •  ').length) * (h/40) * 10;
  }

  function render(ctx){
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,w,h);

    // studio background
    const bg = ctx.createLinearGradient(0,0,w,h);
    bg.addColorStop(0,'#0a0e18');
    bg.addColorStop(1,'#07141a');
    ctx.fillStyle = bg;
    ctx.fillRect(0,0,w,h);

    // diagonal shapes
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = '#1f2b55';
    ctx.beginPath();
    ctx.moveTo(0,h*0.15);
    ctx.lineTo(w*0.75,0);
    ctx.lineTo(w,0);
    ctx.lineTo(w,h*0.35);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = '#3a1747';
    ctx.beginPath();
    ctx.moveTo(0,h*0.55);
    ctx.lineTo(w,h*0.25);
    ctx.lineTo(w,h*0.65);
    ctx.lineTo(0,h*0.85);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // "live" bug
    ctx.save();
    ctx.fillStyle = 'rgba(255,75,216,0.85)';
    ctx.font = `${Math.floor(h/32)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText('LIVE', w*0.05, h*0.12);
    ctx.fillStyle = 'rgba(231,238,246,0.8)';
    ctx.fillText(new Date().toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}), w*0.12, h*0.12);
    ctx.restore();

    // bouncing logo
    ctx.save();
    ctx.translate(logo.x, logo.y);
    ctx.rotate(Math.sin(t*0.8)*0.06);
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(6,6,150,54);
    ctx.fillStyle = 'rgba(108,242,255,0.92)';
    ctx.fillRect(0,0,150,54);
    ctx.fillStyle = 'rgba(0,0,0,0.8)';
    ctx.font = `${Math.floor(h/28)}px ui-sans-serif, system-ui`;
    ctx.fillText('ODD NEWS', 14, 36);
    ctx.restore();

    // anchor text
    ctx.save();
    ctx.fillStyle = 'rgba(231,238,246,0.9)';
    ctx.font = `${Math.floor(h/16)}px ui-serif, Georgia, serif`;
    ctx.fillText(headlines[0], w*0.05, h*0.48);
    ctx.fillStyle = 'rgba(231,238,246,0.65)';
    ctx.font = `${Math.floor(h/24)}px ui-sans-serif, system-ui`;
    ctx.fillText('More on this story as the situation becomes increasingly narratable.', w*0.05, h*0.54);
    ctx.restore();

    // ticker bar
    const barH = Math.floor(h*0.12);
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(0,h-barH,w,barH);
    ctx.fillStyle = 'rgba(108,242,255,0.9)';
    ctx.fillRect(0,h-barH, w, 3);

    ctx.save();
    ctx.beginPath();
    ctx.rect(0,h-barH,w,barH);
    ctx.clip();
    ctx.font = `${Math.floor(h/26)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = 'rgba(231,238,246,0.92)';
    const txt = headlines.join('  •  ');
    ctx.fillText(txt, tickerX, h - barH/2 + 10);
    ctx.restore();
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
