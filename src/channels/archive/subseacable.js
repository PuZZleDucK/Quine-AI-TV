import { mulberry32, clamp } from '../../util/prng.js';
import { simpleDrone } from '../../util/audio.js';

function lerp(a, b, t){ return a + (b - a) * t; }
function smoothstep(t){ t = clamp(t, 0, 1); return t * t * (3 - 2 * t); }

export function createChannel({ seed, audio }){
  let w = 0;
  let h = 0;
  let dpr = 1;

  let t = 0;
  let loopT = 0;
  let cycle = 0;

  // phase timings (seconds)
  const calmDur = 12.0;
  const trafficDur = 15.0;
  const stormDur = 10.0;
  const faultDur = 9.0;
  const resetDur = 7.0;
  const loopDur = calmDur + trafficDur + stormDur + faultDur + resetDur;

  // scene geometry (recomputed)
  let s = 1;
  let surfaceY = 0;
  let baseDepthY = 0;
  let cablePts = []; // [{x,y,u}]
  let nodes = []; // [{u,x,y,label}]
  let fault = null; // {u0,u1,aIdx,bIdx}

  // pulses
  let pulses = []; // [{u, v, hue, a, life, ttl, storm}]
  let nextPulseAt = 0;
  let nextBurstAt = 0;

  // moments / UI
  let shimmer = 0;
  let nextShimmerAt = 0;
  let faultFlash = 0;

  // audio
  let ambience = null;
  let drone = null;
  let lastBeepAt = -1;

  function prngForCycle(){
    return mulberry32((seed ^ (cycle * 0x9e3779b9)) >>> 0);
  }

  function phaseAt(tt){
    const a = calmDur;
    const b = a + trafficDur;
    const c = b + stormDur;
    const d = c + faultDur;
    if (tt < a) return { name: 'CALM', u: tt / calmDur };
    if (tt < b) return { name: 'TRAFFIC', u: (tt - a) / trafficDur };
    if (tt < c) return { name: 'STORM', u: (tt - b) / stormDur };
    if (tt < d) return { name: 'FAULT', u: (tt - c) / faultDur };
    return { name: 'RESET', u: (tt - d) / resetDur };
  }

  function ptAtU(u){
    if (cablePts.length < 2) return { x: 0, y: 0 };
    u = clamp(u, 0, 1);
    const f = u * (cablePts.length - 1);
    const i = Math.floor(f);
    const a = cablePts[Math.min(cablePts.length - 1, i)];
    const b = cablePts[Math.min(cablePts.length - 1, i + 1)];
    const t = f - i;
    return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
  }

  function ensureScene(){
    const rand = prngForCycle();

    s = Math.min(w, h);
    surfaceY = Math.floor(h * 0.18);
    baseDepthY = Math.floor(h * (0.70 + rand() * 0.04));

    // cable path
    const sag = h * (0.06 + rand() * 0.03);
    const wig = h * (0.012 + rand() * 0.010);
    const freq = 1.2 + rand() * 1.8;
    const ph = rand() * Math.PI * 2;

    cablePts = [];
    const N = 160;
    for (let i = 0; i < N; i++){
      const u = i / (N - 1);
      const x = u * w;
      const y = baseDepthY + Math.sin(u * Math.PI) * sag + Math.sin((u * freq) * Math.PI * 2 + ph) * wig;
      cablePts.push({ x, y, u });
    }

    // repeater nodes
    nodes = [];
    const nodeCount = 8 + ((rand() * 4) | 0);
    for (let i = 0; i < nodeCount; i++){
      const u = clamp(0.08 + (i / (nodeCount - 1)) * 0.84 + (rand() * 2 - 1) * 0.01, 0.02, 0.98);
      const p = ptAtU(u);
      nodes.push({ u, x: p.x, y: p.y, label: `RPT-${String(i + 1).padStart(2, '0')}` });
    }

    // choose a fault segment between two interior nodes
    const k = 2 + ((rand() * Math.max(1, nodeCount - 4)) | 0);
    fault = {
      aIdx: k,
      bIdx: k + 1,
      u0: Math.min(nodes[k].u, nodes[k + 1].u),
      u1: Math.max(nodes[k].u, nodes[k + 1].u),
    };

    // moments
    shimmer = 0;
    nextShimmerAt = 2.2 + rand() * 3.2;
    faultFlash = 0;

    // pulse sched
    pulses = [];
    nextPulseAt = 0.15 + rand() * 0.35;
    nextBurstAt = calmDur + trafficDur + 0.6 + rand() * 1.2;
  }

  function init({ width, height, dpr: dprIn }){
    w = width;
    h = height;
    dpr = dprIn || 1;
    t = 0;
    loopT = 0;
    cycle = 0;
    ensureScene();
  }

  function onResize(width, height, dprIn){
    w = width;
    h = height;
    dpr = dprIn || 1;
    ensureScene();
  }

  function safeBeep(opts){
    if (!audio.enabled) return;
    audio.beep(opts);
  }

  function onAudioOn(){
    if (!audio.enabled) return;

    const n = audio.noiseSource({ type: 'brown', gain: 0.0018 });
    n.start();
    drone = simpleDrone(audio, { root: 55, detune: 0.7, gain: 0.018 });

    ambience = {
      stop(){
        try { n.stop(); } catch {}
        try { drone?.stop?.(); } catch {}
      },
    };

    audio.setCurrent(ambience);
  }

  function onAudioOff(){
    try { ambience?.stop?.(); } catch {}
    ambience = null;
    drone = null;
  }

  function destroy(){ onAudioOff(); }

  function spawnPulse({ u0=0, storm=false } = {}){
    const phase = phaseAt(loopT);
    // deterministic-ish color based on time
    const hue = storm ? 190 : (phase.name === 'CALM' ? 175 : phase.name === 'TRAFFIC' ? 185 : 200);
    const vBase = storm ? (0.22 + 0.12 * Math.sin(t * 0.7)) : (0.16 + 0.05 * Math.sin(t * 0.4));
    pulses.push({
      u: u0,
      v: vBase,
      hue,
      a: storm ? 0.95 : 0.75,
      life: 0,
      ttl: storm ? 3.2 : 5.0,
      storm,
    });
  }

  function update(dt){
    t += dt;
    loopT += dt;

    if (loopT >= loopDur){
      loopT -= loopDur;
      cycle = (cycle + 1) | 0;
      ensureScene();
      if (audio.enabled) safeBeep({ freq: 540, dur: 0.04, gain: 0.01, type: 'sine' });
    }

    const ph = phaseAt(loopT);

    // shimmer moment (a bright pulse wave)
    shimmer = Math.max(0, shimmer - dt * 0.9);
    if (t >= nextShimmerAt){
      shimmer = 1;
      nextShimmerAt = t + (6 + (Math.sin(t * 0.13) * 0.5 + 0.5) * 8);
      if (audio.enabled) safeBeep({ freq: 980, dur: 0.05, gain: 0.008, type: 'triangle' });
    }

    // fault flash during FAULT phase
    faultFlash = Math.max(0, faultFlash - dt * 2.4);
    if (ph.name === 'FAULT'){
      const bump = Math.sin(ph.u * Math.PI * 8);
      if (bump > 0.85) faultFlash = Math.max(faultFlash, 1);
    }

    // pulse scheduling
    while (loopT >= nextPulseAt && pulses.length < 140){
      if (ph.name === 'CALM') {
        spawnPulse({ u0: 0 });
        nextPulseAt += 0.95;
      } else if (ph.name === 'TRAFFIC') {
        spawnPulse({ u0: 0 });
        nextPulseAt += 0.35;
      } else if (ph.name === 'STORM') {
        spawnPulse({ u0: 0, storm: true });
        nextPulseAt += 0.11;
      } else {
        // during fault/reset, keep things quieter
        spawnPulse({ u0: 0 });
        nextPulseAt += 0.65;
      }
    }

    // storm bursts (packet storms)
    if (ph.name === 'STORM' && loopT >= nextBurstAt){
      for (let i = 0; i < 10; i++){
        const u0 = clamp((i / 10) * 0.06, 0, 0.08);
        spawnPulse({ u0, storm: true });
      }
      nextBurstAt += 1.4;
      if (audio.enabled) safeBeep({ freq: 1440, dur: 0.03, gain: 0.008, type: 'square' });
    }

    // advance pulses
    const faultHold = (ph.name === 'FAULT') ? 1 : 0;
    const resetEase = (ph.name === 'RESET') ? smoothstep(ph.u) : 0;

    for (let i = pulses.length - 1; i >= 0; i--){
      const p = pulses[i];
      p.life += dt;

      // slow / damp in fault segment
      let v = p.v;
      if (fault && (faultHold > 0) && p.u >= fault.u0 && p.u <= fault.u1){
        v *= 0.06;
        p.a *= 0.985;
      }
      // gradually restore in reset
      if (fault && (ph.name === 'RESET') && p.u >= fault.u0 && p.u <= fault.u1){
        v = lerp(v * 0.08, v, resetEase);
        p.a = lerp(p.a * 0.6, p.a, resetEase);
      }

      p.u += v * dt;

      if (p.u >= 1.02 || p.life >= p.ttl){
        pulses.splice(i, 1);
        continue;
      }

      // tiny node tick sfx (throttled)
      if (audio.enabled && t - lastBeepAt > 0.065){
        // check if near a node
        for (let k = 0; k < nodes.length; k++){
          const nu = nodes[k].u;
          if (Math.abs(p.u - nu) < 0.0045){
            lastBeepAt = t;
            const f = 900 + k * 22 + (p.storm ? 120 : 0);
            safeBeep({ freq: f, dur: 0.012, gain: p.storm ? 0.0022 : 0.0015, type: 'sine' });
            break;
          }
        }
      }
    }
  }

  function drawBackground(ctx){
    // deep ocean gradient
    const g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#071018');
    g.addColorStop(0.35, '#061624');
    g.addColorStop(1, '#02060c');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    // surface glow band
    ctx.save();
    ctx.globalAlpha = 0.35;
    const sg = ctx.createLinearGradient(0, surfaceY - h * 0.06, 0, surfaceY + h * 0.06);
    sg.addColorStop(0, 'rgba(130,220,255,0)');
    sg.addColorStop(0.5, 'rgba(130,220,255,0.18)');
    sg.addColorStop(1, 'rgba(130,220,255,0)');
    ctx.fillStyle = sg;
    ctx.fillRect(0, surfaceY - h * 0.08, w, h * 0.16);
    ctx.restore();

    // drifting silt particles
    const n = 80;
    ctx.save();
    ctx.globalAlpha = 0.18;
    ctx.fillStyle = 'rgba(220,240,255,0.35)';
    for (let i = 0; i < n; i++){
      const x = (i * 197 + (seed & 1023) * 3 + t * (18 + (i % 7))) % (w + 40) - 20;
      const y = surfaceY + ((i * 83 + ((seed >> 10) & 1023)) % (h - surfaceY));
      const r = 0.6 + ((i % 5) * 0.22);
      ctx.fillRect(x, y, r * dpr, r * dpr);
    }
    ctx.restore();
  }

  function drawSeabed(ctx){
    const top = Math.floor(h * 0.78);
    ctx.save();
    ctx.fillStyle = '#010308';
    ctx.beginPath();
    ctx.moveTo(0, h);
    const steps = 22;
    for (let i = 0; i <= steps; i++){
      const u = i / steps;
      const x = u * w;
      const y = top + Math.sin(u * Math.PI * 2 + (seed % 9)) * h * 0.01 + Math.sin(u * Math.PI * 6 + t * 0.08) * h * 0.006;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();
    ctx.fill();

    // faint fog above seabed
    const fg = ctx.createLinearGradient(0, top - h * 0.06, 0, h);
    fg.addColorStop(0, 'rgba(0,0,0,0)');
    fg.addColorStop(1, 'rgba(0,0,0,0.65)');
    ctx.fillStyle = fg;
    ctx.fillRect(0, top - h * 0.08, w, h * 0.25);

    ctx.restore();
  }

  function drawCable(ctx, ph){
    const inFault = ph.name === 'FAULT' || ph.name === 'RESET';
    const faultAmt = (ph.name === 'FAULT') ? 1 : (ph.name === 'RESET' ? 1 - smoothstep(ph.u) : 0);

    // cable base stroke
    ctx.save();
    ctx.lineJoin = 'round';
    ctx.lineCap = 'round';

    ctx.strokeStyle = 'rgba(18, 38, 54, 0.9)';
    ctx.lineWidth = Math.max(2, s * 0.004);
    ctx.beginPath();
    ctx.moveTo(cablePts[0].x, cablePts[0].y);
    for (let i = 1; i < cablePts.length; i++) ctx.lineTo(cablePts[i].x, cablePts[i].y);
    ctx.stroke();

    // glow pass
    ctx.globalCompositeOperation = 'screen';
    const glowA = 0.18 + shimmer * 0.22;
    ctx.strokeStyle = `rgba(80, 220, 255, ${glowA})`;
    ctx.lineWidth = Math.max(2.5, s * 0.007);
    ctx.stroke();

    // dim fault segment
    if (inFault && fault && faultAmt > 0.01){
      const p0 = ptAtU(fault.u0);
      const p1 = ptAtU(fault.u1);
      ctx.globalCompositeOperation = 'source-over';
      ctx.strokeStyle = `rgba(0,0,0,${0.55 * faultAmt})`;
      ctx.lineWidth = Math.max(3.0, s * 0.010);
      ctx.beginPath();
      ctx.moveTo(p0.x, p0.y);
      // approximate segment by drawing small steps along u
      const segN = 28;
      for (let i = 1; i <= segN; i++){
        const u = lerp(fault.u0, fault.u1, i / segN);
        const p = ptAtU(u);
        ctx.lineTo(p.x, p.y);
      }
      ctx.stroke();

      // isolation rings
      ctx.globalCompositeOperation = 'screen';
      ctx.strokeStyle = `rgba(255, 120, 130, ${0.35 * faultAmt + faultFlash * 0.25})`;
      ctx.lineWidth = Math.max(2, s * 0.006);
      for (const idx of [fault.aIdx, fault.bIdx]){
        const N = nodes[idx];
        const r = Math.max(10, s * 0.028);
        ctx.beginPath();
        ctx.arc(N.x, N.y, r, 0, Math.PI * 2);
        ctx.stroke();
      }
    }

    ctx.restore();
  }

  function drawNodes(ctx, ph){
    const inFault = ph.name === 'FAULT' || ph.name === 'RESET';
    const faultAmt = (ph.name === 'FAULT') ? 1 : (ph.name === 'RESET' ? 1 - smoothstep(ph.u) : 0);

    ctx.save();
    ctx.textBaseline = 'middle';
    ctx.font = `${Math.max(12, Math.floor(s * 0.028))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;

    for (let i = 0; i < nodes.length; i++){
      const n = nodes[i];
      const nearFault = inFault && fault && (i === fault.aIdx || i === fault.bIdx);

      const baseR = Math.max(5, s * 0.012);
      const pulse = 0.5 + 0.5 * Math.sin(t * 1.8 + i);
      const glow = 0.2 + pulse * 0.25 + shimmer * 0.25;

      // node body
      ctx.fillStyle = 'rgba(10, 20, 30, 0.85)';
      ctx.beginPath();
      ctx.arc(n.x, n.y, baseR * 1.2, 0, Math.PI * 2);
      ctx.fill();

      // node glow
      ctx.save();
      ctx.globalCompositeOperation = 'screen';
      const col = nearFault ? `rgba(255, 120, 130, ${0.35 * faultAmt + 0.1})` : `rgba(90, 230, 255, ${glow})`;
      ctx.fillStyle = col;
      ctx.beginPath();
      ctx.arc(n.x, n.y, baseR * (2.2 + pulse * 0.8), 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // tiny label
      ctx.save();
      ctx.globalAlpha = 0.55;
      ctx.fillStyle = 'rgba(190, 235, 255, 0.85)';
      ctx.fillText(n.label, n.x + baseR * 2.2, n.y - baseR * 1.6);
      ctx.restore();
    }

    ctx.restore();
  }

  function drawPulses(ctx, ph){
    const faultAmt = (ph.name === 'FAULT') ? 1 : (ph.name === 'RESET' ? 1 - smoothstep(ph.u) : 0);

    ctx.save();
    ctx.globalCompositeOperation = 'screen';

    for (const p of pulses){
      const pos = ptAtU(p.u);
      let a = p.a;
      let r = Math.max(2, s * (p.storm ? 0.0065 : 0.005));

      // dim in fault segment
      if (fault && faultAmt > 0 && p.u >= fault.u0 && p.u <= fault.u1){
        a *= 0.25 + (1 - faultAmt) * 0.5;
        r *= 0.85;
      }

      const trail = p.storm ? 0.04 : 0.025;
      const back = ptAtU(Math.max(0, p.u - trail));

      ctx.strokeStyle = `hsla(${p.hue}, 90%, 70%, ${a * 0.5})`;
      ctx.lineWidth = Math.max(1.2, r * 0.9);
      ctx.beginPath();
      ctx.moveTo(back.x, back.y);
      ctx.lineTo(pos.x, pos.y);
      ctx.stroke();

      ctx.fillStyle = `hsla(${p.hue}, 95%, 75%, ${a})`;
      ctx.beginPath();
      ctx.arc(pos.x, pos.y, r * (1.0 + shimmer * 0.35), 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  function drawHud(ctx, ph){
    ctx.save();
    ctx.textBaseline = 'top';
    ctx.font = `${Math.max(13, Math.floor(s * 0.032))}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;

    const x = Math.floor(w * 0.06);
    const y = Math.floor(h * 0.06);

    ctx.fillStyle = 'rgba(170, 235, 255, 0.88)';
    ctx.fillText('SUBSEA CABLE PULSE MONITOR', x, y);

    ctx.globalAlpha = 0.75;
    ctx.fillText(`MODE: ${ph.name}`, x, y + Math.floor(s * 0.04));

    // fault banner
    if (ph.name === 'FAULT'){
      const a = 0.45 + 0.35 * (0.5 + 0.5 * Math.sin(t * 6.2));
      ctx.globalAlpha = a;
      ctx.fillStyle = 'rgba(255, 140, 150, 0.95)';
      ctx.fillText('FAULT ISOLATE SEQUENCE', x, y + Math.floor(s * 0.08));
    }

    ctx.restore();
  }

  function render(ctx){
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.clearRect(0, 0, w, h);

    const ph = phaseAt(loopT);

    drawBackground(ctx);
    drawCable(ctx, ph);
    drawPulses(ctx, ph);
    drawNodes(ctx, ph);
    drawSeabed(ctx);
    drawHud(ctx, ph);

    // subtle vignette
    ctx.save();
    const vg = ctx.createRadialGradient(w * 0.5, h * 0.45, Math.min(w, h) * 0.12, w * 0.5, h * 0.55, Math.max(w, h) * 0.7);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,0.55)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, w, h);
    ctx.restore();
  }

  return {
    init,
    onResize,
    update,
    render,
    onAudioOn,
    onAudioOff,
    destroy,
  };
}
