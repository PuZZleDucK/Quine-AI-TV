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
  }

  function makeLayer(depth, i){
    const buildings=[];
    let x=0;
    while (x < w + 100){
      const bw = (40 + rand()*140) * (w/960);
      const bh = (h*(0.25 + rand()*0.55)) * depth;
      buildings.push({x, w:bw, h:bh, winSeed: rand()*999});
      x += bw + (10+rand()*30)*(w/960);
    }
    return {depth, buildings, hue: 220 + i*15};
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
    for (const d of drops){
      d.y += d.sp*dt;
      d.x += dt*(80*(w/960));
      if (d.y > h){ d.y = -10; d.x = rand()*w; }
      if (d.x > w) d.x = 0;
    }
  }

  function render(ctx){
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,w,h);

    ensureGradients(ctx);

    // sky
    ctx.fillStyle = gcache.sky;
    ctx.fillRect(0,0,w,h);

    // neon moon
    ctx.fillStyle = gcache.moon;
    ctx.beginPath(); ctx.arc(gcache.mx,gcache.my,gcache.mr,0,Math.PI*2); ctx.fill();

    // buildings
    const baseY = h*0.92;
    for (const layer of layers){
      const buildingAlpha = 0.22 + 0.6*layer.depth;

      // silhouettes (avoid per-building rgba string allocations)
      ctx.save();
      ctx.fillStyle = '#000';
      ctx.globalAlpha = buildingAlpha;
      for (const b of layer.buildings){
        const topY = baseY - b.h;
        ctx.fillRect(b.x, topY, b.w, b.h);
      }
      ctx.restore();

      // windows
      ctx.save();
      ctx.fillStyle = 'rgb(255,200,120)';
      ctx.globalAlpha = 0.22;
      for (const b of layer.buildings){
        const topY = baseY - b.h;
        const cols = Math.max(2, Math.floor(b.w/18));
        const rows = Math.max(3, Math.floor(b.h/22));
        const ww = b.w/(cols+1);
        const wh = b.h/(rows+1);
        for (let r=1;r<=rows;r++){
          for (let c=1;c<=cols;c++){
            const tw = Math.sin(t*0.5 + b.winSeed + r*0.7 + c*0.9);
            if (tw <= 0.7) continue;
            const x = b.x + c*ww;
            const y = topY + r*wh;
            ctx.fillRect(x,y, ww*0.35, wh*0.35);
          }
        }
      }
      ctx.restore();
    }

    // street glow
    ctx.fillStyle = gcache.street;
    ctx.fillRect(0,gcache.streetY,w,gcache.streetH);

    // rain (sprite blit: avoids per-drop beginPath+stroke)
    ctx.save();
    if (!rainSprite) rebuildRainSprite();
    for (const d of drops){
      ctx.globalAlpha = d.a;
      ctx.drawImage(rainSprite.canvas, d.x - rainSprite.ax, d.y - rainSprite.ay);
    }
    ctx.restore();

    // title
    ctx.save();
    ctx.font = `${Math.floor(h/18)}px ui-sans-serif, system-ui`;
    ctx.fillStyle = 'rgba(231,238,246,0.75)';
    ctx.shadowColor = 'rgba(0,0,0,0.7)';
    ctx.shadowBlur = 10;
    ctx.fillText('PIXEL CITY NIGHTS', w*0.05, h*0.12);
    ctx.restore();
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
