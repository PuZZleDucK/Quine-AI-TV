// REVIEWED: 2026-02-10
import { mulberry32 } from '../util/prng.js';

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);
  let w=0,h=0,t=0;
  let layers=[];
  let drops=[];

  // audio handle (rain/noise bed)
  let ah = null;

  // cached rain sprite (rebuild on resize)
  let rainSprite = null;

  // phase cycle + special moments (seeded, deterministic)
  let phaseCycle = null; // { durs:[quiet,rush,late], total, offset }
  let params = null;     // latest phase params (computed in update)

  let special = null;    // { type:'lightning'|'neon', t0, dur }
  let nextSpecialAt = 0;

  // window-light events: mostly random twinkle, occasional sync pulse, rare wipe
  let lightEvent = null; // { type:'sync'|'wipe', t0, dur, dir }
  let nextLightEventAt = 0;

  function rebuildRainSprite(){
    const lw = Math.max(1, Math.floor(h/720));
    const sw = 32, sh = 64;

    const canvas = (typeof OffscreenCanvas !== 'undefined')
      ? new OffscreenCanvas(sw, sh)
      : (()=>{ const c=document.createElement('canvas'); c.width=sw; c.height=sh; return c; })();

    const rctx = canvas.getContext('2d');
    rctx.clearRect(0,0,sw,sh);
    rctx.strokeStyle = 'rgba(180,220,255,0.18)';
    rctx.lineWidth = lw;
    rctx.lineCap = 'round';

    const ax = Math.floor(sw*0.75);
    const ay = Math.floor(sh*0.8);
    rctx.beginPath();
    rctx.moveTo(ax, ay);
    rctx.lineTo(ax - 10, ay - 26);
    rctx.stroke();

    rainSprite = { canvas, ax, ay };
  }

  // cache per-render gradients (rebuild on resize / ctx swap)
  const gcache = {
    ctx: null,
    w: 0,
    h: 0,
    sky: null,
    moon: null,
    street: null,
    mx: 0,
    my: 0,
    mr: 0,
    streetY: 0,
    streetH: 0,
  };

  function ensureGradients(ctx){
    if (gcache.ctx === ctx && gcache.w === w && gcache.h === h && gcache.sky && gcache.moon && gcache.street) return;
    gcache.ctx = ctx;
    gcache.w = w;
    gcache.h = h;

    // sky
    const g = ctx.createLinearGradient(0,0,0,h);
    g.addColorStop(0,'#03081a');
    g.addColorStop(0.65,'#0a0f2a');
    g.addColorStop(1,'#02010a');
    gcache.sky = g;

    // neon moon
    const mx=w*0.78, my=h*0.22, mr=Math.min(w,h)*0.09;
    gcache.mx = mx;
    gcache.my = my;
    gcache.mr = mr;
    const mg = ctx.createRadialGradient(mx,my,0,mx,my,mr);
    mg.addColorStop(0,'rgba(255,255,255,0.9)');
    mg.addColorStop(0.5,'rgba(108,242,255,0.35)');
    mg.addColorStop(1,'rgba(108,242,255,0.0)');
    gcache.moon = mg;

    // street glow
    const sg = ctx.createLinearGradient(0,h*0.82,0,h);
    sg.addColorStop(0,'rgba(255,75,216,0)');
    sg.addColorStop(0.6,'rgba(255,75,216,0.10)');
    sg.addColorStop(1,'rgba(108,242,255,0.08)');
    gcache.street = sg;
    gcache.streetY = h*0.78;
    gcache.streetH = h*0.22;
  }

  function clamp(x, lo, hi){ return x < lo ? lo : (x > hi ? hi : x); }
  function smoothstep01(x){ x = clamp(x, 0, 1); return x*x*(3 - 2*x); }
  function mix(a,b,u){ return a + (b-a)*u; }

  // fast deterministic 32-bit hash -> [0,1)
  function hash01(x){
    x |= 0;
    x ^= x >>> 16;
    x = Math.imul(x, 0x7feb352d);
    x ^= x >>> 15;
    x = Math.imul(x, 0x846ca68b);
    x ^= x >>> 16;
    return (x >>> 0) / 4294967296;
  }

  // pseudo-random per-window twinkle (avoids the obvious sine “wipe” wave at t≈0)
  function windowRand01(seed, frame, r, c){
    let x = (seed ^ Math.imul(frame, 0x9e3779b9) ^ Math.imul(r, 0x85ebca6b) ^ Math.imul(c, 0xc2b2ae35)) | 0;
    return hash01(x);
  }

  function computePhaseParams(tt){
    if (!phaseCycle){
      return {
        phase: 'quiet',
        rainSpeed: 1,
        rainAlpha: 1,
        wind: 1,
        streetGlow: 1,
        moonAlpha: 1,
        winAlpha: 0.22,
        winThresh: 0.7,
        twinkleSpeed: 0.5,
        titleAlpha: 1,
      };
    }

    const cyc = phaseCycle;
    const [dq, dr, dl] = cyc.durs;
    const total = cyc.total;
    let x = (tt + cyc.offset) % total;

    let idx = 0;
    let u = 0;
    if (x < dq){ idx = 0; u = x / dq; }
    else if (x < dq + dr){ idx = 1; u = (x - dq) / dr; }
    else { idx = 2; u = (x - dq - dr) / dl; }

    const names = ['quiet','rush','late'];

    function base(name){
      if (name === 'quiet'){
        return { rainSpeed:0.78, rainAlpha:0.70, wind:0.90, streetGlow:0.95, moonAlpha:0.98, winAlpha:0.16, winThresh:0.78, twinkleSpeed:0.38, titleAlpha:0.78 };
      }
      if (name === 'rush'){
        return { rainSpeed:1.18, rainAlpha:1.00, wind:1.18, streetGlow:1.10, moonAlpha:0.86, winAlpha:0.28, winThresh:0.65, twinkleSpeed:0.62, titleAlpha:0.88 };
      }
      return { rainSpeed:0.92, rainAlpha:0.82, wind:0.98, streetGlow:0.78, moonAlpha:1.05, winAlpha:0.12, winThresh:0.84, twinkleSpeed:0.30, titleAlpha:0.74 };
    }

    const currName = names[idx];
    const nextName = names[(idx+1)%3];
    const curr = base(currName);
    const next = base(nextName);

    // blend into the next phase near the end of this segment
    const edge = 0.16;
    const blend = u > 1-edge ? smoothstep01((u - (1-edge))/edge) : 0;

    const out = { phase: currName };
    for (const k of Object.keys(curr)) out[k] = mix(curr[k], next[k], blend);
    return out;
  }

  function maybeStartSpecial(){
    if (special || t < nextSpecialAt) return;

    const type = (rand() < 0.55) ? 'neon' : 'lightning';
    special = { type, t0: t, dur: type === 'lightning' ? 0.45 : 1.8 };
    nextSpecialAt = t + (45 + rand()*75);
  }

  function maybeStartLightEvent(){
    if (lightEvent || t < nextLightEventAt) return;

    // Most of the time: normal random twinkle.
    // Occasionally: a global “sync” pulse (threshold shifts together).
    // Rarely: a left→right or right→left “wipe” band.
    const type = (rand() < 0.12) ? 'wipe' : 'sync';
    lightEvent = {
      type,
      t0: t,
      dur: type === 'wipe' ? (2.8 + rand()*2.6) : (1.6 + rand()*2.0),
      dir: rand() < 0.5 ? 1 : -1,
    };

    nextLightEventAt = t + (type === 'wipe' ? (90 + rand()*120) : (24 + rand()*40));
  }

  function init({width,height}){
    w=width; h=height; t=0;
    gcache.ctx = null;
    layers = [0.35, 0.55, 0.8].map((depth,i)=>makeLayer(depth,i));
    drops = Array.from({length: 520}, ()=>({
      x: rand()*w,
      y: rand()*h,
      sp: (600 + rand()*1200) * (h/540),
      a: 0.05 + rand()*0.12,
    }));

    rainSprite = null;
    rebuildRainSprite();

    // seeded phase cycle (2–4 min total)
    const quiet = 55 + rand()*35;
    const rush = 55 + rand()*35;
    const late = 55 + rand()*45;
    const total = quiet + rush + late;
    phaseCycle = { durs: [quiet, rush, late], total, offset: rand()*total };
    params = computePhaseParams(0);

    // rare special moments every ~45–120s
    special = null;
    nextSpecialAt = 45 + rand()*75;

    // window-light events
    lightEvent = null;
    nextLightEventAt = 18 + rand()*35;
  }

  function makeLayer(depth, i){
    const buildings=[];
    let x=0;
    while (x < w + 100){
      const bw = (40 + rand()*140) * (w/960);
      const bh = (h*(0.25 + rand()*0.55)) * depth;
      buildings.push({x, w:bw, h:bh, winSeed: (Math.floor(rand()*4294967296)>>>0)});
      x += bw + (10+rand()*30)*(w/960);
    }
    const shade = Math.floor(mix(26, 4, depth));
    const fillStyle = `rgb(${shade},${shade},${shade})`;
    return {depth, buildings, hue: 220 + i*15, fillStyle};
  }

  function onResize(width,height){ w=width; h=height; init({width,height}); }

  function makeAudioHandle(){
    const ctx = audio.ensure();

    // use a dedicated gain so we can fade cleanly on stop()
    const out = ctx.createGain();
    out.gain.value = 0.9;
    out.connect(audio.master);

    // gentle filtered pink-noise “rain” bed
    const n = audio.noiseSource({ type: 'pink', gain: 0.045 });

    const hpf = ctx.createBiquadFilter();
    hpf.type = 'highpass';
    hpf.frequency.value = 260;
    hpf.Q.value = 0.7;

    const lpf = ctx.createBiquadFilter();
    lpf.type = 'lowpass';
    lpf.frequency.value = 1800;
    lpf.Q.value = 0.9;

    // reroute noise: src -> gain -> filters -> out (disconnect default master route)
    try { n.gain.disconnect(); } catch {}
    try { n.src.disconnect(); } catch {}
    n.src.connect(n.gain);
    n.gain.connect(hpf);
    hpf.connect(lpf);
    lpf.connect(out);

    n.start();

    return {
      stop(){
        const now = ctx.currentTime;
        try { out.gain.setTargetAtTime(0.0001, now, 0.10); } catch {}
        try { n.stop(); } catch {}
      }
    };
  }

  function stopAudio({ clearCurrent=false } = {}){
    const handle = ah;
    const isCurrent = audio.current === handle;

    if (clearCurrent && isCurrent){
      // clears audio.current and stops via handle.stop()
      audio.stopCurrent();
    } else {
      try { handle?.stop?.(); } catch {}
    }

    ah = null;
  }

  function onAudioOn(){
    if (!audio.enabled) return;

    // defensively stop any existing rain/noise we started (prevents stacking)
    stopAudio({ clearCurrent: true });

    const handle = makeAudioHandle();
    ah = handle;
    audio.setCurrent(handle);
  }

  function onAudioOff(){
    // stop/clear everything we own; only clear AudioManager.current if it's ours
    stopAudio({ clearCurrent: true });
  }

  function destroy(){
    stopAudio({ clearCurrent: true });
  }

  function update(dt){
    t += dt;

    params = computePhaseParams(t);
    maybeStartSpecial();
    maybeStartLightEvent();

    if (special && (t - special.t0) > special.dur) special = null;
    if (lightEvent && (t - lightEvent.t0) > lightEvent.dur) lightEvent = null;

    const rainSpeed = params?.rainSpeed ?? 1;
    const wind = params?.wind ?? 1;

    for (const d of drops){
      d.y += d.sp*dt*rainSpeed;
      d.x += dt*(80*(w/960))*wind;
      if (d.y > h){ d.y = -10; d.x = rand()*w; }
      if (d.x > w) d.x = 0;
    }
  }

  function render(ctx){
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,w,h);

    ensureGradients(ctx);

    const p = params || computePhaseParams(t);

    // special moment modifiers
    let neonMul = 1;
    let flashAlpha = 0;
    if (special){
      const age = t - special.t0;
      if (special.type === 'neon'){
        neonMul = clamp(0.35 + 0.65*(0.5 + 0.5*Math.sin(age*28)*Math.sin(age*9.3)), 0.2, 1.0);
      } else if (special.type === 'lightning'){
        const p1 = Math.max(0, 1 - Math.abs(age - 0.08)/0.08);
        const p2 = Math.max(0, 1 - Math.abs(age - 0.22)/0.06);
        flashAlpha = 0.55*p1 + 0.35*p2;
      }
    }

    // sky
    ctx.fillStyle = gcache.sky;
    ctx.fillRect(0,0,w,h);

    // neon moon
    ctx.save();
    ctx.globalAlpha = (p.moonAlpha ?? 1) + flashAlpha*0.35;
    ctx.fillStyle = gcache.moon;
    ctx.beginPath();
    ctx.arc(gcache.mx,gcache.my,gcache.mr,0,Math.PI*2);
    ctx.fill();
    ctx.restore();

    // buildings
    const baseY = h*0.92;
    for (const layer of layers){
      // silhouettes (opaque; avoid per-building style allocations)
      ctx.save();
      ctx.fillStyle = layer.fillStyle || '#000';
      for (const b of layer.buildings){
        const topY = baseY - b.h;
        ctx.fillRect(b.x, topY, b.w, b.h);
      }
      ctx.restore();

      // windows
      // Default: random twinkle. Occasionally sync (global pulse) and rarely a wipe band across x.
      const le = lightEvent;
      const leAge = le ? (t - le.t0) : 0;
      const leU = le ? clamp(leAge / le.dur, 0, 1) : 0;
      const syncPulse = (le && le.type === 'sync') ? (0.5 + 0.5*Math.sin(leAge * 8.5)) : 0;
      const wipeCenter = (le && le.type === 'wipe') ? (le.dir > 0 ? leU : (1 - leU)) : -10;

      const twSpeed = (p.twinkleSpeed ?? 0.5);
      const twFrame = Math.floor(t * (0.8 + twSpeed*2.8));
      let winThreshBase = (p.winThresh ?? 0.7);
      let winAlpha = (p.winAlpha ?? 0.22);
      if (syncPulse > 0){
        winThreshBase = mix(winThreshBase, 0.18, syncPulse);
        winAlpha *= mix(0.7, 1.4, syncPulse);
      }

      ctx.save();
      ctx.fillStyle = 'rgb(255,200,120)';
      ctx.globalAlpha = winAlpha;
      for (const b of layer.buildings){
        const topY = baseY - b.h;
        const cols = Math.max(2, Math.floor(b.w/18));
        const rows = Math.max(3, Math.floor(b.h/22));
        const ww = b.w/(cols+1);
        const wh = b.h/(rows+1);
        for (let r=1;r<=rows;r++){
          for (let c=1;c<=cols;c++){
            let thresh = winThreshBase;
            if (wipeCenter >= 0){
              const xNorm = (b.x + c*ww) / w;
              const band = smoothstep01(1 - Math.abs(xNorm - wipeCenter) / 0.18);
              thresh = Math.max(0.02, thresh - band*0.52);
            }
            const tw = windowRand01(b.winSeed, twFrame, r, c);
            if (tw <= thresh) continue;
            const x = b.x + c*ww;
            const y = topY + r*wh;
            ctx.fillRect(x,y, ww*0.35, wh*0.35);
          }
        }
      }
      ctx.restore();
    }

    // street glow
    ctx.save();
    ctx.globalAlpha = (p.streetGlow ?? 1) * neonMul;
    ctx.fillStyle = gcache.street;
    ctx.fillRect(0,gcache.streetY,w,gcache.streetH);
    ctx.restore();

    // rain (sprite blit: avoids per-drop beginPath+stroke)
    ctx.save();
    if (!rainSprite) rebuildRainSprite();
    for (const d of drops){
      ctx.globalAlpha = d.a * (p.rainAlpha ?? 1);
      ctx.drawImage(rainSprite.canvas, d.x - rainSprite.ax, d.y - rainSprite.ay);
    }
    ctx.restore();

    // lightning flash overlay
    if (flashAlpha > 0){
      ctx.save();
      ctx.globalAlpha = flashAlpha;
      ctx.fillStyle = 'rgb(240,252,255)';
      ctx.fillRect(0,0,w,h);
      ctx.restore();
    }

    // title
    ctx.save();
    ctx.globalAlpha = (p.titleAlpha ?? 1) * neonMul;
    ctx.font = `${Math.floor(h/18)}px ui-sans-serif, system-ui`;
    ctx.fillStyle = 'rgba(231,238,246,0.75)';
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 10;
    ctx.fillText('PIXEL CITY NIGHTS', w*0.05, h*0.12);
    ctx.restore();
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
