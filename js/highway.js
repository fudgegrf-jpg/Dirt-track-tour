import {qualityPreset} from './quality.js';
import { ContactShadow,seatWheels,seatRigWheels } from './contact.js';
// Interstate driving: semi + enclosed hauler, traffic, signs, truck stops, fuel/fatigue/clock.
import * as THREE from 'three';
import { makeSemi, makeSky, makeTrafficCar, laneTexture, grassTexture, signTexture, billboardTexture, glowTexture, disposeScene, srand, rnd } from './gfx.js';
import { clamp, lerp, wrapAngle } from './physics.js';
import { TRACKS } from './data.js';
import * as UI from './ui.js';

const DS = 2, MEDIAN = 14, LANES = [1.85, 5.55], LIMIT = 70, TRAP = 75;
const smooth = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };

export class HighwayScene {
  constructor(app, { route }) {
    this.app = app; this.route = route; const st = app.state;
    this.miles = UI.routeMiles(route); this.deadline = UI.deadlineHours(route, st);
    this.Lg = clamp(this.miles * 9, 2600, 8200);           // game meters for this leg
    this.mpm = this.miles / this.Lg;                        // real miles per game meter
    this.timeScale = this.mpm * 1609.34;                    // real seconds per game second (same compression as distance)
    this.from = TRACKS[st.round]; this.to = TRACKS[st.round + 1];
    srand(st.round * 1337 + 7);
    this.startHour = [7.2, 17.6, 9.5, 18.6][st.round] ?? 6;
    this.hours = 0; this.fuel = st.fuel; this.fatigue = st.fatigue; this.rigDmg = 0; this.carDmg = 0; this.spent = 0; this.tickets = 0; this.tows = 0;
    this.co = app.crew('Co-Driver');
    const s = this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(60, innerWidth / innerHeight, 0.2, 6000);
    this.buildRoad();
    this.buildWorld();
    this.buildTruck();
    this.buildTraffic();
    this.buildHud();
    this.t = { S: 30, lat: LANES[1], yaw: 0, v: 0, steer: 0, trailer: 0, cruise: 0 };
    this.camMode = 0; this.time = 0; this.menu = null; this.ended = false; this.hitCool = 0; this.drowsy = 0;
    this.applyTimeOfDay(true);
  }
  // ---------------------------------------------------------------- road centerline
  buildRoad() {
    const n = Math.ceil((this.Lg + 1200) / DS) + 1; this.S0 = -400; this.N = n;
    this.X = new Float32Array(n); this.Z = new Float32Array(n); this.TH = new Float32Array(n); this.Y = new Float32Array(n);
    const p1 = rnd() * 6, p2 = rnd() * 6, p3 = rnd() * 6, p4 = rnd() * 6;
    let x = 0, z = 0;
    for (let i = 0; i < n; i++) {
      const S = this.S0 + i * DS;
      const th = 0.32 * Math.sin(S / 950 + p1) + 0.16 * Math.sin(S / 410 + p2);
      const y = 9 * Math.sin(S / 760 + p3) + 4 * Math.sin(S / 290 + p4);
      this.X[i] = x; this.Z[i] = z; this.TH[i] = th; this.Y[i] = y;
      x += Math.cos(th) * DS; z += Math.sin(th) * DS;
    }
  }
  at(S) { // centre-line (our left edge) sample
    const f = clamp((S - this.S0) / DS, 0, this.N - 2), i = Math.floor(f), u = f - i;
    return { x: lerp(this.X[i], this.X[i + 1], u), z: lerp(this.Z[i], this.Z[i + 1], u), th: lerp(this.TH[i], this.TH[i + 1], u), y: lerp(this.Y[i], this.Y[i + 1], u) };
  }
  pt(S, lat, dy = 0) { const c = this.at(S); return new THREE.Vector3(c.x - Math.sin(c.th) * lat, c.y + dy, c.z + Math.cos(c.th) * lat); }
  grade(S) { return (this.at(S + 5).y - this.at(S - 5).y) / 10; }
  curvature(S) { return (this.at(S + 5).th - this.at(S - 5).th) / 10; }
  // terrain height at (S, lat)
  terrainY(S, lat) {
    const base = this.at(S).y, a = Math.abs(lat < 0 ? lat + MEDIAN + 12.4 + 0 : lat - 11.4) ;
    if (lat >= -MEDIAN - 0.01 && lat <= -0.99) { const m = clamp((lat + 1) / -(MEDIAN - 1), 0, 1); return base - 0.15 - 0.9 * Math.sin(Math.PI * m); } // median swale
    const ditch = -0.9 * Math.exp(-((a - 2.5) ** 2) / 2.5);
    const hills = smooth(6, 40, a) * (5 * Math.sin(S / 210 + lat / 47) + 3 * Math.sin(S / 97 - lat / 31) + a * 0.04);
    return base - 0.15 + ditch + hills;
  }
  ribbon(S0, S1, lats, yFn, uvFn, colFn) {
    const rows = Math.ceil((S1 - S0) / 4) + 1, M = lats.length, pos = new Float32Array(rows * M * 3), uv = new Float32Array(rows * M * 2), col = colFn ? new Float32Array(rows * M * 3) : null, idx = [];
    for (let r = 0; r < rows; r++) {
      const S = Math.min(S1, S0 + r * 4), c = this.at(S), sn = Math.sin(c.th), cs = Math.cos(c.th);
      for (let j = 0; j < M; j++) {
        const lat = lats[j], k = r * M + j;
        pos[k * 3] = c.x - sn * lat; pos[k * 3 + 1] = yFn(S, lat); pos[k * 3 + 2] = c.z + cs * lat;
        const [u, v] = uvFn(S, lat); uv[k * 2] = u; uv[k * 2 + 1] = v;
        if (col) { const cc = colFn(S, lat); col[k * 3] = cc[0]; col[k * 3 + 1] = cc[1]; col[k * 3 + 2] = cc[2]; }
      }
    }
    for (let r = 0; r < rows - 1; r++) for (let j = 0; j < M - 1; j++) { const a = r * M + j, b = a + M; idx.push(a, a + 1, b, a + 1, b + 1, b); }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); if (col) g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    g.setIndex(idx); g.computeVertexNormals(); return g;
  }
  // ---------------------------------------------------------------- world
  buildWorld() {
    const s = this.scene, Lend = this.Lg + 700;
    this.sky = makeSky({ top: 0x2a5fb0, horizon: 0xbfd6e8, bottom: 0x40403a, sunDir: [0.3, 0.4, -1], sunColor: 0xfff0d0, sunSize: 0.03, stars: true, moon: [-0.4, 0.5, 0.7] }); s.add(this.sky);
    this.skyU = this.sky.children[0].material.uniforms; this.stars = this.sky.userData.stars;
    s.fog = new THREE.Fog(0xbfd6e8, 120, 1500);
    this.hemi = new THREE.HemisphereLight(0xbfd6ff, 0x4a4030, 0.8); s.add(this.hemi);
    this.sun = new THREE.DirectionalLight(0xfff2dd, 2.6); this.sun.castShadow = true; this.sun.shadow.mapSize.set(2048, 2048);
    Object.assign(this.sun.shadow.camera, { left: -60, right: 60, top: 60, bottom: -60, near: 1, far: 400 }); this.sun.shadow.bias = -0.000025; this.sun.shadow.normalBias = 0.006;
    s.add(this.sun, this.sun.target);
    const laneT = laneTexture(); laneT.anisotropy = 16;
    const roadMat = new THREE.MeshStandardMaterial({ map: laneT, roughness: 0.82, metalness: 0.0 });
    this.roadMat = roadMat;
    // regional look per leg: Deep South pines -> Ozark hardwoods -> Missouri/Iowa prairie -> Corn Belt
    const BIOMES = [
      { name: 'Gulf Coast pines', grass: '#587a34', pine: 0.7, trees: 2800, windy: 0.3 },
      { name: 'Ozark hills', grass: '#4a6a2c', pine: 0.35, trees: 3400, windy: 0.35 },
      { name: 'Prairie', grass: '#7a8040', pine: 0.08, trees: 1300, windy: 0.85 },
      { name: 'Corn Belt', grass: '#62783a', pine: 0.04, trees: 1500, windy: 0.7 },
    ];
    const bio = this.biome = BIOMES[Math.min(this.app.state.round, BIOMES.length - 1)] || BIOMES[0];
    this.windy = bio.windy;
    const grassT = grassTexture(bio.grass); const terrMat = new THREE.MeshStandardMaterial({ map: grassT, vertexColors: true, roughness: 1 });
    const pal = [[1, 1, 1], [1.25, 1.15, 0.62], [0.85, 0.95, 0.7], [1.15, 0.95, 0.65], [0.95, 1.08, 0.8], [1.35, 1.2, 0.55]];
    const field = (S, lat) => { const h = Math.abs(Math.sin(Math.floor(S / 260 + 7) * 12.9898 + Math.floor(lat / 90 + 50) * 78.233) * 43758.5453) % 1; const near = Math.abs(lat) < 30 || (lat < -1 && lat > -MEDIAN - 12.4); return near ? [0.95, 1, 0.92] : pal[Math.floor(h * pal.length)]; };
    const terrR = [11.4, 12.5, 14, 16, 20, 28, 42, 70, 120, 200, 320, 520];
    const terrL = [-MEDIAN - 12.4 - 520, -MEDIAN - 12.4 - 320, -MEDIAN - 12.4 - 200, -MEDIAN - 12.4 - 120, -MEDIAN - 12.4 - 70, -MEDIAN - 12.4 - 42, -MEDIAN - 12.4 - 28, -MEDIAN - 12.4 - 20, -MEDIAN - 12.4 - 16, -MEDIAN - 12.4 - 14, -MEDIAN - 12.4 - 12.5, -MEDIAN - 12.4 - 1.1];
    const medL = [-MEDIAN, -12, -10, -7.5, -5, -3, -1];
    const tY = (S, lat) => this.terrainY(S, lat);
    for (let S0 = this.S0; S0 < Lend; S0 += 200) {
      const S1 = S0 + 200;
      const ours = new THREE.Mesh(this.ribbon(S0, S1, [-1, 3.7, 7.4, 11.4], (S) => this.at(S).y, (S, lat) => [(lat + 1) / 12.4, S / 12]), roadMat); ours.receiveShadow = true; s.add(ours);
      const theirs = new THREE.Mesh(this.ribbon(S0, S1, [-MEDIAN - 12.4, -MEDIAN - 7.4, -MEDIAN - 3.7, -MEDIAN + 1], (S) => this.at(S).y, (S, lat) => [(-MEDIAN - lat + 1) / 12.4, -S / 12]), roadMat); theirs.receiveShadow = true; s.add(theirs);
      s.add(Object.assign(new THREE.Mesh(this.ribbon(S0, S1, medL, tY, (S, lat) => [lat / 8, S / 8], field), terrMat), { receiveShadow: true }));
      s.add(Object.assign(new THREE.Mesh(this.ribbon(S0, S1, terrR, tY, (S, lat) => [lat / 8, S / 8], field), terrMat), { receiveShadow: true }));
      s.add(Object.assign(new THREE.Mesh(this.ribbon(S0, S1, terrL, tY, (S, lat) => [lat / 8, S / 8], field), terrMat), { receiveShadow: true }));
    }
    // guardrail (right) + median cable barrier
    const steel = new THREE.MeshStandardMaterial({ color: 0xb8bcc0, metalness: .2, roughness: .8, side: THREE.DoubleSide });
    for (let S0 = this.S0; S0 < Lend; S0 += 400) {
      const g = this.ribbon(S0, S0 + 400, [0, 1], (S, k) => this.at(S).y + 0.45 + k * 0.33, (S, k) => [S / 4, k], null);
      // ribbon() places lats: hack — rebuild positions at fixed lat 10.9
      const p = g.attributes.position; for (let i = 0; i < p.count; i++) { const r = Math.floor(i / 2), S = Math.min(S0 + 400, S0 + r * 4), c = this.at(S); p.setXYZ(i, c.x - Math.sin(c.th) * 10.9, c.y + 0.45 + (i % 2) * 0.33, c.z + Math.cos(c.th) * 10.9); }
      g.computeVertexNormals(); s.add(Object.assign(new THREE.Mesh(g, steel), { castShadow: true }));
      for (const h of [0.55, 0.8]) { const cg = this.ribbon(S0, S0 + 400, [-7.5, -7.47], (S) => this.at(S).y + h - 0.6, () => [0, 0], null); s.add(new THREE.Mesh(cg, steel)); }
    }
    const nP = Math.floor((Lend - this.S0) / 4);
    const posts = new THREE.InstancedMesh(new THREE.BoxGeometry(0.12, 1.0, 0.12), new THREE.MeshStandardMaterial({ color: 0x8a8e92, metalness: 0.6, roughness: 0.5 }), nP * 2);
    const mt = new THREE.Matrix4(), q = new THREE.Quaternion(), v3 = new THREE.Vector3(), one = new THREE.Vector3(1, 1, 1);
    for (let i = 0; i < nP; i++) { const S = this.S0 + i * 4; mt.makeTranslation(this.pt(S, 11.05, 0.4)); posts.setMatrixAt(i * 2, mt); mt.makeTranslation(this.pt(S, -7.5, -0.2)); posts.setMatrixAt(i * 2 + 1, mt); }
    s.add(posts);
    // trees: broadleaf + pines, in lines along field edges and woodlots
    const NT = Math.round(bio.trees*qualityPreset(this.app.quality).trees);
    const pines = new THREE.InstancedMesh(new THREE.ConeGeometry(2.2, 9, 7), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.95 }), NT);
    let nPine = 0; const hide = new THREE.Matrix4().makeScale(0, 0, 0);
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.25, 0.4, 4, 5), new THREE.MeshStandardMaterial({ color: 0x4a3626, roughness: 1 }), NT);
    const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(3.4, 1), new THREE.MeshStandardMaterial({ color: 0x3d5a26, roughness: 0.95 }), NT);
    const tc = new THREE.Color();
    for (let i = 0; i < NT; i++) {
      const S = this.S0 + rnd() * (Lend - this.S0); const side = rnd() < 0.55 ? 1 : -1;
      const lot = Math.sin(S / 140) > 0.2 ? 0 : 1;
      let lat = 24 + Math.pow(rnd(), 1.5) * (lot ? 260 : 90); lat = side > 0 ? lat : -MEDIAN - 12.4 - lat;
      if (rnd() < 0.3) lat = side > 0 ? 18 + rnd() * 8 : -MEDIAN - 12.4 - 18 - rnd() * 8;
      const p = this.pt(S, lat); p.y = this.terrainY(S, lat); const sc = 0.7 + rnd() * 0.9;
      mt.compose(v3.set(p.x, p.y + 2 * sc, p.z), q.identity(), v3.clone().set(sc, sc, sc)); trunks.setMatrixAt(i, mt);
      q.setFromEuler(new THREE.Euler(rnd() * 3, rnd() * 3, 0)); mt.compose(v3.set(p.x, p.y + 5.2 * sc, p.z), q, new THREE.Vector3(sc * (1 + rnd() * 0.3), sc * (1.1 + rnd() * 0.4), sc)); crowns.setMatrixAt(i, mt);
      crowns.setColorAt(i, tc.setHSL(0.2 + rnd() * 0.1, 0.4 + rnd() * 0.25, 0.3 + rnd() * 0.14));
      if (rnd() < bio.pine) { // swap the broadleaf crown for a tall pine
        crowns.setMatrixAt(i, hide);
        mt.compose(v3.set(p.x, p.y + 7.5 * sc, p.z), q.identity(), new THREE.Vector3(sc, sc * (1 + rnd() * 0.5), sc)); pines.setMatrixAt(nPine, mt);
        pines.setColorAt(nPine++, tc.setHSL(0.28 + rnd() * 0.06, 0.35 + rnd() * 0.2, 0.2 + rnd() * 0.08));
      }
    }
    pines.count = nPine;
    trunks.castShadow = crowns.castShadow = pines.castShadow = true; s.add(trunks, crowns, pines);
    // farm buildings: barns & silos
    const barnMat = new THREE.MeshStandardMaterial({ color: 0x8a2418, roughness: 0.8 }), roofMat = new THREE.MeshStandardMaterial({ color: 0x5a5e62, metalness: .2, roughness: .85 }), siloMat = new THREE.MeshStandardMaterial({ color: 0xc8ccd0, metalness: .25, roughness: .82 });
    for (let S = 200; S < Lend; S += 450 + rnd() * 500) {
      const lat = (rnd() < 0.5 ? 1 : -1) * (80 + rnd() * 150); const L = lat > 0 ? lat : lat - MEDIAN - 12.4;
      const p = this.pt(S, L); p.y = this.terrainY(S, L);
      const barn = new THREE.Group(); barn.position.copy(p); barn.rotation.y = rnd() * 3; s.add(barn);
      const b = new THREE.Mesh(new THREE.BoxGeometry(18, 8, 12), barnMat); b.position.y = 4; b.castShadow = true; barn.add(b);
      const r = new THREE.Mesh(new THREE.CylinderGeometry(0.01, 9.5, 5, 4, 1), roofMat); r.rotation.y = Math.PI / 4; r.scale.set(1.35, 1, 0.9); r.position.y = 10.5; barn.add(r);
      for (let k = 0; k < 2; k++) { const si = new THREE.Mesh(new THREE.CylinderGeometry(3, 3, 16, 16), siloMat); si.position.set(12 + k * 7, 8, 0); si.castShadow = true; barn.add(si); const dome = new THREE.Mesh(new THREE.SphereGeometry(3, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), siloMat); dome.position.set(12 + k * 7, 16, 0); barn.add(dome); }
    }
    // signs, exits, overpasses, billboards, troopers
    this.exits = []; this.signs = []; this.troopers = [];
    const shield = (this.route.main.match(/\d+/) || ['65'])[0], dir = this.route.main.split(' ')[1] || 'N';
    const dirWord = { N: 'NORTH', S: 'SOUTH', E: 'EAST', W: 'WEST' }[dir];
    this.sign(60, 13.5, signTexture([this.route.main.startsWith('US') ? 'US ' + shield + ' ' + dirWord : 'INTERSTATE ' + dirWord], '#0b6b3a', '#fff', 512, 384, shield), 4.2, 3.2);
    this.sign(140, 13.5, signTexture(['SPEED LIMIT', String(LIMIT), 'TRUCKS ' + String(LIMIT)], '#f4f4f4', '#111', 256, 340), 1.6, 2.1, 1.4);
    const cities = this.route.cities;
    let exitNo = 40 + Math.floor(rnd() * 150);
    const nEx = Math.max(2, Math.round(this.Lg / 1500));
    for (let k = 0; k < nEx; k++) {
      const S = (k + 0.62) * this.Lg / nEx; exitNo += 14 + Math.floor(rnd() * 40);
      const town = cities[Math.min(cities.length - 1, Math.floor(S / this.Lg * cities.length))];
      const brand = ["PILOT", "LOVE'S", "TA", "FLYING J", "PETRO"][k % 5];
      this.exits.push({ S, no: exitNo, town, brand });
      this.sign(S - 420, 13.6, signTexture([`EXIT ${exitNo}`, `${town}`, `${brand} TRUCK STOP • 1 MILE`, 'DIESEL • FOOD • SHOWERS'], '#0b6b3a', '#fff', 640, 360), 6, 3.4);
      this.sign(S - 60, 12.4, signTexture(['EXIT', String(exitNo)], '#0b6b3a', '#fff', 256, 200), 1.8, 1.4);
      this.truckStop(S + 60, brand);
      this.waterTower(S + 160, 70 + rnd() * 60, town);
      if (k % 2 === 0) { const rem = cities.slice(Math.floor(S / this.Lg * cities.length) + 1); const lines = rem.slice(0, 2).map((c, i) => `${c}   ${Math.round((this.Lg - S) * this.mpm * (i + 1) / (rem.length || 1))}`); lines.push(`${this.to.city.split(',')[0]}   ${Math.round((this.Lg - S - 300) * this.mpm)}`); this.sign(S + 380, 13.6, signTexture(lines, '#0b6b3a', '#fff', 640, 300), 5.4, 2.6); }
    }
    for (let S = 900; S < this.Lg; S += 1650 + rnd() * 600) this.overpass(S);
    for (let S = 500; S < this.Lg; S += 520 + rnd() * 500) this.billboard(S, rnd() < 0.7 ? 22 + rnd() * 10 : -MEDIAN - 12.4 - 24);
    for (let S = 1600; S < this.Lg - 300; S += 2300 + rnd() * 1200) this.trooper(S);
    for (let S = 700; S < this.Lg; S += 1300) this.sign(S, 13.2, signTexture(['SPEED LIMIT', String(LIMIT)], '#f4f4f4', '#111', 256, 300), 1.4, 1.7, 1.4);
    // destination: track glow + sign
    this.sign(this.Lg - 260, 13.6, signTexture([`${this.to.name}`, `${this.to.event}`, 'RACERS EXIT HERE ▶'], '#7a1d10', '#fff', 640, 300), 6, 2.8);
    this.dest = this.pt(this.Lg + 120, 140);
    const glow = glowTexture();
  }
  waterTower(S, lat, town) {
    const g = new THREE.Group(), p = this.pt(S, lat); p.y = this.terrainY(S, lat); g.position.copy(p); this.scene.add(g);
    const steel = new THREE.MeshStandardMaterial({ color: 0xd8dcdf, metalness: 0.5, roughness: 0.45 });
    for (let i = 0; i < 4; i++) { const a = i * Math.PI / 2 + 0.785, leg = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.3, 26, 6), steel); leg.position.set(Math.cos(a) * 3.2, 13, Math.sin(a) * 3.2); g.add(leg); }
    const tank = new THREE.Mesh(new THREE.SphereGeometry(6.5, 20, 12), steel); tank.scale.y = 0.8; tank.position.y = 30; tank.castShadow = true; g.add(tank);
    const c = document.createElement('canvas'); c.width = 512; c.height = 128; const x = c.getContext('2d'); x.fillStyle = '#1b3f7a'; x.font = '900 72px Arial Black, Arial'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(town.toUpperCase().slice(0, 14), 256, 66);
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(6.55, 6.55, 3, 24, 1, true, 0, Math.PI), new THREE.MeshStandardMaterial({ map: t, transparent: true, roughness: 0.5 }));
    band.position.y = 30; band.rotation.y = this.faceRot(S) + Math.PI / 2; g.add(band);
    const red = new THREE.Mesh(new THREE.SphereGeometry(0.3, 8, 6), new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff0000, emissiveIntensity: 2 })); red.position.y = 35.5; g.add(red);
  }
  faceRot(S) { const th = this.at(S).th; return Math.atan2(-Math.cos(th), -Math.sin(th)); }
  sign(S, lat, tex, w, h, postH = 2.4) {
    const g = new THREE.Group(); const p = this.pt(S, lat); g.position.copy(p); g.rotation.y = this.faceRot(S) + 0.12; this.scene.add(g);
    const board = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ map: tex, roughness: 0.5, metalness: 0.1, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.05 }));
    board.position.y = postH + h / 2; board.castShadow = true; g.add(board); this.signs.push(board.material);
    const back = new THREE.Mesh(new THREE.PlaneGeometry(w, h), new THREE.MeshStandardMaterial({ color: 0x8a8e92, metalness: 0.7, roughness: 0.4 })); back.position.set(0, postH + h / 2, -0.03); back.rotation.y = Math.PI; g.add(back);
    for (const x of w > 2.5 ? [-w / 3, w / 3] : [0]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.14, postH + h * 0.9, 0.14), new THREE.MeshStandardMaterial({ color: 0x9a9ea2, metalness: 0.7, roughness: 0.4 })); post.position.set(x, (postH + h * 0.9) / 2, -0.1); post.castShadow = true; g.add(post); }
    return g;
  }
  truckStop(S, brand) {
    const s = this.scene, lat = 58, base = this.pt(S, lat); base.y = this.terrainY(S, 20) + 0.05;
    const g = new THREE.Group(); g.position.copy(base); g.rotation.y = -this.at(S).th; s.add(g);
    const lot = new THREE.Mesh(new THREE.PlaneGeometry(140, 70), new THREE.MeshStandardMaterial({ color: 0x55565a, roughness: 0.9 })); lot.rotation.x = -Math.PI / 2; lot.position.y = 0.2; lot.receiveShadow = true; g.add(lot);
    const col = { "PILOT": 0xd81e05, "LOVE'S": 0xffd400, "TA": 0x1c3f94, "FLYING J": 0xd81e05, "PETRO": 0x1c3f94 }[brand] || 0xd81e05;
    const canopy = new THREE.Mesh(new THREE.BoxGeometry(46, 1.2, 18), new THREE.MeshStandardMaterial({ color: 0xf4f4f4, roughness: 0.5 })); canopy.position.set(0, 7, 0); canopy.castShadow = true; g.add(canopy);
    const band = new THREE.Mesh(new THREE.BoxGeometry(46.2, 0.5, 18.2), new THREE.MeshStandardMaterial({ color: col, emissive: col, emissiveIntensity: 0.6 })); band.position.set(0, 7.3, 0); g.add(band);
    const under = new THREE.Mesh(new THREE.PlaneGeometry(44, 16), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6e0, emissiveIntensity: 1.0 })); under.rotation.x = Math.PI / 2; under.position.y = 6.38; g.add(under); this.lamps = (this.lamps || []).concat(under.material);
    for (let i = 0; i < 5; i++) { const pump = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.8, 0.8), new THREE.MeshStandardMaterial({ color: col })); pump.position.set(-18 + i * 9, 1.1, 0); g.add(pump); }
    const store = new THREE.Mesh(new THREE.BoxGeometry(34, 6, 16), new THREE.MeshStandardMaterial({ color: 0xc9b89a, roughness: 0.8 })); store.position.set(10, 3, 26); store.castShadow = true; g.add(store);
    const win = new THREE.Mesh(new THREE.PlaneGeometry(30, 2.2), new THREE.MeshStandardMaterial({ color: 0xffe2a8, emissive: 0xffd080, emissiveIntensity: 0.8 })); win.position.set(10, 2.2, 17.95); win.rotation.y = Math.PI; g.add(win); this.lamps.push(win.material);
    // tall brand sign
    const c = document.createElement('canvas'); c.width = 512; c.height = 256; const x = c.getContext('2d'); x.fillStyle = '#' + new THREE.Color(col).getHexString(); x.fillRect(0, 0, 512, 256); x.fillStyle = col === 0xffd400 ? '#c8102e' : '#fff'; x.font = 'italic 900 120px Impact, Arial Black'; x.textAlign = 'center'; x.textBaseline = 'middle'; x.fillText(brand, 256, 100, 480); x.font = '700 44px Arial'; x.fillText('DIESEL $4.09', 256, 205);
    const tx = new THREE.CanvasTexture(c); tx.colorSpace = THREE.SRGBColorSpace;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.6, 30, 8), new THREE.MeshStandardMaterial({ color: 0x777 })); pole.position.set(-30, 15, -22); g.add(pole);
    const brd = new THREE.Mesh(new THREE.BoxGeometry(10, 5, 0.6), [0, 1, 2, 3, 4, 5].map(i => i >= 4 ? new THREE.MeshStandardMaterial({ map: tx, emissive: 0xffffff, emissiveMap: tx, emissiveIntensity: 0.5 }) : new THREE.MeshStandardMaterial({ color: 0x333 })));
    brd.position.set(-30, 31, -22); brd.rotation.y = Math.PI / 2 - 0.5; g.add(brd); this.lamps.push(brd.material[4]);
    // parked rigs (simple boxes)
    for (let i = 0; i < 6; i++) { const t = new THREE.Mesh(new THREE.BoxGeometry(17, 4, 2.6), new THREE.MeshStandardMaterial({ color: [0xffffff, 0xd0d4d8, 0x1a3d8f, 0x8a1c1c, 0x222][i % 5], metalness: 0.3, roughness: 0.5 })); t.position.set(-50 + i * 5, 2.3, -14 + (i % 2) * 0.5); t.rotation.y = Math.PI / 2; t.castShadow = true; g.add(t); }
  }
  overpass(S) {
    const s = this.scene, c = this.at(S), y = c.y, mat = new THREE.MeshStandardMaterial({ color: 0xa8a49c, roughness: 0.85 });
    const g = new THREE.Group(); const mid = this.pt(S, -MEDIAN / 2 + 5); g.position.set(mid.x, y, mid.z); g.rotation.y = -c.th; s.add(g);
    const deck = new THREE.Mesh(new THREE.BoxGeometry(12, 1.4, 64), mat); deck.position.set(0, 7.6, 0); deck.castShadow = true; deck.receiveShadow = true; g.add(deck);
    for (const z of [-31.5, 31.5]) { const wall = new THREE.Mesh(new THREE.BoxGeometry(12, 1, 0.4), mat); wall.position.set(0, 8.8, z); g.add(wall); }
    for (const sz of [-1, 1]) { const par = new THREE.Mesh(new THREE.BoxGeometry(0.4, 1.0, 64), mat); par.position.set(sz * 5.8, 8.8, 0); g.add(par); }
    for (const z of [-2 - 5 + 0, 8.5, -22]) for (const x of [-3.5, 3.5]) { const pier = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.6, 7, 12), mat); pier.position.set(x, 3.5, z); pier.castShadow = true; g.add(pier); }
    // embankments
    for (const z of [-34, 34]) { const e = new THREE.Mesh(new THREE.BoxGeometry(14, 8, 12), new THREE.MeshStandardMaterial({ color: 0x6a7a4a, roughness: 1 })); e.position.set(0, 3.2, z + Math.sign(z) * 4); g.add(e); }
  }
  billboard(S, lat) {
    const p = this.pt(S, lat); p.y = this.terrainY(S, lat);
    const g = new THREE.Group(); g.position.copy(p); g.rotation.y = this.faceRot(S) + (lat > 0 ? 0.35 : -0.35); this.scene.add(g);
    const tex = billboardTexture();
    const b = new THREE.Mesh(new THREE.PlaneGeometry(14, 5.2), new THREE.MeshStandardMaterial({ map: tex, emissive: 0xffffff, emissiveMap: tex, emissiveIntensity: 0.04, roughness: 0.6 })); b.position.y = 10; b.castShadow = true; g.add(b); this.signs.push(b.material);
    const back = new THREE.Mesh(new THREE.BoxGeometry(14.2, 5.4, 0.3), new THREE.MeshStandardMaterial({ color: 0x55585c })); back.position.set(0, 10, -0.2); g.add(back);
    for (const x of [-4, 4]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.5, 8, 0.5), new THREE.MeshStandardMaterial({ color: 0x55585c, metalness: 0.5 })); post.position.set(x, 4, -0.3); g.add(post); }
  }
  trooper(S) {
    const car = makeTrafficCar('car'); car.traverse(o => { if (o.material && o.material.clearcoat !== undefined) o.material = o.material.clone(), o.material.color.setHex(0x1c1c22); });
    const bar = [new THREE.MeshStandardMaterial({ color: 0xff0000, emissive: 0xff0000, emissiveIntensity: 3 }), new THREE.MeshStandardMaterial({ color: 0x0033ff, emissive: 0x0040ff, emissiveIntensity: 3 })];
    bar.forEach((m, i) => { const b = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.14, 0.6), m); b.position.set(-0.25, 1.75, i ? 0.35 : -0.35); car.add(b); });
    const p = this.pt(S, -4.5); car.position.copy(p); car.position.y = this.terrainY(S, -4.5) + 0.05; car.rotation.y = -this.at(S).th + 0.4; this.scene.add(car);
    this.troopers.push({ S, mesh: car, bar, warned: false });
  }
  // ---------------------------------------------------------------- truck
  buildTruck() {
    const st = this.app.state;
    this.semi = makeSemi({ team: st.team, num: st.num, color: st.color, accent: st.accent, cabColor: 0x1a1a1e });
    this.contact=new ContactShadow(this.scene,this.semi,true);
    this.semi.rotation.order = 'YXZ'; this.scene.add(this.semi);
    const u = this.semi.userData;
    u.roof.material = new THREE.MeshStandardMaterial({ color: 0xc4c8cc, metalness: 0.2, roughness: 0.7 });
    // headlights
    this.heads = [];
    for (const sz of [-1, 1]) {
      const sp = new THREE.SpotLight(0xfff2dd, 0, 140, 0.42, 0.5, 1.5); sp.position.set(4.1, 1.45, sz * 1.0); sp.target.position.set(40, -1, sz * 1.5);
      u.tractor.add(sp, sp.target); this.heads.push(sp);
    }
    // cab interior (cab view only): dash, live gauge cluster, steering wheel, pillars, headliner, mirrors.
    // Interior meshes don't receive the sun shadow (the hidden exterior would otherwise black them out)
    const dash = new THREE.Group(); u.tractor.add(dash); this.dash = dash;
    const IM = (color, rough = 0.8, metal = 0) => new THREE.MeshStandardMaterial({ color, roughness: rough, metalness: metal });
    const addI = (geo, mat, x, y, z, rx = 0, ry = 0, rz = 0) => { const o = new THREE.Mesh(geo, mat); o.position.set(x, y, z); o.rotation.set(rx, ry, rz); dash.add(o); return o; };
    const dashM = IM(0x5a524a, 0.85), trimM = IM(0x2e2c2a, 0.7), headM = IM(0x9a948a, 0.95), pilM = IM(0x5c5852, 0.8), chromeM = IM(0xc8ccd0, 0.55, 0.7);
    addI(new THREE.BoxGeometry(0.6, 0.42, 2.3), dashM, 1.62, 2.51, 0);                 // main dash slab (top at 2.72)
    addI(new THREE.BoxGeometry(0.55, 0.03, 2.28), trimM, 1.64, 2.725, 0);                 // dash top pad
    addI(new THREE.BoxGeometry(0.16, 0.3, 0.8), trimM, 1.28, 2.79, -0.52);               // gauge binnacle
        addI(new THREE.BoxGeometry(0.3, 0.26, 0.5), trimM, 1.36, 2.6, 0.25, 0, 0, 0.35);    // center stack
    // live gauge cluster (canvas, redrawn a few times a second)
    const gc = document.createElement('canvas'); gc.width = 512; gc.height = 160; this.gaugeCtx = gc.getContext('2d');
    this.gaugeTex = new THREE.CanvasTexture(gc); this.gaugeTex.colorSpace = THREE.SRGBColorSpace;
    const gp = addI(new THREE.PlaneGeometry(0.72, 0.225), new THREE.MeshBasicMaterial({ map: this.gaugeTex, toneMapped: false, color: 0xc0c0c0 }), 1.185, 2.90, -0.52, 0, -Math.PI / 2, 0); this.gaugeT = 0;
    // center-stack radio / CB glow
    const radio = document.createElement('canvas'); radio.width = 128; radio.height = 48; { const g = radio.getContext('2d'); g.fillStyle = '#081018'; g.fillRect(0, 0, 128, 48); g.fillStyle = '#3fd0ff'; g.font = '700 22px monospace'; g.fillText('CH 19', 26, 32); }
    const rt = new THREE.CanvasTexture(radio); rt.colorSpace = THREE.SRGBColorSpace;
    addI(new THREE.PlaneGeometry(0.2, 0.075), new THREE.MeshBasicMaterial({ map: rt, toneMapped: false, color: 0x909090 }), 1.2, 2.65, 0.25, 0, -Math.PI / 2, 0).rotateX(-0.35);
    // steering wheel on a tilted column, facing the driver
    const pivot = new THREE.Group(); pivot.position.set(1.02, 2.70, -0.52); dash.add(pivot);
    pivot.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), new THREE.Vector3(-0.62, 0.78, 0).normalize());
    this.wheel = new THREE.Group(); pivot.add(this.wheel);
    const wm = IM(0x26221e, 0.6);
    this.wheel.add(new THREE.Mesh(new THREE.TorusGeometry(0.235, 0.024, 10, 36), wm));
    for (const r of [0, 2.1, -2.1]) { const sp = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.035, 0.02), new THREE.MeshStandardMaterial({color:0x737579,roughness:.86,metalness:.05})); sp.position.set(Math.cos(r - Math.PI / 2) * 0.11, Math.sin(r - Math.PI / 2) * 0.11, 0); sp.rotation.z = r - Math.PI / 2; this.wheel.add(sp); }
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.07, 0.05, 20), trimM); hub.rotation.x = Math.PI / 2; this.wheel.add(hub);
    const col = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.06, 0.5, 10), trimM); col.position.set(0, 0, -0.25); col.rotation.x = Math.PI / 2; this.wheel.parent.add(col);
    // A-pillars, header/headliner, door tops, sun visors
    for (const sz of [-1, 1]) {
      addI(new THREE.BoxGeometry(0.1, 0.9, 0.12), pilM, 1.55, 3.05, sz * 1.1, 0, 0, -0.42);
      addI(new THREE.BoxGeometry(1.6, 0.06, 0.12), pilM, 0.7, 2.6, sz * 1.16);             // door sill / window line
      addI(new THREE.BoxGeometry(0.12, 0.72, 0.1), pilM, -0.1, 2.95, sz * 1.13);           // B-pillar
      addI(new THREE.BoxGeometry(0.34, 0.025, 0.72), IM(0x8a8070, 0.9), 1.32, 3.36, sz * 0.52, 0, 0, 0.45); // visors
      // west-coast mirror outside each door
      addI(new THREE.BoxGeometry(0.06, 0.34, 0.16), IM(0x9a9ea4, 0.5), 2.1, 2.9, sz * 1.62);
      addI(new THREE.BoxGeometry(0.02, 0.3, 0.13), IM(0x8fa6bf, 0.15, 0.6), 2.06, 2.9, sz * 1.62);
      addI(new THREE.BoxGeometry(0.6, 0.025, 0.025), IM(0x9a9ea4, 0.5), 1.8, 2.75, sz * 1.4, 0, sz * 0.5, 0);
    }
    addI(new THREE.BoxGeometry(0.5, 0.1, 2.35), pilM, 1.42, 3.47, 0);                    // windshield header
    addI(new THREE.BoxGeometry(2.2, 0.04, 2.35), headM, 0.4, 3.6, 0);                    // headliner
    addI(new THREE.BoxGeometry(0.05, 0.55, 0.06), pilM, 1.6, 3.0, 0, 0, 0, -0.42);      // center divider
    // matte hood seen over the dash (replaces the glossy exterior hood in cab view, so no sun glare)
    addI(new THREE.BoxGeometry(2.3, 0.2, 2.0), IM(0x30323a, 0.55, 0.2), 2.85, 2.2, 0);
    dash.traverse(o => { if (o.isMesh) { o.castShadow = false; o.receiveShadow = false; } });
    // soft dome / dash light so the interior reads in daylight and at night
    const dome = new THREE.PointLight(0xfff0dc, 2.2, 3.2, 1.5); dome.position.set(0.5, 3.4, -0.3); dash.add(dome);
    this.cabFill = dome;
    // faint instrument back-light spill onto the driver's hands / wheel at night
    const dg = new THREE.PointLight(0xffa040, 0, 1.4, 2); dg.position.set(1.05, 2.85, -0.52); dash.add(dg); this.dashGlow = dg;
    this.glass = u.tractor.children.filter(o => o !== dash && !o.isLight && o !== this.heads[0]?.target && o !== this.heads[1]?.target);
    dash.visible = false;
  }
  // ---------------------------------------------------------------- traffic
  buildTraffic() {
    this.traffic = [];
    for (let i = 0; i < 16; i++) {
      const kind = i % 5 === 0 ? 'semi' : rnd() < 0.3 ? 'pickup' : 'car';
      let mesh, L, W;
      if (kind === 'semi') { const cols = [[0xd8d8d8, 0x1a3d8f], [0xd0d4d8, 0x8a1c1c], [0x2a6a3a, 0xffffff]][i % 3]; mesh = makeSemi({ team: ['WALMART-ISH FREIGHT', 'J.B. HAUL', 'MIDWEST REEFER'][i % 3], num: '', color: cols[0], accent: cols[1], cabColor: cols[1] }); L = 22; W = 2.6; mesh.userData.L = L; mesh.userData.W = W; mesh.userData.semi = true; }
      else { mesh = makeTrafficCar(kind); L = mesh.userData.L; W = mesh.userData.W; }
      mesh.rotation.order = 'YXZ'; this.scene.add(mesh);
      const oncoming = i >= 11;
      const v = kind === 'semi' ? 26 + rnd() * 3 : 28 + rnd() * 6;
      const contact=new ContactShadow(this.scene,mesh,kind==='semi');
      this.traffic.push({ mesh, contact, L, W, kind, oncoming, S: oncoming ? 100 + i * 140 : -150 + i * 70 + rnd() * 30, lane: Math.floor(rnd() * 2), lat: 0, v, v0: v, laneT: 0, bump: 0 });
    }
    for (const c of this.traffic) { c.lat = c.oncoming ? -MEDIAN - LANES[c.lane] : LANES[c.lane]; if (!c.oncoming && c.S > -20 && c.S < 60) c.S += 90; }
  }
  updateTraffic(dt) {
    const T = this.t;
    for (const c of this.traffic) {
      if (c.oncoming) {
        c.S -= c.v * dt;
        if (c.S < T.S - 250) c.S = T.S + 900 + Math.random() * 400;
      } else {
        // follow / pass logic
        let ahead = Infinity, aheadV = 0;
        const myLat = c.lat;
        for (const o of this.traffic) if (o !== c && !o.oncoming && Math.abs(o.lat - myLat) < 2.6) { const d = o.S - c.S; if (d > 0 && d < ahead) { ahead = d; aheadV = o.v; } }
        const dT = T.S - c.S; if (Math.abs(T.lat - myLat) < 2.8 && dT > 0 && dT < ahead + 999) { const dd = dT - 4 - 20; if (dd < ahead) { ahead = Math.max(0.1, dd); aheadV = T.v; } }
        let tv = c.v0;
        const gap = c.L / 2 + 12 + c.v * 1.2;
        if (ahead < gap * 2.2) {
          tv = Math.min(tv, aheadV + (ahead - gap) * 0.3);
          if (c.laneT <= 0 && ahead < gap * 1.6) { // try to change lanes
            const other = 1 - c.lane, olat = LANES[other];
            const free = this.traffic.every(o => o === c || o.oncoming || Math.abs(o.lat - olat) > 2.4 || Math.abs(o.S - c.S) > 26) && (Math.abs(T.lat - olat) > 2.6 || Math.abs(T.S - 7 - c.S) > 30);
            if (free) { c.lane = other; c.laneT = 6; }
          }
        } else if (c.lane === 0 && c.laneT <= 0 && Math.random() < dt * 0.15) { // keep right except to pass
          const olat = LANES[1]; const free = this.traffic.every(o => o === c || o.oncoming || Math.abs(o.lat - olat) > 2.4 || Math.abs(o.S - c.S) > 40) && (Math.abs(T.lat - olat) > 2.6 || Math.abs(T.S - 7 - c.S) > 40);
          if (free) { c.lane = 1; c.laneT = 6; }
        }
        c.laneT -= dt;
        c.v += clamp(tv - c.v, -6 * dt, 1.5 * dt); c.v = Math.max(0, c.v);
        c.lat += clamp(LANES[c.lane] - c.lat, -1.1 * dt, 1.1 * dt);
        c.S += c.v * dt;
        // recycle
        if (c.S < T.S - 320) { c.S = T.S + 700 + Math.random() * 500; c.v = c.v0; }
        else if (c.S > T.S + 750) { c.S = T.S - 260 - Math.random() * 60; c.v = c.v0; }
      }
      const p = this.pt(c.S, c.lat), a = this.at(c.S);
      const back = c.mesh.userData.semi ? 7.5 : 0; // semi root is near the cab; shift so S is its middle
      const th = a.th + (c.oncoming ? Math.PI : 0);
      c.mesh.position.set(p.x + Math.cos(th) * back, p.y, p.z + Math.sin(th) * back);
      c.mesh.rotation.y = -th; c.mesh.rotation.z = Math.atan(this.grade(c.S)) * (c.oncoming ? -1 : 1);
      const roadHeight=(x,z)=>this.at(c.S+(x-a.x)*Math.cos(a.th)+(z-a.z)*Math.sin(a.th)).y;
      if(c.mesh.userData.semi)seatRigWheels(c.mesh,roadHeight);else seatWheels(c.mesh,roadHeight);c.contact.update(roadHeight);
    }
  }
  // ---------------------------------------------------------------- HUD
  buildHud() {
    const h = document.createElement('div'); h.id = 'hud';
    h.innerHTML = `
      <div class="hud-box" style="left:16px;top:16px;min-width:300px"><div class="lbl">${this.route.hwy.join(' → ')}</div><div style="font:700 17px Segoe UI">${this.from.short} → ${this.to.name}</div>
        <div class="row" style="font:700 14px Segoe UI;margin-top:4px"><span>🕒 <b id="hw-clock">--</b></span><span>Elapsed <b id="hw-el">0.0</b>h / deadline <b>${this.deadline.toFixed(1)}</b>h</span></div>
        <div style="font:700 14px Segoe UI"><span id="hw-miles"></span> • <span id="hw-exit"></span></div></div>
      <div class="hud-box" style="right:16px;bottom:44px;text-align:right;min-width:210px">
        <div class="big"><span id="hw-spd">0</span><span style="font-size:18px"> MPH</span></div>
        <div class="row" style="justify-content:flex-end;gap:8px"><span id="hw-cruise" class="lbl"></span><span style="display:inline-block;background:#fff;color:#111;border-radius:4px;padding:2px 6px;font:900 12px Arial">LIMIT ${LIMIT}</span></div>
        <div class="lbl" style="margin-top:6px">DIESEL</div><div class="bar" style="width:180px"><i id="hw-fuel" style="background:#ffc83d"></i></div>
        <div class="lbl">FATIGUE</div><div class="bar" style="width:180px"><i id="hw-fat"></i></div>
        <div class="lbl">RIG DAMAGE</div><div class="bar" style="width:180px"><i id="hw-dmg"></i></div></div>
      <div id="center-msg" style="font-size:54px"></div><div id="sub-msg"></div>
      <div class="hint">W/↑ throttle • S/↓ brake • A/D ←/→ steer • Q cruise • E take the truck-stop exit (right lane, near the EXIT sign) • C camera • P pause</div>`;
    this.app.ui.appendChild(h);
    const q = id => h.querySelector(id);
    this.hud = { clock: q('#hw-clock'), el: q('#hw-el'), miles: q('#hw-miles'), exit: q('#hw-exit'), spd: q('#hw-spd'), cruise: q('#hw-cruise'), fuel: q('#hw-fuel'), fat: q('#hw-fat'), dmg: q('#hw-dmg'), msg: q('#center-msg'), sub: q('#sub-msg') };
    this.flash('HIT THE ROAD', '#fff', 2.5); this.hud.sub.textContent = `${this.miles} miles to ${this.to.city} • make it in ${this.deadline.toFixed(1)} hours • ${this.biome?.name || ""} country`;
    setTimeout(() => { if (this.hud) this.hud.sub.textContent = ''; }, 4000);
  }
  flash(t, col = '#fff', sec = 1.6) { if (!this.hud) return; this.hud.msg.textContent = t; this.hud.msg.style.color = col; clearTimeout(this.ft); this.ft = setTimeout(() => { if (this.hud) this.hud.msg.textContent = ''; }, sec * 1000); }
  clockStr() { const h = this.startHour + this.hours, d = Math.floor(h / 24), hh = Math.floor(h % 24), mm = Math.floor((h * 60) % 60); return `${['Sun', 'Mon', 'Tue', 'Wed', 'Thu'][d % 5]} ${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}`; }
  // ---------------------------------------------------------------- time of day
  applyTimeOfDay(force) {
    const h = (this.startHour + this.hours) % 24;
    const ang = (h - 6) / 12 * Math.PI;              // 0 at 6am, pi/2 noon
    const el = Math.sin(ang);                         // sun elevation proxy
    const day = smooth(-0.12, 0.25, el), golden = Math.exp(-((el - 0.06) ** 2) / 0.012);
    const top = new THREE.Color(0x02040c).lerp(new THREE.Color(0x2a62b8), day);
    const hor = new THREE.Color(0x10121c).lerp(new THREE.Color(0xc6dcec), day).lerp(new THREE.Color(0xff9a50), golden * 0.85);
    this.skyU.top.value.copy(top); this.skyU.horizon.value.copy(hor); this.skyU.bottom.value.copy(hor).multiplyScalar(0.4);
    const sd = new THREE.Vector3(Math.cos(ang) * 0.9, el, -0.45).normalize();
    this.skyU.sunDir.value.copy(sd); this.skyU.sunColor.value.set(el > -0.05 ? 0xfff0d0 : 0x000000).lerp(new THREE.Color(0xff8a30), golden * 0.8);
    this.stars.uniforms.uAmt.value = 1 - day; this.skyU.glow.value.set(0xff7a30); this.skyU.glowAmt.value = golden * 0.9 + (1 - day) * 0.08;
    this.scene.fog.color.copy(hor);
    this.scene.fog.near = lerp(40, 150, day); this.scene.fog.far = lerp(700, 1700, day);
    this.sunDir = sd;
    this.sun.intensity = Math.max(0, el > 0 ? 0.4 + 2.6 * day : 0) + (1 - day) * 0.25;
    this.sun.color.set(0xfff2dd).lerp(new THREE.Color(0xffa060), golden * 0.8).lerp(new THREE.Color(0x8090c0), 1 - day);
    if (el <= 0) this.sunDir = new THREE.Vector3(-0.3, 0.6, 0.5).normalize(); // moonlight direction
    this.hemi.intensity = 0.48 + 0.60 * day; this.hemi.color.set(0x8090c0).lerp(new THREE.Color(0xbfd6ff), day);
    const night = 1 - day;
    this.heads.forEach(l => l.intensity = night > 0.3 ? 380 * night : 0);
    for (const m of this.lamps || []) m.emissiveIntensity = 0.25 + 0.55 * night;
    for (const m of this.signs) m.emissiveIntensity = 0.04 + 0.5 * night;   // retro-reflective look in headlights
    this.app.renderer.toneMappingExposure = 0.95 - 0.03 * night;
    // night: tighter bloom so oncoming headlights read as lamps, not fog balls; dim amber cab instead of a bright dome light
    const B = this.app.bloom; B.strength = 0.1 - 0.04 * night; B.threshold = 3.0; B.radius = 0.25;
    if (this.cabFill) { this.cabFill.intensity = lerp(2.2, 0.11, night); this.cabFill.color.set(0xfff0dc).lerp(new THREE.Color(0xffa860), night); }
    if (this.dashGlow) this.dashGlow.intensity = 0.07 * night;
    this.night = night;
  }
  // ---------------------------------------------------------------- main update
  update(dt) {
    const app = this.app, T = this.t;
    if (this.menu || this.ended) { this.updateCamera(dt); return; }
    if (this.paused) return;
    this.time += dt;
    if (app.tap('KeyC')) this.camMode = (this.camMode + 1) % 3;
    if (app.tap('KeyQ')) { T.cruise = T.cruise ? 0 : Math.max(20, T.v); this.flash(T.cruise ? `CRUISE ${Math.round(T.cruise * 2.237)} MPH` : 'CRUISE OFF', '#fff', 1); }
    const inp = app.input();
    if (inp.brake) T.cruise = 0;
    // longitudinal: heavy truck
    const grade = this.grade(T.S);
    let acc = 0;
    const thr = inp.throttle || (T.cruise && T.v < T.cruise) ? 1 : 0;
    if (thr) acc += (2.4 - T.v * 0.04) * (1 - T.v / 37) * (inp.throttle ? 1 : clamp((T.cruise - T.v) * 0.6, 0, 1));
    if (inp.brake) acc -= 4.2;
    if (!thr && (this.jake || 0) > 0.5) acc -= 0.45;                // jake brake holds it back on decel
    acc -= 9.81 * grade * 0.55 + 0.0006 * T.v * T.v + 0.08;
    T.v = clamp(T.v + acc * dt, 0, 38);
    // steering (sluggish, speed sensitive) + fatigue drift
    T.steer += clamp(inp.steer - T.steer, -1.6 * dt, 1.6 * dt);
    const maxA = 0.45 / (1 + T.v / 5);
    this.drowsy = this.fatigue > 0.75 ? (this.fatigue - 0.75) * 4 : 0;
    const drift = this.drowsy * 0.012 * Math.sin(this.time * 0.7) * Math.sin(this.time * 0.23 + 1);
    T.yaw += (T.v * Math.tan(T.steer * maxA) / 6.2 - T.v * this.curvature(T.S) * (inp.steer ? 1 : 0.12) + drift) * dt;
    T.yaw = clamp(T.yaw, -0.5, 0.5);
    T.lat += T.v * Math.sin(T.yaw) * dt; T.S += T.v * Math.cos(T.yaw) * dt;
    // trailer: kinematic follow + a little mass (second-order lag) so it sways after quick steering,
    // crosswind gusts on open stretches and the bow wave of passing semis
    const tractorRate = T.v * Math.tan(T.steer * maxA) / 6.2;
    const wind = (this.windy ?? 0.5) * Math.sin(this.time * 0.31) * Math.sin(this.time * 0.13 + 1.7) * clamp(T.v / 25, 0, 1);
    let bow = 0;
    for (const c of this.traffic) if (c.kind === 'semi' && !c.oncoming && Math.abs(c.S - (T.S - 8)) < 14 && Math.abs(c.lat - T.lat) < 4.2) bow += Math.sign(T.lat - c.lat) * 0.06 * clamp(Math.abs(c.v - T.v) / 6, 0.3, 1);
    T.tw = T.tw ?? 0;
    const kin = (T.v / 12) * Math.sin(-T.trailer) - tractorRate;
    T.tw += ((kin - T.tw) * 2.6 + (wind * 0.05 + bow) ) * dt;
    T.trailer += T.tw * dt; T.trailer = clamp(T.trailer, -0.6, 0.6);
    T.yaw += wind * 0.006 * dt;                                // gusts nudge the rig too — hold your lane
    if (Math.abs(wind) > 0.42 && !this.windMsg) { this.windMsg = 1; this.flash('CROSSWIND — hold it steady', '#9fd0ff', 1.6); }
    if (Math.abs(wind) < 0.2) this.windMsg = 0;
    // cab body roll on its springs (lateral accel)
    T.roll = T.roll ?? 0; T.rollV = T.rollV ?? 0;
    const latA = T.v * (tractorRate - T.v * this.curvature(T.S));
    T.rollV += ((-latA * 0.012 - T.roll) * 14 - T.rollV * 3.2) * dt; T.roll += T.rollV * dt;
    // barriers
    this.hitCool -= dt;
    if (T.lat > 9.6 || T.lat < 1.3) {
      const into = T.lat > 9.6 ? 1 : -1; T.lat = into > 0 ? 9.6 : 1.3; const hit = Math.abs(Math.sin(T.yaw)) * T.v;
      T.yaw *= -0.3; T.v *= 0.97;
      if (this.hitCool <= 0 && hit > 0.4) { this.damage(1 + hit * 2.2, into > 0 ? 'GUARDRAIL!' : 'MEDIAN BARRIER!'); }
    }
    if (T.lat > 7.6 || T.lat < 0.6) this.rumble = 0.25;
    // traffic collisions (truck footprint from S-22 to S+5)
    for (const c of this.traffic) {
      if (c.oncoming) continue;
      if (Math.abs(c.lat - T.lat) < (c.W / 2 + 1.3) && c.S + c.L / 2 > T.S - 21.5 && c.S - c.L / 2 < T.S + 4.6) {
        const rel = Math.abs(c.v - T.v) + 2;
        if (this.hitCool <= 0) this.damage(2 + rel * 1.3, 'CRASH!');
        if (c.S > T.S - 8) { c.S = T.S + 4.6 + c.L / 2 + 0.5; c.v = Math.max(c.v, T.v + 2); T.v *= 0.8; }
        else { c.S = T.S - 21.5 - c.L / 2 - 0.5; c.v = Math.min(c.v, T.v - 3); }
      }
    }
    // clock / fuel / fatigue
    const realSec = dt * this.timeScale * (T.v < 3 ? 0.4 : 1), hrs = realSec / 3600;
    this.hours += hrs;
    const milesNow = T.v * dt * this.mpm;
    this.fuel = Math.max(0, this.fuel - milesNow / 900 - hrs * 0.004);
    this.fatigue = clamp(this.fatigue + hrs / 11 * (this.co ? 1 - 0.12 * this.co.skill : 1), 0, 1);
    if (this.fuel <= 0) { this.tows++; this.hours += 3; this.app.state.money -= 650; this.spent += 650; this.fuel = 0.22; T.v = 0; this.flash('OUT OF DIESEL — towed! -$650, +3h', '#ff5a4a', 3); }
    // speed traps
    for (const tr of this.troopers) {
      const on = Math.sin(this.time * 12) > 0; tr.bar[0].emissiveIntensity = on ? 4 : 0.2; tr.bar[1].emissiveIntensity = on ? 0.2 : 4;
      if (!tr.warned && T.S > tr.S - 40 && T.S < tr.S + 10) {
        tr.warned = true;
        if (T.v * 2.237 > TRAP) { this.tickets++; this.app.state.money -= 250; this.spent += 250; this.hours += 0.25; this.flash(`🚓 SPEEDING TICKET — ${Math.round(T.v * 2.237)} in a ${LIMIT}. -$250`, '#ff5a4a', 3); }
      }
    }
    // exits / truck stops
    const ex = this.exits.find(e => T.S > e.S - 200 && T.S < e.S + 40);
    if (ex && app.tap('KeyE')) {
      if (T.lat > 3.7 && T.v < 29) this.openStop(ex); else this.flash(T.lat <= 3.7 ? 'Get in the right lane to exit' : 'Slow down to take the exit', '#ffc83d', 1.4);
    }
    // arrival
    if (T.S >= this.Lg) { this.arrive(); }
    if (Math.floor(this.time * 2) !== this.lastTod) { this.lastTod = Math.floor(this.time * 2); this.applyTimeOfDay(); }
    this.updateTraffic(dt);
    this.placeTruck(dt);
    this.updateCamera(dt);
    this.updateHud(ex);
    document.getElementById('vignette').style.opacity = clamp(this.drowsy * 0.9 + (this.drowsy > 0 ? 0.25 * Math.sin(this.time * 1.3) : 0), 0, 0.95);
    app.audio.truck?.({ dt, speed: T.v, throttle: thr ? 1 : 0, brake: inp.brake ? 1 : 0, cam: this.camMode === 1 ? 'cab' : 'out' }); this.jake = !thr && T.v > 8 ? 1 : 0;
  }
  damage(d, msg) {
    this.hitCool = 0.8; this.rigDmg += d; this.carDmg += d * 0.4; this.shake = Math.min(1.2, d * 0.1);
    this.app.state.haulerDmg = Math.min(100, this.app.state.haulerDmg + d);
    this.flash(`${msg} rig +${d.toFixed(0)}%`, '#ff5a4a', 1.4);
  }
  placeTruck(dt) {
    const T = this.t, p = this.pt(T.S, T.lat), a = this.at(T.S), th = a.th + T.yaw;
    const m = this.semi; m.position.copy(p);
    m.rotation.y = -th; m.rotation.z = Math.atan(this.grade(T.S)); m.rotation.x = clamp(T.roll || 0, -0.05, 0.05) + (this.rumble > 0 ? Math.sin(this.time * 47) * 0.003 : 0);
    // trailer pitches with the road under its own axles (crests / sags), relative to the tractor
    const tr = m.userData.trailer; tr.rotation.order = 'YXZ'; tr.rotation.y = -T.trailer;
    tr.rotation.z = lerp(tr.rotation.z, Math.atan(this.grade(T.S - 9)) - Math.atan(this.grade(T.S)), 1 - Math.exp(-dt * 8));
    const spin = T.v * dt / 0.53; m.userData.wheels.forEach(w => w.rotation.z -= spin);
    seatRigWheels(m,(x,z)=>{const a=this.at(T.S),ds=(x-p.x)*Math.cos(a.th)+(z-p.z)*Math.sin(a.th);return this.at(T.S+ds).y;});
    this.contact.update((x,z)=>{const a=this.at(T.S),ds=(x-p.x)*Math.cos(a.th)+(z-p.z)*Math.sin(a.th);return this.at(T.S+ds).y;});
    // shadows follow
    const sd = this.sunDir; this.sun.position.set(p.x + sd.x * 150, p.y + sd.y * 150 + 20, p.z + sd.z * 150); this.sun.target.position.copy(p);
    this.sky.position.copy(this.camera.position);
    this.wheel.rotation.z = -T.steer * 2.6;
  }
  updateCamera(dt) {
    const cam = this.camera, T = this.t, m = this.semi; m.updateMatrixWorld();
    const sh = (this.shake || 0) + (this.rumble || 0) * 0.3; this.shake = Math.max(0, (this.shake || 0) - dt * 2); this.rumble = Math.max(0, (this.rumble || 0) - dt);
    this.dash.visible = this.camMode === 1; for (const g of this.glass) g.visible = this.camMode !== 1;
    const th = this.at(T.S).th + T.yaw, p = m.position;
    if (this.camMode === 0) {
      const back = 36, want = new THREE.Vector3(p.x - Math.cos(th + T.trailer * 0.6) * back, p.y + 10.5, p.z - Math.sin(th + T.trailer * 0.6) * back);
      if (!this.camInit) { cam.position.copy(want); this.camInit = true; }
      cam.position.lerp(want, 1 - Math.exp(-dt * 3.5));
      cam.lookAt(p.x + Math.cos(th) * 14, p.y + 2.5, p.z + Math.sin(th) * 14); cam.fov = 58;
    } else if (this.camMode === 1) {
      const eye = new THREE.Vector3(0.55, 3.12, -0.52).applyMatrix4(m.matrixWorld), tgt = new THREE.Vector3(40, 1.9, -0.3 + T.steer * 3).applyMatrix4(m.matrixWorld);
      cam.position.copy(eye); cam.lookAt(tgt); cam.fov = 66;
      if ((this.gaugeT -= dt) <= 0) { this.gaugeT = 0.15; this.drawGauges(); }
    } else {
      if (!this.cine || T.S - this.cine.S > 70) { const S = T.S + 160; this.cine = { S, pos: this.pt(S, Math.random() < 0.5 ? 14 : -10, 3 + Math.random() * 6) }; }
      cam.position.lerp(this.cine.pos, 0.5); cam.lookAt(p.x, p.y + 2, p.z); cam.fov = clamp(2400 / Math.max(10, cam.position.distanceTo(p)), 18, 60);
    }
    cam.position.x += (Math.random() - 0.5) * sh * 0.25; cam.position.y += (Math.random() - 0.5) * sh * 0.25;
    cam.updateProjectionMatrix();
  }
  updateHud(ex) {
    const h = this.hud, T = this.t; if (!h) return;
    const mph = Math.round(T.v * 2.237);
    h.spd.textContent = mph; h.spd.style.color = mph > TRAP ? '#ff5a4a' : mph > LIMIT ? '#ffc83d' : '#fff';
    h.cruise.textContent = T.cruise ? `CRUISE ${Math.round(T.cruise * 2.237)}` : '';
    h.clock.textContent = this.clockStr(); h.el.textContent = this.hours.toFixed(1); h.el.style.color = this.hours > this.deadline ? '#ff5a4a' : '#fff';
    h.miles.textContent = `${Math.max(0, Math.round((this.Lg - T.S) * this.mpm))} mi to go`;
    const nx = this.exits.find(e => e.S > T.S - 40);
    h.exit.innerHTML = ex ? `<span style="color:#5fd16a">EXIT ${ex.no} ${ex.brand} — press E</span>` : nx ? `next truck stop: exit ${nx.no} in ${((nx.S - T.S) * this.mpm).toFixed(0)} mi` : 'no more stops';
    h.fuel.style.width = (this.fuel * 100) + '%'; h.fat.style.width = (this.fatigue * 100) + '%'; h.dmg.style.width = this.app.state.haulerDmg + '%';
    if (this.fuel < 0.12 && Math.floor(this.time) % 4 === 0) h.sub.textContent = 'LOW FUEL — take the next exit!'; else if (this.drowsy > 0.2) h.sub.textContent = 'You\'re getting drowsy… pull over and rest'; else if (h.sub.textContent.startsWith('LOW') || h.sub.textContent.startsWith('You\'re')) h.sub.textContent = '';
  }
  // ---------------------------------------------------------------- truck stop menu
  openStop(ex) {
    const st = this.app.state, T = this.t; T.v = 0; T.cruise = 0;
    this.menu = document.createElement('div'); this.menu.className = 'screen';
    const render = () => {
      const gal = Math.round((1 - this.fuel) * 150), fc = Math.round(gal * 4.09), rc = Math.round(st.haulerDmg * UI.HAULER_PER_PT * 0.8);
      this.menu.innerHTML=`<div class="panel stop-menu" style="width:560px"><div class="stop-head"><div><div class="kicker">EXIT ${ex.no} · ${ex.town}</div><h2 style="margin:7px 0">${ex.brand} Travel Center</h2></div><span class="pill ${this.deadline-this.hours<2?'warn':'ok'}">${(this.deadline-this.hours).toFixed(1)} H LEFT</span></div><div class="muted">${this.clockStr()} · ${this.hours.toFixed(1)} h driven · ${this.deadline.toFixed(1)} h to the drivers’ meeting</div>
      <div class="stop-stats"><div><span>DIESEL</span><b>${Math.round(this.fuel*100)}%</b><div class="bar"><i style="width:${this.fuel*100}%"></i></div></div><div><span>FATIGUE</span><b>${Math.round(this.fatigue*100)}%</b><div class="bar"><i style="width:${this.fatigue*100}%"></i></div></div><div><span>RIG DAMAGE</span><b>${Math.round(st.haulerDmg)}%</b><div class="bar"><i style="width:${st.haulerDmg}%"></i></div></div></div>
      <div class="stop-actions"><button id="f" ${gal<2||st.money<fc?'disabled':''}>Fill the diesel tanks · $${fc}<small>${gal} gallons at $4.09 · 20 minutes</small></button><button id="r" class="alt">Coffee & a short break<small>30 minutes · removes 30 percentage points of fatigue</small></button><button id="s" class="alt">Sleep in the bunk<small>8 hours · full fatigue recovery${this.hours+8>this.deadline?' · WILL MISS THE DRIVERS’ MEETING':''}</small></button><button id="m" class="alt" ${!st.haulerDmg||st.money<rc?'disabled':''}>Road service · $${rc}<small>1 hour · repairs the hauler, not the race car</small></button></div><div class="journey-footer"><span class="money">$${Math.round(st.money).toLocaleString()}</span><button id="x">Back on the road →</button></div></div>`;
      const q = id => this.menu.querySelector(id);
      q('#f').onclick = () => { st.money -= fc; this.spent += fc; this.fuel = 1; this.hours += 0.33; render(); };
      q('#r').onclick = () => { this.fatigue = Math.max(0, this.fatigue - 0.3); this.hours += 0.5; render(); };
      q('#s').onclick = () => { this.fatigue = 0; this.hours += 8; render(); };
      q('#m').onclick = () => { st.money -= rc; this.spent += rc; st.haulerDmg = 0; this.hours += 1; render(); };
      q('#x').onclick = () => { this.menu.remove(); this.menu = null; T.S = ex.S + 60; T.lat = LANES[1]; T.yaw = 0; T.v = 12; this.applyTimeOfDay(); };
    };
    render(); this.app.ui.appendChild(this.menu);
  }
  arrive() {
    if (this.ended) return; this.ended = true;
    const st = this.app.state;
    st.fuel = this.fuel; st.fatigue = Math.max(0, this.fatigue - 0.35); // a night's sleep at the track helps
    st.carDmg = Math.min(100, st.carDmg + this.carDmg);
    UI.applyArrival(this.app, { hours: this.hours, deadline: this.deadline, fuelSpent: this.spent, rigDmg: this.rigDmg, carDmg: this.carDmg, tickets: this.tickets, tows: this.tows });
  }
  drawGauges() {
    const g = this.gaugeCtx, T = this.t, mph = T.v * 2.237;
    g.fillStyle = '#0b0c0e'; g.fillRect(0, 0, 512, 160);
    const dial = (cx, cy, r, frac, label, txt, warn) => {
      g.fillStyle = '#16181c'; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.fill();
      g.strokeStyle = '#c9ccd2'; g.lineWidth = 3; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.stroke();
      for (let i = 0; i <= 10; i++) { const a = -3.93 + i * 0.471; g.lineWidth = i % 5 ? 2 : 4; g.beginPath(); g.moveTo(cx + Math.cos(a) * r * 0.78, cy + Math.sin(a) * r * 0.78); g.lineTo(cx + Math.cos(a) * r * 0.92, cy + Math.sin(a) * r * 0.92); g.stroke(); }
      const a = -3.93 + clamp(frac, 0, 1) * 4.71; g.strokeStyle = warn ? '#ff3a2a' : '#ff8a1f'; g.lineWidth = 4;
      g.beginPath(); g.moveTo(cx, cy); g.lineTo(cx + Math.cos(a) * r * 0.85, cy + Math.sin(a) * r * 0.85); g.stroke();
      g.fillStyle = '#d8a66b'; g.font = `700 ${r<40?11:13}px Arial`; g.textAlign = 'center'; g.fillText(label, cx, cy + r * .68);
      if (txt) {g.fillStyle='#0b0d10';g.fillRect(cx-27,cy+4,54,23);g.fillStyle = '#c8d2dc'; g.font = '700 20px monospace'; g.fillText(txt, cx, cy+23);}
    };
    dial(150, 82, 70, mph / 100, 'MPH', String(Math.round(mph)), mph > 75);
    dial(360, 82, 70, this.app.audio?.gb ? this.app.audio.gb.rpm / 2500 : 0.08 + (T.v % 9) / 9 * 0.55, 'RPM x100', this.app.audio?.gb ? String(Math.round(this.app.audio.gb.rpm / 100)) : '', false);
    dial(462, 52, 36, this.fuel, 'FUEL', '', this.fuel < 0.15);
    dial(462, 124, 30, 0.75, 'AIR', '', false);
    dial(48, 52, 36, 0.55, 'OIL', '', false);
    dial(48, 124, 30, this.fatigue, 'TIRED', '', this.fatigue > 0.75);
    if (T.cruise) { g.fillStyle = '#5fd16a'; g.font = '700 15px Arial'; g.textAlign = 'center'; g.fillText('CRUISE', 255, 150); }
    this.gaugeTex.needsUpdate = true;
  }
  dispose() { clearTimeout(this.ft); this.hud = null; this.app.renderer.toneMappingExposure = 1; disposeScene(this.scene); }
}
