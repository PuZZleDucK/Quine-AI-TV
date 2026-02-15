// REVIEWED: 2026-02-15
import { mulberry32 } from '../../util/prng.js';

// Ocean Floor Postcards
// Gentle parallax seafloor scenes + one creature fact per card; slow drifting silt.

function pick(rand, a){ return a[(rand() * a.length) | 0]; }

function roundRect(ctx, x, y, w, h, r){
  const rr = Math.min(r, w/2, h/2);
  ctx.beginPath();
  ctx.moveTo(x + rr, y);
  ctx.arcTo(x + w, y, x + w, y + h, rr);
  ctx.arcTo(x + w, y + h, x, y + h, rr);
  ctx.arcTo(x, y + h, x, y, rr);
  ctx.arcTo(x, y, x + w, y, rr);
  ctx.closePath();
}

function lerp(a,b,t){ return a + (b-a)*t; }

const CREATURES = [
  { id:'angler', name:'Anglerfish', zone:'ABYSSAL', hue: 195, fact:'Some species use a glowing lure to attract prey in total darkness.' },
  { id:'dumbo', name:'Dumbo Octopus', zone:'ABYSSAL', hue: 210, fact:'It “flies” by flapping ear-like fins rather than jetting away.' },
  { id:'isopod', name:'Giant Isopod', zone:'BATHYAL', hue: 190, fact:'A deep-sea relative of pillbugs that can survive years between meals.' },
  { id:'tubeworm', name:'Vent Tubeworms', zone:'VENT FIELD', hue: 12, fact:'They have no mouth—symbiotic bacteria provide energy from vent chemicals.' },
  { id:'cucumber', name:'Sea Cucumber', zone:'BENTHIC', hue: 120, fact:'They recycle nutrients by processing sand and detritus across the seafloor.' },
  { id:'vampire', name:'Vampire Squid', zone:'MIDNIGHT', hue: 285, fact:'Not a true squid—its “cloak” display can confuse predators.' },
  { id:'yeticrab', name:'Yeti Crab', zone:'VENT FIELD', hue: 35, fact:'Hairy arms host bacteria that may help detoxify vent water.' },
  { id:'hagfish', name:'Hagfish', zone:'BATHYAL', hue: 45, fact:'It can produce enormous amounts of slime as an instant defense.' },
  { id:'nautilus', name:'Nautilus', zone:'SLOPE', hue: 28, fact:'A living fossil that regulates buoyancy with gas-filled shell chambers.' },
  { id:'coelacanth', name:'Coelacanth', zone:'SLOPE', hue: 170, fact:'Once thought extinct—living populations were only discovered in 1938.' },
  { id:'manta', name:'Manta Ray', zone:'TWILIGHT', hue: 200, fact:'Its “wings” are huge pectoral fins; it filters plankton with gill rakers.' },
  { id:'seastar', name:'Sea Star', zone:'BENTHIC', hue: 330, fact:'Many can regrow lost arms; some can regrow an entire body from one.' },
];

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w=0, h=0, t=0;
  let font=16, small=12;

  // background marine snow
  let snowA = [];
  let snowB = [];

  // segment
  const SEG_DUR = 75;
  let idx = 0;
  let segT = 0;
  let order = [];

  // per segment
  let pal = null;
  let tilt = 0;
  let drift = 0;
  let rocks = [];
  let weeds = [];

  // audio handle
  let ah = null;

  // rare special moment: submersible light sweep (deterministic cadence)
  const sweepRand = mulberry32((((seed ?? 0) ^ 0x5bd1e995) >>> 0));
  let sweep = null; // { t0, dur, dir, band, hue, glints: [{ x, y, r }] }
  let sweepNext = 0;

  function shuffled(arr){
    const a = [...arr];
    for (let i=a.length-1;i>0;i--){
      const j = (rand()*(i+1))|0;
      const tmp=a[i]; a[i]=a[j]; a[j]=tmp;
    }
    return a;
  }

  function creature(){ return order[idx] || CREATURES[0]; }

  function buildPalette(){
    const c = creature();
    const baseHue = (c.hue + (rand()*18-9) + 360) % 360;
    const inkHue = (baseHue + 140 + rand()*40) % 360;
    return {
      ocean0: `hsla(${(baseHue+10)%360}, 72%, 12%, 1)`,
      ocean1: `hsla(${(baseHue+30)%360}, 78%, 6%, 1)`,
      // Slightly darker + higher alpha for better legibility on paper gradients.
      ink: `hsla(${inkHue}, 82%, 66%, 0.98)`,
      inkDim: `hsla(${inkHue}, 65%, 72%, 0.84)`,
      stamp: `hsla(${(baseHue+55)%360}, 85%, 62%, 0.92)`,
      paper0: `hsla(${(baseHue+35)%360}, 28%, 95%, 0.985)`,
      paper1: `hsla(${(baseHue+15)%360}, 20%, 89%, 0.985)`,
      shadow: 'rgba(0,0,0,0.45)',
      deep: baseHue,
    };
  }

  function reseedScene(){
    pal = buildPalette();
    segT = 0;
    tilt = (rand()*2-1)*0.10;
    drift = rand()*10;

    // rocks
    rocks = Array.from({ length: 7 + ((rand()*4)|0) }, ()=>({
      x: 0.12 + rand()*0.76,
      y: 0.62 + rand()*0.28,
      r: 0.04 + rand()*0.09,
      a: rand()*Math.PI*2,
      s: 0.8 + rand()*0.7,
    }));

    // weeds / soft corals
    weeds = Array.from({ length: 11 + ((rand()*8)|0) }, ()=>({
      x: 0.08 + rand()*0.84,
      y: 0.70 + rand()*0.24,
      h: 0.08 + rand()*0.18,
      w: 0.01 + rand()*0.015,
      ph: rand()*10,
      c: (rand()<0.55) ? 'weed' : 'fan',
    }));

    if (audio.enabled){
      // tiny “bubble” cue
      audio.beep({ freq: 520 + rand()*120, dur: 0.035, gain: 0.014, type: 'sine' });
      audio.beep({ freq: 980 + rand()*220, dur: 0.020, gain: 0.010, type: 'triangle' });
    }
  }

  function nextSegment(){
    idx = (idx + 1) % order.length;
    reseedScene();
  }

  function init({ width, height }){
    w = width; h = height; t = 0;
    font = Math.max(14, Math.floor(Math.min(w, h) / 34));
    small = Math.max(11, Math.floor(font * 0.78));

    const nA = Math.floor(620 * (w*h) / (960*540));
    const nB = Math.floor(320 * (w*h) / (960*540));
    snowA = Array.from({ length: nA }, ()=>({
      x: rand()*w, y: rand()*h,
      z: 0.25 + rand()*0.55,
      r: 0.6 + rand()*1.2,
      tw: rand()*10,
    }));
    snowB = Array.from({ length: nB }, ()=>({
      x: rand()*w, y: rand()*h,
      z: 0.65 + rand()*0.9,
      r: 0.8 + rand()*1.6,
      tw: rand()*10,
    }));

    order = shuffled(CREATURES);
    idx = 0;
    pal = null;
    reseedScene();

    sweep = null;
    sweepNext = 120 + sweepRand()*180; // ~2–5 min
  }

  function onResize(width, height){
    w = width; h = height;
    font = Math.max(14, Math.floor(Math.min(w, h) / 34));
    small = Math.max(11, Math.floor(font * 0.78));
  }

  function makeAudioHandle(){
    const ctx = audio.ensure();

    const out = ctx.createGain();
    out.gain.value = 0.78;
    out.connect(audio.master);

    // underwater bed: lowpassed noise + quiet sub sine
    const noise = audio.noiseSource({ type: 'pink', gain: 0.030 });
    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 420;
    lpf.Q.value = 0.75;

    noise.src.disconnect();
    noise.src.connect(noise.gain);
    noise.gain.disconnect();
    noise.gain.connect(lpf);
    lpf.connect(out);

    const o = ctx.createOscillator();
    const og = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = 46 + rand()*10;
    og.gain.value = 0.014;
    o.connect(og);
    og.connect(out);

    noise.start();
    o.start();

    return {
      stop(){
        const now = ctx.currentTime;
        try { out.gain.setTargetAtTime(0.0001, now, 0.10); } catch {}
        try { noise.stop(); } catch {}
        try { o.stop(now + 0.25); } catch {}
      }
    };
  }

  function onAudioOn(){
    if (!audio.enabled) return;
    ah = makeAudioHandle();
    audio.setCurrent(ah);
  }

  function onAudioOff(){
    ah?.stop?.();
    ah = null;
  }

  function destroy(){ onAudioOff(); }

  function update(dt){
    t += dt;
    segT += dt;
    if (segT >= SEG_DUR) nextSegment();

    // special moment timer: rare deterministic sweep (safe reset)
    if (sweep){
      if ((t - sweep.t0) >= sweep.dur) sweep = null;
    } else if (t >= sweepNext){
      const dur = 7.5 + sweepRand()*4.5;
      const dir = (sweepRand() < 0.5) ? 1 : -1;
      const hue = 188 + sweepRand()*36;
      const band = 0.16 + sweepRand()*0.06;
      const glints = Array.from({ length: 14 + ((sweepRand()*10)|0) }, ()=>({
        x: (sweepRand()*2 - 1) * 0.95,
        y: sweepRand(),
        r: 0.7 + sweepRand()*1.0,
      }));

      sweep = { t0: t, dur, dir, hue, band, glints };
      sweepNext = t + (120 + sweepRand()*180); // ~2–5 min cadence

      if (audio.enabled){
        // soft “scanner” signature
        audio.beep({ freq: 820 + sweepRand()*160, dur: 0.040, gain: 0.010, type: 'sine' });
        audio.beep({ freq: 1280 + sweepRand()*260, dur: 0.030, gain: 0.007, type: 'triangle' });
      }
    }

    // marine snow drift
    const dxA = 5.0 * dt;
    const dxB = 12.0 * dt;
    const dyA = 10.0 * dt;
    const dyB = 18.0 * dt;
    for (const s of snowA){
      s.x += dxA * s.z;
      s.y += dyA * s.z;
      if (s.x > w + 4) s.x -= w + 8;
      if (s.y > h + 4) s.y -= h + 8;
    }
    for (const s of snowB){
      s.x += dxB * s.z;
      s.y += dyB * s.z;
      if (s.x > w + 4) s.x -= w + 8;
      if (s.y > h + 4) s.y -= h + 8;
    }
  }

  function drawOceanBg(ctx){
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, pal?.ocean0 || '#031425');
    bg.addColorStop(1, pal?.ocean1 || '#010612');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // faint surface rays near top
    ctx.save();
    ctx.globalAlpha = 0.08;
    ctx.globalCompositeOperation = 'screen';
    for (let i=0;i<7;i++){
      const x = (i/6)*w;
      const gg = ctx.createLinearGradient(x, 0, x + w*0.12, h*0.65);
      gg.addColorStop(0, 'rgba(160,220,255,0.65)');
      gg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.moveTo(x - w*0.12, 0);
      ctx.lineTo(x + w*0.12, 0);
      ctx.lineTo(x + w*0.24, h*0.65);
      ctx.lineTo(x, h*0.65);
      ctx.closePath();
      ctx.fill();
    }
    ctx.restore();

    // vignette
    const vg = ctx.createRadialGradient(w*0.50, h*0.45, 0, w*0.50, h*0.45, Math.max(w,h)*0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.62)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);

    // snow
    for (const s of snowA){
      const tw = 0.45 + 0.55*Math.sin(t*0.7 + s.tw);
      const a = 0.04 + 0.16*tw;
      ctx.fillStyle = `rgba(210,235,255,${a})`;
      ctx.fillRect(s.x, s.y, s.r*s.z, s.r*s.z);
    }
    for (const s of snowB){
      const tw = 0.45 + 0.55*Math.sin(t*0.9 + s.tw);
      const a = 0.06 + 0.22*tw;
      ctx.fillStyle = `rgba(225,245,255,${a})`;
      ctx.fillRect(s.x, s.y, s.r*s.z, s.r*s.z);
    }
  }

  function drawPaperTexture(ctx, x, y, ww, hh){
    const count = Math.floor((ww*hh) / 17000);
    ctx.save();
    ctx.globalAlpha = 0.14;
    for (let i=0;i<count;i++){
      const px = x + rand()*ww;
      const py = y + rand()*hh;
      const a = 0.10 + rand()*0.18;
      ctx.fillStyle = `rgba(0,0,0,${a})`;
      ctx.fillRect(px, py, 1, 1);
    }
    ctx.restore();
  }

  function drawWeed(ctx, x, y, hh, ww, ph){
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = 'rgba(20,40,50,0.35)';
    ctx.lineWidth = Math.max(1, ww);
    ctx.beginPath();
    const steps = 10;
    for (let i=0;i<=steps;i++){
      const tt = i/steps;
      const sway = Math.sin(t*0.55 + ph + tt*2.4) * ww*7;
      const xx = sway * (1-tt);
      const yy = -hh*tt;
      if (i===0) ctx.moveTo(xx, yy); else ctx.lineTo(xx, yy);
    }
    ctx.stroke();
    ctx.restore();
  }

  function drawFan(ctx, x, y, hh, ww, ph){
    ctx.save();
    ctx.translate(x, y);
    ctx.strokeStyle = 'rgba(30,45,55,0.30)';
    ctx.lineWidth = Math.max(1, ww);
    const arms = 7;
    for (let a=0;a<arms;a++){
      const ang = (-0.9 + (a/(arms-1))*1.8) + 0.15*Math.sin(t*0.4 + ph);
      ctx.beginPath();
      ctx.moveTo(0, 0);
      const len = hh*(0.75 + 0.25*Math.sin(ph + a));
      ctx.quadraticCurveTo(
        Math.cos(ang)*len*0.35,
        -len*0.35,
        Math.cos(ang)*len,
        -Math.sin(0.2)*len
      );
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCreature(ctx, c, cx, cy, s){
    ctx.save();
    ctx.translate(cx, cy);

    const ink = 'rgba(5,10,14,0.76)';
    const ink2 = 'rgba(235,255,255,0.12)';

    // Subtle rim glow so the silhouette separates from the deep window gradient.
    ctx.shadowColor = 'rgba(220,250,255,0.18)';
    ctx.shadowBlur = Math.max(2, s*0.10);
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;

    ctx.fillStyle = ink;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.lineWidth = Math.max(1, Math.floor(s*0.04));

    function eye(x,y,r){
      ctx.save();
      ctx.fillStyle = ink2;
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }

    if (c.id==='angler'){
      // body
      ctx.beginPath();
      ctx.ellipse(0, 0, s*0.55, s*0.35, -0.2, 0, Math.PI*2);
      ctx.fill();
      // tail
      ctx.beginPath();
      ctx.moveTo(s*0.35, 0);
      ctx.lineTo(s*0.85, -s*0.18);
      ctx.lineTo(s*0.85, s*0.18);
      ctx.closePath();
      ctx.fill();
      // lure
      ctx.strokeStyle = 'rgba(5,10,14,0.55)';
      ctx.lineWidth = Math.max(1, Math.floor(s*0.03));
      ctx.beginPath();
      ctx.moveTo(-s*0.20, -s*0.20);
      ctx.quadraticCurveTo(-s*0.55, -s*0.65, -s*0.85, -s*0.50);
      ctx.stroke();
      ctx.fillStyle = 'rgba(240,255,255,0.18)';
      ctx.beginPath();
      ctx.arc(-s*0.87, -s*0.50, s*0.10, 0, Math.PI*2);
      ctx.fill();
      eye(-s*0.22, -s*0.05, s*0.06);
    } else if (c.id==='dumbo'){
      ctx.beginPath();
      ctx.ellipse(0, 0, s*0.52, s*0.44, 0, 0, Math.PI*2);
      ctx.fill();
      // fins
      ctx.beginPath();
      ctx.ellipse(-s*0.40, -s*0.15, s*0.22, s*0.16, -0.4, 0, Math.PI*2);
      ctx.ellipse(s*0.40, -s*0.15, s*0.22, s*0.16, 0.4, 0, Math.PI*2);
      ctx.fill();
      // tentacles
      ctx.globalAlpha = 0.85;
      for (let i=-2;i<=2;i++){
        ctx.beginPath();
        const x=i*s*0.12;
        ctx.moveTo(x, s*0.28);
        ctx.quadraticCurveTo(x + s*0.08*Math.sin(t*0.8+i), s*0.70, x + s*0.05, s*0.95);
        ctx.lineWidth = Math.max(1, Math.floor(s*0.03));
        ctx.strokeStyle = ink;
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      eye(-s*0.16, -s*0.05, s*0.05);
      eye(s*0.08, -s*0.05, s*0.05);
    } else if (c.id==='isopod'){
      // segmented pill shape
      ctx.beginPath();
      ctx.ellipse(0, 0, s*0.55, s*0.30, 0, 0, Math.PI*2);
      ctx.fill();
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = 'rgba(255,255,255,0.10)';
      ctx.lineWidth = Math.max(1, Math.floor(s*0.02));
      for (let i=-4;i<=4;i++){
        ctx.beginPath();
        ctx.moveTo(i*s*0.12, -s*0.28);
        ctx.lineTo(i*s*0.12, s*0.28);
        ctx.stroke();
      }
      ctx.globalAlpha = 1;
      // legs
      ctx.strokeStyle = 'rgba(5,10,14,0.45)';
      ctx.lineWidth = Math.max(1, Math.floor(s*0.02));
      for (let i=-3;i<=3;i++){
        const x=i*s*0.14;
        ctx.beginPath();
        ctx.moveTo(x, s*0.26);
        ctx.lineTo(x + s*0.06, s*0.38);
        ctx.stroke();
      }
      eye(-s*0.22, -s*0.08, s*0.04);
    } else if (c.id==='tubeworm'){
      // tube cluster
      ctx.fillStyle = 'rgba(245,250,255,0.10)';
      for (let i=0;i<6;i++){
        const x = (i-2.5)*s*0.16;
        roundRect(ctx, x - s*0.06, -s*0.20, s*0.12, s*0.70, s*0.06);
        ctx.fill();
      }
      ctx.fillStyle = 'rgba(90,10,20,0.40)';
      for (let i=0;i<6;i++){
        const x = (i-2.5)*s*0.16;
        ctx.beginPath();
        ctx.ellipse(x, -s*0.22, s*0.10, s*0.08, 0, 0, Math.PI*2);
        ctx.fill();
      }
    } else if (c.id==='cucumber'){
      ctx.beginPath();
      ctx.ellipse(0, 0, s*0.62, s*0.26, 0.08, 0, Math.PI*2);
      ctx.fill();
      ctx.globalAlpha = 0.30;
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      for (let i=0;i<18;i++){
        const a = (i/18)*Math.PI*2;
        ctx.beginPath();
        ctx.arc(Math.cos(a)*s*0.45, Math.sin(a)*s*0.18, s*0.04, 0, Math.PI*2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else if (c.id==='vampire'){
      // cloak
      ctx.beginPath();
      ctx.moveTo(-s*0.55, -s*0.05);
      ctx.quadraticCurveTo(0, -s*0.75, s*0.55, -s*0.05);
      ctx.quadraticCurveTo(0, s*0.55, -s*0.55, -s*0.05);
      ctx.closePath();
      ctx.fill();
      // eyes
      eye(-s*0.12, -s*0.12, s*0.05);
      eye(s*0.12, -s*0.12, s*0.05);
    } else if (c.id==='yeticrab'){
      ctx.beginPath();
      ctx.ellipse(0, 0, s*0.45, s*0.28, 0, 0, Math.PI*2);
      ctx.fill();
      // legs
      ctx.strokeStyle = ink;
      ctx.lineWidth = Math.max(1, Math.floor(s*0.03));
      for (let i=-2;i<=2;i++){
        const x=i*s*0.18;
        ctx.beginPath();
        ctx.moveTo(x, s*0.10);
        ctx.lineTo(x + Math.sign(i||1)*s*0.22, s*0.35);
        ctx.stroke();
      }
      // claws
      ctx.beginPath();
      ctx.ellipse(-s*0.58, -s*0.05, s*0.18, s*0.12, -0.3, 0, Math.PI*2);
      ctx.ellipse(s*0.58, -s*0.05, s*0.18, s*0.12, 0.3, 0, Math.PI*2);
      ctx.fill();
      eye(-s*0.10, -s*0.05, s*0.04);
      eye(s*0.10, -s*0.05, s*0.04);
    } else if (c.id==='hagfish'){
      ctx.beginPath();
      ctx.moveTo(-s*0.65, 0);
      ctx.quadraticCurveTo(-s*0.20, -s*0.35, s*0.35, -s*0.12);
      ctx.quadraticCurveTo(s*0.70, 0, s*0.25, s*0.22);
      ctx.quadraticCurveTo(-s*0.10, s*0.42, -s*0.65, 0);
      ctx.closePath();
      ctx.fill();
      eye(-s*0.25, -s*0.10, s*0.04);
    } else if (c.id==='nautilus'){
      // spiral shell
      ctx.save();
      ctx.fillStyle = ink;
      ctx.beginPath();
      ctx.arc(0, 0, s*0.52, 0.4, Math.PI*2 + 0.4);
      ctx.fill();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.beginPath();
      ctx.arc(0, 0, s*0.36, 0, Math.PI*2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 0.45;
      ctx.strokeStyle = 'rgba(255,255,255,0.12)';
      ctx.lineWidth = Math.max(1, Math.floor(s*0.03));
      for (let r=s*0.42;r>s*0.12;r-=s*0.07){
        ctx.beginPath();
        ctx.arc(0, 0, r, 0.6, 3.0);
        ctx.stroke();
      }
      ctx.restore();
    } else if (c.id==='coelacanth'){
      ctx.beginPath();
      ctx.ellipse(0, 0, s*0.58, s*0.30, -0.05, 0, Math.PI*2);
      ctx.fill();
      ctx.beginPath();
      ctx.moveTo(s*0.35, 0);
      ctx.lineTo(s*0.85, -s*0.20);
      ctx.lineTo(s*0.85, s*0.20);
      ctx.closePath();
      ctx.fill();
      // lobe fins
      ctx.globalAlpha = 0.85;
      ctx.beginPath();
      ctx.ellipse(-s*0.10, s*0.22, s*0.16, s*0.10, 0.8, 0, Math.PI*2);
      ctx.ellipse(-s*0.10, -s*0.22, s*0.16, s*0.10, -0.8, 0, Math.PI*2);
      ctx.fill();
      ctx.globalAlpha = 1;
      eye(-s*0.25, -s*0.08, s*0.05);
    } else if (c.id==='manta'){
      ctx.beginPath();
      ctx.moveTo(-s*0.70, -s*0.05);
      ctx.quadraticCurveTo(-s*0.30, -s*0.45, 0, -s*0.20);
      ctx.quadraticCurveTo(s*0.30, -s*0.45, s*0.70, -s*0.05);
      ctx.quadraticCurveTo(s*0.25, s*0.25, 0, s*0.10);
      ctx.quadraticCurveTo(-s*0.25, s*0.25, -s*0.70, -s*0.05);
      ctx.closePath();
      ctx.fill();
      // tail
      ctx.strokeStyle = ink;
      ctx.lineWidth = Math.max(1, Math.floor(s*0.03));
      ctx.beginPath();
      ctx.moveTo(s*0.10, s*0.08);
      ctx.quadraticCurveTo(s*0.45, s*0.18, s*0.80, s*0.42);
      ctx.stroke();
    } else {
      // sea star
      ctx.beginPath();
      for (let i=0;i<10;i++){
        const rr = (i%2===0) ? s*0.55 : s*0.22;
        const aa = -Math.PI/2 + (i/10)*Math.PI*2;
        const x = Math.cos(aa)*rr;
        const y = Math.sin(aa)*rr;
        if (i===0) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.closePath();
      ctx.fill();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = 'rgba(255,255,255,0.10)';
      ctx.beginPath();
      ctx.arc(0, 0, s*0.12, 0, Math.PI*2);
      ctx.fill();
      ctx.globalAlpha = 1;
    }

    ctx.restore();
  }

  function easeInOutQuad(x){
    return (x < 0.5) ? (2*x*x) : (1 - Math.pow(-2*x + 2, 2) / 2);
  }

  function drawSubmersibleSweep(ctx, x, y, ww, hh){
    if (!sweep) return;
    const tt = (t - sweep.t0) / sweep.dur;
    if (tt <= 0 || tt >= 1) return;

    const e = easeInOutQuad(tt);
    const u = (sweep.dir > 0) ? lerp(-0.25, 1.25, e) : lerp(1.25, -0.25, e);
    const cx = x + u*ww;
    const bandPx = ww * (sweep.band ?? 0.18);
    const fade = Math.sin(Math.PI * tt);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    // wide soft bloom (clean reset via save/restore, window-clipped by caller)
    ctx.globalAlpha = 0.52 * fade;
    const g = ctx.createLinearGradient(x, y, x + ww, y + hh*0.12);
    const uu = (cx - x) / ww;
    const bw = bandPx / ww;

    const stops = [];
    const stop = (p, c) => {
      const pp = Math.max(0, Math.min(1, p));
      stops.push({ p: pp, c });
    };

    stop(0, 'rgba(0,0,0,0)');
    stop(uu - bw*1.55, 'rgba(0,0,0,0)');
    stop(uu - bw*0.75, `hsla(${sweep.hue}, 95%, 78%, 0.05)`);
    stop(uu - bw*0.28, `hsla(${sweep.hue + 6}, 95%, 84%, 0.18)`);
    stop(uu,             `hsla(${sweep.hue + 10}, 95%, 90%, 0.42)`);
    stop(uu + bw*0.28, `hsla(${sweep.hue + 28}, 92%, 78%, 0.16)`);
    stop(uu + bw*0.78, `hsla(${sweep.hue + 42}, 88%, 70%, 0.05)`);
    stop(uu + bw*1.65, 'rgba(0,0,0,0)');
    stop(1, 'rgba(0,0,0,0)');

    stops.sort((a,b)=>a.p-b.p);
    for (const s of stops) g.addColorStop(s.p, s.c);

    ctx.fillStyle = g;
    ctx.fillRect(x, y, ww, hh);

    // tighter beam core
    ctx.globalAlpha = 0.28 * fade;
    const core = ctx.createRadialGradient(cx, y + hh*0.42, 0, cx, y + hh*0.42, bandPx*1.15);
    core.addColorStop(0, `hsla(${sweep.hue + 12}, 98%, 88%, 0.45)`);
    core.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = core;
    ctx.beginPath();
    ctx.ellipse(cx, y + hh*0.42, bandPx*1.10, hh*0.48, 0, 0, Math.PI*2);
    ctx.fill();

    // bioluminescent glints (rare signature)
    ctx.globalAlpha = 0.24 * fade;
    for (const p of (sweep.glints || [])){
      const gx = cx + p.x * bandPx * 1.20;
      if (gx < x - 8 || gx > x + ww + 8) continue;
      const gy = y + hh*(0.12 + p.y*0.78) + Math.sin(t*1.1 + p.y*9.3)*hh*0.006;
      const rr = (p.r || 1) * Math.min(ww, hh) * 0.009;
      const gg = ctx.createRadialGradient(gx, gy, 0, gx, gy, rr*3.2);
      gg.addColorStop(0, `hsla(${sweep.hue + 22}, 98%, 90%, 0.55)`);
      gg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.arc(gx, gy, rr*3.2, 0, Math.PI*2);
      ctx.fill();
    }

    ctx.restore();
  }

  function render(ctx){
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!pal) pal = buildPalette();

    drawOceanBg(ctx);

    const s = Math.min(w, h);
    const cardW = Math.floor(w * 0.62);
    const cardH = Math.floor(h * 0.68);
    const cardX = Math.floor((w - cardW) * 0.5);
    const cardY = Math.floor((h - cardH) * 0.5);

    // postcard wobble
    const wob = 0.02 * Math.sin(t*0.35 + drift);
    const ang = tilt + wob;

    ctx.save();
    ctx.translate(cardX + cardW/2, cardY + cardH/2);
    ctx.rotate(ang);

    // shadow
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = pal.shadow;
    roundRect(ctx, -cardW/2 + 10, -cardH/2 + 16, cardW, cardH, Math.floor(s*0.035));
    ctx.fill();

    // card
    ctx.globalAlpha = 1;
    const pg = ctx.createLinearGradient(0, -cardH/2, 0, cardH/2);
    pg.addColorStop(0, pal.paper0);
    pg.addColorStop(1, pal.paper1);
    ctx.fillStyle = pg;
    roundRect(ctx, -cardW/2, -cardH/2, cardW, cardH, Math.floor(s*0.035));
    ctx.fill();

    // border
    ctx.strokeStyle = 'rgba(0,0,0,0.18)';
    ctx.lineWidth = Math.max(2, Math.floor(s*0.004));
    ctx.stroke();

    // paper grain
    drawPaperTexture(ctx, -cardW/2, -cardH/2, cardW, cardH);

    const pad = Math.floor(font * 1.0);

    // header band
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    ctx.fillRect(-cardW/2, -cardH/2, cardW, Math.floor(font*2.2));
    ctx.fillStyle = pal.ink;
    ctx.font = `${Math.floor(font*1.05)}px ui-sans-serif, system-ui`;
    ctx.textBaseline = 'top';
    // Subtle shadow so pinks stay readable over paper grain.
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.40)';
    ctx.shadowBlur = Math.max(2, Math.floor(font*0.18));
    ctx.shadowOffsetY = Math.max(1, Math.floor(font*0.06));
    ctx.fillText('OCEAN FLOOR POSTCARDS', -cardW/2 + pad, -cardH/2 + Math.floor(font*0.55));
    ctx.restore();

    // stamp
    const stampS = Math.floor(font * 2.2);
    const sx = cardW/2 - pad - stampS;
    const sy = -cardH/2 + Math.floor(font*0.35);
    ctx.save();
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = pal.stamp;
    roundRect(ctx, sx, sy, stampS, stampS, Math.floor(font*0.35));
    ctx.fill();
    ctx.globalAlpha = 0.55;
    ctx.strokeStyle = 'rgba(0,0,0,0.35)';
    ctx.setLineDash([3,3]);
    ctx.stroke();
    ctx.setLineDash([]);
    // tiny fish icon
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    ctx.ellipse(sx + stampS*0.52, sy + stampS*0.55, stampS*0.18, stampS*0.12, 0, 0, Math.PI*2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(sx + stampS*0.65, sy + stampS*0.55);
    ctx.lineTo(sx + stampS*0.84, sy + stampS*0.46);
    ctx.lineTo(sx + stampS*0.84, sy + stampS*0.64);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // image area
    const imgX = -cardW/2 + pad;
    const imgY = -cardH/2 + Math.floor(font*2.8);
    const imgW = cardW - pad*2;
    const imgH = Math.floor(cardH * 0.48);

    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    roundRect(ctx, imgX-2, imgY-2, imgW+4, imgH+4, Math.floor(font*0.7));
    ctx.fill();
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(0,0,0,0.04)';
    roundRect(ctx, imgX, imgY, imgW, imgH, Math.floor(font*0.7));
    ctx.fill();
    ctx.clip();

    // inside “window”: deep gradient
    const gg = ctx.createLinearGradient(0, imgY, 0, imgY+imgH);
    gg.addColorStop(0, `hsla(${pal.deep}, 70%, 16%, 1)`);
    gg.addColorStop(1, `hsla(${(pal.deep+30)%360}, 78%, 6%, 1)`);
    ctx.fillStyle = gg;
    ctx.fillRect(imgX, imgY, imgW, imgH);

    // subtle caustics near top
    ctx.save();
    ctx.globalAlpha = 0.10;
    ctx.globalCompositeOperation = 'screen';
    for (let i=0;i<5;i++){
      const yy = imgY + imgH*(0.10 + i*0.08);
      ctx.beginPath();
      for (let x=imgX; x<=imgX+imgW; x+=imgW/6){
        const a = (x*0.008) + t*0.35 + drift + i*1.7;
        const y = yy + Math.sin(a)*imgH*0.02;
        if (x===imgX) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.strokeStyle = 'rgba(170,235,255,0.50)';
      ctx.lineWidth = Math.max(1, Math.floor(font*0.08));
      ctx.stroke();
    }
    ctx.restore();

    // seabed
    const bedY = imgY + imgH*0.68;
    const bed = ctx.createLinearGradient(0, bedY, 0, imgY+imgH);
    bed.addColorStop(0, 'rgba(25,35,38,0.40)');
    bed.addColorStop(1, 'rgba(12,16,18,0.72)');
    ctx.fillStyle = bed;
    ctx.fillRect(imgX, bedY, imgW, imgY+imgH-bedY);

    // sand ripples
    ctx.save();
    ctx.globalAlpha = 0.16;
    ctx.strokeStyle = 'rgba(230,250,255,0.18)';
    ctx.lineWidth = Math.max(1, Math.floor(font*0.06));
    const rip = 9;
    for (let i=0;i<rip;i++){
      const y0 = bedY + (i/(rip-1))*(imgY+imgH-bedY);
      ctx.beginPath();
      for (let x=imgX; x<=imgX+imgW; x+=imgW/8){
        const a = (x*0.012) + t*0.22 + drift + i*0.9;
        const y = y0 + Math.sin(a)*imgH*0.012;
        if (x===imgX) ctx.moveTo(x,y); else ctx.lineTo(x,y);
      }
      ctx.stroke();
    }
    ctx.restore();

    // rocks (mid layer)
    ctx.save();
    ctx.globalAlpha = 0.68;
    for (const r of rocks){
      const rx = imgX + r.x*imgW + Math.sin(t*0.10 + drift)*imgW*0.01;
      const ry = imgY + r.y*imgH + Math.cos(t*0.12 + drift)*imgH*0.01;
      const rr = r.r*Math.min(imgW,imgH);
      const g2 = ctx.createRadialGradient(rx-rr*0.25, ry-rr*0.25, rr*0.10, rx, ry, rr);
      g2.addColorStop(0, 'rgba(60,75,80,0.75)');
      g2.addColorStop(1, 'rgba(5,10,12,0.85)');
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.ellipse(rx, ry, rr*1.05, rr*0.85, r.a, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.restore();

    // weeds
    ctx.save();
    ctx.globalAlpha = 0.70;
    for (const ww2 of weeds){
      const x = imgX + ww2.x*imgW;
      const y = imgY + ww2.y*imgH;
      const hh = ww2.h*imgH;
      const ww = ww2.w*imgW;
      if (ww2.c==='fan') drawFan(ctx, x, y, hh, ww, ww2.ph);
      else drawWeed(ctx, x, y, hh, ww, ww2.ph);
    }
    ctx.restore();

    // creature silhouette
    const c = creature();
    const cs = Math.min(imgW,imgH) * 0.28;
    const cx = imgX + imgW * (0.58 + 0.06*Math.sin(t*0.12 + drift));
    const cy = imgY + imgH * (0.52 + 0.06*Math.cos(t*0.10 + drift));

    // Backlight so the creature reads at-a-glance (esp. in screenshots) without blowing out the window.
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = 0.14;
    const hl = ctx.createRadialGradient(cx, cy, 0, cx, cy, cs*1.35);
    hl.addColorStop(0, 'rgba(220,250,255,0.85)');
    hl.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = hl;
    ctx.beginPath();
    ctx.arc(cx, cy, cs*1.35, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();

    drawCreature(ctx, c, cx, cy, cs);

    // special moment: submersible light sweep (rare; signature look; OSD-safe)
    drawSubmersibleSweep(ctx, imgX, imgY, imgW, imgH);

    // silt overlay
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.globalCompositeOperation = 'screen';
    for (let i=0;i<18;i++){
      const px = imgX + ((i*97)%imgW) + Math.sin(t*0.22 + i)*imgW*0.03;
      const py = imgY + ((i*191)%imgH) + Math.cos(t*0.18 + i)*imgH*0.04;
      const rr = imgH*(0.05 + (i%5)*0.01);
      const g3 = ctx.createRadialGradient(px, py, 0, px, py, rr);
      g3.addColorStop(0, 'rgba(210,240,255,0.22)');
      g3.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g3;
      ctx.beginPath();
      ctx.arc(px, py, rr, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.restore();

    ctx.restore(); // clip window

    // label
    ctx.fillStyle = pal.ink;
    ctx.font = `${Math.floor(font*1.45)}px ui-sans-serif, system-ui`;
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = Math.max(2, Math.floor(font*0.22));
    ctx.shadowOffsetY = Math.max(1, Math.floor(font*0.07));
    ctx.fillText(c.name, -cardW/2 + pad, imgY + imgH + Math.floor(font*0.75));
    ctx.restore();

    ctx.fillStyle = pal.inkDim;
    ctx.font = `${Math.floor(small*0.95)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    const oz = `${c.zone} ZONE`;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.lineWidth = Math.max(2, Math.floor(small*0.18));
    ctx.strokeStyle = 'rgba(0,0,0,0.34)';
    ctx.strokeText(oz, -cardW/2 + pad, imgY + imgH + Math.floor(font*2.25));
    ctx.fillText(oz, -cardW/2 + pad, imgY + imgH + Math.floor(font*2.25));
    ctx.restore();

    // divider
    const divY = imgY + imgH + Math.floor(font*3.1);
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(-cardW/2 + pad, divY, cardW - pad*2, 1);
    ctx.globalAlpha = 1;

    // fact box
    const factX = -cardW/2 + pad;
    const factY = divY + Math.floor(font*0.7);
    const factW = cardW - pad*2;

    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    roundRect(ctx, factX, factY, factW, Math.floor(cardH*0.18), Math.floor(font*0.7));
    ctx.fill();

    ctx.fillStyle = pal.ink;
    ctx.font = `${Math.floor(small*0.95)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.lineWidth = Math.max(2, Math.floor(small*0.18));
    ctx.strokeStyle = 'rgba(0,0,0,0.30)';
    ctx.strokeText('CREATURE FACT:', factX + Math.floor(font*0.6), factY + Math.floor(font*0.45));
    ctx.fillText('CREATURE FACT:', factX + Math.floor(font*0.6), factY + Math.floor(font*0.45));
    ctx.restore();

    ctx.fillStyle = 'rgba(10,12,18,0.82)';
    ctx.font = `${Math.floor(small*1.05)}px ui-sans-serif, system-ui`;
    const words = (c.fact || '').split(/\s+/);
    let line = '';
    let yy = factY + Math.floor(font*1.25);
    const lh = Math.floor(small*1.25);
    const maxW = factW - Math.floor(font*1.2);
    for (let i=0;i<words.length;i++){
      const test = line ? (line + ' ' + words[i]) : words[i];
      if (ctx.measureText(test).width > maxW && line){
        ctx.fillText(line, factX + Math.floor(font*0.6), yy);
        line = words[i];
        yy += lh;
      } else {
        line = test;
      }
    }
    if (line) ctx.fillText(line, factX + Math.floor(font*0.6), yy);

    // footer chip
    const rem = Math.max(0, Math.ceil(SEG_DUR - segT));
    const chip = `NEXT CARD  •  ${String(rem).padStart(2,'0')}s`;
    ctx.save();
    ctx.globalAlpha = 0.70;
    ctx.font = `${Math.floor(small*0.90)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    const tw = Math.ceil(ctx.measureText(chip).width);
    const cx2 = cardW/2 - pad - (tw + font*0.9);
    const cy2 = cardH/2 - Math.floor(font*1.35);
    ctx.fillStyle = 'rgba(0,0,0,0.14)';
    roundRect(ctx, cx2, cy2, tw + font*0.9, Math.floor(small*1.65), 12);
    ctx.fill();
    ctx.globalAlpha = 0.90;
    ctx.fillStyle = pal.inkDim;
    ctx.textBaseline = 'middle';
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.miterLimit = 2;
    ctx.lineWidth = Math.max(2, Math.floor(small*0.18));
    ctx.strokeStyle = 'rgba(0,0,0,0.32)';
    ctx.strokeText(chip, cx2 + Math.floor(font*0.45), cy2 + Math.floor(small*0.83));
    ctx.fillText(chip, cx2 + Math.floor(font*0.45), cy2 + Math.floor(small*0.83));
    ctx.restore();
    ctx.restore();

    ctx.restore(); // card transform

    // subtle caption
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = 'rgba(231,238,246,0.82)';
    ctx.font = `${Math.floor(small*0.85)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('ABYSS: postcards drift up through silt.', Math.floor(w*0.04), Math.floor(h*0.94));
    ctx.restore();
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
