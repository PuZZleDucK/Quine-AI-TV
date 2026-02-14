import { mulberry32, clamp } from '../util/prng.js';
import { simpleDrone } from '../util/audio.js';

// Subterranean Mushroom Lab
// Bioluminescent fungus terrariums that “grow” across phases;
// microscope inset + spore-count ticker; moody cave parallax.

function lerp(a, b, t) { return a + (b - a) * t; }
function ease(t){ t = clamp(t, 0, 1); return t*t*(3-2*t); }

function roundRect(ctx, x, y, w, h, r){
  r = Math.max(0, Math.min(r, Math.min(w, h) / 2));
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

function fmtInt(n, w=6){ return String(Math.max(0, Math.floor(n))).padStart(w, '0'); }

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0, h = 0, dpr = 1;
  let t = 0;
  let font = 18;

  const cycle = 92; // seconds

  // timed moments
  let nextFlickerAt = 0;
  let flicker = 0;

  // lab elements
  let terrariums = []; // {x,y,w,h, glowHue, mush: [{x,y,s,cap,stem}...]}
  let dust = []; // foreground motes

  // spores
  let spores = []; // {x,y,vx,vy,life, r, hue}
  let sporeCount = 0;
  let lastBurstSeg = -1;

  // microscope
  let scope = { x:0, y:0, w:0, h:0 };
  let scopeTarget = 0;

  // audio handle
  let drone = null;
  let noise = null;
  let ah = null;

  function pick(arr){ return arr[(rand() * arr.length) | 0]; }

  function initScene({ width, height, dpr: _dpr=1 }){
    w = width; h = height; dpr = _dpr;
    t = 0;
    font = Math.max(14, Math.floor(Math.min(w, h) / 34));

    const pad = Math.floor(w * 0.06);

    // terrariums
    const n = 3 + ((rand() * 2) | 0);
    terrariums = [];
    for (let i=0;i<n;i++){
      const tw = w * (0.18 + rand() * 0.08);
      const th = h * (0.34 + rand() * 0.10);
      const tx = lerp(pad, w - pad - tw, n === 1 ? 0.5 : i / (n - 1));
      const ty = h * (0.26 + rand() * 0.12);
      const glowHue = 150 + ((rand() * 120) | 0);

      const mushN = 7 + ((rand() * 8) | 0);
      const mush = [];
      for (let k=0;k<mushN;k++){
        mush.push({
          x: tx + tw * (0.10 + rand() * 0.80),
          y: ty + th * (0.58 + rand() * 0.30),
          s: (0.65 + rand() * 1.25),
          cap: 0.8 + rand() * 1.4,
          stem: 0.8 + rand() * 1.5,
          wob: rand() * 10,
        });
      }

      terrariums.push({ x: tx, y: ty, w: tw, h: th, glowHue, mush });
    }

    // microscope inset
    scope = {
      w: Math.floor(w * 0.28),
      h: Math.floor(h * 0.20),
      x: w - pad - Math.floor(w * 0.28),
      y: pad,
    };
    scopeTarget = (seed % terrariums.length + terrariums.length) % terrariums.length;

    // dust
    dust = Array.from({ length: 120 }, () => ({
      x: rand() * w,
      y: rand() * h,
      z: 0.15 + rand() * 0.95,
      tw: rand() * 10,
    }));

    spores = [];
    sporeCount = 0;
    lastBurstSeg = -1;

    flicker = 0;
    nextFlickerAt = 2.5 + rand() * 4.0;
  }

  function init({ width, height, dpr: _dpr=1 }){ initScene({ width, height, dpr: _dpr }); }
  function onResize(width, height, _dpr){ init({ width, height, dpr: _dpr }); }

  function makeAudioHandle(){
    const ctx = audio.ensure();
    const out = ctx.createGain();
    out.gain.value = 0.78;
    out.connect(audio.master);

    // a low cave hum + subtle filtered noise
    drone = simpleDrone(audio, { root: 55, detune: 1.1, gain: 0.040 });

    noise = audio.noiseSource({ type: 'brown', gain: 0.0038 });
    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 420;
    lpf.Q.value = 0.6;

    // reroute noise → lpf → out
    noise.src.disconnect();
    noise.src.connect(noise.gain);
    noise.gain.disconnect();
    noise.gain.connect(lpf);
    lpf.connect(out);

    noise.start();

    return {
      stop(){
        const now = ctx.currentTime;
        try { out.gain.setTargetAtTime(0.0001, now, 0.12); } catch {}
        try { noise?.stop?.(); } catch {}
        try { drone?.stop?.(); } catch {}
      }
    };
  }

  function onAudioOn(){
    if (!audio.enabled) return;
    ah = makeAudioHandle();
    audio.setCurrent(ah);
  }

  function onAudioOff(){
    try { ah?.stop?.(); } catch {}
    ah = null;
    drone = null;
    noise = null;
  }

  function destroy(){ onAudioOff(); }

  function spawnSporeBurst(pow=1){
    for (const jar of terrariums){
      const hue = jar.glowHue;
      // spawn from a couple of mushrooms near the top
      for (let i=0;i<jar.mush.length;i++){
        const m = jar.mush[i];
        if (((i + seed) % 3) !== 0) continue;
        const x0 = m.x + Math.sin(t*0.8 + m.wob) * w * 0.0015;
        const y0 = m.y - h * 0.020 * m.cap;

        const count = 10 + ((rand() * 12) | 0);
        for (let k=0;k<count;k++){
          const a = (rand() * Math.PI * 2);
          const sp = (0.06 + rand() * 0.18) * (0.7 + pow * 0.6);
          spores.push({
            x: x0 + (rand() - 0.5) * 8,
            y: y0 + (rand() - 0.5) * 6,
            vx: Math.cos(a) * sp * 60,
            vy: (-0.4 - rand() * 1.2) * 30 - Math.sin(a) * sp * 24,
            life: 1.0 + rand() * 1.4,
            r: 0.8 + rand() * 1.6,
            hue,
          });
        }
      }
    }
  }

  function update(dt){
    t += dt;

    // segments: 0 grow | 1 sample | 2 release | 3 reset
    const ph = (t % cycle) / cycle;
    const seg = ph < 0.38 ? 0 : ph < 0.60 ? 1 : ph < 0.72 ? 2 : 3;

    // scope target changes on segment boundaries
    const segIdx = Math.floor((t % cycle) / (cycle / 4));
    if (segIdx !== scopeTarget && terrariums.length){
      // not literally tied to segIdx: make it rotate through jars
      if ((t % cycle) < dt) scopeTarget = (scopeTarget + 1) % terrariums.length;
    }

    // spore counter
    const baseRate = seg === 0 ? 11 : seg === 1 ? 18 : seg === 2 ? 85 : 6;
    sporeCount += dt * baseRate;

    // timed flicker moment
    flicker = Math.max(0, flicker - dt * 3.2);
    if (t >= nextFlickerAt){
      flicker = 1;
      nextFlickerAt = t + 4.5 + rand() * 8.0;
    }

    // spore release burst once per cycle
    if (seg === 2 && lastBurstSeg !== Math.floor(t / cycle)){
      lastBurstSeg = Math.floor(t / cycle);
      spawnSporeBurst(1);
      if (audio.enabled){
        audio.beep({ freq: 820 + rand() * 180, dur: 0.030, gain: 0.012, type: 'triangle' });
        audio.beep({ freq: 520 + rand() * 90, dur: 0.045, gain: 0.010, type: 'sine' });
      }
    }

    // update spores
    const gx = Math.sin(t * 0.22) * 0.22;
    for (let i=spores.length-1;i>=0;i--){
      const s = spores[i];
      s.life -= dt;
      s.vx += gx * 8 * dt;
      s.vy += (-6 - 8 * s.r) * dt;
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      if (s.life <= 0 || s.y < -h * 0.2 || s.x < -w * 0.2 || s.x > w * 1.2) spores.splice(i, 1);
    }

    // keep spores bounded
    if (spores.length > 900) spores.length = 900;
  }

  function drawCave(ctx){
    // base cave gradient
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#030506');
    g.addColorStop(0.45, '#03080b');
    g.addColorStop(1, '#010203');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // parallax layers
    const driftA = Math.sin(t * 0.08) * w * 0.010;
    const driftB = Math.sin(t * 0.11 + 1.3) * w * 0.018;

    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = '#020405';
    ctx.beginPath();
    ctx.moveTo(-w*0.1 + driftA, h*0.55);
    ctx.quadraticCurveTo(w*0.28 + driftA, h*0.42, w*0.55 + driftA, h*0.58);
    ctx.quadraticCurveTo(w*0.80 + driftA, h*0.70, w*1.15 + driftA, h*0.52);
    ctx.lineTo(w*1.2, h);
    ctx.lineTo(-w*0.2, h);
    ctx.closePath();
    ctx.fill();

    ctx.globalAlpha = 0.38;
    ctx.fillStyle = '#05080a';
    ctx.beginPath();
    ctx.moveTo(-w*0.1 + driftB, h*0.70);
    ctx.quadraticCurveTo(w*0.22 + driftB, h*0.62, w*0.52 + driftB, h*0.73);
    ctx.quadraticCurveTo(w*0.82 + driftB, h*0.84, w*1.15 + driftB, h*0.66);
    ctx.lineTo(w*1.2, h);
    ctx.lineTo(-w*0.2, h);
    ctx.closePath();
    ctx.fill();
    ctx.restore();

    // vignette
    const vg = ctx.createRadialGradient(w*0.5, h*0.55, 0, w*0.5, h*0.55, Math.max(w,h)*0.80);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.80)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
  }

  function drawJar(ctx, jar, growth, glowAmt){
    const r = Math.max(16, Math.floor(Math.min(jar.w, jar.h) * 0.08));

    // shadow
    ctx.save();
    ctx.globalAlpha = 0.55;
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    roundRect(ctx, jar.x + 10, jar.y + 14, jar.w, jar.h, r);
    ctx.fill();

    // glass body
    const gg = ctx.createLinearGradient(jar.x, jar.y, jar.x + jar.w, jar.y + jar.h);
    gg.addColorStop(0, 'rgba(12, 26, 22, 0.92)');
    gg.addColorStop(0.55, 'rgba(8, 16, 14, 0.92)');
    gg.addColorStop(1, 'rgba(6, 10, 10, 0.94)');
    ctx.globalAlpha = 0.95;
    ctx.fillStyle = gg;
    roundRect(ctx, jar.x, jar.y, jar.w, jar.h, r);
    ctx.fill();

    // glow pool
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const gx = jar.x + jar.w * 0.52;
    const gy = jar.y + jar.h * 0.70;
    const gr = Math.min(jar.w, jar.h) * (0.55 + 0.10 * Math.sin(t*0.7 + jar.glowHue));
    const halo = ctx.createRadialGradient(gx, gy, 1, gx, gy, gr);
    halo.addColorStop(0, `hsla(${jar.glowHue}, 90%, 60%, ${0.16 + glowAmt * 0.26})`);
    halo.addColorStop(1, `hsla(${jar.glowHue}, 90%, 60%, 0)`);
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(gx, gy, gr, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();

    // substrate
    const dirtH = jar.h * 0.26;
    const dg = ctx.createLinearGradient(0, jar.y + jar.h - dirtH, 0, jar.y + jar.h);
    dg.addColorStop(0, 'rgba(86,64,38,0.25)');
    dg.addColorStop(1, 'rgba(36,24,14,0.92)');
    ctx.globalAlpha = 0.92;
    ctx.fillStyle = dg;
    ctx.beginPath();
    ctx.moveTo(jar.x, jar.y + jar.h - dirtH);
    for (let i=0;i<=8;i++){
      const u = i/8;
      const x = jar.x + u * jar.w;
      const y = jar.y + jar.h - dirtH + Math.sin(u*6.2 + jar.glowHue*0.01) * jar.h*0.018;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(jar.x + jar.w, jar.y + jar.h);
    ctx.lineTo(jar.x, jar.y + jar.h);
    ctx.closePath();
    ctx.fill();

    // mushrooms
    ctx.save();
    roundRect(ctx, jar.x, jar.y, jar.w, jar.h, r);
    ctx.clip();

    for (let i=0;i<jar.mush.length;i++){
      const m = jar.mush[i];
      const sway = Math.sin(t*0.6 + m.wob) * (w * 0.0009);

      const baseS = Math.min(w, h) * 0.0065 * m.s;
      const g = ease(growth);
      const stemH = baseS * (6.5 + m.stem * 4.2) * (0.25 + 0.75 * g);
      const capR = baseS * (2.4 + m.cap * 1.4) * (0.30 + 0.70 * g);

      // stem
      ctx.globalAlpha = 0.55;
      ctx.strokeStyle = 'rgba(210,225,220,0.65)';
      ctx.lineWidth = Math.max(1, baseS * 0.28);
      ctx.beginPath();
      ctx.moveTo(m.x, m.y);
      ctx.quadraticCurveTo(m.x + sway * 20, m.y - stemH * 0.45, m.x + sway * 40, m.y - stemH);
      ctx.stroke();

      // cap glow
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const capX = m.x + sway * 40;
      const capY = m.y - stemH;
      const capG = ctx.createRadialGradient(capX, capY, 1, capX, capY, capR * 1.6);
      capG.addColorStop(0, `hsla(${jar.glowHue}, 95%, 64%, ${0.20 + glowAmt * 0.35})`);
      capG.addColorStop(1, `hsla(${jar.glowHue}, 95%, 60%, 0)`);
      ctx.fillStyle = capG;
      ctx.beginPath();
      ctx.arc(capX, capY, capR * 1.6, 0, Math.PI*2);
      ctx.fill();
      ctx.restore();

      // cap body
      ctx.globalAlpha = 0.85;
      ctx.fillStyle = `hsla(${jar.glowHue}, 45%, ${24 + g*10}%, 0.92)`;
      ctx.beginPath();
      ctx.ellipse(capX, capY, capR * 1.2, capR * 0.85, -0.2 + sway*0.2, 0, Math.PI*2);
      ctx.fill();

      // gills highlight
      ctx.globalAlpha = 0.22;
      ctx.strokeStyle = 'rgba(220,255,245,0.85)';
      ctx.lineWidth = Math.max(1, baseS * 0.12);
      for (let k=0;k<4;k++){
        const ang = (-0.9 + k*0.6);
        ctx.beginPath();
        ctx.moveTo(capX, capY);
        ctx.lineTo(capX + Math.cos(ang) * capR, capY + Math.sin(ang) * capR * 0.55);
        ctx.stroke();
      }
    }

    ctx.restore();

    // glass edge + reflection
    ctx.globalAlpha = 0.18;
    ctx.strokeStyle = 'rgba(210,255,240,0.80)';
    ctx.lineWidth = Math.max(1, Math.floor(Math.min(w, h) / 320));
    roundRect(ctx, jar.x, jar.y, jar.w, jar.h, r);
    ctx.stroke();

    ctx.globalAlpha = 0.12;
    ctx.strokeStyle = 'rgba(255,255,255,0.85)';
    ctx.lineWidth = Math.max(1, Math.floor(Math.min(w, h) / 260));
    ctx.beginPath();
    ctx.moveTo(jar.x + jar.w*0.12, jar.y + jar.h*0.18);
    ctx.quadraticCurveTo(jar.x + jar.w*0.28, jar.y + jar.h*0.06, jar.x + jar.w*0.52, jar.y + jar.h*0.12);
    ctx.stroke();

    ctx.restore();
  }

  function drawSpores(ctx){
    if (!spores.length) return;
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (let i=0;i<spores.length;i++){
      const s = spores[i];
      const a = clamp(s.life, 0, 1);
      ctx.globalAlpha = 0.55 * a;
      ctx.fillStyle = `hsla(${s.hue}, 90%, 70%, ${0.7 * a})`;
      ctx.beginPath();
      ctx.arc(s.x, s.y, s.r, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawDust(ctx){
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const p of dust){
      const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t*(0.28 + p.z*0.32) + p.tw));
      const a = (0.04 + 0.10 * tw) * (0.35 + p.z * 0.65);
      const x = (p.x + t * (6 + 18 * p.z)) % (w + 2);
      const y = (p.y + Math.sin(t*0.18 + p.tw) * (1 + 6 * p.z)) % (h + 2);
      const r = 0.6 + p.z * 1.6;
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(190,255,240,0.85)';
      ctx.beginPath();
      ctx.arc(x, y, r, 0, Math.PI*2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawScope(ctx, segName, segProg){
    const r = Math.max(12, Math.floor(Math.min(scope.w, scope.h) * 0.10));

    // container
    ctx.save();
    ctx.globalAlpha = 0.70;
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    roundRect(ctx, scope.x + 6, scope.y + 8, scope.w, scope.h, r);
    ctx.fill();

    ctx.globalAlpha = 0.92;
    ctx.fillStyle = 'rgba(6,10,10,0.88)';
    roundRect(ctx, scope.x, scope.y, scope.w, scope.h, r);
    ctx.fill();

    // faux microscope image
    const jar = terrariums[scopeTarget % terrariums.length];
    const hue = jar?.glowHue ?? 160;
    const cx = scope.x + scope.w * 0.52;
    const cy = scope.y + scope.h * 0.55;

    // background blob field
    ctx.save();
    roundRect(ctx, scope.x, scope.y, scope.w, scope.h, r);
    ctx.clip();

    ctx.globalCompositeOperation = 'screen';
    for (let i=0;i<40;i++){
      const u = (i / 40);
      const ang = u * Math.PI * 2;
      const rr = Math.min(scope.w, scope.h) * (0.10 + 0.35 * rand());
      const x = cx + Math.cos(ang + t*0.12) * (scope.w * 0.22) + Math.sin(t*0.4 + i) * 6;
      const y = cy + Math.sin(ang + t*0.10) * (scope.h * 0.22) + Math.cos(t*0.33 + i*0.7) * 5;
      const a = 0.06 + 0.08 * Math.sin(t*0.8 + i);
      ctx.globalAlpha = a;
      ctx.fillStyle = `hsla(${hue}, 95%, 65%, 0.9)`;
      ctx.beginPath();
      ctx.arc(x, y, rr * 0.12, 0, Math.PI*2);
      ctx.fill();
    }

    // grain
    ctx.globalCompositeOperation = 'source-over';
    ctx.globalAlpha = 0.06;
    for (let i=0;i<180;i++){
      const x = scope.x + rand() * scope.w;
      const y = scope.y + rand() * scope.h;
      ctx.fillStyle = `rgba(255,255,255,${0.06 + rand()*0.12})`;
      ctx.fillRect(x, y, 1, 1);
    }

    ctx.restore();

    // crosshair
    ctx.globalAlpha = 0.28;
    ctx.strokeStyle = 'rgba(210,255,240,0.85)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(cx - scope.w*0.18, cy);
    ctx.lineTo(cx + scope.w*0.18, cy);
    ctx.moveTo(cx, cy - scope.h*0.18);
    ctx.lineTo(cx, cy + scope.h*0.18);
    ctx.stroke();

    // labels
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(220,245,240,0.90)';
    ctx.font = `${Math.floor(font * 0.70)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'middle';
    ctx.fillText('MICROSCOPE', scope.x + 14, scope.y + 18);

    ctx.globalAlpha = 0.72;
    ctx.textAlign = 'right';
    ctx.fillText(`${segName}  ${(segProg*100|0)}%`, scope.x + scope.w - 14, scope.y + 18);

    ctx.restore();
  }

  function drawHUD(ctx, segName){
    const pad = Math.floor(w * 0.06);

    // title strip
    ctx.save();
    ctx.globalAlpha = 0.82;
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0, Math.floor(h*0.06), w, Math.floor(h*0.10));

    ctx.globalAlpha = 0.92;
    ctx.fillStyle = 'rgba(220,245,240,0.92)';
    ctx.font = `${Math.floor(font * 1.05)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'middle';
    ctx.fillText('SUBTERRANEAN MUSHROOM LAB', pad, Math.floor(h*0.11));

    // spore ticker
    const flick = flicker > 0 ? (rand() - 0.5) * 6 : 0;
    ctx.textAlign = 'right';
    ctx.globalAlpha = 0.82;
    ctx.font = `${Math.floor(font * 0.78)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillText(`SPORES ${fmtInt(sporeCount)}  •  ${segName}`, w - pad + flick, Math.floor(h*0.11));

    ctx.restore();
  }

  function render(ctx){
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0, 0, w, h);

    const ph = (t % cycle) / cycle;
    const seg = ph < 0.38 ? 0 : ph < 0.60 ? 1 : ph < 0.72 ? 2 : 3;

    let segName = 'GROWTH';
    let growth = 0.0;
    let glowAmt = 0.35;
    let segProg = 0;

    if (seg === 0){
      segName = 'GROWTH';
      segProg = ph / 0.38;
      growth = segProg;
      glowAmt = 0.25 + 0.35 * segProg;
    } else if (seg === 1){
      segName = 'SAMPLE';
      segProg = (ph - 0.38) / (0.60 - 0.38);
      growth = 1.0;
      glowAmt = 0.45 + 0.10 * Math.sin(t*0.9);
    } else if (seg === 2){
      segName = 'SPORE RELEASE';
      segProg = (ph - 0.60) / (0.72 - 0.60);
      growth = 1.0;
      glowAmt = 0.62 + 0.25 * (0.5 + 0.5 * Math.sin(t*6.0));
    } else {
      segName = 'RESET';
      segProg = (ph - 0.72) / (1.0 - 0.72);
      growth = 1.0 - segProg;
      glowAmt = 0.35 + 0.15 * (1 - segProg);
    }

    drawCave(ctx);

    // jars
    for (const jar of terrariums){
      const perJar = 0.85 + 0.15 * Math.sin(t*0.5 + jar.glowHue*0.02);
      drawJar(ctx, jar, growth, glowAmt * perJar);
    }

    // spores
    drawSpores(ctx);

    // dust / foreground
    drawDust(ctx);

    // microscope + HUD
    drawScope(ctx, segName, segProg);
    drawHUD(ctx, segName);

    // small footer hint
    ctx.save();
    ctx.globalAlpha = 0.42;
    ctx.fillStyle = 'rgba(220,245,240,0.80)';
    ctx.font = `${Math.floor(font * 0.64)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textAlign = 'left';
    ctx.fillText('Terrariums • microscope • spore ticker', Math.floor(w*0.06), Math.floor(h*0.93));
    ctx.restore();
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
