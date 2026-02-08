import { mulberry32, clamp } from '../util/prng.js';

export function createChannel({ seed, audio }){
  const randSim = mulberry32(seed);
  // Use a separate RNG stream for any precomputed/static visuals so render()
  // doesn't consume simulation randomness (keeps behavior stable across FPS / capture timing).
  const staticSeed = (seed ^ 0x9e3779b9) >>> 0;
  let w=0,h=0,t=0;
  let fish=[], bubbles=[];
  let sand = [];
  let seaweed = [];
  let coral = [];
  let noiseHandle=null;

  function init({width,height}){
    w=width; h=height; t=0;
    // Spawn some fish on-screen so screenshots are less empty right after tuning.
    fish = Array.from({length: 10}, (_,i)=>makeFish(i, i < 6));
    bubbles = Array.from({length: 90}, ()=>makeBubble(true));
    sand = makeSand();
    seaweed = makeSeaweed();
    coral = makeCoral();
  }

  function pickFishKind(){
    // Weighted rarity. Keep rare fish uncommon enough to feel special.
    // common: 85%, uncommon: 13%, rare: 2%
    const r = randSim();
    if (r < 0.02) return 'rare';
    if (r < 0.15) return 'uncommon';
    return 'common';
  }

  function makeFish(i, spawnOnscreen=false){
    const dir = randSim() < 0.5 ? 1 : -1;
    const kind = pickFishKind();
    const sizeBase = (h/540);
    const kindSize =
      kind === 'rare' ? (24 + randSim()*46) * sizeBase :
      kind === 'uncommon' ? (16 + randSim()*40) * sizeBase :
      (12 + randSim()*36) * sizeBase;

    // Color: keep common fish in the teal->violet family, but let rare fish
    // drift toward brighter cyan/pink.
    const hue =
      kind === 'rare' ? (185 + randSim()*150) :
      (170 + randSim()*120);

    return {
      x: spawnOnscreen ? (randSim()*w) : (dir>0 ? -randSim()*w*0.6 : w + randSim()*w*0.6),
      y: h*(0.18 + randSim()*0.72),
      dir,
      sp: (0.25+randSim()*0.9) * (w/800),
      amp: (12+randSim()*40) * (h/540),
      ph: randSim()*Math.PI*2,
      hue,
      size: kindSize,
      kind,
      // Per-fish style variation (patterns/fins) without needing more RNG during render.
      variant: randSim(),
    };
  }

  function makeBubble(reset=false){
    return {
      x: randSim()*w,
      y: reset ? h + randSim()*h : randSim()*h,
      r: (1.5+randSim()*6) * (h/540),
      sp: (14+randSim()*60) * (h/540),
      drift: (randSim()*2-1) * 0.6,
      wob: randSim()*10,
      a: 0.08 + randSim()*0.25,
    };
  }

  function makeSand(){
    const randStatic = mulberry32(staticSeed);
    const top = h*0.86;
    const height = h*0.14;
    // Precompute specks (position + style) so they don't flicker.
    return Array.from({length: 420}, () => {
      const x = (randStatic()*w)|0;
      const y = (top + randStatic()*height)|0;
      const a = 0.08 + randStatic()*0.2;
      return { x, y, style: `rgba(210,200,160,${a})` };
    });
  }

  function makeSeaweed(){
    const randStatic = mulberry32((staticSeed ^ 0x2c1b3c6d) >>> 0);
    const top = h*0.86;
    const count = 10 + ((randStatic() * 6) | 0);
    const items = [];
    for (let i = 0; i < count; i++){
      const x = randStatic()*w;
      const y = top + (randStatic()*h*0.12);
      const len = (h * (0.08 + randStatic()*0.18));
      const thick = Math.max(1, h * (0.0022 + randStatic()*0.0018));
      const sway = 0.8 + randStatic()*1.6;
      const ph = randStatic()*Math.PI*2;
      const hue = 145 + randStatic()*55; // green/teal family
      const a = 0.18 + randStatic()*0.16;
      items.push({ x, y, len, thick, sway, ph, hue, a });
    }
    return items;
  }

  function makeCoral(){
    const randStatic = mulberry32((staticSeed ^ 0x7f4a7c15) >>> 0);
    const top = h*0.86;
    const count = 4 + ((randStatic() * 4) | 0);
    const items = [];
    for (let i = 0; i < count; i++){
      const x = w * (0.12 + randStatic()*0.78);
      const y = top + (randStatic()*h*0.10);
      const r = h * (0.010 + randStatic()*0.018);
      const hue = 330 + randStatic()*40; // pink/orange coral
      const light = 56 + randStatic()*12;
      const a = 0.22 + randStatic()*0.18;
      const bumps = 5 + ((randStatic()*6) | 0);
      const spread = 2.0 + randStatic()*2.2;
      items.push({ x, y, r, hue, light, a, bumps, spread, ph: randStatic()*Math.PI*2 });
    }
    return items;
  }

  function onResize(width,height){
    w=width; h=height;
    sand = makeSand();
    seaweed = makeSeaweed();
    coral = makeCoral();
  }

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
    for (const s of sand){
      ctx.fillStyle = s.style;
      ctx.fillRect(s.x, s.y, 1, 1);
    }
    ctx.restore();

    // coral + seaweed (background elements sitting on the seabed)
    drawCoral(ctx);
    drawSeaweed(ctx);

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

    // label (kept subtle and away from the OSD area)
    ctx.save();
    ctx.font = `${Math.floor(h/34)}px ui-serif, Georgia, serif`;
    ctx.fillStyle = 'rgba(210,255,250,0.35)';
    ctx.shadowColor = 'rgba(0,0,0,0.45)';
    ctx.shadowBlur = 6;
    ctx.fillText('Midnight Aquarium', w*0.05, h*0.83);
    ctx.restore();
  }

  function drawFish(ctx, f){
    const sway = Math.sin(t*4 + f.ph) * 0.25;
    ctx.save();
    ctx.translate(f.x, f.y);
    ctx.scale(f.dir, 1);
    ctx.rotate(sway*0.08);

    const kind = f.kind || 'common';

    // Rare fish: subtle bioluminescent halo to make them pop without being neon.
    if (kind === 'rare'){
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const r = f.size * (1.6 + 0.2*Math.sin(t*1.2 + f.ph));
      const gg = ctx.createRadialGradient(0, 0, f.size*0.2, 0, 0, r);
      gg.addColorStop(0, `hsla(${(f.hue+10)%360}, 95%, 70%, 0.26)`);
      gg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.arc(0, 0, r, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();
    }

    // Shape params vary by kind.
    const bodyX = f.size * (kind === 'uncommon' ? 1.25 : 1.1);
    const bodyY = f.size * (kind === 'uncommon' ? 0.78 : 0.65);

    // body
    const body = ctx.createLinearGradient(-f.size,0,f.size,0);
    body.addColorStop(0, `hsla(${f.hue},85%,${kind === 'rare' ? 66 : 60}%,0.92)`);
    body.addColorStop(1, `hsla(${(f.hue+40)%360},90%,${kind === 'rare' ? 60 : 55}%,0.86)`);
    ctx.fillStyle = body;
    ctx.beginPath();
    ctx.ellipse(0,0, bodyX, bodyY,0,0,Math.PI*2);
    ctx.fill();

    // uncommon: add a soft vertical stripe pattern (stable via f.variant)
    if (kind === 'uncommon'){
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = `hsla(${(f.hue+160)%360}, 70%, 70%, 0.7)`;
      const stripes = 3 + ((f.variant * 3)|0);
      for (let i = 0; i < stripes; i++){
        const x = (-f.size*0.75) + (i/(stripes-1))*f.size*1.2;
        ctx.beginPath();
        ctx.ellipse(x, 0, f.size*0.11, f.size*0.62, 0, 0, Math.PI*2);
        ctx.fill();
      }
      ctx.restore();
    }

    // tail
    ctx.fillStyle = `hsla(${(f.hue+20)%360},90%,55%,0.78)`;
    ctx.beginPath();
    ctx.moveTo(-bodyX,0);
    if (kind === 'rare'){
      // forked tail
      ctx.lineTo(-f.size*1.85, -f.size*0.55);
      ctx.lineTo(-f.size*1.45, 0);
      ctx.lineTo(-f.size*1.85, f.size*0.55);
    } else {
      ctx.lineTo(-f.size*1.7, -f.size*0.45);
      ctx.lineTo(-f.size*1.65, f.size*0.45);
    }
    ctx.closePath();
    ctx.fill();

    // dorsal fin / wing fin
    ctx.globalAlpha = 0.65;
    ctx.fillStyle = `hsla(${(f.hue+80)%360},80%,60%,0.6)`;
    ctx.beginPath();
    if (kind === 'uncommon'){
      // taller fin silhouette
      ctx.moveTo(-f.size*0.15, -f.size*0.1);
      ctx.quadraticCurveTo(f.size*0.1, -f.size*1.15, f.size*0.65, -f.size*0.25);
      ctx.quadraticCurveTo(f.size*0.25, -f.size*0.25, -f.size*0.15, -f.size*0.1);
    } else {
      ctx.moveTo(-f.size*0.1,0);
      ctx.quadraticCurveTo(f.size*0.2, -f.size*0.9, f.size*0.55, -f.size*0.2);
      ctx.quadraticCurveTo(f.size*0.2, -f.size*0.1, -f.size*0.1,0);
    }
    ctx.fill();

    // rare: tiny lure dot near the head
    if (kind === 'rare'){
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = `hsla(${(f.hue+30)%360}, 95%, 72%, 0.85)`;
      ctx.beginPath();
      ctx.arc(f.size*0.95, -f.size*0.55, f.size*0.09, 0, Math.PI*2);
      ctx.fill();
    }

    // eye
    ctx.globalAlpha = 1;
    ctx.fillStyle = 'rgba(255,255,255,0.9)';
    ctx.beginPath(); ctx.arc(f.size*0.55, -f.size*0.1, f.size*0.12,0,Math.PI*2); ctx.fill();
    ctx.fillStyle = 'rgba(0,0,0,0.75)';
    ctx.beginPath(); ctx.arc(f.size*0.58, -f.size*0.1, f.size*0.06,0,Math.PI*2); ctx.fill();

    ctx.restore();
  }

  function drawSeaweed(ctx){
    const top = h*0.86;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const s of seaweed){
      const bend = Math.sin(t*0.55*s.sway + s.ph);
      const x0 = s.x;
      const y0 = s.y;
      const y1 = y0 - s.len;
      const x1 = x0 + bend * (s.len * 0.10);

      // Two control points for a smooth stalk.
      const cx1 = x0 + bend * (s.len * 0.06);
      const cy1 = y0 - s.len * 0.35;
      const cx2 = x0 + bend * (s.len * 0.12);
      const cy2 = y0 - s.len * 0.72;

      ctx.lineWidth = s.thick;
      ctx.strokeStyle = `hsla(${s.hue}, 60%, 55%, ${s.a})`;
      ctx.beginPath();
      ctx.moveTo(x0, y0);
      ctx.bezierCurveTo(cx1, cy1, cx2, cy2, x1, y1);
      ctx.stroke();

      // a faint highlight line for depth
      ctx.lineWidth = Math.max(1, s.thick * 0.55);
      ctx.strokeStyle = `hsla(${(s.hue+25)%360}, 65%, 62%, ${s.a*0.55})`;
      ctx.beginPath();
      ctx.moveTo(x0 + s.thick*0.35, y0);
      ctx.bezierCurveTo(cx1 + s.thick*0.35, cy1, cx2 + s.thick*0.35, cy2, x1 + s.thick*0.2, y1);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCoral(ctx){
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const c of coral){
      const pulse = 0.5 + 0.5*Math.sin(t*0.25 + c.ph);
      const a0 = c.a * (0.75 + 0.25*pulse);
      ctx.fillStyle = `hsla(${c.hue%360}, 70%, ${c.light}%, ${a0})`;

      // base blob
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r*1.2, 0, Math.PI*2);
      ctx.fill();

      // bumps/branches
      for (let i = 0; i < c.bumps; i++){
        const ang = (i / c.bumps) * Math.PI*2;
        const rr = c.r * (0.65 + 0.65*Math.sin(i*1.7 + c.ph)*0.2);
        const dx = Math.cos(ang) * c.r * c.spread;
        const dy = Math.sin(ang) * c.r * (c.spread*0.6);
        ctx.beginPath();
        ctx.arc(c.x + dx, c.y + dy, rr, 0, Math.PI*2);
        ctx.fill();
      }

      // soft glow underneath
      const gg = ctx.createRadialGradient(c.x, c.y, c.r*0.5, c.x, c.y, c.r*4.2);
      gg.addColorStop(0, `hsla(${c.hue%360}, 85%, ${Math.min(80, c.light+10)}%, ${a0*0.24})`);
      gg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = gg;
      ctx.beginPath();
      ctx.arc(c.x, c.y, c.r*4.2, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.restore();
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
