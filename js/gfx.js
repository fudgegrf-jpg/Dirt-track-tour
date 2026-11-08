import {pbrMaps,scanImage,pbrMaterial} from './gfx2-materials.js';
import {clayMaterialMaps} from './surface-detail.js';
import {beveledBox,canvasTexture,instances,batchStatic} from './details.js';
import * as THREE from 'three';

export const rand = (a = 0, b = 1) => a + Math.random() * (b - a);
let seed = 1234;
export function srand(s) { seed = s >>> 0 || 1; }
export function rnd() { seed ^= seed << 13; seed >>>= 0; seed ^= seed >> 17; seed ^= seed << 5; seed >>>= 0; return (seed % 100000) / 100000; }

function canvas(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
function tex(c, repeat = true, srgb = true) {
  const t = new THREE.CanvasTexture(c);
  if (repeat) { t.wrapS = t.wrapT = THREE.RepeatWrapping; }
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 8; t.needsUpdate = true; return t;
}

// ---------- Procedural textures ----------
export function dirtTextures(rgb = [0.5, 0.27, 0.16]) {
  return clayMaterialMaps(rgb);
}

export function grassTexture(base='#2f4a22'){const t=pbrMaps('grass').map;t.repeat.set(4,4);return t;}
export function asphaltTexture(){return pbrMaps('asphalt').map;}

// interstate lane texture across 12.4 m (u) and 12 m along (v)
export function laneTexture() {
  const W = 512, H = 512, c = canvas(W, H), g = c.getContext('2d');
  for(let y=0;y<4;y++)for(let x=0;x<4;x++)g.drawImage(scanImage('asphalt'),x*W/4,y*H/4,W/4,H/4);
  for (let i = 0; i < 26000; i++) { const v = 35 + Math.random() * 55 | 0; g.fillStyle = `rgba(${v},${v},${v},0.08)`; g.fillRect(Math.random() * W, Math.random() * H, 1.6, 1.6); }
  const px = m => (m + 1) / 12.4 * W; // lat -1 .. 11.4
  // tire wear darker strips
  for (const lc of [1.85, 5.55]) for (const o of [-0.9, 0.9]) { g.fillStyle = 'rgba(20,20,22,0.25)'; g.fillRect(px(lc + o) - 12, 0, 24, H); }
  for(const lc of[1.85,5.55])for(const o of[-.85,.85]){const cx=px(lc+o),gr=g.createLinearGradient(cx-14,0,cx+14,0);gr.addColorStop(0,'#18191a00');gr.addColorStop(.5,'#15171940');gr.addColorStop(1,'#18191a00');g.fillStyle=gr;g.fillRect(cx-14,0,28,H);}
  g.strokeStyle='#1b1c1d70';g.lineWidth=1.2;for(let i=0;i<9;i++){g.beginPath();let x=(i*71)%W;g.moveTo(x,0);for(let y=0;y<=H;y+=32){x+=Math.sin(i*7+y*.1)*4;g.lineTo(x,y);}g.stroke();}
  g.fillStyle = '#d8b21c'; g.fillRect(px(0) - 4, 0, 8, H);               // left yellow edge
  g.fillStyle = '#e8e8e8'; g.fillRect(px(7.4) - 4, 0, 8, H);             // right white edge
  g.fillRect(px(3.7) - 4, 0, 8, H * 0.25);                              // dashed (3m of 12m)
  g.fillStyle = 'rgba(180,180,180,.14)'; g.fillRect(px(7.6), 0, W - px(7.6), H);        // shoulder lighter
  for (let y = 0; y < H; y += 16) { g.fillStyle = 'rgba(0,0,0,0.35)'; g.fillRect(px(7.9), y, 20, 7); } // rumble strip
  const t = tex(c);t.userData.gfx2Kind='asphalt';t.userData.gfx2Repeat=4;return t;
}

export function glowTexture() {
  const S = 128, c = canvas(S, S), g = c.getContext('2d');
  const gr = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.2, 'rgba(255,245,220,0.7)'); gr.addColorStop(1, 'rgba(255,230,180,0)');
  g.fillStyle = gr; g.fillRect(0, 0, S, S); return tex(c, false);
}

export function numberTexture(num, color, accent, w = 256, h = 128) {
  const c = canvas(w, h), g = c.getContext('2d');
  g.clearRect(0, 0, w, h);
  g.font = `italic 900 ${h * 0.92}px Impact, "Arial Black", sans-serif`;
  g.textAlign = 'center'; g.textBaseline = 'middle';
  g.lineJoin = 'round'; g.lineWidth = h * 0.12; g.strokeStyle = '#' + new THREE.Color(color).getHexString();
  g.strokeText(num, w / 2, h * 0.54);
  g.lineWidth = h * 0.06; g.strokeStyle = '#000'; g.strokeText(num, w / 2, h * 0.54);
  g.fillStyle = '#' + new THREE.Color(accent).getHexString(); g.fillText(num, w / 2, h * 0.54);
  return tex(c, false);
}

const SPONSORS = ['CLAYMASTER TIRES', 'RED DIRT OIL', "HAULIN' HOGS BBQ", 'CUSHION CAM', 'BIG E FEED & SEED', 'LOOSE WHEEL PARTS', 'SLICK TRACK BREWING', 'BACKROADS DIESEL', 'GROOVE MASTER', 'NIGHT SHIFT ENERGY'];
const SPCOL = ['#c81d25', '#1e5fd8', '#f2c014', '#1f9e4a', '#111', '#ff6a00', '#7a2bd1'];
export function bannerTexture() {
  const W = 2048, H = 128, c = canvas(W, H), g = c.getContext('2d');
  g.fillStyle = '#e9e6df'; g.fillRect(0, 0, W, H);g.globalAlpha=.45;for(let x=0;x<W;x+=128)g.drawImage(scanImage('concrete'),x,0,128,H);g.globalAlpha=1;
  // Fit six COMPLETE panels into the existing power-of-two atlas. Previously
  // 300/360/420 repeated totaled 2160px, cropping the final sponsor at 2048.
  const panels=[];let x=0,weight=0;
  for(let i=0;i<6;i++) {
    weight+=300+(i%3)*60;const end=i===5?W:Math.round(weight/2160*W),wdt=end-x,col=SPCOL[i%SPCOL.length];
    g.fillStyle = col; g.fillRect(x + 6, 14, wdt - 12, H - 28);
    g.fillStyle = col === '#f2c014' ? '#111' : '#fff'; g.font = '900 46px Impact, Arial Black, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle';
    g.fillText(SPONSORS[i], x + wdt / 2, H / 2 + 2, wdt - 30);
    panels.push({text:SPONSORS[i],x,width:wdt});x=end;
  }
  const t=tex(c);t.userData.bannerPanels=panels;return t;
}

export function fenceTexture() {
  const S = 128, c = canvas(S, S), g = c.getContext('2d');
  g.clearRect(0, 0, S, S); g.strokeStyle = 'rgba(200,200,205,1)'; // Thin galvanized wire: thick mipmapped lines averaged to an opaque gray wall from the stands.
  g.lineWidth = 1.2;
  for (let i = -S; i < S * 2; i += 16) { g.beginPath(); g.moveTo(i, 0); g.lineTo(i + S, S); g.stroke(); g.beginPath(); g.moveTo(i + S, 0); g.lineTo(i, S); g.stroke(); }
  const t = tex(c); return t;
}

export function trailerTexture(team, num, color, accent, scheme) {
  const W = 2048, H = 512, c = canvas(W, H), g = c.getContext('2d');
  const col = '#' + new THREE.Color(color).getHexString(), acc = '#' + new THREE.Color(accent).getHexString();
  if(scheme===8){g.fillStyle=col;g.fillRect(0,0,W,H);g.fillStyle=acc;g.fillRect(0,0,460,H);g.fillStyle='#c5f12c';g.fillRect(0,H-28,W,28);g.font='italic 900 320px Impact,Arial Black';g.textBaseline='middle';g.textAlign='center';g.strokeStyle=acc;g.lineWidth=24;g.strokeText(num,540,250);g.fillStyle='#f7ef23';g.fillText(num,540,250);g.font='italic 900 100px Arial';g.fillStyle=acc;g.fillText(team.toUpperCase(),1340,190,1250);g.font='600 46px Arial';g.fillText('CLASSIC '+num+' / DIRT TRACK TOUR',1340,325,1200);return tex(c,false);}
  const gr = g.createLinearGradient(0, 0, W, 0); gr.addColorStop(0, '#101010'); gr.addColorStop(0.35, col); gr.addColorStop(1, col);
  g.fillStyle = gr; g.fillRect(0, 0, W, H);
  // swooshes
  g.fillStyle = acc; g.beginPath(); g.moveTo(0, H * 0.78); g.bezierCurveTo(W * 0.4, H * 0.55, W * 0.7, H * 0.95, W, H * 0.6); g.lineTo(W, H * 0.7); g.bezierCurveTo(W * 0.7, H * 1.05, W * 0.4, H * 0.65, 0, H * 0.88); g.fill();
  g.fillStyle = 'rgba(255,255,255,0.12)'; for (let i = 0; i < 12; i++) g.fillRect(i * 170, 0, 6, H);
  g.font = 'italic 900 330px Impact, Arial Black, sans-serif'; g.textBaseline = 'middle'; g.textAlign = 'center';
  g.lineWidth = 18; g.strokeStyle = '#000'; g.strokeText(num, W * 0.18, H * 0.46); g.fillStyle = acc; g.fillText(num, W * 0.18, H * 0.46);
  g.font = 'italic 900 120px Impact, Arial Black, sans-serif'; g.fillStyle = '#fff'; g.lineWidth = 10; g.strokeText(team.toUpperCase(), W * 0.62, H * 0.3, W * 0.68); g.fillText(team.toUpperCase(), W * 0.62, H * 0.3, W * 0.68);
  g.font = '700 54px Arial, sans-serif'; g.fillStyle = '#fff'; g.fillText('DIRT LATE MODEL RACING  •  SEASON TOUR', W * 0.62, H * 0.5, W * 0.7);
  g.font = '700 34px Arial, sans-serif'; g.fillStyle = 'rgba(255,255,255,0.8)'; g.fillText('CLAYMASTER TIRES   RED DIRT OIL   BACKROADS DIESEL', W * 0.62, H * 0.92, W * 0.7);
  return tex(c, false);
}

export function signTexture(lines, bg = '#0b6b3a', fg = '#fff', w = 512, h = 256, shield) {
  const c = canvas(w, h), g = c.getContext('2d');
  g.fillStyle = bg; g.fillRect(0, 0, w, h); g.strokeStyle = fg; g.lineWidth = 8; g.strokeRect(10, 10, w - 20, h - 20);
  let y0 = h * 0.2;
  if (shield) { // interstate shield
    const sx = w / 2, sy = h * 0.28, r = h * 0.17;
    g.fillStyle = '#fff'; g.beginPath(); g.arc(sx, sy, r * 1.1, 0, 7); g.fill();
    g.fillStyle = '#1a3d8f'; g.beginPath(); g.moveTo(sx - r, sy - r * 0.6); g.lineTo(sx + r, sy - r * 0.6); g.quadraticCurveTo(sx + r, sy + r, sx, sy + r * 1.05); g.quadraticCurveTo(sx - r, sy + r, sx - r, sy - r * 0.6); g.fill();
    g.fillStyle = '#c81d25'; g.fillRect(sx - r, sy - r * 0.95, r * 2, r * 0.4);
    g.fillStyle = '#fff'; g.font = `900 ${r * 0.85}px Arial`; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(shield, sx, sy + r * 0.25);
    y0 = h * 0.62;
  }
  g.fillStyle = fg; g.textAlign = 'center'; g.textBaseline = 'middle';
  const lh = (h - y0) / (lines.length + 0.4);
  lines.forEach((l, i) => { g.font = `700 ${Math.min(lh * 0.8, 64)}px "Highway Gothic", Arial, sans-serif`; g.fillText(l, w / 2, y0 + lh * (i + 0.5), w - 40); });
  return tex(c, false);
}

export function billboardTexture() {
  const ads = [['SPEEDWAY MOTEL', 'TRUCK PARKING • NEXT EXIT', '#14365c', '#ffd400'], ["BUBBA'S BBQ", 'PULLED PORK • 2 MILES', '#5a1d0e', '#ffb347'],
    ['DIRT LATE MODEL', 'FRIDAY NIGHT • $10 ADMISSION', '#111', '#ff5a1f'], ['CLAYMASTER TIRES', 'BITE THE CUSHION', '#c81d25', '#fff'],
    ['TRUCKERS CHAPEL', 'EXIT 47', '#fff', '#222'], ['FIREWORKS', 'BUY 1 GET 6 FREE', '#ffcc00', '#b00']];
  const a = ads[Math.floor(Math.random() * ads.length)];
  const c = canvas(512, 192), g = c.getContext('2d');
  g.fillStyle = a[2]; g.fillRect(0, 0, 512, 192); g.fillStyle = a[3]; g.textAlign = 'center'; g.textBaseline = 'middle';
  g.font = 'italic 900 64px Impact, Arial Black'; g.fillText(a[0], 256, 70, 480); g.font = '700 30px Arial'; g.fillText(a[1], 256, 140, 480);
  return tex(c, false);
}

// ---------- Sky ----------
// sky dome: gradient + sun/moon disc + horizon glow band + twinkling stars (fade with `starAmt`)
export function makeSky({ top, horizon, bottom, sunDir, sunColor, sunSize = 0.03, stars = false, glow = 0x000000, glowAmt = 0, starAmt = 1, moon = false }) {
  const geo = new THREE.SphereGeometry(4000, 32, 16);
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false, fog: false,
    uniforms: { top: { value: new THREE.Color(top) }, horizon: { value: new THREE.Color(horizon) }, bottom: { value: new THREE.Color(bottom) },
      sunDir: { value: new THREE.Vector3(...sunDir).normalize() }, sunColor: { value: new THREE.Color(sunColor) }, sunSize: { value: sunSize },
      glow: { value: new THREE.Color(glow) }, glowAmt: { value: glowAmt } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*p; }`,
    fragmentShader: `uniform vec3 top,horizon,bottom,sunColor,sunDir,glow; uniform float sunSize, glowAmt; varying vec3 vDir;
      void main(){ vec3 d = normalize(vDir); float h = d.y;
        vec3 col = h > 0.0 ? mix(horizon, top, pow(clamp(h,0.0,1.0), 0.45)) : mix(horizon, bottom, clamp(-h*6.0,0.0,1.0));
        vec3 sd = normalize(sunDir); float s = max(dot(d, sd), 0.0);
        // warm band hugging the horizon, strongest toward the sun's azimuth
        float az = max(dot((d.xz / max(length(d.xz), 0.0001)), (sd.xz / max(length(sd.xz), 0.0001))), 0.0);
        col += glow * glowAmt * exp(-abs(h) * 9.0) * (0.35 + 0.65 * pow(az, 3.0));
        col += sunColor * (pow(s, 8.0)*0.04 + pow(s, 64.0)*0.08);
        float cloud=smoothstep(0.25,0.85,sin(d.x*11.0+d.z*4.0)*sin(d.z*13.0-d.x*3.0)+sin(d.x*27.0+d.z*19.0)*0.12)*smoothstep(0.025,0.16,h)*(1.0-smoothstep(0.45,0.8,h));
        col=mix(col,col*0.86+horizon*0.19,cloud*0.24);
        // A haze layer meets the fog exactly at the horizon. This also
        // suppresses analytic sun halos behind the ground / distant trees.
        col=mix(horizon,col,smoothstep(0.0,0.12,abs(h)));
        if (sunSize > 0.0) col += sunColor * smoothstep(1.0 - max(sunSize, 0.002)*0.02, 1.0 - max(sunSize, 0.002)*0.015, s) * 1.5;
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const g = new THREE.Group(); const m = new THREE.Mesh(geo, mat); m.renderOrder = -10; g.add(m);
  if (stars) {
    const n = 2200, p = new Float32Array(n * 3), sz = new Float32Array(n), ph = new Float32Array(n);
    for (let i = 0; i < n; i++) { const th = Math.random() * Math.PI * 2, a = Math.acos(Math.random() * 0.92 + 0.06); p[i * 3] = Math.sin(a) * Math.cos(th) * 3500; p[i * 3 + 1] = Math.cos(a) * 3500; p[i * 3 + 2] = Math.sin(a) * Math.sin(th) * 3500; sz[i] = Math.random() < 0.06 ? 1.9 : .65 + Math.random() * .8; ph[i] = Math.random() * 6.28; }
    const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(p, 3)); sg.setAttribute('aSize', new THREE.BufferAttribute(sz, 1)); sg.setAttribute('aPh', new THREE.BufferAttribute(ph, 1));
    const sm = new THREE.ShaderMaterial({ transparent: true, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, uniforms: { uTime: { value: 0 }, uAmt: { value: starAmt }, uPx: { value: Math.min(2, window.devicePixelRatio || 1) } },
      vertexShader: `attribute float aSize, aPh; uniform float uTime, uPx; varying float vA; void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0); gl_Position = projectionMatrix*mv; float h = normalize(position).y;
        vA = smoothstep(0.02, 0.25, h) * (0.65 + 0.35 * sin(uTime * 2.3 + aPh * 7.0)); gl_PointSize = aSize * uPx; }`,
      fragmentShader: `uniform float uAmt; varying float vA; void main(){ vec2 c = gl_PointCoord - 0.5; float a = (1.0 - smoothstep(0.1, 0.5, length(c))); gl_FragColor = vec4(vec3(0.85,0.9,1.0) * a * vA * uAmt, 1.0); }` });
    const pts = new THREE.Points(sg, sm); pts.renderOrder = -9; pts.frustumCulled = false; g.add(pts);
    g.userData.stars = sm;
    pts.onBeforeRender = renderer => { sm.uniforms.uTime.value = performance.now() / 1000;sm.uniforms.uPx.value=renderer.getPixelRatio(); };
  }
  if (moon) {
    const c = document.createElement('canvas'); c.width = c.height = 128; const x = c.getContext('2d');
    const gr = x.createRadialGradient(64, 64, 8, 64, 64, 64); gr.addColorStop(0, 'rgba(255,250,235,1)'); gr.addColorStop(0.42, 'rgba(240,236,220,1)'); gr.addColorStop(0.5, 'rgba(200,210,240,0.25)'); gr.addColorStop(1, 'rgba(120,140,200,0)');
    x.fillStyle = gr; x.fillRect(0, 0, 128, 128); x.fillStyle = 'rgba(160,160,150,0.35)'; for (const [a, b, r] of [[52, 54, 9], [74, 70, 6], [60, 78, 5], [76, 50, 4]]) { x.beginPath(); x.arc(a, b, r, 0, 7); x.fill(); }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace;
    const md = new THREE.Vector3(...(Array.isArray(moon) ? moon : [-0.5, 0.42, 0.6])).normalize().multiplyScalar(3400);
    const ms = new THREE.Sprite(new THREE.SpriteMaterial({ map: t, fog: false, depthWrite: false, transparent: true, toneMapped: false, color: 0xd8dcea })); ms.position.copy(md); ms.scale.set(200, 200, 1); ms.renderOrder = -8; g.add(ms);
  }
  return g;
}

// ---------- Dirt late model (see models.js) ----------
export { makeLateModel, WHEEL_R, DRIVER_EYE, loadCarFonts } from './models.js';

// ---------- Semi tractor + enclosed race hauler ----------
export function makeSemi({ team = 'Your Racing', num = '1', color = 0xc81d25, accent = 0xffffff, cabColor, scheme, detail='medium' } = {}) {
  const low=detail==='low',segments=low?20:40,round=(w,h,d,r=.1)=>beveledBox(w,h,d,r,low?3:5);
  const root = new THREE.Group();
  const tractor = new THREE.Group(); root.add(tractor);
  const paint = new THREE.MeshPhysicalMaterial({ color: cabColor ?? color, metalness: 0.35, roughness: 0.34, clearcoat: 0.65, clearcoatRoughness: 0.22 });
  const chrome = new THREE.MeshStandardMaterial({ color: 0xb1bac1, metalness: .72, roughness: .27 });
  const dark = new THREE.MeshStandardMaterial({ color: 0x15161a, roughness: 0.7 });
  const glass = new THREE.MeshPhysicalMaterial({ color: 0x0a0e14, metalness: 0.05, roughness: 0.5, clearcoat: 0.15 });
  const tire = new THREE.MeshStandardMaterial({ color: 0x34312d, roughness: 0.95 });
  const add = (geo, mat, x, y, z, par = tractor, shadow = true) => { const m = new THREE.Mesh(geo, mat); m.position.set(x, y, z); if (shadow) { m.castShadow = true; m.receiveShadow = true; } par.add(m); return m; };
  add(new THREE.BoxGeometry(7.6, 0.32, 1.0), dark, 0.2, 0.95, 0);                      // frame
  // long hood (slight taper via scaled box)
  const hood = add(round(2.5,1.05,1.75,.14), paint, 2.75, 1.82, 0); hood.geometry.translate(0, 0, 0);
  add(new THREE.BoxGeometry(2.5, 0.1, 1.55), paint, 2.75, 2.38, 0);                    // hood crown
  add(new THREE.BoxGeometry(0.1, 1.25, 1.35), chrome, 4.05, 1.85, 0);                  // grille
  for (let i = 0; i < 9; i++) add(new THREE.BoxGeometry(0.02, 1.1, 0.03), dark, 4.11, 1.85, -0.6 + i * 0.15, tractor, false);
  add(round(.32,.36,2.55,.07), chrome, 4.2, 0.85, 0);                  // bumper
  for (const sz of [-1, 1]) {
    add(round(1.6,.18,.55,.07), paint, 3.1, 1.22, sz * 1.0);            // fenders
    const hl = add(new THREE.CylinderGeometry(0.16, 0.16, 0.08, 16), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff3d0, emissiveIntensity: 1.0 }), 3.95, 1.45, sz * 1.02, tractor, false); hl.rotation.z = Math.PI / 2;
    add(new THREE.CylinderGeometry(0.11, 0.11, 3.4, 14), chrome, 0.05, 2.9, sz * 1.28);  // stacks
    add(new THREE.CylinderGeometry(0.32, 0.32, 1.5, 18), chrome, 1.0, 0.95, sz * 1.05).rotation.z = Math.PI / 2; // tanks
    add(new THREE.BoxGeometry(0.08, 0.45, 0.25), chrome, 1.55, 2.75, sz * 1.32);          // mirrors
  }
  add(round(1.5,2,2.35,.12), paint, 0.75, 2.35, 0);                     // cab
  const ws = add(new THREE.BoxGeometry(0.06, 0.8, 2.05), glass, 1.52, 2.85, 0); ws.rotation.z = -0.25;
  for (const sz of [-1, 1]) add(new THREE.BoxGeometry(0.8, 0.6, 0.04), glass, 0.85, 2.85, sz * 1.18, tractor, false);
  add(round(1.9,2.55,2.4,.18), paint, -0.9, 2.6, 0);                      // sleeper
  add(new THREE.BoxGeometry(1.7, 0.12, 2.42), chrome, -0.9, 1.4, 0);                    // sleeper trim
  const marker = new THREE.MeshStandardMaterial({ color: 0xffa500, emissive: 0xff8c00, emissiveIntensity: 0.8 });
  for (let i = 0; i < 5; i++) add(new THREE.BoxGeometry(0.06, 0.06, 0.12), marker, 1.48, 3.4, -0.6 + i * 0.3, tractor, false);
  add(new THREE.BoxGeometry(1.0, 0.15, 1.2), dark, -2.6, 1.25, 0);                      // fifth wheel
  // Textured satin wheel dishes read as wheels, not flat white chrome blobs.
  const hc=canvas(256,256),hg=hc.getContext('2d'),rad=hg.createRadialGradient(128,128,12,128,128,125);rad.addColorStop(0,'#69747e');rad.addColorStop(.55,'#515b65');rad.addColorStop(.82,'#89939c');rad.addColorStop(1,'#59636c');hg.fillStyle=rad;hg.fillRect(0,0,256,256);hg.strokeStyle='#a2a8ad';hg.lineWidth=6;hg.beginPath();hg.arc(128,128,120,0,Math.PI*2);hg.stroke();
  for(let i=0;i<8;i++){const a=i*Math.PI/4,x=128+Math.cos(a)*76,y=128+Math.sin(a)*76;hg.fillStyle='#252b30';hg.beginPath();hg.arc(x,y,11,0,Math.PI*2);hg.fill();}hg.fillStyle='#454f58';hg.beginPath();hg.arc(128,128,40,0,Math.PI*2);hg.fill();hg.strokeStyle='#7b858e';hg.lineWidth=3;hg.stroke();
  const hubM=new THREE.MeshStandardMaterial({map:tex(hc,false),metalness:.18,roughness:.86});
  for(let i=0;i<10;i++){const a=i*Math.PI/5,x=128+Math.cos(a)*47,y=128+Math.sin(a)*47;hg.fillStyle='#20262a';hg.fillRect(x-6,y-5,12,12);hg.fillStyle='#d4dade';hg.fillRect(x-5,y-6,9,9);hg.fillStyle='#6f7e87';hg.fillRect(x-2,y-3,5,5);}hubM.map.needsUpdate=true;hubM.metalness=.42;hubM.roughness=.42;
  const tread=canvasTexture('rubber',256);tire.bumpMap=tread;tire.bumpScale=.018;
  const wheels = [];
  const wheel = (x, z, r = 0.53, par = tractor, dual = false) => {
    const wg = new THREE.Group(); wg.position.set(x, r, z); par.add(wg);
    const t = new THREE.Mesh(new THREE.CylinderGeometry(r, r, dual ? 0.6 : 0.32, segments), tire); t.rotation.x = Math.PI / 2; t.castShadow = true; wg.add(t);
    const h = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.55, r * 0.55, (dual ? 0.6 : 0.32) + 0.02, segments), hubM); h.rotation.x = Math.PI / 2; wg.add(h);
    wg.userData.radius=r;wheels.push(wg); return wg;
  };
  for (const sz of [-1, 1]) { wheel(3.1, sz * 1.02); wheel(-2.0, sz * 0.95, 0.53, tractor, true); wheel(-3.35, sz * 0.95, 0.53, tractor, true); }
  for (const x of [-2.0, -3.35]) for (const sz of [-1, 1]) add(new THREE.BoxGeometry(1.1, 0.1, 0.62), dark, x, 1.12, sz * 0.95); // mud flaps area
  // Fifth-wheel bearing plate and visible kingpin; trailer is free to yaw here.
  add(new THREE.CylinderGeometry(.58,.58,.10,low?12:24),dark,-2.6,1.14,0);
  add(new THREE.CylinderGeometry(.16,.16,.23,low?8:16),chrome,-2.6,1.2,0);
  // ---- trailer (pivot at kingpin, x=-2.6 on tractor) ----
  const trailer = new THREE.Group(); trailer.position.set(-2.6, 0, 0); root.add(trailer);
  const TL = 16, TH = 2.95, TW = 2.6, floorY = 1.25;
  const tt = trailerTexture(team, num, color, accent, scheme);
  const sideMat = new THREE.MeshPhysicalMaterial({ map: tt, metalness: 0.02, roughness: 0.9, clearcoat: 0.0 });
  const white = new THREE.MeshStandardMaterial({ color: 0xd5d5d2, metalness: 0.05, roughness: 0.85 });
  const shell = new THREE.Group(); trailer.add(shell);
  // sides as separate panels so the interior is hollow (for the loading scene)
  // inner faces: brushed aluminium (livery only on the outside; a white glossy interior blew out under the strip lights)
  const innerM = new THREE.MeshStandardMaterial({ color: 0x7a7e84, metalness: 0.55, roughness: 0.6 });
  const rearM = new THREE.MeshStandardMaterial({ color: 0x9fa3a8, metalness: 0.45, roughness: 0.7 });
  const side = (sz) => { const p = new THREE.Mesh(new THREE.BoxGeometry(TL, TH, 0.05), sz > 0 ? [white, white, white, white, sideMat, innerM] : [white, white, white, white, innerM, sideMat]); p.position.set(0.8 - TL / 2, floorY + TH / 2, sz * TW / 2); p.castShadow = true; p.receiveShadow = true; shell.add(p); return p; };
  side(1); side(-1);
  const roof = new THREE.Mesh(new THREE.BoxGeometry(TL, 0.06, TW), [white, white, white, innerM, white, white]); roof.position.set(0.8 - TL / 2, floorY + TH, 0); roof.castShadow = true; shell.add(roof);
  const front = new THREE.Mesh(new THREE.BoxGeometry(0.06, TH, TW), new THREE.MeshPhysicalMaterial({ color, metalness: .12, roughness: .72 })); front.position.set(0.8, floorY + TH / 2, 0); front.castShadow = true; shell.add(front);
  const floor = new THREE.Mesh(new THREE.BoxGeometry(TL, 0.12, TW), new THREE.MeshStandardMaterial({ color: 0x8a8d92, metalness: .2, roughness: .85 })); floor.position.set(0.8 - TL / 2, floorY - 0.06, 0); floor.receiveShadow = true; trailer.add(floor);
  const under = new THREE.Mesh(new THREE.BoxGeometry(TL - 0.5, 0.35, TW - 0.4), dark); under.position.set(0.8 - TL / 2, floorY - 0.3, 0); trailer.add(under);
  // interior cabinets at front
  const cab = new THREE.Mesh(new THREE.BoxGeometry(1.0, 2.0, TW - 0.15), new THREE.MeshStandardMaterial({ color: 0x9aa0a8, metalness: .2, roughness: .82 })); cab.position.set(0.25, floorY + 1.0, 0); trailer.add(cab);
  // rear frame + ramp door (hinged at the floor at rear)
  const rearX = 0.8 - TL;
  for (const sz of [-1, 1]) { const post = new THREE.Mesh(new THREE.BoxGeometry(0.12, TH, 0.12), rearM); post.position.set(rearX, floorY + TH / 2, sz * (TW / 2 - 0.05)); shell.add(post); }
  const hdr = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.3, TW), rearM); hdr.position.set(rearX, floorY + TH - 0.15, 0); shell.add(hdr);
  const rampPivot = new THREE.Group(); rampPivot.position.set(rearX, floorY, 0); trailer.add(rampPivot);
  const rampLen = TH - 0.35;
  const ramp = new THREE.Mesh(new THREE.BoxGeometry(rampLen, 0.08, TW - 0.16), [rearM, rearM, new THREE.MeshStandardMaterial({ color: 0x6f7378, metalness: .18, roughness: .9 }), rearM, rearM, rearM]);
  ramp.position.set(-rampLen / 2, 0, 0); ramp.castShadow = true; ramp.receiveShadow = true; rampPivot.add(ramp);
  rampPivot.rotation.z = -Math.PI / 2; // closed (vertical)
  // lights
  const red = new THREE.MeshStandardMaterial({ color: 0xff2020, emissive: 0xff0000, emissiveIntensity: 1.0 });
  for (const sz of [-1, 1]) { const tl = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.12, 0.3), red); tl.position.set(rearX - 0.08, floorY - 0.2, sz * 1.0); trailer.add(tl); }
  for (let i = 0; i < 6; i++) for (const sz of [-1, 1]) { const m = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.06, 0.03), marker); m.position.set(0.5 - i * 3, floorY + TH - 0.1, sz * (TW / 2 + 0.03)); trailer.add(m); }
  // trailer wheels (tandem)
  for (const x of [rearX + 2.6, rearX + 1.35]) for (const sz of [-1, 1]) wheel(x, sz * 0.95, 0.53, trailer, true);
  // detail: side skirts, chrome rub rail, DOT reflective tape, ICC under-ride bar, mud flaps
  const skirtM = new THREE.MeshStandardMaterial({ color: 0x1b1c20, roughness: 0.6, metalness: 0.2 });
  for (const sz of [-1, 1]) {
    const sk = new THREE.Mesh(new THREE.BoxGeometry(7.5, 0.75, 0.04), skirtM); sk.position.set(rearX + 7.6, floorY - 0.55, sz * (TW / 2 - 0.04)); trailer.add(sk);
    const rail = new THREE.Mesh(new THREE.BoxGeometry(TL, 0.09, 0.03), chrome); rail.position.set(0.8 - TL / 2, floorY + 0.03, sz * (TW / 2 + 0.03)); trailer.add(rail);
    for (let i = 0; i < 12; i++) { const tp = new THREE.Mesh(new THREE.BoxGeometry(0.62, 0.05, 0.01), i % 2 ? new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0x606060 }) : red); tp.position.set(0.2 - i * 1.3, floorY - 0.12, sz * (TW / 2 + 0.05)); trailer.add(tp); }
    const mf = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.55, 0.6), dark); mf.position.set(rearX + 0.75, 0.42, sz * 0.95); trailer.add(mf);
    const mft = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.55, 0.6), dark); mft.position.set(-3.95, 0.42, sz * 0.95); tractor.add(mft);
  }
  const icc = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.12, TW - 0.3), new THREE.MeshStandardMaterial({ color: 0xd0d0d0, metalness: 0.6, roughness: 0.4 })); icc.position.set(rearX + 0.3, 0.55, 0); trailer.add(icc);
  for (const sz of [-1, 1]) { const st = new THREE.Mesh(new THREE.BoxGeometry(0.06, 0.55, 0.08), dark); st.position.set(rearX + 0.3, 0.85, sz * 0.9); trailer.add(st); }
  // tractor extras: air horns, visor, cab steps, sleeper window
  for (const sz of [-1, 1]) { const hn = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.07, 0.7, 10), chrome); hn.rotation.z = Math.PI / 2; hn.position.set(0.6, 3.42, sz * 0.4); tractor.add(hn); }
  const visor = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.06, 2.3), paint); visor.position.set(1.62, 3.32, 0); visor.rotation.z = -0.25; tractor.add(visor);
  for (const sz of [-1, 1]) for (const y of [0.55, 0.95]) { const stp = new THREE.Mesh(new THREE.BoxGeometry(0.45, 0.05, 0.3), chrome); stp.position.set(1.0, y, sz * 1.22); tractor.add(stp); }
  for (const sz of [-1, 1]) { const sw = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.25, 0.03), glass); sw.position.set(-0.6, 3.2, sz * 1.215); tractor.add(sw); }
  // landing gear
  for (const sz of [-1, 1]) { const lg = new THREE.Mesh(new THREE.BoxGeometry(0.12, 0.9, 0.12), dark); lg.position.set(-1.5, 0.55, sz * 0.9); trailer.add(lg); }
  // Detail is decorative only; articulation, loading dimensions and wheel pivots stay unchanged.
  const plate=canvasTexture('metal',256),plateM=pbrMaterial('metal',{metalness:.55,roughness:.65},[3,1]);floor.material=plateM;ramp.material=[rearM,rearM,plateM,rearM,rearM,rearM];cab.material=new THREE.MeshStandardMaterial({map:canvasTexture('cabinet',256),metalness:.22,roughness:.55});
  const ribs=[],grips=[],rivets=[],hinges=[];for(let i=0;i<12;i++)grips.push({x:-.12-i*(rampLen-.24)/11,y:.05,z:0});instances(rampPivot,new THREE.BoxGeometry(.035,.02,TW-.25),dark,grips);
  for(const sz of[-1,1]){for(let i=0;i<10;i++){ribs.push({x:rearX+.6+i*1.5,y:floorY+TH/2,z:sz*1.245});if(!low)for(const y of[floorY+.25,floorY+TH-.25])rivets.push({x:rearX+.35+i*1.65,y,z:sz*1.334});}for(let i=0;i<3;i++)hinges.push({x:rearX-.08,y:floorY+.5+i*.9,z:sz*1.23});const rail=add(new THREE.CylinderGeometry(.045,.045,TL,low?8:14),chrome,.8-TL/2,floorY+TH,sz*1.29,trailer,false);rail.rotation.z=Math.PI/2;
  add(round(.25,.07,.12,.02),chrome,.9,2.3,sz*1.22);for(const x of[1.35,1.65])add(new THREE.BoxGeometry(.045,.3,.045),chrome,x,2.6,sz*1.28,tractor,false);add(round(.28,.08,.3,.03),chrome,-1.5,.12,sz*.9,trailer,false);}
  instances(trailer,new THREE.BoxGeometry(.045,TH-.1,.035),innerM,ribs);if(rivets.length)instances(trailer,new THREE.SphereGeometry(.018,6,4),chrome,rivets);instances(trailer,new THREE.CylinderGeometry(.045,.045,.16,10),chrome,hinges);
  root.userData = { tractor, trailer, rampPivot, roof, shell, wheels, floorY, rearX, TL, TW, rampLen,detail };
  batchStatic(tractor);batchStatic(trailer,[roof]);batchStatic(shell,[roof]);
  return root;
}

export function makeTrafficCar(kind = 'car') {
  const g = new THREE.Group();
  const cols = [0xb8bcc2, 0x222428, 0x8a1c1c, 0x1b3c78, 0xe9e9e9, 0x4d5b3a, 0x6b4a2a, 0x2a5f6b];
  const paint = new THREE.MeshPhysicalMaterial({ color: cols[Math.floor(Math.random() * cols.length)], metalness: .15, roughness: .68, clearcoat: .15, clearcoatRoughness:.7 });
  const glass = new THREE.MeshStandardMaterial({ color: 0x17202a, metalness: .05, roughness: .65 });
  const tire = new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 });
  const tl = new THREE.MeshStandardMaterial({ color: 0xff1010, emissive: 0xff0000, emissiveIntensity: 0.8 });
  const add = (geo, m, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); o.castShadow = true; g.add(o); return o; };
  let L = 4.7, W = 1.85;
  if (kind === 'pickup') {
    L = 5.6; W = 2.0; add(new THREE.BoxGeometry(L, 0.9, W), paint, 0, 0.95, 0); add(new THREE.BoxGeometry(1.9, 0.8, W - 0.1), paint, 0.3, 1.8, 0);
    add(new THREE.BoxGeometry(1.95, 0.55, W - 0.05), glass, 0.3, 1.8, 0);
  } else {
    add(new THREE.BoxGeometry(L, 0.7, W), paint, 0, 0.75, 0);
    add(new THREE.BoxGeometry(2.3, 0.62, W - 0.15), paint, -0.25, 1.38, 0);
    add(new THREE.BoxGeometry(2.36, 0.48, W - 0.1), glass, -0.25, 1.36, 0);
  }
  for (const sz of [-1, 1]) {
    const t = add(new THREE.BoxGeometry(0.05, 0.14, 0.42), tl, -L / 2 - 0.02, 0.95, sz * (W / 2 - 0.3));
    for (const x of [L / 2 - 0.9, -L / 2 + 0.9]) { const w = add(new THREE.CylinderGeometry(0.36, 0.36, 0.26, 16), tire, x, 0.36, sz * (W / 2 - 0.05)); w.rotation.x = Math.PI / 2; }
    const hl = add(new THREE.BoxGeometry(0.05, 0.12, 0.35), new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff6dd, emissiveIntensity: 1.1 }), L / 2 + 0.02, 0.85, sz * (W / 2 - 0.3));
  }
  g.userData = { L, W, wheelRest:[] };for(const sz of [-1,1])for(const x of [L/2-.9,-L/2+.9])g.userData.wheelRest.push({x,y:.36,z:sz*(W/2-.05)});g.userData.wheels=g.children.filter(o=>o.geometry?.type==='CylinderGeometry');
  return g;
}

// ---------- Dust particles ----------
export class Dust {
  constructor(scene, max = 2500, color = 0xa0623a) {
    this.max = max; this.n = 0; this.i = 0;
    this.pos = new Float32Array(max * 3); this.vel = new Float32Array(max * 3); this.life = new Float32Array(max); this.maxLife = new Float32Array(max);
    this.size = new Float32Array(max); this.alpha = new Float32Array(max);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    geo.setAttribute('aAlpha', new THREE.BufferAttribute(this.alpha, 1).setUsage(THREE.DynamicDrawUsage));
    this.mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { uColor: { value: new THREE.Color(color) }, uScale: { value: 600 }, uLight: { value: 1.0 } },
      vertexShader: `attribute float aSize; attribute float aAlpha; varying float vA; uniform float uScale;
        void main(){ vec4 mv = modelViewMatrix*vec4(position,1.0);vA=aAlpha*smoothstep(1.5,4.5,-mv.z);gl_PointSize=min(200.0,aSize*uScale/max(-mv.z,.5)); gl_Position = projectionMatrix*mv; }`,
      fragmentShader: `uniform vec3 uColor; uniform float uLight; varying float vA;
        void main(){ vec2 c = gl_PointCoord-0.5; float r = length(c); float a = (1.0 - smoothstep(0.05, 0.5, r)) * vA; if(a<0.004) discard; gl_FragColor = vec4(uColor*uLight*(0.85+0.3*(0.5-c.y)), a);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
        }`,
    });
    this.points = new THREE.Points(geo, this.mat); this.points.frustumCulled = false; scene.add(this.points);
  }
  setBudget(n){this.budget=Math.max(1,Math.min(this.max,n));this.i%=this.budget;this.points.geometry.setDrawRange(0,this.budget);for(let i=this.budget;i<this.max;i++){this.life[i]=0;this.alpha[i]=0;}this.points.geometry.attributes.aAlpha.needsUpdate=true;}
  emit(x, y, z, vx, vy, vz, size = 1.5, life = 2.0) {
    const i = this.i; this.i = (this.i + 1) % (this.budget||this.max);
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life; this.size[i] = size;
  }
  update(dt) {
    for (let i = 0; i < (this.budget||this.max); i++) {
      if (this.life[i] <= 0) { this.alpha[i] = 0; continue; }
      this.life[i] -= dt; const k = this.life[i] / this.maxLife[i];
      this.pos[i * 3] += this.vel[i * 3] * dt; this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt; this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      this.vel[i * 3] *= (1 - 1.6 * dt); this.vel[i * 3 + 2] *= (1 - 1.6 * dt); this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * (1 - dt) + 0.15 * dt;
      this.size[i] += dt * 2.2;
      this.alpha[i] = Math.max(0, Math.min(1, k * 1.4)) * 0.30 * Math.min(1, (1 - k) * 8);
    }
    const g = this.points.geometry; g.attributes.position.needsUpdate = true; g.attributes.aSize.needsUpdate = true; g.attributes.aAlpha.needsUpdate = true;
  }
}

export function disposeScene(scene) {
  scene.traverse(o => {
    if(o.isLight&&o.shadow)o.shadow.dispose();
    if(o.isInstancedMesh)o.dispose(); // Release per-instance GPU buffers as well as shared geometry.
    if (o.geometry) o.geometry.dispose();
    if (o.material) (Array.isArray(o.material) ? o.material : [o.material]).forEach(m => { for (const k in m) { const v = m[k]; if (v && v.isTexture) v.dispose(); } m.dispose(); });
  });
}
