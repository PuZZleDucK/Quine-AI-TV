// REVIEWED: 2026-02-10
import { mulberry32 } from '../util/prng.js';

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);
  const seed32 = (seed|0) >>> 0;
  const clockBaseSeconds = (Math.imul(seed32 ^ 0x9e3779b9, 2654435761) >>> 0) % 86400;

  let w=0,h=0,t=0;
  let cams=[];
  let noiseHandle=null; // audio.noiseSource handle
  let audioHandle=null; // {stop()}
  let nextMotion=0;

  // Time structure (quiet → patrol → busy) over a 2–4 min seeded cycle.
  let phasePlan=null; // {cycle:number, phases:[{name,dur,motion:[min,max], boxes:[min,max]}]}
  let patrolCam=0;
  let nextPatrolSwitch=0;

  // Perf: avoid per-frame gradient allocation by using a cached radial "light" sprite.
  const LIGHT_SPRITE_SIZE = 256;
  let lightSprite = null; // CanvasImageSource | false | null
  function ensureLightSprite(){
    if (lightSprite !== null) return;
    const S = LIGHT_SPRITE_SIZE;

    let c = null;
    if (typeof OffscreenCanvas !== 'undefined') c = new OffscreenCanvas(S,S);
    else if (typeof document !== 'undefined'){
      const el = document.createElement('canvas');
      el.width = S; el.height = S;
      c = el;
    } else {
      // Headless/non-DOM environment: skip the light overlay rather than crashing.
      lightSprite = false;
      return;
    }

    const g = c.getContext('2d');
    const cx = S/2, cy = S/2;
    const grad = g.createRadialGradient(cx,cy,0,cx,cy,S/2);
    grad.addColorStop(0,'rgba(120,255,160,0.10)');
    grad.addColorStop(1,'rgba(0,0,0,0)');
    g.clearRect(0,0,S,S);
    g.fillStyle = grad;
    g.fillRect(0,0,S,S);
    lightSprite = c;
  }

  function makePhasePlan(){
    const cycle = 120 + rand()*120; // 2–4 minutes

    // Seeded variation in how long the channel stays calm vs active.
    const quietFrac = 0.34 + rand()*0.12;
    const patrolFrac = 0.28 + rand()*0.12;
    const busyFrac = Math.max(0.15, 1 - quietFrac - patrolFrac);

    const phases = [
      { name:'QUIET',  dur: cycle*quietFrac,  motion:[1.8,3.6],  boxes:[1,2] },
      { name:'PATROL', dur: cycle*patrolFrac, motion:[0.9,2.2],  boxes:[1,3] },
      { name:'BUSY',   dur: cycle*busyFrac,   motion:[0.35,1.1], boxes:[2,5] },
    ];

    return { cycle, phases };
  }

  function getPhaseAtTime(tt){
    if (!phasePlan) return { name:'PATROL', motion:[0.7,2.5], boxes:[1,3], idx:0, u:0 };

    const plan = phasePlan;
    let x = ((tt % plan.cycle) + plan.cycle) % plan.cycle;
    let acc = 0;

    for (let i=0;i<plan.phases.length;i++){
      const p = plan.phases[i];
      if (x < acc + p.dur){
        const u = p.dur > 0 ? (x - acc)/p.dur : 0;
        return { ...p, idx:i, u };
      }
      acc += p.dur;
    }

    const p = plan.phases[plan.phases.length-1];
    return { ...p, idx: plan.phases.length-1, u: 1 };
  }

  function pickIn([min,max]){
    return min + rand()*(max-min);
  }

  function init({width,height}){
    w=width; h=height; t=0;
    ensureLightSprite();

    // Phase plan needs to be constructed before we schedule events.
    phasePlan = makePhasePlan();
    patrolCam = (rand()*4) | 0;
    nextPatrolSwitch = 2 + rand()*4;

    cams = Array.from({length: 4}, (_,i)=>({
      id:i,
      ph: rand()*10,
      boxes: [],
      msg: 'IDLE',
    }));

    const phase = getPhaseAtTime(0);
    nextMotion = pickIn(phase.motion);
  }

  function onResize(width,height){ w=width; h=height; }

  function onAudioOn(){
    if (!audio.enabled) return;

    // Defensive hygiene: if called twice while audio is on, avoid stacking noise sources.
    onAudioOff();

    const hdl = audio.noiseSource({ type:'white', gain:0.006 });
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

  function spawnMotion(cam, { boxRange } = {}){
    const [minB,maxB] = boxRange ?? [1,3];
    const count = minB + ((rand()*(maxB - minB + 1)) | 0);

    cam.boxes = Array.from({length: count}, ()=>({
      x: rand()*0.7,
      y: rand()*0.6,
      w: 0.15 + rand()*0.25,
      h: 0.12 + rand()*0.25,
      life: 0.25 + rand()*0.8,
      max: 0.25 + rand()*0.8,
    }));

    cam.msg = rand()<0.5 ? 'MOTION' : 'TRACK';
    if (audio.enabled) audio.beep({freq: 260 + rand()*60, dur: 0.03, gain: 0.02, type:'square'});
  }

  function update(dt){
    t += dt;
    const phase = getPhaseAtTime(t);

    for (const cam of cams){
      cam.boxes = cam.boxes.filter(b => (b.life -= dt) > 0);
      if (cam.boxes.length === 0) cam.msg = 'IDLE';
    }

    // Patrol phase gently "scans" between cameras.
    if (phase.name === 'PATROL'){
      nextPatrolSwitch -= dt;
      if (nextPatrolSwitch <= 0){
        nextPatrolSwitch = 4 + rand()*6;
        patrolCam = (patrolCam + 1 + ((rand()*3)|0)) % cams.length;
      }
    } else {
      // Allow quick acquisition when re-entering patrol.
      nextPatrolSwitch = Math.min(nextPatrolSwitch, 0.5);
    }

    nextMotion -= dt;
    if (nextMotion <= 0){
      nextMotion = pickIn(phase.motion);

      let cam = null;
      if (phase.name === 'PATROL' && rand() < 0.75) cam = cams[patrolCam];
      else cam = cams[(rand()*cams.length)|0];

      spawnMotion(cam, { boxRange: phase.boxes });

      // In BUSY windows, occasionally trigger a second camera too.
      if (phase.name === 'BUSY' && rand() < 0.22){
        const other = cams[(cam.id + 1 + ((rand()*3)|0)) % cams.length];
        spawnMotion(other, { boxRange: [phase.boxes[0], Math.max(phase.boxes[0], phase.boxes[1]-1)] });
      }
    }
  }

  function formatClock(totalSeconds){
    const s = ((totalSeconds % 86400) + 86400) % 86400;
    const hh = (s/3600) | 0;
    const mm = ((s%3600)/60) | 0;
    const ss = (s%60) | 0;
    const pad2 = (n)=> String(n).padStart(2,'0');
    return `${pad2(hh)}:${pad2(mm)}:${pad2(ss)}`;
  }

  function renderCam(ctx, cam, x, y, cw, ch, ts){

    // background
    ctx.fillStyle = 'rgba(0,0,0,0.9)';
    ctx.fillRect(x,y,cw,ch);

    // fake scene: moving light + noise
    ctx.save();
    ctx.globalAlpha = 0.25;
    ctx.fillStyle = 'rgba(200,255,210,0.12)';
    for (let i=0;i<120;i++){
      const px = x + ((i*97 + t*120) % cw);
      const py = y + ((i*53 + t*70) % ch);
      ctx.fillRect(px, py, 1, 1);
    }
    ctx.restore();

    // cached "light" (no per-frame gradients)
    ensureLightSprite();
    if (lightSprite){
      const lx = x + cw*(0.2 + 0.6*(0.5+0.5*Math.sin(t*0.4+cam.ph)));
      const ly = y + ch*(0.2 + 0.6*(0.5+0.5*Math.cos(t*0.33+cam.ph)));
      const diam = Math.max(1, cw*1.2);
      ctx.drawImage(lightSprite, lx - diam/2, ly - diam/2, diam, diam);
    }

    // boxes
    ctx.save();
    ctx.strokeStyle = 'rgba(120,255,160,0.85)';
    ctx.lineWidth = 2;
    for (const b of cam.boxes){
      const a = b.life/b.max;
      ctx.globalAlpha = 0.25 + 0.75*a;
      ctx.strokeRect(x + b.x*cw, y + b.y*ch, b.w*cw, b.h*ch);
    }
    ctx.restore();

    // overlays
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(x,y,cw, 24);
    ctx.fillStyle = 'rgba(180,255,210,0.9)';
    ctx.font = '14px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    ctx.fillText(`CAM ${cam.id+1}  ${cam.msg}`, x+8, y+17);
    ctx.fillText(ts, x+cw-110, y+17);
    ctx.restore();
  }

  function render(ctx){
    ctx.setTransform(1,0,0,1,0,0);
    ctx.clearRect(0,0,w,h);

    // overall
    ctx.fillStyle = '#05070a';
    ctx.fillRect(0,0,w,h);

    const pad = 18;
    const cw = (w - pad*3)/2;
    const ch = (h - pad*3)/2;
    const ts = formatClock(clockBaseSeconds + (t|0));
    const phase = getPhaseAtTime(t);

    renderCam(ctx, cams[0], pad, pad, cw, ch, ts);
    renderCam(ctx, cams[1], pad*2 + cw, pad, cw, ch, ts);
    renderCam(ctx, cams[2], pad, pad*2 + ch, cw, ch, ts);
    renderCam(ctx, cams[3], pad*2 + cw, pad*2 + ch, cw, ch, ts);

    // label bar
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0,0,w, Math.floor(h*0.12));
    ctx.fillStyle = 'rgba(231,238,246,0.85)';
    ctx.font = `${Math.floor(h/18)}px ui-sans-serif, system-ui`;
    ctx.fillText(`CCTV NIGHT WATCH — ${phase.name}`, w*0.05, h*0.09);
    ctx.restore();
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
