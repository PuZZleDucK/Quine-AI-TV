// REVIEWED: 2026-02-11
import { mulberry32 } from '../../util/prng.js';

export function createChannel({ seed, audio }){
  const INCIDENT_NOTES = [
    'INCIDENT: SHOPPING CART MOVED AGAINST WIND',
    'INCIDENT: SERVICE DOOR OPENED THEN RECONSIDERED',
    'INCIDENT: UNCLAIMED UMBRELLA CHANGED CAMERAS',
    'INCIDENT: ELEVATOR ARRIVED WITHOUT CALL',
    'INCIDENT: UNUSUAL HEAT SIGNATURE NEAR LOADING BAY',
    'INCIDENT: MOTION FLAGGED, NOBODY ADMITTED TO MOVING',
    'INCIDENT: NIGHT SHIFT REPORTED A FAMILIAR STRANGER',
    'INCIDENT: STATIC BRIEFLY FORMED A FACE-LIKE PATTERN',
  ];
  const rand = mulberry32(seed);
  const seed32 = (seed|0) >>> 0;
  const clockBaseSeconds = (Math.imul(seed32 ^ 0x9e3779b9, 2654435761) >>> 0) % 86400;

  let w=0,h=0,t=0;
  let cams=[];
  let noiseHandle=null; // audio.noiseSource handle
  let audioHandle=null; // {stop()}
  let nextMotion=0;
  let incidentText = '';
  let incidentAge = 999;

  // Time structure (quiet → patrol → busy) over a 2–4 min seeded cycle.
  let phasePlan=null; // {cycle:number, phases:[{name,dur,motion:[min,max], boxes:[min,max]}]}
  let patrolCam=0;
  let nextPatrolSwitch=0;

  // Rare “special moments” (deterministic per seed): signal loss/static + reconnect, or a brief CAM SWITCH overlay.
  let nextSpecial=0;
  let special=null; // { kind:'LOSS'|'SWITCH'|'ANOMALY', camId?:number, stage?:'LOSS'|'RECONNECT', t:number, dur:number, dur2?:number }

  // Perf: avoid per-frame gradient allocation by using cached radial "light" sprites.
  // Also use per-cam "scene" palettes so each CCTV feed feels distinct.
  const PALETTES = [
    {
      name: 'ALLEY',
      dot: 'rgba(200,255,210,0.12)',
      hud: 'rgba(180,255,210,0.9)',
      box: 'rgba(120,255,160,0.85)',
      light0: 'rgba(120,255,160,0.10)',
    },
    {
      name: 'HALL',
      dot: 'rgba(190,220,255,0.12)',
      hud: 'rgba(190,220,255,0.9)',
      box: 'rgba(120,190,255,0.85)',
      light0: 'rgba(120,190,255,0.10)',
    },
    {
      name: 'YARD',
      dot: 'rgba(255,220,170,0.12)',
      hud: 'rgba(255,220,170,0.9)',
      box: 'rgba(255,180,120,0.85)',
      light0: 'rgba(255,180,120,0.10)',
    },
  ];

  // Each feed prefers a small, distinct set of "detected" items.
  const LABEL_POOLS = [
    // ALLEY
    ['PERSON','DOG','BIKE','PACKAGE','SKATE','HOODIE'],
    // HALL
    ['PERSON','BADGE','BAG','CART','DOOR','VISITOR'],
    // YARD
    ['CAR','TRUCK','FORKLIFT','PALLET','CRATE','CAT'],
  ];

  // Visual replacement for moving labels: blurred, colored emoji tags.
  // (Keep pools aligned with LABEL_POOLS indices.)
  const EMOJI_POOLS = [
    // ALLEY
    ['👤','🐕','🚲','📦','🛹','🧥'],
    // HALL
    ['👤','🪪','👜','🛒','🚪','🙋'],
    // YARD
    ['🚗','🚚','🏗️','🪵','📦','🐈'],
  ];

  function hash32(x){
    x = (x >>> 0);
    x ^= x >>> 16;
    x = Math.imul(x, 0x7feb352d);
    x ^= x >>> 15;
    x = Math.imul(x, 0x846ca68b);
    x ^= x >>> 16;
    return x >>> 0;
  }
  function h01(x){ return (hash32(x) >>> 0) / 4294967296; }

  function pickCamLabels(scene, camId){
    const pool = LABEL_POOLS[scene.kind|0] ?? LABEL_POOLS[0];
    const picked = [];

    // Deterministic (no rand consumption): pick 3 unique items.
    let k = 0;
    while (picked.length < 3 && k < 20){
      const idx = hash32(scene.base ^ (0x55aa00 + camId*101 + k*0x9e3779b9)) % pool.length;
      const s = pool[idx];
      if (!picked.includes(s)) picked.push(s);
      k++;
    }

    return picked.length ? picked : pool.slice(0,3);
  }

  function makeScene(camId){
    const base = hash32(seed32 ^ (0xa53a3b1d + Math.imul(camId + 1, 0x9e3779b9)));
    const kind = base % 3;
    const pal = PALETTES[kind];

    // Per-scene motion speeds (avoid rand consumption; keep global PRNG timeline unchanged).
    const sx = 90 + 120*h01(base ^ 0x11);
    const sy = 40 + 90*h01(base ^ 0x22);
    const dots = kind === 0 ? 120 : (kind === 1 ? 80 : 60);

    return { kind, pal, base, sx, sy, dots };
  }

  const LIGHT_SPRITE_SIZE = 256;
  const lightSprites = [null, null, null]; // CanvasImageSource | false | null
  function ensureLightSprite(kind){
    const k = kind|0;
    if (lightSprites[k] !== null) return;

    const S = LIGHT_SPRITE_SIZE;

    let c = null;
    if (typeof OffscreenCanvas !== 'undefined') c = new OffscreenCanvas(S,S);
    else if (typeof document !== 'undefined'){
      const el = document.createElement('canvas');
      el.width = S; el.height = S;
      c = el;
    } else {
      // Headless/non-DOM environment: skip the light overlay rather than crashing.
      lightSprites[k] = false;
      return;
    }

    const g = c.getContext('2d');
    const cx = S/2, cy = S/2;
    const grad = g.createRadialGradient(cx,cy,0,cx,cy,S/2);
    grad.addColorStop(0, PALETTES[k].light0);
    grad.addColorStop(1, 'rgba(0,0,0,0)');
    g.clearRect(0,0,S,S);
    g.fillStyle = grad;
    g.fillRect(0,0,S,S);
    lightSprites[k] = c;
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
    // Build light sprites up-front (once per palette) so renderCam stays allocation-free.
    ensureLightSprite(0);
    ensureLightSprite(1);
    ensureLightSprite(2);

    // Phase plan needs to be constructed before we schedule events.
    phasePlan = makePhasePlan();
    patrolCam = (rand()*4) | 0;
    nextPatrolSwitch = 2 + rand()*4;

    // Schedule first special moment after ~45–120s.
    nextSpecial = 45 + rand()*75;
    special = null;
    incidentText = 'INCIDENT: ALL FEEDS STABLE (PROBABLY)';
    incidentAge = 0;

    cams = Array.from({length: 4}, (_,i)=>{
      const scene = makeScene(i);
      const labels = pickCamLabels(scene, i);

      const labelPool = LABEL_POOLS[scene.kind|0] ?? LABEL_POOLS[0];
      const emojiPool = EMOJI_POOLS[scene.kind|0] ?? EMOJI_POOLS[0];
      const labelToEmoji = Object.create(null);
      for (const s of labels){
        const idx = labelPool.indexOf(s);
        labelToEmoji[s] = idx >= 0 ? (emojiPool[idx] ?? '⬤') : '⬤';
      }
      const labelEmojiText = labels.map(s => labelToEmoji[s] ?? '⬤').join(' ');

      return {
        id: i,
        scene,
        ph: rand()*10,
        labels,
        labelToEmoji,
        labelText: labels.join('·'),
        labelEmojiText,
        targets: [],
        msg: 'IDLE',
      };
    });

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

    const kind = cam.scene.kind|0;

    cam.targets = Array.from({length: count}, (_,i)=>{
      const w0 = 0.10 + rand()*0.22;
      const h0 = 0.10 + rand()*0.20;

      // Start positions away from the very edge so boxes don’t immediately clip.
      const x0 = 0.04 + rand()*(0.92 - w0);
      const y0 = 0.06 + rand()*(0.88 - h0);

      // Motion varies by scene: hall mostly horizontal, alley more diagonal, yard slow drift.
      let vx = (rand()<0.5 ? -1 : 1) * (0.06 + rand()*0.14);
      let vy = (rand()<0.5 ? -1 : 1) * (0.04 + rand()*0.10);
      if (kind === 1) vy *= 0.35;
      if (kind === 2){ vx *= 0.55; vy *= 0.55; }

      // Slight per-target offset so they don’t march in lockstep.
      vx *= (0.85 + 0.3*rand());
      vy *= (0.85 + 0.3*rand());

      const max = 0.9 + rand()*1.3;

      const label = cam.labels[((rand()*cam.labels.length)|0)] ?? 'OBJECT';
      const emoji = cam.labelToEmoji?.[label] ?? '⬤';
      const hue = 40 + 260*h01(cam.scene.base ^ (0x9e3779b9 + Math.imul(cam.id+1,0x85ebca6b) + Math.imul(i+1,0xc2b2ae35)));
      const glow = `hsla(${hue}, 85%, 62%, 0.9)`;

      return {
        x: x0,
        y: y0,
        w: w0,
        h: h0,
        vx,
        vy,
        life: max,
        max,
        label,
        emoji,
        hue,
        glow,
        tag: (i + 1),
      };
    });

    cam.msg = rand()<0.5 ? 'MOTION' : 'TRACK';
    if (audio.enabled) audio.beep({freq: 260 + rand()*60, dur: 0.03, gain: 0.02, type:'square'});
  }

  function update(dt){
    t += dt;
    incidentAge += dt;
    const phase = getPhaseAtTime(t);

    // Special moments.
    if (special){
      special.t += dt;

      if (special.kind === 'LOSS'){
        if (special.stage === 'LOSS' && special.t >= special.dur){
          special.stage = 'RECONNECT';
          special.t = 0;
          if (audio.enabled) audio.beep({freq: 180 + rand()*40, dur: 0.045, gain: 0.018, type:'square'});
        } else if (special.stage === 'RECONNECT' && special.t >= (special.dur2 ?? 1.2)){
          special = null;
        }
      } else if (special.kind === 'ANOMALY'){
        if (special.t >= special.dur) special = null;
      } else {
        if (special.t >= special.dur) special = null;
      }
    } else {
      nextSpecial -= dt;
      if (nextSpecial <= 0){
        nextSpecial = 45 + rand()*75; // ~45–120s

        if (rand() < 0.64){
          special = {
            kind: 'LOSS',
            camId: (rand()*cams.length) | 0,
            stage: 'LOSS',
            t: 0,
            dur: 0.55 + rand()*0.65,
            dur2: 0.9 + rand()*1.0,
          };
          incidentText = 'INCIDENT: TEMPORARY SIGNAL LOSS DETECTED';
          incidentAge = 0;
          if (audio.enabled) audio.beep({freq: 70 + rand()*30, dur: 0.06, gain: 0.03, type:'sawtooth'});
        } else if (rand() < 0.78) {
          special = {
            kind: 'SWITCH',
            t: 0,
            dur: 0.55 + rand()*0.85,
          };
          incidentText = 'INCIDENT: CONTROL ROOM FORCED CAMERA SWITCH';
          incidentAge = 0;
          if (audio.enabled) audio.beep({freq: 300 + rand()*90, dur: 0.04, gain: 0.02, type:'square'});
        } else {
          special = {
            kind: 'ANOMALY',
            camId: (rand()*cams.length) | 0,
            t: 0,
            dur: 1.6 + rand()*1.3,
          };
          incidentText = 'INCIDENT: ANOMALY TRACE MOVING BETWEEN FRAMES';
          incidentAge = 0;
          if (audio.enabled){
            audio.beep({freq: 240 + rand()*60, dur: 0.05, gain: 0.016, type:'triangle'});
            audio.beep({freq: 510 + rand()*90, dur: 0.03, gain: 0.012, type:'sine'});
          }
        }
      }
    }

    // Move tracked targets; the detection effect is now tied to moving objects.
    for (const cam of cams){
      for (const o of cam.targets){
        o.life -= dt;
        o.x += o.vx * dt;
        o.y += o.vy * dt;

        // bounce + clamp (normalized coords)
        if (o.x < 0.02){ o.x = 0.02; o.vx = Math.abs(o.vx); }
        if (o.y < 0.02){ o.y = 0.02; o.vy = Math.abs(o.vy); }
        if (o.x + o.w > 0.98){ o.x = 0.98 - o.w; o.vx = -Math.abs(o.vx); }
        if (o.y + o.h > 0.98){ o.y = 0.98 - o.h; o.vy = -Math.abs(o.vy); }
      }

      cam.targets = cam.targets.filter(o => o.life > 0);
      if (cam.targets.length === 0) cam.msg = 'IDLE';
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
      if (rand() < 0.24) {
        incidentText = INCIDENT_NOTES[(rand()*INCIDENT_NOTES.length)|0];
        incidentAge = 0;
      }

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

  function drawEmojiTag(ctx, x, y, o, a){
    const emoji = o.emoji ?? '⬤';

    // Soft colored glow behind emoji.
    ctx.save();
    ctx.globalAlpha = 0.10 + 0.22*a;
    ctx.fillStyle = o.glow ?? 'rgba(180,255,210,0.7)';
    if ('filter' in ctx) ctx.filter = 'blur(6px)';
    ctx.beginPath();
    ctx.arc(x + 6, y - 6, 10, 0, Math.PI*2);
    ctx.fill();
    ctx.restore();

    // The emoji itself (slightly blurred).
    ctx.save();
    ctx.globalAlpha = 0.55 + 0.35*a;
    ctx.fillStyle = '#fff';
    ctx.font = '16px ui-sans-serif, system-ui, Apple Color Emoji, Segoe UI Emoji, Noto Color Emoji';
    if ('filter' in ctx) ctx.filter = 'blur(0.7px)';
    ctx.fillText(emoji, x, y);
    ctx.restore();
  }

  function renderCam(ctx, cam, x, y, cw, ch, ts, specialState){

    // background
    ctx.fillStyle = 'rgba(0,0,0,0.9)';
    ctx.fillRect(x,y,cw,ch);

    const scene = cam.scene;
    const pal = scene.pal;

    // fake scene: per-cam stylized feeds (distinct palettes + motion patterns)
    if (scene.kind === 0){
      // ALLEY: speckle noise
      ctx.save();
      ctx.globalAlpha = 0.25;
      ctx.fillStyle = pal.dot;
      for (let i=0;i<scene.dots;i++){
        const px = x + ((i*97 + t*scene.sx) % cw);
        const py = y + ((i*53 + t*scene.sy) % ch);
        ctx.fillRect(px, py, 1, 1);
      }
      ctx.restore();

    } else if (scene.kind === 1){
      // HALL: scanlines + softer speckle
      ctx.save();
      ctx.globalAlpha = 0.22;
      ctx.fillStyle = pal.dot;
      for (let yy=0; yy<ch; yy+=3){
        ctx.fillRect(x, y + yy, cw, 1);
      }
      for (let i=0;i<scene.dots;i++){
        const px = x + ((i*113 + t*(scene.sx*0.72)) % cw);
        const py = y + ((i*41 + t*(scene.sy*0.55)) % ch);
        ctx.fillRect(px, py, 1, 1);
      }
      ctx.restore();

    } else {
      // YARD: blocky silhouettes + sparse grain
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = pal.dot;
      for (let i=0;i<scene.dots;i++){
        const px = x + ((i*67 + t*(scene.sx*0.6)) % cw);
        const py = y + ((i*29 + t*(scene.sy*0.42)) % ch);
        ctx.fillRect(px, py, 1, 1);
      }

      ctx.globalAlpha = 0.14;
      ctx.fillStyle = '#000';
      for (let i=0;i<4;i++){
        const rx = h01(scene.base ^ (0x100 + i*31)) * 0.7;
        const ry = h01(scene.base ^ (0x200 + i*57)) * 0.55;
        const rw = 0.18 + 0.28*h01(scene.base ^ (0x300 + i*73));
        const rh = 0.12 + 0.25*h01(scene.base ^ (0x400 + i*91));
        const bob = 0.01*Math.sin(t*0.25 + i + cam.ph);
        ctx.fillRect(x + (rx + bob)*cw, y + (ry + bob)*ch, rw*cw, rh*ch);
      }
      ctx.restore();
    }

    // cached "light" (no per-frame gradients)
    ensureLightSprite(scene.kind);
    const spr = lightSprites[scene.kind|0];
    if (spr){
      const lx = x + cw*(0.2 + 0.6*(0.5+0.5*Math.sin(t*(0.32 + 0.04*scene.kind)+cam.ph)));
      const ly = y + ch*(0.2 + 0.6*(0.5+0.5*Math.cos(t*(0.27 + 0.03*scene.kind)+cam.ph)));
      const diam = Math.max(1, cw*1.2);
      ctx.drawImage(spr, lx - diam/2, ly - diam/2, diam, diam);
    }

    // moving targets + detection boxes (tied to moving objects)
    ctx.save();
    ctx.strokeStyle = pal.box;
    ctx.lineWidth = 2;
    ctx.font = '12px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';

    for (const o of cam.targets){
      const a = Math.max(0, Math.min(1, o.life / Math.max(0.001, o.max)));

      // silhouette
      ctx.globalAlpha = 0.08 + 0.12*a;
      ctx.fillStyle = pal.hud;
      ctx.fillRect(x + o.x*cw, y + o.y*ch, o.w*cw, o.h*ch);

      // box
      ctx.globalAlpha = 0.25 + 0.75*a;
      ctx.strokeRect(x + o.x*cw, y + o.y*ch, o.w*cw, o.h*ch);

      // label (blurred emoji tag)
      const tx = x + o.x*cw + 6;
      const ty = Math.max(y + 24, y + o.y*ch - 6);
      drawEmojiTag(ctx, tx, ty, o, a);
    }
    ctx.restore();

    const loss = !!(specialState && specialState.kind === 'LOSS' && specialState.camId === cam.id);
    const anomaly = !!(specialState && specialState.kind === 'ANOMALY' && specialState.camId === cam.id);
    const msg = loss
      ? (specialState.stage === 'LOSS' ? 'NO SIGNAL' : 'RECONNECT')
      : (cam.targets.length ? cam.msg : 'IDLE');

    // Special moment overlay (signal loss + reconnect) — keep OSD readable.
    if (loss){
      const stage = specialState.stage;
      ctx.save();
      ctx.globalAlpha = stage === 'LOSS' ? 0.92 : 0.65;
      ctx.fillStyle = '#000';
      ctx.fillRect(x,y,cw,ch);

      // Deterministic static (no PRNG calls in draw).
      const frame = (t*24) | 0;
      ctx.fillStyle = pal.hud;
      for (let i=0;i<34;i++){
        const u = Math.sin((i*127.1 + frame*17.3 + seed32*0.001) * 0.7) * 43758.5453;
        const v = u - Math.floor(u);
        const u2 = Math.sin((i*269.5 + frame*9.2 + seed32*0.002) * 0.9) * 43758.5453;
        const v2 = u2 - Math.floor(u2);
        ctx.globalAlpha = (stage === 'LOSS' ? 0.10 : 0.06) + (stage === 'LOSS' ? 0.18 : 0.10) * v2;
        ctx.fillRect(x, y + v*ch, cw, 1);
      }

      ctx.globalAlpha = 0.95;
      ctx.fillStyle = pal.hud;
      ctx.font = '18px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
      ctx.fillText(stage === 'LOSS' ? 'NO SIGNAL' : 'RECONNECTING...', x + cw*0.18, y + ch*0.55);

      if (stage === 'RECONNECT'){
        const dur2 = specialState.dur2 ?? 1.2;
        const p = Math.max(0, Math.min(1, specialState.t / Math.max(0.001, dur2)));
        const bw = cw*0.55;
        const bh = 6;
        const bx = x + cw*0.22;
        const by = y + ch*0.62;
        ctx.globalAlpha = 0.8;
        ctx.fillStyle = 'rgba(0,0,0,0.6)';
        ctx.fillRect(bx,by,bw,bh);
        ctx.fillStyle = pal.box;
        ctx.fillRect(bx,by,Math.max(1, bw*p),bh);
      }

      ctx.restore();
    }

    if (anomaly){
      const a = 1 - Math.max(0, Math.min(1, specialState.t / Math.max(0.001, specialState.dur)));
      const p = 0.55 + 0.45*Math.sin(t*22)**2;
      ctx.save();
      ctx.globalAlpha = 0.2 * a * p;
      ctx.fillStyle = 'rgba(180,220,255,0.9)';
      ctx.fillRect(x, y, cw, ch);
      ctx.globalCompositeOperation = 'screen';
      ctx.strokeStyle = `rgba(180,220,255,${0.85*a*p})`;
      ctx.lineWidth = Math.max(2, Math.floor(Math.min(cw,ch)*0.015));
      const sx = x + cw*(0.2 + 0.6*(0.5 + 0.5*Math.sin(t*2.1 + cam.id)));
      const sy = y + ch*(0.2 + 0.6*(0.5 + 0.5*Math.cos(t*2.7 + cam.id)));
      ctx.beginPath();
      ctx.arc(sx, sy, Math.max(10, Math.min(cw,ch)*0.09), 0, Math.PI*2);
      ctx.stroke();
      ctx.restore();
    }

    // overlays
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.45)';
    ctx.fillRect(x,y,cw, 24);
    ctx.fillStyle = pal.hud;
    ctx.font = '14px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
    ctx.fillText(`CAM ${cam.id+1} ${pal.name}  ${msg}`, x+8, y+17);
    ctx.fillText(ts, x+cw-110, y+17);

    // show the per-cam label set on the right for a bit of "different feeds" flavour
    ctx.globalAlpha = 0.6;
    ctx.fillText(cam.labelEmojiText ?? cam.labelText, x + 8, y + ch - 10);
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

    renderCam(ctx, cams[0], pad, pad, cw, ch, ts, special);
    renderCam(ctx, cams[1], pad*2 + cw, pad, cw, ch, ts, special);
    renderCam(ctx, cams[2], pad, pad*2 + ch, cw, ch, ts, special);
    renderCam(ctx, cams[3], pad*2 + cw, pad*2 + ch, cw, ch, ts, special);

    // label bar
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0,0,w, Math.floor(h*0.12));
    ctx.fillStyle = 'rgba(231,238,246,0.85)';
    ctx.font = `${Math.floor(h/18)}px ui-sans-serif, system-ui`;
    ctx.fillText(`CCTV NIGHT WATCH — ${phase.name}`, w*0.05, h*0.09);
    ctx.restore();

    if (incidentText) {
      const a = Math.max(0.25, Math.min(1, 1 - Math.max(0, incidentAge - 4.5) / 5.5));
      const fs = Math.max(12, Math.floor(h / 36));
      const pad = Math.max(6, Math.floor(fs * 0.42));
      ctx.save();
      ctx.font = `700 ${fs}px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`;
      const tw = Math.ceil(ctx.measureText(incidentText).width);
      const bw = tw + pad * 2;
      const bh = fs + pad * 1.55;
      const bx = Math.floor(w * 0.5 - bw * 0.5);
      const by = Math.floor(h * 0.94 - bh);
      ctx.globalAlpha = 0.92 * a;
      ctx.fillStyle = 'rgba(8, 14, 22, 0.88)';
      ctx.strokeStyle = 'rgba(150, 215, 255, 0.82)';
      ctx.lineWidth = 2;
      ctx.fillRect(bx, by, bw, bh);
      ctx.strokeRect(bx + 1, by + 1, bw - 2, bh - 2);
      ctx.fillStyle = 'rgba(220, 242, 255, 0.95)';
      ctx.fillText(incidentText, bx + pad, by + fs + pad * 0.35);
      ctx.restore();
    }

    // Brief global overlay.
    if (special && special.kind === 'SWITCH'){
      const a = 1 - Math.max(0, Math.min(1, special.t / Math.max(0.001, special.dur)));
      ctx.save();
      ctx.globalAlpha = 0.9 * a;

      const pw = Math.min(w*0.55, 320);
      const ph = 34;
      const px = (w - pw)/2;
      const py = Math.floor(h*0.12) + 10;

      ctx.fillStyle = 'rgba(0,0,0,0.65)';
      ctx.fillRect(px,py,pw,ph);
      ctx.strokeStyle = 'rgba(120,255,160,0.8)';
      ctx.lineWidth = 2;
      ctx.strokeRect(px+1,py+1,pw-2,ph-2);

      ctx.fillStyle = 'rgba(180,255,210,0.95)';
      ctx.font = '16px ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace';
      ctx.fillText('CAM SWITCH', px+16, py+22);

      ctx.restore();
    }
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
