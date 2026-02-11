import { mulberry32, clamp } from '../util/prng.js';
// REVIEWED: 2026-02-11

function lerp(a, b, t){ return a + (b - a) * t; }
function smoothstep(t){ t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);

  let w = 0;
  let h = 0;
  let dpr = 1;
  let t = 0;

  // loop structure
  const loopDur = 44 + ((rand() * 9) | 0);
  let loopT = 0;

  // layout
  let s = 1;
  let cx = 0;
  let cy = 0;
  let horizon = 0;

  // deterministic scene params
  const starCount = 120 + ((rand() * 90) | 0);
  let stars = [];

  const phaseA = rand() * 10;
  const phaseB = rand() * 10;
  const phaseC = rand() * 10;

  const plumeHue = 200 + rand() * 40;
  const lavaHue = 20 + rand() * 15;

  // ash (prebaked particles)
  let ash = []; // {delay, life, vx, vy, sz, wob, wobF, a}

  // audio
  let rumble = null; // {src,gain,start,stop}
  let lastPuffTick = false;

  // perf: cache gradients that depend only on layout (rebuilt on regen/ctx swap)
  let gradVer = 0;
  let gradVerBuilt = -1;
  let gradCtx = null;
  let skyGradient = null;
  let groundGradient = null;
  let vignetteGradient = null;

  function invalidateGradients(){ gradVer++; }

  function ensureGradients(ctx){
    if (gradCtx === ctx && gradVerBuilt === gradVer && skyGradient && groundGradient && vignetteGradient) return;
    gradCtx = ctx;
    gradVerBuilt = gradVer;

    skyGradient = ctx.createLinearGradient(0, 0, 0, h);
    skyGradient.addColorStop(0, '#070a12');
    skyGradient.addColorStop(0.55, '#0a0f18');
    skyGradient.addColorStop(1, '#04050a');

    const groundY = horizon + h * 0.18;
    groundGradient = ctx.createLinearGradient(0, groundY, 0, h);
    groundGradient.addColorStop(0, '#05070d');
    groundGradient.addColorStop(1, '#020306');

    vignetteGradient = ctx.createRadialGradient(cx, h * 0.46, s * 0.12, cx, h * 0.52, s * 0.82);
    vignetteGradient.addColorStop(0, 'rgba(0,0,0,0)');
    vignetteGradient.addColorStop(1, 'rgba(0,0,0,0.55)');
  }

  function intensityAt(time){
    // phase windows in seconds (relative within loop)
    const lt = ((time % loopDur) + loopDur) % loopDur;

    const calmEnd = loopDur * 0.46;
    const buildEnd = loopDur * 0.70;

    // deliberately long eruption window so a viewer always sees a clear event within <= 60s
    const eruptStart = loopDur * 0.72;
    const eruptEnd = loopDur * 0.88;

    let i = 0.10;

    if (lt < calmEnd){
      i += 0.05 * (0.5 + 0.5 * Math.sin(lt * 0.35 + phaseA));
    } else if (lt < buildEnd){
      const p = smoothstep((lt - calmEnd) / (buildEnd - calmEnd));
      i += lerp(0.08, 0.52, p);
      i += 0.06 * Math.sin(lt * 1.8 + phaseB) * p;
    } else if (lt < eruptEnd){
      // short pre-eruption kick, then sustained pulsing plume
      const pre = clamp((lt - buildEnd) / Math.max(0.001, eruptStart - buildEnd), 0, 1);
      const preSpike = Math.exp(-pre * 6.0);
      i += 0.22 + 0.36 * (1 - preSpike);

      const e = clamp((lt - eruptStart) / (eruptEnd - eruptStart), 0, 1);
      const rise = smoothstep(Math.min(1, e / 0.15));
      const fall = smoothstep(clamp((e - 0.45) / 0.55, 0, 1));
      const env = rise * (1 - fall);
      const pulses = Math.pow(Math.max(0, Math.sin((lt - eruptStart) * 4.8 + phaseC)), 1.6);

      i += 0.40 * env;
      i += 0.18 * pulses * env;
      i += 0.04 * Math.sin(lt * 2.1 + phaseB) * env;
    } else {
      const p = (lt - eruptEnd) / (loopDur - eruptEnd);
      i += lerp(0.26, 0.06, smoothstep(p));
      i += 0.03 * Math.sin(lt * 1.2 + phaseB);
    }

    // occasional micro-tremor pulses
    const micro = 0.03 * Math.max(0, Math.sin(lt * 4.5 + phaseC));
    return clamp(i + micro, 0, 1);
  }

  function puffAmount(){
    const lt = ((loopT % loopDur) + loopDur) % loopDur;
    const eruptStart = loopDur * 0.72;
    const eruptEnd = loopDur * 0.88;

    if (lt < eruptStart) return 0;
    if (lt > eruptEnd) return 0;

    const e = (lt - eruptStart) / (eruptEnd - eruptStart);
    const env = smoothstep(Math.min(1, e / 0.12)) * smoothstep(Math.min(1, (1 - e) / 0.18));
    const pulse = Math.max(0, Math.sin((lt - eruptStart) * 6.4 + phaseB));
    const puff = Math.pow(pulse, 2.3) * env;
    return clamp(puff, 0, 1);
  }

  function sampleSeismo(time){
    // deterministic pseudo-noise from sines
    const i = intensityAt(time);
    const n = (
      Math.sin(time * 3.9 + phaseA) * 0.55
      + Math.sin(time * 9.7 + phaseB) * 0.25
      + Math.sin(time * 21.3 + phaseC) * 0.20
    );

    // bias during build/puff so the trace looks more "energetic"
    const bump = Math.max(0, Math.sin(time * 2.8 + phaseB));
    const amp = (0.12 + i * 0.95);
    return (n * 0.55 + bump * 0.45) * amp;
  }

  function regen(){
    s = Math.min(w, h);
    cx = w * 0.5;
    cy = h * 0.56;
    horizon = h * 0.62;

    const prng = mulberry32((seed ^ 0xA517) >>> 0);

    stars = Array.from({ length: starCount }, () => {
      const z = 0.2 + prng() * 0.9;
      return {
        x: prng(),
        y: prng(),
        z,
        tw: prng() * 12,
      };
    });

    ash = Array.from({ length: 100 }, () => {
      const ang = (-Math.PI * 0.65) + prng() * (Math.PI * 0.3);
      const sp = (0.08 + prng() * 0.28) * (0.6 + prng() * 0.7);
      return {
        delay: prng() * 1.4,
        life: 4.0 + prng() * 2.6,
        vx: Math.cos(ang) * sp,
        vy: Math.sin(ang) * sp - (0.05 + prng() * 0.22),
        sz: 1 + ((prng() * 3) | 0),
        wob: (prng() * 0.8 + 0.2) * (prng() < 0.5 ? -1 : 1),
        wobF: 0.9 + prng() * 2.0,
        a: 0.08 + prng() * 0.18,
      };
    });

    invalidateGradients();
  }

  function init({ width, height, dpr: dprIn }){
    w = width;
    h = height;
    dpr = dprIn || 1;
    t = 0;
    loopT = 0;
    regen();
  }

  function onResize(width, height, dprIn){
    w = width;
    h = height;
    dpr = dprIn || 1;
    regen();
  }

  function onAudioOn(){
    if (!audio.enabled) return;
    // deep, quiet rumble. we'll modulate gain with tremor intensity.
    rumble = audio.noiseSource({ type: 'brown', gain: 0.0012 });
    rumble.start();
    audio.setCurrent({
      stop(){ try{ rumble?.stop?.(); } catch {} }
    });
  }

  function onAudioOff(){
    try{ rumble?.stop?.(); } catch {}
    rumble = null;
  }

  function destroy(){ onAudioOff(); }

  function update(dt){
    t += dt;
    loopT += dt;

    if (loopT >= loopDur){
      loopT = loopT % loopDur;
      lastPuffTick = false;
    }

    const iNow = intensityAt(loopT);

    // audio modulation
    if (audio.enabled && rumble?.gain){
      const target = 0.0007 + iNow * 0.004;
      rumble.gain.gain.value = target;
    }

    // ash puff moment chirp
    const p = puffAmount();
    const puffing = p > 0.02;
    if (audio.enabled && puffing && !lastPuffTick){
      lastPuffTick = true;
      audio.beep({ freq: 210 + (rand() * 70) | 0, dur: 0.06, gain: 0.04, type: 'square' });
    }
    if (!puffing) lastPuffTick = false;
  }

  function drawBackground(ctx){
    ensureGradients(ctx);

    ctx.fillStyle = skyGradient;
    ctx.fillRect(0, 0, w, h);

    // stars
    for (const st of stars){
      const tw = 0.35 + 0.65 * (0.5 + 0.5 * Math.sin(t * (0.25 + st.z * 0.35) + st.tw));
      const a = (0.10 + 0.22 * tw);
      const px = (st.x * w + t * 6 * st.z) % (w + 2);
      const py = st.y * h * 0.58;
      const sz = 1 + st.z * 1.4;
      ctx.fillStyle = `hsla(${plumeHue}, 65%, 82%, ${a})`;
      ctx.fillRect(px, py, sz, sz);
    }

    // distant ridge silhouette
    ctx.save();
    ctx.globalAlpha = 0.8;
    ctx.fillStyle = '#05070d';
    ctx.beginPath();
    const y0 = horizon - h * 0.07;
    ctx.moveTo(0, horizon);
    for (let x = 0; x <= w; x += w / 12){
      const yy = y0 + Math.sin(x * 0.008 + 1.4) * h * 0.012 + Math.sin(x * 0.02 + 0.7) * h * 0.006;
      ctx.lineTo(x, yy);
    }
    ctx.lineTo(w, horizon);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function drawVolcano(ctx, shakeX, shakeY){
    const i = intensityAt(loopT);
    const puff = puffAmount();

    const baseY = horizon + h * 0.12;
    const coneW = s * 0.52;
    const coneH = s * 0.36;

    ctx.save();
    ctx.translate(shakeX, shakeY);

    // ground haze glow
    const glow = ctx.createRadialGradient(cx, baseY, 1, cx, baseY, s * 0.6);
    glow.addColorStop(0, `rgba(255, 140, 70, ${0.05 + i * 0.08})`);
    glow.addColorStop(1, 'rgba(255,140,70,0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, w, h);

    // cone (shape the shoulders so the crater reads anchored, not floating)
    const x0 = cx - coneW * 0.5;
    const x1 = cx + coneW * 0.5;
    const topY = baseY - coneH;
    const craterY = topY + coneH * 0.085;
    ctx.fillStyle = '#111723';
    ctx.beginPath();
    ctx.moveTo(x0, baseY);

    // left slope → shoulder
    ctx.quadraticCurveTo(cx - coneW * 0.38, baseY - coneH * 0.55, cx - coneW * 0.22, craterY);

    // summit ridge (slight saddle)
    ctx.quadraticCurveTo(cx - coneW * 0.10, topY + coneH * 0.01, cx, topY + coneH * 0.055);
    ctx.quadraticCurveTo(cx + coneW * 0.10, topY + coneH * 0.01, cx + coneW * 0.22, craterY);

    // right shoulder → slope
    ctx.quadraticCurveTo(cx + coneW * 0.38, baseY - coneH * 0.55, x1, baseY);

    ctx.closePath();
    ctx.fill();

    // rim cutout
    ctx.save();
    ctx.globalCompositeOperation = 'destination-out';
    ctx.beginPath();
    ctx.ellipse(cx, craterY, coneW * 0.18, coneH * 0.06, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // rim outline
    ctx.save();
    ctx.globalAlpha = 0.35;
    ctx.strokeStyle = 'rgba(160,170,200,0.35)';
    ctx.lineWidth = Math.max(1, s / 380);
    ctx.beginPath();
    ctx.ellipse(cx, craterY, coneW * 0.18, coneH * 0.06, 0, 0, Math.PI * 2);
    ctx.stroke();
    ctx.restore();

    // lava glow inside crater
    const lavaR = coneW * (0.11 + puff * 0.04);
    const lavaY = topY + coneH * 0.11;
    const lava = ctx.createRadialGradient(cx, lavaY, 1, cx, lavaY, lavaR * 2.2);
    lava.addColorStop(0, `hsla(${lavaHue}, 95%, 62%, ${0.65 + puff * 0.25})`);
    lava.addColorStop(0.5, `hsla(${lavaHue+10}, 95%, 52%, ${0.18 + i * 0.12})`);
    lava.addColorStop(1, 'rgba(255,120,40,0)');
    ctx.fillStyle = lava;
    ctx.beginPath();
    ctx.ellipse(cx, lavaY, lavaR * 1.1, lavaR * 0.55, 0, 0, Math.PI * 2);
    ctx.fill();

    // gas plume (layered puffs)
    const plumeBaseY = lavaY - coneH * 0.05;
    const plumeH = s * (0.40 + puff * 0.22);
    const step = Math.max(10, s * 0.04);
    const scroll = (t * (34 + i * 46)) % step;
    const sway = Math.sin(t * 0.6 + phaseA) * s * 0.012 + Math.sin(t * 1.1 + phaseC) * s * 0.006;

    for (let yy = 0; yy < plumeH; yy += step){
      const y = plumeBaseY - yy + scroll;
      const p = yy / plumeH;
      const ww = s * (0.06 + p * 0.11 + puff * 0.08);
      const xx = cx + sway * (0.2 + p * 1.1) + Math.sin(t * (0.9 + p * 0.8) + yy * 0.03) * s * 0.01;
      const a = (0.14 + (1 - p) * 0.12) * (0.7 + i * 0.55);

      const fog = ctx.createRadialGradient(xx, y, 1, xx, y, ww * 1.6);
      fog.addColorStop(0, `hsla(${plumeHue}, 45%, 74%, ${a})`);
      fog.addColorStop(1, `hsla(${plumeHue}, 45%, 74%, 0)`);
      ctx.fillStyle = fog;
      ctx.beginPath();
      ctx.arc(xx, y, ww * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }

    // ash puff cloud at the top
    if (puff > 0.02){
      const ax = cx + sway * 1.4;
      const ay = plumeBaseY - plumeH * 0.92;
      const r = s * (0.12 + puff * 0.18);
      const cloud = ctx.createRadialGradient(ax, ay, 1, ax, ay, r * 2.3);
      cloud.addColorStop(0, `rgba(210, 215, 225, ${0.10 + puff * 0.22})`);
      cloud.addColorStop(1, 'rgba(210,215,225,0)');
      ctx.fillStyle = cloud;
      ctx.beginPath();
      ctx.arc(ax, ay, r * 2.3, 0, Math.PI * 2);
      ctx.fill();
    }

    // ground plane
    const groundY = horizon + h * 0.18;
    ensureGradients(ctx);
    ctx.fillStyle = groundGradient;
    ctx.fillRect(0, groundY, w, h - groundY);

    ctx.restore();
  }

  function drawAsh(ctx, shakeX, shakeY){
    const puff = puffAmount();
    if (puff <= 0.01) return;

    // spawn window aligned with puff peak
    const lt = ((loopT % loopDur) + loopDur) % loopDur;
    const buildEnd = loopDur * 0.70;
    const puffEnd = loopDur * 0.78;
    const p = clamp((lt - buildEnd) / (puffEnd - buildEnd), 0, 1);

    const baseY = horizon + h * 0.12;
    const coneH = s * 0.36;
    const topY = baseY - coneH;
    const lavaY = topY + coneH * 0.11;

    const srcX = cx + shakeX;
    const srcY = lavaY + shakeY - s * 0.01;

    // ash time since puff began
    const t0 = lt - buildEnd;

    ctx.save();
    ctx.globalCompositeOperation = 'source-over';

    for (const a of ash){
      const tt = t0 - a.delay;
      if (tt <= 0 || tt >= a.life) continue;
      const lifeP = tt / a.life;

      const drift = (1 - lifeP) * puff;
      const x = srcX + (a.vx * tt * s * 2.2) + Math.sin((t + a.delay) * a.wobF) * a.wob * s * 0.015;
      const y = srcY + (a.vy * tt * s * 2.2) + (lifeP * lifeP) * s * 0.08; // slight fall back down

      const alpha = a.a * (1 - smoothstep(lifeP));
      ctx.fillStyle = `rgba(220, 224, 232, ${alpha})`;
      ctx.fillRect(x, y, a.sz, a.sz);

      if (lifeP < 0.25 && drift > 0.2){
        // tiny bright sparklets early in puff
        ctx.fillStyle = `rgba(255, 235, 210, ${alpha * 0.35})`;
        ctx.fillRect(x + 1, y - 1, 1, 1);
      }
    }

    ctx.restore();
  }

  function drawSeismograph(ctx){
    const pad = Math.floor(s * 0.05);
    const sw = Math.floor(s * 0.62);
    const sh = Math.floor(s * 0.16);
    const x0 = Math.floor(cx - sw * 0.5);
    const y0 = Math.floor(h - pad - sh);

    // panel
    ctx.save();
    ctx.globalAlpha = 0.85;
    ctx.fillStyle = 'rgba(10, 14, 22, 0.9)';
    ctx.fillRect(x0, y0, sw, sh);

    // grid
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = 'rgba(130, 200, 255, 0.35)';
    ctx.lineWidth = Math.max(1, s / 520);
    const cols = 12;
    for (let i = 1; i < cols; i++){
      const x = x0 + (i / cols) * sw;
      ctx.beginPath();
      ctx.moveTo(x, y0);
      ctx.lineTo(x, y0 + sh);
      ctx.stroke();
    }
    const rows = 4;
    for (let j = 1; j < rows; j++){
      const y = y0 + (j / rows) * sh;
      ctx.beginPath();
      ctx.moveTo(x0, y);
      ctx.lineTo(x0 + sw, y);
      ctx.stroke();
    }

    // trace
    const mid = y0 + sh * 0.5;
    const speed = 2.6; // seconds across
    const aScale = sh * 0.36;

    ctx.globalAlpha = 0.85;
    ctx.strokeStyle = 'rgba(180, 255, 220, 0.9)';
    ctx.lineWidth = Math.max(1, s / 420);
    ctx.beginPath();

    const steps = Math.max(140, (sw / 4) | 0);
    for (let i = 0; i <= steps; i++){
      const px = i / steps;
      const time = loopT - (1 - px) * speed;
      const v = sampleSeismo(time);
      const y = mid + v * aScale;
      const x = x0 + px * sw;
      if (i === 0) ctx.moveTo(x, y);
      else ctx.lineTo(x, y);
    }
    ctx.stroke();

    // thresholds / alert meter (tied to intensityAt(loopT))
    const iNow = intensityAt(loopT);
    const buildT = 0.32;
    const alertT = 0.55;
    const eruptT = 0.75;
    const state = iNow >= eruptT ? 'ERUPT' : iNow >= alertT ? 'ALERT' : iNow >= buildT ? 'BUILD' : 'CALM';

    const meterPad = 10;
    const meterW = Math.max(6, Math.floor(s * 0.012));
    const meterH = Math.max(12, sh - 34);
    const meterX = x0 + sw - meterPad - meterW;
    const meterY = y0 + 24;

    const col = (state === 'ERUPT') ? 'rgba(255, 110, 90, 0.95)'
      : (state === 'ALERT') ? 'rgba(255, 210, 120, 0.92)'
      : (state === 'BUILD') ? 'rgba(200, 235, 255, 0.85)'
      : 'rgba(140, 230, 190, 0.85)';

    ctx.globalAlpha = 0.45;
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(meterX, meterY, meterW, meterH);

    const fillH = meterH * clamp(iNow, 0, 1);
    ctx.globalAlpha = 0.78;
    ctx.fillStyle = col;
    ctx.fillRect(meterX, meterY + meterH - fillH, meterW, fillH);

    ctx.globalAlpha = 0.40;
    ctx.strokeStyle = 'rgba(200, 220, 255, 0.55)';
    ctx.lineWidth = Math.max(1, s / 720);
    for (const thr of [buildT, alertT, eruptT]){
      const yy = meterY + (1 - thr) * meterH;
      ctx.beginPath();
      ctx.moveTo(meterX - 3, yy);
      ctx.lineTo(meterX + meterW + 3, yy);
      ctx.stroke();
    }

    // label
    ctx.font = `${Math.max(11, Math.floor(s / 54))}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.globalAlpha = 0.35;
    ctx.fillStyle = 'rgba(200, 220, 255, 0.9)';
    ctx.fillText('SEISMOGRAPH  •  TINY VOLCANO OBS', x0 + 10, y0 + 18);

    ctx.globalAlpha = 0.60;
    ctx.fillStyle = col;
    const tw = ctx.measureText(state).width;
    ctx.fillText(state, meterX - 8 - tw, y0 + 18);

    ctx.restore();
  }

  function drawHud(ctx){
    ctx.save();
    ctx.globalAlpha = 0.24;
    ctx.fillStyle = '#c7d2ff';
    ctx.font = `${Math.max(11, Math.floor(s / 54))}px ui-monospace, SFMono-Regular, Menlo, monospace`;
    ctx.fillText('TINY VOLCANO OBSERVATORY', Math.floor(w * 0.06), Math.floor(h * 0.09));

    ctx.globalAlpha = 0.16;
    const lt = ((loopT % loopDur) + loopDur) % loopDur;
    ctx.fillText(`SEED ${seed}  •  LOOP ${lt.toFixed(1)}s`, Math.floor(w * 0.06), Math.floor(h * 0.09) + 18);
    ctx.restore();
  }

  function render(ctx){
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const i = intensityAt(loopT);
    const shake = i * i;
    const shakeX = Math.sin(t * 40) * s * 0.0022 * shake + Math.sin(t * 73) * s * 0.0012 * shake;
    const shakeY = Math.cos(t * 37) * s * 0.0018 * shake + Math.cos(t * 91) * s * 0.0010 * shake;

    drawBackground(ctx);
    drawVolcano(ctx, shakeX, shakeY);
    drawAsh(ctx, shakeX, shakeY);
    drawSeismograph(ctx);
    drawHud(ctx);

    // subtle vignette
    ensureGradients(ctx);
    ctx.fillStyle = vignetteGradient;
    ctx.fillRect(0, 0, w, h);
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
