import { ContactShadow, seatWheels } from './contact.js';
// Hauler loading mini-game: drive the late model up the ramp into the enclosed trailer and park it.
import * as THREE from 'three';
import { makeLateModel, makeSemi, makeSky, dirtTextures, glowTexture, trailerTexture, disposeScene } from './gfx.js';
import { clamp, lerp, wrapAngle } from './physics.js';
import * as UI from './ui.js';

const RAMP_LEN = 4.6, FLOOR = 1.25, RAMP_HALF = 1.22, IN_HALF = 1.25, FRONT_X = -15.4;
export class LoadScene {
  constructor(app) {
    this.app = app; const st = app.state;
    const s = this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(58, innerWidth / innerHeight, 0.1, 4000);
    s.fog = new THREE.FogExp2(0x1c1a26, 0.012);
    s.add(makeSky({ top: 0x020409, horizon: 0x1c1a26, bottom: 0x050506, sunDir: [0.3, 0.3, -1], sunColor: 0x223344, sunSize: 0.5, stars: true }));
    s.add(new THREE.HemisphereLight(0x7080a8, 0x786c60, 1.0));
    s.add(new THREE.AmbientLight(0xa8a096,0.32));
    // tamer bloom/exposure: white trailer walls under floodlights were blowing out
    app.bloom.strength = 0.08; app.bloom.threshold = 3.0; app.bloom.radius = 0.2; app.renderer.toneMappingExposure = 0.92;
    const flood2 = new THREE.SpotLight(0xffe6c4, 480, 80, 0.7, 0.7, 1.6); flood2.position.set(26, 12, -10); flood2.target.position.set(12, 0, 0); s.add(flood2, flood2.target);
    const flood = new THREE.SpotLight(0xfff0d8, 650, 90, 0.75, 0.65, 1.6); flood.position.set(14, 14, 12); flood.target.position.set(-2, 0, 0); flood.castShadow = true; flood.shadow.mapSize.set(2048, 2048); flood.shadow.bias = -0.00008; flood.shadow.normalBias=0.006; s.add(flood, flood.target);
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.15, 14, 8), new THREE.MeshStandardMaterial({ color: 0x555 })); pole.position.set(14.3, 7, 12.3); s.add(pole);
    const dirt = dirtTextures(app.track.clay); dirt.map.repeat.set(40, 40); dirt.bump.repeat.set(40, 40);
    const g = new THREE.Mesh(new THREE.PlaneGeometry(400, 400), new THREE.MeshStandardMaterial({ map: dirt.map, bumpMap: dirt.bump, bumpScale: 0.12, roughness: 1, color: 0xa09080 }));
    g.rotation.x = -Math.PI / 2; g.receiveShadow = true; s.add(g);
    // your rig: trailer rear at x=0, interior toward -x
    const semi = this.semi = makeSemi({ team: st.team, num: st.num, color: st.color, accent: st.accent, cabColor: 0x1a1a1e });
    semi.rotation.y = Math.PI; semi.position.x = -17.8; s.add(semi);
    const u = semi.userData; u.rampPivot.scale.x = RAMP_LEN / u.rampLen; u.rampPivot.rotation.z = -Math.PI / 2; this.rampTarget = Math.asin(FLOOR / RAMP_LEN);
    // interior strip lights
    for (let i = 0; i < 3; i++) { const pl = new THREE.PointLight(0xdfe8ff, 3.5, 8, 1.6); pl.position.set(-3 - i * 5, 3.9, 0); s.add(pl); }
    const strip = new THREE.Mesh(new THREE.BoxGeometry(14, 0.04, 0.12), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xe8f0ff, emissiveIntensity: 1.2 })); strip.position.set(-8, 4.12, 0); s.add(strip);
    // parking chocks / goal marks on the trailer floor
    const goalMat = new THREE.MeshStandardMaterial({ color: 0x40ff70, emissive: 0x20ff50, emissiveIntensity: .35, transparent: true, opacity: 0.6 });
    this.goal = new THREE.Mesh(new THREE.PlaneGeometry(2.3, 2.2), goalMat); this.goal.rotation.x = -Math.PI / 2; this.goal.position.set(-11.65, FLOOR + 0.02, 0); s.add(this.goal);
    // Physical, depth-occluded floodlight head; no billboard glow over the rig.
    const lamp=new THREE.Mesh(new THREE.BoxGeometry(.65,.28,1.5),new THREE.MeshStandardMaterial({color:0xd9d4c9,emissive:0xffddb0,emissiveIntensity:.65,roughness:.9}));lamp.position.copy(flood.position);s.add(lamp);
    const stripeMat=new THREE.MeshStandardMaterial({color:0xcba34c,roughness:.96});
    for(const z of [-1.10,1.10]){const strip=new THREE.Mesh(new THREE.BoxGeometry(u.rampLen-.15,.015,.065),stripeMat);strip.position.set(-u.rampLen/2,.048,z);u.rampPivot.add(strip);}
    for(let x=-.3;x>-u.rampLen+.2;x-=.28){const rib=new THREE.Mesh(new THREE.BoxGeometry(.035,.014,2.08),new THREE.MeshStandardMaterial({color:0x777b80,roughness:.95}));rib.position.set(x,.047,0);u.rampPivot.add(rib);}
    for(const z of [-1.18,1.18]){const guide=new THREE.Mesh(new THREE.PlaneGeometry(10,.075),stripeMat);guide.rotation.x=-Math.PI/2;guide.position.set(9,.009,z);s.add(guide);}
    // other haulers & scenery
    const others = [['Strickland Motorsports', '7S', 0x1e5fd8, 0xffffff], ['McCrary Racing', '99', 0xf2c014, 0x111111], ['Tillman Bros', '18', 0x1f9e4a, 0xffffff]];
    others.forEach((o, i) => { const sm = makeSemi({ team: o[0], num: o[1], color: o[2], accent: o[3] }); sm.rotation.y = Math.PI; sm.position.set(-17.8 + (i % 2) * 3, 0, (i + 1) * (i % 2 ? -9 : 9) * (i > 1 ? 1.6 : 1)); s.add(sm); });
    // crew members waving by the ramp
    const crewMat = new THREE.MeshStandardMaterial({ color: st.color, roughness: 0.7 });
    this.crew = [];
    for (const z of [-2.2, 2.2]) {
      const p=new THREE.Group(),pants=new THREE.MeshStandardMaterial({color:0x343d4b,roughness:1}),boots=new THREE.MeshStandardMaterial({color:0x252622,roughness:1}),skin=new THREE.MeshStandardMaterial({color:0xc89070,roughness:.9});
      const torso=new THREE.Mesh(new THREE.CapsuleGeometry(.23,.46,4,10),crewMat);torso.position.y=1.15;p.add(torso);
      for(const z of [-.13,.13]){const leg=new THREE.Mesh(new THREE.CapsuleGeometry(.10,.55,4,8),pants);leg.position.set(0,.48,z);p.add(leg);const boot=new THREE.Mesh(new THREE.BoxGeometry(.34,.15,.19),boots);boot.position.set(.055,.075,z);p.add(boot);}
      const head=new THREE.Mesh(new THREE.SphereGeometry(.17,16,10),skin);head.position.y=1.66;p.add(head);
      const cap=new THREE.Mesh(new THREE.SphereGeometry(.18,12,8,0,Math.PI*2,0,Math.PI/2),crewMat);cap.position.y=1.70;p.add(cap);const brim=new THREE.Mesh(new THREE.BoxGeometry(.15,.025,.25),crewMat);brim.position.set(.16,1.70,0);p.add(brim);
      const arm=new THREE.Mesh(new THREE.CapsuleGeometry(.07,.47,4,8),crewMat);arm.position.set(0,1.37,.28*Math.sign(z));arm.geometry.translate(0,.25,0);p.add(arm);p.userData.arm=arm;
      const hand=new THREE.Mesh(new THREE.SphereGeometry(.075,10,8),skin);hand.position.y=.55;arm.add(hand);
      p.position.set(5.5, 0, z); p.traverse(o => o.castShadow = true); s.add(p); this.crew.push(p);
    }
    const trees=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(3.5,1),new THREE.MeshStandardMaterial({color:0x435142,roughness:1}),80),trunks=new THREE.InstancedMesh(new THREE.CylinderGeometry(.25,.35,4,6),new THREE.MeshStandardMaterial({color:0x594e42,roughness:1}),80),mt=new THREE.Matrix4();
    for(let i=0;i<80;i++){const x=-150+i*4,z=-90-Math.sin(i*2.7)*12;mt.makeTranslation(x,2,z);trunks.setMatrixAt(i,mt);mt.makeScale(1,1.25,1);mt.setPosition(x,5.2,z);trees.setMatrixAt(i,mt);}s.add(trees,trunks);
    // car
    this.car = makeLateModel({ color: st.color, accent: st.accent, num: st.num,name:st.driver,sponsor:st.sponsor||'RED CLAY RACING',livery:{scheme:st.scheme??4,cageColor:st.cageColor??0xc92127} }); this.car.rotation.order = 'YXZ'; s.add(this.car);
    this.contact=new ContactShadow(s,this.car);
    this.rigContact=new ContactShadow(s,semi,true);this.rigContact.update(()=>0);
    this.c = { x: 15, z: (Math.random() - 0.5) * 1.6, th: Math.PI + (Math.random() - 0.5) * 0.25, v: 0, steer: 0 };
    this.t = 0; this.timer = 0; this.dmg = 0; this.hits = 0; this.falls = 0; this.hold = 0; this.cool = 0; this.camMode = 0; this.intro = 2.2; this.done = false; this.winch = false;
    const mech = app.crew('Mechanic'); this.par = 35 + (mech ? mech.skill * 2 : 0);
    this.buildHud();
  }
  buildHud() {
    const h = document.createElement('div'); h.id = 'hud';
    h.innerHTML = `<div class="hud-box" style="left:16px;top:16px"><div class="lbl">LOAD TIME</div><div class="big" id="l-t">0.0</div><div class="lbl">PAR ${this.par}s</div></div>
      <div class="hud-box" style="left:150px;top:16px"><div class="lbl">CAR DAMAGE ADDED</div><div class="big" id="l-d">0%</div></div>
      <div class="hud-box" style="right:16px;top:16px;width:230px"><div class="lbl">ALIGNMENT</div><canvas id="l-al" width="200" height="60"></canvas><div class="lbl" id="l-st">line it up with the ramp</div></div>
      <div id="center-msg" style="font-size:64px"></div><div id="sub-msg"></div>
      <div class="hint">W/↑ creep forward • S/↓ brake / reverse • A/D ←/→ steer • stop in the GREEN box • C camera • X let the crew winch it ($300, slow)</div>`;
    this.app.ui.appendChild(h);
    this.hud = { t: h.querySelector('#l-t'), d: h.querySelector('#l-d'), al: h.querySelector('#l-al').getContext('2d'), st: h.querySelector('#l-st'), msg: h.querySelector('#center-msg'), sub: h.querySelector('#sub-msg') };
    this.hud.msg.textContent = 'LOAD THE CAR'; this.hud.sub.textContent = 'Drive up the ramp — fall off the edge or hit the walls and you\'ll bend something';
  }
  height(x, z) {
    if (x < 0 && x > -16.2 && Math.abs(z) < IN_HALF + 0.05) return FLOOR;
    const rx = RAMP_LEN * Math.cos(this.rampTarget);
    if (x >= 0 && x <= rx && Math.abs(z) <= RAMP_HALF) return FLOOR * (1 - x / rx);
    return 0;
  }
  wheelPts(c) {
    const cs = Math.cos(c.th), sn = Math.sin(c.th);
    return [[1.32, -0.86], [1.32, 0.7], [-1.36, -0.85], [-1.36, 0.91]].map(([lx, lz]) => ({ x: c.x + cs * lx - sn * lz, z: c.z + sn * lx + cs * lz, lx, lz }));
  }
  corners(c) {
    const cs = Math.cos(c.th), sn = Math.sin(c.th);
    return [[2.85, -1.10], [2.85, 1.10], [-2.65, -1.10], [-2.65, 1.10], [0, -1.10], [0, 1.10]].map(([lx, lz]) => ({ x: c.x + cs * lx - sn * lz, z: c.z + sn * lx + cs * lz, lx }));
  }
  blocked(c) {
    const centerOut = Math.abs(c.z) > IN_HALF + 0.25;
    for (const p of this.corners(c)) {
      if (p.x < 0.02 && p.x > -22) {
        if (!centerOut && Math.abs(p.z) > IN_HALF - 0.03) return 'wall';
        if (centerOut && Math.abs(p.z) < IN_HALF + 0.2) return 'wall';
      }
      if (p.lx > 0 && p.x < FRONT_X) return 'front';
    }
    return null;
  }
  update(dt) {
    const { app, c } = this; this.t += dt;
    if (app.tap('KeyC')) this.camMode = (this.camMode + 1) % 3;
    // ramp opens during intro
    const rp = this.semi.userData.rampPivot; rp.rotation.z = lerp(rp.rotation.z, this.rampTarget, 1 - Math.exp(-dt * 2.2));
    if (this.intro > 0) { this.intro -= dt; if (this.intro <= 0) { this.hud.msg.textContent = ''; this.hud.sub.textContent = ''; } }
    if (!this.done) {
      if (app.tap('KeyX') && !this.winch) { this.winch = true; this.hud.sub.textContent = 'Crew is winching it in… (+$300)'; }
      let inp = app.input();
      if (this.intro > 0) {inp = { steer: 0, throttle: 0, brake: 0 };c.v=0;}
      if (this.winch) inp = this.autopilot();
      if (this.intro <= 0) this.timer += dt * (this.winch ? 1.6 : 1);
      // kinematic drive
      const maxV = this.winch ? 1.3 : 2.35;
      c.steer += clamp(inp.steer - c.steer, -2.2 * dt, 2.2 * dt);
      if (inp.throttle) c.v = Math.min(maxV, c.v + 2.0 * dt);
      else if (inp.brake) c.v = c.v > 0.05 ? Math.max(0, c.v - 5 * dt) : Math.max(-2.0, c.v - 1.6 * dt);
      else c.v *= Math.exp(-dt * 1.6);
      // gravity on the ramp: slight roll-back
      const prev = { ...c };
      c.th = wrapAngle(c.th + c.v / 2.8 * Math.tan(c.steer * 0.55) * dt);
      c.x += Math.cos(c.th) * c.v * dt; c.z += Math.sin(c.th) * c.v * dt;
      c.x = clamp(c.x, -30, 40); c.z = clamp(c.z, -14, 14);
      this.cool -= dt;
      const b = this.blocked(c);
      if (b) {
        const sp = Math.abs(c.v);
        Object.assign(c, prev); c.v = -prev.v * 0.25;
        if (this.cool <= 0 && sp > 0.35) { const d = 1 + sp * 2.6; this.dmg += d; this.hits++; this.cool = 0.6; this.shake = 0.5; this.flash(b === 'front' ? 'BANG! Hit the cabinets' : 'SCRAPED THE TRAILER WALL', '#ff5a4a'); }
      }
      // falling off the ramp edge
      const hs = this.wheelPts(c).map(w => this.height(w.x, w.z));
      if (Math.max(Math.abs(hs[0] - hs[1]), Math.abs(hs[2] - hs[3])) > 0.4 && c.x > -1 && !this.falling) {
        this.falling = 1.0; this.dmg += 6; this.falls++; this.flash('OFF THE RAMP! +6% damage', '#ff5a4a'); this.shake = 1;
      }
      // goal: parked in the green box
      const inGoal = c.x < -10.4 && c.x > -12.9 && Math.abs(c.z) < 0.35 && Math.abs(wrapAngle(c.th - Math.PI)) < 0.12;
      if (inGoal && Math.abs(c.v) < 0.25) { this.hold += dt; this.hud.st.textContent = `HOLD IT… ${(1.2 - this.hold).toFixed(1)}`; } else this.hold = 0;
      this.goal.material.color.setHex(inGoal ? 0x40ff70 : 0xffc83d); this.goal.material.emissive.setHex(inGoal ? 0x20ff50 : 0xffa000);
      if (this.hold > 1.2) this.finish();
      this.wheelH = hs;
    }
    if (this.falling) {
      this.falling -= dt;
      if (this.falling <= 0) { this.falling = 0; Object.assign(this.c, { x: 13, z: 0, th: Math.PI, v: 0, steer: 0 }); this.flash('Crew pushed it back. Try again.', '#fff'); }
    }
    // pose the car on its four wheels
    const hs = this.wheelH || [0, 0, 0, 0];
    const hF = (hs[0] + hs[1]) / 2, hR = (hs[2] + hs[3]) / 2, hLft = (hs[0] + hs[2]) / 2, hRt = (hs[1] + hs[3]) / 2;
    const m = this.car;
    const y = (hF + hR) / 2 - (this.falling ? (1 - this.falling) * 0.6 : 0);
    m.position.set(c.x, y, c.z);
    m.rotation.y = -c.th;
    m.rotation.z = lerp(m.rotation.z, Math.atan2(hF - hR, 2.68), 1-Math.exp(-dt*26));
    m.rotation.x = lerp(m.rotation.x, -Math.atan2(hRt - hLft, 1.7) + (this.falling ? 0.25 * Math.sign(c.z || 1) * -1 : 0), 1-Math.exp(-dt*22));
    c.wr = (c.wr || 0) + c.v * dt / 0.42;
    m.userData.wheels.forEach((w, i) => { w.rotation.z = -c.wr; if (i < 2) w.rotation.y = -c.steer * 0.5; });
    if(!this.falling)seatWheels(m,(x,z)=>this.height(x,z));
    this.contact.update((x,z)=>this.height(x,z));
    // roof cutaway while inside so you can see
    const inside = c.x < 1.5; this.semi.userData.roof.visible = !inside || this.camMode === 2;
    this.crew.forEach((p, i) => { p.userData.arm.rotation.x = Math.sin(this.t * 4 + i) * 0.6 * (i ? 1 : -1) + (i ? -2.4 : 2.4); p.lookAt(c.x, 0, c.z); });
    this.updateCamera(dt);
    this.updateHud();
    this.app.audio.set(0.12 + Math.abs(c.v) * 0.06, Math.abs(c.v) > 0.1 ? 0.5 : 0.2, 0.08);
  }
  autopilot() {
    const c = this.c; const look = 3.5;
    const tx = c.x - look, tz = 0;
    const want = Math.atan2(tz - c.z, tx - c.x);
    const steer = clamp(wrapAngle(want - c.th) * 2.2, -1, 1);
    const stop = c.x < -11.4;
    return { steer, throttle: stop ? 0 : 1, brake: stop ? 1 : 0 };
  }
  flash(t, col) { this.hud.msg.textContent = t; this.hud.msg.style.color = col; clearTimeout(this.ft); this.ft = setTimeout(() => { if (this.hud) this.hud.msg.textContent = ''; }, 1400); }
  updateCamera(dt) {
    const cam = this.camera, c = this.c, m = this.car;
    const sh = (this.shake || 0); this.shake = Math.max(0, sh - dt * 2);
    let want, look;
    if (this.intro > 0) { const a = this.intro / 2.2; want = new THREE.Vector3(20 + a * 8, 5 + a * 4, 9 - a * 2); look = new THREE.Vector3(-2, 1.5, 0); }
    else if (this.camMode === 0) { want = new THREE.Vector3(c.x - Math.cos(c.th) * 7, m.position.y + 3.9, c.z - Math.sin(c.th) * 7); look = new THREE.Vector3(c.x + Math.cos(c.th) * 4, m.position.y + 0.8, c.z + Math.sin(c.th) * 4); }
    else if (this.camMode === 1) { want = new THREE.Vector3(-14.8, 3.6, 0); look = new THREE.Vector3(c.x, m.position.y + 0.6, c.z); }
    else { want = new THREE.Vector3(9, 2.2, 6.5); look = new THREE.Vector3(c.x, m.position.y + 0.8, c.z); }
    cam.position.lerp(want, 1 - Math.exp(-dt * (this.intro > 0 ? 3 : 5))); cam.position.x += (Math.random() - 0.5) * sh * 0.3; cam.position.y += (Math.random() - 0.5) * sh * 0.3;
    cam.lookAt(look);
  }
  updateHud() {
    const h = this.hud, c = this.c; if (!h) return;
    h.t.textContent = this.timer.toFixed(1); h.t.style.color = this.timer > this.par ? '#ff5a4a' : '#fff';
    h.d.textContent = this.dmg.toFixed(0) + '%';
    const g = h.al; g.clearRect(0, 0, 200, 60); g.fillStyle = '#2a1a10'; g.fillRect(10, 22, 180, 16);
    g.fillStyle = '#5fd16a'; g.fillRect(100 - 0.35 * 60, 22, 0.7 * 60, 16);
    const off = clamp(c.z, -1.5, 1.5), ang = wrapAngle(c.th - Math.PI);
    g.save(); g.translate(100 + off * 60, 30); g.rotate(ang); g.fillStyle = '#ffc83d'; g.fillRect(-14, -6, 28, 12); g.fillStyle = '#000'; g.fillRect(-14, -2, 6, 4); g.restore();
    if (this.hold <= 0 && !this.done) h.st.textContent = c.x > 0.5 ? (Math.abs(c.z) < 0.4 && Math.abs(ang) < 0.1 ? 'lined up — go!' : Math.abs(c.z)>.4?`ramp to your ${c.z>0?'RIGHT':'LEFT'} — ease over`:'straighten the car before climbing') : 'ease forward to the green box';
  }
  finish() {
    this.done = true; this.hud.st.textContent = 'PARKED'; this.c.v = 0;
    const t = this.timer, over = Math.max(0, t - this.par);
    const cost = Math.round(over * 15) + (this.winch ? 300 : 0);
    const bonus = this.winch ? 0 : clamp((this.par - t) / this.par, 0, 1) * (this.dmg ? 0.5 : 1.2);
    const r = { time: t, dmg: this.dmg, cost, bonusHours: +bonus.toFixed(2), hits: this.hits, falls: this.falls, winch: this.winch };
    this.result = r;
    this.semi.userData.rampPivot.rotation.z = this.rampTarget;
    const el = document.createElement('div'); el.className = 'screen';
    el.innerHTML = `<div class="panel load-summary" style="width:440px"><div class="kicker">LOADING COMPLETE</div><h2>Ready to roll.</h2><p class="muted">${this.dmg ? 'Race car secured.' : 'A clean load. Nice work.'}</p><table>
      <tr><td>Load time</td><td>${t.toFixed(1)}s (par ${this.par}s)</td></tr><tr><td>Wall hits / ramp falls</td><td>${this.hits} / ${this.falls}</td></tr>
      <tr><td>Damage added</td><td>${this.dmg.toFixed(0)}%</td></tr><tr><td>Extra cost</td><td>$${cost}${this.winch ? ' (winch crew)' : ''}${over ? ' (crew overtime)' : ''}</td></tr>
      <tr><td>Head start on the road</td><td style="color:#5fd16a">+${bonus.toFixed(2)} h</td></tr></table>
      <div class="row" style="margin-top:12px"><span style="flex:1"></span><button id="go">Route planner →</button></div></div>`;
    this.app.ui.appendChild(el);
    el.querySelector('#go').onclick = () => UI.afterLoad(this.app, r);
  }
  dispose() { clearTimeout(this.ft); this.hud = null; disposeScene(this.scene); }
}
