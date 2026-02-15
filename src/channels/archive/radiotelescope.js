import { mulberry32 } from '../../util/prng.js';
import { simpleDrone } from '../../util/audio.js';

export function createChannel({ seed, audio }) {
  const rand = mulberry32(seed);

  let w = 0;
  let h = 0;
  let t = 0;

  const PHASES = [
    { name: 'CALIBRATE', dur: 11.5 },
    { name: 'TRACK', dur: 14.0 },
    { name: 'SWEEP', dur: 12.5 },
    { name: 'QUIET', dur: 10.0 },
  ];
  const cycleDur = PHASES.reduce((a, p) => a + p.dur, 0);

  let stars = [];
  let dunesFar = [];
  let dunesNear = [];
  let dishes = [];

  let interference = 0;
  let nextInterferenceAt = 0;

  let wow = 0;
  let wowBin = 0;
  let nextWowAt = 0;

  // Waterfall panel (ring buffer)
  const wfCols = 84;
  const wfRows = 56;
  const wfStep = 0.08;
  let wf = new Float32Array(wfCols * wfRows);
  let wfRow = 0;
  let wfAcc = 0;

  let drone = null;
  let wind = null;
  let windFilter = null;
  let audioHandle = null;

  function clamp(x, a, b) {
    return Math.max(a, Math.min(b, x));
  }

  function fract(x) {
    return x - Math.floor(x);
  }

  function hash01(a, b) {
    // deterministic 0..1 noise (no allocations)
    return fract(Math.sin(a * 127.1 + b * 311.7 + seed * 0.000001) * 43758.5453123);
  }

  function gauss(x, mu, sigma) {
    const z = (x - mu) / sigma;
    return Math.exp(-0.5 * z * z);
  }

  function pick(arr) {
    return arr[(rand() * arr.length) | 0];
  }

  function buildDune(count, yBase, amp, jitter) {
    const pts = [];
    for (let i = 0; i < count; i++) {
      const x = (i / (count - 1)) * w;
      const n = Math.sin(i * 0.9 + rand() * 6) * 0.5 + 0.5;
      const yy = yBase + (n * 2 - 1) * amp + (rand() * 2 - 1) * jitter;
      pts.push({ x, y: yy });
    }
    return pts;
  }

  function sceneInit(width, height) {
    w = width;
    h = height;
    t = 0;

    interference = 0;
    nextInterferenceAt = 3 + rand() * 6;

    wow = 0;
    wowBin = (rand() * wfCols) | 0;
    nextWowAt = 16 + rand() * 18;

    wf.fill(0);
    wfRow = 0;
    wfAcc = 0;

    const horizon = h * 0.58;

    stars = Array.from({ length: 210 }, () => ({
      x: rand() * w,
      y: rand() * horizon * 0.95,
      s: 0.6 + rand() * 1.6,
      a: 0.15 + rand() * 0.65,
      tw: rand() * 10,
    }));

    dunesFar = buildDune(16, horizon + h * 0.05, h * 0.03, h * 0.008);
    dunesNear = buildDune(18, horizon + h * 0.19, h * 0.05, h * 0.012);

    const dishCount = 14 + ((rand() * 10) | 0);
    dishes = [];
    for (let i = 0; i < dishCount; i++) {
      const depth = Math.pow(rand(), 0.72); // more near-ish
      dishes.push({
        u: rand(),
        depth,
        size: 0.7 + rand() * 0.9,
        a: rand() * Math.PI * 2,
        aVel: (rand() * 2 - 1) * 0.4,
        led: rand(),
      });
    }

    // sort back-to-front so close dishes draw last
    dishes.sort((A, B) => A.depth - B.depth);
  }

  function onResize(width, height) {
    sceneInit(width, height);
  }

  function phaseAt(time) {
    let tt = time % cycleDur;
    for (const p of PHASES) {
      if (tt < p.dur) return { phase: p, local: tt };
      tt -= p.dur;
    }
    return { phase: PHASES[0], local: 0 };
  }

  function onAudioOn() {
    if (!audio.enabled) return;

    const ctx = audio.ensure();
    drone = simpleDrone(audio, { root: 44, detune: 1.2, gain: 0.045 });

    // Pink-noise wind, gently lowpassed.
    wind = audio.noiseSource({ type: 'pink', gain: 0.02 });
    windFilter = ctx.createBiquadFilter();
    windFilter.type = 'lowpass';
    windFilter.frequency.value = 700;
    windFilter.Q.value = 0.7;

    try { wind.src.disconnect(); } catch {}
    wind.src.connect(windFilter);
    windFilter.connect(wind.gain);

    wind.start();

    audioHandle = {
      stop() {
        try { drone?.stop?.(); } catch {}
        try { wind?.stop?.(); } catch {}
        try { windFilter?.disconnect?.(); } catch {}
        drone = null;
        wind = null;
        windFilter = null;
      },
    };
    audio.setCurrent(audioHandle);
  }

  function onAudioOff() {
    try { audioHandle?.stop?.(); } catch {}
    audioHandle = null;
  }

  function destroy() {
    onAudioOff();
  }

  function triggerInterference() {
    interference = 1;
    nextInterferenceAt = t + 6 + rand() * 12;
    if (audio.enabled) audio.beep({ freq: 860 + rand() * 240, dur: 0.04, gain: 0.035, type: 'square' });
  }

  function triggerWow() {
    wow = 1;
    wowBin = (rand() * wfCols) | 0;
    nextWowAt = t + 22 + rand() * 28;

    if (!audio.enabled) return;
    audio.beep({ freq: 540, dur: 0.07, gain: 0.045, type: 'triangle' });
    setTimeout(() => {
      try {
        if (audio.enabled) audio.beep({ freq: 920, dur: 0.06, gain: 0.035, type: 'sine' });
      } catch {}
    }, 70);
  }

  function updateWaterfall(stepIndex, phaseName) {
    wfRow = (wfRow + 1) % wfRows;

    const tt = stepIndex * wfStep;
    const muA = 0.22 + 0.08 * Math.sin(tt * 0.22 + seed * 0.000002);
    const muB = 0.64 + 0.07 * Math.sin(tt * 0.17 + seed * 0.000003);

    for (let c = 0; c < wfCols; c++) {
      const x = c / (wfCols - 1);

      let v = 0.08;
      v += 0.34 * gauss(x, muA, 0.045);
      v += 0.25 * gauss(x, muB, 0.06);

      // Slow drift band
      v += 0.09 * (0.5 + 0.5 * Math.sin(tt * 0.9 + c * 0.11));

      // Texture noise (deterministic)
      const n = hash01(c + 1.7, stepIndex + 0.3);
      v += 0.17 * n;

      // Phase-dependent "activity"
      if (phaseName === 'SWEEP') v += 0.08 * gauss(x, 0.46 + 0.22 * Math.sin(tt * 0.5), 0.09);
      if (phaseName === 'QUIET') v *= 0.78;

      // Interference = horizontal static + sporadic spikes
      if (interference > 0) {
        const spike = n > 0.88 ? 1 : 0;
        v += interference * (0.22 + 0.55 * spike);
      }

      // WOW transient spike
      if (wow > 0) {
        const dx = (c - wowBin) / 4.5;
        v += wow * Math.exp(-dx * dx) * 1.35;
      }

      wf[wfRow * wfCols + c] = clamp(v, 0, 1);
    }
  }

  function update(dt) {
    t += dt;

    interference = Math.max(0, interference - dt * 1.25);
    wow = Math.max(0, wow - dt * 0.9);

    if (t >= nextInterferenceAt) triggerInterference();
    if (t >= nextWowAt) triggerWow();

    const { phase, local } = phaseAt(t);

    // Dish tracking motion (phase-sensitive).
    const targetBase = Math.sin(t * 0.12 + seed * 0.00001) * 0.7;
    const sweep = phase.name === 'SWEEP' ? Math.sin(local * 1.4) * 1.2 : 0;

    for (let i = 0; i < dishes.length; i++) {
      const d = dishes[i];
      const wob = Math.sin(t * (0.2 + d.depth * 0.25) + i * 1.7) * 0.12;
      const target = targetBase + wob + sweep * (0.35 + (1 - d.depth) * 0.5) + d.aVel * 0.05;

      // Smoothly approach target angle.
      d.a += (target - d.a) * (1 - Math.exp(-dt * 2.2));

      // LED "heartbeat" is quiet unless interference.
      const hb = 0.5 + 0.5 * Math.sin(t * (1.2 + d.depth * 0.9) + d.led * 6);
      d.led = clamp(0.25 + 0.75 * hb + interference * 0.35, 0, 1);
    }

    // Waterfall advances in fixed steps.
    wfAcc += dt;
    let steps = 0;
    while (wfAcc >= wfStep) {
      wfAcc -= wfStep;
      updateWaterfall(((t / wfStep) | 0) + steps, phase.name);
      steps++;
      if (steps > 4) break; // bounded catch-up
    }
  }

  function drawDune(ctx, pts, fillStyle, drift) {
    ctx.save();
    ctx.translate(drift, 0);
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i].x, pts[i].y);
    ctx.lineTo(w, h);
    ctx.lineTo(0, h);
    ctx.closePath();
    ctx.fillStyle = fillStyle;
    ctx.fill();
    ctx.restore();
  }

  function drawDish(ctx, x, y, scale, ang, ledAmt, highlight) {
    ctx.save();
    ctx.translate(x, y);
    ctx.scale(scale, scale);

    // stand
    ctx.strokeStyle = `rgba(210, 220, 230, ${0.22 + highlight * 0.18})`;
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.moveTo(0, 22);
    ctx.lineTo(-8, 45);
    ctx.moveTo(0, 22);
    ctx.lineTo(8, 45);
    ctx.moveTo(-8, 45);
    ctx.lineTo(8, 45);
    ctx.stroke();

    // dish bowl
    ctx.save();
    ctx.rotate(ang);

    ctx.fillStyle = `rgba(18, 26, 36, ${0.92})`;
    ctx.strokeStyle = `rgba(220, 232, 245, ${0.25 + highlight * 0.25})`;
    ctx.lineWidth = 2.4;
    ctx.beginPath();
    ctx.ellipse(0, 0, 26, 12.5, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    // feed arm
    ctx.strokeStyle = `rgba(230, 240, 250, ${0.18 + highlight * 0.22})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(16, -7);
    ctx.stroke();
    ctx.fillStyle = `rgba(255,255,255,${0.15 + highlight * 0.25})`;
    ctx.beginPath();
    ctx.arc(16, -7, 2.4, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();

    // LED
    ctx.fillStyle = `rgba(255, 70, 95, ${0.08 + ledAmt * 0.5})`;
    ctx.beginPath();
    ctx.arc(0, 31, 2.2, 0, Math.PI * 2);
    ctx.fill();

    ctx.restore();
  }

  function render(ctx) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const horizon = h * 0.58;
    const { phase, local } = phaseAt(t);

    // sky
    const sky = ctx.createLinearGradient(0, 0, 0, h);
    sky.addColorStop(0, '#03060f');
    sky.addColorStop(0.55, '#0b1130');
    sky.addColorStop(1, '#1b150f');
    ctx.fillStyle = sky;
    ctx.fillRect(0, 0, w, h);

    // faint milky-band
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    ctx.fillStyle = 'rgba(120, 170, 255, 0.05)';
    ctx.fillRect(0, horizon * 0.12, w, horizon * 0.28);
    ctx.restore();

    // stars
    for (const s of stars) {
      const tw = 0.55 + 0.45 * Math.sin(t * (0.25 + s.s * 0.08) + s.tw);
      const a = s.a * tw;
      const px = (s.x + t * 2.5 * (0.12 + s.s * 0.04)) % (w + 3);
      ctx.fillStyle = `rgba(210, 230, 255, ${a})`;
      ctx.fillRect(px, s.y, s.s, s.s);
    }

    // dunes (parallax)
    drawDune(ctx, dunesFar, 'rgba(20, 18, 24, 0.92)', Math.sin(t * 0.05) * w * 0.006);
    drawDune(ctx, dunesNear, 'rgba(16, 12, 14, 0.96)', Math.sin(t * 0.08) * w * 0.012);

    // scanning sweep (special moment)
    if (phase.name === 'SWEEP') {
      const sweepPos = local / phase.dur;
      const sx = w * (0.08 + 0.84 * sweepPos);
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      ctx.fillStyle = 'rgba(120, 255, 210, 0.08)';
      ctx.fillRect(sx - w * 0.02, 0, w * 0.04, horizon * 0.95);
      ctx.fillStyle = 'rgba(160, 255, 230, 0.12)';
      ctx.fillRect(sx - w * 0.005, 0, w * 0.01, horizon * 0.95);
      ctx.restore();
    }

    // wow glow
    if (wow > 0) {
      const gx = w * (0.25 + 0.5 * Math.sin(t * 0.17 + seed * 0.00001));
      const gy = horizon * (0.3 + 0.18 * Math.sin(t * 0.11));
      const gr = Math.min(w, h) * (0.24 + wow * 0.02);
      const g = ctx.createRadialGradient(gx, gy, 1, gx, gy, gr);
      g.addColorStop(0, `rgba(220, 255, 240, ${0.12 + wow * 0.2})`);
      g.addColorStop(1, 'rgba(220, 255, 240, 0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(gx, gy, gr, 0, Math.PI * 2);
      ctx.fill();
    }

    // dishes
    for (const d of dishes) {
      const depth = d.depth;
      const p = 1 - depth;
      const x = w * (0.1 + 0.8 * d.u) + Math.sin(t * 0.06 + d.u * 10) * w * 0.008 * p;
      const y = horizon + Math.pow(p, 1.7) * h * 0.42;
      const scale = (0.35 + 0.9 * p) * d.size;

      const highlight = (phase.name === 'TRACK' ? 0.25 : 0) + (interference > 0 ? 0.15 : 0) + wow * 0.25;
      drawDish(ctx, x, y, scale, d.a, d.led, highlight);
    }

    // waterfall panel
    const panelW = w * 0.33;
    const panelH = h * 0.26;
    const panelX = w * 0.64;
    const panelY = h * 0.68;

    ctx.save();
    ctx.fillStyle = 'rgba(0, 0, 0, 0.35)';
    ctx.fillRect(panelX, panelY, panelW, panelH);
    ctx.strokeStyle = 'rgba(160, 255, 230, 0.18)';
    ctx.lineWidth = Math.max(1, Math.floor(h / 560));
    ctx.strokeRect(panelX, panelY, panelW, panelH);

    const cellW = panelW / wfCols;
    const cellH = panelH / wfRows;

    for (let r = 0; r < wfRows; r++) {
      const row = (wfRow - r + wfRows) % wfRows;
      const y = panelY + r * cellH;

      for (let c = 0; c < wfCols; c++) {
        const v = wf[row * wfCols + c];
        if (v <= 0.01) continue;

        // Color map: deep blue -> cyan -> green -> warm
        const vv = clamp(v, 0, 1);
        const rr = (vv > 0.7 ? 120 + (vv - 0.7) * 400 : 20 + vv * 90) | 0;
        const gg = (40 + vv * 210) | 0;
        const bb = (80 + (1 - vv) * 90) | 0;

        const a = 0.06 + vv * 0.22 + wow * 0.06;
        ctx.fillStyle = `rgba(${rr},${gg},${bb},${a})`;
        ctx.fillRect(panelX + c * cellW, y, cellW + 0.5, cellH + 0.5);
      }
    }

    // interference lines over waterfall
    if (interference > 0) {
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const lines = 5 + ((interference * 10) | 0);
      for (let i = 0; i < lines; i++) {
        const yy = panelY + (hash01(i + 12.3, (t * 4) | 0) * panelH);
        ctx.fillStyle = `rgba(220,255,245,${0.05 + interference * 0.08})`;
        ctx.fillRect(panelX, yy, panelW, Math.max(1, h / 520));
      }
      ctx.restore();
    }

    ctx.restore();

    // HUD text
    const size = Math.floor(h / 22);
    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.font = `${size}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = 'rgba(170, 255, 235, 0.78)';
    ctx.fillText('DESERT RADIO TELESCOPE ARRAY', w * 0.055, h * 0.12);

    ctx.font = `${Math.floor(size * 0.88)}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
    ctx.fillStyle = 'rgba(170, 255, 235, 0.55)';
    const az = 132 + Math.sin(t * 0.12) * 18;
    const el = 28 + Math.sin(t * 0.18 + 1.7) * 8;
    const tag = `MODE ${phase.name}  AZ ${(az | 0)}°  EL ${(el | 0)}°`;
    ctx.fillText(tag, w * 0.055, h * 0.16);

    if (wow > 0) {
      ctx.fillStyle = `rgba(230, 255, 245, ${0.3 + wow * 0.55})`;
      ctx.fillText('WOW TRANSIENT DETECTED', w * 0.055, h * 0.2);
    } else if (interference > 0.1) {
      ctx.fillStyle = `rgba(255, 220, 210, ${0.22 + interference * 0.55})`;
      ctx.fillText('RFI INTERFERENCE', w * 0.055, h * 0.2);
    }

    ctx.restore();
  }

  function init({ width, height }) {
    sceneInit(width, height);
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
