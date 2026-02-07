import { mulberry32 } from '../util/prng.js';
import { simpleDrone } from '../util/audio.js';

export function createChannel({ seed, audio }) {
  const rand = mulberry32(seed);

  let w = 0;
  let h = 0;
  let t = 0;

  const bpm = 72 + ((rand() * 12) | 0);
  const beatPeriod = 60 / bpm;
  let beatPulse = 0;
  let beatIndex = -1;

  let stars = [];
  let skylineFar = [];
  let skylineNear = [];

  let drone = null;
  let musicHandle = null;

  let nextMeteorAt = 0;
  let meteor = null;

  let flash = 0;
  let nextFlashAt = 0;

  let titleGlitch = 0;
  let nextTitleGlitchAt = 0;

  function pick(arr) {
    return arr[(rand() * arr.length) | 0];
  }

  function sceneInit(width, height) {
    w = width;
    h = height;
    t = 0;
    beatPulse = 0;
    beatIndex = -1;
    flash = 0;

    stars = Array.from({ length: 260 }, () => ({
      x: rand() * w,
      y: rand() * h * 0.56,
      z: 0.18 + rand() * 0.95,
      tw: rand() * 12,
      hue: 170 + rand() * 80,
    }));

    skylineFar = [];
    skylineNear = [];

    let x = -w * 0.1;
    while (x < w * 1.1) {
      const bw = Math.max(16, Math.floor(w * (0.012 + rand() * 0.03)));
      skylineFar.push({
        x,
        w: bw,
        h: Math.floor(h * (0.04 + rand() * 0.12)),
        lights: 2 + ((rand() * 5) | 0),
      });
      x += bw + Math.floor(3 + rand() * 6);
    }

    x = -w * 0.12;
    while (x < w * 1.15) {
      const bw = Math.max(20, Math.floor(w * (0.015 + rand() * 0.04)));
      skylineNear.push({
        x,
        w: bw,
        h: Math.floor(h * (0.07 + rand() * 0.2)),
        lights: 3 + ((rand() * 7) | 0),
      });
      x += bw + Math.floor(4 + rand() * 9);
    }

    meteor = null;
    nextMeteorAt = 3 + rand() * 5;
    nextFlashAt = 7 + rand() * 8;
    nextTitleGlitchAt = 2 + rand() * 4;
    titleGlitch = 0;
  }

  function onResize(width, height) {
    sceneInit(width, height);
  }

  function triggerBeat() {
    beatPulse = 1;

    if (!audio.enabled) return;

    const ctx = audio.ensure();
    const beatMod = beatIndex % 8;

    audio.beep({
      freq: beatMod === 0 ? 64 : 78,
      dur: 0.09,
      gain: beatMod === 0 ? 0.03 : 0.018,
      type: 'square',
    });

    if (beatMod % 2 === 0) {
      const scale = [110, 123.47, 130.81, 146.83, 164.81, 174.61, 196, 220];
      const f = scale[(beatIndex / 2) % scale.length | 0];
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = pick(['triangle', 'sawtooth']);
      osc.frequency.value = f * 2;
      g.gain.value = 0;
      osc.connect(g);
      g.connect(audio.master);
      const t0 = ctx.currentTime;
      g.gain.setValueAtTime(0, t0);
      g.gain.linearRampToValueAtTime(0.015, t0 + 0.012);
      g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
      osc.start(t0);
      osc.stop(t0 + 0.2);
    }
  }

  function onAudioOn() {
    if (!audio.enabled) return;
    drone = simpleDrone(audio, { root: 55, detune: 1.5, gain: 0.05 });
    musicHandle = {
      stop() {
        try { drone?.stop?.(); } catch {}
      },
    };
    audio.setCurrent(musicHandle);
  }

  function onAudioOff() {
    try { musicHandle?.stop?.(); } catch {}
    drone = null;
    musicHandle = null;
  }

  function destroy() {
    onAudioOff();
  }

  function update(dt) {
    t += dt;
    beatPulse = Math.max(0, beatPulse - dt * 1.8);
    flash = Math.max(0, flash - dt * 1.35);
    titleGlitch = Math.max(0, titleGlitch - dt * 8);

    const idx = Math.floor(t / beatPeriod);
    if (idx !== beatIndex) {
      beatIndex = idx;
      triggerBeat();
    }

    if (!meteor && t >= nextMeteorAt) {
      meteor = {
        x: w * (0.15 + rand() * 0.7),
        y: h * (0.05 + rand() * 0.2),
        vx: -(w * (0.28 + rand() * 0.25)),
        vy: h * (0.11 + rand() * 0.15),
        life: 1.1 + rand() * 0.7,
      };
      nextMeteorAt = t + 5 + rand() * 11;
    }

    if (meteor) {
      meteor.x += meteor.vx * dt;
      meteor.y += meteor.vy * dt;
      meteor.life -= dt;
      if (meteor.life <= 0 || meteor.y > h * 0.58 || meteor.x < -w * 0.2) meteor = null;
    }

    if (t >= nextFlashAt) {
      flash = 0.85;
      nextFlashAt = t + 9 + rand() * 14;
    }

    if (t >= nextTitleGlitchAt) {
      titleGlitch = 1;
      nextTitleGlitchAt = t + 2 + rand() * 6;
    }
  }

  function drawSky(ctx, horizon, beatAmt) {
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#050016');
    sky.addColorStop(0.42, '#15002f');
    sky.addColorStop(0.82, '#08091e');
    sky.addColorStop(1, '#03050b');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = `rgba(255, 120, 210, ${0.08 + beatAmt * 0.08})`;
    ctx.fillRect(0, horizon * 0.4, w, horizon * 0.5);
    ctx.restore();

    for (const s of stars) {
      const tw = 0.25 + 0.75 * (0.5 + 0.5 * Math.sin(t * (0.35 + s.z * 0.45) + s.tw));
      const a = (0.22 + 0.62 * tw) * (0.65 + beatAmt * 0.35);
      ctx.fillStyle = `hsla(${s.hue}, 90%, 78%, ${a})`;
      const sz = 0.8 + s.z * 1.6;
      const px = (s.x + t * 4 * s.z) % (w + 2);
      ctx.fillRect(px, s.y, sz, sz);
    }

    if (meteor) {
      ctx.save();
      ctx.strokeStyle = 'rgba(190,240,255,0.75)';
      ctx.lineWidth = Math.max(1, h / 520);
      ctx.beginPath();
      ctx.moveTo(meteor.x, meteor.y);
      ctx.lineTo(meteor.x + w * 0.08, meteor.y - h * 0.04);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawSun(ctx, horizon, beatAmt) {
    const sunX = w * 0.72;
    const sunY = h * 0.31 + Math.sin(t * 0.25) * h * 0.003;
    const sunR = Math.min(w, h) * (0.145 + beatAmt * 0.012);

    const shimmer = Math.sin(t * 3.8) * 0.5 + 0.5;
    const halo = ctx.createRadialGradient(sunX, sunY, 1, sunX, sunY, sunR * 1.4);
    halo.addColorStop(0, `rgba(255,210,120,${0.9 + beatAmt * 0.08})`);
    halo.addColorStop(0.52, `rgba(255,80,215,${0.5 + shimmer * 0.15})`);
    halo.addColorStop(1, 'rgba(255,80,215,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR * 1.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.save();
    ctx.beginPath();
    ctx.arc(sunX, sunY, sunR, 0, Math.PI * 2);
    ctx.clip();

    const disk = ctx.createLinearGradient(0, sunY - sunR, 0, sunY + sunR);
    disk.addColorStop(0, '#ffd486');
    disk.addColorStop(0.44, '#ff6bcf');
    disk.addColorStop(1, '#d83be8');
    ctx.fillStyle = disk;
    ctx.fillRect(sunX - sunR, sunY - sunR, sunR * 2, sunR * 2);

    const scanGap = Math.max(3, Math.floor(sunR / 11));
    const drift = Math.sin(t * 1.4) * 1.2;
    for (let yy = sunY - sunR; yy < sunY + sunR; yy += scanGap) {
      const wobble = Math.sin(yy * 0.045 + t * 4.5) * 3 + drift;
      ctx.strokeStyle = `rgba(${160 + ((yy * 3) % 80) | 0},0,80,0.22)`;
      ctx.lineWidth = Math.max(1, h / 540);
      ctx.beginPath();
      ctx.moveTo(sunX - sunR + wobble, yy);
      ctx.lineTo(sunX + sunR + wobble, yy);
      ctx.stroke();
    }

    ctx.restore();

    const refl = ctx.createLinearGradient(0, horizon * 0.9, 0, h);
    refl.addColorStop(0, `rgba(255,95,220,${0.12 + beatAmt * 0.12})`);
    refl.addColorStop(1, 'rgba(255,95,220,0)');
    ctx.fillStyle = refl;
    ctx.fillRect(sunX - sunR * 0.9, horizon * 0.9, sunR * 1.8, h - horizon * 0.9);
  }

  function drawSkylineLayer(ctx, layer, horizon, offset, color, lightColor, amp) {
    ctx.save();
    ctx.translate(offset, 0);
    for (const b of layer) {
      const x = b.x;
      const y = horizon - b.h;
      ctx.fillStyle = color;
      ctx.fillRect(x, y, b.w, b.h);

      ctx.fillStyle = `rgba(0,0,0,0.3)`;
      ctx.fillRect(x, y, b.w, Math.max(2, b.h * 0.08));

      const rows = Math.max(1, (b.h / 8) | 0);
      const cols = Math.max(1, (b.w / 7) | 0);
      const sx = b.w / (cols + 1);
      const sy = b.h / (rows + 1);
      for (let ry = 1; ry <= rows; ry++) {
        for (let cx = 1; cx <= cols; cx++) {
          const hv = Math.sin((b.x + 1) * 0.173 + cx * 12.9898 + ry * 78.233) * 43758.5453;
          const keep = hv - Math.floor(hv);
          if (keep > 0.45) continue;
          const tw = 0.4 + 0.6 * Math.sin(t * (0.0045 + ry * 0.0002) + cx + ry);
          ctx.fillStyle = `${lightColor.replace('ALPHA', String((0.1 + 0.35 * tw + amp * 0.25).toFixed(3)))}`;
          ctx.fillRect(x + cx * sx - 1.5, y + ry * sy - 1.5, 3, 3);
        }
      }
    }
    ctx.restore();
  }

  function drawGrid(ctx, horizon, beatAmt) {
    const camDriftX = Math.sin(t * 0.16) * w * 0.012 + Math.sin(t * 0.42) * w * 0.004;
    const camDriftY = Math.sin(t * 0.18) * h * 0.006;

    ctx.save();
    ctx.translate(w * 0.5 + camDriftX, horizon + camDriftY);

    const glow = ctx.createLinearGradient(0, 0, 0, h * 0.7);
    glow.addColorStop(0, `rgba(108,242,255,${0.12 + beatAmt * 0.15})`);
    glow.addColorStop(1, 'rgba(108,242,255,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(-w, -6, w * 2, h * 1.1);

    ctx.strokeStyle = `rgba(108,242,255,${0.4 + beatAmt * 0.25})`;
    ctx.lineWidth = Math.max(1, Math.floor(h / 560));

    const cols = 28;
    for (let i = -cols; i <= cols; i++) {
      const x = i / cols;
      ctx.globalAlpha = 0.14 + 0.6 * (1 - Math.abs(x));
      ctx.beginPath();
      ctx.moveTo(x * w * 0.62, 0);
      ctx.lineTo(x * w * 3.2, h * 1.8);
      ctx.stroke();
    }

    const rows = 28;
    const speed = 1.2 + beatAmt * 1.2;
    for (let r = 0; r < rows; r++) {
      const z = (r + (t * speed) % 1) / rows;
      const y = z * z * (h * 1.65);
      const half = (1 - z) * w * 1.85;
      ctx.globalAlpha = 0.06 + 0.72 * z;
      ctx.beginPath();
      ctx.moveTo(-half, y);
      ctx.lineTo(half, y);
      ctx.stroke();
    }
    ctx.restore();
  }

  function drawCar(ctx, horizon, beatAmt) {
    const roadY = horizon + h * 0.33;
    const sway = Math.sin(t * 0.42) * w * 0.024;
    const x = w * 0.5 + sway;
    const bodyW = w * 0.12;
    const bodyH = h * 0.038;

    ctx.save();
    ctx.translate(x, roadY);

    ctx.fillStyle = 'rgba(15,20,38,0.85)';
    ctx.beginPath();
    ctx.moveTo(-bodyW * 0.5, 0);
    ctx.lineTo(-bodyW * 0.32, -bodyH * 0.9);
    ctx.lineTo(bodyW * 0.26, -bodyH * 0.9);
    ctx.lineTo(bodyW * 0.5, 0);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(255,255,255,0.12)';
    ctx.fillRect(-bodyW * 0.22, -bodyH * 0.8, bodyW * 0.34, bodyH * 0.28);

    const tailGlow = 0.35 + beatAmt * 0.6;
    ctx.shadowColor = `rgba(255,62,162,${tailGlow})`;
    ctx.shadowBlur = 18 + beatAmt * 10;
    ctx.fillStyle = 'rgba(255,62,162,0.9)';
    ctx.fillRect(-bodyW * 0.36, -bodyH * 0.25, bodyW * 0.12, bodyH * 0.15);
    ctx.fillRect(bodyW * 0.24, -bodyH * 0.25, bodyW * 0.12, bodyH * 0.15);

    ctx.shadowBlur = 0;
    ctx.fillStyle = 'rgba(108,242,255,0.15)';
    ctx.beginPath();
    ctx.moveTo(-bodyW * 0.18, -bodyH * 0.95);
    ctx.lineTo(0, -bodyH * 1.35);
    ctx.lineTo(bodyW * 0.18, -bodyH * 0.95);
    ctx.closePath();
    ctx.fill();

    ctx.restore();
  }

  function drawTitle(ctx, beatAmt) {
    const size = Math.floor(h / 20);
    const baseX = w * 0.055;
    const baseY = h * 0.2;
    const msgA = 'CH 01';
    const msgB = 'SYNTHWAVE DRIVE';

    const jitterX = titleGlitch > 0 ? (rand() - 0.5) * 9 : 0;
    const jitterY = titleGlitch > 0 ? (rand() - 0.5) * 5 : 0;

    ctx.save();
    ctx.textBaseline = 'middle';

    ctx.font = `${Math.floor(size * 0.9)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = 'rgba(255,120,210,0.95)';
    ctx.shadowColor = 'rgba(255,70,205,0.75)';
    ctx.shadowBlur = 12 + beatAmt * 10;
    ctx.fillText(msgA, baseX + jitterX, baseY + jitterY);

    const tagW = ctx.measureText(msgA).width + 18;

    ctx.font = `${size}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = 'rgba(255,86,221,0.92)';
    ctx.shadowBlur = 18 + beatAmt * 14;
    ctx.fillText(msgB, baseX + tagW + 10 + jitterX, baseY + jitterY);

    if (titleGlitch > 0) {
      const ghostA = 0.2 + titleGlitch * 0.25;
      ctx.fillStyle = `rgba(90,245,255,${ghostA})`;
      ctx.shadowBlur = 0;
      ctx.fillText(msgA, baseX + 2 + jitterX * 1.3, baseY - 1 + jitterY);
      ctx.fillText(msgB, baseX + tagW + 13 + jitterX * 1.3, baseY - 1 + jitterY);
    }

    ctx.restore();
  }

  function render(ctx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const beatAmt = Math.max(0, Math.min(1, beatPulse));
    const horizon = h * 0.53;

    drawSky(ctx, horizon, beatAmt);
    drawSun(ctx, horizon, beatAmt);

    const farDrift = Math.sin(t * 0.06) * w * 0.006;
    const nearDrift = Math.sin(t * 0.09) * w * 0.01;
    drawSkylineLayer(ctx, skylineFar, horizon, farDrift, 'rgba(16,20,42,0.95)', 'rgba(130,235,255,ALPHA)', beatAmt * 0.7);
    drawSkylineLayer(ctx, skylineNear, horizon + h * 0.01, nearDrift, 'rgba(10,13,30,0.98)', 'rgba(255,70,210,ALPHA)', beatAmt);

    drawGrid(ctx, horizon, beatAmt);
    drawCar(ctx, horizon, beatAmt);
    drawTitle(ctx, beatAmt);

    if (flash > 0) {
      ctx.fillStyle = `rgba(255, 170, 230, ${flash * 0.15})`;
      ctx.fillRect(0, 0, w, h);
    }
  }

  function init({ width, height }) {
    sceneInit(width, height);
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
