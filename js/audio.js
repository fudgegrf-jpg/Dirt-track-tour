import {MenuMusic} from './menu-music.js';
// Engine & track audio. Everything is synthesized here (no sound files):
//  1) At startup we "record" seamless loops of a cross-plane V8 at several RPMs, on and off throttle, by modelling the
//     engine itself: the 1-8-4-3-6-5-7-2 firing order split onto two banks of open headers (that uneven per-bank
//     spacing is the V8 burble), each exhaust blowdown pulse, header-pipe reflections, exhaust rasp, carb induction
//     roar, valvetrain clatter and saturation at load. A big cam gives the idle its lope.
//  2) At run time each car plays those loops the way sample-based racing games do: crossfade the two nearest RPM
//     loops and pitch-shift them to the exact RPM, crossfade on-/off-throttle sets, add lift-off crackle and pops and
//     the rev limiter. AI cars are 3D-positioned (PannerNode) with distance falloff, air absorption and doppler.
//  3) The semi gets an inline-6 turbo diesel the same way, with a jake brake.
// The same code runs in an OfflineAudioContext to render the WAV checks in /audio-samples.
const TAU = Math.PI * 2;
export const V8 = { idle: 1050, limit: 8400, rpms: [850, 1500, 2400, 3500, 4800, 6200, 7600, 9000] };
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
  return res;
}

// Inline-6 turbo diesel (Detroit/Cummins style semi). mode: 'on' | 'off' | 'jake'
export function synthDiesel(sr, rpm, mode, seed = 3) {
  const cyc = 120 / rpm, k = Math.max(3, Math.round(0.7 / cyc)), N = Math.round(k * cyc * sr), cs = N / k, reps = 2, T = N * reps;
  const fl = new Float32Array(T), knock = new Float32Array(T), hiss = new Float32Array(T);
  const jake = mode === 'jake', on = mode === 'on';
  const w = Math.max(sr * 0.0005, cs * (jake ? 26 : 85) / 720);
  for (let rep = 0; rep < reps; rep++) {
    const r = rng(seed * 131 + 5);
    for (let c = 0; c < k; c++) for (let i = 0; i < 6; i++) {
      const t0 = rep * N + c * cs + i * cs / 6 + (r() - 0.5) * 0.01 * cs;
      const a = (jake ? 1.6 : on ? 1 : 0.3) * (1 + 0.08 * (r() * 2 - 1)) * (1 + 0.05 * Math.sin(i * 1.7));
      pulse(fl, t0, w, a);
      if (!jake) env(knock, t0 + w * 0.2, Math.round(sr * 0.0018), (on ? 1 : 0.55) * (0.8 + 0.4 * r()));
      env(hiss, t0, Math.round(w * (jake ? 4 : 2)), a);
    }
  }
  const nz = rng(seed + 99), noise = new Float32Array(N); for (let i = 0; i < N; i++) noise[i] = nz() * 2 - 1;
  const y = new Float32Array(T); for (let i = 1; i < T; i++) y[i] = (fl[i] - fl[i - 1]) * sr / 2000;
  pipe(y, sr, 2.6, jake ? 0.5 : 0.35, 0.35);
  if (!jake) { bq(y, 'lp', on?1800:700, 0.8, sr); bq(y, 'pk', 70, 1, sr, 7);bq(y,'pk',165,.9,sr,on?4:1); }                             // big muffler, stack
  else { bq(y, 'lp', 2600, 0.7, sr); bq(y, 'pk', 180, 1, sr, 5); }
  const kn = new Float32Array(T); for (let i = 0; i < T; i++) kn[i] = noise[i % N] * knock[i];
  bq(kn, 'bp', 3200, 1.1, sr); bq(kn, 'pk', 1500, 1.5, sr, 4);
  const hs = new Float32Array(T); for (let i = 0; i < T; i++) hs[i] = noise[(i * 5 + 17) % N] * hiss[i];
  bq(hs, 'hp', jake ? 900 : 1600, 0.7, sr);
  const ry = rms(y), ka = (jake ? 0 : on ? 0.40 : 0.24) * ry / Math.max(1e-6, rms(kn)), ha = (jake ? 0.5 : 0.08) * ry / Math.max(1e-6, rms(hs));
  const out = new Float32Array(N), base = T - N;
  // turbo whistle: rides on boost (on-throttle), pitched with RPM via playbackRate later
  const tf = 2200 + rpm * 1.6, ta = on ? 0.05 : 0.015;
  for (let i = 0; i < N; i++) out[i] = y[base + i] + kn[base + i] * ka + hs[base + i] * ha;
  const ro = rms(out); const fr = Math.round(tf * N / sr) * sr / N;                                  // whole number of periods per loop
  for (let i = 0; i < N; i++) out[i] += Math.sin(TAU * fr * i / sr) * ta * ro * 2;
  const drive = jake ? 2.4 : 1.2, g0 = 0.3 / rms(out);
  for (let i = 0; i < N; i++) out[i] = Math.tanh(out[i] * g0 * drive);
  const g1 = 0.2 / rms(out); for (let i = 0; i < N; i++) out[i] *= g1;
  return out;
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
  step(dt, speed, wheelSpin, throttle) {
    const wheel = Math.abs(speed) * this.perMs * (1 + Math.min(1, wheelSpin) * 0.32);
    const slip = this.idle + throttle * 3800 * Math.max(0, 1 - Math.abs(speed) / 9);                 // clutch slip / launch
    let target = Math.max(this.idle + throttle * 500, wheel, slip);
    this.cut = Math.max(0, this.cut - dt);
    if (this.rpm >= this.limit && throttle > 0.4) { this.cut = 0.045; this.lim = 0.25; }
    this.lim = Math.max(0, this.lim - dt);
    if (this.cut > 0) target = Math.min(target, this.limit - 450);
    const up = target > this.rpm, tau = up ? (throttle > 0.3 ? 0.07 : 0.2) : (this.cut > 0 ? 0.03 : 0.16);
    this.rpm += (target - this.rpm) * (1 - Math.exp(-dt / tau));
    this.rpm = Math.min(this.rpm, this.limit + 60);
    const thr = this.cut > 0 ? 0 : throttle;
    this.load += (thr - this.load) * (1 - Math.exp(-dt / (thr > this.load ? 0.05 : 0.08)));
    if (this.prevThr > 0.6 && throttle < 0.25 && this.rpm > 3200) this.crackle = 0.5 + Math.random() * 0.7;
    this.crackle = Math.max(0, this.crackle - dt); this.prevThr = throttle;
    return this;
  }
}

// one sample-based engine voice (crossfaded + pitch-shifted loop bank)
class Voice {
  constructor(au, set, { panned = false, offset = 0 } = {}) {
    const c = au.ctx; this.au = au; this.set = set; this.c = c;
    this.mix = c.createGain(); this.tone = c.createBiquadFilter(); this.tone.type = 'lowpass'; this.tone.frequency.value = 9000; this.tone.Q.value = 0.6;
    this.body = c.createBiquadFilter(); this.body.type = 'lowshelf'; this.body.frequency.value = 160; this.body.gain.value = 0;
    this.out = c.createGain(); this.out.gain.value = 0;
    this.mix.connect(this.body); this.body.connect(this.tone); this.tone.connect(this.out);
    this.node = this.out;
    if (panned) { this.pan = new PannerNode(c, { panningModel: 'HRTF', distanceModel: 'inverse', refDistance: 7, rolloffFactor: 1.15, maxDistance: 1000 }); this.out.connect(this.pan); this.node = this.pan; }
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
      l.g.gain.setTargetAtTime(gw, t, tau);
      if (gw > 0.0005 || Math.abs(l.i - i) <= 2) l.s.playbackRate.setTargetAtTime(Math.min(3, rpm / l.rpm * pitch), t, tau);
    }
    this.out.gain.setTargetAtTime(vol, t, tau);
  }
  place(t, x, y, z) { if (!this.pan) return; const p = this.pan; p.positionX.setTargetAtTime(x, t, 0.02); p.positionY.setTargetAtTime(y, t, 0.02); p.positionZ.setTargetAtTime(z, t, 0.02); }
  connect(n) { this.node.connect(n); }
  dispose() { for (const l of this.layers) { try { l.s.stop(); } catch (e) {} l.s.disconnect(); } this.node.disconnect(); }
}

// loudness of a V8 voice by rpm/load (normalized loops -> put the dynamics back)
const v8Vol = (rpm, load) => (0.28 + 0.72 * Math.pow(Math.min(1, rpm / 8000), 0.8)) * (0.42 + 0.58 * load);

export class GameAudio {
  constructor(app, ctx = null) { this.app = app; this.ctx = ctx; this.offline = !!ctx; this.muted = !ctx && localStorage.getItem('dtt.mute') === '1'; this.ai = new Map(); this.lastT = 0; if (ctx) this.build(); }
  now() { return this.ctx.currentTime; }
  ensure() {
    if (this.ctx) return true;
    try { const AC = window.AudioContext || window.webkitAudioContext; if (!AC) return false; this.ctx = new AC(); this.build(); return true; } catch (e) { console.warn('audio off', e); return false; }
  }
  build() {
    const c = this.ctx, sr = c.sampleRate;
    this.master = c.createGain(); this.comp = c.createDynamicsCompressor(); this.comp.threshold.value = -14; this.comp.knee.value = 10; this.comp.ratio.value = 4; this.comp.attack.value = 0.004; this.comp.release.value = 0.2;
    this.limiter=c.createDynamicsCompressor();this.limiter.threshold.value=-1.5;this.limiter.knee.value=0;this.limiter.ratio.value=20;this.limiter.attack.value=.001;this.limiter.release.value=.12;
    this.master.connect(this.comp);this.comp.connect(this.limiter);this.limiter.connect(c.destination); this.applyVolume();
    this.engineBus = c.createGain(); this.engineBus.connect(this.master);
    this.aiTone = c.createBiquadFilter(); this.aiTone.type = 'lowpass'; this.aiTone.frequency.value = 12000; this.aiBus = c.createGain(); this.aiBus.gain.value = 0.7; this.aiBus.connect(this.aiTone); this.aiTone.connect(this.master);
    const mk = (arr) => { const b = c.createBuffer(1, arr.length, sr); b.copyToChannel(arr, 0); return b; };
    const t0 = performance?.now?.() ?? 0;
    this.v8 = { rpms: V8.rpms, bufs: { on: V8.rpms.map((r, i) => mk(synthV8(sr, r, 1, 11 + i))), off: V8.rpms.map((r, i) => mk(synthV8(sr, r, 0, 41 + i))) } };
    this.v8ai = { rpms: V8.rpms, bufs: { on: this.v8.bufs.on, off: this.v8.bufs.off } };
    this.pops = [0, 1, 2, 3, 4, 5].map(i => mk(synthPop(sr, i + 1)));
    this.synthMs = (performance?.now?.() ?? 0) - t0;
    // player car
    this.player = new Voice(this, this.v8); this.player.connect(this.engineBus); this.playerRev = new RevModel();
    // shared noise for dirt / field / crowd
    const nb = c.createBuffer(1, sr * 2, sr), ch = nb.getChannelData(0); let last = 0; const r = rng(5);
    for (let i = 0; i < ch.length; i++) { const w = r() * 2 - 1; last = (last + 0.02 * w) / 1.02; ch[i] = w * 0.6 + last * 3; }
    const noise = (type, f, q) => { const n = c.createBufferSource(); n.buffer = nb; n.loop = true; const fl = c.createBiquadFilter(); fl.type = type; fl.frequency.value = f; fl.Q.value = q; const g = c.createGain(); g.gain.value = 0; n.connect(fl); fl.connect(g); g.connect(this.master); n.start(); return { fl, g }; };
    this.noiseBuffer=nb;
    this.tire = noise('bandpass', 1800, 0.8); this.roar = noise('lowpass', 220, 0.7); this.crowd = noise('bandpass', 700, 0.5);
    this.music=new MenuMusic(this);this.music.setPhase(this.app?.paused?'pause':this.app?.phase||'title');
  }
  ensureDiesel() {
    if (this.diesel) return; const c = this.ctx, sr = c.sampleRate, mk = (arr) => { const b = c.createBuffer(1, arr.length, sr); b.copyToChannel(arr, 0); return b; };
    const set = { rpms: DIESEL.rpms, bufs: { on: DIESEL.rpms.map((r, i) => mk(synthDiesel(sr, r, 'on', 3 + i))), off: DIESEL.rpms.map((r, i) => mk(synthDiesel(sr, r, 'off', 9 + i))), jake: DIESEL.rpms.map((r, i) => mk(synthDiesel(sr, r, 'jake', 17 + i))) } };
    this.diesel = new Voice(this, set); this.diesel.connect(this.engineBus);
    this.turbo=c.createOscillator();this.turbo.type='sine';this.turbo.frequency.value=1200;this.turboGain=c.createGain();this.turboGain.gain.value=0;this.turbo.connect(this.turboGain);this.turboGain.connect(this.engineBus);this.turbo.start();
    this.dTone=0;

  }
  unlockMusic(){if(this.live())this.music?.unlock();}
  setMusicPhase(phase){this.music?.setPhase(phase);}
  applyVolume() { this.music?.apply();if (this.master) this.master.gain.value = this.muted ? 0 : (this.app?.settings?.volume ?? 0.8); }
  live() { if (this.muted || !this.ensure()) return false; if (!this.offline && this.ctx.state === 'suspended') this.ctx.resume?.().catch?.(() => {}); return true; }
  pop(t, dest, gain = 0.5) {
    const c = this.ctx, s = c.createBufferSource(); s.buffer = this.pops[(Math.random() * this.pops.length) | 0]; s.playbackRate.value = 0.8 + Math.random() * 0.5;
    const g = c.createGain(); g.gain.value = gain; s.connect(g); g.connect(dest); s.start(t); s.onended = () => { s.disconnect(); g.disconnect(); };
  }
  // generic single engine (loading the car onto the hauler, menus): rpm01 0..1
  set(rpm01, load = 0.5, vol = 0.12, t) {
    if (!this.live()) return; t = t ?? this.now();
    const rpm = V8.idle + Math.max(0, rpm01 - 0.12) * 7000;
    this.player.update(t, rpm, { on: load, off: 1 - load }, vol * 2.2 * v8Vol(rpm, load), 1, 0.06);
    this.cam(t, 'chase');
  }
  cam(t, mode) {
    // in-car: firewall + helmet -> muffled, more low-end rumble; chase: open, bright headers
    const inCar = mode === 'incar';
    this.player.tone.frequency.setTargetAtTime(inCar ? 1500 : 9500, t, 0.1); this.player.body.gain.setTargetAtTime(inCar ? 5 : 0, t, 0.1);
    this.aiTone.frequency.setTargetAtTime(inCar ? 1900 : 12000, t, 0.1);
  }
  // per-frame race update. f = { dt, cam:'chase'|'incar'|'tv', L:{x,y,z,fx,fy,fz}, player:{speed,wheelSpin,throttle,x,y,z}|null, cars:[{id,x,y,z,vx,vz,speed,wheelSpin,throttle}] }
  race(f, t) {
    if (!this.live()) return; t = t ?? this.now(); const c = this.ctx, dt = f.dt || 1 / 60;
    // listener = camera
    const Ls = c.listener, L = f.L;
    if (Ls.positionX) { Ls.positionX.setTargetAtTime(L.x, t, 0.02); Ls.positionY.setTargetAtTime(L.y, t, 0.02); Ls.positionZ.setTargetAtTime(L.z, t, 0.02); Ls.forwardX.setTargetAtTime(L.fx, t, 0.02); Ls.forwardY.setTargetAtTime(L.fy, t, 0.02); Ls.forwardZ.setTargetAtTime(L.fz, t, 0.02); Ls.upX.value = 0; Ls.upY.value = 1; Ls.upZ.value = 0; }
    else Ls.setPosition?.(L.x, L.y, L.z);
    const lv = this.lPrev ? { x: (L.x - this.lPrev.x) / dt, z: (L.z - this.lPrev.z) / dt } : { x: 0, z: 0 }; this.lPrev = { x: L.x, z: L.z };
    this.cam(t, f.cam);
    // player
    let pr = null;
    if (f.player) {
      const p = f.player; pr = this.playerRev.step(dt, p.speed, p.wheelSpin, p.throttle);
      const on = pr.load, vol = 0.55 * v8Vol(pr.rpm, on) * (pr.cut > 0 ? 0.35 : 1);
      this.player.update(t, pr.rpm, { on, off: 1 - on }, vol, 1, pr.cut > 0 ? 0.008 : 0.02);
      if (pr.crackle > 0 && Math.random() < dt * 14) this.pop(t + Math.random() * 0.01, this.player.mix, 0.22 + Math.random() * 0.35);
      if (pr.cut > 0 && Math.random() < dt * 6) this.pop(t, this.player.mix, 0.25);
      this.rpm = pr.rpm;
    } else this.player.update(t, V8.idle, { on: 0, off: 1 }, 0, 1, 0.05);
    // AI cars: positioned, distance-darkened, doppler shifted
    const seen = new Set();
    for (const a of f.cars) {
      seen.add(a.id); let v = this.ai.get(a.id);
      if (!v) { v = new Voice(this, this.v8ai, { panned: true, offset: (a.id * 0.29) % 1 }); v.connect(this.aiBus); v.rev = new RevModel({ perMs: 196 * (0.97 + 0.06 * ((a.id * 37) % 10) / 10) }); v.dop = 1; this.ai.set(a.id, v); }
      const r = v.rev.step(dt, a.speed, a.wheelSpin, a.throttle);
      const dx = a.x - L.x, dz = a.z - L.z, dist = Math.hypot(dx, dz, a.y - L.y) || 1;
      const vs = (a.vx * dx + a.vz * dz) / dist, vl = (lv.x * dx + lv.z * dz) / dist;           // + = moving away from listener
      const dop = Math.min(1.25, Math.max(0.8, (343 + vl) / (343 + vs))); v.dop += (dop - v.dop) * 0.3;
      v.place(t, a.x, a.y + 0.6, a.z);
      v.tone.frequency.setTargetAtTime(Math.max(900, 14000 / (1 + dist / 35)), t, 0.05);           // air absorption
      v.update(t, r.rpm, { on: r.load, off: 1 - r.load }, 0.46 * v8Vol(r.rpm, r.load), v.dop, 0.03);
      if (r.crackle > 0 && dist < 60 && Math.random() < dt * 8) this.pop(t, v.mix, 0.2 + Math.random() * 0.25);
    }
    for (const [id, v] of this.ai) if (!seen.has(id)) { v.dispose(); this.ai.delete(id); }
  }
  // highway semi. f = { dt, speed (m/s), throttle 0/1, brake 0/1, cam }
  truck(f, t) {
    if (!this.live()) return; t = t ?? this.now(); this.ensureDiesel(); const dt = f.dt || 1 / 60;
    const ratio = n => 48 * Math.pow(1.33, 10 - n);
    let initialGear=1;while(initialGear<10&&f.speed*ratio(initialGear)>1700)initialGear++;
    const g = this.gb || (this.gb = { gear:initialGear, rpm:Math.max(DIESEL.idle,Math.min(2100,f.speed*ratio(initialGear))), shiftT: 0, load: 0, jake: 0 });                                                    // 10-speed, ~1450 rpm @ 65 mph in top
    let rpm = f.speed * ratio(g.gear);
    if (g.shiftT <= 0) { if (rpm > 1850 && g.gear < 10) { g.gear++; g.shiftT = 0.45;this.air(.09,.10,t,1100); } else if (rpm < 1050 && g.gear > 1) { g.gear--; g.shiftT = 0.35;this.air(.055,.08,t,1000); } }
    g.shiftT -= dt; rpm = Math.max(DIESEL.idle + (f.throttle ? 250 : 0), f.speed * ratio(g.gear));
    if (f.speed < 2.5) rpm = DIESEL.idle + f.throttle * 700;rpm=Math.min(2100,rpm);
    g.rpm += (rpm - g.rpm) * (1 - Math.exp(-dt / (g.shiftT > 0 ? 0.12 : 0.25)));
    const thr = g.shiftT > 0 ? 0 : f.throttle;
    g.load += (thr - g.load) * (1 - Math.exp(-dt / 0.15));
    const wantJake = f.jakeOn!==false&&!f.throttle && f.speed > 8 && g.rpm > 1000 ? (f.brake ? 1 : 0.75) : 0;
    g.jake += (wantJake - g.jake) * (1 - Math.exp(-dt / 0.06));
    this.truckJake=g.jake;
    g.boost=(g.boost||0)+(g.load-(g.boost||0))*(1-Math.exp(-dt/.6));
    const cab=f.cam==='cab';this.turbo.frequency.setTargetAtTime(1000+g.boost*2400+g.rpm*.3,t,.15);this.turboGain.gain.setTargetAtTime((.001+g.boost*.012)*(cab?.65:1),t,.12);
    if((g.prevThrottle||0)>.6&&f.throttle<.2&&g.boost>.25)this.air(.13*g.boost,.3,t,2300);
    if((g.prevBrake||0)<.2&&f.brake>.5)this.air(cab?.035:.08,.4,t,1700);
    if((g.prevSpeed||0)>.55&&f.speed<.55)this.air(cab?.065:.12,.55,t,2000);
    if(f.bump>.1&&(g.rattleT||0)<t){this.air(cab?.025:.012,.10,t,720);g.rattleT=t+.2;}
    g.prevThrottle=f.throttle;g.prevBrake=f.brake;g.prevSpeed=f.speed;
    this.tire.fl.frequency.setTargetAtTime(250+f.speed*18,t,.2);this.tire.g.gain.setTargetAtTime(Math.min(.038,f.speed*.001)*(cab?.65:1),t,.2);
    this.roar.fl.frequency.setTargetAtTime(400+f.speed*28,t,.2);this.roar.g.gain.setTargetAtTime(Math.min(.025,f.speed*f.speed*.00002)*(cab?.35:1),t,.2);

    const w = { on: g.load * (1 - g.jake), off: (1 - g.load) * (1 - g.jake), jake: g.jake };
    const inCab = f.cam === 'cab';
    this.diesel.tone.frequency.setTargetAtTime(inCab ? 2400 : 8000, t, 0.1); this.diesel.body.gain.setTargetAtTime(inCab ? 5 : 0, t, 0.1);
    this.diesel.update(t, g.rpm, w, (0.25 + 0.3 * g.load + 0.35 * g.jake) * (0.6 + 0.4 * g.rpm / 2000), 1, 0.04);
    this.player.update(t, V8.idle, { on: 0, off: 1 }, 0, 1, 0.05);
    this.rpm = g.rpm;
  }
  // Short filtered pneumatic transients; one shared noise buffer, no worklet per cylinder.
  air(gain=.08,length=.3,t,freq=1800){
    if(!this.ctx||this.muted)return;const c=this.ctx;t=t??c.currentTime;const n=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain();n.buffer=this.noiseBuffer;f.type='bandpass';f.frequency.value=freq;f.Q.value=.6;g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(.0002,gain),t+.008);g.gain.exponentialRampToValueAtTime(.0001,t+length);n.connect(f);f.connect(g);g.connect(this.engineBus);n.start(t);n.stop(t+length+.02);n.onended=()=>{n.disconnect();f.disconnect();g.disconnect();};
  }
  surface(slide, speed01, cushion = 0, t) {
    if (this.muted || !this.ctx) return; t = t ?? this.now();
    const v = Math.min(1, speed01) * (0.012 + Math.min(1, slide) * 0.035 + cushion * 0.018);
    this.tire.g.gain.setTargetAtTime(v, t, 0.08); this.tire.fl.frequency.setTargetAtTime(900 + speed01 * 1600 - cushion * 400, t, 0.1);
  }
  field(near, excite = 0, t) {
    if (this.muted || !this.ctx) return; t = t ?? this.now(); const k = this.app?.settings?.crowd ?? 1;
    this.roar.g.gain.setTargetAtTime(k * (0.004 + Math.min(1, near) * 0.012), t, 0.15);          // the AI engines are real voices now; this is just rumble
    this.aiBus.gain.setTargetAtTime(0.7 * (0.35 + 0.65 * k), t, 0.2);
    this.crowd.g.gain.setTargetAtTime(k * (0.004 + Math.min(1, excite) * 0.03), t, 0.3);
  }
  crowdCheer() {
    if (this.muted || !this.ensure()) return; const t = this.now(), k = this.app?.settings?.crowd ?? 1;
    const g = this.crowd.g.gain; g.cancelScheduledValues(t); g.setValueAtTime(g.value, t); g.linearRampToValueAtTime(0.09 * k, t + 0.4); g.setTargetAtTime(0.01 * k, t + 2.5, 1.2);
  }
  stop() {
    if (!this.ctx) return; const t = this.now();
    this.player.out.gain.cancelScheduledValues(t); this.player.out.gain.setTargetAtTime(0, t, 0.05);
    if(this.turboGain){this.turboGain.gain.cancelScheduledValues(t);this.turboGain.gain.setTargetAtTime(0,t,.05);}
    if (this.diesel) { this.diesel.out.gain.cancelScheduledValues(t); this.diesel.out.gain.setTargetAtTime(0, t, 0.05); }
    for (const v of this.ai.values()) v.dispose(); this.ai.clear(); this.lPrev = null; this.gb = null;
    for (const g of [this.tire.g.gain, this.roar.g.gain, this.crowd.g.gain]) { g.cancelScheduledValues(t); g.setTargetAtTime(0, t, 0.05); }
  }
  toggleMute() { this.muted = !this.muted; localStorage.setItem('dtt.mute', this.muted ? '1' : '0'); if (this.muted) this.stop(); this.applyVolume();if(!this.muted)this.unlockMusic(); }
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
