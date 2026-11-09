import {storage} from './storage.js';
import {racingV8,RACING_V8} from './racing-v8.js';
import {MenuMusic} from './menu-music.js';
// Night15: Jayden Fudge's permission-granted dyno recording is the primary
// car voice. The Night12 original synth below remains the immediate/failure
// fallback. Only the owned dyno take is sampled; private references never ship.
// Persistent worklets interpolate a compact RPM atlas; diesel is unchanged.
const TAU = Math.PI * 2;
export const V8 = { idle: RACING_V8.idle, limit: RACING_V8.limit, rpms: [850, 1500, 2400, 3500, 4800, 6200, 7600, 9000] };
export const DIESEL = { idle: 650, rpms: [600, 800, 1100, 1450, 1800, 2100] };

function rng(seed) { let s = (seed >>> 0) || 1; return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296); }
// RBJ biquad, run over an array (in place)
function bq(x, type, f, Q, sr, db = 0) {
  const w = TAU * Math.min(f, sr * 0.45) / sr, cw = Math.cos(w), sw = Math.sin(w), al = sw / (2 * Q), A = Math.pow(10, db / 40);
  let b0, b1, b2, a0, a1, a2;
  if (type === 'lp') { b0 = (1 - cw) / 2; b1 = 1 - cw; b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; }
  else if (type === 'hp') { b0 = (1 + cw) / 2; b1 = -(1 + cw); b2 = b0; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; }
  else if (type === 'bp') { b0 = al; b1 = 0; b2 = -al; a0 = 1 + al; a1 = -2 * cw; a2 = 1 - al; }
  else { b0 = 1 + al * A; b1 = -2 * cw; b2 = 1 - al * A; a0 = 1 + al / A; a1 = -2 * cw; a2 = 1 - al / A; } // peaking
  b0 /= a0; b1 /= a0; b2 /= a0; a1 /= a0; a2 /= a0;
  let x1 = 0, x2 = 0, y1 = 0, y2 = 0;
  for (let i = 0; i < x.length; i++) { const v = x[i], y = b0 * v + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2; x2 = x1; x1 = v; y2 = y1; y1 = y; x[i] = y; }
  return x;
}
const rms = x => { let s = 0; for (let i = 0; i < x.length; i++) s += x[i] * x[i]; return Math.sqrt(s / x.length) || 1e-9; };
// pipe with an open end: negative reflection every round trip (quarter-wave resonances), lossy + damped
function pipe(x, sr, len, g, damp) {
  const D = Math.max(2, Math.round(sr * 2 * len / 343)), buf = new Float32Array(D); let j = 0, lp = 0;
  for (let i = 0; i < x.length; i++) { const r = buf[j]; lp += (r - lp) * damp; const y = x[i] - g * lp; buf[j] = y; j = (j + 1) % D; x[i] = y; }
  return x;
}
// add a flow pulse (smooth, fast rise, slower fall) of width w samples at position t0
function pulse(arr, t0, w, a, sharp = 0.3) {
  const wr = Math.max(1.5, w * sharp), n = Math.ceil(wr + w * 5), i0 = Math.floor(t0);
  for (let k = 0; k < n; k++) { const i = i0 + k; if (i >= arr.length) break; const u = i - t0; if (u <= 0) continue; arr[i] += a * (u < wr ? (u / wr) * (u / wr) * (3 - 2 * u / wr) : Math.exp(-(u - wr) / w)); }
}
function env(arr, t0, len, a) { const i0 = Math.floor(t0); for (let k = 0; k < len; k++) { const i = i0 + k; if (i >= arr.length) break; arr[i] += a * Math.exp(-k / (len * 0.25)); } }

// Close the numerical/sample-window splice without an amplitude dip every loop.
export function closeLoop(a,sr){const n=Math.min(Math.floor(sr*.006),Math.floor(a.length/8)),mid=(a[0]+a[a.length-1])*.5,left=mid-a[0],right=mid-a[a.length-1];for(let i=0;i<n;i++){const w=.5+.5*Math.cos(Math.PI*i/(n-1));a[i]+=left*w;a[a.length-1-i]+=right*w;}return a;}

// One seamless loop of a cross-plane big-block V8 at `rpm`, `load` 1 = wide open, 0 = closed throttle (overrun).
export function synthV8(sr, rpm, load, seed = 1) {
  const cyc = 120 / rpm, k = Math.max(3, Math.round(0.62 / cyc)), N = Math.round(k * cyc * sr), cs = N / k, reps = 2, T = N * reps;
  const fl = [new Float32Array(T), new Float32Array(T)], rasp = [new Float32Array(T), new Float32Array(T)], intake = new Float32Array(T), mech = new Float32Array(T);
  const order = [1, 8, 4, 3, 6, 5, 7, 2];
  const hi = Math.min(1, rpm / 8000), lope = 0.42 * Math.pow(1 - hi, 2.2) + 0.05;            // big cam: lumpy at idle
  const w = Math.max(sr * 0.00028, cs * 62 / 720);                                                // blowdown ≈ 62° of crank
  const cylG = order.map((c, i) => 1 + 0.09 * Math.sin(c * 2.3 + seed));
  for (let rep = 0; rep < reps; rep++) {
    const r = rng(seed * 7919 + 13);                                                              // identical every rep -> periodic
    for (let c = 0; c < k; c++) for (let i = 0; i < 8; i++) {
      const cyl = order[i], b = cyl % 2, t0 = rep * N + c * cs + i * cs / 8 + (r() - 0.5) * lope * 0.18 * cs / 8;
      let a = cylG[i] * (1 + lope * (r() * 2 - 1));
      if (load < 0.5) { a *= 0.14 + 0.1 * r(); if (r() < 0.035 * hi + 0.01) a *= 7 + 6 * r(); }   // overrun: weak, the odd afterfire
      else a *= 0.75 + 0.25 * load;
      pulse(fl[b], t0, w * (load < 0.5 ? 0.8 : 1), a);
      env(rasp[b], t0, Math.round(w * 3.2), a);
      env(intake, t0 + cs * 0.5, Math.round(cs * 0.12), load * (0.8 + 0.4 * r()));
      env(mech, t0 + cs * 0.23, Math.round(sr * 0.0007) + 2, 1); env(mech, t0 + cs * 0.55, Math.round(sr * 0.0006) + 2, 0.7);
    }
  }
  const nz = rng(seed * 31 + 7), noise = new Float32Array(N); for (let i = 0; i < N; i++) noise[i] = nz() * 2 - 1;
  const bank = b => {
    const x = fl[b], y = new Float32Array(T);
    for (let i = 1; i < T; i++) y[i] = (x[i] - x[i - 1]) * sr / 2000;                           // radiated sound ~ d(flow)/dt
    pipe(y, sr, b ? 0.86 : 0.97, 0.55, 0.45);                                                    // primary tube -> collector, open end
    pipe(y, sr, b ? 0.31 : 0.34, 0.25, 0.6);                                                     // collector stub
    const rs = new Float32Array(T); for (let i = 0; i < T; i++) rs[i] = noise[i % N] * rasp[b][i];
    bq(rs, 'hp', 700, 0.7, sr); bq(rs, 'lp', 6500, 0.7, sr);
    const ra = (0.45 + 0.6 * hi) * (load < 0.5 ? 0.35 : 1) * 0.6 * rms(y) / Math.max(1e-6, rms(rs));
    for (let i = 0; i < T; i++) y[i] += rs[i] * ra;
    return y;
  };
  const L = bank(1), R = bank(0), out = new Float32Array(T), dR = Math.round(sr * 0.00045);
  for (let i = 0; i < T; i++) out[i] = L[i] + (i >= dR ? R[i - dR] : 0);
  bq(out, 'pk', 115, 0.9, sr, 7); bq(out, 'pk', 380, 1.2, sr, 2); bq(out, 'pk', 2300, 0.8, sr, 2.5); bq(out, 'lp', 9500, 0.7, sr); bq(out, 'hp', 32, 0.7, sr);
  const ins = new Float32Array(T); for (let i = 0; i < T; i++) ins[i] = noise[(i * 7 + 101) % N] * intake[i];
  bq(ins, 'bp', 900 + 500 * hi, 0.9, sr); bq(ins, 'pk', 2600, 2, sr, 6);
  const me = new Float32Array(T); for (let i = 0; i < T; i++) me[i] = noise[(i * 3 + 55) % N] * mech[i];
  bq(me, 'hp', 2800, 0.7, sr);
  const ro = rms(out), ia = (0.1 + 0.3 * load * hi) * ro / Math.max(1e-6, rms(ins)), ma = (0.05 + 0.03 * (1 - load)) * ro / Math.max(1e-6, rms(me));
  for (let i = 0; i < T; i++) out[i] += ins[i] * ia + me[i] * ma;
  // saturation: drive rises with load and RPM (that crackling edge of open headers at full song)
  const seg = out.subarray(T - N), g0 = 0.32 / rms(seg), drive = 1 + 2.6 * load * hi + 0.6 * hi;
  const res = new Float32Array(N); for (let i = 0; i < N; i++) res[i] = Math.tanh(seg[i] * g0 * drive) / Math.tanh(drive * 0.9);
  // high-pass once more, run over 2 loops so the filter state is periodic
  const two = new Float32Array(2 * N); two.set(res); two.set(res, N); bq(two, 'hp', 36, 0.7, sr); res.set(two.subarray(N));
  const g1 = 0.2 / rms(res); for (let i = 0; i < N; i++) res[i] *= g1;
  return closeLoop(res,sr);
}

// Original synthesized heavy 14L inline-six, not a recording of a branded engine.
// Even nominal firing spacing; cylinder imbalance, cycle wander and injection knocks
// give a heavy idle rather than incorrectly turning the six into a high-revving V8.
export function synthDiesel(sr,rpm,mode,seed=3){
 const cyc=120/rpm,k=Math.max(4,Math.round(.95/cyc)),N=Math.round(k*cyc*sr),cs=N/k,T=N*3,jake=mode==='jake',on=mode==='on',lo=Math.max(0,1-(rpm-600)/1100);
 const flow=new Float32Array(T),clatter=new Float32Array(T),breath=new Float32Array(T),noise=new Float32Array(N),rand=rng(seed+991);for(let i=0;i<N;i++)noise[i]=rand()*2-1;
 for(let rep=0;rep<3;rep++){const r=rng(seed*97+19);for(let cycle=0;cycle<k;cycle++)for(let cylinder=0;cylinder<6;cylinder++){
  const wander=(r()-.5)*cs*(.002+.005*lo),at=rep*N+cycle*cs+cylinder*cs/6+wander,strength=(.84+.22*Math.sin(cylinder*2.1)+.13*r())*(1+lo*.12*Math.sin(cycle*2.4));
  const amp=strength*(jake?1.55:on?1:.45),width=cs*(jake?.020:on?.073:.060);pulse(flow,at,width,amp,jake?.11:.20);if(jake)pulse(flow,at+cs*.019,width*.62,amp*.44,.15);
  env(clatter,at+sr*.0008,Math.round(sr*(on?.0022:.0016)),strength*(jake?.15:on?.75:.46));env(breath,at,Math.round(width*3),amp);
 }}
 const exhaust=new Float32Array(T),knock=new Float32Array(T),intake=new Float32Array(T);for(let i=1;i<T;i++){exhaust[i]=(flow[i]-flow[i-1])*sr/2600;knock[i]=noise[i%N]*clatter[i];intake[i]=noise[(i*7+13)%N]*breath[i];}
 pipe(exhaust,sr,3.35,jake?.52:.40,.22);pipe(exhaust,sr,.68,.18,.45);bq(exhaust,'hp',24,.7,sr);bq(exhaust,'lp',jake?2300:on?1250:620,.72,sr);bq(exhaust,'pk',rpm*.05,.85,sr,8);bq(exhaust,'pk',108,.85,sr,on?5:3);
 bq(knock,'bp',jake?1700:1850,1.1,sr);bq(knock,'lp',3200,.7,sr);bq(intake,'bp',jake?1200:on?410:190,.8,sr);
 const er=rms(exhaust),kg=er*(jake?.12:on?.23:.18)/rms(knock),ig=er*(jake?.38:on?.25:.12)/rms(intake),out=new Float32Array(N),base=T-N;
 for(let i=0;i<N;i++){const time=i/sr,crank=Math.sin(TAU*(k*2*sr/N)*time),heavy=crank*.11*er*(1+lo*.3*Math.sin(TAU*(k*sr/N)*time));out[i]=exhaust[base+i]+knock[base+i]*kg+intake[base+i]*ig+heavy;}
 const drive=(jake?1.8:on?1.05:.85)*.27/rms(out);for(let i=0;i<N;i++)out[i]=Math.tanh(out[i]*drive);const scale=.2/rms(out);for(let i=0;i<N;i++)out[i]*=scale;return closeLoop(out,sr);
}

// a backfire / header pop: a sharp crack, a burst of flame noise and a low thump
export function synthPop(sr, seed) {
  const r = rng(seed * 977 + 1), N = Math.round(sr * 0.14), x = new Float32Array(N), f0 = 55 + r() * 40, tau = 0.006 + r() * 0.012;
  for (let i = 0; i < N; i++) { const t = i / sr; x[i] = (r() * 2 - 1) * Math.exp(-t / tau) * 1.0 + Math.sin(TAU * f0 * t) * Math.exp(-t / 0.03) * 0.8 + (i < 3 ? 2.5 : 0); }
  bq(x, 'pk', 500 + r() * 600, 0.7, sr, 6); bq(x, 'lp', 5000, 0.7, sr);
  const g = 1 / Math.max(...x.map(Math.abs)); for (let i = 0; i < N; i++) x[i] = Math.tanh(x[i] * g * 2.2) * 0.9;
  return x;
}

// RPM / load state for one car (dirt late models run a single gear: RPM follows the rear wheels, plus wheelspin flare
// and clutch slip off the line). Also produces lift-off crackle windows and the rev-limiter cut.
export class RevModel {
  constructor(o = {}) { Object.assign(this, { idle: V8.idle, limit: V8.limit, perMs: 196 }, o); this.rpm = this.idle; this.load = 0; this.cut = 0; this.crackle = 0; this.prevThr = 0; this.lim = 0; }
  step(dt, speed, wheelSpin, throttle, free=false) {
    dt=Number.isFinite(dt)?clampAudio(dt,0,.15):0;speed=Number.isFinite(speed)?speed:0;wheelSpin=Number.isFinite(wheelSpin)?clampAudio(wheelSpin,0,1):0;throttle=Number.isFinite(throttle)?clampAudio(throttle,0,1):0;
    this.clock=(this.clock||0)+dt;
    const wheel=Math.abs(speed)*this.perMs*(1+wheelSpin*.32);
    const hunt=throttle<.06&&wheel<1100?18*Math.sin(this.clock*2*Math.PI*.31)+8*Math.sin(this.clock*2*Math.PI*.73+.4):0;
    if(throttle-this.prevThr>.45&&this.rpm<2500)this.stab=.09;
    this.stab=Math.max(0,(this.stab||0)-dt);
    const launch=this.idle+throttle*6500*Math.max(0,1-Math.abs(speed)/14);
    let target=free?this.idle+throttle*(7900-this.idle):Math.max(this.idle+throttle*500,wheel+throttle*950,launch);
    target=Math.max(this.idle-35,target-this.stab/.09*1500);if(throttle<.06&&wheel<1100)target=this.idle+hunt;
    this.cut=Math.max(0,this.cut-dt);
    if(this.rpm>=this.limit&&throttle>.4){this.cut=.045;this.lim=.25;}
    this.lim=Math.max(0,this.lim-dt);if(this.cut>0)target=Math.min(target,this.limit-450);
    const tau=target>this.rpm?(throttle>.3?.052:.2):(this.cut>0?.03:free||Math.abs(speed)<2?.42:.16);
    this.rpm+=(target-this.rpm)*(1-Math.exp(-dt/tau));this.rpm=clampAudio(this.rpm,650,this.limit+60);
    const thr=this.cut>0?0:throttle;this.load+=(thr-this.load)*(1-Math.exp(-dt/(thr>this.load?.04:.08)));
    if(this.prevThr>.6&&throttle<.25&&this.rpm>3200)this.crackle=.5+Math.random()*.7;
    this.crackle=Math.max(0,this.crackle-dt);this.prevThr=throttle;
    return this;
  }
}

// A periodic, band-limited 720-degree combustion waveform. There are no
// per-firing resets, noise-envelope edges, or RPM-bank phase crossfades.

// A periodic, band-limited 720-degree combustion waveform. There are no
// per-firing resets, noise-envelope edges, or RPM-bank phase crossfades.
export function smoothV8(sr,rpm=3500,load=1){
  const n=Math.round(sr*120/rpm),a=new Float32Array(n),amps=[1,.72,.93,.65,1.02,.78,.9,.68];
  for(let h=1;h<=48;h++){let re=0,im=0;for(let k=0;k<8;k++){const phase=2*Math.PI*h*k/8;re+=amps[k]*Math.cos(phase);im-=amps[k]*Math.sin(phase);}
    const roll=1/(1+(h/(load?24:12))**3),gain=roll/Math.pow(h,.78);for(let j=0;j<n;j++){const phase=2*Math.PI*h*j/n+.22*h/(h+3);a[j]+=gain*(re*Math.cos(phase)-im*Math.sin(phase));}}
  const g=.2/rms(a);for(let j=0;j<n;j++)a[j]*=g;return a;
}
class RoadVoice{
 constructor(au,{panned=false,offset=0}={}){const c=this.c=au.ctx;this.au=au;this.mix=c.createGain();this.body=c.createBiquadFilter();this.body.type='lowshelf';this.body.frequency.value=160;this.body.gain.value=0;this.tone=c.createBiquadFilter();this.tone.type='lowpass';this.tone.frequency.value=8000;this.tone.Q.value=.45;this.out=c.createGain();this.out.gain.value=0;this.body.connect(this.tone);this.tone.connect(this.out);this.node=this.out;if(panned){this.pan=c.createStereoPanner();this.out.connect(this.pan);this.node=this.pan;}this.layers=[];this.startSynth(offset);this.rev=new RevModel();}
 startSynth(offset=0){const c=this.c,au=this.au;this.mix ||= c.createGain();this.mix.connect(this.body);const startAt=au.offline?0:c.currentTime+.025;
 for(const name of['on','off']){const source=c.createBufferSource(),g=c.createGain();source.buffer=au.cleanV8[name];source.loop=true;g.gain.value=0;source.connect(g);g.connect(this.mix);source.start(startAt,offset%source.buffer.duration);this.layers.push({name,s:source,g,rpm:name==='off'?au.offBaseRPM:au.cleanBaseRPM,target:0});}}
 installSamples(options){
  const c=this.c,t=c.currentTime;this.mix.disconnect();for(const l of this.layers){try{l.s.stop(t);}catch{}l.s.disconnect();l.g.disconnect();}this.layers=[];this.mix=null;
  try{const n=new AudioWorkletNode(c,'jayden-dyno',{numberOfInputs:0,numberOfOutputs:1,outputChannelCount:[1],processorOptions:options});this.sampler=n;this.sampleRPM=n.parameters.get('rpm');this.sampleLoad=n.parameters.get('load');this.sampleActive=n.parameters.get('active');this.sampleActiveTarget=this.lastVolume>1e-4?1:0;this.sampleRPMTarget=this.mapRPM(this.lastRPM||V8.idle);this.sampleLoadTarget=this.lastLoad||0;this.sampleActive.setValueAtTime(this.sampleActiveTarget,t);this.sampleRPM.setValueAtTime(this.sampleRPMTarget,t);this.sampleLoad.setValueAtTime(this.sampleLoadTarget,t);n.connect(this.body);n.onprocessorerror=()=>{this.restoreSynth();this.au.sampleState='processor-fallback';};}
  catch(e){this.restoreSynth();throw e;}
 }
 mapRPM(rpm){const [lo,hi]=this.au.sampleRange;return lo+(clampAudio(rpm,V8.idle,V8.limit)-V8.idle)/(V8.limit-V8.idle)*(hi-lo);}
 restoreSynth(){if(this.sampler){this.sampler.onprocessorerror=null;this.sampler.port.postMessage({dispose:true});this.sampler.port.close();this.sampler.disconnect();this.sampler=null;this.sampleRPM=this.sampleLoad=this.sampleActive=null;}if(!this.layers.length)this.startSynth();this.au.stats.sampleVoices=[this.au.player,...this.au.aiPool].filter(v=>v.sampler).length;this.au.stats.engineSources=2*([this.au.player,...this.au.aiPool].length-this.au.stats.sampleVoices);}

 connect(n){this.node.connect(n);}
 update(t,rpm,w,vol,pitch=1,tau=.075){this.lastRPM=rpm;this.lastLoad=w.on||0;this.lastVolume=vol;if(this.sampler){const active=vol>1e-4?1:0,mapped=this.mapRPM(rpm)*pitch,load=w.on||0;if(active!==this.sampleActiveTarget){this.sampleActive.setTargetAtTime(active,t,.035);this.sampleActiveTarget=active;}if(Math.abs(mapped-this.sampleRPMTarget)>1){this.sampleRPM.setTargetAtTime(mapped,t,.025);this.sampleRPMTarget=mapped;}if(Math.abs(load-this.sampleLoadTarget)>.003||load===0&&this.sampleLoadTarget!==0){this.sampleLoad.setTargetAtTime(load,t,.025);this.sampleLoadTarget=load;}}const loaded=w.on||0,near=1000+rpm*(.27-.055*loaded),cabin=this.au.cabTone&&this===this.au.player,cutoff=cabin?Math.min(1450,near):near/(1+(this.distance||0)/65);this.tone.frequency.setTargetAtTime(Math.max(650,Math.min(this.c.sampleRate*.43,cutoff)),t,.06);for(const l of this.layers){const rate=clampAudio(rpm/l.rpm*pitch,.2,5.2),gain=w[l.name]||0;if(Math.abs(gain-l.target)>.003||gain===0&&l.target!==0){l.g.gain.setTargetAtTime(gain,t,w.cut?.003:.035);l.target=gain;}if(Math.abs((l.rate??-1)-rate)>.002){l.s.playbackRate.setTargetAtTime(rate,t,.035);l.rate=rate;}}if(!this.sampleSwapping)this.out.gain.setTargetAtTime(vol*(w.cut?.025:1),t,w.cut?.002:.015);}

 place(t,x,y,z,L){if(!this.pan)return;const dx=x-L.x,dz=z-L.z,d=Math.hypot(dx,dz)||1,side=(-L.fz*dx+L.fx*dz)/d;this.pan.pan.setTargetAtTime(clampAudio(side,-.95,.95),t,.1);this.distance=d;this.distanceGain=1/(1+d/14);}
 retire(t){this.lastVolume=0;this.out.gain.setTargetAtTime(0,t,.04);this.sampleActive?.setTargetAtTime(0,t,.035);this.sampleActiveTarget=0;}
}
const clampAudio=(x,a,b)=>Math.min(b,Math.max(a,x));

// one sample-based engine voice (crossfaded + pitch-shifted loop bank)
class Voice {
  constructor(au, set, { panned = false, offset = 0 } = {}) {
    const c = au.ctx; this.au = au; this.set = set; this.c = c;
    this.mix = c.createGain(); this.tone = c.createBiquadFilter(); this.tone.type = 'lowpass'; this.tone.frequency.value = 9000; this.tone.Q.value = 0.6;
    this.body = c.createBiquadFilter(); this.body.type = 'lowshelf'; this.body.frequency.value = 160; this.body.gain.value = 0;
    this.out = c.createGain(); this.out.gain.value = 0;
    this.mix.connect(this.body); this.body.connect(this.tone); this.tone.connect(this.out);
    this.node = this.out;
    if (panned) { this.pan = new PannerNode(c, { panningModel: 'equalpower', distanceModel: 'inverse', refDistance: 7, rolloffFactor: 1.15, maxDistance: 1000 }); this.out.connect(this.pan); this.node = this.pan; }
    this.layers = [];
    for (const [name, bufs] of Object.entries(set.bufs)) bufs.forEach((b, i) => {
      const s = c.createBufferSource(); s.buffer = b; s.loop = true; const g = c.createGain(); g.gain.value = 0; s.connect(g); g.connect(this.mix);
      s.start(au.t0 ?? 0, (offset + i * 0.137) % b.duration); this.layers.push({ name, i, s, g, rpm: set.rpms[i] });
    });
  }
  // rpm, mix weights per bank name e.g. {on: 0.8, off: 0.2}, vol, extra pitch factor (doppler), smoothing tau
  update(t, rpm, w, vol, pitch = 1, tau = 0.025) {
    const R = this.set.rpms; let i = 0; while (i < R.length - 2 && rpm > R[i + 1]) i++;
    const x = Math.min(1, Math.max(0, (rpm - R[i]) / (R[i + 1] - R[i]))), ga = Math.cos(x * Math.PI / 2), gb = Math.sin(x * Math.PI / 2);
    for (const l of this.layers) {
      const gw = (l.i === i ? ga : l.i === i + 1 ? gb : 0) * (w[l.name] || 0);
      if(Math.abs(gw-(l.target||0))>.001){l.g.gain.setTargetAtTime(gw,t,Math.max(.035,tau));l.target=gw;}
      if (gw > 0.0005 || Math.abs(l.i - i) <= 2) l.s.playbackRate.setTargetAtTime(Math.min(3, rpm / l.rpm * pitch), t, tau);
    }
    this.out.gain.setTargetAtTime(vol, t, tau);
  }
  place(t, x, y, z) { if (!this.pan) return; const p = this.pan; p.positionX.setTargetAtTime(x, t, 0.02); p.positionY.setTargetAtTime(y, t, 0.02); p.positionZ.setTargetAtTime(z, t, 0.02); }
  connect(n) { this.node.connect(n); }
  retire(t){this.out.gain.setTargetAtTime(0,t,.025);for(const l of this.layers){try{l.s.stop(t+.18);}catch(e){}}this.layers[0].s.onended=()=>{for(const l of this.layers)l.s.disconnect();this.node.disconnect();};}
  dispose() { for (const l of this.layers) { try { l.s.stop(); } catch (e) {} l.s.disconnect(); } this.node.disconnect(); }
}

// loudness of a V8 voice by rpm/load (normalized loops -> put the dynamics back)
const v8Vol = (rpm, load) => (0.28 + 0.72 * Math.pow(Math.min(1, rpm / 8000), 0.8)) * (0.42 + 0.58 * load);

export class GameAudio {
  constructor(app, ctx = null) { this.app = app; this.ctx = ctx; this.offline = !!ctx; this.muted = !ctx && storage.getItem('dtt.mute') === '1'; this.ai = new Map(); this.lastT = 0; if (ctx) this.build(); }
  now() { return this.ctx.currentTime; }
  ensure() {
    if (this.ctx && this.engineBuilt) return true;
    try { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false; this.ctx ||= globalThis.DTTMusicBoot?.ctx || new AC({latencyHint:this.app?.isMobile?'playback':'balanced'}); this.build(); return true; } catch (e) { console.warn('audio off', e); return false; }
  }
  buildMaster() {
    const c = this.ctx;
    if(this.master)return;
    this.master = c.createGain(); this.comp = c.createDynamicsCompressor(); this.comp.threshold.value = -14; this.comp.knee.value = 10; this.comp.ratio.value = 4; this.comp.attack.value = 0.004; this.comp.release.value = 0.2;
    this.limiter=c.createDynamicsCompressor();this.limiter.threshold.value=-3;this.limiter.knee.value=0;this.limiter.ratio.value=20;this.limiter.attack.value=.001;this.limiter.release.value=.12;
    this.master.connect(this.comp);this.comp.connect(this.limiter);this.limiter.connect(c.destination); this.applyVolume();
  }
  ensureMusic(){try{if(!this.ctx){const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return false;this.ctx=globalThis.DTTMusicBoot?.ctx||new AC({latencyHint:this.app?.isMobile?'playback':'balanced'});}this.buildMaster();if(!this.music&&!this.offline){this.music=new MenuMusic(this);this.music.setPhase(this.app?.paused?'pause':this.app?.phase||'title');}return true;}catch(e){console.warn('music off',e);return false;}}
  build(){
    this.buildMaster();const c=this.ctx,sr=c.sampleRate;this.voiceLimit=this.app?.isMobile?1:2;this.stats={controlUpdates:0,poolRebinds:0,engineSources:2*(this.voiceLimit+1),nativeSampleRate:sr};
    this.engineBus = c.createGain(); this.engineBus.connect(this.master);
    this.aiTone = c.createBiquadFilter(); this.aiTone.type = 'lowpass'; this.aiTone.frequency.value = 12000; this.aiBus = c.createGain(); this.aiBus.gain.value = 0.7; this.aiBus.connect(this.aiTone); this.aiTone.connect(this.master);
    const mk = (arr) => { const b = c.createBuffer(1, arr.length, sr); b.copyToChannel(arr, 0); return b; };
    const t0 = performance?.now?.() ?? 0;
    this.offBaseRPM=RACING_V8.offRPM;this.cleanBaseRPM=3500;this.cleanV8={on:mk(racingV8(sr,this.cleanBaseRPM,1)),off:mk(racingV8(sr,RACING_V8.offRPM,0))};
    this.pops=[0,1].map(i=>mk(synthPop(sr,i+1)));this.synthMs=(performance?.now?.()??0)-t0;
    this.player=new RoadVoice(this);this.player.connect(this.engineBus);this.playerRev=new RevModel();
    this.aiPool=Array.from({length:this.voiceLimit},(_,i)=>{const v=new RoadVoice(this,{panned:true,offset:i*.017});v.connect(this.aiBus);return v;});
    // shared noise for dirt / field / crowd
    const nb = c.createBuffer(1, sr * 2, sr), ch = nb.getChannelData(0); let last = 0; const r = rng(5);
    for (let i = 0; i < ch.length; i++) { const w = r() * 2 - 1; last = (last + 0.02 * w) / 1.02; ch[i] = w * 0.6 + last * 3; }
    closeLoop(ch,sr);
    const noise = (type, f, q) => { const n = c.createBufferSource(); n.buffer = nb; n.loop = true; const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = c.createGain(); g.gain.value = 0; n.connect(fl); fl.connect(g); g.connect(this.master); n.start(); return { fl, g }; };
    this.noiseBuffer=nb;
    this.tire = noise('bandpass', 1800, 0.8); this.roar = noise('lowpass', 220, 0.7); this.crowd = noise('bandpass', 700, 0.5);
    this.engineBuilt=true;if(!this.offline&&!this.music){this.music=new MenuMusic(this);this.music.setPhase(this.app?.paused?'pause':this.app?.phase||'title');}
  }
  ensureDiesel() {
    if (this.diesel) return; const c = this.ctx, sr = c.sampleRate, mk = (arr) => { const b = c.createBuffer(1, arr.length, sr); b.copyToChannel(arr, 0); return b; };
    const set=this.dieselSet ||= { rpms: DIESEL.rpms, bufs: { on: DIESEL.rpms.map((r, i) => mk(synthDiesel(sr, r, 'on', 3 + i))), off: DIESEL.rpms.map((r, i) => mk(synthDiesel(sr, r, 'off', 9 + i))), jake: DIESEL.rpms.map((r, i) => mk(synthDiesel(sr, r, 'jake', 17 + i))) } };
    this.diesel = new Voice(this, set); this.diesel.connect(this.engineBus);
    this.turbo=c.createOscillator();this.turbo.type='sine';this.turbo.frequency.value=1200;this.turboGain=c.createGain();this.turboGain.gain.value=0;this.turbo.connect(this.turboGain);this.turboGain.connect(this.engineBus);this.turbo.start();
    this.dTone=0;this.truckEvents={upshift:0,downshift:0,blowoff:0,airBrake:0,stopHiss:0,jake:0};

  }
  unlockMusic(){if(!this.muted&&this.ensureMusic()){this.ctx.resume?.().catch?.(()=>{});this.music?.unlock();}}
  setMusicPhase(phase){if(!this.music&&globalThis.DTTMusicBoot?.ctx)this.ensureMusic();(this.music||globalThis.DTTMusicBoot)?.setPhase(phase);}
  applyVolume() { this.music?.apply();if(this.master)this.master.gain.setTargetAtTime(this.muted?0:(this.app?.settings?.volume??.8),this.ctx.currentTime,.018); }
  loadDyno(){if(!this.samplePromise){this.samplePromise=import('./dyno-sampler.js').then(m=>m.loadDyno(this)).catch(e=>{this.sampleState='fallback';this.sampleError=String(e.message||e);return false;});}return this.samplePromise;}
  live() { if (this.muted || !this.ensure()) return false; if (!this.offline && this.ctx.state === 'suspended') this.ctx.resume?.().catch?.(() => {}); return true; }
  horn(time){if(this.muted||(!this.offline&&!this.ensureMusic()))return;const c=this.ctx,t=time??c.currentTime;if(t-(this.hornAt??-1)<.5)return;this.hornAt=t;this.ctx.resume?.().catch?.(()=>{});const g=c.createGain(),f=c.createBiquadFilter();f.type='lowpass';f.frequency.value=1100;f.Q.value=.5;f.connect(g);g.connect(this.master);g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(.055,t+.035);g.gain.setValueAtTime(.055,t+.25);g.gain.exponentialRampToValueAtTime(.0001,t+.46);let ended=0;this.activeHorns=(this.activeHorns||0)+1;for(const hz of[196,246.94]){const o=c.createOscillator();o.type='sawtooth';o.frequency.setValueAtTime(hz*.97,t);o.frequency.exponentialRampToValueAtTime(hz,t+.06);o.connect(f);o.start(t);o.stop(t+.48);o.onended=()=>{o.disconnect();if(++ended===2){f.disconnect();g.disconnect();this.activeHorns--;}};}}
  pop(t, dest, gain = 0.5) {
    const c = this.ctx, s = c.createBufferSource(); s.buffer = this.pops[(Math.random() * this.pops.length) | 0]; s.playbackRate.value = 0.8 + Math.random() * 0.5;
    const g = c.createGain(); g.gain.setValueAtTime(0,t);g.gain.linearRampToValueAtTime(gain,t+.006);g.gain.setTargetAtTime(0,t+.07,.035);s.connect(g); g.connect(dest); s.start(t); s.onended = () => { s.disconnect(); g.disconnect(); };
  }
  // generic single engine (loading the car onto the hauler, menus): rpm01 0..1
  set(rpm01, load = 0.5, vol = 0.12, t) {
    if (!this.live()) return;if(!this.offline&&!this.samplePromise)this.loadDyno(); t = t ?? this.now();
    const rpm = V8.idle + Math.max(0, rpm01 - 0.12) * 7000;
    this.player.update(t, rpm, { on: load, off: 1 - load }, vol * 2.2 * v8Vol(rpm, load), 1, 0.06);
    this.cam(t, 'chase');
  }
  paddock(f,t){
    if(!this.live())return;if(!this.offline&&!this.samplePromise)this.loadDyno();t=t??this.now();const interval=this.app?.isMobile ? .05 : 1/30;
    if(this.nextPadT!==undefined&&t+1e-6<this.nextPadT)return;
    const dt=this.lastPadT===undefined?(f.dt||.016):clampAudio(t-this.lastPadT,.001,.15);this.lastPadT=t;this.nextPadT=t+interval;
    const p=this.playerRev.step(dt,f.speed||0,0,f.throttle||0,!!f.freeRev);
    this.player.update(t,p.rpm,{on:p.load,off:1-p.load,cut:p.cut>0},.26*v8Vol(p.rpm,p.load),1,.06);this.rpm=p.rpm;this.cam(t,'chase');
  }
  cam(t, mode) {
    // in-car: firewall + helmet -> muffled, more low-end rumble; chase: open, bright headers
    const inCar=mode==='incar';if(this.cabTone===inCar)return;this.cabTone=inCar;
    this.player.tone.frequency.setTargetAtTime(inCar ? 1500 : 9500, t, 0.1); this.player.body.gain.setTargetAtTime(inCar ? 5 : 0, t, 0.1);
    this.aiTone.frequency.setTargetAtTime(inCar ? 1900 : 12000, t, 0.1);
  }
  // per-frame race update. f = { dt, cam:'chase'|'incar'|'tv', L:{x,y,z,fx,fy,fz}, player:{speed,wheelSpin,throttle,x,y,z}|null, cars:[{id,x,y,z,vx,vz,speed,wheelSpin,throttle}] }
  race(f, t) {
    if (!this.live()) return;if(!this.offline&&!this.samplePromise)this.loadDyno(); t = t ?? this.now(); const c = this.ctx, dt = f.dt || 1 / 60;
    // Audio-clock cadence, not render-frame cadence. No topology changes occur
    // here: a bounded persistent voice pool is faded/rebound, never recreated.
    const interval=this.app?.isMobile ? .05 : 1/30;if(this.nextRaceT!==undefined&&t+1e-6<this.nextRaceT)return;
    const elapsed=this.lastRaceT===undefined?dt:clampAudio(t-this.lastRaceT,.001,.15);this.lastRaceT=t;this.nextRaceT=(this.nextRaceT??t)+interval;if(this.nextRaceT<t)this.nextRaceT=t+interval;this.stats.controlUpdates++;
    const L=f.L,lv=this.lPrev?{x:clampAudio((L.x-this.lPrev.x)/elapsed,-75,75),z:clampAudio((L.z-this.lPrev.z)/elapsed,-75,75)}:{x:0,z:0};this.lPrev={x:L.x,z:L.z};this.cam(t,f.cam);
    if(f.player){const p=f.player,pr=this.playerRev.step(elapsed,p.speed,p.wheelSpin,p.throttle,p.freeRev),vol=.55*v8Vol(pr.rpm,pr.load)*(pr.cut>0?.86:1);this.player.update(t,pr.rpm,{on:pr.load,off:1-pr.load,cut:pr.cut>0},vol,1,.075);this.rpm=pr.rpm;}else this.player.update(t,V8.idle,{on:0,off:1},0);
    if(this.rankAt===undefined||t>=this.rankAt){this.rankAt=t+.4;this.audible=[...f.cars].filter(a=>(a.x-L.x)**2+(a.z-L.z)**2<90**2).sort((a,b)=>((a.x-L.x)**2+(a.z-L.z)**2)*(this.ai.has(a.id)?.72:1)-((b.x-L.x)**2+(b.z-L.z)**2)*(this.ai.has(b.id)?.72:1)).slice(0,this.voiceLimit).map(a=>a.id);}
    const wanted=new Set(this.audible||[]);
    for(const[id,v]of this.ai)if(!wanted.has(id)||!f.cars.some(c=>c.id===id)){v.retire(t);v.availableAt=t+.16;this.ai.delete(id);}
    for(const id of wanted)if(!this.ai.has(id)){const v=this.aiPool.find(v=>![...this.ai.values()].includes(v)&&t>=(v.availableAt??-1));if(v){v.rev=new RevModel();const car=f.cars.find(a=>a.id===id);if(car){v.rev.rpm=clampAudio(Math.abs(car.speed)*196,V8.idle,V8.limit);v.rev.load=car.throttle||0;}v.dop=1;this.ai.set(id,v);this.stats.poolRebinds++;}}
    for(const[id,v]of this.ai){const a=f.cars.find(c=>c.id===id);if(!a)continue;const r=v.rev.step(elapsed,a.speed,a.wheelSpin,a.throttle),dx=a.x-L.x,dz=a.z-L.z,dist=Math.hypot(dx,dz)||1,radial=((a.vx-lv.x)*dx+(a.vz-lv.z)*dz)/dist;v.dop+=(clampAudio(343/(343+radial),.94,1.06)-v.dop)*(1-Math.exp(-elapsed*3));v.place(t,a.x,a.y+.6,a.z,L);v.update(t,r.rpm,{on:r.load,off:1-r.load,cut:r.cut>0},.42*v8Vol(r.rpm,r.load)*v.distanceGain,v.dop,.1);}
  }
  // highway semi. f = { dt, speed (m/s), throttle 0/1, brake 0/1, cam }
  truck(f, t) {
    if (!this.live()) return; t = t ?? this.now(); this.ensureDiesel(); const dt = f.dt || 1 / 60;
    const ratio = n => 48 * Math.pow(1.33, 10 - n);
    let initialGear=1;while(initialGear<10&&f.speed*ratio(initialGear)>1700)initialGear++;
    const g = this.gb || (this.gb = { gear:initialGear, rpm:Math.max(DIESEL.idle,Math.min(2100,f.speed*ratio(initialGear))), shiftT: 0, load: 0, jake: 0 });                                                    // 10-speed, ~1450 rpm @ 65 mph in top
    let rpm = f.speed * ratio(g.gear);
    if (g.shiftT <= 0) { if (rpm > 1850 && g.gear < 10) { g.gear++;this.truckEvents.upshift++; g.shiftT = 0.45;this.air(.09,.10,t,1100); } else if (rpm < 1050 && g.gear > 1) { g.gear--;this.truckEvents.downshift++; g.shiftT = 0.35;this.air(.055,.08,t,1000); } }
    g.shiftT -= dt; rpm = Math.max(DIESEL.idle + (f.throttle ? 250 : 0), f.speed * ratio(g.gear));
    if (f.speed < 2.5) rpm = DIESEL.idle + f.throttle * 700;rpm=Math.min(2100,rpm);
    g.rpm += (rpm - g.rpm) * (1 - Math.exp(-dt / (g.shiftT > 0 ? 0.12 : 0.25)));
    const thr = g.shiftT > 0 ? 0 : f.throttle;
    g.load += (thr - g.load) * (1 - Math.exp(-dt / 0.15));
    const wantJake = f.jakeOn!==false&&!f.throttle && f.speed > 8 && g.rpm > 1000 ? (f.brake ? 1 : 0.75) : 0;
    if(wantJake>0&&g.jake<.05)this.truckEvents.jake++;
    g.jake += (wantJake - g.jake) * (1 - Math.exp(-dt / 0.06));
    this.truckJake=g.jake;
    g.boost=(g.boost||0)+(g.load-(g.boost||0))*(1-Math.exp(-dt/.6));
    const cab=f.cam==='cab';this.turbo.frequency.setTargetAtTime(1000+g.boost*2400+g.rpm*.3,t,.15);this.turboGain.gain.setTargetAtTime((g.boost**1.5*.018)*(cab?.33:1),t,.12);
    if((g.prevThrottle||0)>.6&&f.throttle<.2&&g.boost>.25){this.truckEvents.blowoff++;this.air((cab?.45:1)*.13*g.boost,.3,t,2300);}
    if((g.prevBrake||0)<.2&&f.brake>.5){this.truckEvents.airBrake++;this.air(cab?.035:.08,.4,t,1700);}
    if((g.prevSpeed||0)>.55&&f.speed<.55){this.truckEvents.stopHiss++;this.air(cab?.065:.12,.55,t,2000);}
    if(f.bump>.1&&(g.rattleT||0)<t){this.air(cab?.025:.012,.10,t,720);g.rattleT=t+.2;}
    g.prevThrottle=f.throttle;g.prevBrake=f.brake;g.prevSpeed=f.speed;
    this.tire.fl.frequency.setTargetAtTime(250+f.speed*18,t,.2);this.tire.g.gain.setTargetAtTime(Math.min(.038,f.speed*.001)*(cab?.65:1),t,.2);
    this.roar.fl.frequency.setTargetAtTime(400+f.speed*28,t,.2);this.roar.g.gain.setTargetAtTime(Math.min(.025,f.speed*f.speed*.00002)*(cab?.35:1),t,.2);

    const w = { on: g.load * (1 - g.jake), off: (1 - g.load) * (1 - g.jake), jake: g.jake };
    const inCab = f.cam === 'cab';
    this.diesel.tone.frequency.setTargetAtTime(inCab ? 1050 : 4800, t, 0.1); this.diesel.body.gain.setTargetAtTime(inCab ? 2.5 : 0, t, 0.1);
    this.diesel.update(t, g.rpm, w, (inCab?.67:1)*(0.24 + 0.36 * g.load + 0.36 * g.jake) * (0.68 + 0.32 * g.rpm / 2000), 1, 0.04);
    this.player.update(t, V8.idle, { on: 0, off: 1 }, 0, 1, 0.05);
    this.rpm = g.rpm;
  }
  // Short filtered pneumatic transients; one shared noise buffer, no worklet per cylinder.
  air(gain=.08,length=.3,t,freq=1800){
    if(!this.ctx||!this.engineBuilt||this.muted)return;const c=this.ctx;t=t??c.currentTime;const n=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain();n.buffer=this.noiseBuffer;f.type='bandpass';f.frequency.value=freq;f.Q.value=.6;g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(.0002,gain),t+.008);g.gain.exponentialRampToValueAtTime(.0001,t+length);n.connect(f);f.connect(g);g.connect(this.engineBus);n.start(t);n.stop(t+length+.02);n.onended=()=>{n.disconnect();f.disconnect();g.disconnect();};
  }
  surface(slide, speed01, cushion = 0, t) {
    if (this.muted || !this.ctx||!this.engineBuilt) return; t = t ?? this.now();
    const v = Math.min(1, speed01) * (0.012 + Math.min(1, slide) * 0.035 + cushion * 0.018);
    if(this.nextSurfaceT!==undefined&&t<this.nextSurfaceT)return;this.nextSurfaceT=t+.05;
    this.tire.g.gain.setTargetAtTime(v, t, 0.08); this.tire.fl.frequency.setTargetAtTime(900 + speed01 * 1600 - cushion * 400, t, 0.1);
  }
  field(near, excite = 0, t) {
    if (this.muted || !this.ctx||!this.engineBuilt) return; t = t ?? this.now(); const k = this.app?.settings?.crowd ?? 1;
    if(this.nextFieldT!==undefined&&t<this.nextFieldT)return;this.nextFieldT=t+.05;
    this.roar.g.gain.setTargetAtTime(k * (0.004 + Math.min(1, near) * 0.012), t, 0.15);          // the AI engines are real voices now; this is just rumble
    this.aiBus.gain.setTargetAtTime(0.7 * (0.35 + 0.65 * k), t, 0.2);
    this.crowd.g.gain.setTargetAtTime(k * (0.004 + Math.min(1, excite) * 0.03), t, 0.3);
  }
  crowdCheer() {
    if (this.muted || !this.ensure()) return; const t = this.now(), k = this.app?.settings?.crowd ?? 1;
    const g = this.crowd.g.gain; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0.09 * k, t + 0.4); g.setTargetAtTime(0.01 * k, t + 2.5, 1.2);
  }
  stop() {
    if (!this.ctx||!this.engineBuilt) return; const t = this.now();
    this.player.lastVolume=0;this.player.out.gain.cancelScheduledValues(t); this.player.out.gain.setTargetAtTime(0, t, 0.05);this.player.sampleActive?.setTargetAtTime(0,t,.035);this.player.sampleActiveTarget=0;
    if(this.turboGain){this.turboGain.gain.cancelScheduledValues(t);this.turboGain.gain.setTargetAtTime(0,t,.05);}
    if (this.diesel) { this.diesel.out.gain.cancelScheduledValues(t); this.diesel.out.gain.setTargetAtTime(0, t, 0.05); }
    for(const v of this.aiPool||[])v.retire(t);this.ai.clear();this.audible=[];this.rankAt=undefined;this.nextRaceT=undefined;this.lastRaceT=undefined;this.nextSurfaceT=undefined;this.nextFieldT=undefined;this.lPrev=null;this.gb=null;
    if(this.diesel){this.diesel.retire(t);this.diesel=null;if(this.turbo){const o=this.turbo,g=this.turboGain;o.stop(t+.2);o.onended=()=>{o.disconnect();g.disconnect();};this.turbo=null;this.turboGain=null;}}
    for (const g of [this.tire.g.gain, this.roar.g.gain, this.crowd.g.gain]) { g.cancelScheduledValues(t); g.setTargetAtTime(0, t, 0.05); }
  }
  toggleMute() { this.muted = !this.muted; storage.setItem('dtt.mute', this.muted ? '1' : '0'); if (this.muted) this.stop(); this.applyVolume();if(!this.muted)this.unlockMusic(); }
}

// 16-bit PCM WAV from channel arrays
export function wavBytes(chs, sr) {
  const n = chs[0].length, nc = chs.length, buf = new ArrayBuffer(44 + n * nc * 2), v = new DataView(buf);
  const ws = (o, s) => { for (let i = 0; i < s.length; i++) v.setUint8(o + i, s.charCodeAt(i)); };
  ws(0, 'RIFF'); v.setUint32(4, 36 + n * nc * 2, true); ws(8, 'WAVE'); ws(12, 'fmt '); v.setUint32(16, 16, true); v.setUint16(20, 1, true); v.setUint16(22, nc, true);
  v.setUint32(24, sr, true); v.setUint32(28, sr * nc * 2, true); v.setUint16(32, nc * 2, true); v.setUint16(34, 16, true); ws(36, 'data'); v.setUint32(40, n * nc * 2, true);
  let o = 44; for (let i = 0; i < n; i++) for (let c = 0; c < nc; c++) { const s = Math.max(-1, Math.min(1, chs[c][i])); v.setInt16(o, s < 0 ? s * 0x8000 : s * 0x7fff, true); o += 2; }
  return new Uint8Array(buf);
}
