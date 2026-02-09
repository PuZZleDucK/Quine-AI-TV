import { mulberry32 } from '../util/prng.js';

// REVIEWED: 2026-02-10 (screenshots: screenshots/review-fire)
export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);
  let w=0,h=0,t=0;
  let sparks=[];
  let noiseHandle=null; // audio.noiseSource handle
  let audioHandle=null; // {stop()}
  let nextPop=0;

  // Perf: cache the static background/hearth and pre-render log sprites.
  // (The flame + sparks are still dynamic.)
  let staticLayer=null; // CanvasImageSource | false | null
  let logSprites=null; // [{c,w,h,angle}] | null
  let sparkSprites=null; // Map<radiusPx:number, CanvasImageSource> | null

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
    sparks = Array.from({length: 240}, () => makeSpark(true));
    warmSparkSprites();
    nextPop = 0.6;
  }

  function makeSpark(reset=false){
    const baseX = w*0.5 + (rand()*2-1)*w*0.12;
    return {
      x: baseX,
      y: reset ? h*(0.86 + rand()*0.1) : rand()*h,
      vx: (rand()*2-1)*40*(w/960),
      vy: -(60+rand()*260)*(h/540),
      r: (1+rand()*4)*(h/540),
      life: 0.3 + rand()*1.2,
      max: 0.3 + rand()*1.2,
      hue: 20 + rand()*40,
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
    for (let i=0;i<sparks.length;i++){
      const s = sparks[i];
      s.life -= dt;
      s.x += s.vx*dt;
      s.y += s.vy*dt;
      s.vy += 220*dt*(h/540);
      if (s.life <= 0 || s.y < h*0.2){
        sparks[i] = makeSpark(true);
      }
    }

    nextPop -= dt;
    if (nextPop <= 0){
      nextPop = 0.25 + rand()*0.8;
      if (audio.enabled) audio.beep({freq: 120 + rand()*200, dur: 0.03, gain: 0.015, type:'square'});
    }
  }

  function render(ctx){
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,w,h);

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
    if (logSprites){
      for (let i=0;i<3;i++){
        const spr = logSprites[i];
        const x = w*(0.32 + i*0.12);
        const y = h*(0.84 + Math.sin(t*0.3+i)*0.005);
        ctx.drawImage(spr.c, x - spr.w/2, y - spr.h/2);
      }
    } else {
      ctx.save();
      ctx.fillStyle = 'rgba(45,30,20,1)';
      for (let i=0;i<3;i++){
        const x = w*(0.32 + i*0.12);
        const y = h*(0.84 + Math.sin(t*0.3+i)*0.005);
        ctx.beginPath();
        ctx.ellipse(x,y,w*0.12,h*0.035, 0.25*Math.sin(i), 0, Math.PI*2);
        ctx.fill();
      }
      ctx.restore();
    }

    // flame body (layered gradients)
    const fx = w*0.5;
    const baseY = h*0.84;
    for (let i=0;i<5;i++){
      const amp = 0.018 + i*0.01;
      const sway = Math.sin(t*1.2 + i)*w*amp;
      const height = h*(0.22 + i*0.03);
      const width = w*(0.10 + i*0.02);
      const g = ctx.createRadialGradient(fx+sway, baseY-height*0.4, 0, fx+sway, baseY-height*0.4, width);
      g.addColorStop(0, `rgba(255,220,140,${0.34 - i*0.04})`);
      g.addColorStop(0.5, `rgba(255,120,40,${0.22 - i*0.03})`);
      g.addColorStop(1, 'rgba(0,0,0,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(fx+sway, baseY-height*0.4, width, height, 0, 0, Math.PI*2);
      ctx.fill();
    }

    // sparks (perf: cached sprites; no per-spark gradients)
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const s of sparks){
      const a = Math.max(0, s.life/s.max);
      const alpha = 0.12 + 0.28*a;
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
    const wg = ctx.createRadialGradient(fx,baseY, 0, fx,baseY, Math.max(w,h)*0.6);
    wg.addColorStop(0,'rgba(255,140,60,0.14)');
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
