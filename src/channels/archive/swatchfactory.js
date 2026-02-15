import { mulberry32, clamp } from '../../util/prng.js';
import { simpleDrone } from '../../util/audio.js';

function pick(rand, a){ return a[(rand() * a.length) | 0]; }
function lerp(a,b,t){ return a + (b-a)*t; }
function ease(t){ t = clamp(t, 0, 1); return t*t*(3-2*t); }

function hslToRgb(h, s, l){
  h = ((h % 360) + 360) % 360;
  s = clamp(s, 0, 1);
  l = clamp(l, 0, 1);
  const c = (1 - Math.abs(2*l - 1)) * s;
  const hp = h / 60;
  const x = c * (1 - Math.abs((hp % 2) - 1));
  let r=0,g=0,b=0;
  if (hp < 1) { r=c; g=x; b=0; }
  else if (hp < 2) { r=x; g=c; b=0; }
  else if (hp < 3) { r=0; g=c; b=x; }
  else if (hp < 4) { r=0; g=x; b=c; }
  else if (hp < 5) { r=x; g=0; b=c; }
  else { r=c; g=0; b=x; }
  const m = l - c/2;
  return [r+m, g+m, b+m];
}

function rgbToHex(r, g, b){
  const to = (v) => {
    const n = Math.max(0, Math.min(255, (v * 255) | 0));
    return n.toString(16).padStart(2,'0');
  };
  return `#${to(r)}${to(g)}${to(b)}`;
}

function hsl(h, s, l){
  const [r,g,b] = hslToRgb(h, s, l);
  return rgbToHex(r,g,b);
}

function mixRgb(a, b, t){
  return [
    lerp(a[0], b[0], t),
    lerp(a[1], b[1], t),
    lerp(a[2], b[2], t),
  ];
}

function hexToRgb01(hex){
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return [1,1,1];
  const n = parseInt(m[1], 16);
  return [((n>>16)&255)/255, ((n>>8)&255)/255, (n&255)/255];
}

function tint(hex, amt){
  const c = hexToRgb01(hex);
  const w = [1,1,1];
  const out = mixRgb(c, w, clamp(amt, 0, 1));
  return rgbToHex(out[0], out[1], out[2]);
}

function shade(hex, amt){
  const c = hexToRgb01(hex);
  const k = [0,0,0];
  const out = mixRgb(c, k, clamp(amt, 0, 1));
  return rgbToHex(out[0], out[1], out[2]);
}

const PIGMENT_NAMES = [
  'CAD YELLOW', 'NAPLES', 'ALIZARIN', 'MAGENTA', 'ULTRAMARINE', 'COBALT',
  'PHTHALO', 'VIRIDIAN', 'BURNT SIENNA', 'RAW UMBER', 'PAYNES GREY', 'TITANIUM'
];

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w=0, h=0, dpr=1;
  let t=0;

  // 4-phase loop
  const CYCLE = 40;
  const PHASE_DUR = CYCLE / 4;
  let phase = -1;
  let cycleIndex = 0;

  // content/state
  let recipe = null; // {id, pigments:[{name,color}], mixColor, targetColor}
  let splats = []; // {a,r,spd,c}
  let swatches = []; // {id,color,born}
  let conveyor = 0;

  let perfectCycle = 2 + ((rand()*5)|0);
  let perfectPulse = 0;
  let sparkles = []; // {x,y,vx,vy,life,c}

  // audio
  let ambience = null;
  let drone = null;
  let audioHandle = null;

  function safeBeep(opts){ if (audio.enabled) audio.beep(opts); }

  function newRecipe(){
    const base = rand() * 360;
    const scheme = pick(rand, ['triad','analog','comp']);

    const hues = scheme === 'triad'
      ? [base, base + 120 + (rand()*16-8), base + 240 + (rand()*16-8)]
      : scheme === 'comp'
        ? [base, base + 180 + (rand()*18-9), base + (rand()*40-20)]
        : [base + (rand()*26-13), base + 30 + (rand()*18-9), base - 30 + (rand()*18-9)];

    const pigments = hues.map((hh, i) => {
      const name = PIGMENT_NAMES[((rand()*PIGMENT_NAMES.length)|0 + i*3) % PIGMENT_NAMES.length];
      const color = hsl(hh, 0.78 + rand()*0.18, 0.52 + rand()*0.08);
      return { name, color, hue: hh };
    });

    // tiny bias toward a pleasing mid-light mix
    const mixA = hexToRgb01(pigments[0].color);
    const mixB = hexToRgb01(pigments[1].color);
    const mixC = hexToRgb01(pigments[2].color);
    const m1 = mixRgb(mixA, mixB, 0.45 + rand()*0.2);
    const m2 = mixRgb(m1, mixC, 0.35 + rand()*0.25);
    const mixColor = rgbToHex(m2[0], m2[1], m2[2]);

    const targetColor = rand() < 0.55
      ? tint(mixColor, 0.18 + rand()*0.12)
      : shade(mixColor, 0.14 + rand()*0.18);

    return {
      id: `SW-${String(cycleIndex).padStart(3,'0')}`,
      pigments,
      mixColor,
      targetColor,
      scheme,
    };
  }

  function resetSplats(){
    splats = [];
    for (let i=0;i<12;i++){
      const p = recipe.pigments[i%recipe.pigments.length];
      splats.push({
        a: rand() * Math.PI * 2,
        r: 0.2 + rand()*0.85,
        spd: (rand()*2-1) * (0.35 + rand()*0.65),
        c: p.color,
      });
    }
  }

  function addSwatch(color){
    swatches.unshift({ id: recipe.id, color, born: t });
    if (swatches.length > 7) swatches.pop();
  }

  function onResize(width, height, devicePixelRatio=1){
    w = width; h = height; dpr = devicePixelRatio;
  }

  function onAudioOn(){
    if (!audio.enabled) return;
    try {
      ambience = audio.noiseSource({ type: 'pink', gain: 0.018 });
      ambience.start();
      drone = simpleDrone(audio, { root: 92, detune: 1.1, gain: 0.04 });
      audioHandle = { stop(){ try{ ambience?.stop?.(); } catch {} try{ drone?.stop?.(); } catch {} } };
      audio.setCurrent(audioHandle);
    } catch {}
  }

  function onAudioOff(){
    try { audioHandle?.stop?.(); } catch {}
    ambience = null;
    drone = null;
    audioHandle = null;
  }

  function destroy(){
    onAudioOff();
  }

  function spawnPerfect(){
    perfectPulse = 1;
    const cx = w * 0.78;
    const cy = h * 0.24;
    for (let i=0;i<22;i++){
      const ang = rand() * Math.PI * 2;
      const sp = (0.3 + rand()*0.9) * Math.min(w,h) * 0.22;
      sparkles.push({
        x: cx + Math.cos(ang) * 8,
        y: cy + Math.sin(ang) * 8,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp,
        life: 0.7 + rand()*0.7,
        c: recipe.targetColor,
      });
    }

    // tiny chord
    safeBeep({ freq: 440, dur: 0.08, gain: 0.02, type: 'triangle' });
    safeBeep({ freq: 550, dur: 0.09, gain: 0.017, type: 'triangle' });
    safeBeep({ freq: 660, dur: 0.1, gain: 0.013, type: 'triangle' });
  }

  function update(dt){
    t += dt;
    conveyor += dt * (w * 0.03);

    const local = t % CYCLE;
    const ph = (local / PHASE_DUR) | 0;

    if (ph !== phase){
      phase = ph;
      if (phase === 0){
        cycleIndex++;
        recipe = newRecipe();
        resetSplats();
        safeBeep({ freq: 240, dur: 0.06, gain: 0.015, type: 'sine' });
      } else if (phase === 1) {
        safeBeep({ freq: 320, dur: 0.05, gain: 0.012, type: 'square' });
      } else if (phase === 2) {
        safeBeep({ freq: 520, dur: 0.04, gain: 0.01, type: 'square' });
      } else if (phase === 3) {
        safeBeep({ freq: 420, dur: 0.05, gain: 0.012, type: 'triangle' });
      }
    }

    // phase-driven events
    const k = local - phase * PHASE_DUR; // within-phase seconds

    if (phase === 1 && k >= 6.2 && k <= 6.2 + dt) {
      addSwatch(recipe.mixColor);
      safeBeep({ freq: 190, dur: 0.06, gain: 0.013, type: 'sine' });
    }

    if (phase === 3 && cycleIndex === perfectCycle && k >= 8.0 && k <= 8.0 + dt) {
      spawnPerfect();
      perfectCycle = cycleIndex + 3 + ((rand()*6)|0);
    }

    // splats drift toward center during mix
    if (splats.length){
      for (const s of splats){
        s.a += s.spd * dt * 1.3;
        const pull = (phase === 0) ? 0.14 : 0.03;
        s.r = Math.max(0.08, s.r - dt * pull);
      }
    }

    perfectPulse = Math.max(0, perfectPulse - dt * 1.5);

    // sparkles
    sparkles = sparkles.filter(p => (p.life -= dt) > 0);
    for (const p of sparkles){
      p.x += p.vx * dt;
      p.y += p.vy * dt;
      p.vx *= Math.pow(0.05, dt); // strong drag
      p.vy *= Math.pow(0.05, dt);
    }
  }

  function drawBackground(ctx){
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#0b0d12');
    g.addColorStop(0.55, '#10131c');
    g.addColorStop(1, '#07080c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // faint moving grid
    ctx.save();
    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = 'rgba(231,238,246,0.22)';
    ctx.lineWidth = Math.max(1, (1.2 * dpr) | 0);
    const off = (conveyor * 0.06) % 80;
    for (let x = -off; x < w + 80; x += 80){
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }
    for (let y = -(off*0.7); y < h + 70; y += 70){
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }
    ctx.restore();

    // soft vignette
    ctx.save();
    const vg = ctx.createRadialGradient(w*0.5, h*0.45, Math.min(w,h)*0.1, w*0.5, h*0.45, Math.max(w,h)*0.75);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.6)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  function drawHeader(ctx){
    const pad = Math.floor(18 * dpr);
    const boxH = Math.floor(58 * dpr);

    ctx.save();
    ctx.fillStyle = 'rgba(10,12,18,0.78)';
    ctx.strokeStyle = 'rgba(231,238,246,0.18)';
    ctx.lineWidth = Math.max(1, (1.2*dpr)|0);
    ctx.beginPath();
    ctx.roundRect(pad, pad, w - pad*2, boxH, 10*dpr);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(231,238,246,0.88)';
    ctx.font = `${Math.floor(18*dpr)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace`;
    ctx.fillText('MINIATURE PAINT SWATCH FACTORY', pad + 14*dpr, pad + 24*dpr);

    ctx.fillStyle = 'rgba(231,238,246,0.55)';
    ctx.font = `${Math.floor(12*dpr)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace`;

    const local = (t % CYCLE);
    const ph = (local / PHASE_DUR) | 0;
    const names = ['MIX', 'POUR', 'LABEL', 'HARMONY'];
    const status = `PHASE: ${names[ph] || '—'}  •  BATCH: ${recipe?.id || '—'}`;
    ctx.fillText(status, pad + 14*dpr, pad + 46*dpr);

    // tiny scheme pill
    if (recipe){
      const pill = recipe.scheme.toUpperCase();
      const tw = ctx.measureText(pill).width;
      const px = w - pad - 18*dpr - tw;
      ctx.fillStyle = 'rgba(255,255,255,0.08)';
      ctx.beginPath();
      ctx.roundRect(px - 10*dpr, pad + 12*dpr, tw + 20*dpr, 20*dpr, 10*dpr);
      ctx.fill();
      ctx.fillStyle = 'rgba(231,238,246,0.55)';
      ctx.fillText(pill, px, pad + 27*dpr);
    }

    ctx.restore();
  }

  function drawBowl(ctx, cx, cy, R){
    const local = (t % CYCLE);
    const ph = (local / PHASE_DUR) | 0;
    const k = local - ph*PHASE_DUR;
    const mixAmt = ph === 0 ? ease(k / PHASE_DUR) : 1;

    // bowl body
    ctx.save();
    ctx.translate(cx, cy);

    const rim = ctx.createRadialGradient(0, 0, R*0.15, 0, 0, R);
    rim.addColorStop(0, 'rgba(0,0,0,0.0)');
    rim.addColorStop(1, 'rgba(231,238,246,0.16)');

    ctx.fillStyle = 'rgba(14,16,24,0.72)';
    ctx.beginPath();
    ctx.arc(0, 0, R, 0, Math.PI*2);
    ctx.fill();

    ctx.strokeStyle = rim;
    ctx.lineWidth = Math.max(1, (2*dpr)|0);
    ctx.stroke();

    // swirling paint surface
    const swirlR = R * 0.78;
    const base = recipe?.mixColor || '#6cf2ff';
    const hi = tint(base, 0.32);
    const lo = shade(base, 0.22);

    ctx.save();
    ctx.globalAlpha = 0.95;
    ctx.beginPath();
    ctx.arc(0, 0, swirlR, 0, Math.PI*2);
    ctx.clip();

    // swirl ribbons
    const ribbons = 10;
    for (let i=0;i<ribbons;i++){
      const a0 = (t*0.5 + i*0.65) % (Math.PI*2);
      const a1 = a0 + 1.6 + Math.sin(t*0.7 + i)*0.3;
      const rr = lerp(swirlR*0.25, swirlR*0.98, (i/(ribbons-1)));
      ctx.strokeStyle = i%2===0 ? hi : lo;
      ctx.globalAlpha = 0.28 + 0.28 * mixAmt;
      ctx.lineWidth = (R * (0.07 - i*0.004)) * (0.8 + mixAmt*0.35);
      ctx.beginPath();
      ctx.arc(0, 0, rr, a0, a1);
      ctx.stroke();
    }

    // pigment splats orbiting in
    if (splats.length){
      for (const s of splats){
        const rr = s.r * swirlR;
        const x = Math.cos(s.a) * rr;
        const y = Math.sin(s.a) * rr;
        ctx.fillStyle = s.c;
        ctx.globalAlpha = 0.24 * (0.4 + mixAmt*0.6);
        ctx.beginPath();
        ctx.arc(x, y, (R * 0.11) * (0.35 + 0.9*(1-s.r)), 0, Math.PI*2);
        ctx.fill();
      }
    }

    // specular sweep
    const sheen = (Math.sin(t*1.2) * 0.5 + 0.5);
    ctx.globalAlpha = 0.08 + sheen*0.12;
    ctx.fillStyle = 'rgba(255,255,255,0.8)';
    ctx.beginPath();
    ctx.ellipse(-R*0.15, -R*0.25, R*0.32, R*0.18, -0.6, 0, Math.PI*2);
    ctx.fill();

    ctx.restore();

    // labels
    if (recipe){
      ctx.globalAlpha = 0.75;
      ctx.fillStyle = 'rgba(231,238,246,0.7)';
      ctx.font = `${Math.floor(12*dpr)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace`;
      ctx.textAlign = 'center';
      ctx.fillText('MIXER', 0, R + 18*dpr);
    }

    ctx.restore();
  }

  function drawPigmentChips(ctx, x, y, ww, hh){
    if (!recipe) return;

    ctx.save();
    ctx.fillStyle = 'rgba(10,12,18,0.68)';
    ctx.strokeStyle = 'rgba(231,238,246,0.16)';
    ctx.lineWidth = Math.max(1, (1.2*dpr)|0);
    ctx.beginPath();
    ctx.roundRect(x, y, ww, hh, 10*dpr);
    ctx.fill();
    ctx.stroke();

    const pad = 12*dpr;
    const chipH = (hh - pad*2) / 3;
    ctx.font = `${Math.floor(11*dpr)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace`;

    recipe.pigments.forEach((p, i) => {
      const yy = y + pad + i*chipH;
      const barW = ww * 0.18;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.roundRect(x + pad, yy + chipH*0.18, barW, chipH*0.64, 6*dpr);
      ctx.fill();

      ctx.fillStyle = 'rgba(231,238,246,0.72)';
      ctx.fillText(p.name, x + pad + barW + 10*dpr, yy + chipH*0.62);
    });

    ctx.restore();
  }

  function drawConveyor(ctx, y){
    const beltH = h - y;

    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.28)';
    ctx.fillRect(0, y, w, beltH);

    // belt stripes
    ctx.globalAlpha = 0.16;
    ctx.fillStyle = 'rgba(231,238,246,0.55)';
    const stripeW = 22*dpr;
    const step = 80*dpr;
    const off = (conveyor % step);
    for (let x = -step; x < w + step; x += step){
      ctx.save();
      ctx.translate(x + off, y + beltH*0.55);
      ctx.rotate(-0.55);
      ctx.fillRect(-stripeW*0.5, -beltH, stripeW, beltH*2);
      ctx.restore();
    }
    ctx.globalAlpha = 1;

    // swatch cards (foreground)
    const cardW = Math.floor(w * 0.15);
    const cardH = Math.floor(beltH * 0.62);
    const baseX = w * 0.12;
    const gap = Math.floor(cardW * 0.08);

    swatches.forEach((s, i) => {
      const x = baseX + i*(cardW + gap) - (conveyor % (cardW + gap));
      const yy = y + beltH*0.18 + Math.sin(t*0.9 + i)*2*dpr;
      if (x < -cardW || x > w + cardW) return;

      const age = t - s.born;
      const lift = ease(Math.min(1, age/1.2));

      ctx.save();
      ctx.translate(x, yy - lift*4*dpr);

      // card
      ctx.fillStyle = 'rgba(245,245,245,0.93)';
      ctx.strokeStyle = 'rgba(20,20,20,0.28)';
      ctx.lineWidth = Math.max(1, (1.2*dpr)|0);
      ctx.beginPath();
      ctx.roundRect(0, 0, cardW, cardH, 10*dpr);
      ctx.fill();
      ctx.stroke();

      // 3 swatches: tint/base/shade
      const pad = 10*dpr;
      const barH = (cardH - pad*2 - 22*dpr) / 3;
      const cols = [tint(s.color, 0.28), s.color, shade(s.color, 0.22)];
      for (let k=0;k<3;k++){
        ctx.fillStyle = cols[k];
        ctx.beginPath();
        ctx.roundRect(pad, pad + k*barH, cardW - pad*2, barH - 3*dpr, 8*dpr);
        ctx.fill();
      }

      ctx.fillStyle = 'rgba(10,12,18,0.78)';
      ctx.font = `${Math.floor(11*dpr)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace`;
      ctx.fillText(s.id, pad, cardH - 8*dpr);

      ctx.restore();
    });

    ctx.restore();
  }

  function drawHarmonyGrid(ctx, x, y, ww, hh){
    if (!recipe) return;

    const local = (t % CYCLE);
    const ph = (local / PHASE_DUR) | 0;
    const k = local - ph*PHASE_DUR;

    const show = ph === 3 ? ease(k / 1.4) : 0;
    if (show <= 0.001) return;

    ctx.save();
    ctx.globalAlpha = 0.85 * show;
    ctx.fillStyle = 'rgba(10,12,18,0.72)';
    ctx.strokeStyle = 'rgba(231,238,246,0.18)';
    ctx.lineWidth = Math.max(1, (1.2*dpr)|0);
    ctx.beginPath();
    ctx.roundRect(x, y, ww, hh, 10*dpr);
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = 'rgba(231,238,246,0.72)';
    ctx.font = `${Math.floor(12*dpr)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace`;
    ctx.fillText('HARMONY GRID', x + 12*dpr, y + 18*dpr);

    const gx = x + 12*dpr;
    const gy = y + 28*dpr;
    const gw = ww - 24*dpr;
    const gh = hh - 44*dpr;

    const cell = Math.min(gw/3, gh/3);
    const ox = gx + (gw - cell*3)/2;
    const oy = gy + (gh - cell*3)/2;

    const baseHue = recipe.pigments[0].hue;
    const hues = [baseHue - 30, baseHue, baseHue + 30, baseHue + 150, baseHue + 180, baseHue + 210, baseHue + 240, baseHue + 270, baseHue + 300];

    for (let i=0;i<9;i++){
      const cx = ox + (i%3)*cell;
      const cy = oy + ((i/3)|0)*cell;
      const col = hsl(hues[i], 0.82, 0.52);
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.roundRect(cx, cy, cell - 6*dpr, cell - 6*dpr, 8*dpr);
      ctx.fill();
    }

    // target chip + lock-in
    const tx = x + ww - 12*dpr - cell;
    const ty = y + 22*dpr;
    ctx.globalAlpha = (0.9 * show);
    ctx.fillStyle = recipe.targetColor;
    ctx.beginPath();
    ctx.roundRect(tx, ty, cell, 16*dpr, 8*dpr);
    ctx.fill();

    if (perfectPulse > 0){
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.globalAlpha = 0.7 * perfectPulse;
      ctx.strokeStyle = 'rgba(255,255,255,0.9)';
      ctx.lineWidth = 3*dpr;
      ctx.beginPath();
      ctx.roundRect(x + 6*dpr, y + 6*dpr, ww - 12*dpr, hh - 12*dpr, 12*dpr);
      ctx.stroke();

      ctx.globalAlpha = 0.65 * perfectPulse;
      ctx.fillStyle = 'rgba(255,255,255,0.88)';
      ctx.font = `${Math.floor(14*dpr)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, \"Liberation Mono\", \"Courier New\", monospace`;
      ctx.fillText('PERFECT MATCH', x + 12*dpr, y + hh - 12*dpr);
      ctx.restore();
    }

    ctx.restore();
  }

  function drawSparkles(ctx){
    if (!sparkles.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const p of sparkles){
      const a = clamp(p.life, 0, 1);
      ctx.globalAlpha = 0.18 + a*0.55;
      ctx.fillStyle = tint(p.c, 0.35);
      ctx.beginPath();
      ctx.arc(p.x, p.y, 2.2*dpr + (1-a)*3*dpr, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.restore();
  }

  function draw(ctx){
    if (!w || !h) return;
    if (!recipe){
      cycleIndex = 0;
      recipe = newRecipe();
      resetSplats();
      addSwatch(recipe.mixColor);
    }

    ctx.clearRect(0, 0, w, h);

    drawBackground(ctx);

    drawHeader(ctx);

    // main layout
    const top = 84*dpr;
    const beltY = h * 0.62;

    const bowlCx = w * 0.35;
    const bowlCy = h * 0.36;
    const bowlR = Math.min(w,h) * 0.18;

    drawBowl(ctx, bowlCx, bowlCy, bowlR);

    drawPigmentChips(ctx, w * 0.6, top + 14*dpr, w * 0.34, h * 0.20);
    drawHarmonyGrid(ctx, w * 0.6, top + h*0.25, w * 0.34, h * 0.26);

    drawConveyor(ctx, beltY);
    drawSparkles(ctx);
  }

  return {
    onResize,
    update,
    draw,
    destroy,
    onAudioOn,
    onAudioOff,
  };
}
