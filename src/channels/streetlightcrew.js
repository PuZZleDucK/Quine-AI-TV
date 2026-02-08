import { mulberry32, clamp } from '../util/prng.js';
import { simpleDrone } from '../util/audio.js';

export function createChannel({ seed, audio }) {
  const rand = mulberry32(seed);

  let w = 0;
  let h = 0;
  let t = 0;

  const cycleDur = 90;

  let bgC = null;

  let stars = [];
  let clouds = [];
  let buildingsFar = [];
  let buildingsNear = [];
  let cones = [];

  let segIndex = -1;
  let spark = 0;

  let drone = null;
  let audioHandle = null;

  const palettes = [
    {
      skyTop: '#020518',
      skyMid: '#06102b',
      skyBot: '#03070f',
      haze: 'rgba(120, 170, 255, 0.08)',
      far: 'rgba(10, 16, 32, 0.92)',
      near: 'rgba(6, 10, 22, 0.97)',
      road: '#04070e',
      lane: 'rgba(180, 210, 255, 0.10)',
      sodium: 'rgba(255, 196, 110, ALPHA)',
      cone: '#ff7a2a',
      van: '#0b1626',
      accent: 'rgba(90, 230, 255, ALPHA)',
    },
    {
      skyTop: '#060014',
      skyMid: '#120523',
      skyBot: '#04040c',
      haze: 'rgba(255, 120, 190, 0.06)',
      far: 'rgba(18, 10, 26, 0.92)',
      near: 'rgba(10, 6, 18, 0.98)',
      road: '#06040a',
      lane: 'rgba(255, 180, 220, 0.10)',
      sodium: 'rgba(255, 220, 150, ALPHA)',
      cone: '#ff4bd1',
      van: '#140a24',
      accent: 'rgba(120, 255, 220, ALPHA)',
    },
  ];

  let pal = palettes[0];

  function pick(arr) {
    return arr[(rand() * arr.length) | 0];
  }

  function lerp(a, b, u) {
    return a + (b - a) * u;
  }

  function easeInOut(u) {
    u = clamp(u, 0, 1);
    return u < 0.5 ? 2 * u * u : 1 - Math.pow(-2 * u + 2, 2) / 2;
  }

  function roundRectPath(ctx, x, y, ww, hh, r) {
    const rr = Math.max(0, Math.min(r, ww * 0.5, hh * 0.5));
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.arcTo(x + ww, y, x + ww, y + hh, rr);
    ctx.arcTo(x + ww, y + hh, x, y + hh, rr);
    ctx.arcTo(x, y + hh, x, y, rr);
    ctx.arcTo(x, y, x + ww, y, rr);
    ctx.closePath();
  }

  function hash01(n) {
    // deterministic float in [0,1)
    const x = Math.sin(n * 127.1 + seed * 0.017) * 43758.5453;
    return x - Math.floor(x);
  }

  function buildBackground() {
    bgC = document.createElement('canvas');
    bgC.width = w;
    bgC.height = h;
    const b = bgC.getContext('2d');

    const horizon = h * 0.62;

    const g = b.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, pal.skyTop);
    g.addColorStop(0.55, pal.skyMid);
    g.addColorStop(1, pal.skyBot);
    b.fillStyle = g;
    b.fillRect(0, 0, w, h);

    // Haze band near horizon.
    b.save();
    b.fillStyle = pal.haze;
    b.fillRect(0, horizon - h * 0.18, w, h * 0.28);
    b.restore();

    // Stars.
    b.save();
    b.globalCompositeOperation = 'screen';
    for (const s of stars) {
      const a = 0.15 + 0.55 * s.a;
      b.fillStyle = `rgba(210, 235, 255, ${a})`;
      b.fillRect(s.x, s.y, s.r, s.r);
    }
    b.restore();

    // Distant buildings.
    function drawSkyline(layer, color, y0) {
      b.save();
      b.fillStyle = color;
      for (const bl of layer) {
        b.fillRect(bl.x, y0 - bl.h, bl.w, bl.h);
      }
      b.restore();

      // Sparse windows (cheap + deterministic).
      b.save();
      b.globalCompositeOperation = 'screen';
      b.fillStyle = 'rgba(255, 210, 130, 0.05)';
      for (let i = 0; i < 520; i++) {
        const x = (hash01(i * 1.17) * w) | 0;
        const y = (hash01(i * 2.21) * (horizon - h * 0.18) + h * 0.1) | 0;
        if (y > y0) continue;
        if ((hash01(i * 6.11) * 1) > 0.72) continue;
        b.fillRect(x, y, 2, 2);
      }
      b.restore();
    }

    drawSkyline(buildingsFar, pal.far, horizon);
    drawSkyline(buildingsNear, pal.near, horizon + h * 0.015);

    // Subtle vignette.
    b.save();
    const v = b.createRadialGradient(w * 0.5, h * 0.45, Math.min(w, h) * 0.15, w * 0.5, h * 0.5, Math.min(w, h) * 0.95);
    v.addColorStop(0, 'rgba(0,0,0,0)');
    v.addColorStop(1, 'rgba(0,0,0,0.45)');
    b.fillStyle = v;
    b.fillRect(0, 0, w, h);
    b.restore();
  }

  function sceneInit(width, height) {
    w = width;
    h = height;
    t = 0;
    segIndex = -1;
    spark = 0;

    pal = pick(palettes);

    // deterministic elements
    stars = Array.from({ length: 180 }, () => ({
      x: rand() * w,
      y: rand() * h * 0.45,
      r: 0.8 + rand() * 1.5,
      a: rand(),
      tw: rand() * 10,
    }));

    clouds = Array.from({ length: 7 }, () => ({
      x: rand() * w,
      y: h * (0.09 + rand() * 0.28),
      z: 0.4 + rand() * 0.9,
      s: 0.7 + rand() * 1.2,
      a: 0.04 + rand() * 0.07,
    }));

    buildingsFar = [];
    buildingsNear = [];

    let x = -w * 0.1;
    while (x < w * 1.1) {
      const bw = Math.max(14, Math.floor(w * (0.012 + rand() * 0.03)));
      buildingsFar.push({ x, w: bw, h: Math.floor(h * (0.05 + rand() * 0.11)) });
      x += bw + Math.floor(3 + rand() * 7);
    }

    x = -w * 0.12;
    while (x < w * 1.12) {
      const bw = Math.max(18, Math.floor(w * (0.015 + rand() * 0.045)));
      buildingsNear.push({ x, w: bw, h: Math.floor(h * (0.07 + rand() * 0.16)) });
      x += bw + Math.floor(4 + rand() * 9);
    }

    // Cones in a gentle arc.
    const coneCount = 9;
    cones = Array.from({ length: coneCount }, (_, i) => ({
      u: (i + 1) / (coneCount + 1),
      wob: rand() * 10,
    }));

    buildBackground();
  }

  function onResize(width, height) {
    sceneInit(width, height);
  }

  function onAudioOn() {
    if (!audio.enabled) return;

    // Quiet sodium-hum bed.
    drone = simpleDrone(audio, {
      root: 58,
      detune: 1.1,
      gain: 0.028,
    });

    audioHandle = {
      stop() {
        try { drone?.stop?.(); } catch {}
      },
    };
    audio.setCurrent(audioHandle);
  }

  function onAudioOff() {
    try { audioHandle?.stop?.(); } catch {}
    drone = null;
    audioHandle = null;
  }

  function destroy() {
    onAudioOff();
  }

  function segmentInfo(tt) {
    // 0: SETUP, 1: LIFT, 2: SWAP, 3: TEST, 4: STEADY, 5: RESET
    const segs = [
      ['SETUP', 10],
      ['LIFT', 20],
      ['SWAP', 20],
      ['TEST', 15],
      ['STEADY', 20],
      ['RESET', 5],
    ];

    let acc = 0;
    for (let i = 0; i < segs.length; i++) {
      const dur = segs[i][1];
      if (tt >= acc && tt < acc + dur) {
        return { i, name: segs[i][0], t: tt - acc, dur };
      }
      acc += dur;
    }
    return { i: 0, name: 'SETUP', t: tt, dur: segs[0][1] };
  }

  function lampBrightness(tt, seg) {
    if (seg.name === 'SWAP') return 0.05; // power mostly off

    if (seg.name === 'TEST') {
      const slot = Math.floor(seg.t / 0.08);
      const r = hash01(slot * 4.13 + 77.7);
      const p = 0.25 + 0.75 * Math.pow(r, 0.35);
      // occasional deep dips
      const dip = hash01(slot * 2.71 + 19.9) > 0.92 ? 0.15 : 1;
      return clamp(p * dip, 0, 1);
    }

    if (seg.name === 'RESET') {
      return clamp(1 - seg.t / seg.dur, 0, 1);
    }

    // SETUP/LIFT/STEADY: stable (with a subtle breathe)
    const breathe = 0.04 * Math.sin((tt + 1.3) * 0.9);
    return clamp(0.92 + breathe, 0, 1);
  }

  function update(dt) {
    t += dt;

    spark = Math.max(0, spark - dt * 1.9);

    const tt = t % cycleDur;
    const seg = segmentInfo(tt);

    if (seg.i !== segIndex) {
      segIndex = seg.i;

      if (seg.name === 'SWAP') {
        spark = 1;
        if (audio.enabled) {
          audio.beep({ freq: 280, dur: 0.06, gain: 0.02, type: 'square' });
          audio.beep({ freq: 520, dur: 0.04, gain: 0.014, type: 'triangle' });
        }
      }

      if (seg.name === 'TEST' && audio.enabled) {
        audio.beep({ freq: 660, dur: 0.05, gain: 0.016, type: 'square' });
      }

      if (seg.name === 'STEADY' && audio.enabled) {
        audio.beep({ freq: 880, dur: 0.06, gain: 0.018, type: 'triangle' });
      }
    }
  }

  function drawClouds(ctx) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (const c of clouds) {
      const sp = (8 + 14 * c.z) * 0.6;
      const x = (c.x + t * sp) % (w + 240) - 120;
      const y = c.y + Math.sin(t * 0.07 + c.z * 2.1) * h * 0.004;
      const ww = w * 0.22 * c.s;
      const hh = h * 0.06 * c.s;
      const g = ctx.createRadialGradient(x, y, 1, x, y, ww);
      g.addColorStop(0, `rgba(120, 190, 255, ${c.a})`);
      g.addColorStop(1, 'rgba(120, 190, 255, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, y, ww, hh, 0, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function drawRoad(ctx, horizon) {
    const roadTopY = horizon + h * 0.13;
    const roadBotY = h * 1.02;

    ctx.save();

    // road trapezoid
    ctx.fillStyle = pal.road;
    ctx.beginPath();
    ctx.moveTo(w * 0.26, roadTopY);
    ctx.lineTo(w * 0.74, roadTopY);
    ctx.lineTo(w * 0.98, roadBotY);
    ctx.lineTo(w * 0.02, roadBotY);
    ctx.closePath();
    ctx.fill();

    // lane lines
    ctx.strokeStyle = pal.lane;
    ctx.lineWidth = Math.max(1, h / 600);

    for (let i = 0; i < 22; i++) {
      const u0 = i / 22;
      const u1 = (i + 0.42) / 22;

      const y0 = lerp(roadTopY, roadBotY, u0 * u0);
      const y1 = lerp(roadTopY, roadBotY, u1 * u1);
      const x0 = lerp(w * 0.5, w * 0.5, 0);
      const xL0 = lerp(w * 0.5, w * 0.12, u0);
      const xL1 = lerp(w * 0.5, w * 0.12, u1);

      // center dashed
      if (i % 2 === 0) {
        ctx.beginPath();
        ctx.moveTo(x0 - 1, y0);
        ctx.lineTo(x0 - 1, y1);
        ctx.stroke();
      }

      // left curb hint
      if (i % 3 === 0) {
        ctx.beginPath();
        ctx.moveTo(xL0, y0);
        ctx.lineTo(xL1, y1);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  function drawStreetlight(ctx, horizon, seg, lampA) {
    const baseX = w * 0.68;
    const baseY = horizon + h * 0.33;

    const poleTopY = horizon - h * 0.12;
    const poleW = Math.max(2, h / 220);

    // Lift basket position.
    const liftU = seg.name === 'LIFT'
      ? easeInOut(seg.t / seg.dur)
      : seg.name === 'STEADY'
        ? easeInOut(clamp((seg.t - 5) / 10, 0, 1))
        : seg.name === 'SWAP' || seg.name === 'TEST'
          ? 1
          : seg.name === 'RESET'
            ? 1 - easeInOut(seg.t / seg.dur)
            : 0;

    const basketY = lerp(baseY - h * 0.02, poleTopY + h * 0.07, liftU);

    // Pole
    ctx.save();
    ctx.strokeStyle = 'rgba(220,235,255,0.22)';
    ctx.lineWidth = poleW;
    ctx.beginPath();
    ctx.moveTo(baseX, baseY);
    ctx.lineTo(baseX, poleTopY);
    ctx.stroke();

    // Arm
    ctx.beginPath();
    ctx.moveTo(baseX, poleTopY);
    ctx.lineTo(baseX - w * 0.09, poleTopY + h * 0.03);
    ctx.stroke();

    // Lamp head
    const lampX = baseX - w * 0.095;
    const lampY = poleTopY + h * 0.03;

    ctx.fillStyle = 'rgba(240,245,255,0.22)';
    roundRectPath(ctx, lampX - w * 0.018, lampY - h * 0.008, w * 0.038, h * 0.018, 4);
    ctx.fill();

    // Glow
    if (lampA > 0.01) {
      const halo = ctx.createRadialGradient(lampX, lampY, 1, lampX, lampY, Math.min(w, h) * 0.09);
      halo.addColorStop(0, pal.sodium.replace('ALPHA', String((0.65 * lampA).toFixed(3))));
      halo.addColorStop(1, 'rgba(255,196,110,0)');
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = halo;
      ctx.beginPath();
      ctx.arc(lampX, lampY, Math.min(w, h) * 0.09, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    // Basket + cable
    const basketW = w * 0.08;
    const basketH = h * 0.05;

    ctx.save();
    ctx.fillStyle = pal.van;
    ctx.globalAlpha = 0.92;
    ctx.fillRect(lampX - basketW * 0.55, basketY - basketH * 0.5, basketW, basketH);

    ctx.strokeStyle = 'rgba(235,255,245,0.22)';
    ctx.lineWidth = Math.max(1, poleW * 0.8);
    ctx.strokeRect(lampX - basketW * 0.55, basketY - basketH * 0.5, basketW, basketH);

    // tiny worker hint
    ctx.fillStyle = 'rgba(255,210,120,0.32)';
    ctx.beginPath();
    ctx.arc(lampX - basketW * 0.18, basketY - basketH * 0.05, Math.max(2, h / 180), 0, Math.PI * 2);
    ctx.fill();

    // lift column
    ctx.strokeStyle = 'rgba(180,210,255,0.12)';
    ctx.lineWidth = Math.max(2, poleW);
    ctx.beginPath();
    ctx.moveTo(lampX - basketW * 0.05, baseY);
    ctx.lineTo(lampX - basketW * 0.05, basketY + basketH * 0.5);
    ctx.stroke();

    // cable line
    ctx.strokeStyle = 'rgba(255,220,160,0.10)';
    ctx.lineWidth = Math.max(1, poleW * 0.7);
    ctx.beginPath();
    ctx.moveTo(lampX, lampY);
    ctx.lineTo(lampX - basketW * 0.15, basketY - basketH * 0.35);
    ctx.stroke();

    ctx.restore();

    // Sparks
    if (spark > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const a = clamp(spark, 0, 1);
      for (let i = 0; i < 14; i++) {
        const ang = (i / 14) * Math.PI * 2 + (t * 1.2);
        const rr = (0.012 + 0.06 * a) * Math.min(w, h) * (0.5 + hash01(i * 3.1 + 11) * 0.7);
        const sx = lampX + Math.cos(ang) * rr;
        const sy = lampY + Math.sin(ang) * rr;
        ctx.fillStyle = `rgba(255, 210, 120, ${0.12 + 0.35 * a})`;
        ctx.fillRect(sx, sy, 2, 2);
      }
      ctx.restore();
    }

    ctx.restore();

    // Light cone (after pole so it feels attached)
    if (lampA > 0.01) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const coneW = w * 0.62;
      const coneH = h * 0.56;
      const g2 = ctx.createRadialGradient(lampX, lampY, 1, lampX, lampY + coneH * 0.55, coneW);
      g2.addColorStop(0, pal.sodium.replace('ALPHA', String((0.26 * lampA).toFixed(3))));
      g2.addColorStop(0.55, pal.sodium.replace('ALPHA', String((0.12 * lampA).toFixed(3))));
      g2.addColorStop(1, 'rgba(255,196,110,0)');
      ctx.fillStyle = g2;
      ctx.beginPath();
      ctx.moveTo(lampX, lampY);
      ctx.lineTo(lampX - coneW * 0.35, lampY + coneH);
      ctx.lineTo(lampX + coneW * 0.25, lampY + coneH);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function drawVanAndCones(ctx, horizon, tt) {
    const roadTopY = horizon + h * 0.13;
    const roadBotY = h;

    // Van
    const vx = w * 0.17;
    const vy = lerp(roadTopY + h * 0.22, roadBotY - h * 0.18, 0.9);

    const vw = w * 0.18;
    const vh = h * 0.11;

    ctx.save();
    ctx.fillStyle = pal.van;
    ctx.globalAlpha = 0.96;
    ctx.fillRect(vx - vw * 0.5, vy - vh * 0.5, vw, vh);

    ctx.fillStyle = 'rgba(235,255,245,0.08)';
    ctx.fillRect(vx - vw * 0.35, vy - vh * 0.35, vw * 0.3, vh * 0.3);

    // hazard blink
    const blink = (Math.sin(tt * 4.8) * 0.5 + 0.5) > 0.55 ? 1 : 0;
    if (blink) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = pal.sodium.replace('ALPHA', '0.9');
      ctx.fillRect(vx - vw * 0.52, vy - vh * 0.08, vw * 0.08, vh * 0.16);
      ctx.fillRect(vx + vw * 0.44, vy - vh * 0.08, vw * 0.08, vh * 0.16);
      ctx.restore();
    }

    // Cones
    for (const c of cones) {
      const u = c.u;
      const y = lerp(roadTopY + h * 0.26, roadBotY - h * 0.06, u);
      const xL = lerp(w * 0.5, w * 0.12, u);
      const xR = lerp(w * 0.5, w * 0.88, u);
      const x = lerp(xL, xR, 0.28 + 0.12 * Math.sin(u * 4 + c.wob + t * 0.08));

      const sz = lerp(h * 0.012, h * 0.035, u);
      ctx.save();
      ctx.fillStyle = pal.cone;
      ctx.globalAlpha = 0.88;
      ctx.beginPath();
      ctx.moveTo(x, y - sz);
      ctx.lineTo(x - sz * 0.7, y + sz);
      ctx.lineTo(x + sz * 0.7, y + sz);
      ctx.closePath();
      ctx.fill();

      ctx.fillStyle = 'rgba(255,245,235,0.55)';
      ctx.fillRect(x - sz * 0.35, y, sz * 0.7, Math.max(1, sz * 0.2));
      ctx.restore();
    }

    ctx.restore();
  }

  function drawTitle(ctx, seg, lampA) {
    const size = Math.max(14, (h / 30) | 0);
    const small = Math.max(11, (h / 45) | 0);

    const baseX = w * 0.055;
    const baseY = h * 0.16;

    const tag = 'STREETLIGHT REPAIR CREW';
    const sub = seg.name === 'TEST'
      ? 'Flicker test…'
      : seg.name === 'SWAP'
        ? 'Replacing bulb/ballast…'
        : seg.name === 'LIFT'
          ? 'Lift rising…'
          : seg.name === 'STEADY'
            ? 'Steady glow.'
            : 'Night shift.';

    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.font = `700 ${size}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;

    const a = 0.75 + 0.2 * lampA;
    ctx.fillStyle = pal.accent.replace('ALPHA', String(a.toFixed(3)));
    ctx.shadowColor = pal.accent.replace('ALPHA', '0.8');
    ctx.shadowBlur = 12;
    ctx.fillText(tag, baseX, baseY);

    ctx.shadowBlur = 0;
    ctx.font = `${small}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = 'rgba(235,255,245,0.55)';
    ctx.fillText(sub, baseX, baseY + size * 1.05);

    ctx.restore();
  }

  function render(ctx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const horizon = h * 0.62;

    if (bgC) ctx.drawImage(bgC, 0, 0);
    drawClouds(ctx);

    const tt = t % cycleDur;
    const seg = segmentInfo(tt);
    const lampA = lampBrightness(tt, seg);

    drawRoad(ctx, horizon);
    drawVanAndCones(ctx, horizon, tt);
    drawStreetlight(ctx, horizon, seg, lampA);
    drawTitle(ctx, seg, lampA);

    // Flicker flash overlay.
    if (seg.name === 'TEST') {
      const flash = clamp(0.14 * (1 - lampA) + 0.08 * Math.sin(tt * 18), 0, 0.22);
      ctx.save();
      ctx.fillStyle = `rgba(255, 230, 200, ${flash})`;
      ctx.fillRect(0, 0, w, h);
      ctx.restore();
    }
  }

  function init({ width, height }) {
    sceneInit(width, height);
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
