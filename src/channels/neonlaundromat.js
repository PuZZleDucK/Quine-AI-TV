import { mulberry32, clamp } from '../util/prng.js';
import { simpleDrone } from '../util/audio.js';

function pick(rand, arr){ return arr[(rand() * arr.length) | 0]; }
function lerp(a, b, t){ return a + (b - a) * t; }
function ease(t){ t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }

function roundedRect(ctx, x, y, w, h, r){
  r = Math.min(r, w * 0.5, h * 0.5);
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0;
  let h = 0;
  let dpr = 1;
  let t = 0;

  let font = 16;
  let small = 12;
  let mono = 13;

  const pal = {
    bg0: '#05060b',
    bg1: '#07111a',
    floor0: '#05080d',
    floor1: '#0a0f16',
    grout: 'rgba(255,255,255,0.06)',
    machine: '#121a24',
    machineHi: '#1c2a3b',
    metal: 'rgba(220,240,255,0.22)',
    glass: 'rgba(160,210,255,0.13)',
    text: 'rgba(235,245,255,0.92)',
    subtext: 'rgba(235,245,255,0.72)',
    neonC: '#6cf2ff',
    neonM: '#ff66d9',
    neonO: '#ffcf6a',
    warn: '#ff4e52',
  };

  const PHASES = [
    { id: 'wash',  label: 'WASH',  rot: 0.75, water: 0.72, bubbles: 0.55, glow: 0.12 },
    { id: 'rinse', label: 'RINSE', rot: 0.95, water: 0.60, bubbles: 0.80, glow: 0.16 },
    { id: 'spin',  label: 'SPIN',  rot: 5.2,  water: 0.20, bubbles: 0.15, glow: 0.20 },
    { id: 'dry',   label: 'DRY',   rot: 1.25, water: 0.05, bubbles: 0.05, glow: 0.26 },
  ];

  const PHASE_DUR = 16; // seconds
  const CYCLE_DUR = PHASE_DUR * PHASES.length;

  let phaseIndex = -1;
  let beatPulse = 0;

  let machines = []; // {x,y,w,h,doorR,rot,tint}

  let neonFlicker = 0;
  let nextFlickerAt = 0;

  let surgeRand = mulberry32((seed ^ 0x5a17f3d1) >>> 0);
  let powerSurge = { a: 0, startAt: 0, dur: 0 };
  let nextSurgeAt = 0;

  let alert = { a: 0, machine: 0, msg: '' };
  let nextAlertAt = 0;

  // audio
  let ambience = null;
  let humOsc = null;
  let humGain = null;
  let noise = null;
  let drone = null;

  function safeBeep(opts){ if (audio.enabled) audio.beep(opts); }

  function regenLayout(){
    const baseY = h * 0.67;
    const mw = Math.min(w * 0.24, 240);
    const mh = Math.min(h * 0.28, 280);
    const gap = Math.max(16, w * 0.035);

    const totalW = mw * 3 + gap * 2;
    const x0 = w * 0.5 - totalW * 0.5;

    machines = [];
    for (let i = 0; i < 3; i++){
      const x = x0 + i * (mw + gap);
      const y = baseY;
      const tint = pick(rand, [pal.neonC, pal.neonM, pal.neonO]);
      machines.push({
        x, y,
        w: mw,
        h: mh,
        doorR: Math.min(mw, mh) * 0.34,
        rot: rand() * Math.PI * 2,
        tint,
      });
    }
  }

  function reset(){
    t = 0;
    phaseIndex = -1;
    beatPulse = 0;

    neonFlicker = 0;
    nextFlickerAt = 1.2 + rand() * 3.4;

    surgeRand = mulberry32((seed ^ 0x5a17f3d1) >>> 0);
    powerSurge = { a: 0, startAt: 0, dur: 0 };
    nextSurgeAt = 45 + surgeRand() * 75;

    alert = { a: 0, machine: 0, msg: '' };
    nextAlertAt = 12 + rand() * 18;

    for (const m of machines) m.rot = rand() * Math.PI * 2;
  }

  function init({ width, height, dpr: dprIn }){
    w = width;
    h = height;
    dpr = dprIn || 1;

    font = Math.max(14, Math.floor(Math.min(w, h) / 32));
    small = Math.max(11, Math.floor(font * 0.78));
    mono = Math.max(12, Math.floor(font * 0.86));

    regenLayout();
    reset();
  }

  function onResize(width, height, dprIn){
    init({ width, height, dpr: dprIn });
  }

  function onAudioOn(){
    if (!audio.enabled) return;

    const ctx = audio.ensure();

    // soft room hum + a little sudsy noise
    humOsc = ctx.createOscillator();
    humOsc.type = 'triangle';
    humOsc.frequency.value = 58 + rand() * 8;

    humGain = ctx.createGain();
    humGain.gain.value = 0.0;
    humOsc.connect(humGain);
    humGain.connect(audio.master);

    noise = audio.noiseSource({ type: 'pink', gain: 0.0 });

    humOsc.start();
    noise.start();

    drone = simpleDrone(audio, { root: 46 + rand() * 10, detune: 0.6, gain: 0.010 });

    ambience = {
      stop(){
        try { noise?.stop?.(); } catch {}
        try {
          humGain?.gain?.setTargetAtTime?.(0.0001, ctx.currentTime, 0.06);
          humOsc?.stop?.(ctx.currentTime + 0.2);
        } catch {}
        try { drone?.stop?.(); } catch {}
      }
    };

    audio.setCurrent(ambience);
  }

  function onAudioOff(){
    try { ambience?.stop?.(); } catch {}
    ambience = null;
    humOsc = null;
    humGain = null;
    noise = null;
    drone = null;
  }

  function destroy(){
    onAudioOff();
  }

  function currentPhase(){
    const p = ((t / PHASE_DUR) | 0) % PHASES.length;
    const within = t - Math.floor(t / PHASE_DUR) * PHASE_DUR;
    return { idx: p, within, frac: within / PHASE_DUR };
  }

  function update(dt){
    t += dt;
    beatPulse = Math.max(0, beatPulse - dt * 1.8);

    const ph = currentPhase();
    if (ph.idx !== phaseIndex){
      phaseIndex = ph.idx;
      beatPulse = 1;

      if (phaseIndex === 0) safeBeep({ freq: 220, dur: 0.06, gain: 0.014, type: 'sine' });
      if (phaseIndex === 1) safeBeep({ freq: 330, dur: 0.05, gain: 0.012, type: 'triangle' });
      if (phaseIndex === 2) safeBeep({ freq: 520, dur: 0.04, gain: 0.010, type: 'square' });
      if (phaseIndex === 3) safeBeep({ freq: 260, dur: 0.06, gain: 0.012, type: 'sine' });
    }

    const P = PHASES[phaseIndex];

    // machine rotation
    const wob = 0.15 * Math.sin(t * 0.9);
    for (let i = 0; i < machines.length; i++){
      const m = machines[i];
      const local = (0.9 + 0.1 * Math.sin(t * (0.7 + i * 0.2))) * (1 + wob * 0.25);
      m.rot = (m.rot + dt * P.rot * local) % (Math.PI * 2);
    }

    // rare deterministic power surge (special moment)
    if (t >= nextSurgeAt){
      while (t >= nextSurgeAt){
        const startAt = nextSurgeAt;
        const dur = 2.0 + surgeRand() * 3.0;
        powerSurge = { a: 0, startAt, dur };
        nextSurgeAt += 45 + surgeRand() * 75;
      }
      safeBeep({ freq: 110, dur: 0.08, gain: 0.016, type: 'sawtooth' });
      safeBeep({ freq: 55, dur: 0.14, gain: 0.014, type: 'square' });
    }

    if (powerSurge.dur > 0){
      const u = (t - powerSurge.startAt) / powerSurge.dur;
      if (u >= 1){
        powerSurge = { a: 0, startAt: 0, dur: 0 };
      } else {
        const tri = 1 - Math.abs(u * 2 - 1);
        powerSurge.a = ease(tri);
      }
    } else {
      powerSurge.a = 0;
    }

    // neon flicker moments
    neonFlicker = Math.max(0, neonFlicker - dt * 5.0);
    if (t >= nextFlickerAt){
      neonFlicker = 1;
      nextFlickerAt = t + 2.2 + rand() * 6.5;
      if (audio.enabled && rand() < 0.25) safeBeep({ freq: 780 + rand() * 120, dur: 0.03, gain: 0.006, type: 'square' });
    }

    // lost sock alert card
    alert.a = Math.max(0, alert.a - dt * 0.42);
    if (t >= nextAlertAt){
      const m = (rand() * machines.length) | 0;
      const sock = pick(rand, ['LEFT SOCK', 'RIGHT SOCK', 'MISMATCHED SOCK', 'TINY SOCK']);
      alert = { a: 1, machine: m + 1, msg: sock };
      safeBeep({ freq: 880, dur: 0.06, gain: 0.014, type: 'square' });
      safeBeep({ freq: 440, dur: 0.08, gain: 0.010, type: 'triangle' });
      nextAlertAt = t + 22 + rand() * 26;
    }

    // audio intensity follows phase
    if (audio.enabled && humGain && noise){
      const wantHum = (phaseIndex === 2 ? 0.020 : 0.012) + beatPulse * 0.006;
      const wantNoise = (phaseIndex === 0 ? 0.004 : phaseIndex === 1 ? 0.005 : phaseIndex === 2 ? 0.003 : 0.002);
      humGain.gain.value = lerp(humGain.gain.value, wantHum, 1 - Math.exp(-dt * 3.2));
      noise.gain.gain.value = lerp(noise.gain.gain.value, wantNoise, 1 - Math.exp(-dt * 2.8));

      // subtle "spin-up" pitch bend
      try {
        const base = 58 + (seed % 7);
        const bend = phaseIndex === 2 ? 18 * ease(ph.frac) : 0;
        humOsc.frequency.value = base + bend;
      } catch {}
    }
  }

  function drawBackground(ctx, P){
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, pal.bg0);
    g.addColorStop(0.55, pal.bg1);
    g.addColorStop(1, '#030407');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    const drift = Math.sin(t * 0.08) * w * 0.01;

    // window bands (midground)
    ctx.save();
    ctx.translate(drift, 0);
    ctx.fillStyle = 'rgba(12,18,26,0.55)';
    ctx.fillRect(w * 0.06, h * 0.10, w * 0.88, h * 0.30);

    // rain streaks
    ctx.globalCompositeOperation = 'screen';
    ctx.strokeStyle = 'rgba(120,190,255,0.08)';
    ctx.lineWidth = Math.max(1, Math.floor(dpr));
    const streaks = 48;
    for (let i = 0; i < streaks; i++){
      const x = w * 0.06 + (i / streaks) * w * 0.88;
      const y0 = h * 0.10 + ((t * (40 + i * 0.7)) % (h * 0.30));
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x - w * 0.01, y0 + h * 0.06);
      ctx.stroke();
    }
    ctx.restore();
    ctx.globalCompositeOperation = 'source-over';

    // neon sign
    const surge = powerSurge.a;
    const flick = (neonFlicker > 0 || surge > 0)
      ? ((surge > 0 ? 0.12 : 0.35) + (surge > 0 ? 0.88 : 0.65) * (0.5 + 0.5 * Math.sin(t * (surge > 0 ? 86 : 42))))
      : 1;
    const neonA = (0.85 + 0.15 * flick) * (0.72 + P.glow) * (1 + 0.35 * surge);

    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.floor(font * 1.15)}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`;

    const nx = w * 0.10;
    const ny = h * 0.20;

    ctx.fillStyle = `rgba(0,0,0,0.28)`;
    roundedRect(ctx, nx - 14, ny - 22, w * 0.44, 54, 16);
    ctx.fill();

    ctx.shadowBlur = 18 + beatPulse * 14;
    ctx.shadowColor = `rgba(108,242,255,${0.55 * neonA})`;
    ctx.fillStyle = `rgba(108,242,255,${0.85 * neonA})`;
    ctx.fillText('24H', nx, ny);

    ctx.shadowColor = `rgba(255,102,217,${0.50 * neonA})`;
    ctx.fillStyle = `rgba(255,102,217,${0.86 * neonA})`;
    ctx.fillText('NEON LAUNDROMAT', nx + w * 0.09, ny);

    ctx.shadowBlur = 0;
    ctx.font = `${Math.floor(small * 0.95)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = `rgba(255,207,106,${0.75})`;
    ctx.fillText('WASH  •  DRY  •  FOLD', nx, ny + 28);

    ctx.restore();
  }

  function drawFloor(ctx, P){
    const yH = h * 0.56;

    const g = ctx.createLinearGradient(0, yH, 0, h);
    g.addColorStop(0, pal.floor0);
    g.addColorStop(1, pal.floor1);
    ctx.fillStyle = g;
    ctx.fillRect(0, yH, w, h - yH);

    // tiles
    const tile = Math.max(28, Math.floor(Math.min(w, h) * 0.065));
    const dx = (t * 8) % tile;
    const dy = (t * 6) % tile;

    ctx.strokeStyle = pal.grout;
    ctx.lineWidth = Math.max(1, Math.floor(dpr));

    for (let x = -tile; x <= w + tile; x += tile){
      ctx.beginPath();
      ctx.moveTo(x + dx, yH);
      ctx.lineTo(x + dx, h);
      ctx.stroke();
    }

    for (let y = yH - tile; y <= h + tile; y += tile){
      ctx.beginPath();
      ctx.moveTo(0, y + dy);
      ctx.lineTo(w, y + dy);
      ctx.stroke();
    }

    // glossy reflection band
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    const r = ctx.createLinearGradient(0, yH, 0, h);
    r.addColorStop(0, `rgba(108,242,255,${0.08 + P.glow * 0.18})`);
    r.addColorStop(1, 'rgba(108,242,255,0)');
    ctx.fillStyle = r;
    ctx.fillRect(0, yH, w, h - yH);
    ctx.restore();

    // vignette
    const v = ctx.createRadialGradient(w * 0.5, h * 0.72, Math.min(w, h) * 0.1, w * 0.5, h * 0.72, Math.min(w, h) * 0.7);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.60)');
    ctx.fillStyle = v;
    ctx.fillRect(0, 0, w, h);
  }

  function drawMachine(ctx, m, P, idx){
    const x = m.x;
    const y = m.y;

    const bodyW = m.w;
    const bodyH = m.h;
    const r = Math.max(16, Math.floor(Math.min(bodyW, bodyH) * 0.08));

    // shadow
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.40)';
    ctx.beginPath();
    ctx.ellipse(x + bodyW * 0.52, y + bodyH * 0.92, bodyW * 0.48, bodyH * 0.11, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // body
    const bg = ctx.createLinearGradient(x, y, x + bodyW, y + bodyH);
    bg.addColorStop(0, pal.machineHi);
    bg.addColorStop(0.5, pal.machine);
    bg.addColorStop(1, '#0b0f16');

    ctx.fillStyle = bg;
    roundedRect(ctx, x, y, bodyW, bodyH, r);
    ctx.fill();

    // trim
    ctx.strokeStyle = pal.metal;
    ctx.lineWidth = Math.max(1, Math.floor(dpr));
    roundedRect(ctx, x + 1, y + 1, bodyW - 2, bodyH - 2, r);
    ctx.stroke();

    // control panel
    const px = x + bodyW * 0.08;
    const py = y + bodyH * 0.10;
    const pw = bodyW * 0.84;
    const ph = bodyH * 0.17;
    ctx.fillStyle = 'rgba(0,0,0,0.30)';
    roundedRect(ctx, px, py, pw, ph, r * 0.7);
    ctx.fill();

    const light = 0.45 + 0.55 * (0.5 + 0.5 * Math.sin(t * 1.2 + idx));
    ctx.save();
    ctx.globalAlpha = (0.10 + P.glow * 0.22) * (0.65 + 0.35 * light);
    ctx.fillStyle = m.tint;
    ctx.fillRect(px + pw * 0.02, py + ph * 0.78, pw * (0.20 + 0.18 * P.glow), Math.max(2, Math.floor(dpr)));
    ctx.restore();

    // door
    const cx = x + bodyW * 0.5;
    const cy = y + bodyH * 0.62;
    const R = m.doorR;

    // bezel
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.18, 0, Math.PI * 2);
    ctx.fill();

    ctx.strokeStyle = 'rgba(220,240,255,0.20)';
    ctx.lineWidth = Math.max(2, Math.floor(dpr * 1.4));
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.18, 0, Math.PI * 2);
    ctx.stroke();

    // clip for drum
    ctx.save();
    ctx.beginPath();
    ctx.arc(cx, cy, R, 0, Math.PI * 2);
    ctx.clip();

    // drum interior
    const dg = ctx.createRadialGradient(cx - R * 0.3, cy - R * 0.3, R * 0.2, cx, cy, R * 1.2);
    dg.addColorStop(0, 'rgba(10,12,16,1)');
    dg.addColorStop(1, 'rgba(0,0,0,1)');
    ctx.fillStyle = dg;
    ctx.fillRect(cx - R, cy - R, R * 2, R * 2);

    // tint glow rim (per-machine identity)
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.globalAlpha = (0.06 + P.glow * 0.14) * (0.65 + 0.35 * light);
    const tg = ctx.createRadialGradient(cx, cy, R * 0.25, cx, cy, R * 1.05);
    tg.addColorStop(0, 'rgba(0,0,0,0)');
    tg.addColorStop(0.55, 'rgba(0,0,0,0)');
    tg.addColorStop(1, m.tint);
    ctx.fillStyle = tg;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.02, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // water level + slosh
    const slosh = Math.sin(t * 2.0 + idx) * 0.04;
    const level = P.water;
    const waterY = cy + R * (0.65 - level) + slosh * R;

    if (level > 0.08){
      const wg = ctx.createLinearGradient(0, waterY - R, 0, cy + R);
      wg.addColorStop(0, `rgba(108,242,255,${0.06 + P.glow * 0.10})`);
      wg.addColorStop(0.55, `rgba(108,242,255,${0.13 + P.glow * 0.18})`);
      wg.addColorStop(1, 'rgba(108,242,255,0)');
      ctx.fillStyle = wg;
      ctx.fillRect(cx - R, waterY, R * 2, cy + R - waterY);

      // bubbles
      const bubN = 18;
      for (let i = 0; i < bubN; i++){
        const a = (i / bubN) * Math.PI * 2 + (t * 0.6 + idx) * 0.4;
        const rr = (0.1 + (i % 6) * 0.12) * R;
        const bx = cx + Math.cos(a) * rr;
        const by = lerp(waterY + 6, cy + R * 0.85, (i / bubN)) + Math.sin(t * 1.2 + i) * 1.5;
        const br = (1.5 + (i % 4)) * (0.8 + P.bubbles);
        ctx.fillStyle = `rgba(245,250,255,${0.08 + 0.12 * P.bubbles})`;
        ctx.beginPath();
        ctx.arc(bx, by, br, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // cloth swirl
    const swirlA = (P.id === 'spin') ? 0.18 : 0.35;
    ctx.save();
    ctx.translate(cx, cy);
    ctx.rotate(m.rot);

    const stripes = 8;
    for (let i = 0; i < stripes; i++){
      const ang0 = (i / stripes) * Math.PI * 2;
      const ang1 = ang0 + Math.PI / stripes;
      ctx.strokeStyle = `rgba(255,102,217,${swirlA * (0.6 + 0.4 * light)})`;
      ctx.lineWidth = Math.max(2, Math.floor(dpr * 1.2));
      ctx.beginPath();
      ctx.arc(0, 0, R * (0.18 + i * 0.08), ang0, ang1);
      ctx.stroke();
    }

    // spin blur
    if (P.id === 'spin'){
      const blur = 0.55 + 0.45 * ease((Math.sin(t * 3.2) * 0.5 + 0.5));
      ctx.globalCompositeOperation = 'screen';
      for (let i = 0; i < 22; i++){
        const a = (i / 22) * Math.PI * 2 + t * 2.2;
        ctx.strokeStyle = `rgba(108,242,255,${0.03 + 0.06 * blur})`;
        ctx.lineWidth = Math.max(1, Math.floor(dpr));
        ctx.beginPath();
        ctx.moveTo(Math.cos(a) * R * 0.15, Math.sin(a) * R * 0.15);
        ctx.lineTo(Math.cos(a) * R * 0.95, Math.sin(a) * R * 0.95);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    }

    // dry heat glow
    if (P.id === 'dry'){
      const heat = 0.5 + 0.5 * Math.sin(t * 1.1 + idx);
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = `rgba(255,207,106,${0.06 + 0.12 * heat})`;
      ctx.beginPath();
      ctx.arc(0, 0, R * 0.95, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalCompositeOperation = 'source-over';
    }

    ctx.restore();

    ctx.restore(); // clip

    // glass highlight
    const gg = ctx.createRadialGradient(cx - R * 0.35, cy - R * 0.35, 1, cx, cy, R * 1.2);
    gg.addColorStop(0, 'rgba(255,255,255,0.12)');
    gg.addColorStop(0.35, pal.glass);
    gg.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gg;
    ctx.beginPath();
    ctx.arc(cx, cy, R * 1.05, 0, Math.PI * 2);
    ctx.fill();

    // tiny machine label
    ctx.save();
    ctx.font = `${Math.floor(small * 0.9)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.textBaseline = 'middle';
    ctx.fillStyle = 'rgba(235,245,255,0.55)';
    ctx.fillText(`M${idx + 1}`, x + bodyW * 0.10, y + bodyH * 0.86);

    // phase indicator light
    const lx = x + bodyW * 0.86;
    const ly = y + bodyH * 0.14;
    const lr = Math.max(3, Math.floor(Math.min(bodyW, bodyH) * 0.02));
    ctx.fillStyle = `rgba(0,0,0,0.45)`;
    ctx.beginPath();
    ctx.arc(lx, ly, lr * 1.6, 0, Math.PI * 2);
    ctx.fill();

    const a = 0.35 + 0.55 * P.glow + 0.25 * beatPulse;
    ctx.save();
    ctx.globalAlpha = a;
    ctx.fillStyle = m.tint;
    ctx.shadowColor = m.tint;
    ctx.shadowBlur = 10 + beatPulse * 10;
    ctx.beginPath();
    ctx.arc(lx, ly, lr, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
    ctx.restore();

    // subtle neon edge on machine
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.strokeStyle = `rgba(255,102,217,${0.05 + 0.12 * P.glow})`;
    ctx.lineWidth = Math.max(2, Math.floor(dpr * 1.3));
    roundedRect(ctx, x + 4, y + 4, bodyW - 8, bodyH - 8, r * 0.95);
    ctx.stroke();
    ctx.restore();
  }

  function drawOverlay(ctx, P){
    const x = w * 0.055;
    const y = h * 0.16;

    const ph = currentPhase();
    const left = Math.max(0, Math.ceil(PHASE_DUR - ph.within));

    ctx.save();
    ctx.textBaseline = 'middle';

    ctx.font = `${Math.floor(mono * 0.95)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = pal.neonC;
    ctx.shadowColor = 'rgba(108,242,255,0.6)';
    ctx.shadowBlur = 14;
    ctx.fillText('CH 42', x, y);

    ctx.shadowBlur = 0;
    ctx.font = `${font}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`;
    ctx.fillStyle = pal.text;
    ctx.fillText(`NEON LAUNDROMAT — ${P.label}`, x, y + font * 1.2);

    ctx.font = `${Math.floor(small * 0.95)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = pal.subtext;

    const cyc = ((t / CYCLE_DUR) | 0) + 1;
    ctx.fillText(`CYCLE ${String(cyc).padStart(2, '0')}  •  T-${String(left).padStart(2, '0')}s`, x, y + font * 1.2 + small * 1.4);

    ctx.restore();

    // POWER SURGE banner (special moment)
    if (powerSurge.a > 0){
      const a = powerSurge.a;
      const bw = Math.min(w * 0.30, 340);
      const bh = Math.min(h * 0.06, 56);
      const bx = w * 0.5 - bw * 0.5;
      const by = h * 0.055;
      const blink = 0.6 + 0.4 * (0.5 + 0.5 * Math.sin(t * 18));

      ctx.save();
      ctx.globalAlpha = 0.92 * a;
      ctx.fillStyle = `rgba(10,12,14,${0.78 * blink})`;
      roundedRect(ctx, bx, by, bw, bh, 12);
      ctx.fill();

      ctx.globalAlpha = 1;
      ctx.strokeStyle = `rgba(255,207,106,${0.85 * blink})`;
      ctx.lineWidth = Math.max(2, Math.floor(dpr * 1.2));
      roundedRect(ctx, bx, by, bw, bh, 12);
      ctx.stroke();

      ctx.font = `${Math.floor(small * 0.95)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.textBaseline = 'middle';
      ctx.fillStyle = `rgba(255,207,106,${0.95 * blink})`;
      ctx.fillText('POWER SURGE', bx + 16, by + bh * 0.5);

      ctx.restore();
    }

    // alert card
    if (alert.a > 0){
      const a = ease(alert.a);
      const cw = Math.min(w * 0.44, 460);
      const ch = Math.min(h * 0.18, 150);
      const cx0 = w - cw - w * 0.05;
      const cy0 = h * 0.12;

      const pop = 1 - (1 - a) * (1 - a);
      const yoff = (1 - pop) * 18;
      const blink = 0.65 + 0.35 * (0.5 + 0.5 * Math.sin(t * 14));

      ctx.save();
      ctx.globalAlpha = 0.92 * a;
      ctx.fillStyle = `rgba(10,12,14,${0.85 * blink})`;
      roundedRect(ctx, cx0, cy0 + yoff, cw, ch, 14);
      ctx.fill();

      ctx.globalAlpha = 1;
      ctx.strokeStyle = `rgba(255,78,82,${0.72 * blink})`;
      ctx.lineWidth = Math.max(2, Math.floor(dpr * 1.5));
      roundedRect(ctx, cx0, cy0 + yoff, cw, ch, 14);
      ctx.stroke();

      ctx.font = `${Math.floor(small * 0.95)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.fillStyle = `rgba(255,78,82,${0.95 * blink})`;
      ctx.textBaseline = 'middle';
      ctx.fillText('LOST SOCK ALERT', cx0 + 18, cy0 + yoff + 22);

      ctx.font = `${font}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`;
      ctx.fillStyle = pal.text;
      ctx.fillText(`MACHINE ${alert.machine}`, cx0 + 18, cy0 + yoff + 56);

      ctx.font = `${Math.floor(font * 0.95)}px ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial`;
      ctx.fillStyle = pal.subtext;
      ctx.fillText(`${alert.msg}  •  CHECK LINT TRAP`, cx0 + 18, cy0 + yoff + 86);

      ctx.font = `${Math.floor(small * 0.95)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      ctx.fillStyle = `rgba(255,207,106,0.82)`;
      ctx.fillText('PLEASE REMAIN CALM', cx0 + 18, cy0 + yoff + 116);

      ctx.restore();
    }
  }

  function render(ctx){
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const P = PHASES[phaseIndex < 0 ? 0 : phaseIndex];

    drawBackground(ctx, P);
    drawFloor(ctx, P);

    // machines (foreground)
    for (let i = 0; i < machines.length; i++){
      drawMachine(ctx, machines[i], P, i);
    }

    // dim room briefly during POWER SURGE, but keep OSD crisp by applying before overlay
    if (powerSurge.a > 0){
      const a = 0.18 + 0.45 * powerSurge.a;
      ctx.fillStyle = `rgba(0,0,0,${a})`;
      ctx.fillRect(0, 0, w, h);
    }

    drawOverlay(ctx, P);
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
