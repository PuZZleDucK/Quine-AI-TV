// Minimal WebAudio helper. Audio can only start after user gesture.

export class AudioManager {
  constructor(){
    this.ctx = null;
    this.master = null;
    this.enabled = false;
    this.current = null; // {stop()}
  }

  ensure(){
    if (this.ctx) return this.ctx;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    this.ctx = new AudioContext();
    this.master = this.ctx.createGain();
    this.master.gain.value = 0.55;
    this.master.connect(this.ctx.destination);
    return this.ctx;
  }

  async toggle(){
    if (!this.enabled){
      this.ensure();
      if (this.ctx.state !== 'running') await this.ctx.resume();
      this.enabled = true;
    } else {
      this.enabled = false;
      this.stopCurrent();
    }
  }

  stopCurrent(){
    try { this.current?.stop?.(); } catch {}
    this.current = null;
  }

  setCurrent(handle){
    this.stopCurrent();
    this.current = handle;
  }

  // Utilities
  noiseSource({type='white', gain=0.08}={}){
    const ctx = this.ensure();
    const bufferSize = 2 * ctx.sampleRate;
    const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
    const out = buffer.getChannelData(0);
    for (let i=0;i<bufferSize;i++){
      let v = Math.random()*2-1;
      if (type==='brown') {
        // integrate
        out[i] = (out[i-1]||0)*0.98 + v*0.02;
      } else if (type==='pink') {
        out[i] = v*0.6 + (out[i-1]||0)*0.4;
      } else {
        out[i]=v;
      }
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    src.loop = true;
    const g = ctx.createGain();
    g.gain.value = gain;
    src.connect(g);
    g.connect(this.master);
    return {src, gain: g, start: ()=>src.start(), stop: ()=>{try{src.stop()}catch{}}};
  }

  beep({freq=880, dur=0.06, gain=0.06, type='sine'}={}){
    const ctx = this.ensure();
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.value = freq;
    g.gain.value = 0;
    o.connect(g);
    g.connect(this.master);
    const t0 = ctx.currentTime;
    g.gain.setValueAtTime(0, t0);
    g.gain.linearRampToValueAtTime(gain, t0 + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
    o.start();
    o.stop(t0 + dur + 0.02);
  }
}

export function simpleDrone(audio, {root=110, detune=0.7, gain=0.06}={}){
  const ctx = audio.ensure();
  const out = ctx.createGain();
  out.gain.value = gain;
  out.connect(audio.master);

  const oscs = [0, detune, -detune].map((d,i)=>{
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = i===0 ? 'sine' : 'triangle';
    o.frequency.value = root * (i===0 ? 1 : 2);
    o.detune.value = d * 30;
    g.gain.value = i===0 ? 0.9 : 0.35;
    o.connect(g);
    g.connect(out);
    o.start();
    return o;
  });

  return {
    stop(){
      try{ out.gain.setTargetAtTime(0.0001, ctx.currentTime, 0.08);}catch{}
      oscs.forEach(o=>{try{o.stop(ctx.currentTime+0.2)}catch{}});
    }
  };
}
