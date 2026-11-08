// Dirt late model, built to match a real super late model (see reference photo, not shipped):
//  - smooth lofted body panels (custom BufferGeometry grids with smooth normals, rolled top lips, bevelled bottoms)
//  - rounded wraparound nose, long raised hood and offset round air cleaner
//  - body sides with a slight belly, tumblehome above the body line and flared wheel arches, offset to the LEFT, raked
//  - open cockpit: curved clear lexan windshield, thin flat overhanging roof with a visor lip, cage tubes, seat, helmeted driver
//  - sail panels level with the roof back to a big angled rear spoiler with opaque side boards, rear quarter kick-up
//  - round-shouldered dirt tires (lettered outer sidewall) on satin 15 in deep-dish spun wheels with bead locks
//  - visible chassis under the body: frame rails, A-arms, coilovers, rear axle tube + links, headers out the right side
//  - 9 livery schemes painted on hi-res canvases (outlined door number, contingency decals, sponsors), clearcoat paint, mud, LOD
// All sponsor / tire / brand names here are invented. Fonts: Kanit + Archivo Black (SIL OFL 1.1, vendor/fonts).
import * as THREE from 'three';
import {installNightMud} from './night-race.js';

export const SPONSORS = ['CLAYMASTER TIRES', 'RED DIRT OIL', "HAULIN' HOGS BBQ", 'CUSHION CAM', 'BIG E FEED & SEED', 'LOOSE WHEEL PARTS', 'SLICK TRACK BREWING', 'BACKROADS DIESEL', 'GROOVE MASTER', 'NIGHT SHIFT ENERGY',
  'PRAIRIE GRAIN CO.', 'TWIN RIVERS EXCAVATING', 'BUCKSHOT TRUCKING', 'COPPERHEAD WELDING', 'MOONSHINE HOLLOW', 'TRI-COUNTY CONCRETE'];
// invented contingency decals: [bg, fg, text, style]
const CONT = [['#c81d25', '#fff', 'CLAYMASTER'], ['#111', '#f2c014', 'RIDGELINE SHOCKS'], ['#1e5fd8', '#fff', 'TORQWELL'], ['#fff', '#c81d25', 'SPARKFIRE'], ['#f2c014', '#111', 'STOPLINE BRAKES'],
  ['#111', '#fff', 'IRONHIDE CHASSIS'], ['#1f9e4a', '#fff', 'BLUE FLAME FUEL'], ['#fff', '#1e5fd8', 'HOTLAP HELMETS'], ['#ff6a00', '#111', 'COOLRUN'], ['#e8e8e8', '#111', 'DIRTCO BEARINGS'],
  ['#7a2bd1', '#fff', 'SLINGER GEARS'], ['#111', '#ff6a00', 'GRITGUARD'], ['#0b6e8a', '#fff', 'OZARK STEEL'], ['#fff', '#111', 'KNUCKLE PIPE'], ['#c81d25', '#f2c014', 'PRAIRIE LUBE'], ['#222', '#9fd6ff', 'QUIKLATCH']];
const TIRE_BRAND = 'CLAYMASTER';
const hex = c => '#' + new THREE.Color(c).getHexString();
const cv = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };
const ctex = (c, srgb = true) => { const limit=globalThis.DTT?.quality==='high'?2048:1024;if(c.width>limit){const scaled=cv(limit,Math.round(c.height*limit/c.width));scaled.getContext('2d').drawImage(c,0,0,scaled.width,scaled.height);c=scaled;}const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; return t; };
function hashStr(s) { let h = 2166136261; for (const ch of String(s)) { h ^= ch.charCodeAt(0); h = Math.imul(h, 16777619); } return h >>> 0; }
const lum = c => new THREE.Color(c).getHSL({}).l;
const FONT = (px, it = true) => `${it ? 'italic ' : ''}900 ${px}px Impact, "Arial Black", "Helvetica Neue", sans-serif`;

// ---------------------------------------------------------------- dimensions (x forward, y up, z to the RIGHT)
// measured off a real super late model: ~105 in wheelbase, ~1.4 m nose overhang with the nose almost on the ground,
// door top ~1.0-1.1 m, roof at the helmet line (~1.44 m), 28-29 in tall tires on 15 in deep-dish wheels
const ZL = -1.07, ZR = 0.93, ZC = (ZL + ZR) / 2, BW = ZR - ZL;        // body offset to the left
const XN = 2.72, XT = -2.48;                                            // nose tip / tail
const FW = { x: 1.32, r: 0.365, w: 0.3, rim: 0.19, ac: 0.35, ar: 0.425, ay: 0.415 }, RW = { x: -1.36, r: 0.375, w: 0.36, rim: 0.19, ac: 0.36, ar: 0.435, ay: 0.425 };
const Y_TIP = 0.34, X_COWL = 0.74, Y_COWL = .98, X_WR = -0.62, Y_SILL = 1.08, X_Q = -1.0, Y_Q = 1.41, Y_TAIL = 1.42;
const X_ROOF_F = 0.06, Y_ROOF_F = 1.445, X_ROOF_R = -1.12, Y_ROOF_R = 1.435;
const DRV_X = -0.32, DRV_Y = 1.24;                                      // driver's helmet
export const DRIVER_EYE = [DRV_X, DRV_Y + 0.01, -0.16];
export const WHEEL_R = 0.37;
const smooth = t => t <= 0 ? 0 : t >= 1 ? 1 : t * t * (3 - 2 * t);
function yTop(x) {                                                       // side top line: wedge nose -> window sill -> sail/quarter at roof height
  if (x >= X_COWL) { const t = Math.min(1,(XN-x)/1.04); return Y_TIP+.44*Math.sin(t*Math.PI/2)+(Y_COWL-Y_TIP-.44)*smooth((1.75-x)/(1.75-X_COWL))+.05*Math.exp(-(((x-1.55)/.65)**4)); }
  if (x >= X_WR) return Y_COWL + (X_COWL - x) / (X_COWL - X_WR) * (Y_SILL - Y_COWL);
  if (x >= X_Q) return Y_SILL + (Y_Q - Y_SILL) * smooth((X_WR - x) / (X_WR - X_Q));
  return Y_Q + (X_Q - x) / (X_Q - XT) * (Y_TAIL - Y_Q);
}
const archY = (x, W) => { const d = (x - W.x) / W.ar; return Math.abs(d) < 1 ? W.ac + W.ay * Math.sqrt(1 - d * d) : -1; };
function yBot(x) {                                                       // bottom edge of the side skin: rake, nose sweeping to the splitter, wheel arches, quarter kick-up
  let y = 0.17 + 0.07 * (XN - x) / (XN - XT);
  const xf = FW.x + FW.ar, xr = RW.x - RW.ar;
  if (x > xf) y = .115 + (FW.ac-.115)*(1-smooth((x-xf)/.16));
  if (x < xr) y += 0.13 * smooth((xr - x) / (xr - XT));
  return Math.max(y, archY(x, FW), archY(x, RW));
}
const deckY = x => 1.11 + 0.29 * smooth((X_ROOF_R - x) / (X_ROOF_R - XT));   // rear deck between the sails, rising to the spoiler
function bodyOff(x, y) {                                                 // outward offset of the side skin: belly, tumblehome above the body line, fender flares, nose taper
  // A nearly flat slab with a small beltline bevel, not a ballooned side.
  let o = .005 * Math.cos(Math.min(1, Math.abs(y - .55) / .5) * Math.PI / 2);
  o -= .022 * smooth((y - .94) / .46);
  for (const W of [FW, RW]) { const d = Math.hypot((x-W.x)/W.ar,(y-W.ac)/W.ay); o += .018*Math.exp(-(((d-1.06)/.14)**2))*smooth((y-W.ac+.08)/.12); }
  if (x > 1.95) o -= .085 * smooth((x-1.95)/(XN-1.95));
  return o;
}
const rollR = x => Math.min(0.023, (yTop(x) - yBot(x)) * 0.35);
const sideZ = (x, y, s, inset = 0) => s > 0 ? ZR + bodyOff(x, y) - inset : ZL - bodyOff(x, y) + inset;
const edgeZ = (x, s) => { const r = rollR(x); return sideZ(x, yTop(x) - r, s, r + 0.025); };   // inner edge of the rolled top lip (where the hood / deck meets it)
// side livery canvas mapping (meters -> canvas)
const SK = { W: 2048, H: 576, x0: XT - 0.05, len: XN - XT + 0.1, y0: 0.08, ht: 1.44 };

// ---------------------------------------------------------------- shared textures / env
let ENV = null;
function envTex() {   // HDR night-race reflection map (float equirect, PMREM-filtered by the renderer): dark sky, banks of light towers, lit clay below
  if (ENV) return ENV;
  const W = 1024, H = 512, d = new Float32Array(W * H * 4);
  let s = 12345; const R = () => { s = (s * 16807) % 2147483647; return s / 2147483647; };
  const towers = []; for (let i = 0; i < 9; i++) towers.push({ az: (i / 9) * Math.PI * 2 + (R() - 0.5) * 0.3, el: 0.2 + R() * 0.08, w: 0.07 + R() * 0.03 });
  for (let j = 0; j < H; j++) {
    const el = ((j + 0.5) / H - 0.5) * Math.PI;   // row 0 = bottom (v = 0)
    for (let i = 0; i < W; i++) {
      const az = (i + 0.5) / W * Math.PI * 2, k = (j * W + i) * 4;
      let r, g, b;
      if (el > 0) { const t = Math.pow(1 - el / (Math.PI / 2), 6); r = 0.006 + 0.07 * t; g = 0.008 + 0.06 * t; b = 0.016 + 0.05 * t; }
      else { const t = Math.pow(1 + el / (Math.PI / 2), 5); r = 0.02 + 0.13 * t; g = 0.014 + 0.085 * t; b = 0.01 + 0.055 * t; }
      if (el > 0 && el < 0.07) { const st = 0.05 * (0.6 + 0.4 * Math.sin(az * 40)); r += st; g += st; b += st * 1.1; }   // grandstands / walls
      for (const T of towers) {
        let da = Math.abs(az - T.az); da = Math.min(da, Math.PI * 2 - da); const de = el - T.el;
        if (Math.abs(da) < T.w && Math.abs(de) < 0.025) { r += 3.2; g += 3.0; b += 2.7; }
        const h = Math.exp(-(da * da) / 0.012 - (de * de) / 0.006) * 0.28; r += h; g += h * 0.92; b += h * 0.8;
        if (da < 0.012 && el > -0.1 && el < T.el) { r += 0.03; g += 0.03; b += 0.03; }                         // pole
      }
      d[k] = r; d[k + 1] = g; d[k + 2] = b; d[k + 3] = 1;
    }
  }
  const t = new THREE.DataTexture(d, W, H, THREE.RGBAFormat, THREE.FloatType); t.mapping = THREE.EquirectangularReflectionMapping; t.magFilter = THREE.LinearFilter; t.minFilter = THREE.LinearFilter; t.needsUpdate = true;
  ENV = t; return t;
}
let TREAD = null, SIDEWALL = null;
function treadTex() {   // grooved / siped dirt tread
  if (TREAD) return TREAD;
  const c = cv(1024, 128), g = c.getContext('2d'); g.fillStyle = '#3d3934'; g.fillRect(0, 0, 1024, 128);
  for (let i = 0; i < 128; i++) { const x = i * 8; g.fillStyle = '#242320'; g.fillRect(x, 20, 2, 88); if (i % 2) g.fillRect(x - 4, 62, 10, 3); }
  g.fillStyle = '#0e0e0e'; for (const y of [40, 86]) g.fillRect(0, y, 1024, 4);
  const gr = g.createLinearGradient(0, 0, 0, 128); gr.addColorStop(0, 'rgba(0,0,0,0.45)'); gr.addColorStop(0.18, 'rgba(0,0,0,0)'); gr.addColorStop(0.82, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.45)'); g.fillStyle = gr; g.fillRect(0, 0, 1024, 128);
  TREAD = ctex(c); TREAD.wrapS = THREE.RepeatWrapping; return TREAD;
}
function sidewallTex() {   // planar-projected onto the bulged outer sidewall: rubber + raised white letters (invented brand)
  if (SIDEWALL) return SIDEWALL;
  const S = 1024, c = cv(S, S), g = c.getContext('2d'); g.fillStyle = '#36332e'; g.fillRect(0, 0, S, S); g.translate(S / 2, S / 2);
  const R0 = S / 2;   // canvas radius == tire radius
  g.strokeStyle = '#2a2a2a'; g.lineWidth = 3; for (const f of [0.6, 0.93]) { g.beginPath(); g.arc(0, 0, R0 * f, 0, 7); g.stroke(); }
  g.textAlign = 'center'; g.textBaseline = 'middle';
  const ring = (word, a0, f, px, sp, col = '#f2f1ec') => { g.font = `${px}px "DTT Sans", "Arial Black", sans-serif`; [...word].forEach((ch, i) => { const a = a0 + (i - (word.length - 1) / 2) * sp; g.save(); g.rotate(a); g.translate(0, -R0 * f); g.fillStyle = col; g.fillText(ch, 0, 0); g.restore(); }); };
  ring(TIRE_BRAND, 0, 0.77, 72, 0.12); ring(TIRE_BRAND, Math.PI, 0.77, 72, 0.12);
  ring('LM-40  DIRT  92/15', Math.PI / 2, 0.79, 30, 0.052, '#bdbcb6'); ring('RACING ONLY', -Math.PI / 2, 0.79, 30, 0.06, '#bdbcb6');
  SIDEWALL = ctex(c); return SIDEWALL;
}
function netTexture() {
  const c = cv(256, 128), g = c.getContext('2d'); g.clearRect(0, 0, 256, 128);
  g.strokeStyle = '#111'; g.lineWidth = 7; g.strokeRect(4, 4, 248, 120);
  g.lineWidth = 4; for (let x = 0; x <= 256; x += 22) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x, 128); g.stroke(); }
  for (let y = 0; y <= 128; y += 22) { g.beginPath(); g.moveTo(0, y); g.lineTo(256, y); g.stroke(); }
  return ctex(c);
}
function textPanel(lines, w, h, bg, fg) {
  const c = cv(w, h), g = c.getContext('2d'); g.fillStyle = bg; g.fillRect(0, 0, w, h); g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  lines.forEach((l, i) => { g.font = FONT(h / lines.length * 0.72); g.fillText(l, w / 2, h / lines.length * (i + 0.55), w * 0.92); });
  return ctex(c);
}
function mudCanvas(seed, kind = 'side') {
  const W = kind === 'deck' ? 512 : 1024, H = kind === 'deck' ? 512 : 256;
  const c = cv(W, H), g = c.getContext('2d'); let s = seed || 7;
  const R = () => { s ^= s << 13; s >>>= 0; s ^= s >> 17; s ^= s << 5; s >>>= 0; return (s % 10000) / 10000; };
  for (let i = 0; i < (kind === 'deck' ? 1300 : 900); i++) {
    let x, y, rr;
    if (kind === 'deck') { const f = Math.pow(R(), 0.6); x = (1 - f) * W; y = R() * H; rr = 3 + R() * 12 * (0.4 + f); }   // nose: heaviest at the leading edge (u = 1)
    else { const yb = kind === 'side' ? Math.pow(R(), 0.55) : R(); x = R() * W; y = kind === 'side' ? H - yb * 230 : yb * H; rr = (kind === 'glass' ? 2 : 3) + R() * (kind === 'glass' ? 9 : 14) * (kind === 'side' ? (1 - yb * 0.6) : 1); }
    const a = kind === 'glass' ? 0.35 + R() * 0.5 : 0.45 + R() * 0.5;
    if (kind === 'glass' && R() < 0.55 && y < 150 && x > 180 && x < 844) continue;
    g.fillStyle = `rgba(${100 + R() * 40 | 0},${58 + R() * 20 | 0},${34 + R() * 14 | 0},${a})`;
    g.beginPath(); g.ellipse(x, y, rr * (1 + R()), rr, R() * 3, 0, 7); g.fill();
    if (R() < 0.25 && kind !== 'deck') g.fillRect(x, y, 2 + R() * 3, -(8 + R() * 24));
  }
  if (kind === 'side') { const gr = g.createLinearGradient(0, H, 0, 120); gr.addColorStop(0, 'rgba(110,62,36,0.85)'); gr.addColorStop(1, 'rgba(110,62,36,0)'); g.fillStyle = gr; g.fillRect(0, 120, W, H - 120); }
  if (kind === 'deck') { const gr = g.createLinearGradient(0, 0, W * 0.45, 0); gr.addColorStop(0, 'rgba(110,62,36,0.9)'); gr.addColorStop(1, 'rgba(110,62,36,0)'); g.fillStyle = gr; g.fillRect(0, 0, W, H); }
  return ctex(c);
}

// ---------------------------------------------------------------- liveries (one unique scheme per car)
// fonts: vendored OFL fonts (Kanit Black Italic for numbers, Archivo Black for sponsor lettering), see vendor/fonts
let FONTS = null;
export function loadCarFonts() {
  if (FONTS) return FONTS;
  // The static release keeps the OFL fonts in CSS data URLs, with no binary fetches.
  let link=document.querySelector('link[data-dtt-fonts]');
  if(!link){link=document.createElement('link');link.rel='stylesheet';link.href=new URL('../css/fonts.css',import.meta.url).href;link.dataset.dttFonts='';document.head.append(link);}
  const ready=link.sheet?Promise.resolve():new Promise(resolve=>{link.addEventListener('load',resolve,{once:true});link.addEventListener('error',resolve,{once:true});});
  FONTS = Promise.race([ready.then(()=>Promise.all([document.fonts.load('16px "DTT Num"'),document.fonts.load('16px "DTT Sans"')])).catch(()=>{}),new Promise(r=>setTimeout(r,2500))]);
  return FONTS;
}
const NUMF = px => `${px}px "DTT Num", Impact, "Arial Black", sans-serif`;
const SANS = px => `${px}px "DTT Sans", "Arial Black", Impact, sans-serif`;
const WHITE = '#efeee8', INK = '#121316';
const plum = c => { const k = new THREE.Color(c); return 0.2126 * k.r + 0.7152 * k.g + 0.0722 * k.b; };   // perceived (linear) luminance
export const LIVERY_NAMES = ['Swoosh', 'Split', 'Stripes', 'Scallops', 'Fade', 'Shards', 'Blade', 'Retro', 'Classic 42'];
function palette(color, accent, seed, third) {
  const c = new THREE.Color(color), a = new THREE.Color(accent);
  let t = new THREE.Color(third ?? [0x111214, 0xf2c014, 0xc81d25, 0x1e5fd8, 0xefeee8][seed % 5]);
  if (t.equals(c) || t.equals(a)) t = new THREE.Color(plum(color) > 0.35 ? 0x111214 : 0xefeee8);
  const light = plum(color) > 0.35, accLight = plum(accent) > 0.35;
  return {
    base: hex(c), acc: hex(a), third: hex(t), light,
    ink: light ? INK : WHITE, line: light ? WHITE : INK,                       // general lettering + its outline
    numFill: light ? (accLight ? INK : hex(a)) : (accLight ? hex(a) : WHITE), numIn: hex(t), numOut: light ? INK : INK,
  };
}
function drawText(g, t, x, y, maxW, h, fill, stroke, opt = {}) {
  g.save(); g.translate(x, y); if (opt.skew) g.transform(1, 0, opt.skew, 1, 0, 0); if (opt.rot) g.rotate(opt.rot);
  g.font = opt.num ? NUMF(h) : SANS(h * 0.82); g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  const w = Math.min(maxW, g.measureText(t).width), sx = g.measureText(t).width > maxW ? maxW / g.measureText(t).width : 1;
  if (opt.box) { const bw = w + h * 0.55; g.fillStyle = opt.box; g.beginPath(); g.roundRect(-bw / 2, -h * 0.6, bw, h * 1.2, h * 0.16); g.fill(); if (opt.boxLine) { g.lineWidth = h * 0.07; g.strokeStyle = opt.boxLine; g.stroke(); } }
  g.scale(sx, 1);
  if (opt.shadow) { g.fillStyle = 'rgba(0,0,0,0.45)'; g.fillText(t, h * 0.05 / sx, h * 0.05); }
  if (stroke) { g.lineWidth = h * (opt.sw || 0.14) / Math.max(0.5, sx); g.strokeStyle = stroke; g.strokeText(t, 0, 0); }
  g.fillStyle = fill; g.fillText(t, 0, 0); g.restore();
}
// big door / roof / tail number: drop shadow + outer dark outline + colored inner outline + fill
function drawNumber(g, num, x, y, h, maxW, P, skew = 0) {
  g.save(); g.translate(x, y); if (skew) g.transform(1, 0, skew, 1, 0, 0);
  g.font = NUMF(h); g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineJoin = 'round';
  const mw = g.measureText(num).width, sx = mw > maxW ? maxW / mw : 1; g.scale(sx, 1);
  const L = (w, col, dx = 0, dy = 0) => { g.lineWidth = h * w; g.strokeStyle = col; g.strokeText(num, dx, dy); };
  L(0.2, 'rgba(0,0,0,0.5)', h * 0.06, h * 0.05);                    // drop shadow
  L(0.2, P.numOut); L(0.13, P.numIn); L(0.045, P.numOut);
  g.fillStyle = P.numFill; g.fillText(num, 0, 0);
  const gr = g.createLinearGradient(0, -h * 0.5, 0, h * 0.5); gr.addColorStop(0, 'rgba(255,255,255,0.18)'); gr.addColorStop(0.5, 'rgba(255,255,255,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.12)'); g.fillStyle = gr; g.fillText(num, 0, 0);
  g.restore();
}
function contDecal(g, d, cx, cy, w, h) {
  g.fillStyle = d[0]; g.beginPath(); g.roundRect(cx - w / 2, cy - h / 2, w, h, h * 0.18); g.fill(); g.strokeStyle = 'rgba(255,255,255,0.35)'; g.lineWidth = Math.max(1, h * 0.05); g.stroke();
  g.fillStyle = d[1]; g.font = SANS(h * 0.5); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(d[2], cx, cy + h * 0.03, w - h * 0.3);
}
// path in meters: pts = [[x,y], ['C', x1,y1, x2,y2, x,y], ...]
function mpath(g, X, Y, pts) { g.beginPath(); pts.forEach((p, i) => { if (p[0] === 'C') g.bezierCurveTo(X(p[1]), Y(p[2]), X(p[3]), Y(p[4]), X(p[5]), Y(p[6])); else if (i) g.lineTo(X(p[0]), Y(p[1])); else g.moveTo(X(p[0]), Y(p[1])); }); }
const SCHEMES = [
  (g, X, Y, P, M) => {   // 0 swoosh: band sweeping from the low nose up over the door to the top of the rear quarter (like the reference car)
    const lo = [[2.8, 0.17], ['C', 1.7, 0.24, 0.3, 0.42, -2.6, 1.02]], up = [[-2.6, 1.42], ['C', -0.9, 1.06, 1.1, 0.52, 2.8, 0.28]];
    mpath(g, X, Y, [...lo, ...up]); g.closePath(); g.fillStyle = P.acc; g.fill();
    mpath(g, X, Y, [[0.9, 0.2], ['C', -0.4, 0.3, -1.6, 0.5, -2.6, 0.8], [-2.6, 0.2]]); g.closePath(); g.fillStyle = P.third; g.fill();   // low third-color wedge on the rear quarter
    g.lineWidth = 0.03 * M; g.strokeStyle = P.third; mpath(g, X, Y, [[2.8, 0.13], ['C', 1.7, 0.2, 0.3, 0.38, -2.6, 0.97]]); g.stroke();
    g.lineWidth = 0.012 * M; mpath(g, X, Y, [[2.8, 0.33], ['C', 1.1, 0.57, -0.9, 1.11, -2.6, 1.47]]); g.stroke();
  },
  (g, X, Y, P, M) => {   // 1 split: accent front half, forward-leaning slash, base rear half
    mpath(g, X, Y, [[2.9, 0], [-0.62, 0], [0.08, 1.6], [2.9, 1.6]]); g.closePath(); g.fillStyle = P.acc; g.fill();
    g.fillStyle = P.third; mpath(g, X, Y, [[-0.62, 0], [-0.74, 0], [-0.04, 1.6], [0.08, 1.6]]); g.closePath(); g.fill();
    g.fillStyle = P.acc; mpath(g, X, Y, [[-0.86, 0], [-0.92, 0], [-0.22, 1.6], [-0.16, 1.6]]); g.closePath(); g.fill();
  },
  (g, X, Y, P, M) => {   // 2 stripes: triple raked stripes along the body line
    const c = (dy, w, col) => { g.lineWidth = w * M; g.strokeStyle = col; mpath(g, X, Y, [[2.85, 0.27 + dy], ['C', 1.2, 0.5 + dy, -0.6, 0.76 + dy, -2.6, 1.0 + dy]]); g.stroke(); };
    c(0.0, 0.11, P.acc); c(0.1, 0.04, P.third); c(0.17, 0.05, P.acc);
  },
  (g, X, Y, P, M) => {   // 3 scallops: tongues reaching back from the nose
    for (let i = 3; i >= 0; i--) {
      const yc = 0.38 + i * 0.16, th = 0.15, tip = -0.35 - i * 0.42;
      const s = [[2.9, yc + th / 2], ['C', 1.3, yc + th / 2, tip + 0.6, yc + th * 0.45, tip, yc + 0.03], ['C', tip + 0.6, yc - th * 0.4, 1.3, yc - th / 2, 2.9, yc - th / 2]];
      mpath(g, X, Y, s); g.closePath(); g.lineWidth = 0.035 * M; g.strokeStyle = P.third; g.stroke(); g.fillStyle = i % 2 ? P.acc : P.acc; g.fill();
    }
  },
  (g, X, Y, P, M) => {   // 4 fade: accent lower body with a halftone dot fade up into the base color
    const yl = x => 0.36 + (2.8 - x) / 5.4 * 0.42;
    mpath(g, X, Y, [[2.9, 0], [2.9, yl(2.9)], [-2.6, yl(-2.6)], [-2.6, 0]]); g.closePath(); g.fillStyle = P.acc; g.fill();
    g.fillStyle = P.acc; const st = 0.032;
    for (let x = -2.6; x < 2.9; x += st) for (let k = 0; k < 10; k++) { const y = yl(x) + (k + 0.5) * st, r = st * 0.55 * (1 - k / 10); g.beginPath(); g.arc(X(x + (k % 2) * st / 2), Y(y), r * M, 0, 7); g.fill(); }
    g.lineWidth = 0.022 * M; g.strokeStyle = P.third; mpath(g, X, Y, [[2.9, yl(2.9) - 0.04], [-2.6, yl(-2.6) - 0.04]]); g.stroke();
  },
  (g, X, Y, P, M) => {   // 5 shards: sharp tears from the rear quarter forward
    const sh = [[-2.6, 0.5, 0.95, 0.6], [-2.6, 0.95, 1.3, 0.05], [-2.6, 0.2, 0.5, 1.0], [-2.6, 1.15, 1.45, -0.55]];
    sh.forEach(([x0, y0, y1, tip], i) => { mpath(g, X, Y, [[x0, y0], [tip, (y0 + y1) / 2 + 0.05], [x0, y1]]); g.closePath(); g.fillStyle = i % 2 ? P.third : P.acc; g.fill(); });
    mpath(g, X, Y, [[2.9, 0.1], [2.9, 0.4], [1.5, 0.3], [0.3, 0.1]]); g.closePath(); g.fillStyle = P.acc; g.fill();
  },
  (g, X, Y, P, M) => {   // 6 blade: accent wedge low along the body, rising to the rear, pinstriped
    const top = [[2.9, 0.22], ['C', 1.4, 0.3, -0.2, 0.5, -2.6, 1.05]];
    mpath(g, X, Y, [[2.9, 0], ...top, [-2.6, 0]]); g.closePath(); g.fillStyle = P.acc; g.fill();
    g.lineWidth = 0.028 * M; g.strokeStyle = P.third; mpath(g, X, Y, [[2.9, 0.27], ['C', 1.4, 0.35, -0.2, 0.55, -2.6, 1.1]]); g.stroke();
  },
  (g, X, Y, P, M) => {   // 7 retro: classic straight band through the body line with pinstripes
    g.fillStyle = P.acc; g.fillRect(0, Y(0.86), g.canvas.width, Y(0.6) - Y(0.86));
    g.fillStyle = P.third; for (const y of [0.9, 0.56]) g.fillRect(0, Y(y + 0.012), g.canvas.width, 0.024 * M);
  },
];
// Classic 42: a paint-only tribute to the supplied blue/white stock-car reference.
// These tiny businesses are fictional; no photographed sponsor logos are reproduced.
const CLASSIC_CONT=[['#fff','#d21f35','CLAYVOLT',0],['#151b21','#f3f030','RUTLINE',0],['#fff','#135bc4','TORQFIN',1],['#e92535','#fff','FIREPIN',1],['#fff','#142124','LAPNOVA',0],['#f6e72b','#1450b6','DIRTFLUX',2],['#fff','#cb2034','SLIDEWORKS',0],['#135bc4','#fff','HOLLOWARC',0],['#fff','#232c35','GRIPSPAR',0],['#cf222b','#fff','MUDLINE',0],['#fff','#1553b4','NIGHTCLAY',1],['#1d252b','#e9f528','SILTSTRIKE',0]];
function classicDecal(g,d,x,y,w,h){
 g.save();g.translate(x,y);g.fillStyle=d[0];g.strokeStyle='#263d5860';g.lineWidth=Math.max(1,h*.04);g.beginPath();
 if(d[3]===1)g.ellipse(0,0,w*.5,h*.5,0,0,Math.PI*2);else if(d[3]===2){g.moveTo(-w*.5,0);g.lineTo(-w*.25,-h*.5);g.lineTo(w*.5,-h*.5);g.lineTo(w*.25,h*.5);g.lineTo(-w*.5,h*.5);g.closePath();}else g.roundRect(-w*.5,-h*.5,w,h,h*.06);
 g.fill();g.stroke();g.font=SANS(h*.49);g.textAlign='center';g.textBaseline='middle';g.fillStyle=d[1];g.fillText(d[2],0,h*.04,w*.94);g.restore();
}
function classicNumber(g,num,x,y,h,maxW,blue,skew=0){
 g.save();g.translate(x,y);if(skew)g.transform(1,0,skew,1,0,0);g.font=NUMF(h);g.textAlign='center';g.textBaseline='middle';g.lineJoin='round';const sx=Math.min(1,maxW/g.measureText(num).width);g.scale(sx,1);
 g.strokeStyle='#0b224b70';g.lineWidth=h*.12;g.strokeText(num,h*.035,h*.04);
 g.strokeStyle=blue;g.lineWidth=h*.10;g.strokeText(num,0,0);g.fillStyle='#f7ef23';g.fillText(num,0,0);g.restore();
}
function classicSide(L){
 const c=cv(SK.W,SK.H),g=c.getContext('2d'),right=L.side>0,M=SK.W/SK.len;
 const X=x=>(right?(x-SK.x0)/SK.len:1-(x-SK.x0)/SK.len)*SK.W,Y=y=>(1-(y-SK.y0)/SK.ht)*SK.H;
 const P=palette(L.color,L.accent,L.seed,L.third);g.fillStyle=P.base;g.fillRect(0,0,c.width,c.height);
 mpath(g,X,Y,[[2.12,0],[2.12,1.6],[2.9,1.6],[2.9,0]]);g.closePath();g.fillStyle=P.acc;g.fill();
 // Neon rocker follows the lower sheet metal, but never circles the wheel openings.
 for(const[a,b]of[[-2.52,-1.81],[-.91,.88],[1.77,2.12]]){const path=[];for(let j=0;j<=22;j++){const x=a+(b-a)*j/22;path.push([x,yBot(x)+.018]);}for(let j=22;j>=0;j--){const x=a+(b-a)*j/22;path.push([x,yBot(x)+.073]);}mpath(g,X,Y,path);g.closePath();g.fillStyle='#c5f12c';g.fill();}
 classicNumber(g,L.num,X(-.19),Y(.67),.78*M,1.38*M,P.acc,right?0:.42);
 // Door/fender contingencies: two dense columns beside the number, then a forward fender stack.
 for(let r=0;r<6;r++)for(let col=0;col<2;col++)classicDecal(g,CLASSIC_CONT[(r*2+col)%CLASSIC_CONT.length],X(.60+col*.255),Y(.93-r*.09),.235*M,.071*M);
 for(let r=0;r<6;r++)classicDecal(g,CLASSIC_CONT[(r*3+2)%CLASSIC_CONT.length],X(1.94),Y(.77-r*.084),.255*M,.067*M);
 drawText(g,'FUDGE',X(-2.08),Y(1.10),.52*M,.12*M,P.acc,null);drawText(g,'RACING',X(-2.08),Y(.99),.52*M,.07*M,P.acc,null);
 return c;
}
function liveryCanvas({ color, accent, num, sponsor, sponsor2, name, seed, side, scheme, third }) {
  if(scheme===8)return classicSide({color,accent,num,name,seed,side,third});
  const c = cv(SK.W, SK.H), g = c.getContext('2d'), right = side > 0;
  const X = x => { const f = (x - SK.x0) / SK.len; return (right ? f : 1 - f) * SK.W; };
  const Y = y => (1 - (y - SK.y0) / SK.ht) * SK.H;
  const M = SK.W / SK.len, P = palette(color, accent, seed, third);
  g.fillStyle = P.base; g.fillRect(0, 0, SK.W, SK.H);
  SCHEMES[scheme % SCHEMES.length](g, X, Y, P, M);
  // soft light falloff toward the rocker (the geometry does the real shading)
  const gr = g.createLinearGradient(0, Y(0.9), 0, Y(0.1)); gr.addColorStop(0, 'rgba(0,0,0,0)'); gr.addColorStop(1, 'rgba(0,0,0,0.16)'); g.fillStyle = gr; g.fillRect(0, 0, SK.W, SK.H);
  // dark rocker + nose-piece edge
  mpath(g, X, Y, [[2.9, 0], [2.9, 0.16], [2.0, 0.28], [-2.6, 0.32], [-2.6, 0]]); g.closePath(); g.fillStyle = INK; g.fill();
  g.fillStyle = '#9aa0a8'; mpath(g, X, Y, [[2.9, 0.16], [2.0, 0.28], [-2.6, 0.32], [-2.6, 0.305], [2.0, 0.265], [2.9, 0.145]]); g.closePath(); g.fill();
  // door number (between the wheels), leaning forward on both sides
  drawNumber(g, num, X(-0.02), Y(0.68), 0.5 * M, 1.25 * M, P, right ? 0 : 0.42);
  // Original contingency row, shared stylistic vocabulary across the whole field.
  for(let i=0;i<4;i++)classicDecal(g,CLASSIC_CONT[(Math.abs(Math.floor(seed||0))+i)%CLASSIC_CONT.length],X(.75),Y(.94-i*.09),.24*M,.065*M);
  // main sponsor on the rear quarter, secondary on the lower door
  drawText(g, sponsor, X(-1.72), Y(1.15), 1.2 * M, 0.2 * M, P.ink, P.line, { shadow: true });
  drawText(g, sponsor2, X(-0.02), Y(0.385), 1.2 * M, 0.075 * M, WHITE, null, { box: INK, boxLine: P.third });
  // contingency clusters: nose side, behind the rear wheel
  let k = seed;
  for (let r = 0; r < 3; r++) for (let j = 0; j < 3 - (r === 2 ? 1 : 0); j++) contDecal(g, CONT[(k++) % CONT.length], X(2.42 - j * 0.2 - r * 0.07), Y(0.47 - r * 0.065 + j * 0.03), 0.18 * M, 0.05 * M);
  for (let r = 0; r < 2; r++) for (let j = 0; j < 2; j++) contDecal(g, CONT[(k += 3) % CONT.length], X(-2.06 - j * 0.24), Y(0.72 - r * 0.07), 0.22 * M, 0.058 * M);
  // driver name along the window sill
  g.save(); g.font = SANS(0.042 * M); g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillStyle = P.ink; g.fillText((name || '').toUpperCase(), X(DRV_X), Y(yTop(DRV_X) - 0.06), 0.8 * M); g.restore();
  return c;
}
function deckCanvas({ color, accent, num, sponsor, seed, scheme, third }) {   // hood: canvas x 0 = nose tip .. 1 = cowl, canvas top = right side
  const W = 1024, H = 640, c = cv(W, H), g = c.getContext('2d'), P = palette(color, accent, seed, third);
  g.fillStyle = P.base; g.fillRect(0, 0, W, H);
  if(scheme===8){g.fillStyle=P.acc;g.fillRect(0,0,W,H);return c;}
  if (scheme === 1 || scheme === 4 || scheme === 6) { g.fillStyle = P.acc; g.fillRect(0, 0, W * 0.32, H); }
  // twin hood stripes running back to the windshield
  g.fillStyle = P.acc; for (const y of [H * 0.2, H * 0.74]) g.fillRect(0, y, W, H * 0.06); g.fillStyle = P.third; for (const y of [H * 0.27, H * 0.71]) g.fillRect(0, y, W, H * 0.02);
  const pc = P.light ? INK : (plum(accent) > 0.35 ? P.acc : WHITE);
  g.fillStyle = pc; g.beginPath(); g.roundRect(W * 0.2, H * 0.34, W * 0.66, H * 0.32, 26); g.fill(); g.lineWidth = 8; g.strokeStyle = P.third; g.stroke();
  drawText(g, sponsor, W * 0.53, H * 0.5, W * 0.6, 130, plum(pc) > 0.35 ? INK : WHITE, null);
  g.fillStyle = INK; g.fillRect(0, 0, 26, H);   // nose-piece edge
  for (const hv of [H * 0.18, H * 0.82]) { g.fillStyle = '#e8e8e4'; g.beginPath(); g.ellipse(70, hv, 30, 60, 0, 0, 7); g.fill(); g.fillStyle = '#7f98b0'; g.beginPath(); g.ellipse(70, hv, 18, 40, 0, 0, 7); g.fill(); }   // headlight stickers
  return c;
}
function tailCanvas({ color, accent, num, sponsor, seed, third, scheme }) {
  const c = cv(512, 256), g = c.getContext('2d'), P = palette(color, accent, seed, third);
  g.fillStyle = P.base; g.fillRect(0, 0, 512, 256); g.fillStyle = INK; g.fillRect(0, 214, 512, 42);
  if(scheme===8){g.fillStyle='#c5f12c';g.fillRect(0,226,512,20);classicNumber(g,num,256,118,140,330,P.acc);return c;}
  for (const tx of [60, 452]) { g.fillStyle = '#3a0000'; g.beginPath(); g.roundRect(tx - 44, 26, 88, 34, 8); g.fill(); g.fillStyle = '#e21c1c'; g.beginPath(); g.roundRect(tx - 38, 31, 76, 24, 6); g.fill(); }
  drawNumber(g, num, 256, 120, 130, 300, P);
  drawText(g, sponsor, 256, 232, 440, 30, WHITE, null);
  return c;
}
function spoilerCanvas({ color, accent, sponsor, seed, third }, back) {
  const c = cv(1024, 256), g = c.getContext('2d'), P = palette(color, accent, seed, third);
  g.fillStyle = P.base; g.fillRect(0, 0, 1024, 256);
  g.fillStyle = P.acc; g.fillRect(0, 0, 1024, 34); g.fillStyle = P.third; g.fillRect(0, 34, 1024, 10);
  drawText(g, sponsor, 512, 135, 900, 100, P.ink, P.line, { shadow: true });
  if (!back) { let k = seed + 2; for (let j = 0; j < 5; j++) contDecal(g, CONT[(k += 7) % CONT.length], 130 + j * 190, 224, 170, 38); }
  return c;
}
function roofCanvas({ color, accent, num, name, seed, third, scheme }) {   // canvas x 0 = front (visor) .. 1 = rear, top = right side
  const c = cv(512, 512), g = c.getContext('2d'), P = palette(color, accent, seed, third);
  g.fillStyle = P.base; g.fillRect(0, 0, 512, 512); g.fillStyle = INK; g.fillRect(0, 0, 44, 512);   // dark visor lip
  g.fillStyle = P.acc; g.fillRect(44, 0, 18, 512);
  if(scheme===8){g.fillStyle=P.acc;g.fillRect(0,0,512,512);classicNumber(g,num,280,256,300,400,'#093579');return c;}
  drawNumber(g, num, 290, 256, 300, 400, P);
  return c;
}
function windshieldCanvas({ sponsor, name, scheme, accent }) {   // canvas x across (as seen from the front), top = roof edge
  const c = cv(512, 256), g = c.getContext('2d');
  g.fillStyle = 'rgba(200,215,232,0.12)'; g.fillRect(0, 0, 512, 256);
  if(scheme===8){g.fillStyle=hex(accent);g.fillRect(0,0,512,64);drawText(g,(name||'Jayden Fudge').toUpperCase(),256,33,478,39,'#f6f6ee',null);return c;}
  g.fillStyle = 'rgba(10,10,12,0.96)'; g.fillRect(0, 0, 512, 27);
  drawText(g, sponsor, 256, 14, 470, 20, WHITE, null);
  return c;
}

// ---------------------------------------------------------------- geometry helpers
function basis(mesh, xv, yv) {
  const X = new THREE.Vector3(...xv).normalize(), Y = new THREE.Vector3(...yv).normalize(), Z = new THREE.Vector3().crossVectors(X, Y).normalize();
  mesh.quaternion.setFromRotationMatrix(new THREE.Matrix4().makeBasis(X, Y, Z)); return mesh;
}
export function tube(a, b, r, mat, seg = 6) {
  const A = new THREE.Vector3(...a), B = new THREE.Vector3(...b), d = B.clone().sub(A), L = d.length();
  const m = new THREE.Mesh(new THREE.CylinderGeometry(r, r, L, seg), mat);
  m.position.copy(A).addScaledVector(d, 0.5); m.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), d.normalize()); return m;
}
// merge every mesh under `grp` that shares a material into one mesh (fewer draw calls for the static chassis/cage parts)
function bake(grp, cast = true) {
  grp.updateMatrixWorld(true);
  const inv = new THREE.Matrix4().copy(grp.matrixWorld).invert(), byMat = new Map();
  grp.traverse(o => { if (!o.isMesh) return; const m = new THREE.Matrix4().multiplyMatrices(inv, o.matrixWorld); let g = o.geometry.index ? o.geometry.toNonIndexed() : o.geometry.clone(); g.applyMatrix4(m);
    if (m.determinant() < 0) { const p = g.attributes.position.array, n = g.attributes.normal?.array, uv = g.attributes.uv?.array; for (let i = 0; i < p.length; i += 9) for (const [arr, st] of [[p, 3], [n, 3], [uv, 2]]) { if (!arr) continue; const a = i / 3 * st + st, b = i / 3 * st + 2 * st; for (let k = 0; k < st; k++) { const t = arr[a + k]; arr[a + k] = arr[b + k]; arr[b + k] = t; } } }
    if (!byMat.has(o.material)) byMat.set(o.material, []); byMat.get(o.material).push(g); });
  const out = new THREE.Group();
  for (const [mat, gs] of byMat) {
    let n = 0; for (const g of gs) n += g.attributes.position.count;
    const P = new Float32Array(n * 3), N = new Float32Array(n * 3), U = new Float32Array(n * 2); let o3 = 0, o2 = 0;
    for (const g of gs) { P.set(g.attributes.position.array, o3); if (g.attributes.normal) N.set(g.attributes.normal.array, o3); if (g.attributes.uv) U.set(g.attributes.uv.array, o2); o3 += g.attributes.position.count * 3; o2 += g.attributes.position.count * 2; g.dispose(); }
    const geo = new THREE.BufferGeometry(); geo.setAttribute('position', new THREE.BufferAttribute(P, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(N, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(U, 2));
    geo.computeBoundingSphere(); const mesh = new THREE.Mesh(geo, mat); mesh.castShadow = cast; out.add(mesh);
  }
  return out;
}
const sideUV = (geo, right) => { const p = geo.attributes.position, uv = geo.attributes.uv; for (let i = 0; i < p.count; i++) { const f = (p.getX(i) - SK.x0) / SK.len; uv.setXY(i, right ? f : 1 - f, (p.getY(i) - SK.y0) / SK.ht); } return geo; };
function flipZ(geo) {   // mirror to the left side and keep the winding facing outward
  geo = geo.index ? geo.toNonIndexed() : geo; geo.applyMatrix4(new THREE.Matrix4().makeScale(1, 1, -1)); return revWind(geo);
}
function revWind(geo) {  // reverse triangle winding (inner faces)
  geo = geo.index ? geo.toNonIndexed() : geo;
  const p = geo.attributes.position.array, uv = geo.attributes.uv.array;
  for (let i = 0; i < p.length / 3; i += 3) { for (let k = 0; k < 3; k++) { const t = p[(i + 1) * 3 + k]; p[(i + 1) * 3 + k] = p[(i + 2) * 3 + k]; p[(i + 2) * 3 + k] = t; } for (let k = 0; k < 2; k++) { const t = uv[(i + 1) * 2 + k]; uv[(i + 1) * 2 + k] = uv[(i + 2) * 2 + k]; uv[(i + 2) * 2 + k] = t; } }
  geo.computeVertexNormals(); return geo;
}
// grid surface: f(u, v) -> [x, y, z]; faces the side given by the winding (up for decks)
function surf(f, nu, nv, uvf = (u, v) => [u, v]) {
  const P = [], U = [], I = [];
  for (let i = 0; i <= nu; i++) for (let j = 0; j <= nv; j++) { P.push(...f(i / nu, j / nv)); U.push(...uvf(i / nu, j / nv)); }
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) { const a = i * (nv + 1) + j, b = a + nv + 1; I.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I); g.computeVertexNormals(); return g;
}
function quadGeo(a, b, c, d) {   // a-b-c-d counter-clockwise seen from the front; uv (0,0) at a, (1,0) at b, (1,1) at c
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute([...a, ...b, ...c, ...d], 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute([0, 0, 1, 0, 1, 1, 0, 1], 2)); g.setIndex([0, 1, 2, 0, 2, 3]); g.computeVertexNormals(); return g;
}
// ---------------------------------------------------------------- body panels (smooth lofted grids, shared by every car; cached per LOD level)
function gridGeo(cols, rows, P, U, flip) {
  const I = [];
  for (let i = 0; i < cols - 1; i++) for (let j = 0; j < rows - 1; j++) { const a = i * rows + j, b = a + rows; if (flip) I.push(a, a + 1, b, b, a + 1, b + 1); else I.push(a, b, a + 1, b, b + 1, a + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setIndex(I); g.computeVertexNormals(); g.computeBoundingSphere(); return g;
}
// side skin: bottom edge follows the wheel arches (no holes), slight belly + tumblehome + fender flares, top lip rolled inward
function sideGeo(s, nx, nv, inner = false) {
  const xs = []; for (let i = 0; i <= nx; i++) xs.push(XT + (XN - XT) * i / nx);
  for (const W of [FW, RW]) for (const e of [W.x - W.ar, W.x + W.ar]) xs.push(e - 2e-3, e + 2e-3);
  for (let i = 0; i <= 24; i++) for (const W of [FW, RW]) xs.push(W.x + W.ar * Math.cos(Math.PI * i / 24));   // denser along the arches
  xs.sort((a, b) => a - b);
  const P = [], U = [], NR = inner ? 2 : 5;
  for (const x of xs) {
    const yb = yBot(x), yt = yTop(x), rr = rollR(x), yc = yt - rr, ins = inner ? 0.007 : 0;
    const col = [[yb, yb, 0.016], [yb + 0.01, yb + 0.01, 0.003]];
    for (let j = 0; j <= nv; j++) { const y = yb + 0.02 + (yc - yb - 0.02) * j / nv; col.push([y, y, 0]); }
    for (let k = 1; k <= NR; k++) { const a = k / NR * Math.PI / 2; col.push([yc + rr * Math.sin(a), yc, rr * (1 - Math.cos(a))]); }
    col.push([yt, yc, rr + 0.025]);
    for (const [y, yo, inset] of col) { P.push(noseSideX(x), y - (inner ? 0.004 : 0), sideZ(x, yo, s, inset + ins)); const f = (x - SK.x0) / SK.len; U.push(s > 0 ? f : 1 - f, (y - SK.y0) / SK.ht); }
  }
  const rows = P.length / 3 / xs.length;
  return gridGeo(xs.length, rows, P, U, (s < 0) !== inner);
}
// hood / nose: crowned, rounded at the tip in plan view, meets the side lips
const noseBow = v => -.26 + .29 * Math.sqrt(Math.max(0,1-(2*v-1)**4));
const noseSideX = x => x-.26*smooth((x-1.95)/(XN-1.95));
const hoodY = (x,v) => {const u=(XN-x)/(XN-X_COWL);return yTop(x)-.06*Math.sin(Math.PI*v)**.3*Math.exp(-(((x-1.55)/.65)**4))+.018*Math.sin(Math.PI*v)*smooth(u*3)+.075*smooth((u-.1)/.22)*(1-smooth((u-.82)/.18))*smooth((v-.14)/.14)*smooth((.86-v)/.14);};
function hoodGeo(nu, nv) {
  const P = [], U = [];
  for (let i = 0; i <= nu; i++) { const u = i / nu, x0 = XN - u * (XN - X_COWL), zl = edgeZ(x0, -1), zr = edgeZ(x0, 1), y0 = yTop(x0);
    for (let j = 0; j <= nv; j++) { const v = j / nv; P.push(x0 + noseBow(v) * smooth((x0-1.95)/(XN-1.95)), hoodY(x0,v), zl + (zr - zl) * v); U.push(u, v); } }
  return gridGeo(nu + 1, nv + 1, P, U, false);
}
function noseFrontGeo(nv) { // rolled bumper/valance; tangent to the rounded hood
  const P=[],U=[],nr=18,y1=yTop(XN);
  for(let i=0;i<=nr;i++) {const u=i/nr,y=.115+(y1-.115)*u,a=smooth((u-.8)/.2);
    const zl=sideZ(XN,y,-1)*(1-a)+edgeZ(XN,-1)*a,zr=sideZ(XN,y,1)*(1-a)+edgeZ(XN,1)*a;
    for(let j=0;j<=nv;j++){const v=j/nv;P.push(XN+noseBow(v)+.004+.13*Math.sin(Math.PI*u)*Math.sin(Math.PI*v)**.4,y,zl+(zr-zl)*v);U.push(.02,v);}
  }
  return gridGeo(nr+1,nv+1,P,U,false);
}
function deckGeo(nu, nv) {   // rear deck between the sails
  const P = [], U = [], x0 = X_ROOF_R + 0.04;
  for (let i = 0; i <= nu; i++) { const u = i / nu, x = x0 - u * (x0 - XT); for (let j = 0; j <= nv; j++) { const v = j / nv; P.push(x, deckY(x) + 0.015 * Math.sin(Math.PI * v), ZL + 0.035 + v * (BW - 0.07)); U.push(u, v); } }
  return gridGeo(nu + 1, nv + 1, P, U, false);
}
function tailGeo() {
  const P = [], U = [], yb = yBot(XT) + 0.0, yd = deckY(XT);
  for (let i = 0; i <= 2; i++) { const u = i / 2, y = yb + (yd - yb) * u; for (let j = 0; j <= 8; j++) { const v = j / 8, zl = sideZ(XT, y, -1, 0.01), zr = sideZ(XT, y, 1, 0.01); P.push(XT + 0.004, y, zr - (zr - zl) * v); U.push(1 - v, u); } }
  return gridGeo(3, 9, P, U, false);
}
const RZL = ZL + 0.06, RZR = ZR - 0.06, RZC = (RZL + RZR) / 2;
function roofGeo(nu, nv, under = false) {   // thin flat overhanging roof with a rounded edge and a turned-down visor lip at the front
  const P = [], U = [];
  for (let i = 0; i <= nu; i++) { const u = i / nu, x = X_ROOF_F + 0.06 - u * (X_ROOF_F + 0.06 - X_ROOF_R), yb = Y_ROOF_F + (Y_ROOF_R - Y_ROOF_F) * u;
    for (let j = 0; j <= nv; j++) { const v = j / nv, cr = Math.pow(Math.sin(Math.PI * v), 0.35);
      const y = under ? yb - 0.018 : yb + 0.006 * cr - 0.014 * Math.pow(Math.max(0, 1 - u / 0.07), 2);
      P.push(x, y, RZL + v * (RZR - RZL)); U.push(u, v); } }
  return gridGeo(nu + 1, nv + 1, P, U, under);
}
function windshieldGeo() {
  const P = [], U = [], x0 = X_COWL - 0.02, y0 = Y_COWL + 0.01, x1 = X_ROOF_F + 0.035, y1 = Y_ROOF_F - 0.015, L = Math.hypot(x1 - x0, y1 - y0), n = [(y1 - y0) / L, -(x1 - x0) / L];
  for (let i = 0; i <= 6; i++) { const u = i / 6; for (let j = 0; j <= 12; j++) { const v = j / 12, b = 0.03 * Math.sin(Math.PI * v) * Math.sin(Math.PI * Math.min(1, u * 1.2 + 0.1));
    const zl = edgeZ(X_COWL, -1) + 0.02 + (RZL + 0.03 - edgeZ(X_COWL, -1) - 0.02) * u, zr = edgeZ(X_COWL, 1) - 0.02 + (RZR - 0.03 - edgeZ(X_COWL, 1) + 0.02) * u;
    P.push(x0 + (x1 - x0) * u + n[0] * b, y0 + (y1 - y0) * u + n[1] * b, zl + (zr - zl) * v); U.push(1 - v, u); } }
  return gridGeo(7, 13, P, U, false);
}
function splitterGeo() {   // molded nose piece / splitter almost on the ground, following the nose in plan view, lip just proud of the body
  const x0 = XN - 0.75, n = 36, pts = [];
  for (let i = 0; i <= n; i++) { const x = x0 + (XN - x0) * i / n; pts.push([noseSideX(x), sideZ(x, 0.13, 1) + 0.012]); }
  const zR = sideZ(XN, 0.13, 1) + 0.012, zL = sideZ(XN, 0.13, -1) - 0.012;
  for (let j = 1; j < 64; j++) { const v = 1 - j / 64; pts.push([XN + noseBow(v) + 0.03, zL + (zR - zL) * v]); }
  for (let i = n; i >= 0; i--) { const x = x0 + (XN - x0) * i / n; pts.push([noseSideX(x), sideZ(x, 0.13, -1) - 0.012]); }
  const sh = new THREE.Shape(pts.map(([x, z]) => new THREE.Vector2(x, z)));
  const g = new THREE.ExtrudeGeometry(sh, { depth: 0.016, bevelEnabled: true, bevelThickness: 0.006, bevelSize: 0.006, bevelSegments: 4, curveSegments: 8 });
  g.rotateX(Math.PI / 2); g.translate(0, 0.122, 0);
  // Earcut can emit zero-area cap triangles where the rounded nose becomes
  // collinear at Float32 precision. Drop them rather than normalizing (0,0,0)
  // in a real GPU shader -- a possible source of driver-specific fireflies.
  const p=g.attributes.position,keep=[];
  for(let i=0;i<p.count;i+=3){const ax=p.getX(i+1)-p.getX(i),ay=p.getY(i+1)-p.getY(i),az=p.getZ(i+1)-p.getZ(i),bx=p.getX(i+2)-p.getX(i),by=p.getY(i+2)-p.getY(i),bz=p.getZ(i+2)-p.getZ(i);if(Math.hypot(ay*bz-az*by,az*bx-ax*bz,ax*by-ay*bx)>1e-10)keep.push(i,i+1,i+2);}
  const clean=new THREE.BufferGeometry();for(const [name,a]of Object.entries(g.attributes)){const values=new Float32Array(keep.length*a.itemSize);keep.forEach((v,i)=>{for(let j=0;j<a.itemSize;j++)values[i*a.itemSize+j]=a.array[v*a.itemSize+j];});clean.setAttribute(name,new THREE.BufferAttribute(values,a.itemSize));}g.dispose();return clean;
}
const GEO = {};
function bodyGeos(level) {
  if (GEO[level]) return GEO[level];
  const hi = level === 'hi';
  const G = {
    sideR: sideGeo(1, hi ? 80 : 48, hi ? 6 : 4), sideL: sideGeo(-1, hi ? 80 : 48, hi ? 6 : 4),
    hood: hoodGeo(hi ? 40 : 24, hi ? 18 : 10), front: noseFrontGeo(hi ? 48 : 24), deck: deckGeo(hi ? 10 : 4, hi ? 12 : 4), tail: tailGeo(),
    roof: roofGeo(hi ? 18 : 6, hi ? 20 : 6), splitter: splitterGeo(),
  };
  if (hi) Object.assign(G, { inR: sideGeo(1, 90, 3, true), inL: sideGeo(-1, 90, 3, true), roofU: roofGeo(4, 4, true), ws: windshieldGeo() });
  return (GEO[level] = G);
}


// ---------------------------------------------------------------- the car
export function makeLateModel({ color = 0xc81d25, accent = 0xffffff, num = '1', sponsor, name = '', cockpit = false, livery = {}, cageColor } = {}) {
  const seed = hashStr(`${num}|${color}|${accent}|${sponsor || ''}`);
  sponsor = sponsor || SPONSORS[seed % SPONSORS.length];
  const sponsor2 = SPONSORS[(seed + 7) % SPONSORS.length] === sponsor ? SPONSORS[(seed + 8) % SPONSORS.length] : SPONSORS[(seed + 7) % SPONSORS.length];
  const L = { color, accent, num: String(num), sponsor, sponsor2, name, seed, scheme: livery.scheme ?? 4, third: livery.third };
  const env = null; // use the actual scene sky/environment instead of a fixed night-only map
  const root = new THREE.Group(), hi = new THREE.Group(), lo = new THREE.Group();
  const lod = new THREE.LOD(); lod.addLevel(hi, 0); lod.addLevel(lo, 55); root.add(lod);

  // materials
  const PAINT = { roughness: 0.4, metalness: 0.04, clearcoat: 0.4, clearcoatRoughness: 0.32, envMap: env, envMapIntensity: 0.85 };
  const SKIN = 0.84;   // canvas whites under floodlights + bloom blew out at 1.0
  const paint = new THREE.MeshPhysicalMaterial({ color, ...PAINT });
  const skinR = new THREE.MeshPhysicalMaterial({ map: ctex(liveryCanvas({ ...L, side: 1 })), ...PAINT });
  const skinL = new THREE.MeshPhysicalMaterial({ map: ctex(liveryCanvas({ ...L, side: -1 })), ...PAINT });
  const bluePaint=L.scheme===8?{...PAINT,roughness:.38,clearcoat:.42,clearcoatRoughness:.36,envMapIntensity:.16}:PAINT;
  const deckM = new THREE.MeshPhysicalMaterial({ map: ctex(deckCanvas(L)), ...bluePaint });
  const tailM = new THREE.MeshPhysicalMaterial({ map: ctex(tailCanvas(L)), ...PAINT });
  const roofM = new THREE.MeshPhysicalMaterial({ map: ctex(roofCanvas(L)), ...bluePaint });
  const spF = new THREE.MeshPhysicalMaterial({ map: ctex(spoilerCanvas(L, false)), ...PAINT });
  const spB = new THREE.MeshPhysicalMaterial({ map: ctex(spoilerCanvas(L, true)), ...PAINT });
  const skins = [skinR, skinL, deckM, tailM, roofM, spF, spB];
  const inner = new THREE.MeshStandardMaterial({ color: 0x6d7278, metalness: .30, roughness: .74, envMap: env, envMapIntensity:.65 });
  const alu = new THREE.MeshStandardMaterial({ color: 0xc9ced4, metalness: 0.35, roughness: 0.65, envMap: env, envMapIntensity: 0.65 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xa1a7ad, metalness: 0.38, roughness: 0.64, envMap: env, envMapIntensity: 0.65 });
  const steel = new THREE.MeshStandardMaterial({ color: cageColor ?? livery.cageColor ?? (plum(accent)>.7 ? 0xc92127 : accent), metalness: 0.15, roughness: 0.7, envMap: env, envMapIntensity: 0.65 });
  const chassisM = new THREE.MeshStandardMaterial({ color: new THREE.Color(accent).lerp(new THREE.Color(0x222222), 0.55), metalness: .25, roughness: .74, envMap: env, envMapIntensity:.1 });
  const springM = new THREE.MeshStandardMaterial({ color: [0xd92b2b, 0x2a62d8, 0xf2c014, 0x1f9e4a][seed % 4], metalness: 0.4, roughness: 0.4 });
  const header = new THREE.MeshStandardMaterial({ color: 0x93918a, metalness: .45, roughness: .68, envMap: env, envMapIntensity:.08 });
  const black = new THREE.MeshStandardMaterial({ color: 0x292724, roughness: 0.9 });
  const splitM = new THREE.MeshStandardMaterial({ color: 0x454649, roughness: .8, metalness: .02, envMapIntensity: .06 });

  // ---- body: smooth lofted panels (shared cached geometry), livery canvases UV-mapped straight onto them
  const BG = bodyGeos('hi'), BL = bodyGeos('lo');
  const mk = (geo, mat, shadow = true) => { const m = new THREE.Mesh(geo, mat); m.castShadow = shadow; m.receiveShadow = shadow; return m; };
  const sideR = mk(BG.sideR, skinR), sideL = mk(BG.sideL, skinL), inR = mk(BG.inR, inner, false), inL = mk(BG.inL, inner, false);
  sideR.name='late-model-right-panel';sideL.name='late-model-left-panel';
  const nose = mk(BG.hood, deckM), noseFace = mk(BG.front, deckM), rear = mk(BG.deck, paint), tail = mk(BG.tail, tailM);
  noseFace.name='late-model-nose-valance';
  const split = mk(BG.splitter, splitM);
  const roof = mk(BG.roof, roofM), roofU = mk(BG.roofU, black, false);
  const roofNum = roof;   // number is painted on the roof itself
  // nose trim strip along the leading edge + the lower edge of the nose sides
  const trimM = new THREE.MeshStandardMaterial({ color: 0x5b5d60, metalness: .15, roughness: .72, envMap: env, envMapIntensity: .65 });
  const trimPts = []; for (let j = 0; j <= 16; j++) { const v = j / 16; trimPts.push(new THREE.Vector3(XN + noseBow(v) + 0.006, yTop(XN) - 0.004, edgeZ(XN, -1) + (edgeZ(XN, 1) - edgeZ(XN, -1)) * v)); }
  const trim = mk(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(trimPts), 24, 0.008, 6), trimM, false);
  const sideTrim = [-1, 1].map(s => { const pts = []; for (let i = 0; i <= 12; i++) { const x = FW.x + FW.ar + 0.02 + (XN - FW.x - FW.ar - 0.02) * i / 12; pts.push(new THREE.Vector3(noseSideX(x), yBot(x) + 0.004, sideZ(x, yBot(x), s, 0.012))); } return mk(new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), 16, 0.007, 5), trimM, false); });
  // windshield (clear lexan with a banner across the top)
  const wsM = new THREE.MeshPhysicalMaterial({ map: ctex(windshieldCanvas(L)), transparent: true, roughness: .65, metalness: 0, specularIntensity: .12, envMap: env, envMapIntensity: .65, side: THREE.DoubleSide, depthWrite: false });
  const ws = new THREE.Mesh(BG.ws, wsM); ws.renderOrder = 3;
  // big angled rear spoiler with side boards
  const spA = 0.6, spH = 0.285, SD = [-Math.sin(spA), Math.cos(spA), 0];
  const spBase = new THREE.Vector3(XT + 0.02, deckY(XT) - 0.01, ZC), spTop = spBase.clone().add(new THREE.Vector3(SD[0] * spH, SD[1] * spH, 0)), spMid = spBase.clone().lerp(spTop, 0.5);
  const spFront = basis(mk(new THREE.PlaneGeometry(BW + 0.02, spH), spF), [0, 0, -1], SD); spFront.position.copy(spMid);
  const spBack = basis(mk(new THREE.PlaneGeometry(BW + 0.02, spH), spB), [0, 0, 1], SD); spBack.position.copy(spMid).add(new THREE.Vector3(-SD[1], SD[0], 0).multiplyScalar(0.006));
  const braceGeo = new THREE.ShapeGeometry(new THREE.Shape([[XT + 0.55, Y_TAIL - 0.01], [XT + 0.02, Y_TAIL - 0.01], [spTop.x, spTop.y], [spTop.x + 0.12, spTop.y]].map(p => new THREE.Vector2(...p))));
  const braceM = new THREE.MeshStandardMaterial({color,roughness:.62,metalness:0,envMap:env,envMapIntensity:.12,side:THREE.DoubleSide});
  const braces = [ZL + 0.045, ZR - 0.045].map(z => { const b = new THREE.Mesh(braceGeo, braceM); b.position.z = z; b.renderOrder = 3; return b; });
  hi.add(sideR, sideL, inR, inL, nose, noseFace, rear, tail, split, roof, roofU, trim, ...sideTrim, ws, spFront, spBack, ...braces);
  // low-detail copy for distant cars: coarse versions of the same panels, no inner skins / trim / chassis / decal layers
  const loBody = [[BL.sideR, skinR], [BL.sideL, skinL], [BL.hood, deckM], [BL.front, deckM], [BL.deck, paint], [BL.tail, tailM], [BL.roof, roofM], [BL.splitter, splitM]].map(([g, m]) => mk(g, m));
  lo.add(...loBody, spFront.clone(), spBack.clone(), ...braces.map(b=>b.clone()));
  // Molded base, short cylindrical filter and softly rolled lid, offset left.
  const scoopPaint=L.scheme===8?new THREE.MeshPhysicalMaterial({color:0x252b30,...PAINT,roughness:.62}):paint;
  const scoop=new THREE.Group(),sx=1.38,sz=-.34,sy=hoodY(sx,(sz-edgeZ(sx,-1))/(edgeZ(sx,1)-edgeZ(sx,-1)));
  const scoopBase=new THREE.Mesh(new THREE.SphereGeometry(1,40,20),scoopPaint);scoopBase.scale.set(.36,.065,.265);scoopBase.position.set(sx,sy+.018,sz);scoop.add(scoopBase);
  const filter=new THREE.Mesh(new THREE.CylinderGeometry(.176,.184,.10,24),black);filter.position.set(sx,sy+.10,sz);scoop.add(filter);
  const lid=new THREE.Mesh(new THREE.CylinderGeometry(.205,.205,.027,28),scoopPaint);lid.position.set(sx,sy+.162,sz);scoop.add(lid);
  const rim=new THREE.Mesh(new THREE.TorusGeometry(.193,.013,6,28),scoopPaint);rim.rotation.x=Math.PI/2;rim.position.set(sx,sy+.176,sz);scoop.add(rim);
  hi.add(scoop);lo.add(scoop.clone());

  // ---- mud layers (fade in with ud.mud)
  // Body mud is now part of the original panel shader. Do not build/upload
  // 24 redundant splatter canvases or draw 40 transparent panels for an 8-car pack.
  const mudMats=[]; // retained diagnostic API; windshield mud remains independent.

  // ---- chassis visible under the body: rails, A-arms, coilovers, rear axle + links, driveshaft, headers, nerf bars, bumpers
  const ch = new THREE.Group();
  const zr0 = ZC - 0.36, zr1 = ZC + 0.36;
  for (const z of [zr0, zr1]) { ch.add(tube([2.25, 0.3, z * 0.9], [0.9, 0.3, z], 0.035, chassisM)); ch.add(tube([0.9, 0.3, z], [-1.9, 0.38, z], 0.04, chassisM)); ch.add(tube([-1.9, 0.38, z], [-2.55, 0.5, z * 0.9], 0.035, chassisM)); }
  for (const x of [1.9, 1.0, 0.2, -0.9, -1.9]) ch.add(tube([x, 0.31 + (x < 0 ? -x * 0.03 : 0), zr0], [x, 0.31 + (x < 0 ? -x * 0.03 : 0), zr1], 0.028, chassisM));
  const wheelsDef = [[FW, .70, 1, true], [FW, -.86, -1, true], [RW, .91, 1, false], [RW, -.85, -1, false]]; // physical tire locations are unchanged
  for (const [W_, wz, sz, front] of wheelsDef) {
    const fz = sz > 0 ? zr1 : zr0, hz = wz - sz * (W_.w / 2 + 0.03);
    if (front) {   // double A-arms + coilover
      ch.add(tube([W_.x + 0.2, 0.22, fz], [W_.x, 0.24, hz], 0.018, chassisM)); ch.add(tube([W_.x - 0.22, 0.22, fz], [W_.x, 0.24, hz], 0.018, chassisM));
      ch.add(tube([W_.x + 0.16, 0.56, fz], [W_.x, 0.56, hz], 0.016, chassisM)); ch.add(tube([W_.x - 0.16, 0.56, fz], [W_.x, 0.56, hz], 0.016, chassisM));
      ch.add(tube([W_.x, 0.2, hz], [W_.x, 0.6, hz], 0.03, steel));   // spindle upright
      const top = [W_.x - 0.05, 0.78, fz], bot = [W_.x - 0.02, 0.26, (fz + hz) / 2]; ch.add(tube(top, bot, 0.024, alu, 10));
      const sp = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(Array.from({ length: 49 }, (_, i) => { const t = i / 48, a = t * Math.PI * 14; return new THREE.Vector3(Math.cos(a) * 0.055, t * 0.3, Math.sin(a) * 0.055); })), 96, 0.009, 5);
      const spm = new THREE.Mesh(sp, springM); spm.position.set(...bot); spm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...top).sub(new THREE.Vector3(...bot)).normalize()); spm.translateY(0.12); ch.add(spm);
    } else {      // trailing links + birdcage + coilover
      ch.add(tube([W_.x, 0.44, hz], [W_.x + 0.95, 0.34, fz], 0.02, chassisM)); ch.add(tube([W_.x, 0.6, hz], [W_.x + 0.7, 0.7, fz], 0.018, chassisM));
      const top = [W_.x - 0.08, 0.98, fz], bot = [W_.x - 0.06, 0.48, hz + sz * 0.1]; ch.add(tube(top, bot, 0.026, alu, 10));
      const sp = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(Array.from({ length: 49 }, (_, i) => { const t = i / 48, a = t * Math.PI * 12; return new THREE.Vector3(Math.cos(a) * 0.065, t * 0.28, Math.sin(a) * 0.065); })), 96, 0.011, 5);
      const spm = new THREE.Mesh(sp, springM); spm.position.set(...bot); spm.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), new THREE.Vector3(...top).sub(new THREE.Vector3(...bot)).normalize()); spm.translateY(0.14); ch.add(spm);
    }
  }
  ch.add(tube([RW.x, RW.r, ZL + 0.2], [RW.x, RW.r, ZR + 0.06], 0.045, steel, 10));   // rear axle tube
  const qc = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.26, 0.22), alu); qc.position.set(RW.x - 0.04, RW.r, ZC + 0.05); ch.add(qc);
  const qcCover = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.13, 0.05, 16), steel); qcCover.rotation.z = Math.PI / 2; qcCover.position.set(RW.x - 0.21, RW.r + 0.02, ZC + 0.05); ch.add(qcCover);
  ch.add(tube([0.85, 0.4, ZC + 0.05], [RW.x + 0.15, RW.r, ZC + 0.05], 0.035, alu, 10));   // driveshaft
  const eng = new THREE.Mesh(new THREE.BoxGeometry(0.55, 0.42, 0.52), steel); eng.position.set(1.12, 0.55, ZC + 0.05); ch.add(eng);
  const pan = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.12, 0.48), black); pan.position.set(1.12, 0.25, ZC + 0.05); ch.add(pan);
  for (const z of [ZL + 0.04, ZR - 0.04]) ch.add(tube([0.88, 0.3, z], [-0.82, 0.32, z], 0.024, alu, 8));   // nerf bars
  for (const x of [0.88, 0.0, -0.82]) for (const [z0, z1] of [[ZL + 0.04, zr0], [ZR - 0.04, zr1]]) ch.add(tube([x, 0.3, z0], [x, 0.31, z1], 0.018, alu));
  ch.add(tube([XT - 0.06, 0.52, ZL + 0.1], [XT - 0.06, 0.52, ZR - 0.1], 0.03, alu, 8));   // rear bumper
  for (const z of [ZL + 0.12, ZR - 0.12]) ch.add(tube([XT - 0.06, 0.52, z], [XT + 0.5, 0.42, z * 0.6], 0.025, alu));
  // headers: four chrome pipes out the right side behind the front wheel into a collector
  const hdr = new THREE.Group();
  for (let i = 0; i < 4; i++) {
    const x0 = 1.3 - i * 0.12, c = new THREE.CatmullRomCurve3([new THREE.Vector3(x0, 0.6, ZC + 0.28), new THREE.Vector3(0.88 - i * 0.08, 0.52, ZR - 0.12), new THREE.Vector3(0.76 - i * 0.07, 0.4, ZR + 0.06), new THREE.Vector3(0.5 - i * 0.03, 0.33 + i * 0.015, ZR + 0.1 + (i % 2) * 0.04), new THREE.Vector3(0.1, 0.33, ZR + 0.12)]);
    hdr.add(new THREE.Mesh(new THREE.TubeGeometry(c, 24, 0.028, 8), header));
  }
  const coll = tube([0.1, 0.33, ZR + 0.12], [-0.6, 0.31, ZR + 0.12], 0.05, header, 12); hdr.add(coll);
  ch.add(hdr);
  hi.add(bake(ch));

  // ---- roll cage (visible through the open cockpit), seat, driver
  const cageMat = new THREE.MeshStandardMaterial({ color: cageColor ?? livery.cageColor ?? (plum(accent)>.7 ? 0xc92127 : accent), metalness: 0.15, roughness: 0.7, envMap: env, envMapIntensity: 0.65 });
  const cg = new THREE.Group();
  const CZL = RZL + 0.07, CZR = RZR - 0.07, YRF = Y_ROOF_F - 0.03, YRR = Y_ROOF_R - 0.03;
  for (const z of [CZL, CZR]) {
    cg.add(tube([X_COWL - 0.04, Y_COWL - 0.02, z + (z < 0 ? -0.06 : 0.06)], [X_ROOF_F, YRF, z], 0.022, cageMat));   // front downtubes (A-pillars)
    cg.add(tube([X_ROOF_F, YRF, z], [X_ROOF_R, YRR, z], 0.022, cageMat));                                // roof rails
    cg.add(tube([X_ROOF_R, YRR, z], [X_ROOF_R - 0.08, 0.42, z], 0.024, cageMat));                          // main hoop legs
    cg.add(tube([X_ROOF_R, YRR, z], [-1.95, 0.62, z * 0.7], 0.02, cageMat));                               // rear braces
    cg.add(tube([X_ROOF_F, YRF, z], [X_ROOF_F - 0.05, 0.45, z], 0.02, cageMat));                           // front hoop legs
  }
  cg.add(tube([X_ROOF_F, YRF, CZL], [X_ROOF_F, YRF, CZR], 0.022, cageMat));
  cg.add(tube([X_ROOF_R, YRR, CZL], [X_ROOF_R, YRR, CZR], 0.024, cageMat));
  cg.add(tube([X_ROOF_R, YRR, CZL], [X_ROOF_R - 0.08, 0.5, CZR], 0.02, cageMat));       // diagonal in the main hoop
  for (const y of [0.62, 0.86]) cg.add(tube([0.7, y, ZL + 0.08], [-0.95, y + 0.02, ZL + 0.08], 0.024, cageMat));   // left door bars
  cg.add(tube([0.7, 0.62, ZL + 0.08], [-0.95, 0.88, ZL + 0.08], 0.02, cageMat));
  cg.add(tube([0.7, 0.6, ZR - 0.08], [-0.95, 0.62, ZR - 0.08], 0.024, cageMat));
  const floorP = new THREE.Mesh(new THREE.BoxGeometry(1.9, 0.02, BW - 0.04), inner); floorP.position.set(-0.05, 0.4, ZC); cg.add(floorP);
  const bulk = new THREE.Mesh(new THREE.BoxGeometry(0.02, 0.45, BW - 0.04), inner); bulk.position.set(0.78, 0.62, ZC); cg.add(bulk);
  for(const z of Array.from({length:8},(_,i)=>CZL+.1+i*.17))cg.add(tube([X_COWL-.045,Y_COWL+.015,z],[X_ROOF_F+.025,YRF-.006,z],.009,cageMat,10)); // thin windshield guard rods
  const cage = bake(cg);
  hi.add(cage);
  // aluminum containment seat
  const seatG = new THREE.Group();
  const back = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.85, 0.48), alu); back.position.set(-0.58, 0.93, -0.16); back.rotation.z = -0.2; seatG.add(back);
  const bot2 = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.03, 0.46), alu); bot2.position.set(-0.32, 0.55, -0.16); seatG.add(bot2);
  for (const z of [-0.42, 0.1]) { const hs = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.26, 0.02), alu); hs.position.set(-0.4, 1.23, z); seatG.add(hs); const rs = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.2, 0.02), alu); rs.position.set(-0.37, 0.8, z); seatG.add(rs); }
  const seat = bake(seatG); hi.add(seat);
  // helmeted driver in a firesuit with HANS device
  const P = palette(color, accent, seed, L.third);
  const helmet = new THREE.Group(); helmet.position.set(DRV_X, DRV_Y, -0.16);
  const hc = document.createElement('canvas'); hc.width = 256; hc.height = 128; { const x = hc.getContext('2d'); x.fillStyle = P.light ? P.acc : P.base; x.fillRect(0, 0, 256, 128); x.fillStyle = P.light ? P.base : P.acc; x.fillRect(0, 40, 256, 22); x.fillStyle = P.third; x.fillRect(0, 62, 256, 8); }
  const hm = new THREE.MeshPhysicalMaterial({ map: ctex(hc), clearcoat: .15, clearcoatRoughness: .7, roughness: .62, envMap: env, envMapIntensity: .12 });
  const shell = new THREE.Mesh(new THREE.SphereGeometry(0.13, 24, 16), hm); shell.scale.set(1.1, 1, 0.95); helmet.add(shell);
  const visor = new THREE.Mesh(new THREE.SphereGeometry(0.133, 18, 8, -0.85, 1.7, 1.15, 0.55), new THREE.MeshStandardMaterial({ color: 0x171a1d, metalness: .1, roughness: .6, envMap: env, envMapIntensity: .65 })); visor.rotation.y = Math.PI / 2; visor.scale.set(1.1, 1, 0.95); helmet.add(visor);
  const suit = new THREE.MeshStandardMaterial({ color: P.light ? 0x1a1a1a : color, roughness: 0.85 });
  const hans = new THREE.Mesh(new THREE.BoxGeometry(0.22, 0.06, 0.36), black); hans.position.set(-0.08, -0.16, 0); helmet.add(hans);
  const torso = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.15, 0.42, 10), suit); torso.position.set(-0.1, -0.38, 0); torso.rotation.z = -0.2; helmet.add(torso);
  for (const z of [-0.2, 0.2]) { const arm = tube([-0.05, -0.25, z], [0.32, -0.25, z * 0.5], 0.05, suit); helmet.add(arm); const glove = new THREE.Mesh(new THREE.SphereGeometry(0.045, 8, 6), black); glove.position.set(0.34, -0.24, z * 0.5); helmet.add(glove); }
  hi.add(helmet);
  // window net on the left side
  const netM = new THREE.MeshBasicMaterial({ map: netTexture(), color: 0x2a2a2a, transparent: true, alphaTest: 0.3, side: THREE.DoubleSide });
  const net = new THREE.Mesh(new THREE.PlaneGeometry(0.62, 0.3), netM); net.position.set(DRV_X - 0.05, 1.24, ZL + 0.09); hi.add(net);
  // ---- wheels: big rounded-sidewall dirt tires (lettered outer sidewall), satin 15 in deep-dish spun wheels with bead locks
  const wheels = [], lowWheels = [];
  const tireMat = new THREE.MeshStandardMaterial({ map: treadTex(), color: 0xffffff, roughness: 0.88 });
  const swMat = new THREE.MeshStandardMaterial({ map: sidewallTex(), color: 0xffffff, roughness: 0.8 });
  const swBlack = new THREE.MeshStandardMaterial({ color: 0x1d1d1d, roughness: 0.85 });
  const loTire = new THREE.MeshStandardMaterial({ color: 0x1c1c1c, roughness: 0.9 });
  const wheelM = new THREE.MeshStandardMaterial({ color: L.scheme===8?0x323a43:0xa1a7ad, metalness: 0.38, roughness: 0.64, envMap: env, envMapIntensity: 0.65, side: THREE.DoubleSide });
  for (const [W_, wz, sz, front] of wheelsDef) {
    const R = W_.r, w = W_.w, rr = W_.rim, hw = w / 2;
    const wg = new THREE.Group(); wg.position.set(W_.x, R, wz);
    const inn = new THREE.Group(); if (sz < 0) inn.rotation.y = Math.PI; wg.add(inn);   // +z of `inn` is always the outboard face
    // tire cross-section: rounded superellipse, bulging past the rim, from the inner bead round the tread to the outer bead
    const rc = rr + 0.045, a = R - rc, sec = [];
    for (let i = 0; i <= 40; i++) { const t = -Math.PI / 2 + Math.PI * i / 40, c = Math.cos(t), s = Math.sin(t); sec.push([rc + a * Math.pow(c, 0.5), hw * Math.sign(s) * Math.pow(Math.abs(s), 0.42)]); }
    const part = (from, to, pre = [], post = []) => [...pre, ...sec.slice(from, to + 1), ...post].map(([r, z]) => new THREE.Vector2(r, z));
    const lathe = (pts, mat, seg = 32) => { const g = new THREE.LatheGeometry(pts, seg); g.rotateX(Math.PI / 2); const m = new THREE.Mesh(g, mat); m.castShadow = true; return m; };
    const tread = lathe(part(9, 31), tireMat); { const uv = tread.geometry.attributes.uv; for (let i = 0; i < uv.count; i++) uv.setXY(i, uv.getX(i) * 8, uv.getY(i)); }
    const swO = lathe(part(31, 40, [], [[rr + 0.006, hw - 0.025]]), swMat); { const p = swO.geometry.attributes.position, uv = swO.geometry.attributes.uv; for (let i = 0; i < p.count; i++) uv.setXY(i, 0.5 + p.getX(i) / (2 * R), 0.5 + p.getY(i) / (2 * R)); }
    const swI = lathe(part(0, 9, [[rr + 0.006, -hw + 0.025]]), swBlack, 32);
    inn.add(tread, swO, swI);
    // Real, shallow rubber tread lugs; near LOD only, one draw per rotating tire.
    const count=globalThis.DTT?.quality==='high'?56:32,blocks=new THREE.InstancedMesh(new THREE.BoxGeometry(.034,.012,w*.20),black,count*3),matrix=new THREE.Matrix4(),dummy=new THREE.Object3D();blocks.name='gfx2-tread-blocks';for(let lane=0;lane<3;lane++)for(let k=0;k<count;k++){const a=(k+(lane%2)*.5)/count*Math.PI*2;dummy.position.set(Math.cos(a)*(R-.003),Math.sin(a)*(R-.003),(lane-1)*w*.23);dummy.rotation.set(0,0,a-Math.PI/2);dummy.updateMatrix();blocks.setMatrixAt(lane*count+k,dummy.matrix);}blocks.castShadow=true;inn.add(blocks);
    // spun wheel: rolled outer lip, smooth polished barrel, center plate set deep inboard
    const dz = -hw + (front ? 0.075 : 0.065);
    const wp = [[rr + 0.016, hw - 0.03], [rr + 0.02, hw - 0.012], [rr + 0.012, hw - 0.002], [rr, hw - 0.008], [rr - 0.006, hw - 0.03], [rr - 0.008, dz + 0.03], [rr - 0.03, dz + 0.004], [0.12, dz], [0.09, dz + 0.012]].map(([r, z]) => new THREE.Vector2(r, z));
    const wh = new THREE.Group();
    const rimG = new THREE.LatheGeometry(wp.reverse(), 40); rimG.rotateX(Math.PI / 2); wh.add(new THREE.Mesh(rimG, wheelM));
    // bead lock ring + 16 bolts on the outer face
    const blG = new THREE.LatheGeometry([[rr + 0.034, hw - 0.004], [rr + 0.036, hw + 0.006], [rr + 0.03, hw + 0.012], [rr - 0.004, hw + 0.012], [rr - 0.01, hw + 0.004]].map(([r, z]) => new THREE.Vector2(r, z)), 40); blG.rotateX(Math.PI / 2);
    wh.add(new THREE.Mesh(blG, alu));
    for (let i = 0; i < 16; i++) { const an = i / 16 * Math.PI * 2, b = new THREE.Mesh(new THREE.CylinderGeometry(0.0075, 0.0075, 0.012, 6), steel); b.rotation.x = Math.PI / 2; b.position.set(Math.cos(an) * (rr + 0.014), Math.sin(an) * (rr + 0.014), hw + 0.016); wh.add(b); }
    // wide-5 hub, lug nuts, lightening holes, knock-off on the rears
    const hub = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.08, 0.075, 16), alu); hub.rotation.x = Math.PI / 2; hub.position.z = dz + 0.045; wh.add(hub);
    for (let i = 0; i < 5; i++) { const an = i / 5 * Math.PI * 2, n = new THREE.Mesh(new THREE.CylinderGeometry(0.014, 0.014, 0.04, 6), wheelM); n.rotation.x = Math.PI / 2; n.position.set(Math.cos(an) * 0.1, Math.sin(an) * 0.1, dz + 0.025); wh.add(n); }
    for (let i = 0; i < 8; i++) { const an = (i + 0.5) / 8 * Math.PI * 2, n = new THREE.Mesh(new THREE.CircleGeometry(0.02, 12), black); n.position.set(Math.cos(an) * 0.145, Math.sin(an) * 0.145, dz + 0.004); wh.add(n); }
    if (!front) { const nut = new THREE.Mesh(new THREE.CylinderGeometry(0.045, 0.05, 0.05, 6), alu); nut.rotation.x = Math.PI / 2; nut.position.z = dz + 0.1; wh.add(nut); }
    inn.add(bake(wh, false));
    const rotor = new THREE.Mesh(new THREE.CylinderGeometry(rr * 0.72, rr * 0.72, 0.025, 20), steel); rotor.rotation.x = Math.PI / 2; rotor.position.z = -hw + 0.02; inn.add(rotor);
    hi.add(wg); wheels.push(wg);
    // cheap far wheel: coarse lathe tire + flat rim face
    const lw = new THREE.Group(); lw.position.copy(wg.position); if (sz < 0) lw.rotation.y = Math.PI;
    const lt = new THREE.LatheGeometry(part(0, 40).filter((_, i) => i % 4 === 0), 16); lt.rotateX(Math.PI / 2); const ltm = new THREE.Mesh(lt, loTire); ltm.castShadow = true; lw.add(ltm);
    const lf = new THREE.Mesh(new THREE.CircleGeometry(rr + 0.02, 16), wheelM); lf.position.z = hw - 0.03; lw.add(lf);
    lo.add(lw); lowWheels.push(lw);
  }

  // Mounted Dzus fasteners, panel seam caps and spoiler hardware: baked together.
  const hardware=new THREE.Group(),mounts=[];hardware.name='gfx2-panel-fasteners';
  for(const side of[-1,1])for(let i=0;i<27;i++){const x=XT+.12+i*(XN-XT-.26)/26,y=yTop(x)-.055;if(y<yBot(x)+.04)continue;const cap=new THREE.Mesh(new THREE.CylinderGeometry(.011,.011,.009,8),alu);cap.rotation.x=Math.PI/2;cap.position.set(noseSideX(x),y,sideZ(x,y,side,0)+side*.004);hardware.add(cap);mounts.push({point:cap.position.toArray(),normal:[0,0,side],panel:side>0?'late-model-right-panel':'late-model-left-panel'});}
  for(let i=0;i<15;i++){const v=(i+.5)/15,y=Y_TIP-.04,u=(y-.115)/(yTop(XN)-.115),a=smooth((u-.8)/.2),zl=sideZ(XN,y,-1)*(1-a)+edgeZ(XN,-1)*a,zr=sideZ(XN,y,1)*(1-a)+edgeZ(XN,1)*a;const cap=new THREE.Mesh(new THREE.SphereGeometry(.01,6,4),alu);cap.position.set(XN+noseBow(v)+.01+.13*Math.sin(Math.PI*u)*Math.sin(Math.PI*v)**.4,y,zl+(zr-zl)*v);hardware.add(cap);mounts.push({point:cap.position.toArray(),normal:[1,0,0],panel:'late-model-nose-valance'});}
  for(const z of[ZL+.12,ZC,ZR-.12]){const rod=tube([XT+.35,Y_TAIL-.04,z],[spTop.x+.015,spTop.y-.04,z],.008,chrome);hardware.add(rod);}
  const bakedHardware=bake(hardware,false);bakedHardware.name='gfx2-panel-fasteners';bakedHardware.userData.mounts=mounts;hi.add(bakedHardware);

  // ---- optional cockpit (player's car, in-car camera)
  let cockpitGroup = null, wheelGrp = null, gauge = null, lexMud = null;
  if (cockpit) {
    cockpitGroup = new THREE.Group(); cockpitGroup.visible = false; hi.add(cockpitGroup);
    const tubeM = cageMat;
    const padM = new THREE.MeshStandardMaterial({ color: 0x111111, roughness: 0.9 });
    for (const z of [CZL, CZR]) {
      cockpitGroup.add(tube([X_COWL - 0.04, Y_COWL - 0.02, z + (z < 0 ? -0.08 : 0.08)], [X_ROOF_F, Y_ROOF_F - 0.03, z], 0.03, padM));   // A-pillars (padded)
      cockpitGroup.add(tube([X_ROOF_F, Y_ROOF_F - 0.03, z], [X_ROOF_R, Y_ROOF_R - 0.03, z], 0.028, tubeM));
      cockpitGroup.add(tube([X_ROOF_R, Y_ROOF_R - 0.03, z], [X_ROOF_R - 0.1, 0.42, z], 0.03, tubeM));
    }
    for(const z of Array.from({length:8},(_,i)=>CZL+.1+i*.17))cockpitGroup.add(tube([X_COWL-.048,Y_COWL+.015,z],[X_ROOF_F+.022,YRF-.006,z],.009,cageMat,10));
    cockpitGroup.add(tube([X_ROOF_F, Y_ROOF_F - 0.04, CZL], [X_ROOF_F, Y_ROOF_F - 0.04, CZR], 0.03, padM)); // front roof hoop (padded)
    cockpitGroup.add(tube([0.8, 0.96, ZL + 0.1], [0.8, 0.96, ZR - 0.1], 0.028, tubeM));                     // dash bar
    for (const y of [0.62, 0.86]) cockpitGroup.add(tube([0.7, y, ZL + 0.08], [-0.95, y + 0.02, ZL + 0.08], 0.028, tubeM));
    const netIn = new THREE.Mesh(new THREE.PlaneGeometry(0.95, 0.3), netM); netIn.position.set(-0.25, 1.22, ZL + 0.08); cockpitGroup.add(netIn);
    const dashM = new THREE.MeshStandardMaterial({ color: 0x1a1b1e, emissive: 0x0c0c0e, metalness: 0.3, roughness: 0.7 });
    const shroud = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.05, BW - 0.06), dashM); shroud.position.set(0.66, 0.98, ZC); shroud.rotation.z = -0.06; cockpitGroup.add(shroud);
    const pod = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.2, 0.66), dashM); pod.position.set(0.52, 1.06, -0.12); pod.rotation.z = -0.3; cockpitGroup.add(pod);
    const gc = cv(512, 160); const gt = ctex(gc);
    const gp = new THREE.Mesh(new THREE.PlaneGeometry(0.56, 0.175), new THREE.MeshBasicMaterial({ map: gt, toneMapped: false })); basis(gp, [0, 0, 1], [0.3, 0.95, 0]); gp.position.set(0.455, 1.07, -0.12); cockpitGroup.add(gp);
    gauge = { canvas: gc, tex: gt, g: gc.getContext('2d') };
    const sw = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.12), new THREE.MeshBasicMaterial({ map: textPanel(['IGN  FUEL  FAN'], 256, 48, '#222', '#ddd') })); basis(sw, [0, 0, 1], [0.3, 0.95, 0]); sw.position.set(0.5, 1.06, 0.33); cockpitGroup.add(sw);
    const tilt = new THREE.Group(); tilt.position.set(0.24, 1.06, -0.16); tilt.rotation.z = -0.35; cockpitGroup.add(tilt); wheelGrp = new THREE.Group(); tilt.add(wheelGrp);
    const rimW = new THREE.Mesh(new THREE.TorusGeometry(0.175, 0.02, 10, 32), new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.8 })); rimW.rotation.y = Math.PI / 2; wheelGrp.add(rimW);
    const satin = new THREE.MeshStandardMaterial({ color: 0x6c7074, metalness: 0.7, roughness: 0.5, envMap: env, envMapIntensity: 0.855 });   // brushed, not mirror: no bloom glare in the driver's face
    const fw = new THREE.Mesh(new THREE.PlaneGeometry(BW - 0.1, 0.62), dashM); fw.rotation.y = -Math.PI / 2; fw.position.set(0.86, 0.66, ZC); cockpitGroup.add(fw);   // firewall: hides the headers/engine bay from in the seat
    for (let i = 0; i < 3; i++) { const a = i * Math.PI * 2 / 3 + Math.PI / 2; const sp = new THREE.Mesh(new THREE.BoxGeometry(0.012, 0.17, 0.03), satin); sp.position.set(0, Math.sin(a) * 0.085, Math.cos(a) * 0.085); sp.rotation.x = -a + Math.PI / 2; wheelGrp.add(sp); }
    const hubW = new THREE.Mesh(new THREE.CylinderGeometry(0.035, 0.035, 0.06, 12), satin); hubW.rotation.z = Math.PI / 2; wheelGrp.add(hubW);
    const mark = new THREE.Mesh(new THREE.BoxGeometry(0.025, 0.03, 0.04), new THREE.MeshBasicMaterial({ color: 0xffcc00 })); mark.position.set(0, 0.175, 0); wheelGrp.add(mark);
    cockpitGroup.add(tube([0.24, 1.06, -0.16], [0.7, 0.92, -0.16], 0.022, satin));
    // mud on the windshield lexan (same plane as the windshield, just inside it)
    const a = new THREE.Vector3(X_COWL - 0.06, Y_COWL + 0.02, 0), b = new THREE.Vector3(X_ROOF_F + 0.01, Y_ROOF_F - 0.02, 0), WSD = b.clone().sub(a), wsl = WSD.length(); WSD.normalize();
    const nrm = new THREE.Vector3(WSD.y, -WSD.x, 0);   // outward normal of the windshield (forward / up)
    const lm = new THREE.MeshBasicMaterial({ map: mudCanvas(seed + 11, 'glass'), transparent: true, opacity: 0, depthWrite: false });
    const lw = basis(new THREE.Mesh(new THREE.PlaneGeometry(BW - 0.14, wsl), lm), [0, 0, 1], WSD.toArray()); lw.position.copy(a).lerp(b, 0.5).addScaledVector(nrm, -0.012); lw.position.z = ZC;
    lw.renderOrder = 5; cockpitGroup.add(lw); lexMud = lm;
  }
  const nightMud=installNightMud([paint,...skins]);
  const baseColor = new THREE.Color(color);
  const tireBase = new THREE.Color(0xffffff), loTireBase = new THREE.Color(0x1c1c1c);
  const outer = [helmet, cage, net];
  const ud = {
    wheels, lowWheels, wheelRest: wheels.map(w => w.position.clone()), paint, baseColor, skins, mudMats, helmet, greenhouse: ws, roof, roofNum, cockpit: cockpitGroup, wheelGrp, gauge, lexMud, cage, cageMat, scoop, lod,
    mud: 0, lexanMud: 0, dmg: 0, nightMud,
    clay: new THREE.Color(0x8a4f2c),
    // mud 0..1, dmg 0..100: paint dulls, the single-pass splatter grows, tires go brown
    updateLook(mud = ud.mud, dmg = ud.dmg) {
      ud.mud = mud; ud.dmg = dmg; nightMud.value=mud;
      const k = 1 - dmg / 220, cc = 0.38 * (1 - mud * 0.8), ro = 0.42 + mud * 0.35;
      paint.color.copy(baseColor).lerp(ud.clay, mud * 0.45).multiplyScalar(k * SKIN); paint.clearcoat = cc; paint.roughness = ro;
      for (const s of skins) { s.color.setScalar(k * SKIN).lerp(ud.clay.clone().multiplyScalar(1.6), mud * 0.25); s.clearcoat = cc; s.roughness = ro;
        if(s===roofM||s===spF||s===spB){s.roughness=Math.max(.55,ro);s.clearcoat=.18*(1-mud*.8);s.clearcoatRoughness=.8;s.envMapIntensity=.35;} }
      for (const m of mudMats) m.opacity = Math.min(1, mud * 1.15);
      tireMat.color.copy(tireBase).lerp(ud.clay.clone().multiplyScalar(1.4), mud * 0.7); loTire.color.copy(loTireBase).lerp(ud.clay, mud * 0.6); swMat.color.setScalar(1).lerp(ud.clay, mud * 0.8);
      if (lexMud) lexMud.opacity = Math.min(0.78, ud.lexanMud);
    },
    setInCar(on) {
      for (const o of outer) o.visible = !on; seat.visible = !on;
      if (cockpitGroup) cockpitGroup.visible = on;
      lod.autoUpdate = !on; if (on) { hi.visible = true; lo.visible = false; }
    },
    drawGauges(rpm, speedMph, tempC, oil, lap, laps) {
      if (!gauge) return; const x = gauge.g, Wd = 512, H = 160;
      x.fillStyle = '#0d0e10'; x.fillRect(0, 0, Wd, H);
      const dial = (cx, r, v, label, red, txt) => {
        x.fillStyle = '#16181c'; x.beginPath(); x.arc(cx, 80, r, 0, 7); x.fill(); x.strokeStyle = '#8a8f96'; x.lineWidth = 4; x.stroke();
        for (let i = 0; i <= 10; i++) { const a = Math.PI * 0.75 + i / 10 * Math.PI * 1.5; x.strokeStyle = i >= red ? '#ff3b30' : '#ddd'; x.lineWidth = 3; x.beginPath(); x.moveTo(cx + Math.cos(a) * r * 0.78, 80 + Math.sin(a) * r * 0.78); x.lineTo(cx + Math.cos(a) * r * 0.92, 80 + Math.sin(a) * r * 0.92); x.stroke(); }
        const a = Math.PI * 0.75 + Math.max(0, Math.min(1, v)) * Math.PI * 1.5; x.strokeStyle = '#ff8a00'; x.lineWidth = 5; x.beginPath(); x.moveTo(cx, 80); x.lineTo(cx + Math.cos(a) * r * 0.85, 80 + Math.sin(a) * r * 0.85); x.stroke();
        x.fillStyle = '#ddd'; x.font = '700 16px Arial'; x.textAlign = 'center'; x.fillText(label, cx, 80 + r * 0.55); if (txt) { x.font = '900 20px Arial'; x.fillText(txt, cx, 80 + r * 0.25); }
      };
      dial(110, 72, rpm, 'RPM x1000', 8, (rpm * 8.5).toFixed(1));
      dial(268, 48, (tempC - 60) / 70, 'WATER', 8, Math.round(tempC) + '°');
      dial(380, 48, oil, 'OIL', 11, Math.round(oil * 100) + '');
      x.fillStyle = rpm > 0.94 ? '#ff3b30' : '#331010'; x.beginPath(); x.arc(470, 40, 16, 0, 7); x.fill();
      x.fillStyle = '#ddd'; x.font = '700 18px Arial'; x.textAlign = 'center'; x.fillText('SHIFT', 470, 74);
      x.font = '900 22px Arial'; x.fillText(`L${lap}/${laps}`, 470, 120); x.font = '700 14px Arial'; x.fillText(Math.round(speedMph) + ' MPH', 470, 145);
      gauge.tex.needsUpdate = true;
    },
  };
  ud.detailVersion=2;ud.modelFeatures={wedge:true,panels:true,spoiler:true,rollCage:true,treadBlocks:true,offsetWheels:true,fasteners:true};root.userData = ud; ud.updateLook(0, 0);
  return root;
}
