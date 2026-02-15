import { mulberry32, clamp } from '../../util/prng.js';

// Planetarium Postcards
// Rotating “postcards” from planets/moons with a single wow-fact and slow starfield parallax.

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

const BODIES = [
  { id:'mercury', name:'Mercury', type:'planet', hue: 28, rings:false, fact:'A day here is longer than its year. (59 Earth days per spin, 88 per orbit.)' },
  { id:'venus', name:'Venus', type:'planet', hue: 46, rings:false, fact:'It spins backwards, and its surface pressure is like being 900m underwater.' },
  { id:'earth', name:'Earth', type:'planet', hue: 200, rings:false, fact:'The only known world with plate tectonics *and* liquid surface oceans.' },
  { id:'moon', name:'Moon', type:'moon', hue: 210, rings:false, fact:'It’s drifting away from Earth by about the width of a fingernail each year.' },
  { id:'mars', name:'Mars', type:'planet', hue: 18, rings:false, fact:'Olympus Mons is the tallest volcano we know — ~3× Everest’s height.' },
  { id:'jupiter', name:'Jupiter', type:'planet', hue: 40, rings:false, fact:'Its Great Red Spot is a storm bigger than Earth that’s raged for centuries.' },
  { id:'saturn', name:'Saturn', type:'planet', hue: 48, rings:true, fact:'Its rings are huge but thin — often tens of meters thick, not kilometers.' },
  { id:'europa', name:'Europa', type:'moon', hue: 195, rings:false, fact:'Under the ice may be a global ocean with more water than Earth’s oceans combined.' },
  { id:'titan', name:'Titan', type:'moon', hue: 32, rings:false, fact:'It has lakes and rain — but of methane, not water.' },
  { id:'enceladus', name:'Enceladus', type:'moon', hue: 200, rings:false, fact:'It sprays ice geysers into space — feeding Saturn’s E-ring.' },
  { id:'uranus', name:'Uranus', type:'planet', hue: 175, rings:true, fact:'It’s tilted on its side — its seasons last about 21 Earth years.' },
  { id:'neptune', name:'Neptune', type:'planet', hue: 210, rings:true, fact:'Winds here can exceed 2,000 km/h — the fastest in the Solar System.' },
  { id:'pluto', name:'Pluto', type:'dwarf', hue: 205, rings:false, fact:'A “dwarf planet” with an atmosphere that can freeze and fall as snow.' },
  { id:'triton', name:'Triton', type:'moon', hue: 190, rings:false, fact:'It orbits Neptune backwards — likely captured from the Kuiper Belt.' },
];

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w=0, h=0, t=0;
  let font=16, small=12;

  // star layers for parallax
  let starsA = [];
  let starsB = [];
  let neb = [];

  // postcard / segment
  const SEG_DUR = 70;
  let idx = 0;
  let segT = 0;
  let order = [];

  // visuals per segment
  let pal = null;
  let tilt = 0;
  let drift = 0;

  // audio handle
  let ah = null;

  function shuffled(arr){
    const a = [...arr];
    for (let i = a.length - 1; i > 0; i--){
      const j = (rand() * (i + 1)) | 0;
      const tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  function body(){ return order[idx] || BODIES[0]; }

  function buildPalette(){
    const b = body();
    // A paper + ink palette keyed off body hue.
    const baseHue = (b.hue + (rand()*20-10)) % 360;
    const inkHue = (baseHue + 160 + rand()*60) % 360;
    return {
      space0: '#01020a',
      space1: '#000007',
      ink: `hsla(${inkHue}, 85%, 70%, 0.95)`,
      inkDim: `hsla(${inkHue}, 75%, 78%, 0.70)`,
      stamp: `hsla(${(baseHue+40)%360}, 85%, 62%, 0.92)`,
      paper0: `hsla(${(baseHue+35)%360}, 35%, 95%, 0.98)`,
      paper1: `hsla(${(baseHue+15)%360}, 25%, 89%, 0.98)`,
      shadow: 'rgba(0,0,0,0.45)',
      planetHue: baseHue,
    };
  }

  function reseedSegment(){
    pal = buildPalette();
    segT = 0;
    tilt = (rand() * 2 - 1) * 0.10;
    drift = rand() * 10;

    if (audio.enabled){
      // soft “planetarium” cue
      audio.beep({ freq: 520 + rand()*120, dur: 0.05, gain: 0.018, type: 'sine' });
      audio.beep({ freq: 860 + rand()*220, dur: 0.03, gain: 0.012, type: 'triangle' });
    }
  }

  function nextSegment(){
    idx = (idx + 1) % order.length;
    reseedSegment();
  }

  function init({ width, height }){
    w = width; h = height; t = 0;
    font = Math.max(14, Math.floor(Math.min(w, h) / 34));
    small = Math.max(11, Math.floor(font * 0.78));

    // stars: two depth layers
    const nA = Math.floor(520 * (w*h) / (960*540));
    const nB = Math.floor(260 * (w*h) / (960*540));
    starsA = Array.from({ length: nA }, () => ({
      x: rand()*w, y: rand()*h,
      z: 0.25 + rand()*0.55,
      tw: rand()*10,
      c: 210 + rand()*30,
    }));
    starsB = Array.from({ length: nB }, () => ({
      x: rand()*w, y: rand()*h,
      z: 0.65 + rand()*0.9,
      tw: rand()*10,
      c: 205 + rand()*45,
    }));

    neb = Array.from({ length: 46 }, () => ({
      x: rand()*w,
      y: rand()*h,
      r: (70 + rand()*260) * (h/540),
      hue: 180 + rand()*140,
      a: 0.02 + rand()*0.06,
      ph: rand()*10,
    }));

    order = shuffled(BODIES);
    idx = 0;
    pal = null;
    reseedSegment();
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

    // planetarium hum: lowpassed pink noise + quiet sine
    const noise = audio.noiseSource({ type: 'pink', gain: 0.024 });
    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 520;
    lpf.Q.value = 0.75;

    noise.src.disconnect();
    noise.src.connect(noise.gain);
    noise.gain.disconnect();
    noise.gain.connect(lpf);
    lpf.connect(out);

    const o = ctx.createOscillator();
    const og = ctx.createGain();
    o.type = 'sine';
    o.frequency.value = 72 + rand()*18;
    og.gain.value = 0.016;
    o.connect(og);
    og.connect(out);

    noise.start();
    o.start();

    return {
      stop(){
        const now = ctx.currentTime;
        try { out.gain.setTargetAtTime(0.0001, now, 0.09); } catch {}
        try { noise.stop(); } catch {}
        try { o.stop(now + 0.2); } catch {}
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

    // slow parallax drift
    const dxA = 4.5 * dt;
    const dxB = 12.0 * dt;
    const dyA = 1.8 * dt;
    const dyB = 4.4 * dt;
    for (const s of starsA){
      s.x -= dxA * s.z;
      s.y += dyA * s.z;
      if (s.x < -2) s.x += w + 4;
      if (s.y > h + 2) s.y -= h + 4;
    }
    for (const s of starsB){
      s.x -= dxB * s.z;
      s.y += dyB * s.z;
      if (s.x < -2) s.x += w + 4;
      if (s.y > h + 2) s.y -= h + 4;
    }
  }

  function drawSpace(ctx){
    const bg = ctx.createLinearGradient(0, 0, 0, h);
    bg.addColorStop(0, pal?.space0 || '#01020a');
    bg.addColorStop(1, pal?.space1 || '#000007');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // nebula
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const n of neb){
      const rr = n.r * (0.9 + 0.1*Math.sin(t*0.12 + n.ph));
      const g = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, rr);
      g.addColorStop(0, `hsla(${n.hue}, 90%, 62%, ${n.a})`);
      g.addColorStop(0.55, `hsla(${(n.hue+40)%360}, 90%, 55%, ${n.a*0.33})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(n.x, n.y, rr, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.restore();

    // stars back
    for (const s of starsA){
      const tw = 0.45 + 0.55*Math.sin(t*0.7 + s.tw);
      const a = 0.06 + 0.30*tw;
      ctx.fillStyle = `hsla(${s.c}, 70%, 86%, ${a})`;
      ctx.fillRect(s.x, s.y, 1.1*s.z, 1.1*s.z);
    }
    // stars front
    for (const s of starsB){
      const tw = 0.45 + 0.55*Math.sin(t*0.9 + s.tw);
      const a = 0.10 + 0.55*tw;
      ctx.fillStyle = `hsla(${s.c}, 80%, 90%, ${a})`;
      ctx.fillRect(s.x, s.y, 1.2*s.z, 1.2*s.z);
    }

    // vignette
    const vg = ctx.createRadialGradient(w*0.50, h*0.48, 0, w*0.50, h*0.48, Math.max(w,h)*0.78);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.58)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
  }

  function drawPlanet(ctx, cx, cy, r, b){
    // sphere shading
    const hue = pal.planetHue;
    const g = ctx.createRadialGradient(cx - r*0.25, cy - r*0.22, r*0.10, cx, cy, r);
    g.addColorStop(0, `hsla(${hue}, 55%, 68%, 0.98)`);
    g.addColorStop(0.55, `hsla(${hue}, 60%, 50%, 0.98)`);
    g.addColorStop(1, `hsla(${hue}, 65%, 26%, 0.98)`);

    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI*2);
    ctx.clip();

    ctx.fillStyle = g;
    ctx.fillRect(cx-r, cy-r, r*2, r*2);

    // texture per type
    if (b.id === 'jupiter'){
      ctx.globalAlpha = 0.22;
      for (let i=0;i<9;i++){
        const yy = cy - r + (i/8)*r*2;
        ctx.fillStyle = `hsla(${hue+12}, 75%, ${45 + (i%2)*10}%, 1)`;
        ctx.fillRect(cx-r, yy, r*2, r*0.12);
      }
      // red spot
      ctx.globalAlpha = 0.35;
      ctx.fillStyle = 'rgba(220,90,70,0.9)';
      ctx.beginPath();
      ctx.ellipse(cx + r*0.26, cy + r*0.10, r*0.22, r*0.14, 0.2, 0, Math.PI*2);
      ctx.fill();
      ctx.globalAlpha = 1;
    } else if (b.id === 'saturn'){
      ctx.globalAlpha = 0.18;
      for (let i=0;i<7;i++){
        const yy = cy - r + (i/6)*r*2;
        ctx.fillStyle = `hsla(${hue+8}, 60%, ${48 + (i%2)*9}%, 1)`;
        ctx.fillRect(cx-r, yy, r*2, r*0.12);
      }
      ctx.globalAlpha = 1;
    } else if (b.type === 'moon' || b.id === 'pluto' || b.id === 'mercury'){
      // craters
      ctx.globalAlpha = 0.16;
      for (let i=0;i<28;i++){
        const x = cx + (rand()*2-1)*r*0.72;
        const y = cy + (rand()*2-1)*r*0.72;
        const rr = r*(0.03 + rand()*0.09);
        const d2 = (x-cx)*(x-cx) + (y-cy)*(y-cy);
        if (d2 > r*r*0.92) continue;
        ctx.strokeStyle = 'rgba(0,0,0,0.55)';
        ctx.lineWidth = Math.max(1, Math.floor(r*0.03));
        ctx.beginPath();
        ctx.arc(x, y, rr, 0, Math.PI*2);
        ctx.stroke();
        ctx.fillStyle = 'rgba(255,255,255,0.12)';
        ctx.beginPath();
        ctx.arc(x - rr*0.18, y - rr*0.18, rr*0.55, 0, Math.PI*2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else if (b.id === 'earth'){
      // simple continents swirls
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = 'rgba(80,190,120,0.95)';
      for (let i=0;i<5;i++){
        ctx.beginPath();
        ctx.ellipse(cx + r*(0.15*Math.sin(i*1.3)), cy + r*(0.18*Math.cos(i*1.1)), r*(0.32+0.06*i), r*(0.14+0.03*i), i*0.6, 0, Math.PI*2);
        ctx.fill();
      }
      ctx.globalAlpha = 0.14;
      ctx.fillStyle = 'rgba(255,255,255,0.9)';
      for (let i=0;i<10;i++){
        ctx.beginPath();
        ctx.ellipse(cx + (rand()*2-1)*r*0.55, cy + (rand()*2-1)*r*0.55, r*(0.10+rand()*0.14), r*(0.05+rand()*0.10), rand()*Math.PI, 0, Math.PI*2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    } else if (b.id === 'neptune' || b.id === 'uranus'){
      ctx.globalAlpha = 0.10;
      ctx.fillStyle = 'rgba(255,255,255,0.85)';
      for (let i=0;i<8;i++){
        const yy = cy - r + (i/7)*r*2;
        ctx.fillRect(cx-r, yy, r*2, r*0.08);
      }
      ctx.globalAlpha = 1;
    } else if (b.id === 'venus'){
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = 'rgba(255,255,255,0.55)';
      for (let i=0;i<12;i++){
        ctx.beginPath();
        ctx.ellipse(cx + (rand()*2-1)*r*0.25, cy + (rand()*2-1)*r*0.25, r*(0.55+rand()*0.25), r*(0.12+rand()*0.10), rand()*Math.PI, 0, Math.PI*2);
        ctx.fill();
      }
      ctx.globalAlpha = 1;
    }

    // terminator
    ctx.globalCompositeOperation = 'multiply';
    const tg = ctx.createLinearGradient(cx - r, cy, cx + r, cy);
    const k = 0.55 + 0.35*Math.sin(t*0.08 + drift);
    tg.addColorStop(0, `rgba(0,0,0,${0.25 + 0.25*(1-k)})`);
    tg.addColorStop(k, 'rgba(0,0,0,0)');
    tg.addColorStop(1, 'rgba(0,0,0,0.35)');
    ctx.fillStyle = tg;
    ctx.fillRect(cx-r, cy-r, r*2, r*2);
    ctx.globalCompositeOperation = 'source-over';

    ctx.restore();

    // outline
    ctx.strokeStyle = 'rgba(0,0,0,0.20)';
    ctx.lineWidth = Math.max(2, Math.floor(r*0.06));
    ctx.beginPath();
    ctx.arc(cx, cy, r, 0, Math.PI*2);
    ctx.stroke();

    // rings (simple)
    if (b.rings){
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = 'rgba(255,255,255,0.22)';
      ctx.lineWidth = Math.max(2, Math.floor(r*0.08));
      const rrX = r*1.55;
      const rrY = r*0.55;
      ctx.beginPath();
      ctx.ellipse(cx, cy + r*0.04, rrX, rrY, -0.22, 0, Math.PI*2);
      ctx.stroke();
      ctx.globalAlpha = 0.40;
      ctx.strokeStyle = pal.ink;
      ctx.lineWidth = Math.max(1, Math.floor(r*0.05));
      ctx.beginPath();
      ctx.ellipse(cx, cy + r*0.04, rrX*0.86, rrY*0.86, -0.22, 0, Math.PI*2);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawPaperTexture(ctx, x, y, ww, hh){
    // bounded cheap speckle to fake paper grain
    const count = Math.floor((ww*hh) / 18000);
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

  function render(ctx){
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);
    if (!pal) pal = buildPalette();

    drawSpace(ctx);

    const s = Math.min(w, h);
    const cardW = Math.floor(w * 0.62);
    const cardH = Math.floor(h * 0.68);
    const cardX = Math.floor((w - cardW) * 0.5);
    const cardY = Math.floor((h - cardH) * 0.5);

    // postcard wobble (subtle)
    const wob = 0.02 * Math.sin(t*0.35 + drift);
    const ang = tilt + wob;

    ctx.save();
    ctx.translate(cardX + cardW/2, cardY + cardH/2);
    ctx.rotate(ang);

    // drop shadow
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

    // paper texture
    drawPaperTexture(ctx, -cardW/2, -cardH/2, cardW, cardH);

    const pad = Math.floor(font * 1.0);

    // header
    ctx.fillStyle = 'rgba(0,0,0,0.06)';
    ctx.fillRect(-cardW/2, -cardH/2, cardW, Math.floor(font*2.2));
    ctx.fillStyle = pal.ink;
    ctx.font = `${Math.floor(font*1.05)}px ui-sans-serif, system-ui`;
    ctx.textBaseline = 'top';
    ctx.fillText('PLANETARIUM POSTCARDS', -cardW/2 + pad, -cardH/2 + Math.floor(font*0.55));

    // stamp block
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
    // tiny star
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(255,255,255,0.85)';
    ctx.beginPath();
    const cx = sx + stampS*0.5;
    const cy = sy + stampS*0.52;
    for (let i=0;i<10;i++){
      const rr = (i%2===0) ? stampS*0.22 : stampS*0.10;
      const aa = -Math.PI/2 + (i/10)*Math.PI*2;
      const px = cx + Math.cos(aa)*rr;
      const py = cy + Math.sin(aa)*rr;
      if (i===0) ctx.moveTo(px,py); else ctx.lineTo(px,py);
    }
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // main image area
    const imgX = -cardW/2 + pad;
    const imgY = -cardH/2 + Math.floor(font*2.8);
    const imgW = cardW - pad*2;
    const imgH = Math.floor(cardH * 0.48);

    // image frame
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

    // mini starfield inside card image
    ctx.globalAlpha = 0.65;
    const ox = Math.sin(t*0.12 + drift) * imgW*0.03;
    const oy = Math.cos(t*0.10 + drift) * imgH*0.03;
    for (let i=0;i<120;i++){
      const px = imgX + ((i*73)%imgW) + ox;
      const py = imgY + ((i*191)%imgH) + oy;
      const aa = 0.05 + 0.10*Math.sin(t*0.8 + i);
      ctx.fillStyle = `rgba(255,255,255,${aa})`;
      ctx.fillRect(imgX + ((px-imgX+imgW)%imgW), imgY + ((py-imgY+imgH)%imgH), 1, 1);
    }
    ctx.globalAlpha = 1;

    // planet
    const b = body();
    const pr = Math.min(imgW, imgH) * 0.32;
    const pcx = imgX + imgW * (0.56 + 0.08*Math.sin(t*0.10 + drift));
    const pcy = imgY + imgH * (0.52 + 0.06*Math.cos(t*0.09 + drift));
    drawPlanet(ctx, pcx, pcy, pr, b);

    ctx.restore();

    // label under image
    ctx.fillStyle = pal.ink;
    ctx.font = `${Math.floor(font*1.45)}px ui-sans-serif, system-ui`;
    ctx.fillText(b.name, -cardW/2 + pad, imgY + imgH + Math.floor(font*0.75));

    ctx.fillStyle = pal.inkDim;
    ctx.font = `${Math.floor(small*0.95)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    const kind = (b.type === 'moon') ? 'MOON' : (b.type === 'dwarf' ? 'DWARF PLANET' : 'PLANET');
    ctx.fillText(kind, -cardW/2 + pad, imgY + imgH + Math.floor(font*2.25));

    // divider
    const divY = imgY + imgH + Math.floor(font*3.1);
    ctx.globalAlpha = 0.22;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(-cardW/2 + pad, divY, cardW - pad*2, 1);
    ctx.globalAlpha = 1;

    // wow fact
    const factX = -cardW/2 + pad;
    const factY = divY + Math.floor(font*0.7);
    const factW = cardW - pad*2;

    ctx.fillStyle = 'rgba(0,0,0,0.08)';
    roundRect(ctx, factX, factY, factW, Math.floor(cardH*0.18), Math.floor(font*0.7));
    ctx.fill();

    ctx.fillStyle = pal.ink;
    ctx.font = `${Math.floor(small*0.95)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText('WOW-FACT:', factX + Math.floor(font*0.6), factY + Math.floor(font*0.45));

    // wrapped fact text
    ctx.fillStyle = 'rgba(10,12,18,0.82)';
    ctx.font = `${Math.floor(small*1.05)}px ui-sans-serif, system-ui`;
    const text = b.fact;
    const words = text.split(/\s+/);
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

    // footer: timer
    const rem = Math.max(0, Math.ceil(SEG_DUR - segT));
    const chip = `NEXT CARD  •  ${String(rem).padStart(2,'0')}s`;
    ctx.save();
    ctx.globalAlpha = 0.70;
    ctx.font = `${Math.floor(small*0.90)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    const tw = Math.ceil(ctx.measureText(chip).width);
    const cx2 = cardW/2 - pad - (tw + font*0.9);
    const cy2 = cardH/2 - Math.floor(font*1.35);
    ctx.fillStyle = 'rgba(0,0,0,0.12)';
    roundRect(ctx, cx2, cy2, tw + font*0.9, Math.floor(small*1.65), 12);
    ctx.fill();
    ctx.globalAlpha = 0.86;
    ctx.fillStyle = pal.inkDim;
    ctx.textBaseline = 'middle';
    ctx.fillText(chip, cx2 + Math.floor(font*0.45), cy2 + Math.floor(small*0.83));
    ctx.restore();

    ctx.restore(); // card transform

    // subtle caption bottom-left
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = 'rgba(231,238,246,0.82)';
    ctx.font = `${Math.floor(small*0.85)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'alphabetic';
    ctx.fillText('PLANETARIUM: postcards drift in from the dark.', Math.floor(w*0.04), Math.floor(h*0.94));
    ctx.restore();
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
