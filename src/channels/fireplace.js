import { mulberry32 } from '../util/prng.js';

// REVIEWED: 2026-02-10 (screenshots: screenshots/review-fire)
export function createChannel({ seed, audio }){
  const seedU = (seed == null ? 1 : seed) >>> 0;
  const rand = mulberry32(seedU);

  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, u) => a + (b - a) * u;
  const smoothstep = (a, b, x) => {
    const t = clamp((x - a) / (b - a), 0, 1);
    return t * t * (3 - 2 * t);
  };

  // Time-structure (calm → roaring → embers), deterministic per seed.
  // Use a separate PRNG so we don't perturb the channel's other randomness.
  const phaseCfg = (() => {
    const r = mulberry32((seedU ^ 0x00f1a5e) >>> 0);
    const total = 120 + r() * 120; // 2–4 minutes
    const w1 = 0.8 + r() * 0.7; // calm
    const w2 = 1.0 + r() * 0.9; // roaring
    const w3 = 0.6 + r() * 0.7; // embers
    const sum = w1 + w2 + w3;
    const calm = total * (w1 / sum);
    const roar = total * (w2 / sum);
    const embers = Math.max(15, total - calm - roar);
    const roarPeak = 1.0 + r() * 0.25;
    return { calm, roar, embers, total: calm + roar + embers, roarPeak };
  })();

  function phaseState(time){
    const u = ((time % phaseCfg.total) + phaseCfg.total) % phaseCfg.total;
    if (u < phaseCfg.calm) return { name: 'calm', p: u / phaseCfg.calm };
    if (u < phaseCfg.calm + phaseCfg.roar) return { name: 'roar', p: (u - phaseCfg.calm) / phaseCfg.roar };
    return { name: 'embers', p: (u - phaseCfg.calm - phaseCfg.roar) / phaseCfg.embers };
  }

  function heatAt(time){
    const { name, p } = phaseState(time);
    if (name === 'calm') return lerp(0.35, 0.55, smoothstep(0, 1, p));
    if (name === 'roar') return lerp(0.80, phaseCfg.roarPeak, smoothstep(0, 0.35, p));
    return lerp(0.50, 0.18, smoothstep(0, 1, p));
  }

  const MAX_SPARKS = 240;

  let w=0,h=0,t=0;
  let sparks=[];
  let activeSparks=0;
  let prevActiveSparks=0;
  let noiseHandle=null; // audio.noiseSource handle
  let audioHandle=null; // {stop()}
  let nextPop=0;

  // Rare special moments (seeded; ~45–120s): log shift + ember burst OR gust flare.
  // Use separate PRNGs so we don't perturb the channel's base randomness or the schedule while emitting sparks.
  const eventScheduleR = mulberry32((seedU ^ 0x9e3779b9) >>> 0);
  const eventEmitR = mulberry32((seedU ^ 0x243f6a88) >>> 0);
  let nextEventAt = 55 + eventScheduleR() * 55; // 55–110s from start
  let moment = null; // {type, t0, dur, dir}
  let logShift = 0; // 0..1 envelope
  let gust = 0; // 0..1 envelope
  let burstUntil = 0;
  let burstRate = 0; // sparks/sec
  let burstEmit = 0;

  // Perf: cache the static background/hearth and pre-render log sprites.
  // (The flame + sparks are still dynamic.)
  let staticLayer=null; // CanvasImageSource | false | null
  let logSprites=null; // [{c,w,h,angle}] | null
  let sparkSprites=null; // Map<radiusPx:number, CanvasImageSource> | null

  function sparkCountForHeat(heat){
    const u = clamp(heat / phaseCfg.roarPeak, 0, 1);
    const min = Math.max(24, Math.round(MAX_SPARKS * 0.25));
    return clamp(Math.round(lerp(min, MAX_SPARKS, u)), min, MAX_SPARKS);
  }

  function makeCanvas(W,H){
    let c = null;
    if (typeof OffscreenCanvas !== 'undefined') c = new OffscreenCanvas(W,H);
    else if (typeof document !== 'undefined'){
      const el = document.createElement('canvas');
      el.width = W; el.height = H;
      c = el;
    }
    return c;
  }

  function rebuildStatic(){
    // Background + hearth layer
    const bgc = makeCanvas(w,h);
    if (!bgc){
      staticLayer = false;
      logSprites = null;
      return;
    }
    const g = bgc.getContext('2d');
    g.setTransform(1,0,0,1,0,0);
    g.clearRect(0,0,w,h);

    const bg = g.createLinearGradient(0,0,0,h);
    bg.addColorStop(0,'#05030a');
    bg.addColorStop(1,'#000000');
    g.fillStyle = bg;
    g.fillRect(0,0,w,h);

    g.fillStyle = 'rgba(30,20,18,0.9)';
    g.fillRect(w*0.18,h*0.78,w*0.64,h*0.16);

    staticLayer = bgc;

    // Logs as sprites (avoid re-ellipsing every frame; also keeps render() gradient-free here).
    logSprites = [];
    const rx = w*0.12;
    const ry = h*0.035;
    const sw = Math.max(1, Math.ceil(rx*2 + 6));
    const sh = Math.max(1, Math.ceil(ry*2 + 6));
    for (let i=0;i<3;i++){
      const c = makeCanvas(sw, sh);
      if (!c){ logSprites = null; break; }
      const lg = c.getContext('2d');
      lg.setTransform(1,0,0,1,0,0);
      lg.clearRect(0,0,sw,sh);
      lg.fillStyle = 'rgba(45,30,20,1)';
      const ang = 0.25*Math.sin(i);
      lg.beginPath();
      lg.ellipse(sw/2, sh/2, rx, ry, ang, 0, Math.PI*2);
      lg.fill();
      logSprites.push({ c, w: sw, h: sh });
    }
  }

  const SPARK_R_STEP = 2; // px
  function bucketSparkRadiusPx(radiusPx){
    const r = Math.max(2, radiusPx|0);
    return Math.max(2, Math.round(r / SPARK_R_STEP) * SPARK_R_STEP);
  }

  function clearSparkSprites(){ sparkSprites = null; }

  function warmSparkSprites(){
    // Build once per resize so render() remains gradient-free in steady-state.
    const scale = (h/540);
    const minR = bucketSparkRadiusPx(Math.round(10*scale)); // ~= 1*10
    const maxR = bucketSparkRadiusPx(Math.round(50*scale)); // ~= 5*10
    for (let r=minR; r<=maxR; r+=SPARK_R_STEP) getSparkSprite(r);
  }

  function getSparkSprite(radiusPx){
    const r = bucketSparkRadiusPx(radiusPx);
    if (!sparkSprites) sparkSprites = new Map();
    const hit = sparkSprites.get(r);
    if (hit) return hit;

    const size = r*2 + 4;
    const c = makeCanvas(size, size);
    if (!c) return null;
    const g = c.getContext('2d');
    g.setTransform(1,0,0,1,0,0);
    g.clearRect(0,0,size,size);

    const cx = size/2, cy = size/2;
    const grad = g.createRadialGradient(cx, cy, 0, cx, cy, r);
    grad.addColorStop(0, 'rgba(255,220,150,0.95)');
    grad.addColorStop(0.35, 'rgba(255,150,60,0.35)');
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.fillStyle = grad;
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI*2);
    g.fill();

    sparkSprites.set(r, c);
    return c;
  }

  function init({width,height}){
    w=width; h=height; t=0;
    rebuildStatic();
    clearSparkSprites();

    const heat0 = heatAt(0);
    sparks = Array.from({length: MAX_SPARKS}, () => makeSpark(true, heat0));
    activeSparks = sparkCountForHeat(heat0);
    prevActiveSparks = activeSparks;

    warmSparkSprites();
    nextPop = 0.6;
  }

  function makeSpark(reset=false, heat=0.6){
    const hn = clamp(heat / phaseCfg.roarPeak, 0, 1);
    const kVy = lerp(0.75, 1.25, hn);
    const kR = lerp(0.85, 1.15, hn);
    const kLife = lerp(0.9, 1.1, hn);

    const baseX = w*0.5 + (rand()*2-1)*w*0.12;
    return {
      x: baseX,
      y: reset ? h*(0.86 + rand()*0.1) : rand()*h,
      vx: (rand()*2-1)*40*(w/960),
      vy: -(60+rand()*260)*(h/540)*kVy,
      r: (1+rand()*4)*(h/540)*kR,
      life: (0.3 + rand()*1.2)*kLife,
      max: (0.3 + rand()*1.2)*kLife,
      hue: 20 + rand()*40,
    };
  }

  function startBurst(time, heat, intensity, duration){
    // intensity: 0..1
    burstUntil = Math.max(burstUntil, time + duration);
    const hn = clamp(heat / phaseCfg.roarPeak, 0, 1);
    const base = lerp(35, 120, hn);
    burstRate = base * lerp(0.55, 1.4, clamp(intensity, 0, 1));
  }

  function injectBurstSpark(heat){
    if (activeSparks <= 0) return;
    const i = Math.min(activeSparks - 1, Math.floor(eventEmitR() * activeSparks));
    const hn = clamp(heat / phaseCfg.roarPeak, 0, 1);

    const baseX = w*0.5 + (eventEmitR()*2-1)*w*0.10;
    const life = 0.22 + eventEmitR()*0.55;
    const kVy = lerp(1.15, 1.9, hn);
    const kR = lerp(0.8, 1.05, hn);

    sparks[i] = {
      x: baseX,
      y: h*(0.83 + eventEmitR()*0.06),
      vx: (eventEmitR()*2-1)*90*(w/960),
      vy: -(220 + eventEmitR()*520)*(h/540)*kVy,
      r: (0.9+eventEmitR()*3.0)*(h/540)*kR,
      life,
      max: life,
      hue: 18 + eventEmitR()*55,
    };
  }

  function onResize(width,height){ w=width; h=height; rebuildStatic(); clearSparkSprites(); warmSparkSprites(); }

  function onAudioOn(){
    if (!audio.enabled) return;

    // Defensive hygiene: if called twice while audio is on, avoid stacking sources.
    onAudioOff();

    const hdl = audio.noiseSource({type:'brown', gain:0.02});
    hdl.start();
    noiseHandle = hdl;

    audioHandle = {
      stop(){
        try { hdl.stop?.(); } catch {}
        if (noiseHandle === hdl) noiseHandle = null;
      },
    };
    audio.setCurrent(audioHandle);
  }

  function onAudioOff(){
    // Stop the source we started.
    try { noiseHandle?.stop?.(); } catch {}
    noiseHandle = null;

    // If our handle is still registered as current, clear it.
    try {
      if (audio.current === audioHandle) audio.stopCurrent();
      else audioHandle?.stop?.();
    } catch {}
    audioHandle = null;
  }

  function destroy(){ onAudioOff(); }

  function update(dt){
    t += dt;

    const heat = heatAt(t);

    // Trigger rare seeded moments.
    if (!moment && t >= nextEventAt){
      const pick = eventScheduleR();
      const type = (pick < 0.6 ? 'logShift' : 'gust');
      const dur = (type === 'logShift')
        ? (1.8 + eventScheduleR() * 1.6)
        : (1.1 + eventScheduleR() * 0.9);
      const dir = eventScheduleR() < 0.5 ? -1 : 1;
      moment = { type, t0: t, dur, dir };

      if (type === 'logShift'){
        startBurst(t, heat, 0.9, 0.7 + eventScheduleR()*0.9);
      } else {
        startBurst(t, heat, 0.6, 0.35 + eventScheduleR()*0.45);
      }

      nextEventAt = t + (45 + eventScheduleR() * 75);
    }

    // Update moment envelopes.
    logShift = 0;
    gust = 0;
    if (moment){
      const u = (t - moment.t0) / Math.max(0.001, moment.dur);
      if (u >= 1){
        moment = null;
      } else {
        const env = Math.sin(Math.PI * clamp(u, 0, 1));
        if (moment.type === 'logShift') logShift = env;
        else gust = env;
      }
    }

    activeSparks = sparkCountForHeat(heat);
    if (activeSparks > prevActiveSparks){
      for (let i=prevActiveSparks; i<activeSparks; i++) sparks[i] = makeSpark(true, heat);
    }
    prevActiveSparks = activeSparks;

    // Ember burst emission (injects a few short-lived sparks).
    if (t < burstUntil && activeSparks > 0){
      burstEmit += dt * burstRate;
      while (burstEmit >= 1){
        injectBurstSpark(heat);
        burstEmit -= 1;
      }
    } else {
      burstEmit = 0;
    }

    for (let i=0;i<activeSparks;i++){
      const s = sparks[i];
      s.life -= dt;
      s.x += s.vx*dt;
      s.y += s.vy*dt;
      s.vy += 220*dt*(h/540);
      if (s.life <= 0 || s.y < h*0.2){
        sparks[i] = makeSpark(true, heat);
      }
    }

    nextPop -= dt;
    if (nextPop <= 0){
      const hn = clamp(heat / phaseCfg.roarPeak, 0, 1);
      nextPop = (0.25 + rand()*0.8) * lerp(1.15, 0.65, hn);
      if (audio.enabled) audio.beep({freq: 120 + rand()*200, dur: 0.03, gain: 0.015, type:'square'});
    }
  }

  function render(ctx){
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,w,h);

    const heat = heatAt(t);
    const hn = clamp(heat / phaseCfg.roarPeak, 0, 1);

    // background + hearth (cached layer)
    if (staticLayer && staticLayer !== false) ctx.drawImage(staticLayer, 0, 0);
    else {
      const bg = ctx.createLinearGradient(0,0,0,h);
      bg.addColorStop(0,'#05030a');
      bg.addColorStop(1,'#000000');
      ctx.fillStyle = bg;
      ctx.fillRect(0,0,w,h);

      ctx.fillStyle = 'rgba(30,20,18,0.9)';
      ctx.fillRect(w*0.18,h*0.78,w*0.64,h*0.16);
    }

    // logs (cached sprites)
    const shiftDir = (moment && moment.type === 'logShift') ? moment.dir : 1;
    const shiftPx = w * 0.018 * logShift * shiftDir;
    if (logSprites){
      for (let i=0;i<3;i++){
        const spr = logSprites[i];
        const x = w*(0.32 + i*0.12) + shiftPx*(i-1)*0.65;
        const y = h*(0.84 + Math.sin(t*0.3+i)*0.005) + Math.abs(shiftPx)*0.08*(0.5 - Math.abs(i-1));
        ctx.drawImage(spr.c, x - spr.w/2, y - spr.h/2);
      }
    } else {
      ctx.save();
      ctx.fillStyle = 'rgba(45,30,20,1)';
      for (let i=0;i<3;i++){
        const x = w*(0.32 + i*0.12) + shiftPx*(i-1)*0.65;
        const y = h*(0.84 + Math.sin(t*0.3+i)*0.005) + Math.abs(shiftPx)*0.08*(0.5 - Math.abs(i-1));
        ctx.beginPath();
        ctx.ellipse(x,y,w*0.12,h*0.035, 0.25*Math.sin(i), 0, Math.PI*2);
        ctx.fill();
      }
      ctx.restore();
    }

    // flame body (layered shapes; additive blend)
    const fx = w*0.5;
    const baseY = h*0.84;
    const heightScale = lerp(0.65, 1.25, hn) * (1 + 0.26*gust);
    const widthScale = lerp(0.75, 1.15, hn) * (1 + 0.18*gust);
    const swayScale = lerp(0.6, 1.35, hn) * (1 + 0.42*gust);
    const flameSpeed = lerp(0.9, 1.55, hn) * (1 + 0.30*gust);
    const flareK = 1 + 0.55*gust;

    const hot = smoothstep(0.15, 1.0, hn);
    const midG = Math.round(lerp(150, 205, hot));
    const midB = Math.round(lerp(55, 115, hot));
    const coreG = Math.round(lerp(210, 245, hot));
    const coreB = Math.round(lerp(120, 205, hot));

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';

    // subtle blue base (gas-flame hint)
    const blueA = (0.05 + 0.05*hn) * (1 + 0.25*gust);
    if (blueA > 0){
      const bw = w*0.055 * widthScale;
      const bh = h*0.075 * heightScale;
      const bx = fx + Math.sin(t*2.1)*w*0.006*swayScale;
      const by = baseY - bh*0.15;
      const bg = ctx.createLinearGradient(bx, by, bx, by - bh);
      bg.addColorStop(0, `rgba(80,170,255,${blueA})`);
      bg.addColorStop(0.7, `rgba(120,210,255,${blueA*0.35})`);
      bg.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = bg;
      ctx.beginPath();
      ctx.moveTo(bx - bw, by);
      ctx.quadraticCurveTo(bx - bw*0.55, by - bh*0.55, bx, by - bh);
      ctx.quadraticCurveTo(bx + bw*0.55, by - bh*0.55, bx + bw, by);
      ctx.closePath();
      ctx.fill();
    }

    for (let i=0;i<5;i++){
      const amp = (0.018 + i*0.01) * swayScale;
      const sway = Math.sin(t*1.2*flameSpeed + i)*w*amp;
      const height = h*(0.22 + i*0.03) * heightScale;
      const width = w*(0.085 + i*0.021) * widthScale;
      const wob = 1 + 0.08*Math.sin(t*(2.6+i*0.7)*flameSpeed + i*3.2);

      const wl = width * (1.0 + i*0.06) * wob;
      const x0 = fx + sway;
      const xTip = fx + sway*0.35;
      const yTip = baseY - height;
      const yShoulder = baseY - height*0.55;

      const a0 = Math.min(0.62, (0.18 + (4-i)*0.035) * flareK);
      const a1 = Math.min(0.56, (0.22 - i*0.028) * flareK);

      const g = ctx.createLinearGradient(x0, baseY, xTip, yTip);
      g.addColorStop(0, `rgba(255,${midG},${midB},${a1})`);
      g.addColorStop(0.35, `rgba(255,${coreG},${coreB},${a0})`);
      g.addColorStop(0.9, `rgba(255,${coreG},${coreB},${a0*0.22})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;

      ctx.beginPath();
      ctx.moveTo(x0 - wl, baseY);
      ctx.quadraticCurveTo(x0 - wl*0.85, yShoulder, xTip, yTip);
      ctx.quadraticCurveTo(x0 + wl*0.85, yShoulder, x0 + wl, baseY);
      ctx.closePath();
      ctx.fill();

      // inner core
      const inner = 0.52 - i*0.07;
      if (inner > 0.18){
        const iw = wl*inner;
        const ih = height*(0.62 + 0.06*i);
        const iyTip = baseY - ih;
        const ia = (0.11 + 0.11*hn) * (1 - i*0.15) * flareK;
        const ig = ctx.createLinearGradient(x0, baseY, xTip, iyTip);
        ig.addColorStop(0, `rgba(255,${coreG},${coreB},${ia})`);
        ig.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = ig;
        ctx.beginPath();
        ctx.moveTo(x0 - iw, baseY);
        ctx.quadraticCurveTo(x0 - iw*0.6, baseY - ih*0.55, xTip, iyTip);
        ctx.quadraticCurveTo(x0 + iw*0.6, baseY - ih*0.55, x0 + iw, baseY);
        ctx.closePath();
        ctx.fill();
      }
    }

    ctx.restore();

    // sparks (perf: cached sprites; no per-spark gradients)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (let i=0;i<activeSparks;i++){
      const s = sparks[i];
      const a = Math.max(0, s.life/s.max);
      const alpha = (0.10 + 0.30*a) * lerp(0.65, 1.15, hn);
      if (alpha <= 0) continue;

      const rPx = bucketSparkRadiusPx(Math.round(s.r*10));
      const spr = getSparkSprite(rPx);
      if (!spr) continue;

      ctx.globalAlpha = alpha;
      // sprite canvas is (r*2+4); draw centered
      const size = rPx*2 + 4;
      ctx.drawImage(spr, s.x - size/2, s.y - size/2);
    }
    ctx.restore();

    // warm glow
    const glowA = 0.06 + 0.16*hn + 0.05*gust + 0.03*logShift;
    const wg = ctx.createRadialGradient(fx,baseY, 0, fx,baseY, Math.max(w,h)*0.6);
    wg.addColorStop(0,`rgba(255,140,60,${glowA})`);
    wg.addColorStop(1,'rgba(0,0,0,0)');
    ctx.fillStyle = wg;
    ctx.fillRect(0,0,w,h);

    // title
    ctx.save();
    ctx.font = `${Math.floor(h/18)}px ui-serif, Georgia, serif`;
    ctx.fillStyle = 'rgba(255,220,170,0.8)';
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 10;
    ctx.fillText('COZY FIREPLACE', w*0.05, h*0.12);
    ctx.restore();
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
