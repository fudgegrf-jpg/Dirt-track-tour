// Original Hummer H2 pace-SUV shell. Proportions follow the published 2003 H2
// (189.8 x 81.2 x 77.8 in, 122.8 in wheelbase, 32.6 / 34.6 in overhangs,
// 69.4 in track, 35 in tire). Shape only: no Hummer wordmark or copied mesh.
// The roof and pillars are body color. Glass and a narrow gasket are black.
import * as THREE from 'three';
import { beveledBox } from './details.js';
import { glowTexture } from './gfx.js';

const IN = 0.0254;
const L = 189.8 * IN, WB = 122.8 * IN, FOH = 32.6 * IN, ROH = 34.6 * IN;
const W = 81.2 * IN, H = 77.8 * IN, TRACK = 69.4 * IN;
const FA = WB / 2, RA = -WB / 2;
const NOSE = FA + FOH, TAIL = RA - ROH;
const TIRE_R = 35 * IN / 2, TIRE_W = 0.325;
// Round lamp, sitting inside the chrome surround, ahead of the bezel.
export const H2_LAMP = { x: 2.40, y: 1.03, z: 0.66 };

const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = t => { t = clamp(t, 0, 1); return t * t * (3 - 2 * t); };

function archY(x, axle) {
  const dx = clamp((x - axle) / 0.56, -1, 1);
  return 0.45 + Math.sqrt(Math.max(0, 1 - dx * dx)) * 0.52;
}
// Flat hood. The fender break is a separate surface, so the crease stays sharp.
function yHood(x) {
  const t = clamp((x - 1.12) / (2.20 - 1.12), 0, 1);
  return lerp(1.40, 1.195, t);
}
function zSide(x) {
  let z = 1.012;
  if (x > 1.85) z = lerp(1.012, 0.96, smooth((x - 1.85) / 0.32));
  if (x < -2.02) z = lerp(1.012, 0.985, smooth((-2.02 - x) / 0.24));
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
  const Wd = 256, Ht = 128, d = new Uint8Array(Wd * Ht * 4);
  const blob = (u, v, u0, v0, su, sv) => {
    let du = Math.abs(u - u0); du = Math.min(du, 1 - du);
    return Math.exp(-(du * du) / (su * su) - ((v - v0) ** 2) / (sv * sv));
  };
  for (let j = 0; j < Ht; j++) {
    const v = (j + 0.5) / Ht;
    for (let i = 0; i < Wd; i++) {
      const u = (i + 0.5) / Wd; let r, g, b;
      if (v > 0.55) { const t = (v - 0.55) / 0.45; r = 176 - 40 * t; g = 196 - 30 * t; b = 214 - 16 * t; }
      else if (v > 0.42) { r = 230; g = 232; b = 234; }
      else { const t = v / 0.42; r = 70 + 50 * t; g = 72 + 46 * t; b = 68 + 40 * t; }
      const add = 140 * blob(u, v, 0.08, 0.66, 0.04, 0.08) + 120 * blob(u, v, 0.52, 0.78, 0.09, 0.05) + 130 * blob(u, v, 0.92, 0.64, 0.045, 0.08);
      const k = (j * Wd + i) * 4;
      d[k] = clamp(r + add, 0, 255); d[k + 1] = clamp(g + add, 0, 255); d[k + 2] = clamp(b + add * 0.95, 0, 255); d[k + 3] = 255;
    }
  }
  const t = new THREE.DataTexture(d, Wd, Ht); t.colorSpace = THREE.SRGBColorSpace;
  t.mapping = THREE.EquirectangularReflectionMapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter;
  t.needsUpdate = true; ENV = t; return t;
}
function treadMaps() {
  const c = document.createElement('canvas'); c.width = 512; c.height = 256;
  const g = c.getContext('2d');
  g.fillStyle = '#2e2c2a'; g.fillRect(0, 0, 512, 256);
  g.fillStyle = '#1a1917'; g.fillRect(0, 70, 512, 116);
  g.fillStyle = '#0c0b0a';
  for (let i = 0; i < 14; i++) {
    const x = i * 36;
    g.fillRect(x + 4, 78, 16, 100);
    g.fillRect(x + 20, 92, 10, 34);
    g.fillRect(x + 20, 136, 10, 28);
  }
  g.fillStyle = '#c8c4bc';
  g.font = '700 20px Arial, sans-serif';
  g.fillText('ALL TERRAIN', 16, 214);
  g.fillText('ALL TERRAIN', 268, 214);
  const map = new THREE.CanvasTexture(c); map.colorSpace = THREE.SRGBColorSpace; map.wrapS = THREE.RepeatWrapping; map.anisotropy = 4;
  const b = document.createElement('canvas'); b.width = 512; b.height = 256;
  const bg = b.getContext('2d'); bg.fillStyle = '#8a8a8a'; bg.fillRect(0, 0, 512, 256);
  bg.fillStyle = '#f0f0f0'; bg.fillRect(0, 70, 512, 116);
  bg.fillStyle = '#111';
  for (let i = 0; i < 14; i++) {
    const x = i * 36;
    bg.fillRect(x + 4, 78, 16, 100);
    bg.fillRect(x + 20, 92, 10, 72);
  }
  const bump = new THREE.CanvasTexture(b); bump.colorSpace = THREE.NoColorSpace; bump.wrapS = THREE.RepeatWrapping;
  return { map, bump };
}

// Windshield and rear glass. The gasket and pillars share these edges.
export function windAt(u, v) {
  const bow = 0.008 * (1 - u * u);
  // Matches the GLB windshield. Blender Y becomes Three -Z.
  return [lerp(1.145, 0.80, v) + bow, lerp(1.34, 1.84, v), -u * lerp(0.72, 0.62, v)];
}
export function rearGlassAt(u, v) {
  return [lerp(-2.18, -2.00, v), lerp(1.38, 1.82, v), -u * lerp(0.66, 0.54, v)];
}

// Rounded-rectangle chrome tube. halfW/halfH are the tube centerline.
function grilleTube(x, cy, halfW, halfH, rad, tube, nu, nv) {
  const hw = halfW - rad, hh = halfH - rad;
  const wLen = hw * 2, hLen = hh * 2, cLen = rad * Math.PI / 2;
  const segs = [
    { len: wLen, at: (t) => ({ y: -halfH, z: -hw + t * wLen, ny: -1, nz: 0 }) },
    { len: cLen, at: (t) => { const a = -Math.PI / 2 + t * Math.PI / 2; return { y: -hh + Math.sin(a) * rad, z: hw + Math.cos(a) * rad, ny: Math.sin(a), nz: Math.cos(a) }; } },
    { len: hLen, at: (t) => ({ y: -hh + t * hLen, z: halfW, ny: 0, nz: 1 }) },
    { len: cLen, at: (t) => { const a = t * Math.PI / 2; return { y: hh + Math.sin(a) * rad, z: hw + Math.cos(a) * rad, ny: Math.sin(a), nz: Math.cos(a) }; } },
    { len: wLen, at: (t) => ({ y: halfH, z: hw - t * wLen, ny: 1, nz: 0 }) },
    { len: cLen, at: (t) => { const a = Math.PI / 2 + t * Math.PI / 2; return { y: hh + Math.sin(a) * rad, z: -hw + Math.cos(a) * rad, ny: Math.sin(a), nz: Math.cos(a) }; } },
    { len: hLen, at: (t) => ({ y: hh - t * hLen, z: -halfW, ny: 0, nz: -1 }) },
    { len: cLen, at: (t) => { const a = Math.PI + t * Math.PI / 2; return { y: -hh + Math.sin(a) * rad, z: -hw + Math.cos(a) * rad, ny: Math.sin(a), nz: Math.cos(a) }; } }
  ];
  const per = segs.reduce((s, g) => s + g.len, 0);
  const sample = (u) => {
    let d = ((u % 1) + 1) % 1 * per;
    for (const seg of segs) {
      if (d <= seg.len || seg === segs[segs.length - 1]) return seg.at(seg.len ? Math.min(d / seg.len, 1) : 0);
      d -= seg.len;
    }
    return segs[0].at(0);
  };
  const P = [], I = [];
  for (let i = 0; i < nu; i++) {
    const c = sample(i / nu);
    const len = Math.hypot(c.ny, c.nz) || 1, ny = c.ny / len, nz = c.nz / len;
    for (let j = 0; j < nv; j++) {
      const a = j / nv * Math.PI * 2;
      P.push(x + Math.cos(a) * tube, cy + c.y + ny * Math.sin(a) * tube, c.z + nz * Math.sin(a) * tube);
    }
  }
  for (let i = 0; i < nu; i++) {
    const i2 = (i + 1) % nu;
    for (let j = 0; j < nv; j++) {
      const j2 = (j + 1) % nv;
      const a = i * nv + j, b = i2 * nv + j, a1 = i * nv + j2, b1 = i2 * nv + j2;
      I.push(a, a1, b, b, a1, b1);
    }
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3));
  g.setIndex(I); g.computeVertexNormals(); return g;
}

export function buildH2(group, low) {
  const env = envTex(), tread = treadMaps();
  const paint = new THREE.MeshPhysicalMaterial({ color: 0xf2c000, metalness: 0.02, roughness: 0.40, clearcoat: 0.42, clearcoatRoughness: 0.28, envMap: env, envMapIntensity: 0.32 });
  const gloss = new THREE.MeshPhysicalMaterial({ color: 0x121316, metalness: 0.15, roughness: 0.34, clearcoat: 0.4, clearcoatRoughness: 0.32, envMap: env, envMapIntensity: 0.4 });
  const matte = new THREE.MeshStandardMaterial({ color: 0x16181b, roughness: 0.82, metalness: 0.04, envMap: env, envMapIntensity: 0.16 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x0b1218, metalness: 0.82, roughness: 0.05, clearcoat: 1, clearcoatRoughness: 0.04, envMap: env, envMapIntensity: 1.15, side: THREE.DoubleSide });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xe7eef2, metalness: 1, roughness: 0.10, envMap: env, envMapIntensity: 1.35 });
  const alloy = new THREE.MeshStandardMaterial({ color: 0xb7c0c6, metalness: 0.88, roughness: 0.30, envMap: env, envMapIntensity: 0.9 });
  const rubber = new THREE.MeshStandardMaterial({ color: 0xffffff, map: tread.map, bumpMap: tread.bump, bumpScale: 0.045, roughness: 0.94, metalness: 0.02 });
  const headMat = new THREE.MeshStandardMaterial({ color: 0xf4f7fb, emissive: 0xd5e4f4, emissiveIntensity: 0.65, roughness: 0.10, metalness: 0.04, envMap: env });
  const tailMat = new THREE.MeshStandardMaterial({ color: 0x8a120e, emissive: 0xff2214, emissiveIntensity: 0.45, roughness: 0.32 });
  const amberMat = new THREE.MeshStandardMaterial({ color: 0xffb03a, emissive: 0xff8a00, emissiveIntensity: 0.75, roughness: 0.32 });
  const fogMat = new THREE.MeshStandardMaterial({ color: 0xf4f1e8, emissive: 0xfff1cc, emissiveIntensity: 0.4, roughness: 0.18 });
  const intake = new THREE.MeshStandardMaterial({ color: 0x0b0c0e, roughness: 0.92, metalness: 0.02 });
  const buckets = { paint: [], gloss: [], matte: [], glass: [], chrome: [], amber: [], fog: [], tail: [], intake: [] };
  const mats = { paint, gloss, matte, glass, chrome, amber: amberMat, fog: fogMat, tail: tailMat, intake };
  const put = (geo, key, dir, pos, rot) => {
    if (dir) forceOut(geo, dir); else if (!geo.attributes.normal) geo.computeVertexNormals();
    const n = geo.attributes.normal;
    if (n) for (let i = 0; i < n.count; i++) {
      const x = n.getX(i), y = n.getY(i), z = n.getZ(i), l = Math.hypot(x, y, z);
      if (!Number.isFinite(l) || l < 1e-5) n.setXYZ(i, 0, 1, 0);
      else if (Math.abs(l - 1) > 1e-3) n.setXYZ(i, x / l, y / l, z / l);
    }
    const m = new THREE.Mesh(geo, mats[key]);
    if (pos) m.position.set(pos[0], pos[1], pos[2]);
    if (rot) m.rotation.set(rot[0], rot[1], rot[2]);
    buckets[key].push(m);
  };
  const box = (w, h, d, r, n, key, pos, rot) => put(beveledBox(w, h, d, r, n), key, null, pos, rot);

  // ---- body sides. Arch edges follow the curve so the opening is smooth. ----
  const zLower = () => 0.998;
  const zUpper = () => 1.018;
  for (const s of [1, -1]) {
    // door slab between the wheels, split so the belt line is a hard crease
    put(surf(low ? 18 : 26, 3, (u, v) => {
      const x = lerp(RA + 0.60, FA - 0.60, u);
      return [x, lerp(0.56, 1.03, v), zLower() * s];
    }), 'paint', [0, 0, s]);
    put(surf(low ? 18 : 26, 3, (u, v) => {
      const x = lerp(RA + 0.42, FA - 0.42, u);
      return [x, lerp(1.02, 1.50, v), zUpper() * s];
    }), 'paint', [0, 0, s]);
    // skin over each arch, bottom edge on the opening
    for (const axle of [FA, RA]) {
      const top = axle === FA ? (x) => (x > 1.08 ? yHood(x) - 0.008 : 1.52) : () => 1.52;
      put(surf(low ? 12 : 16, low ? 4 : 6, (u, v) => {
        const x = lerp(axle - 0.58, axle + 0.58, u);
        const y = lerp(archY(x, axle), top(x), v);
        return [x, y, (y > 1.02 ? zUpper() : zLower()) * s];
      }), 'paint', [0, 0.3, s]);
    }
    // nose-side fender, ahead of the front arch
    put(surf(low ? 8 : 12, low ? 5 : 7, (u, v) => {
      const x = lerp(FA + 0.56, 2.16, u);
      const y = lerp(0.56, yHood(x) - 0.008, v);
      let z = 1.018;
      if (x > 1.92) z = lerp(z, 0.97, smooth((x - 1.92) / 0.24));
      return [x, y, z * s];
    }), 'paint', [0, 0, s]);
    // quarter panel behind the rear arch
    put(surf(low ? 6 : 8, 6, (u, v) => {
      const x = lerp(-2.20, RA - 0.56, u);
      return [x, lerp(0.56, 1.52, v), zSide(x) * s];
    }), 'paint', [0, 0, s]);
    // fender crown, outboard of the hood crease
    put(surf(low ? 12 : 16, 3, (u, v) => {
      const x = lerp(1.10, 2.18, u);
      const z = lerp(0.78, zSide(x) + 0.006, v);
      const y = yHood(x) - 0.006 - v * 0.008;
      return [x, y, z * s];
    }), 'paint', [0, 1, 0]);
    // rocker cladding, interrupted by the arches
    put(surf(low ? 16 : 22, 2, (u, v) => {
      const x = lerp(RA + 0.62, FA - 0.62, u);
      return [x, lerp(0.40, 0.58, v), 1.03 * s];
    }), 'matte', [0, 0, s]);
    put(surf(6, 2, (u, v) => {
      const x = lerp(FA + 0.62, 2.05, u);
      return [x, lerp(0.40, 0.58, v), 1.03 * s];
    }), 'matte', [0, 0, s]);
    put(surf(5, 2, (u, v) => {
      const x = lerp(-2.12, RA - 0.62, u);
      return [x, lerp(0.40, 0.58, v), 1.03 * s];
    }), 'matte', [0, 0, s]);
    // front corner, yellow, from the fender onto the nose beside the grille
    put(surf(4, 5, (u, v) => {
      const z = lerp(0.84, 1.01, u);
      const y = lerp(0.90, yHood(2.08), v);
      const x = 2.30 - u * u * 0.10;
      return [x, y, z * s];
    }), 'paint', [1, 0.15, 0]);
    put(surf(4, 5, (u, v) => {
      const ang = u * Math.PI / 2;
      const y = lerp(0.90, yHood(2.08), v);
      const x = 2.18 + Math.sin(ang) * 0.12;
      const z = 1.01 - (1 - Math.cos(ang)) * 0.06;
      return [x, y, z * s];
    }), 'paint', [0.5, 0.2, s]);
    // rear corner onto the tailgate
    put(surf(4, 8, (u, v) => {
      const ang = u * Math.PI / 2;
      const y = lerp(0.62, 1.40, v);
      const x = -2.20 - Math.sin(ang) * 0.10;
      const z = 1.00 - (1 - Math.cos(ang)) * 0.16;
      return [x, y, z * s];
    }), 'paint', [-0.6, 0.2, s]);

    // squared flare and the dark well behind it
    for (const axle of [FA, RA]) {
      const nuA = low ? 16 : 24;
      put(surf(nuA, 3, (u, v) => {
        const a = Math.PI * (0.02 + 0.96 * u);
        const c = Math.cos(a), sn = Math.sin(a);
        const rad = lerp(0.50, 0.60, smooth(v));
        return [axle + c * rad * 1.05, 0.45 + sn * rad, lerp(1.00, 1.09, v) * s];
      }), 'matte', [0, 0.2, s]);
      put(surf(nuA, 2, (u, v) => {
        const a = Math.PI * u;
        return [axle + Math.cos(a) * 0.49, 0.46 + Math.sin(a) * 0.47, lerp(0.40, 0.98, v) * s];
      }), 'matte', [0, 0, s]);
      // solid well so the arch does not open onto the sky
      put(surf(low ? 8 : 10, low ? 3 : 4, (u, v) => {
        const a = Math.PI * u;
        return [axle + Math.cos(a) * 0.47 * v, 0.46 + Math.sin(a) * 0.45 * v, 0.62 * s];
      }), 'intake', [0, 0, s]);
    }
    put(surf(low ? 12 : 16, 1, (u, v) => {
      const a = Math.PI * (0.05 + 0.9 * u);
      return [FA + Math.cos(a) * 0.50, 0.46 + Math.sin(a) * 0.48, lerp(0.55, 0.95, v) * s];
    }), 'intake', [0, 0, s]);
    put(surf(low ? 12 : 16, 1, (u, v) => {
      const a = Math.PI * (0.05 + 0.9 * u);
      return [RA + Math.cos(a) * 0.50, 0.46 + Math.sin(a) * 0.48, lerp(0.55, 0.95, v) * s];
    }), 'intake', [0, 0, s]);
  }

  // belly, so the cabin is not open underneath
  box(4.2, 0.08, 1.55, 0.02, 1, 'matte', [-0.05, 0.34, 0]);

  // ---- hood: one flat plane, sharp break where the fender crown starts ----
  put(surf(low ? 14 : 20, low ? 8 : 12, (u, v) => {
    const x = lerp(1.08, 2.22, u);
    const hw = lerp(0.90, 0.80, u);
    const z = (v - 0.5) * 2 * hw;
    const crown = 0.006 * (1 - Math.min(1, (z / hw) ** 2));
    return [x, yHood(x) + crown, z];
  }), 'paint', [0, 1, 0]);
  // cowl closes the hood to the windshield so the base of the glass is not open
  put(surf(low ? 8 : 12, 3, (u, v) => {
    const z = lerp(-0.96, 0.96, u);
    const x = lerp(1.06, 1.20, v);
    return [x, lerp(yHood(1.10), 1.44, smooth(v)), z];
  }), 'paint', [0, 1, 0]);
  // center extractor, black, with horizontal slots
  const scoopX = 1.72, scoopY = yHood(scoopX) + 0.012;
  box(0.78, 0.018, 0.46, 0.004, 1, 'gloss', [scoopX, scoopY, 0]);
  for (let i = 0; i < 5; i++) box(0.62, 0.006, 0.012, 0.001, 1, 'intake', [scoopX - 0.24 + i * 0.12, scoopY + 0.012, 0]);
  // hood-to-fender gap
  for (const s of [1, -1]) {
    put(surf(14, 1, (u, v) => {
      const x = lerp(1.20, 2.16, u);
      const z = lerp(0.78, 0.74, u);
      return [x, yHood(x) - 0.004 - v * 0.02, z * s];
    }), 'intake', [0, -1, 0]);
  }

  // ---- nose: chrome tube surround, lamps inside it, chunky bumper below ----
  const gX = 2.325, gY = 1.02, gHW = 0.82, gHH = 0.145;
  put(grilleTube(gX, gY, gHW, gHH, 0.08, 0.034, low ? 48 : 72, low ? 6 : 8), 'chrome');
  box(0.03, gHH * 2 - 0.08, 1.05, 0.008, 1, 'intake', [gX - 0.03, gY + 0.01, 0]);
  for (let i = 0; i < 7; i++) {
    const z = -0.42 + i * (0.84 / 6);
    box(0.02, gHH * 2 - 0.09, 0.028, 0.004, 1, 'chrome', [gX + 0.012, gY + 0.008, z]);
  }
  // red accent along the bottom of the slots
  box(0.012, 0.012, 0.92, 0.002, 1, 'tail', [gX + 0.02, gY - 0.105, 0]);

  const lensGeo = new THREE.CylinderGeometry(0.100, 0.100, 0.02, low ? 16 : 24);
  lensGeo.rotateZ(-Math.PI / 2);
  const lenses = [];
  for (const s of [1, -1]) {
    const lens = new THREE.Mesh(lensGeo, headMat);
    lens.position.set(H2_LAMP.x, H2_LAMP.y, H2_LAMP.z * s);
    lenses.push(lens);
    const bezel = new THREE.TorusGeometry(0.116, 0.014, low ? 6 : 8, low ? 18 : 28);
    bezel.rotateY(Math.PI / 2);
    put(bezel, 'chrome', null, [gX + 0.02, H2_LAMP.y, H2_LAMP.z * s]);
    const bucket = new THREE.CylinderGeometry(0.092, 0.07, 0.04, low ? 12 : 16);
    bucket.rotateZ(-Math.PI / 2);
    put(bucket, 'intake', null, [H2_LAMP.x - 0.03, H2_LAMP.y, H2_LAMP.z * s]);
    // amber lamp sits on the front corner, inboard of the fender edge
    box(0.018, 0.036, 0.07, 0.004, 1, 'amber', [2.28, 0.98, s * 0.86]);
    const fog = new THREE.CylinderGeometry(0.052, 0.052, 0.024, low ? 12 : 16);
    fog.rotateZ(-Math.PI / 2);
    put(fog, 'fog', null, [2.375, 0.58, s * 0.58]);
    put(new THREE.TorusGeometry(0.064, 0.009, 5, 16).rotateY(Math.PI / 2), 'chrome', null, [2.382, 0.58, s * 0.58]);
    // tow hook
    const hook = new THREE.TorusGeometry(0.045, 0.012, 6, 12, Math.PI);
    hook.rotateY(Math.PI / 2); hook.rotateZ(Math.PI);
    put(hook, 'matte', null, [2.40, 0.50, s * 0.22]);
  }

  // bumper is the lower mass. It stops under the grille so the chrome reads full width.
  box(0.22, 0.50, 1.92, 0.05, low ? 2 : 3, 'matte', [2.24, 0.64, 0]);
  for (const s of [1, -1]) {
    put(surf(4, 5, (u, v) => {
      const ang = u * Math.PI / 2;
      const y = lerp(0.40, 0.90, v);
      const x = 2.16 + Math.sin(ang) * 0.20;
      const z = 1.02 - (1 - Math.cos(ang)) * 0.08;
      return [x, y, z * s];
    }), 'matte', [1, 0, s]);
  }
  box(0.10, 0.18, 1.72, 0.01, 1, 'matte', [2.26, 0.84, 0]);
  box(0.06, 0.16, 0.42, 0.01, 1, 'intake', [2.34, 0.56, 0]);
  for (let i = 0; i < 3; i++) box(0.01, 0.008, 0.34, 0.001, 1, 'gloss', [2.365, 0.51 + i * 0.04, 0]);
  // skid plate
  box(0.28, 0.035, 1.05, 0.008, 1, 'chrome', [2.10, 0.36, 0]);

  // ---- tailgate, rear bumper, lamps ----
  put(surf(low ? 8 : 12, 8, (u, v) => {
    const z = lerp(-0.82, 0.82, u), y = lerp(0.64, 1.44, v);
    return [-2.30, y, z];
  }), 'paint', [-1, 0, 0]);
  box(0.18, 0.32, 1.78, 0.04, low ? 2 : 3, 'matte', [-2.40, 0.52, 0]);
  box(0.04, 0.10, 0.36, 0.008, 1, 'intake', [-2.50, 0.48, 0]);
  for (const s of [1, -1]) {
    box(0.035, 0.42, 0.10, 0.012, 1, 'tail', [-2.325, 1.05, s * 0.78]);
    box(0.02, 0.07, 0.09, 0.008, 1, 'amber', [-2.33, 1.30, s * 0.78]);
    box(0.02, 0.06, 0.14, 0.006, 1, 'tail', [-2.50, 0.46, s * 0.62]);
  }

  // ---- roof is body color. Pillars are body color. Only the gasket is black. ----
  put(surf(low ? 14 : 20, low ? 6 : 8, (u, v) => {
    const x = lerp(1.08, -2.10, u), z = lerp(-0.84, 0.84, v);
    const crown = 0.028 * (1 - Math.min(1, (z / 0.90) ** 2));
    const drop = smooth(clamp((x - 0.70) / 0.38, 0, 1)) * 0.06;
    return [x, 1.90 + crown - drop, z];
  }), 'paint', [0, 1, 0]);
  // yellow header across the full roof, meeting the windshield
  put(surf(8, 3, (u, v) => {
    const z = lerp(-0.82, 0.82, u);
    return [lerp(1.02, 0.70, v), lerp(1.82, 1.90, v), z];
  }), 'paint', [0, 1, 0]);
  put(surf(6, 2, (u, v) => {
    const z = lerp(-0.72, 0.72, u);
    const e = rearGlassAt(0, 1);
    return [lerp(e[0] + 0.02, e[0] - 0.12, v), e[1] + v * 0.05, z];
  }), 'paint', [0, 1, 0]);
  put(surf(12, 1, (u, v) => {
    const e = windAt(u * 2 - 1, 1);
    return [e[0] + 0.01 + v * 0.012, e[1] - 0.006 + v * 0.016, e[2]];
  }), 'gloss', [0.4, 0.6, 0]);
  put(surf(12, 1, (u, v) => {
    const e = windAt(u * 2 - 1, 0);
    return [e[0] + 0.006, e[1] - 0.01 + v * 0.02, e[2]];
  }), 'gloss', [1, 0, 0]);

  const nuW = low ? 8 : 12, nvW = low ? 6 : 8;
  // dark cabin behind the glass, kept clear of the raked windshield and rear pane
  box(1.15, 0.38, 1.28, 0.01, 1, 'intake', [0.15, 1.64, 0]);
  box(1.15, 0.36, 1.20, 0.01, 1, 'intake', [-1.15, 1.64, 0]);
  put(surf(nuW, nvW, (u, v) => windAt(u * 2 - 1, v)), 'glass', null);
  // yellow caps over the windshield corners so the pillar meets the roof and the cowl
  for (const s of [1, -1]) {
    const top = windAt(s, 1), bot = windAt(s, 0);
    put(surf(2, 2, (u, v) => [
      top[0] + 0.015 - v * 0.07,
      top[1] - 0.03 + v * 0.09,
      top[2] + s * u * 0.14
    ]), 'paint', [0.2, 0.6, s]);
    put(surf(2, 2, (u, v) => [
      bot[0] + 0.02 - v * 0.02,
      bot[1] - 0.02 - v * 0.05,
      bot[2] + s * (u * 0.18)
    ]), 'paint', [0.5, -0.2, s]);
    const rt = rearGlassAt(s, 1), rb = rearGlassAt(s, 0);
    put(surf(2, 2, (u, v) => [
      rt[0] - 0.015 + v * 0.06,
      rt[1] - 0.02 + v * 0.08,
      rt[2] + s * u * 0.14
    ]), 'paint', [-0.3, 0.5, s]);
    put(surf(2, 3, (u, v) => {
      const e = rearGlassAt(s, v);
      return [e[0] - 0.01 + u * 0.03, e[1], e[2] + s * (0.005 + u * 0.09)];
    }), 'paint', [-0.4, 0.1, s]);
  }
  put(surf(8, 2, (u, v) => {
    const z = lerp(-0.72, 0.72, u);
    const e = rearGlassAt(0, 1);
    return [e[0] - 0.015 + v * 0.05, e[1] - 0.015 + v * 0.06, z];
  }), 'paint', [0, 1, 0]);
  // reveal just behind the pane, larger than the opening
  put(surf(nuW, nvW, (u, v) => {
    const p = windAt((u * 2 - 1) * 1.06, clamp(v * 1.06 - 0.03, 0, 1));
    p[0] -= 0.025;
    return p;
  }), 'gloss', [1, 0, 0]);
  put(surf(nuW, nvW, (u, v) => rearGlassAt(u * 2 - 1, v)), 'glass', null);
  put(surf(nuW, nvW, (u, v) => {
    const p = rearGlassAt((u * 2 - 1) * 1.06, clamp(v * 1.05 - 0.025, 0, 1));
    p[0] += 0.025;
    return p;
  }), 'gloss', [-1, 0, 0]);

  for (const s of [1, -1]) {
    // solid yellow A-pillar from the windshield edge across to the side glass
    put(surf(3, 8, (u, v) => {
      const win = windAt(s, v);
      const sideX = lerp(1.06, 0.82, v);
      return [lerp(win[0], sideX, u), win[1], lerp(win[2] + s * 0.01, 0.94 * s, u)];
    }), 'paint', [0.2, 0.35, s]);
    put(surf(1, 8, (u, v) => {
      const e = windAt(s, v);
      return [e[0] + 0.008, e[1], e[2] + s * (0.006 + u * 0.016)];
    }), 'gloss', [0.3, 0, s]);
    box(0.20, 0.14, 0.18, 0.012, 1, 'paint', [0.90, 1.78, s * 0.76]);
    // yellow sail. Stays out at the body until it tucks into the rear glass.
    put(surf(8, 6, (u, v) => {
      const y = lerp(1.40, 1.88, v);
      const x = lerp(-0.92, -2.08, u);
      const tuck = smooth(clamp((u - 0.62) / 0.38, 0, 1));
      const z = lerp(1.015, 0.68, tuck);
      return [x, y, z * s];
    }), 'paint', [-0.2, 0.5, s]);
    put(surf(1, 6, (u, v) => {
      const e = rearGlassAt(s, v);
      return [e[0] - 0.01, e[1], e[2] + s * (0.008 + u * 0.02)];
    }), 'gloss', [-0.4, 0, s]);

    // side glass. B-pillar sits forward of x=0.28 so the audit rays hit glass.
    const zg = 0.905 * s;
    const pane = (x0, y0, x1, y1, x2, y2, x3, y3) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([
        x0, y0, zg, x1, y1, zg, x2, y2, zg, x3, y3, zg
      ], 3));
      g.setIndex(s > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]);
      g.computeVertexNormals();
      put(g, 'glass', null);
    };
    pane(1.02, 1.48, 0.50, 1.48, 0.50, 1.78, 0.86, 1.80);
    pane(0.26, 1.48, -0.98, 1.48, -0.98, 1.74, 0.26, 1.78);
    // small quarter light, sitting on the sail
    {
      const zq = 1.03 * s;
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.Float32BufferAttribute([
        -1.18, 1.56, zq, -1.38, 1.60, zq, -1.30, 1.72, zq, -1.16, 1.70, zq
      ], 3));
      g.setIndex(s > 0 ? [0, 1, 2, 0, 2, 3] : [0, 2, 1, 0, 3, 2]);
      g.computeVertexNormals();
      put(g, 'glass', null);
    }
    // yellow rail closing the glass up to the roof
    put(surf(low ? 12 : 16, 2, (u, v) => {
      const x = lerp(1.05, -1.70, u);
      return [x, lerp(1.68, 1.90, v), lerp(1.00, 0.78, v) * s];
    }), 'paint', [0, 0.6, s]);
    // yellow B and C pillars, full greenhouse height
    box(0.12, 0.46, 0.06, 0.008, 1, 'paint', [0.38, 1.64, s * 0.98]);
    box(0.10, 0.46, 0.06, 0.008, 1, 'paint', [-1.04, 1.64, s * 0.98]);
    // gaskets, narrower than the pillars
    const rail = (w, h, x, y) => box(w, h, 0.018, 0.003, 1, 'gloss', [x, y, s * 0.925]);
    rail(0.58, 0.018, 0.74, 1.475); rail(0.52, 0.016, 0.70, 1.795);
    rail(0.018, 0.32, 1.02, 1.64); rail(0.016, 0.32, 0.50, 1.64);
    rail(1.20, 0.018, -0.36, 1.475); rail(1.20, 0.016, -0.36, 1.775);
    rail(0.016, 0.30, 0.26, 1.63); rail(0.016, 0.28, -0.98, 1.62);
    // door seams, proud of the skin so they don't dent the normals
    for (const x of [1.08, 0.32, -1.02]) box(0.006, 0.78, 0.008, 0.001, 1, 'intake', [x, 0.98, s * 1.028]);
    box(0.13, 0.028, 0.016, 0.005, 1, 'gloss', [0.62, 1.16, s * 1.03]);
    box(0.13, 0.028, 0.016, 0.005, 1, 'gloss', [-0.40, 1.16, s * 1.03]);
    box(0.045, 0.03, 0.012, 0.004, 1, s > 0 ? 'amber' : 'tail', [1.70, 0.95, s * 1.03]);
    // black mirror: short arm, black shell, reflective face
    box(0.045, 0.04, 0.09, 0.01, 1, 'gloss', [1.02, 1.50, s * 1.07]);
    box(0.18, 0.11, 0.07, 0.016, 2, 'gloss', [0.98, 1.56, s * 1.15]);
    put(new THREE.PlaneGeometry(0.13, 0.075), 'chrome', null, [0.975, 1.56, s * 1.188], [0, s > 0 ? -0.35 : 0.35, 0]);
    // running board
    const tube = new THREE.CylinderGeometry(0.028, 0.028, 2.15, low ? 8 : 10);
    tube.rotateZ(Math.PI / 2);
    put(tube, 'matte', null, [-0.15, 0.40, s * 1.05]);
    for (const x of [0.55, -0.55]) box(0.04, 0.10, 0.05, 0.008, 1, 'matte', [x, 0.46, s * 1.00]);
    box(0.015, 0.22, 0.16, 0.003, 1, 'matte', [RA - 0.52, 0.30, s * 0.78]);
  }
  // fuel door on the side the match camera sees
  put(new THREE.CircleGeometry(0.07, low ? 10 : 16), 'paint', null, [-1.55, 1.05, -1.02], [0, -Math.PI / 2, 0]);
  put(new THREE.TorusGeometry(0.074, 0.007, 6, 16).rotateY(-Math.PI / 2), 'gloss', null, [-1.55, 1.05, -1.028]);

  box(0.55, 0.012, 0.016, 0.002, 1, 'gloss', [1.22, 1.45, 0.22], [0.35, 0.15, 0.05]);
  box(0.48, 0.012, 0.016, 0.002, 1, 'gloss', [1.22, 1.44, -0.20], [-0.3, -0.1, -0.04]);

  // roof drip, black, only the edge. The panel above it stays yellow.
  for (const s of [1, -1]) {
    put(surf(16, 1, (u, v) => {
      const x = lerp(0.55, -1.70, u);
      return [x, lerp(1.845, 1.90, v), lerp(0.80, 0.74, v) * s];
    }), 'gloss', [0, 0.8, s]);
  }
  const roofY = (z) => 1.875 + 0.035 * (1 - Math.min(1, (z / 0.86) ** 2));
  for (const s of [-0.55, -0.28, 0, 0.28, 0.55]) box(0.05, 0.025, 0.06, 0.006, 1, 'amber', [0.95, roofY(s) + 0.02, s]);
  const paceMat = [0, 1].map(() => new THREE.MeshStandardMaterial({ color: 0xffb000, emissive: 0xffaa00, emissiveIntensity: 1.5, roughness: 0.35 }));
  const lamps = [], sprites = [], tex = glowTexture();
  const barY = roofY(0) + 0.02;
  box(0.12, 0.03, 0.58, 0.008, 1, 'gloss', [0.35, barY, 0]);
  for (const side of [1, -1]) {
    const pods = [];
    for (const k of [0, 1]) {
      const pod = new THREE.Mesh(beveledBox(0.10, 0.026, 0.13, 0.006, 2), paceMat[side > 0 ? 0 : 1]);
      pod.position.set(0.35, barY + 0.022, side * (0.09 + k * 0.15));
      pod.name = 'h2-pace-lamp'; pods.push(pod); group.add(pod);
    }
    lamps.push(pods[0]);
    const sp = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: 0xffb020, blending: THREE.AdditiveBlending, depthWrite: false, transparent: true, opacity: 0.5 }));
    sp.scale.setScalar(low ? 0.32 : 0.46); sp.position.set(0.35, barY + 0.04, side * 0.16); group.add(sp);
    if (!low || side > 0) sprites.push(sp); else sp.visible = false;
  }

  // ---- 35 in tire, rounded shoulder, deep-dish chunky alloy ----
  const seg = low ? 20 : 32;
  const treadGeo = revolve([
    [0.50, -0.04], [0.58, -0.30], [0.70, -0.46], [0.82, -0.50],
    [0.92, -0.42], [0.98, -0.24], [1, -0.10], [1, 0.10],
    [0.98, 0.24], [0.92, 0.42], [0.82, 0.50], [0.70, 0.46],
    [0.58, 0.30], [0.50, 0.04]
  ].map(([k, z]) => [TIRE_R * k, z * TIRE_W]), seg, (pt, i) => {
    const onTread = Math.abs(pt[1]) < TIRE_W * 0.16;
    return pt[0] - (onTread && (i % 3 === 0) ? 0.012 : 0);
  });
  const rimParts = [];
  const lip = new THREE.TorusGeometry(0.214, 0.020, low ? 6 : 8, seg);
  lip.translate(0, 0, 0.055); lip.computeVertexNormals(); rimParts.push(lip);
  const barrel = new THREE.TorusGeometry(0.205, 0.012, 5, seg);
  barrel.translate(0, 0, -0.01); rimParts.push(barrel);
  const cap = new THREE.CylinderGeometry(0.078, 0.070, 0.028, low ? 12 : 18);
  cap.rotateX(Math.PI / 2); cap.translate(0, 0, 0.078); rimParts.push(cap);
  const cap2 = new THREE.CylinderGeometry(0.046, 0.046, 0.012, low ? 10 : 14);
  cap2.rotateX(Math.PI / 2); cap2.translate(0, 0, 0.096); rimParts.push(cap2);
  const nSpoke = 6;
  for (let i = 0; i < nSpoke; i++) {
    const spoke = new THREE.BoxGeometry(0.155, 0.058, 0.042);
    spoke.translate(0.125, 0, 0.045);
    spoke.rotateZ(i / nSpoke * Math.PI * 2);
    rimParts.push(spoke);
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
  const spare = new THREE.Mesh(treadGeo, rubber); spare.name = 'h2-spare';
  spare.position.set(TAIL - 0.16, 1.08, 0); spare.rotation.y = -Math.PI / 2; group.add(spare);
  const spareRim = new THREE.Mesh(rimGeo, alloy); spareRim.name = 'h2-spare-rim';
  spareRim.position.copy(spare.position); spareRim.rotation.y = -Math.PI / 2; group.add(spareRim);
  box(0.05, 0.14, 0.14, 0.01, 1, 'matte', [TAIL + 0.02, 1.08, 0]);
  const discGeo = new THREE.CylinderGeometry(0.16, 0.16, 0.012, low ? 12 : 20);
  discGeo.rotateX(Math.PI / 2); discGeo.translate(0, 0, -0.02);
  const discs = new THREE.InstancedMesh(discGeo, intake, 4); discs.name = 'h2-rotor';
  spots.forEach(([x, z], i) => { Q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), z > 0 ? 0 : Math.PI); P.set(x, TIRE_R, z); M.compose(P, Q, S); discs.setMatrixAt(i, M); });
  discs.instanceMatrix.needsUpdate = true; discs.castShadow = !low; group.add(discs);

  const cv = document.createElement('canvas'); cv.width = 512; cv.height = 96;
  const ctx = cv.getContext('2d'); ctx.clearRect(0, 0, 512, 96);
  ctx.fillStyle = '#1a1408'; ctx.font = '800 54px Arial, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  ctx.fillText('PACE CAR', 256, 50);
  const labelTex = new THREE.CanvasTexture(cv); labelTex.colorSpace = THREE.SRGBColorSpace;
  const labelMat = new THREE.MeshBasicMaterial({ map: labelTex, transparent: true, alphaTest: 0.35, depthWrite: false });
  for (const s of [1, -1]) {
    const m = new THREE.Mesh(new THREE.PlaneGeometry(0.70, 0.10), labelMat);
    m.position.set(0.15, 1.20, s * 1.032); if (s < 0) m.rotation.y = Math.PI; m.name = 'h2-decal'; group.add(m);
  }

  const cast = !low;
  const names = { paint: 'h2-body', gloss: 'h2-gasket', matte: 'h2-trim', glass: 'h2-glass', chrome: 'h2-chrome', amber: 'h2-marker', fog: 'h2-fog', tail: 'h2-tail', intake: 'h2-intake' };
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
    halfLength: Math.max(NOSE, -TAIL) + 0.25, halfWidth: 1.22, bodyLength: L, bodyWidth: W, bodyHeight: H,
    grille: 'seven-vertical', lampsShape: 'round', triangles: Math.round(tris), drawCalls: draws
  };
}
