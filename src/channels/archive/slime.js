import { mulberry32, clamp } from '../../util/prng.js';

// "Slime Lab": little agents that follow/avoid each other and leave trails.

export function createChannel({ seed, audio }){
  const rand = mulberry32(seed);
  let w=0,h=0,t=0;
  let agents=[];
  let fade=0.08;
  let hiss=null;

  function init({width,height}){
    w=width; h=height; t=0;
    fade = 0.06;
    const n = 180;
    agents = Array.from({length:n}, (_,i)=>({
      x: rand()*w,
      y: rand()*h,
      vx: (rand()*2-1)*40,
      vy: (rand()*2-1)*40,
      hue: (i*5 + rand()*40) % 360,
      s: 18 + rand()*40,
    }));
  }

  function onResize(width,height){ w=width; h=height; init({width,height}); }

  function onAudioOn(){
    if (!audio.enabled) return;
    const n = audio.noiseSource({type:'pink', gain:0.01});
    n.start();
    hiss = {stop(){n.stop();}};
    audio.setCurrent(hiss);
  }
  function onAudioOff(){ try{hiss?.stop?.();}catch{} hiss=null; }
  function destroy(){ onAudioOff(); }

  function update(dt){
    t += dt;
    // simple flock-ish rules
    for (let i=0;i<agents.length;i++){
      const a = agents[i];
      let ax=0, ay=0;
      // pull to center slowly
      ax += (w*0.5 - a.x) * 0.0005;
      ay += (h*0.5 - a.y) * 0.0005;

      // neighbor influence
      for (let k=0;k<4;k++){
        const j = (i*17 + k*37) % agents.length;
        if (j===i) continue;
        const b = agents[j];
        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const d2 = dx*dx + dy*dy + 0.001;
        const d = Math.sqrt(d2);
        const desired = a.s;
        // avoid if too close
        const rep = clamp((desired - d) / desired, 0, 1);
        ax -= (dx/d) * rep * 8;
        ay -= (dy/d) * rep * 8;
        // mild attraction
        const att = clamp((d - desired) / (desired*3), 0, 1);
        ax += (dx/d) * att * 0.6;
        ay += (dy/d) * att * 0.6;
      }

      // swirl field
      ax += Math.sin(a.y*0.01 + t*0.7) * 0.9;
      ay += Math.cos(a.x*0.01 - t*0.65) * 0.9;

      a.vx += ax*dt*60;
      a.vy += ay*dt*60;
      const sp = Math.sqrt(a.vx*a.vx + a.vy*a.vy) + 1e-6;
      const max = 160;
      if (sp > max){ a.vx = a.vx/sp*max; a.vy = a.vy/sp*max; }

      a.x += a.vx*dt;
      a.y += a.vy*dt;
      if (a.x < 0) a.x += w;
      if (a.x > w) a.x -= w;
      if (a.y < 0) a.y += h;
      if (a.y > h) a.y -= h;
      a.hue = (a.hue + dt*12) % 360;
    }
  }

  function render(ctx){
    ctx.setTransform(1,0,0,1,0,0);
    // fade frame for trails
    ctx.fillStyle = `rgba(0,0,0,${fade})`;
    ctx.fillRect(0,0,w,h);

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (const a of agents){
      ctx.fillStyle = `hsla(${a.hue},95%,60%,0.05)`;
      ctx.beginPath();
      ctx.arc(a.x, a.y, 10, 0, Math.PI*2);
      ctx.fill();
      ctx.fillStyle = `hsla(${a.hue},95%,70%,0.07)`;
      ctx.fillRect(a.x, a.y, 1.5, 1.5);
    }
    ctx.restore();

    // header
    ctx.save();
    ctx.fillStyle = 'rgba(0,0,0,0.35)';
    ctx.fillRect(0,0,w, Math.floor(h*0.12));
    ctx.fillStyle = 'rgba(231,238,246,0.8)';
    ctx.font = `${Math.floor(h/18)}px ui-sans-serif, system-ui`;
    ctx.fillText('SLIME LAB', w*0.05, h*0.09);
    ctx.restore();
  }

  return { init, update, render, onResize, onAudioOn, onAudioOff, destroy };
}
