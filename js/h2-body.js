// Original Hummer H2 pace-SUV shell. Proportions follow the published 2003 H2
// (189.8 x 81.2 x 77.8 in, 122.8 in wheelbase, 32.6 / 34.6 in overhangs,
// 69.4 in track, LT315/70R17). Shape only: no Hummer wordmark, badge, or
// copied mesh. Surfaces are beveled panel grids with smooth normals.
import * as THREE from 'three';
import { beveledBox } from './details.js';
import { glowTexture } from './gfx.js';

const IN = 0.0254;
const L = 189.8 * IN, WB = 122.8 * IN, FOH = 32.6 * IN, ROH = 34.6 * IN;
const W = 81.2 * IN, H = 77.8 * IN, TRACK = 69.4 * IN;
const FA = WB / 2, RA = -WB / 2;
const NOSE = FA + FOH, TAIL = RA - ROH;
const TIRE_R = (17 * IN) / 2 + 0.315 * 0.70, TIRE_W = 0.318;
export const H2_LAMP = { x: 2.355, y: 0.95, z: 0.70 };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

function yBottom(x) {
  let y = 0.40;
  for (const axle of [FA, RA]) {
    const dx = x - axle, R = 0.515, cy = 0.45;
    if (Math.abs(dx) < R) y = Math.max(y, cy + Math.sqrt(R * R - dx * dx));
  }
  return y;
}
function yTop(x) {
  if (x < 1.00) return 1.355;
  if (x < 1.62) return lerp(1.355, 1.24, smooth((x - 1.00) / 0.62));
  return lerp(1.24, 1.145, smooth((x - 1.62) / (2.28 - 1.62)));
}
function yClad(x) {
  const yb = yBottom(x);
  if (yb > 0.84) return yb;
  let clad = 0.60;
  for (const axle of [FA, RA]) {
    const dx = Math.abs(x - axle);
    if (dx < 0.66) clad = Math.max(clad, 0.60 + 0.16 * (1 - dx / 0.66));
  }
  if (x > 1.92) clad = Math.max(clad, lerp(0.60, 0.78, smooth((x - 1.92) / 0.36)));
  if (x < -1.98) clad = Math.max(clad, lerp(0.60, 0.72, smooth((-1.98 - x) / 0.30)));
  return clamp(Math.max(clad, yb), yb, yTop(x) - 0.05);
}
function zPlan(x) {
  let z = 0.972;
  if (x > 1.82) z = lerp(0.972, 1.005, smooth((x - 1.82) / 0.46));
  if (x < -1.90) z = lerp(0.972, 0.955, smooth((-1.90 - x) / 0.36));
  return z;
}
function flareAdd(x, y) {
  let add = 0;
  for (const axle of [FA, RA]) {
    const dx = x - axle;
    const od = Math.hypot(dx, y - 0.47) - 0.50;
    if (od < -0.01 || od > 0.20) continue;
    const hx = 0.64, hy = 0.56, rad = 0.20;
    const ax = Math.abs(dx), ay = Math.abs(y - 0.64);
    const qx = Math.max(ax - (hx - rad), 0), qy = Math.max(ay - (hy - rad), 0);
    const box = Math.hypot(qx, qy) + Math.min(Math.max(ax - (hx - rad), ay - (hy - rad)), 0) - rad;
    if (box > 0.10) continue;
    const u = od / 0.16;
    const lip = u < 0.16 ? smooth(u / 0.16) : u < 0.52 ? 1 : 1 - smooth((u - 0.52) / 0.48);
    add = Math.max(add, 0.078 * lip * (1 - smooth(box / 0.10)));
  }
  return add;
}
function skinZ(x, y, yb, yt) {
  let z = zPlan(x) + flareAdd(x, y);
  const span = Math.max(0.08, yt - yb);
  const t = clamp((y - yb) / span, 0, 1);
  if (x < 1.20 && x > -1.40) z += 0.006 * Math.sin(Math.PI * t);
  z += 0.0065 * Math.exp(-((y - 1.02) ** 2) / (2 * 0.016 ** 2));
  if (y > 1.08) z -= 0.016 * smooth((y - 1.08) / Math.max(0.08, yt - 1.08));
  for (const cut of [1.00, 0.15, -0.90]) {
    const d = Math.abs(x - cut);
    if (d < 0.011 && y < yt - 0.02) z -= (1 - d / 0.011) * 0.007;
  }
  return z;
}

function flipWinding(geo) {
  const ix = geo.index; if (!ix) return geo;
  const a = ix.array;
  for (let i = 0; i < a.length; i += 3) { const t = a[i + 1]; a[i + 1] = a[i + 2]; a[i + 2] = t; }
  ix.needsUpdate = true; return geo;
}
function dropTiny(geo) {
  const p = geo.attributes.position, ix = geo.index.array, keep = [];
  for (let i = 0; i < ix.length; i += 3) {
    const a = ix[i], b = ix[i + 1], c = ix[i + 2];
    const abx = p.getX(b) - p.getX(a), aby = p.getY(b) - p.getY(a), abz = p.getZ(b) - p.getZ(a);
    const acx = p.getX(c) - p.getX(a), acy = p.getY(c) - p.getY(a), acz = p.getZ(c) - p.getZ(a);
    const crx = aby * acz - abz * acy, cry = abz * acx - abx * acz, crz = abx * acy - aby * acx;
    if (crx * crx + cry * cry + crz * crz > 1e-12) keep.push(a, b, c);
  }
  geo.setIndex(keep); return geo;
}
function forceOut(geo, dir) {
  geo.computeVertexNormals();
  const n = geo.attributes.normal; let d = 0;
  const step = Math.max(1, n.count / 40 | 0);
  for (let i = 0; i < n.count; i += step) d += n.getX(i) * dir[0] + n.getY(i) * dir[1] + n.getZ(i) * dir[2];
  if (d < 0) { flipWinding(geo); geo.computeVertexNormals(); }
  return geo;
}
function surf(nu, nv, f) {
  const P = [];
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) { const p = f(i / nu, j / nv); P.push(p[0], p[1], p[2]); }
  const I = [], row = nv + 1;
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const a = i * row + j, b = a + row; I.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setIndex(I); dropTiny(g); return g;
}
function revolve(profile, seg, radiusOf) {
  const count = profile.length, pos = [], uv = [], idx = [];
  for (let i = 0; i <= seg; i++) {
    const a = i / seg * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    for (let k = 0; k < count; k++) {
      const r = radiusOf ? radiusOf(profile[k], i, seg) : profile[k][0];
      pos.push(c * r, profile[k][1], s * r); uv.push(i / seg, k / (count - 1));
    }
  }
  for (let i = 0; i < seg; i++) for (let k = 0; k < count; k++) {
    const k2 = (k + 1) % count, a = i * count + k, b = i * count + k2, c = (i + 1) * count + k, d = (i + 1) * count + k2;
    idx.push(a, b, c, b, d, c);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx); g.computeVertexNormals(); g.rotateX(Math.PI / 2); g.computeVertexNormals();
  return g;
}
function pack(meshes, name, mat) {
  let n = 0; const geos = [];
  for (const m of meshes) {
    m.updateMatrix();
    const g = m.geometry.index ? m.geometry.toNonIndexed() : m.geometry.clone();
    g.applyMatrix4(m.matrix);
    if (!g.attributes.normal) g.computeVertexNormals();
    n += g.attributes.position.count; geos.push(g);
  }
  const P = new Float32Array(n * 3), N = new Float32Array(n * 3); let o = 0;
  for (const g of geos) {
    P.set(g.attributes.position.array, o);
    N.set(g.attributes.normal.array, o);
    o += g.attributes.position.count * 3; g.dispose();
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(P, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(N, 3));
  geo.computeBoundingSphere();
  const mesh = new THREE.Mesh(geo, mat); mesh.name = name; return mesh;
}

let ENV = null;
function envTex() {
  if (ENV) return ENV;
  const W = 256, H = 128, d = new Uint8Array(W * H * 4);
  const blob = (u, v, u0, v0, su, sv) => {
    let du = Math.abs(u - u0); du = Math.min(du, 1 - du);
    return Math.exp(-(du * du) / (su * su) - ((v - v0) ** 2) / (sv * sv));
  };
  for (let j = 0; j < H; j++) {
    const v = (j + 0.5) / H;
    for (let i = 0; i < W; i++) {
      const u = (i + 0.5) / W; let r, g, b;
      if (v > 0.58) { const t = (v - 0.58) / 0.42; r = 168 - 50 * t; g = 178 - 36 * t; b = 188 - 18 * t; }
      else if (v > 0.46) { r = 214; g = 216; b = 218; }
      else { const t = v / 0.46; r = 46 + 40 * t; g = 48 + 36 * t; b = 50 + 32 * t; }
      const add = 110 * blob(u, v, 0.08, 0.63, 0.035, 0.07) + 90 * blob(u, v, 0.5, 0.72, 0.07, 0.045) + 100 * blob(u, v, 0.92, 0.62, 0.04, 0.07);
      const k = (j * W + i) * 4;
      d[k] = clamp(r + add, 0, 255); d[k + 1] = clamp(g + add, 0, 255); d[k + 2] = clamp(b + add * 0.96, 0, 255); d[k + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(d, W, H); t.colorSpace = THREE.SRGBColorSpace;
  t.mapping = THREE.EquirectangularReflectionMapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true; ENV = t; return t;
}
function treadMaps() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#3c3a37'; g.fillRect(0, 0, 512, 256);
  g.fillStyle = '#2a2826'; g.fillRect(0, 78, 512, 100);
  g.fillStyle = '#161514';
  for (let i = 0; i < 28; i++) {
    const x = i * (512 / 28);
    g.fillRect(x, 92, 7, 72);
    if (i % 2) g.fillRect(x + 10, 108, 8, 18);
    g.fillRect(x + 4, 86, 16, 5); g.fillRect(x + 4, 164, 16, 5);
  }
  g.strokeStyle = '#4a4742'; g.lineWidth = 3;
  for (const y of [46, 210]) { g.beginPath(); g.moveTo(0, y); g.lineTo(512, y); g.stroke(); }
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.wrapS = THREE.RepeatWrapping; map.anisotropy = 4;
  const b = document.createElement('canvas'); b.width = 512; b.height = 256;
  const bg = b.getContext('2d'); bg.fillStyle = '#9a9a9a'; bg.fillRect(0, 0, 512, 256);
  bg.fillStyle = '#e8e8e8'; bg.fillRect(0, 78, 512, 100);
  bg.fillStyle = '#2a2a2a';
  for (let i = 0; i < 28; i++) {
    const x = i * (512 / 28);
    bg.fillRect(x, 92, 7, 72); if (i % 2) bg.fillRect(x + 10, 108, 8, 18);
  }
  const bump = new THREE.CanvasTexture(b); bump.colorSpace = THREE.NoColorSpace; bump.wrapS = THREE.RepeatWrapping;
  return { map, bump };
}

function band(x0, x1, y0, y1, s, nx, ny) {
  return surf(nx, ny, (u, v) => {
    const x = lerp(x0, x1, u), yb = y0(x), yt = y1(x), y = lerp(yb, yt, v);
    let z = skinZ(x, y, yBottom(x), yTop(x));
    const edge = v < 0.07 ? (1 - v / 0.07) : v > 0.9 ? (v - 0.9) / 0.1 : 0;
    if (v < 0.07) z -= edge * 0.02;
    if (v > 0.9) z -= smooth(edge) * 0.045;
    return [x, y, z * s];
  });
}

// Windshield and rear glass share these edges with the black frame so the pane
// overlaps the pillars, cowl, and roof instead of stopping short of them.
export function windAt(u, v) {
  const bow = 0.016 * (1 - u * u);
  return [lerp(1.15, 0.74, v) + bow, lerp(1.30, 1.86, v), u * lerp(0.86, 0.80, v)];
}
export function rearGlassAt(u, v) {
  return [lerp(-2.32, -1.92, v), lerp(1.36, 1.86, v), u * lerp(0.74, 0.68, v)];
}
function yHood(x, z) {
  const t = clamp((x - 1.18) / (2.30 - 1.18), 0, 1);
  const edge = lerp(1.305, 1.15, smooth(t));
  const hw = lerp(0.74, 0.60, t);
  const crown = 0.02 * (1 - Math.min(1, (z / hw) ** 2));
  const scoop = 0.018 * Math.exp(-(((x - 1.52) / 0.22) ** 2)) * Math.exp(-(((z / 0.16) ** 2)));
  const lip = t > 0.94 ? (t - 0.94) / 0.06 * 0.02 : 0;
  return edge + crown + scoop - lip;
}

export function buildH2(group, low) {
  const env = envTex(), tread = treadMaps();
  const paint = new THREE.MeshPhysicalMaterial({ color: 0xf5c40a, metalness: 0.06, roughness: 0.30, clearcoat: 0.72, clearcoatRoughness: 0.26, envMap: env, envMapIntensity: 0.62 });
  const gloss = new THREE.MeshPhysicalMaterial({ color: 0x14161a, metalness: 0.08, roughness: 0.38, clearcoat: 0.35, clearcoatRoughness: 0.4, envMap: env, envMapIntensity: 0.35 });
  const matte = new THREE.MeshStandardMaterial({ color: 0x1a1c1f, roughness: 0.78, metalness: 0.04, envMap: env, envMapIntensity: 0.18 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x102028, metalness: 0.55, roughness: 0.06, clearcoat: 1, clearcoatRoughness: 0.04, envMap: env, envMapIntensity: 0.9, side: THREE.DoubleSide });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xe4eaee, metalness: 0.94, roughness: 0.16, envMap: env, envMapIntensity: 1.05 });
  const alloy = new THREE.MeshStandardMaterial({ color: 0xc5ccd1, metalness: 0.86, roughness: 0.28, envMap: env, envMapIntensity: 0.85 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0xffffff, map: tread.map, bumpMap: tread.bump, bumpScale: 0.018, roughness: 0.9, metalness: 0.02 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0xf7f8fb, emissive: 0xd5e2f2, emissiveIntensity: 0.55, roughness: 0.12, metalness: 0.05, envMap: env });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x8d1612, emissive: 0xff2418, emissiveIntensity: 0.55, roughness: 0.35 });
  const amberMat = new THREE.MeshStandardMaterial({ color: 0xffb03a, emissive: 0xff8a00, emissiveIntensity: 0.7, roughness: 0.35 });
  const fogMat = new THREE.MeshStandardMaterial({ color: 0xf3f1ea, emissive: 0xfff2d2, emissiveIntensity: 0.35, roughness: 0.2 });
  const intake = new THREE.MeshStandardMaterial({ color: 0x0c0d0f, roughness: 0.9, metalness: 0.02 });
  const buckets = { paint: [], gloss: [], matte: [], glass: [], chrome: [], amber: [], fog: [], tail: [], intake: [] };
  const put = (geo, key, dir, pos, rot) => {
    if (dir) forceOut(geo, dir); else geo.computeVertexNormals();
    const m = new THREE.Mesh(geo, key === 'paint' ? paint : key === 'gloss' ? gloss : key === 'matte' ? matte : key === 'glass' ? glass : key === 'chrome' ? chrome : key === 'amber' ? amberMat : key === 'fog' ? fogMat : key === 'tail' ? tailMat : intake);
    if (pos) m.position.set(pos[0], pos[1], pos[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    buckets[key].push(m);
  };
  const box = (w, h, d, r, n, key, pos, rot) => put(beveledBox(w, h, d, r, n), key, null, pos, rot);
  const nx = low ? 48 : 64, ny = low ? 14 : 18;

  for (const s of [1, -1]) {
    put(band(-2.22, 2.16, x => yClad(x), x => yTop(x), s, nx, ny), 'paint', [0, 0, s]);
    put(band(-2.22, 2.16, x => yBottom(x), x => yClad(x), s, nx, 6), 'matte', [0, 0, s]);
    // fender crown, door belt to the hood gap
    put(surf(low ? 28 : 40, 10, (u, v) => {
      const x = lerp(0.98, 2.16, u);
      const zt = skinZ(x, yTop(x), yBottom(x), yTop(x));
      const zi = lerp(0.76, 0.62, smooth(u)) + 0.016;
      const z = lerp(zi, zt, v);
      const y = lerp(yHood(x, Math.min(Math.abs(z), 0.74)) - 0.012, yTop(x) + 0.004, smooth(v));
      return [x, y, z * s];
    }), 'paint', [0, 1, 0]);
    // squared flare lip: a hard shelf around the upper arch, not a melted bulge
    for (const axle of [FA, RA]) {
      put(surf(low ? 14 : 20, 1, (u, v) => {
        const a = Math.PI * lerp(0.18, 0.82, u);
        const x = axle + Math.cos(a) * 0.60, y = 0.52 + Math.sin(a) * 0.50;
        const z0 = Math.min(zPlan(x) + 0.015, 1.01);
        return [x, y + v * 0.02, (z0 + v * 0.085) * s];
      }), 'paint', [0, 0.4, s]);
      put(surf(low ? 14 : 20, 1, (u, v) => {
        const a = Math.PI * lerp(0.18, 0.82, u);
        const x = axle + Math.cos(a) * lerp(0.60, 0.52, v), y = 0.52 + Math.sin(a) * 0.50 - v * 0.05;
        return [x, y, Math.min(zPlan(x) + 0.10, 1.09) * s];
      }), 'paint', [0, 0, s]);
    }
    // rear corner onto the tailgate
    put(surf(6, ny, (u, v) => {
      const R = 0.09, x0 = -2.22, z0 = zPlan(x0), ang = u * Math.PI / 2;
      const x = x0 - Math.sin(ang) * R, z = z0 - (1 - Math.cos(ang)) * R;
      const y = lerp(0.72, 1.34, v);
      return [x, y, z * s];
    }), 'paint', [-1, 0.2, s]);
    // arch liners
    put(surf(low ? 14 : 20, 1, (u, v) => {
      const a = Math.PI * (0.08 + 0.84 * u);
      return [Math.cos(a) * 0.50, 0.45 + Math.sin(a) * 0.50, (v - 0.5) * 0.36];
    }), 'matte', [0, 1, 0], [FA, 0, s * 0.72]);
    put(surf(low ? 14 : 20, 1, (u, v) => {
      const a = Math.PI * (0.08 + 0.84 * u);
      return [Math.cos(a) * 0.50, 0.45 + Math.sin(a) * 0.50, (v - 0.5) * 0.36];
    }), 'matte', [0, 1, 0], [RA, 0, s * 0.72]);
    // splash shields behind each tire
    box(0.08, 0.62, 0.42, 0.02, 1, 'matte', [FA - 0.34, 0.62, s * 0.55]);
    box(0.08, 0.62, 0.42, 0.02, 1, 'matte', [RA + 0.34, 0.62, s * 0.55]);
  }

  // hood
  put(surf(low ? 16 : 24, low ? 10 : 14, (u, v) => {
    const x = lerp(1.18, 2.30, u), hw = lerp(0.76, 0.60, u), z = (v - 0.5) * 2 * hw;
    return [x, yHood(x, z), z];
  }), 'paint', [0, 1, 0]);
  // black bay under the hood shut gaps
  box(1.05, 0.04, 1.55, 0.01, 1, 'matte', [1.72, 1.20, 0]);
  // hood louver pad
  box(0.46, 0.028, 0.40, 0.012, 2, 'gloss', [1.52, 1.335, 0]);
  for (let i = 0; i < 5; i++) box(0.36, 0.012, 0.012, 0.002, 1, 'intake', [1.50 + (i - 2) * 0.07, 1.352, 0], [0, Math.PI / 2, 0]);

  // one wrapped fascia. Grille and lamps are holes, not panels stuck on a slab.
  {
    const nz = 28, ny = 16, zs = [], ys = [];
    for (let i = 0; i <= nz; i++) zs.push(lerp(-1.04, 1.04, i / nz));
    for (let j = 0; j <= ny; j++) ys.push(lerp(0.74, 1.17, j / ny));
    const hole = (z, y) => Math.abs(z) < 0.50 && y > 0.77 && y < 1.135;
    const P = [], I = [];
    const at = (z, y) => {
      const az = Math.abs(z); let x = 2.345;
      if (az > 0.80) { const t = clamp((az - 0.80) / 0.22, 0, 1); x = 2.345 - (1 - Math.cos(t * Math.PI / 2)) * 0.30; }
      return [x, y, z];
    };
    for (let i = 0; i <= nz; i++) for (let j = 0; j <= ny; j++) P.push(...at(zs[i], ys[j]));
    const row = ny + 1;
    for (let i = 0; i < nz; i++) for (let j = 0; j < ny; j++) {
      const zc = (zs[i] + zs[i + 1]) / 2, yc = (ys[j] + ys[j + 1]) / 2;
      if (hole(zc, yc)) continue;
      const a = i * row + j, b = a + row;
      I.push(a, b, a + 1, b, b + 1, a + 1);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
    g.setIndex(I); dropTiny(g); put(g, 'paint', [1, 0, 0]);
  }
  // bridge the side skin into the fascia so the front corner does not open a slot
  for (const s of [1, -1]) {
    put(surf(5, 8, (u, v) => {
      const y = lerp(0.78, 1.16, v);
      const x = lerp(2.08, 2.32, u);
      const zSide = Math.min(1.02, skinZ(Math.min(x, 2.14), Math.min(y, yTop(2.08)), 0.7, 1.16));
      const z = lerp(zSide, 0.90, smooth(u));
      return [x, y, z * s];
    }), 'paint', [1, 0.25, s]);
  }

  // grille cavity, frame, seven slots
  box(0.07, 0.38, 0.96, 0.012, 1, 'intake', [2.26, 0.955, 0]);
  box(0.02, 0.40, 0.018, 0.003, 1, 'chrome', [2.345, 0.955, -0.49]);
  box(0.02, 0.40, 0.018, 0.003, 1, 'chrome', [2.345, 0.955, 0.49]);
  box(0.02, 0.016, 1.00, 0.003, 1, 'chrome', [2.345, 1.15, 0]);
  box(0.02, 0.016, 1.00, 0.003, 1, 'chrome', [2.345, 0.76, 0]);
  for (let i = 0; i < 7; i++) box(0.018, 0.34, 0.034, 0.004, 1, 'chrome', [2.335, 0.955, -0.36 + i * (0.72 / 6)]);

  // lamps
  const lensGeo = new THREE.CylinderGeometry(0.098, 0.098, 0.02, low ? 16 : 24);
  lensGeo.rotateZ(-Math.PI / 2);
  const lenses = [];
  for (const s of [1, -1]) {
    const lens = new THREE.Mesh(lensGeo, headMat); lens.position.set(H2_LAMP.x, H2_LAMP.y, H2_LAMP.z * s); lenses.push(lens);
    const bezel = new THREE.TorusGeometry(0.112, 0.014, low ? 6 : 8, low ? 20 : 28); bezel.rotateY(Math.PI / 2);
    put(bezel, 'chrome', null, [H2_LAMP.x + 0.012, H2_LAMP.y, H2_LAMP.z * s]);
    const bucket = new THREE.CylinderGeometry(0.09, 0.07, 0.04, low ? 12 : 16); bucket.rotateZ(-Math.PI / 2);
    put(bucket, 'intake', null, [H2_LAMP.x - 0.035, H2_LAMP.y, H2_LAMP.z * s]);
    box(0.03, 0.055, 0.09, 0.01, 2, 'amber', [2.34, 0.93, s * 0.86]);
    const fog = new THREE.CylinderGeometry(0.042, 0.042, 0.02, low ? 12 : 16); fog.rotateZ(-Math.PI / 2);
    put(fog, 'fog', null, [2.445, 0.50, s * 0.36]);
    put(new THREE.TorusGeometry(0.048, 0.008, 5, 14).rotateY(Math.PI / 2), 'chrome', null, [2.452, 0.50, s * 0.36]);
  }

  // front bumper
  box(0.26, 0.46, 1.96, 0.07, low ? 2 : 3, 'matte', [2.29, 0.52, 0]);
  box(0.04, 0.20, 0.62, 0.01, 1, 'intake', [2.43, 0.48, 0]);
  for (let i = 0; i < 3; i++) box(0.012, 0.012, 0.50, 0.002, 1, 'gloss', [2.45, 0.42 + i * 0.06, 0]);

  // tailgate, rear bumper, spare stays with the wheels
  put(surf(low ? 10 : 14, 10, (u, v) => {
    const z = lerp(-0.86, 0.86, u), y = lerp(0.72, 1.35, v);
    const crown = 0.012 * (1 - Math.min(1, (z / 0.86) ** 2)) * Math.sin(Math.PI * v);
    return [-2.33 - crown, y, z];
  }), 'paint', [-1, 0, 0]);
  box(0.22, 0.40, 1.84, 0.06, low ? 2 : 3, 'matte', [-2.40, 0.50, 0]);
  box(0.02, 0.14, 0.32, 0.006, 1, 'intake', [-2.52, 0.46, 0]);
  for (const s of [1, -1]) {
    box(0.04, 0.46, 0.11, 0.016, 2, 'tail', [-2.35, 1.02, s * 0.82]);
    box(0.025, 0.10, 0.16, 0.01, 1, 'tail', [-2.50, 0.42, s * 0.55]);
    box(0.02, 0.04, 0.10, 0.008, 1, 'amber', [-2.345, 1.18, s * 0.62]);
  }

  // closed greenhouse: solid roof and side walls, glass set into the openings
  put(surf(low ? 16 : 22, low ? 8 : 12, (u, v) => {
    const x = lerp(0.98, -2.08, u), z = lerp(-0.86, 0.86, v);
    const crown = 0.05 * (1 - Math.min(1, (z / 0.86) ** 2));
    return [x, 1.90 + crown, z];
  }), 'gloss', [0, 1, 0]);
  for (const s of [1, -1]) {
    put(surf(low ? 16 : 24, 5, (u, v) => {
      const y = lerp(1.33, 1.92, v);
      const x0 = lerp(1.12, 0.68, v);
      const x = lerp(x0, -1.72, u);
      const z = (0.80 - 0.02 * v) * s;
      return [x, y, z];
    }), 'gloss', [0, 0.3, s]);
    // sail from the side wall back to the rear glass, so the cabin is closed
    put(surf(6, 5, (u, v) => {
      const y = lerp(1.30, 1.94, v);
      const t = clamp((y - 1.36) / 0.50, 0, 1);
      const xGlass = lerp(-2.46, -2.06, t);
      const x = lerp(-1.50, xGlass, u);
      const z = lerp(0.84, 0.92, u) * s;
      return [x, y, z];
    }), 'gloss', [-0.2, 0.4, s]);
    // Solid D-pillar so the rear glass corner cannot open onto the background.
    box(0.62, 0.66, 0.26, 0.012, 1, 'gloss', [-1.98, 1.60, s * 0.80]);
    // roof rail, outboard of the wall and meeting the glass header
    put(surf(16, 1, (u, v) => {
      const x = lerp(0.70, -1.70, u);
      return [x, lerp(1.82, 1.94, v), (0.835 - v * 0.02) * s];
    }), 'gloss', [0, 0.5, s]);
  }
  const nuW = low ? 10 : 14, nvW = low ? 8 : 10;
  put(surf(nuW, nvW, (u, v) => windAt(u * 2 - 1, v)), 'glass', null);
  // Black reveal sits just behind the pane and runs past every edge, so a sightline
  // that slips off the glass still hits the frame instead of the background.
  put(surf(nuW, nvW, (u, v) => {
    const p = windAt((u * 2 - 1) * 1.08, v * 1.08 - 0.04);
    p[0] -= 0.03;
    return p;
  }), 'gloss', [1, 0.2, 0]);
  for (const s of [1, -1]) {
    put(surf(nvW, 2, (u, v) => {
      const e = windAt(s, u);
      return [e[0] + 0.015 * v, e[1], s * (Math.abs(e[2]) - 0.06 + v * 0.15)];
    }), 'gloss', [0.55, 0.15, s]);
  }
  put(surf(nuW, 2, (u, v) => {
    const e = windAt(u * 2 - 1, 1);
    return [e[0] - 0.02 + v * 0.08, e[1] - 0.015 + v * 0.07, e[2]];
  }), 'gloss', [0.3, 0.9, 0]);
  put(surf(nuW, 2, (u, v) => {
    const e = windAt(u * 2 - 1, 0);
    return [e[0] + 0.015 - v * 0.05, e[1] + 0.02 - v * 0.08, e[2]];
  }), 'gloss', [1, -0.2, 0]);
  put(surf(nuW, nvW, (u, v) => rearGlassAt(u * 2 - 1, v)), 'glass', null);
  put(surf(nuW, nvW, (u, v) => {
    const p = rearGlassAt((u * 2 - 1) * 1.08, v * 1.06 - 0.03);
    p[0] += 0.03;
    return p;
  }), 'gloss', [-1, 0.2, 0]);
  for (const s of [1, -1]) {
    put(surf(nvW, 2, (u, v) => {
      const e = rearGlassAt(s, u);
      return [e[0] - 0.012 * v, e[1], s * (Math.abs(e[2]) - 0.06 + v * 0.16)];
    }), 'gloss', [-0.4, 0.2, s]);
  }
  put(surf(nuW, 2, (u, v) => {
    const e = rearGlassAt(u * 2 - 1, 1);
    return [e[0] + 0.02 - v * 0.06, e[1] - 0.01 + v * 0.06, e[2]];
  }), 'gloss', [-0.3, 0.8, 0]);

  // side openings: trapezoid front glass, rectangular rear and quarter
  const sideGlass = (s, x0, x1, y0, y1) => {
    const z = 0.858 * s, g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute([
      x0, y0, z, x1, y0, z, x1, y1, z, x0, y1, z
    ], 3));
    g.setIndex(s > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]);
    g.computeVertexNormals(); put(g, 'glass', null);
  };
  const rail = (w, h, x, y, z) => box(w, h, 0.028, 0.006, 1, 'gloss', [x, y, z]);
  for (const s of [1, -1]) {
    const zf = 0.892 * s;
    sideGlass(s, 0.78, 0.20, 1.44, 1.80);
    sideGlass(s, 0.02, -0.84, 1.44, 1.80);
    sideGlass(s, -1.02, -1.40, 1.48, 1.78);
    rail(0.64, 0.045, 0.49, 1.415, zf); rail(0.64, 0.05, 0.49, 1.825, zf);
    rail(0.045, 0.42, 0.78, 1.62, zf); rail(0.05, 0.42, 0.20, 1.62, zf);
    rail(0.92, 0.045, -0.41, 1.415, zf); rail(0.92, 0.05, -0.41, 1.825, zf);
    rail(0.05, 0.42, 0.02, 1.62, zf); rail(0.05, 0.42, -0.84, 1.62, zf);
    rail(0.42, 0.042, -1.21, 1.455, zf); rail(0.42, 0.046, -1.21, 1.805, zf);
    rail(0.045, 0.36, -1.02, 1.63, zf); rail(0.045, 0.36, -1.40, 1.63, zf);
    // D-pillar gills
    for (let i = 0; i < 8; i++) box(0.012, 0.012, 0.055, 0.002, 1, 'chrome', [-1.46, 1.46 + i * 0.038, s * 0.90]);
    // door gaps read as dark seams
    for (const x of [1.00, 0.15, -0.90]) box(0.008, 0.70, 0.012, 0.001, 1, 'intake', [x, 0.98, s * 0.978]);
    // handles, marker, mirror
    box(0.13, 0.032, 0.028, 0.008, 1, 'gloss', [0.32, 1.16, s * 0.995]);
    box(0.13, 0.032, 0.028, 0.008, 1, 'gloss', [-0.42, 1.16, s * 0.995]);
    box(0.05, 0.035, 0.02, 0.006, 1, s > 0 ? 'amber' : 'tail', [s > 0 ? 1.55 : -1.7, 0.95, s * 1.01]);
    box(0.07, 0.20, 0.02, 0.004, 1, 'gloss', [1.10, 1.02, s * 1.02]);
    for (let i = 0; i < 4; i++) box(0.055, 0.008, 0.012, 0.001, 1, 'intake', [1.10, 0.95 + i * 0.04, s * 1.028]);
    // mirror
    box(0.20, 0.15, 0.09, 0.02, 2, 'gloss', [0.78, 1.52, s * 1.08]);
    box(0.06, 0.04, 0.10, 0.01, 1, 'gloss', [0.84, 1.46, s * 0.98]);
    put(new THREE.PlaneGeometry(0.15, 0.11), 'chrome', null, [0.78, 1.525, s * 1.128], s > 0 ? [0, 0, 0] : [0, Math.PI, 0]);
    // running board
    const tube = new THREE.CylinderGeometry(0.032, 0.032, 1.85, low ? 8 : 12); tube.rotateZ(Math.PI / 2);
    put(tube, 'chrome', null, [0.02, 0.36, s * 1.01]);
    box(0.70, 0.012, 0.10, 0.004, 1, 'matte', [0.05, 0.392, s * 1.00]);
    for (const x of [0.55, -0.45]) box(0.04, 0.08, 0.04, 0.008, 1, 'gloss', [x, 0.40, s * 0.96]);
    // mud flap behind the rear tire
    box(0.02, 0.28, 0.16, 0.004, 1, 'matte', [RA - 0.48, 0.32, s * 0.78]);
  }
  // fuel door, driver side
  put(new THREE.CircleGeometry(0.075, low ? 12 : 18), 'paint', null, [-1.18, 1.02, -0.992], [0, -Math.PI / 2, 0]);
  put(new THREE.TorusGeometry(0.078, 0.008, 6, 18).rotateY(-Math.PI / 2), 'chrome', null, [-1.18, 1.02, -1.0]);

  // wipers
  box(0.62, 0.012, 0.02, 0.003, 1, 'gloss', [1.08, 1.36, 0.28], [0.4, 0.15, 0.15]);
  box(0.62, 0.012, 0.02, 0.003, 1, 'gloss', [1.08, 1.36, -0.22], [-0.3, -0.1, -0.12]);

  // roof rack and pace bar sit on the roof crown, with feet so nothing floats
  const roofY = (x, z) => 1.90 + 0.05 * (1 - Math.min(1, (z / 0.86) ** 2));
  const railY = roofY(0, 0.58) + 0.02;
  for (const s of [1, -1]) {
    const rail = new THREE.CylinderGeometry(0.016, 0.016, 1.70, 8); rail.rotateZ(Math.PI / 2);
    put(rail, 'gloss', null, [-0.40, railY, s * 0.55]);
    for (const x of [0.25, -0.40, -1.05]) box(0.03, 0.025, 0.03, 0.004, 1, 'gloss', [x, roofY(x, 0.55) + 0.01, s * 0.55]);
  }
  for (const x of [0.30, -0.40, -1.10]) {
    const barR = new THREE.CylinderGeometry(0.014, 0.014, 1.10, 8); barR.rotateX(Math.PI / 2);
    put(barR, 'gloss', null, [x, railY + 0.01, 0]);
  }
  for (const s of [-1, -0.5, 0, 0.5, 1]) {
    box(0.05, 0.02, 0.07, 0.004, 1, 'amber', [0.88, 1.935, s * 0.18]);
    box(0.045, 0.018, 0.06, 0.004, 1, 'tail', [-1.90, 1.932, s * 0.16]);
  }
  const barY = roofY(0.12, 0) + 0.02;
  box(0.16, 0.04, 0.72, 0.01, 2, 'gloss', [0.12, barY, 0]);
  for (const s of [-1, 1]) box(0.05, 0.028, 0.05, 0.006, 1, 'gloss', [0.12, roofY(0.12, 0) + 0.012, s * 0.28]);
  const paceMat = [0, 1].map(() => new THREE.MeshStandardMaterial({ color: 0xffb000, emissive: 0xffaa00, emissiveIntensity: 1.5, roughness: 0.35 }));
  const lamps = [], sprites = [], tex = glowTexture();
  for (const side of [1, -1]) {
    const pods = [];
    for (const k of [0, 1]) {
      const pod = new THREE.Mesh(beveledBox(0.11, 0.028, 0.14, 0.008, 2), paceMat[side > 0 ? 0 : 1]);
      pod.position.set(0.12, barY + 0.028, side * (0.12 + k * 0.20));
      pod.name = 'h2-pace-lamp'; pod.castShadow = false; pods.push(pod); group.add(pod);
    }
    lamps.push(pods[0]);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xffb020, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.55 }));
    sp.scale.setScalar(low ? 0.4 : 0.62); sp.position.set(0.12, barY + 0.05, side * 0.22); group.add(sp);
    if (!low || side > 0) sprites.push(sp); else sp.visible = false;
  }

  // wheels
  const seg = low ? 22 : 36;
  const treadGeo = revolve([
    [0.56, -TIRE_W * 0.08], [0.60, -TIRE_W * 0.42], [0.74, -TIRE_W * 0.50], [0.90, -TIRE_W * 0.49],
    [0.975, -TIRE_W * 0.36], [1, -TIRE_W * 0.20], [1, TIRE_W * 0.20], [0.975, TIRE_W * 0.36],
    [0.90, TIRE_W * 0.49], [0.74, TIRE_W * 0.50], [0.60, TIRE_W * 0.42], [0.56, TIRE_W * 0.08]
  ].map(([k, z]) => [TIRE_R * k, z]), seg);
  const rimParts = [];
  const lip = new THREE.TorusGeometry(0.208, 0.020, low ? 6 : 8, seg); lip.translate(0, 0, TIRE_W * 0.20); lip.computeVertexNormals(); rimParts.push(lip);
  const cap = new THREE.CylinderGeometry(0.048, 0.056, 0.028, low ? 12 : 16); cap.rotateX(Math.PI / 2); cap.translate(0, 0, TIRE_W * 0.21); rimParts.push(cap);
  for (let i = 0; i < 6; i++) {
    const a = i / 6 * Math.PI * 2, c = Math.cos(a), s = Math.sin(a);
    const spoke = new THREE.BoxGeometry(0.150, 0.052, 0.030);
    spoke.translate(0.112, 0, TIRE_W * 0.175);
    spoke.rotateZ(a);
    rimParts.push(spoke);
    if (!low) {
      const lug = new THREE.CylinderGeometry(0.012, 0.012, 0.012, 6);
      lug.rotateX(Math.PI / 2); lug.translate(c * 0.038, s * 0.038, TIRE_W * 0.235); rimParts.push(lug);
    }
  }
  const rimGeo = pack(rimParts.map(g => new THREE.Mesh(g)), 'h2-rim-geo', alloy).geometry;
  const halfT = TRACK / 2;
  const tireMesh = new THREE.InstancedMesh(treadGeo, rubber, 4); tireMesh.name = 'h2-tire';
  const rimMesh = new THREE.InstancedMesh(rimGeo, alloy, 4); rimMesh.name = 'h2-rim';
  const M = new THREE.Matrix4(), Q = new THREE.Quaternion(), P = new THREE.Vector3(), S = new THREE.Vector3(1, 1, 1);
  const spots = [[FA, halfT], [FA, -halfT], [RA, halfT], [RA, -halfT]];
  spots.forEach(([x, z], i) => {
    Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), z > 0 ? 0 : Math.PI);
    P.set(x, TIRE_R, z); M.compose(P, Q, S);
    tireMesh.setMatrixAt(i, M); rimMesh.setMatrixAt(i, M);
  });
  tireMesh.instanceMatrix.needsUpdate = true; rimMesh.instanceMatrix.needsUpdate = true;
  group.add(tireMesh, rimMesh);
  // spare, face rearward
  const spare = new THREE.Mesh(treadGeo, rubber); spare.name = 'h2-spare';
  spare.position.set(-2.50, 1.12, 0); spare.rotation.y = -Math.PI / 2; group.add(spare);
  const spareRim = new THREE.Mesh(rimGeo, alloy); spareRim.name = 'h2-spare-rim';
  spareRim.position.copy(spare.position); spareRim.rotation.y = -Math.PI / 2; group.add(spareRim);
  box(0.06, 0.16, 0.16, 0.01, 1, 'matte', [-2.36, 1.12, 0]);
  const discGeo = new THREE.CylinderGeometry(0.188, 0.188, 0.012, low ? 16 : 24); discGeo.rotateX(Math.PI / 2); discGeo.translate(0, 0, TIRE_W * 0.06);
  const discs = new THREE.InstancedMesh(discGeo, intake, 4); discs.name = 'h2-rotor';
  spots.forEach(([x, z], i) => { Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), z > 0 ? 0 : Math.PI); P.set(x, TIRE_R, z); M.compose(P, Q, S); discs.setMatrixAt(i, M); });
  discs.instanceMatrix.needsUpdate = true; discs.castShadow = !low; group.add(discs);

  // pace-car lettering, transparent outside the glyphs
  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 96;
  const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, 512, 96);
  ctx.fillStyle = '#1a1408'; ctx.font = '800 58px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('PACE CAR', 256, 50);
  const labelTex = new THREE.CanvasTexture(cv); labelTex.colorSpace = THREE.SRGBColorSpace;
  const labelMat = new THREE.MeshBasicMaterial({ map: labelTex, transparent: true, alphaTest: 0.35, depthWrite: false });
  for (const s of [1, -1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.68, 0.105), labelMat);
    m.position.set(0.52, 1.08, s * 1.0); if (s < 0) m.rotation.y = Math.PI; m.name = 'h2-decal'; group.add(m);
  }

  const cast = !low;
  const names = { paint: 'h2-body', gloss: 'h2-roof', matte: 'h2-trim', glass: 'h2-glass', chrome: 'h2-chrome', amber: 'h2-marker', fog: 'h2-fog', tail: 'h2-tail', intake: 'h2-intake' };
  for (const [key, list] of Object.entries(buckets)) {
    if (!list.length) continue;
    const mesh = pack(list, names[key], list[0].material);
    mesh.castShadow = cast && key !== 'glass'; mesh.receiveShadow = cast; group.add(mesh);
  }
  const head = pack(lenses, 'h2-headlamp', headMat); head.castShadow = false; group.add(head);
  for (const m of [tireMesh, rimMesh, spare, spareRim]) { m.castShadow = cast; m.receiveShadow = cast; }

  let tris = 0, draws = 0;
  group.traverse(o => {
    if (!o.isMesh) return; draws++;
    const n = o.geometry.index ? o.geometry.index.count / 3 : o.geometry.attributes.position.count / 3;
    tris += n * (o.isInstancedMesh ? o.count : 1);
  });
  group.userData = {
    lamps, sprites, bar: lamps[0], frontAxle: FA, rearAxle: RA, trackWidth: TRACK,
    halfLength: 2.9, halfWidth: 1.16, bodyLength: L, bodyWidth: W, bodyHeight: H,
    grille: 'seven-vertical', lampsShape: 'round', triangles: Math.round(tris), drawCalls: draws
  };
}
