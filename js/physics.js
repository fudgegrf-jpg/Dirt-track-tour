import { TrackSurface } from './surface.js';
// Pure-math track + car dynamics (no THREE dependency, testable in node).
// World plane: x right, z "down" (three.js +z). Heading th: forward = (cos th, sin th). Right = (-sin th, cos th).
// Race direction is counter-clockwise seen from above => left turns => yaw rate negative.
const PI = Math.PI;
export const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
export const lerp = (a, b, t) => a + (b - a) * t;
export function wrapAngle(a) { while (a > PI) a -= 2 * PI; while (a < -PI) a += 2 * PI; return a; }

export class OvalTrack {
  constructor(t) {
    this.smooth = t.smooth !== false;
    this.bankStraight=t.id==='salina'?6:3;this.bankLow=t.id==='salina'?18:t.bank*.75;this.bankHigh=t.bank;
    this.L = t.L; this.R = t.R; this.W = t.W; this.bank = t.bank * PI / 180;
    this.P = 2 * t.L + 2 * PI * t.R;
    this.outer = t.W / 2 + 0.6;           // wall offset from centerline
    this.inner = -t.W / 2 - 7;            // reference only; the infield is fully drivable
    this.cushionAmt = t.cushion ?? 1;
    this.s1 = t.L / 2; this.s2 = this.s1 + PI * t.R; this.s3 = this.s2 + t.L; this.s4 = this.s3 + PI * t.R;
    if (this.smooth) this.buildEasements();
    this.surface = new TrackSurface(this, t.surfaceQuality || 'high');
  }
  // All five tracks: integrate a C2 curvature ramp, then interpolate the arc-length
  // samples with cubic Hermite splines. The two halves are rotationally symmetric.
  // Forty-metre easements remove the stadium oval's straight/circle curvature step.
  ease(v) { v = clamp(v, 0, 1); return v * v * v * (10 + v * (-15 + 6 * v)); }
  curvature(s) {
    s = ((s % this.P) + this.P) % this.P;
    if (!this.smooth) return ((s > this.s1 && s < this.s2) || (s > this.s3 && s < this.s4)) ? 1 / this.R : 0;
    const ramp = (a, b) => this.ease((s - a + 20) / 40) - this.ease((s - b + 20) / 40);
    return (ramp(this.s1, this.s2) + ramp(this.s3, this.s4)) / this.R;
  }
  buildEasements() {
    const N = 2048, ds = this.P / N, samples = [{ x: 0, z: 0, th: 0 }];
    let x = 0, z = 0, th = 0;
    for (let i = 0; i < N; i++) {
      const k = this.curvature((i + 0.5) * ds), mid = th - k * ds / 2;
      x += Math.cos(mid) * ds; z += Math.sin(mid) * ds; th -= k * ds;
      samples.push({ x, z, th });
    }
    const z0 = -samples[N / 2].z / 2;
    for (const p of samples) p.z += z0;
    // Force bit-exact closure (integration residual is below a nanometre).
    samples[N] = { x: 0, z: z0, th: -2 * PI };
    this.path = samples; this.pathStep = ds;
  }
  splineCenter(s) {
    s = ((s % this.P) + this.P) % this.P;
    const f = s / this.pathStep, i = Math.floor(f), u = f - i, v = 1 - u;
    const a = this.path[i], b = this.path[i + 1], h = this.pathStep;
    const A = (1 + 2 * u) * v * v, B = u * v * v * h, C = u * u * (3 - 2 * u), D = -u * u * v * h;
    const ac = Math.cos(a.th), as = Math.sin(a.th), bc = Math.cos(b.th), bs = Math.sin(b.th);
    const dx = 6 * u * (u - 1) * (a.x - b.x) / h + (1 - 4 * u + 3 * u * u) * ac + (3 * u * u - 2 * u) * bc;
    const dz = 6 * u * (u - 1) * (a.z - b.z) / h + (1 - 4 * u + 3 * u * u) * as + (3 * u * u - 2 * u) * bs;
    return { x: A * a.x + B * ac + C * b.x + D * bc, z: A * a.z + B * as + C * b.z + D * bs, th: Math.atan2(dz, dx) };
  }
  // centerline point + heading at arc length s
  center(s) {
    if (this.smooth) return this.splineCenter(s);
    const { L, R, P } = this; s = ((s % P) + P) % P;
    if (s < this.s1) return { x: s, z: R, th: 0 };
    if (s < this.s2) { const ph = PI / 2 - (s - this.s1) / R; return { x: L / 2 + R * Math.cos(ph), z: R * Math.sin(ph), th: ph - PI / 2 }; }
    if (s < this.s3) return { x: L / 2 - (s - this.s2), z: -R, th: PI };
    if (s < this.s4) { const ph = -PI / 2 - (s - this.s3) / R; return { x: -L / 2 + R * Math.cos(ph), z: R * Math.sin(ph), th: ph - PI / 2 }; }
    return { x: -L / 2 + (s - this.s4), z: R, th: 0 };
  }
  // point at (s, d) where d>0 is toward outside wall
  point(s, d) {
    const c = this.center(s); const nx = -Math.sin(c.th), nz = Math.cos(c.th); // right of travel = outward? travel CCW: right side is outside
    return { x: c.x + nx * d, z: c.z + nz * d, th: c.th };
  }
  project(x, z) {
    const { L, R, P } = this;
    let s, d, nx, nz;
    if (Math.abs(x) <= L / 2) {
      if (z > 0) { d = z - R; s = x >= 0 ? x : P + x; nx = 0; nz = 1; }
      else { d = -z - R; s = this.s2 + (L / 2 - x); nx = 0; nz = -1; }
    } else if (x > L / 2) {
      const dx = x - L / 2, r = Math.hypot(dx, z) || 1e-6; const ph = Math.atan2(z, dx);
      d = r - R; s = this.s1 + R * (PI / 2 - ph); nx = dx / r; nz = z / r;
    } else {
      const dx = x + L / 2, r = Math.hypot(dx, z) || 1e-6; let ph = Math.atan2(z, dx); if (ph > -PI / 2) ph -= 2 * PI;
      d = r - R; s = this.s3 + R * (-PI / 2 - ph); nx = dx / r; nz = z / r;
    }
    s = ((s % P) + P) % P;
    if (this.smooth) {
      // The analytic stadium projection is a close seed. Newton refinement
      // finds the normal foot on the smoothed curve, including offset grooves.
      for (let i = 0; i < 4; i++) {
        const c = this.center(s), tx = Math.cos(c.th), tz = Math.sin(c.th);
        nx = -tz; nz = tx; d = (x - c.x) * nx + (z - c.z) * nz;
        const ds = ((x - c.x) * tx + (z - c.z) * tz) / Math.max(0.25, 1 + this.curvature(s) * d);
        s = ((s + clamp(ds, -30, 30)) % P + P) % P;
        if (Math.abs(ds) < 1e-7) break;
      }
      const c = this.center(s); nx = -Math.sin(c.th); nz = Math.cos(c.th);
      d = (x - c.x) * nx + (z - c.z) * nz;
    }
    return { s, d, nx, nz };
  }
  cornerFactor(s) {
    if (this.smooth) return this.curvature(s) * this.R;
    const P = this.P; s = ((s % P) + P) % P; const T = 22;
    const f = (a, b) => { // 1 inside [a,b], smooth ramps
      if (s >= a && s <= b) return 1;
      const da = a - s, db = s - b;
      if (da > 0 && da < T) return 0.5 + 0.5 * Math.cos(PI * da / T);
      if (db > 0 && db < T) return 0.5 + 0.5 * Math.cos(PI * db / T);
      return 0;
    };
    return Math.min(1, f(this.s1, this.s2) + f(this.s3, this.s4));
  }
  bankAngle(s, d = 0) {
    if (!this.smooth) return lerp(0.05, this.bank, this.cornerFactor(s));
    const u = clamp((d + this.W / 2) / this.W, 0, 1), q = u * u * (3 - 2 * u), f = this.cornerFactor(s);
    const lo = Math.tan(lerp(this.bankStraight, this.bankLow, f) * PI / 180), hi = Math.tan(lerp(this.bankStraight, this.bankHigh, f) * PI / 180);
    return Math.atan(lerp(lo, hi, q));
  }
  // surface height
  height(s, d) { if(d< -this.W/2-5&&this.infieldHeightAt)return this.infieldHeightAt(s,d);return this.baseHeight(s,d) + (this.surface ? this.surface.state(s,d).height : 0); }
  baseHeight(s, d) {
    const W = this.W, a = this.bankAngle(s);if(d< -W/2-5)return lerp(-.25,this.smooth?-.2:-.12,clamp((d+W/2+8)/3,0,1));
    if (this.smooth) {
      const f = this.cornerFactor(s), lo = Math.tan(lerp(this.bankStraight, this.bankLow, f) * PI / 180), hi = Math.tan(lerp(this.bankStraight, this.bankHigh, f) * PI / 180);
      if (d < -W / 2) {
        // Tangent-matched apron, monotone even at maximum banking.
        const v = clamp((d + W / 2 + 1.8) / 1.8, 0, 1);
        return -0.2 * (2 * v * v * v - 3 * v * v + 1) + 1.8 * lo * (v * v * v - v * v);
      }
      const u = clamp((d + W / 2) / W, 0, (W + 0.6) / W);
      const uc = Math.min(1, u);
      let h = W * (lo * uc + (hi - lo) * (uc ** 3 - 0.5 * uc ** 4)) + Math.max(0, u - 1) * W * hi;
      // Low, smooth cushion mound with zero tangent at either edge.
      const t = clamp((d - (W / 2 - 3.5)) / 3.5, 0, 1);
      h += this.cushionAmt * 0.09 * Math.sin(PI * t) ** 2;
      return h;
    }
    if (d < -W / 2) return Math.max(-0.12, (d + W / 2) * 0.03);
    const dd = Math.min(d, W / 2 + 0.6) + W / 2;
    let h = Math.tan(a) * dd;
    // cushion ridge near the wall
    const cu = this.cushionAmt * 0.22;
    const t = (d - (W / 2 - 3.5)) / 3.5; if (t > 0) h += cu * Math.sin(PI * clamp(t, 0, 1)) ;
    return h;
  }
  // grip multiplier by groove. `dry` (0 = tacky/heavy, 1 = dry-slick) moves the fast line up the track over a race:
  // early the bottom is king; as it rubbers/slicks off the top and cushion come in.
  groove(d, s) {
    const g=this.baseGroove(d), f=this.surface;
    if(f&&d>=-this.W/2){
      const q=s===undefined?{wear:f.lane(d),rough:f.laneRough(d)}:f.state(s,d), dry=this.dry||0;
      const rubber=q.wear*dry*(d<0?1:.5);
      g.grip *= 1 + .065*rubber - .028*q.rough;
      g.drag += 45*q.rough - 20*rubber;
      g.rough=q.rough;g.rubber=rubber;
    }
    return g;
  }
  baseGroove(d) {
    const u = d / (this.W / 2), t = this.dry || 0, c = this.cushionAmt;
    if(d< -this.W/2-5)return{grip:.52,drag:1800,dust:.85,zone:'grass',rough:.65};
    if(d< -this.W/2)return{grip:.76,drag:450,dust:1.2,zone:'apron',rough:.25};
    if (u < -0.85) return { grip: 0.9 - 0.04 * t, drag: 120, dust: 0.6, zone: 'apron' };
    if (u > 0.62) return { grip: 1.0 + 0.1 * c + 0.04 * t, drag: 240 * c, dust: 1.8, zone: 'cushion' };
    if (u > 0.22) return { grip: 0.985 + 0.05 * t, drag: 0, dust: 1.0, zone: 'top' };
    if (u < -0.35) return { grip: 1.005 - 0.085 * t, drag: 0, dust: 0.55 - 0.35 * t, zone: 'bottom' };
    return { grip: 1.0 - 0.03 * t, drag: 0, dust: 0.8, zone: 'middle' };
  }
}

export function makeCar(opts = {}) {
  const { power: _p, grip: _g, stab: _s, ...rest } = opts;
  return {
    x: 0, z: 0, th: 0, vx: 0, vz: 0, w: 0, steer: 0, throttle: 0, brake: 0,
    m: 1050, I: 1750, a: 1.3, b: 1.4, power: 330000 * (opts.power || 1), gripMul: opts.grip || 1, stab: opts.stab || 0,
    damage: 0, s: 0, d: 0, lap: 0, dist: 0, lastS: 0, finished: false, finishTime: 0, stuck: 0,
    slipR: 0, slipF: 0, speed: 0, tire: 1, mud: 0, wheelSpin: 0, zone: 'middle', contact: 0, lapStart: 0, bestLap: 0, lastLap: 0,
    ...rest,
  };
}

const G = 9.81;
// player stability assist levels (Settings > Stability assist). slide = allowed body slip before it pushes back (rad)
export const ASSIST = {
  off: null,
  low: { lock: 0.22, cs: 0.45, csFrom: 0.42, tc: 1.2, tcFrom: 0.5, yawCap: 1.5, yawK: 3, slide: 0.62, slideK: 5, thrRate: 3, grip: 2, damp: 2, scrub: 0.18 },
  med: { lock: 0.17, cs: 0.7, csFrom: 0.34, tc: 2.0, tcFrom: 0.4, yawCap: 1.3, yawK: 6, slide: 0.48, slideK: 10, thrRate: 2.4, grip: 3.5, damp: 4, scrub: 0.3 },
  high: { lock:.145, cs:.96, csFrom:.28, tc:3, tcFrom:.32, yawCap:1.2, yawK:12, slide:.44, slideK:20, thrRate:2.4, grip:5.5, damp:8, scrub:.32, safe:true, catchFrom:.62, catchK:3.5, catchD:12, rutFactor:.12, contactYaw:.24, brakeUse:.10, liftRate:2.8 },
  max: { lock:.13, cs:1, csFrom:.22, tc:3.8, tcFrom:.28, yawCap:1.12, yawK:15, slide:.36, slideK:24, thrRate:2.3, grip:7, damp:10, scrub:.35, safe:true, catchFrom:.54, catchK:4, catchD:14, rutFactor:.04, contactYaw:.12, brakeUse:.05, liftRate:2.4 },
};
// one physics substep for a car on an oval
export function stepCar(car, input, trk, dt) {
  const sin = Math.sin(car.th), cos = Math.cos(car.th);
  let vxL = car.vx * cos + car.vz * sin;      // forward
  let vyL = -car.vx * sin + car.vz * cos;     // right
  const speed = Math.hypot(car.vx, car.vz); car.speed = speed;
  // input smoothing. Player keys (digital) ramp in, faster to center than to lock, slower at speed, so a tap never snaps
  const A = ASSIST[car.assist] || null;
  if (car.human) {
    const back = Math.abs(input.steer) < Math.abs(car.steer) || input.steer * car.steer < 0;
    const rIn = lerp(4.2, 1.9, clamp(speed / 30, 0, 1));
    car.steer += clamp(input.steer - car.steer, -(back ? 7 : rIn) * dt, (back ? 7 : rIn) * dt);
    car.throttle += clamp(input.throttle - car.throttle, -(A?.liftRate || 5) * dt, (A ? A.thrRate : 3) * dt);
  } else {
    car.steer += clamp(input.steer - car.steer, -5 * dt, 5 * dt);
    car.throttle += clamp(input.throttle - car.throttle, -6 * dt, 4 * dt);
  }
  car.brake = input.brake;
  const pr = trk.project(car.x, car.z); car.s = pr.s; car.d = pr.d;
  const gr = trk.groove(pr.d, pr.s); car.zone = gr.zone;
  if(A?.safe){ // soften cushion / worn-groove transitions; retain visual suspension bounce
    gr.grip *= 1+.028*(gr.rough||0)*(1-A.rutFactor);
    const f=1-Math.exp(-dt*7);
    car.assistGrip=lerp(car.assistGrip??gr.grip,gr.grip,f);car.assistDrag=lerp(car.assistDrag??gr.drag,gr.drag,f);
    gr.grip=car.assistGrip;gr.drag=car.assistDrag;
  }
  const bankA = trk.bankAngle(pr.s, pr.d);
  const dmg = car.damage / 100;
  const mu = 0.86 * gr.grip * car.gripMul * (1 - 0.18 * dmg) * (1 + 0.75 * Math.sin(bankA)) * (0.9 + 0.1 * car.tire);
  const Wf = car.m * G * car.b / (car.a + car.b), Wr = car.m * G * car.a / (car.a + car.b);
  const maxF = mu * Wf, maxR0 = mu * Wr;
  const vxa = Math.max(Math.abs(vxL), 3);
  const dmax = 0.62 / (1 + speed / 16);
  let delta = car.steer * dmax + dmg * 0.04; // damage = slight pull right
  const velAng = speed > 2 ? Math.atan2(car.vz, car.vx) : car.th, beta = wrapAngle(velAng - car.th); car.beta = beta;
  if (A && speed > 4 && vxL > 0) {
    // front wheels pointed straight down the direction of travel = zero front slip. Limit lock to just past the grip peak
    // around that (so full lock understeers a touch instead of snapping), and pull the wheel toward it as the car over-rotates
    const free = Math.atan2(vyL + car.w * car.a, vxa);
    delta = clamp(delta, free - A.lock, free + A.lock);
    const over = clamp((Math.abs(beta) - A.csFrom) / 0.35, 0, 1) * A.cs;
    delta = lerp(delta, free, over);
  }
  // longitudinal
  let Fx = 0;
  const power = car.power * (1 - 0.3 * dmg);
  if (car.throttle > 0) Fx = car.throttle * Math.min(power / Math.max(speed, 6), 9000);
  if (A && Math.abs(beta) > A.tcFrom) Fx *= clamp(1 - (Math.abs(beta) - A.tcFrom) * A.tc, 0.25, 1);   // traction control eases power in a big slide
  const tractionR = maxR0 * 1.05;
  car.wheelSpin = Math.max(0, Fx - tractionR) / tractionR;
  Fx = Math.min(Fx, tractionR);
  if (car.brake > 0) Fx -= car.brake * Math.min(10000, (maxF + maxR0) * 0.95) * Math.sign(vxL || 1);
  // throttle steals rear lateral grip (friction circle-ish) -> oversteer / throttle steer
  const use = clamp((Fx > 0 ? Fx : -Fx * (A?.brakeUse ?? .45)) / maxR0, 0, 1);
  let steal = (0.5 - 0.25 * car.stab) * use * use;
  if (A) steal *= clamp(1 - Math.max(0, Math.abs(beta) - A.tcFrom * 0.6) * A.grip, 0.15, 1);   // assist: rear hooks back up as the slide grows
  const maxR = maxR0 * (1 - steal);
  const Cf = maxF / 0.11, Cr = maxR0 / 0.10;
  const aF = Math.atan2(vyL + car.w * car.a, vxa) - delta * Math.sign(vxL || 1);
  const aR = Math.atan2(vyL - car.w * car.b, vxa);
  const FyF = clamp(-Cf * aF, -maxF, maxF);
  const FyR = clamp(-Cr * aR, -maxR, maxR);
  car.slipR = aR; car.slipF = aF;
  // tire wear: base + sliding + wheelspin (a full feature costs a few % of grip)
  car.tire = Math.max(0, car.tire - dt * (0.0008 + Math.min(0.5, Math.abs(aR)) * 0.006 + car.wheelSpin * 0.003) * (car.wearMul || 1));
  // drag & rolling
  const drag = 1.05 * (1 - 0.3 * (car.draft || 0)) * vxL * Math.abs(vxL) + (260 + gr.drag) * Math.sign(vxL) * Math.min(1, Math.abs(vxL));
  // arcade slide scrub (assist only): tires sliding past their peak bleed speed, so a pinned throttle + held steer
  // "throws it sideways and scrubs" instead of plowing into the fence
  let scrub = 0;
  if (A && speed > 6) scrub = car.m * G * mu * A.scrub * clamp((Math.abs(aR) + Math.abs(aF) * 1.5 - 0.12) / 0.3, 0, 1);
  const fxL = Fx - FyF * Math.sin(delta) - drag - scrub * Math.sign(vxL);
  const fyL = FyR + FyF * Math.cos(delta) - (gr.drag * 0.5 + 40) * Math.sign(vyL) * Math.min(1, Math.abs(vyL));
  // banking pulls car down-slope (toward inside) a bit
  const cf = trk.cornerFactor(pr.s);
  const bankPull = -car.m * G * Math.sin(bankA) * 0.25 * cf;
  const fxW = fxL * cos - fyL * sin + pr.nx * bankPull;
  const fzW = fxL * sin + fyL * cos + pr.nz * bankPull;
  car.vx += fxW / car.m * dt; car.vz += fzW / car.m * dt;
  const torque = car.a * FyF * Math.cos(delta) - car.b * FyR - car.w * 900 * car.stab;
  let tq = torque;
  if (A && speed > 4 && !car.reversing) {
    // stability assist: cap yaw rate near what the tires can hold, and rotate the nose back toward travel past the allowed slide
    const wMax = mu * G / Math.max(speed, 6) * A.yawCap;
    if (Math.abs(car.w) > wMax) tq -= (car.w - Math.sign(car.w) * wMax) * car.I * A.yawK;
    const ex = beta - clamp(beta, -A.slide, A.slide);
    tq += ex * car.I * A.slideK;
    if (Math.abs(beta) > A.slide * 0.7 && car.w * beta < 0) tq -= car.w * car.I * A.damp;   // rotating further into the slide: damp it
  }
  if(A?.safe && speed>1 && !car.reversing){
    // Critically damped yaw tracking, never a heading teleport or a steering
    // reversal. Keep a visible 20–25 degree dirt slide; catch 35–40 degree slips.
    const slip=Math.abs(beta),contact=Math.max(0,(car.recoverTime||0)-dt);car.recoverTime=contact;
    if(slip>A.catchFrom)car.yawCatch=1;
    car.yawCatch=Math.max(0,(car.yawCatch||0)-dt*(slip<.27?3:.45));
    const danger=clamp((slip-.38)/(A.catchFrom-.38),0,1);
    const catchMix=Math.max(danger*danger*(3-2*danger),(car.yawCatch||0)*.8,contact>0?.88:0);
    const travelYaw=(car.vx*fzW-car.vz*fxW)/(car.m*Math.max(25,speed*speed));
    const allowed=contact>0?.18:.34,ex=beta-clamp(beta,-allowed,allowed);
    const desired=clamp(travelYaw+ex*A.catchK,-1.5,1.5);
    const recovery=car.I*clamp((desired-car.w)*A.catchD,-18,18);
    tq=lerp(tq,recovery,catchMix);
    // A last-resort forward-facing envelope catches low-speed tank-slappers
    // before a wall can bounce the velocity behind the nose. It does NOT choose
    // a racing line or change position: only a smooth restoring yaw torque.
    const roadErr=wrapAngle(trk.center(pr.s).th-car.th),u=clamp((Math.abs(roadErr)-.72)/.38,0,1),roadMix=u*u*(3-2*u);
    const roadYaw=-speed*trk.curvature(pr.s)/Math.max(.6,1+trk.curvature(pr.s)*pr.d);
    const roadTarget=roadYaw+(roadErr-clamp(roadErr,-.58,.58))*4.5;
    tq=lerp(tq,car.I*clamp((roadTarget-car.w)*14,-20,20),roadMix);
    car.autoCounterSteer=Math.max(catchMix,roadMix); // diagnostics; intervention fades on recovery
  }
  car.w += tq / car.I * dt;
  if(A?.safe && speed<4)car.w*=Math.exp(-dt*(4-speed)*2.5);
  if (speed < 0.5 && Math.abs(car.throttle) < 0.05 && !car.reversing) { car.vx *= 0.9; car.vz *= 0.9; car.w *= 0.8; }
  car.x += car.vx * dt; car.z += car.vz * dt; car.th = wrapAngle(car.th + car.w * dt);
  if(trk.surface && speed>4){
    const surf=pr.d< -trk.W/2-5?{rough:.65}:trk.surface.state(pr.s,pr.d);
    // Small, deterministic wheel deflections. Medium assist still catches them;
    // bumps are suspension motion, not an artificial spin impulse.
    const kick=surf.rough*Math.sin(pr.s*2.8+pr.d*5.2)*.028*Math.min(1,speed/24);
    car.w += kick*dt*(A?.rutFactor ?? (A ? .4 : 1));
    const targetBump=surf.rough*Math.sin(pr.s*3.9)*.018;
    car.bumpV=(car.bumpV||0)+((targetBump-(car.bump||0))*65-(car.bumpV||0)*10)*dt;
    car.bump=clamp((car.bump||0)+car.bumpV*dt,-.025,.025);
    if(pr.d>=-trk.W/2)trk.surface.paint(pr.s,pr.d,speed*dt,car.slipR);
  }
}

// Split position stabilization from the contact impulse: centimeters per substep,
// not a whole penetration-depth teleport. One capsule contact per body pair.
function contactShift(c,x,z,dt){const n=Math.hypot(x,z),budget=c._contactBudget??(2*dt),k=n?Math.min(1,budget/n):0;c.x+=x*k;c.z+=z*k;if(c._contactBudget!==undefined)c._contactBudget=Math.max(0,budget-n*k);}
export function wallCollide(car,trk,dt=1/120){const cs=Math.cos(car.th),sn=Math.sin(car.th);let hit=null;for(const o of[-1.7,0,1.7]){const p=trk.project(car.x+cs*o,car.z+sn*o);let pen=0,nx=0,nz=0;if(p.d+1>trk.outer){pen=p.d+1-trk.outer;nx=p.nx;nz=p.nz;}if(pen>0&&(!hit||pen>hit.pen))hit={o,pen,nx,nz};}if(!hit)return 0;const{o,pen,nx,nz}=hit,rx=cs*o,rz=sn*o,vn=(car.vx-car.w*rz)*nx+(car.vz+car.w*rx)*nz,cross=rx*nz-rz*nx;contactShift(car,-nx*Math.max(0,pen-.01)*.22,-nz*Math.max(0,pen-.01)*.22,dt);const bias=Math.min(1.5,Math.max(0,pen-.01)*5),j=Math.max(0,(Math.max(0,vn)*1.035+bias)/(1/car.m+cross*cross/car.I));car.vx-=j*nx/car.m;car.vz-=j*nz/car.m;car.w-=clamp(j*cross/car.I*(ASSIST[car.assist]?.contactYaw??1),-dt*8,dt*8);car.w*=Math.exp(-dt*2);car.vx*=Math.exp(-dt*.25);car.vz*=Math.exp(-dt*.25);car.contactHold=.5;if(ASSIST[car.assist]?.safe&&vn>1)car.recoverTime=.85;return Math.max(0,vn);}
export function carCollide(A,B,dt=1/120){if((B.x-A.x)**2+(B.z-A.z)**2>49)return 0;const ca=Math.cos(A.th),sa=Math.sin(A.th),cb=Math.cos(B.th),sb=Math.sin(B.th);let hit=null;for(const oa of[-1.6,0,1.6])for(const ob of[-1.6,0,1.6]){const dx=B.x+cb*ob-A.x-ca*oa,dz=B.z+sb*ob-A.z-sa*oa,d=Math.hypot(dx,dz),pen=1.96-d;if(pen>0&&(!hit||pen>hit.pen))hit={oa,ob,pen,nx:d>1e-5?dx/d:-sa,nz:d>1e-5?dz/d:ca};}if(!hit)return 0;const{oa,ob,pen,nx,nz}=hit,rax=ca*oa,raz=sa*oa,rbx=cb*ob,rbz=sb*ob,vn=(A.vx-A.w*raz-B.vx+B.w*rbz)*nx+(A.vz+A.w*rax-B.vz-B.w*rbx)*nz,ra=rax*nz-raz*nx,rb=rbx*nz-rbz*nx,inv=1/A.m+1/B.m+ra*ra/A.I+rb*rb/B.I,j=Math.max(0,(Math.max(0,vn)*1.025+Math.min(1.3,Math.max(0,pen-.015)*4))/inv),corr=Math.max(0,pen-.015)*.12;contactShift(A,-nx*corr,-nz*corr,dt);contactShift(B,nx*corr,nz*corr,dt);A.vx-=j*nx/A.m;A.vz-=j*nz/A.m;B.vx+=j*nx/B.m;B.vz+=j*nz/B.m;A.w-=clamp(j*ra/A.I*.3*(ASSIST[A.assist]?.contactYaw??1),-dt*6,dt*6);B.w+=clamp(j*rb/B.I*.3*(ASSIST[B.assist]?.contactYaw??1),-dt*6,dt*6);A.w*=Math.exp(-dt);B.w*=Math.exp(-dt);A.contactHold=B.contactHold=.5;if(ASSIST[A.assist]?.safe&&vn>1)A.recoverTime=.75;if(ASSIST[B.assist]?.safe&&vn>1)B.recoverTime=.75;return Math.max(0,vn);}

// ---------------------------------------------------------------- AI driver
// Personality (ai): skill (pace), aggr (how hard they push/pass and how close they follow), cons (consistency: fewer mistakes),
// lane (preferred groove -1 bottom .. +1 cushion), adapt (how willing they are to move to wherever the track is fastest),
// kind (racecraft style, below), mist / read (from the difficulty setting).
// ctx: { dt, green, pace, paceSpeed, paceLane, hold }
export const AI_KINDS = {
  slider:  { sj: 1.0,  defend: 0.55, cush: 0.18, side: 0.9, mist: ['overshoot', 'loose', 'overshoot', 'push'] },     // aggressive slider: lives on the cushion, throws slide jobs
  bottom:  { sj: 0.35, defend: 0.95, cush: -0.2, side: 0.6, mist: ['push', 'bobble', 'bobble'] },                    // smooth bottom-feeder: hugs the pole line, protects it
  rookie:  { sj: 0.85, defend: 0.35, cush: 0.08, side: 1.0, mist: ['loose', 'overshoot', 'bobble', 'spin'] },        // mistake-prone rookie: brave, untidy, the odd spin
  veteran: { sj: 0.55, defend: 0.8,  cush: 0.0,  side: 0.75, mist: ['push', 'bobble'] },                            // consistent veteran: reads the track, picks his spots
};
export const DIFFICULTY = {
  easy:   { skill: -0.035, aggr: 0.75, mist: 1.6, read: 0.55 },
  normal: { skill: 0.0,    aggr: 1.0,  mist: 1.0, read: 0.85 },
  hard:   { skill: 0.024,  aggr: 1.12, mist: 0.5, read: 1.0 },
};
const GROOVE_CACHE=new Map();
const GT_LANES = [-0.6, -0.3, 0, 0.3, 0.7], GT_DRY = [0.05, 0.5, 0.92];
// "reading the track": how fast each groove is right now. We literally run a lap in each groove at three track states
// (tacky -> dry-slick) once per track, so the AI's groove choice follows the real surface model (bottom early, top/cushion late).
export function grooveTimes(trk) {
  if (trk._gt) return trk._gt;
  const key=[trk.L,trk.R,trk.W,trk.P,trk.bankStraight,trk.bankLow,trk.bankHigh,trk.cushionAmt,trk.smooth].join('/');
  if(GROOVE_CACHE.has(key))return trk._gt=GROOVE_CACHE.get(key);
  const surfaceKeep=trk.surface; trk.surface=null;
  const keep = trk.dry, HW = trk.W / 2, tab = [];
  for (const dry of GT_DRY) {
    trk.dry = dry;
    tab.push(GT_LANES.map(l => {
      const p = trk.point(trk.s1 - 30, l * HW), c = makeCar({ x: p.x, z: p.z, th: p.th, vx: Math.cos(p.th) * 20, vz: Math.sin(p.th) * 20, stab: 0.3 });
      const ai = { lane: l, skill: 0.95, aggr: 0.5, cons: 1, adapt: 0, curLane: l, fixed: true };
      let t = 0, prog = 0, ps = trk.project(c.x, c.z).s, t1 = 0;
      for (let k = 0; k < 120 * 80; k++) {
        t += 1 / 120; stepCar(c, aiInput(c, trk, ai, [c], { dt: 1 / 120, green: true }), trk, 1 / 120); wallCollide(c, trk);
        const s = trk.project(c.x, c.z).s; let ds = s - ps; if (ds < -trk.P / 2) ds += trk.P; prog += ds; ps = s;
        if (!t1 && prog > trk.P * 0.5) t1 = t; if (prog > trk.P * 1.5) return t - t1;
      }
      return 99;
    }));
  }
  trk.dry = keep; trk.surface=surfaceKeep;
  const result=trk._gt={lanes:GT_LANES,drys:GT_DRY,tab};if(GROOVE_CACHE.size>=32)GROOVE_CACHE.delete(GROOVE_CACHE.keys().next().value);GROOVE_CACHE.set(key,result);return result;
}
function grooveNow(trk) {
  const G = grooveTimes(trk), d = clamp(trk.dry || 0, G.drys[0], G.drys[2]), j = d < G.drys[1] ? 0 : 1, f = (d - G.drys[j]) / (G.drys[j + 1] - G.drys[j]);
  return G.lanes.map((l, i) => lerp(G.tab[j][i], G.tab[j + 1][i], f) * (1 - .012 * (trk.surface?.lane(l*trk.W/2)||0) * d + .024 * (trk.surface?.laneRough(l*trk.W/2)||0)));
}
const aiStats = ai => ai.stats || (ai.stats = { sjA: 0, sjC: 0, xA: 0, xC: 0, defends: 0, mistakes: 0, spins: 0, overshoots: 0, grooveChanges: 0 });
const sGap = (a, b, P) => { let ds = a.s - b.s; if (ds < -P / 2) ds += P; if (ds > P / 2) ds -= P; return ds; };   // + = a ahead of b

// aerodynamic tow: cars tucked in behind someone on the straights lose some drag
export function computeDraft(cars, trk) {
  for (const c of cars) {
    let best = 0;
    for (const o of cars) {
      if (o === c || o.dnf) continue; const ds = sGap(o, c, trk.P), dd = Math.abs(o.d - c.d);
      if (ds > 3 && ds < 30 && dd < 1.8) best = Math.max(best, (1 - (ds - 3) / 27) * (1 - dd / 1.8));
    }
    c.draft = best;
  }
}

export function aiInput(car, trk, ai, others, ctx = {}) {
  const v = car.speed, HW = trk.W / 2, P = trk.P, dt = ctx.dt || 1 / 120;
  const aggr = ai.aggr ?? 0.5, cons = ai.cons ?? 0.9, K = AI_KINDS[ai.kind] || AI_KINDS.veteran, st = aiStats(ai);
  if (ai.curLane === undefined) ai.curLane = clamp(car.d / HW, -0.8, 0.75);
  const green = !!ctx.green && !ctx.pace, cfNow = trk.cornerFactor(car.s + 4), cfAhead = trk.cornerFactor(car.s + 10 + v * 0.3), cfEntry = trk.cornerFactor(car.s + 22 + v * 0.4);
  // ---- groove choice: read the track (re-decided on the straights; rookies/easy AI misread it more)
  const dry = trk.dry || 0;
  let base;
  if (ai.fixed) base = ai.lane;
  else {
    ai.gT = (ai.gT ?? Math.random() * 2) - dt;
    if (ai.groove === undefined || (ai.gT <= 0 && cfNow < 0.25)) {
      ai.gT = 2.5 + Math.random() * 2.5;
      const times = grooveNow(trk), read = ai.read ?? 0.85, keep = 1 - (ai.adapt ?? 0.5);
      let bi = -1, bs = 1e9;
      times.forEach((t, i) => {
        const l = GT_LANES[i], sc = t + (1 - read) * (Math.random() - 0.5) * 0.5 + Math.abs(l - ai.lane) * 0.55 * keep - (l > 0.6 ? K.cush : 0) + (l < -0.5 ? K.cush * 0.5 : 0)
          + (ai.groove !== undefined && Math.abs(l - ai.groove) > 0.01 ? 0.06 : 0);                                    // hysteresis
        if (sc < bs) { bs = sc; bi = i; }
      });
      const g = GT_LANES[bi];
      if (ai.groove !== undefined && g !== ai.groove) st.grooveChanges++;
      ai.groove = g;
    }
    base = ai.groove;
  }
  base = clamp(base, -0.72, Math.min(0.68, (HW - 3.9) / HW));
  let lane = base + (1 - cfAhead) * (base < 0.45 ? 0.2 : 0.06);
  { const pl = car.paceLane ?? ai.paceLane; if (ctx.hold > 0 && pl !== undefined) lane = lerp(lane, pl, clamp(ctx.hold, 0, 1)); }   // start/restart: hold your lane into turn 1
  // ---- mistakes (only racing under green)
  ai.mT = (ai.mT || 0) - dt;
  if (green && !ai.fixed && ai.mT <= -2 && v > 15 && Math.random() < dt * (1 - cons) * 0.2 * (ai.mist ?? 1)) {
    let m = K.mist[(Math.random() * K.mist.length) | 0];
    if ((m === 'overshoot' || m === 'loose' || m === 'spin') && cfEntry < 0.4 && cfNow < 0.4) m = 'bobble';
    if (m === 'spin' && Math.random() > 0.35 * (ai.mist ?? 1)) m = 'loose';
    ai.mistake = m; ai.mT = m === 'spin' ? 0.7 : 0.9 + Math.random() * 0.9; st.mistakes++;
    if (m === 'spin') st.spins++; if (m === 'overshoot') st.overshoots++;
  }
  if (ai.mT <= 0) ai.mistake = null;
  let speedMul = 1, thrMul = 1, slideAdd = 0, steerKick = 0;
  if (ai.mistake === 'push') { lane += 0.3; speedMul = 1.04; }       // overdrives the entry, washes up the track
  if (ai.mistake === 'bobble') thrMul = 0.35;                          // lifts / gets out of the throttle
  if (ai.mistake === 'overshoot') { lane += 0.5; speedMul = 1.07; }   // misses the cushion, slides up into the loose stuff
  if (ai.mistake === 'loose') { slideAdd = 0.32; thrMul = 1.15; }      // too much right foot: the rear steps out
  if (ai.mistake === 'spin') { slideAdd = 2; thrMul = 1.4; steerKick = 0.7; }  // overcorrects -> around it goes
  // ---- traffic
  let follow = 99, along = 0, blocker = null, bDs = 99, hiLim = 99, loLim = -99, hiHard = 99, loHard = -99, outsideMe = false;
  let ahead = null, aDs = 99, behind = null, bhDs = 99;
  const pace = !!ctx.pace;
  for (const o of others) {
    if (o === car) continue;
    const ds = sGap(o, car, P), dd = o.d - car.d, gap = o.player ? 3.0 : 2.7;
    if (ds > 0 && ds < aDs) { aDs = ds; ahead = o; }
    if (ds < 0 && -ds < bhDs) { bhDs = -ds; behind = o; }
    if (ai.sj && ai.sj.phase === 'slide' && o === ai.sj.o && ds < -5.3) continue;   // cleared him: free to slide up across his nose
    if (Math.abs(ds) < 6.2) {                                          // alongside: never squeeze into the car next to you
      if (Math.abs(dd) < 3.0) along += (dd > 0 ? -1 : 1) * (3.0 - Math.abs(dd)) / HW;
      const cl = ai.curLane * HW;
      if (dd > 0) { if (dd < 4.6) outsideMe = true; hiHard = Math.min(hiHard, o.d - gap); hiLim = Math.min(hiLim, Math.max(o.d - 4.2, Math.min(cl, o.d - gap))); }
      else { loHard = Math.max(loHard, o.d + gap); loLim = Math.max(loLim, Math.min(o.d + 4.2, Math.max(cl, o.d + gap))); }
      continue;
    }
    if (ds > 0 && ds < (pace ? 30 : 42)) {
      const inPath = pace ? Math.abs(dd) < 2.6 : (Math.abs(o.d - lane * HW) < 2.5 || Math.abs(dd) < 2.3);
      if (inPath && ds < bDs) { bDs = ds; blocker = o; }
    }
  }
  // ---- racecraft state: slide jobs, crossovers, defending
  ai.cd = (ai.cd || 0) - dt;
  const sj = ai.sj;
  if (green && !ai.fixed && !sj && !ai.xo && ai.cd <= 0 && ahead && aDs > 3 && aDs < 14 && cfEntry > 0.45 && cfNow < 0.45 && !ai.mistake) {
    ai.cd = 3;                                                           // one decision per corner
    const o = ahead, closing = v - o.speed, roomLow = o.d + HW - 1.0;
    const want = (K.sj * aggr) * (o.player ? 0.8 : 1) * (closing > -0.5 ? 1 : 0.3);
    if (o.d > -0.2 * HW && o.d > car.d - 1 && roomLow > 5.5 && loLim < o.d - 3.8 && Math.random() < want) {
      ai.sj = { o, phase: 'dive', t: 0, mid: false, startGap: aDs }; st.sjA++;
    }
  }
  if (ai.sj) {
    const S = ai.sj, o = S.o, lead = sGap(car, o, P); S.t += dt;
    if (cfNow > 0.6) S.mid = true;
    if (S.phase === 'dive') {
      lane = Math.max(-0.78, (o.d - 3.6) / HW); speedMul *= 1.035 + 0.02 * aggr;   // dive low and overdrive the entry
      if (S.mid && lead > (o.player ? 6.8 : 5.5)) S.phase = 'slide';
      else if (S.mid && cfNow < 0.55) S.phase = 'side';                // didn't clear him: race him side by side off the corner
    }
    if (S.phase === 'slide') {
      lane = Math.min(0.68, o.d / HW + 0.12); speedMul *= 1.02; S.slid = true;       // slide up across his nose
      if (!S.xo && o.ai && !o.ai.xo && !o.ai.fixed) { S.xo = 1; if (Math.random() < 0.4 + 0.5 * (o.ai.aggr ?? 0.5)) o.ai.xo = { o: car, t: 0, phase: 'wait' }; }
    }
    if (S.phase === 'side') lane = Math.min(lane, (o.d - 3.0) / HW);
    const done = (S.mid && cfNow < 0.25) || S.t > 12 || lead < -25 || o.dnf;
    if (done) { if (lead > 2 && S.slid) st.sjC++; ai.sj = null; ai.cd = 2; }
  }
  if (ai.xo) {                                                          // crossover: he slid up in front of me -> cut under him off the corner
    const X = ai.xo, o = X.o, lead = sGap(car, o, P); X.t += dt;
    if (X.phase === 'wait' && cfNow < 0.75) { X.phase = 'cross'; st.xA++; }
    if (X.phase === 'cross') { lane = Math.min(lane, Math.max(-0.7, (o.d - 3.4) / HW)); speedMul *= 0.99; if (lead > 1.5) { st.xC++; X.phase = 'done'; } }
    if (X.t > 4 || X.phase === 'done' || lead < -30) ai.xo = null;
  }
  // defend: protect the bottom into the corner if someone is setting up underneath (never once he's alongside)
  if (green && !ai.fixed && !ai.sj && behind && bhDs > 6.5 && bhDs < 14 && cfEntry > 0.4 && cfNow < 0.5) {
    if (ai.defT === undefined || ai.defT < -2.5) { ai.defT = Math.random() < K.defend * aggr * 0.8 && behind.d < car.d - 1.5 && behind.speed > v - 1 ? 1.8 : -0.01; if (ai.defT > 0) st.defends++; }
  }
  ai.defT = (ai.defT ?? -3) - dt;
  if (ai.defT > 0 && behind) lane = Math.max(-0.72, Math.min(lane, (behind.d + 3.3) / HW));
  // draft: tuck in behind on the straights before pulling out
  if (green && !ai.sj && ahead && aDs > 5 && aDs < 26 && cfNow < 0.2 && cfAhead < 0.3 && Math.abs(ahead.d - car.d) < 3.5 && aDs > 11) lane = lerp(lane, ahead.d / HW, 0.6);
  if (pace) {
    lane = ctx.paceLane ?? ai.paceLane ?? -0.1;
    if (blocker) follow = blocker.speed + (bDs - 7.5) * 0.6;
  } else if (blocker && !(ai.sj && blocker === ai.sj.o)) {
    const o = blocker, slow = o.speed < 8;
    const closing = v - o.speed;
    ai.passT = (ai.passT || 0) - dt;
    if (!ai.passSide || ai.passT <= 0 || ai.passVs !== o) {
      const roomHigh = HW - 1.2 - o.d, roomLow = o.d + HW - 1.0;
      const bias = (ai.groove ?? ai.lane) > 0.25 ? 2.5 : -2.5;           // prefer passing in your own groove
      ai.passSide = roomHigh + bias > roomLow ? 1 : -1; ai.passT = 2 + Math.random() * 1.5; ai.passVs = o;
    }
    const room = ai.passSide > 0 ? HW - 1.2 - o.d : o.d + HW - 1.0;
    const wantPass = slow || closing > 0.4 - aggr * 1.2 || bDs < 9;
    if (ai.sj) { /* mid slide job: keep the slide-job line, just don't run into him */ }
    else if (wantPass && room > 2.5) lane = (o.d + ai.passSide * 2.8) / HW;
    else if (wantPass && room <= 2.5) { ai.passSide = -ai.passSide; ai.passT = 0.8; }
    const lateral = Math.abs(o.d - ai.curLane * HW);
    const gapWant = 4.6 + (1 - aggr) * 3.2 + v * 0.07 + (o.player ? 1 : 0);
    if (lateral < 2.2) follow = o.speed + (bDs - gapWant) * 0.65;
    else if (lateral < 2.9 && bDs < 7) follow = o.speed + 2;
    if (slow && bDs < 30) follow = Math.min(follow, Math.max(10, v - 2) + (lateral > 2.6 ? 6 : 0));
  } else if (ai.sj && blocker === ai.sj.o) {
    const lateral = Math.abs(blocker.d - car.d); if (lateral < 2.2) follow = blocker.speed + (bDs - 5) * 0.65;  // still behind him: don't drive into him
  } else ai.passSide = 0;
  lane = clamp(lane + along * 1.4, -0.82, 0.76);
  if (hiLim < loLim) { const mid = (hiLim + loLim) / 2; hiLim = loLim = mid; }       // sandwiched: split the gap
  lane = clamp(lane, loLim / HW, hiLim / HW);
  if (hiHard > loHard) {                                               // squeezed inside the gap: give up the line now
    if (ai.curLane * HW > hiHard) ai.curLane = Math.max(lane, hiHard / HW);
    if (ai.curLane * HW < loHard) ai.curLane = Math.min(lane, loHard / HW);
  }
  const rate = (0.45 + 0.45 * aggr) * dt * (Math.abs(along) > 0 ? 2.2 : 1) * (ai.sj ? 1.5 : 1);
  ai.curLane += clamp(lane - ai.curLane, -rate, rate);
  // ---- steering: chase a look-ahead point on our line
  const look = 7 + v * 0.45;
  const tdRaw = (ai.curLane + along * 0.6) * HW, maxLat = look * (0.14 + 3 / Math.max(v, 3) * 0.1);
  const tp = trk.point(car.s + look, clamp(tdRaw, car.d - maxLat, car.d + maxLat));
  const want = Math.atan2(tp.z - car.z, tp.x - car.x);
  const err = wrapAngle(want - car.th);
  const velAng = v > 2 ? Math.atan2(car.vz, car.vx) : car.th;
  const beta = wrapAngle(velAng - car.th);
  const wPath = wrapAngle(trk.center(car.s + 3).th - trk.center(car.s + 1).th) / 2 * v * (trk.R / Math.max(20, trk.R + car.d));
  let steer = clamp(err * 2.0 + beta * 1.3 * (steerKick ? 0.2 : 1) - (car.w - wPath) * 0.35 + steerKick, -1, 1);
  // ---- speed plan from the corner radius of our line + grip in our groove
  const Rl = trk.R + ai.curLane * HW;
  const muE = 0.86 * car.gripMul * (1 + 0.75 * Math.sin(trk.smooth ? trk.bankAngle((trk.s1 + trk.s2) / 2, ai.curLane * HW) : trk.bank)) * (1 - 0.18 * car.damage / 100) * (0.9 + 0.1 * (car.tire ?? 1));
  const sideBy = K.side > 0.8 ? 0.982 : 0.97;
  const vc = Math.sqrt(muE * Math.min(trk.groove(ai.curLane * HW).grip, trk.groove(car.d).grip) * 9.81 * Rl) * ai.skill * 0.955 * speedMul * (ai.curLane * HW > HW - 3.5 ? 0.97 : 1) * (outsideMe ? sideBy : 1);
  let vt = 60;
  for (let k = 0; k <= 80; k += 10) {
    const cf = trk.cornerFactor(car.s + k);
    if (cf > 0.6) vt = Math.min(vt, Math.sqrt(vc * vc + 2 * (4.4 + aggr * 1.2) * k));
  }
  if (pace) vt = Math.min(vt, ctx.paceSpeed || 16);
  vt = Math.min(vt, follow);
  const wallRoom = trk.outer - 1.1 - car.d;
  if (wallRoom < 1.6 && cfNow > 0.3) vt = Math.min(vt, v - 2.5 * (1.6 - wallRoom));
  let throttle = clamp((vt - v) * 0.4, 0, 1) * thrMul, brake = v > vt + 2.5 ? clamp((v - vt) * 0.15, 0, 0.7) : 0;
  if (pace && v > vt + 0.8) brake = Math.max(brake, clamp((v - vt) * 0.2, 0, 0.6));
  const slideOK = 0.16 + aggr * 0.1 + slideAdd;
  if (Math.abs(beta) > slideOK) throttle *= clamp(1 - (Math.abs(beta) - slideOK) * 4, 0.15, 1);
  if (car.wheelSpin > 0.25 && !slideAdd) throttle *= 0.85;
  throttle = clamp(throttle, 0, 1);
  if (Math.abs(beta) > 1.0 && v > 4) { throttle = 0; brake = 0.6; steer = clamp(beta * 2, -1, 1); if (ai.mistake === 'spin') ai.mistake = null; }
  else if (v < 6 && Math.abs(err) > 0.9) { throttle = 0.35; brake = 0; steer = Math.sign(err); }
  if (ai.startDelay > 0) { throttle = 0; brake = 1; }
  return { steer, throttle, brake };
}

// AI safety net: if a car is stuck/spun for too long, re-fire it on its lane
export function checkStuck(car, trk, dt) {
  const pr = trk.project(car.x, car.z), c = trk.center(pr.s);
  const off = Math.abs(wrapAngle(car.th - c.th));
  if (car.speed < 5 || off > 1.3) car.stuck += dt; else car.stuck = Math.max(0, car.stuck - dt * 2);
  if (car.stuck > 3.5) {
    const p = trk.point(pr.s, clamp(pr.d, -trk.W / 2 + 2, trk.W / 2 - 2));
    car.x = p.x; car.z = p.z; car.th = p.th; car.vx = Math.cos(p.th) * 8; car.vz = Math.sin(p.th) * 8; car.w = 0; car.stuck = 0;
    return true;
  }
  return false;
}
