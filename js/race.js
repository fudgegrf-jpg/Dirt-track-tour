import {PLAYER_ID} from './driver-identity.js';
import {stadiumTowers} from './stadium-lights.js';
import {batchNightStatic,nightRaceArt} from './night-race.js';
import {buildDrivableInfield,buildInfieldObstacles,collideInfield,retireAI,updateRetirements,updateInfieldProgress,updateRetirementVisuals} from './infield.js';
import {pitGateS,pitGateHalfArc,inPitGate} from './pit-gate.js';
import {raceGrass} from './grass-3d.js';
import {matteClay,matteClayShader} from './clay-matte.js';
import {buildSalina} from './salina.js';
import {pbrMaps,pbrMaterial} from './gfx2-materials.js';
import {foliageMap,crownGeometry,pineGeometry} from './foliage.js';
import {groundObject,groundFoot} from './grounding.js';
import {polishInfield} from './world-polish.js';
import { createPitWorld } from './pits.js';
import { PaceCar } from './pace-car.js';
import { DEFAULT_DRIVER, DEFAULT_PROFILE } from './data.js';
import {qualityPreset} from './quality.js';
import { ContactShadow } from './contact.js';
import * as THREE from 'three';
import { OvalTrack, makeCar, stepCar, wallCollide, resolveWallPenetration, recoverWallStuck, cooldownInput, allWheelsOffClay, carCollide, aiInput, checkStuck, computeDraft, grooveTimes, DIFFICULTY, clamp, lerp, wrapAngle } from './physics.js';
const _vContact = new THREE.Vector3();
const _vF = new THREE.Vector3(), _vR = new THREE.Vector3(), _vU = new THREE.Vector3(), _mB = new THREE.Matrix4(), _qS = new THREE.Quaternion(), _qB = new THREE.Quaternion(), _eB = new THREE.Euler();
import { TRACKS, AI_DRIVERS, POINTS, PURSE, BONUS } from './data.js';
import { makeLateModel, WHEEL_R, DRIVER_EYE, makeSky, dirtTextures, grassTexture, bannerTexture, fenceTexture, glowTexture, trailerTexture, Dust, disposeScene, srand, rnd } from './gfx.js';

// Every championship show is now run under the lights. Highway time remains independent.
const SKY_PRESET = {salina:'night',eldora:'night',i55:'night',knoxville:'night',charlotte:'night'};
const SKIES = {
  day:{fog:0x9cb9cf,fogD:.0006,hemi:[0xc4d9ee,0x4d4331,.85],pool:.12,sky:{top:0x114e9a,horizon:0xb1d1e7,bottom:0x303d28,sunDir:[-.4,.75,-.5],sunColor:0xfff3d8,sunSize:.028,glow:0xffe0b0,glowAmt:.06,starAmt:0,moon:[0,-1,0]}},
  dusk: { fog: 0x2b2030, fogD: 0.0017, hemi: [0xa8a8d0, 0x3a2414, 0.75], pool: 0.22,
    sky: { top: 0x0c1636, horizon: 0x6a3e52, bottom: 0x120c0c, sunDir: [0.75, 0.015, -0.66], sunColor: 0xff7a38, sunSize: 0.09, glow: 0xff6a28, glowAmt: 1.0, starAmt: 0.45, moon: [-0.55, 0.38, 0.6] } },
  twilight: { fog: 0x17141f, fogD: 0.0019, hemi: [0x8f98c8, 0x2a1a10, 0.62], pool: 0.32,
    sky: { top: 0x050a1e, horizon: 0x3a2a4a, bottom: 0x08060a, sunDir: [0.7, -0.04, -0.7], sunColor: 0x7a3a50, sunSize: 0.0, glow: 0xc05a40, glowAmt: 0.55, starAmt: 0.8, moon: [-0.5, 0.45, 0.55] } },
  night: { fog: 0x080c16, fogD: 0.0019, hemi: [0x8293b8, 0x241a12, 0.38], pool: 0.72,
    sky: { top: 0x02040b, horizon: 0x101827, bottom: 0x07060a, sunDir: [0.4, 0.35, -0.8], sunColor: 0x000000, sunSize: 0.0, glow: 0x40304a, glowAmt: 0.10, starAmt: 0.8, moon: [-0.45, 0.5, 0.6] } },
};

export class RaceScene {
  constructor(app, { track, attract = false, startBack = false }) {
    track=TRACKS.find(t=>t.id===track?.id)||TRACKS[0]; // archived/unknown quick-race inputs cannot load disabled venues
    this.app = app; this.T = track; this.attract = attract;
    this.trk = new OvalTrack({ ...track, surfaceQuality: app.quality || 'high' }); grooveTimes(this.trk);   // AI 'track reading' table (~0.1 s, once per track)
    this.scene = new THREE.Scene();this.groundSupports=[];
    // tamer bloom/exposure under the lights: glossy white/yellow liveries were blooming into blobs
    if (app.bloom) { app.bloom.strength = 0.08; app.bloom.radius = 0.25; app.bloom.threshold = 3; app.renderer.toneMappingExposure = 0.95; }
    this.camera = new THREE.PerspectiveCamera(62, innerWidth / innerHeight, 0.1, 6000);
    this.camMode = (!attract && app.settings?.cam === 'incar') ? 1 : 0; this.time = 0; this.phase = attract ? 'attract' : 'pace'; this.acc = 0;
    this.flag = attract ? 'green' : 'pace'; this.paceT = 0; this.greenT = 0; this.cautions = 0; this.cautionT = 0; this.excite = 0.3;
    this.finishOrder = []; this.cool = 0; this.msgT = 0;
    this.trk.dry = 0.06 + (1 - (track.cushion ?? 1)) * 0.2; this.dry0 = this.trk.dry;
    this.dryU = { value: this.trk.dry };
    srand(track.id.length * 977 + 13);
    this.buildWorld();
    this.buildCars(startBack);
    this.nightArt=nightRaceArt(this);
    if (!attract) this.buildHud();
    if (!attract) this.paceCar=new PaceCar(this);   // Night19: visible pace car on the invisible pace logic
    this.orbit=0;this.order=[...this.cars];
    for(const c of this.cars){c.speed=Math.hypot(c.vx,c.vz);c.previousPose={x:c.x,z:c.z,th:c.th};c.renderPose={x:c.x,z:c.z,th:c.th};}
    this.updateVisuals(0);this.updateCamera(1/60);if(!attract)this.updateHud();
  }
  // One height query for ground-anchored props outside the racing ribbon.
  terrainHeight(x,z){const t=this.trk,q=t.project(x,z);if(this.pits&&Math.abs(x-this.pits.origin.x)<=75&&z>=-51&&z<=41)return 0;const road=this.pits?.road.heightAt(x,z);if(road!==null&&road!==undefined)return road;const apron=this.pits?.lot?.heightAt(x,z);if(apron!==null&&apron!==undefined)return apron;
    if(q.d<=t.outer+.2)return this.infield?.heightAt(x,z)??t.height(q.s,q.d);
    return outsideHeight(t,q.s,q.d-t.outer);
  }
  trackHeightAt(x,z){const q=this.trk.project(x,z),D=this.trackD,M=D.length,N=this.trackN,P=this.trackGeo.attributes.position,seed=Math.floor(q.s/this.trk.P*N);let lane=D.findIndex(d=>d>q.d)-1;if(lane<0)lane=q.d<D[0]?0:M-2;
    for(let row=seed-1;row<=seed+1;row++){const i=(row%N+N)%N;for(let j=Math.max(0,lane-1);j<=Math.min(M-2,lane+1);j++){const a=i*M+j,b=a+M;for(const [u,v,w]of[[a,a+1,b],[b,a+1,b+1]]){const ax=P.getX(u),az=P.getZ(u),bx=P.getX(v),bz=P.getZ(v),cx=P.getX(w),cz=P.getZ(w),den=(bz-cz)*(ax-cx)+(cx-bx)*(az-cz);if(Math.abs(den)<1e-10)continue;const A=((bz-cz)*(x-cx)+(cx-bx)*(z-cz))/den,B=((cz-az)*(x-cx)+(ax-cx)*(z-cz))/den,C=1-A-B;if(A>=-1e-7&&B>=-1e-7&&C>=-1e-7)return A*P.getY(u)+B*P.getY(v)+C*P.getY(w);}}}return null;
  }
  retire(){if(this.ended||this.player.finished)return;this.player.dnf=true;this.player.vx=this.player.vz=this.player.w=0;this.phase='cooldown';this.cool=0;this.flash('DNF — recovery crew to Bay '+this.app.state.num,.3,'#ffb478');}
  // ------------------------------------------------------------------ world
  buildWorld() {
    const { scene, trk, T } = this;
    const preset = SKY_PRESET[T.id] || 'night', SK = SKIES[preset]; this.skyPreset = preset;
    const haze=new THREE.Color(SK.sky.horizon).add(new THREE.Color(SK.sky.glow).multiplyScalar(SK.sky.glowAmt*.30));
    scene.fog = new THREE.FogExp2(haze, SK.fogD * 1.12);
    this.sky = makeSky({ ...SK.sky, horizon:haze, stars: true }); scene.add(this.sky);
    scene.add(new THREE.HemisphereLight(SK.hemi[0], 0x706358, SK.hemi[2]));
    scene.add(new THREE.AmbientLight(0x8392ad, 0.07));
    // main "stadium light" key light with shadows (follows the player)
    const key = new THREE.DirectionalLight(0xffefd5, 2.3); key.castShadow = true;
    key.shadow.mapSize.set(2048, 2048); const sc = key.shadow.camera; sc.left = -70; sc.right = 70; sc.top = 70; sc.bottom = -70; sc.near = 1; sc.far = 300;
    key.shadow.bias = -0.00002; key.shadow.normalBias = 0.006;
    scene.add(key); scene.add(key.target); this.key = key;
    const fill = new THREE.DirectionalLight(0xc8d4ff, 0.4); fill.position.set(-80, 60, 120); scene.add(fill);

    // ground
    const gt = grassTexture('#26391b'); gt.repeat.set(220, 220);
    const ground = new THREE.Mesh(new THREE.PlaneGeometry(3000, 3000), new THREE.MeshStandardMaterial({ map: gt, roughness: 1, color: 0x9aa890,polygonOffset:true,polygonOffsetFactor:2,polygonOffsetUnits:4 }));
    ground.rotation.x = -Math.PI / 2; ground.position.y = trk.smooth ? -0.3 : -0.2; ground.receiveShadow = true; scene.add(ground);

    // ----- the clay oval (banked ribbon with grooves) -----
    const dirt = dirtTextures(T.clay); this.dirt = dirt;
    const detail=qualityPreset(this.app.quality),N=detail.trackN, dList = trk.smooth
      ? Array.from({ length: 20 }, (_, j) => -T.W / 2 - 5 + j * 0.25)
      : [-T.W / 2 - 5, -T.W / 2 - 2.5, -T.W / 2 - 0.3];
    for (let j = 0; j <= detail.lanes; j++) dList.push(-T.W / 2 + T.W * j / detail.lanes);
    dList.push(trk.outer + 0.2);
    const M = dList.length, lane = new Float32Array((N + 1) * M), pos = new Float32Array((N + 1) * M * 3), uv = new Float32Array((N + 1) * M * 2), col = new Float32Array((N + 1) * M * 3);
    for (let i = 0; i <= N; i++) {
      const s = i / N * trk.P;
      for (let j = 0; j < M; j++) {
        const d = dList[j], p = trk.point(s, d), h = trk.height(s, Math.min(d, T.W / 2 + 0.6));
        const k = (i * M + j);
        pos[k * 3] = p.x; pos[k * 3 + 1] = h; pos[k * 3 + 2] = p.z;
        uv[k * 2] = s / 7; uv[k * 2 + 1] = d / 7;
        const u = d / (T.W / 2); lane[i * M + j] = d < -T.W / 2 - 0.2 ? -2 : u;
        let c = 1.0, r = 1.0;
        if (d < -T.W / 2 - 0.2) { c = 0.62; }                                       // apron/infield edge (packed, darker)
        else if (u < -0.15 && u > -0.85) c = 0.72 + 0.12 * Math.abs(u + 0.5) * 2;   // black slick groove at the bottom
        else if (u > 0.62) { c = 1.22; r = 1.08; }                                  // loose cushion: lighter, redder
        const wob = 0.94 + 0.12 * Math.sin(s * 0.13 + d) * Math.sin(s * 0.031);
        col[k * 3] = c * r * wob; col[k * 3 + 1] = c * wob; col[k * 3 + 2] = c * wob * (r > 1 ? 0.92 : 1);
      }
    }
    const idx = [];
    for (let i = 0; i < N; i++) for (let j = 0; j < M - 1; j++) { const a = i * M + j, b = a + M; idx.push(a, a + 1, b, b, a + 1, b + 1); }
    const tg = new THREE.BufferGeometry(); tg.setAttribute('position', new THREE.BufferAttribute(pos, 3)); tg.setAttribute('uv', new THREE.BufferAttribute(uv, 2)); tg.setAttribute('color', new THREE.BufferAttribute(col, 3)); tg.setAttribute('aLane', new THREE.BufferAttribute(lane, 1)); tg.setIndex(idx); tg.computeVertexNormals(); closeRibbonNormals(tg, N, M);
    this.trackGeo=tg;this.trackN=N;this.trackD=dList;
    const suv=new Float32Array((N+1)*M*2);
    for(let i=0;i<=N;i++)for(let j=0;j<M;j++){const k=(i*M+j)*2;suv[k]=i/N;suv[k+1]=Math.max(0,Math.min(1,(dList[j]+T.W/2)/T.W));}
    tg.setAttribute('aSurfaceUv',new THREE.BufferAttribute(suv,2));
    trk.surface.upload();
    this.surfaceTex=new THREE.DataTexture(trk.surface.bytes,trk.surface.N,trk.surface.M,THREE.RGBAFormat);
    this.surfaceTex.wrapS=THREE.RepeatWrapping;this.surfaceTex.magFilter=THREE.LinearFilter;this.surfaceTex.minFilter=THREE.LinearFilter;this.surfaceTex.needsUpdate=true;
    const trackMat = matteClay({ map: dirt.map, bumpMap: dirt.bump, normalMap: dirt.normal, normalScale:new THREE.Vector2(.28,.28), roughnessMap:dirt.roughness, bumpScale: 0.022, roughness: 0.96, metalness: 0, vertexColors: true });
    // light pools under each pole bank + the bottom groove going black & darkens as the track dries/rubbers in; never polished/glossy
    this.pools = Array.from({ length: 24 }, () => new THREE.Vector3(1e5, 1e5, 1));
    const dryU = this.dryU, pools = this.pools, surfaceTex=this.surfaceTex, surfaceSize=this.surfaceSize=new THREE.Vector2(trk.surface.N,trk.surface.M);
    trackMat.onBeforeCompile = sh => {
      sh.uniforms.uSurface={value:surfaceTex};sh.uniforms.uSurfaceSize={value:surfaceSize};
      sh.uniforms.uPools = { value: pools }; sh.uniforms.uDry = dryU; sh.uniforms.uPoolAmt = { value: SK.pool };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute float aLane; attribute vec2 aSurfaceUv; varying vec2 vSurfaceUv; varying float vLane; varying vec3 vWPos; varying float vLightPool; uniform vec3 uPools[24];')
        .replace('#include <project_vertex>', '#include <project_vertex>\nvLane = aLane; vSurfaceUv=aSurfaceUv; vWPos = (modelMatrix * vec4(transformed, 1.0)).xyz;vLightPool=0.;for(int i=0;i<24;i++){vec2 dd=vWPos.xz-uPools[i].xy;vLightPool+=exp(-dot(dd,dd)/(uPools[i].z*uPools[i].z));}');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform sampler2D uSurface; uniform vec2 uSurfaceSize; varying vec2 vSurfaceUv; uniform float uDry,uPoolAmt;varying float vLane,vLightPool;varying vec3 vWPos;')
        .replace('#include <color_fragment>', `#include <color_fragment>
          vec2 su=vec2(vSurfaceUv.x+0.5/uSurfaceSize.x,vSurfaceUv.y*(1.0-1.0/uSurfaceSize.y)+0.5/uSurfaceSize.y);
          vec4 surface=texture2D(uSurface,su);
          float rubber=surface.r*uDry*(1.0-smoothstep(-0.1,0.4,vLane));
          float grv = (1.0 - smoothstep(0.05, 0.42, abs(vLane + 0.45))) * step(-1.5, vLane);
          float cush = smoothstep(0.55, 0.8, vLane);
          diffuseColor.rgb *= (1.0 - uDry * 0.30 * grv)*(1.0-rubber*0.62);
          diffuseColor.rgb *= 1.0 + surface.g * sin(vWPos.x*18.0+vWPos.z*13.0)*0.14;
          // Fine longitudinal comb marks and a warm dusty cushion; the darker
          // worked-in line evolves with surface.r, but stays physically matte.
          float comb=.5+.5*sin(vLane*540.0+sin(vSurfaceUv.x*490.0)*.7);
          diffuseColor.rgb*=vec3(.93,.97,1.02)*(1.0-comb*grv*.065);
          diffuseColor.rgb=mix(diffuseColor.rgb,diffuseColor.rgb*vec3(.86,.83,.77),grv*(1.0-uDry)*.24);
          diffuseColor.rgb = mix(diffuseColor.rgb, diffuseColor.rgb * vec3(1.18, 1.09, .99), cush * (.35+uDry*.65));`)
        .replace('#include <roughnessmap_fragment>', '#include <roughnessmap_fragment>\n roughnessFactor = clamp(0.99 - 0.025 * (1.0-uDry) * grv, 0.965, 1.0);')
        .replace('#include <normal_fragment_maps>', `#include <normal_fragment_maps>
          float rutBump=surface.g*(surface.a*0.04 + sin(vWPos.x*22.0+vWPos.z*15.0)*0.003);
          normal = perturbNormalArb(-vViewPosition,normal,vec2(dFdx(rutBump),dFdy(rutBump)),faceDirection);`)
        .replace('#include <opaque_fragment>', `outgoingLight += diffuseColor.rgb * vec3(1.0, 0.92, 0.78) * uPoolAmt * min(vLightPool, 1.5) * (0.20 + 0.80 * getShadowMask());
          #include <opaque_fragment>`);
      sh.fragmentShader=sh.fragmentShader.replace('#include <shadowmap_pars_fragment>','#include <shadowmap_pars_fragment>\n#include <shadowmask_pars_fragment>');
      matteClayShader(sh);
    };
    trackMat.customProgramCacheKey=()=>'dusty-clay-shadowed-pools-v3';this.trackMaterial=trackMat;trackMat.color.setRGB(1.24,1.22,1.19);trackMat.userData.night7ClayLift=1.22;
    const tm = new THREE.Mesh(tg, trackMat);tm.name='matte-clay-track'; tm.receiveShadow = true; scene.add(tm);

    buildDrivableInfield(this);

    // ----- outer wall with sponsor banners + catch fence -----
    const ban = bannerTexture();
    const wallGeo = sponsorWallRibbon(trk, N);
    const wallMaps=pbrMaps('concrete',[12,1]);wallMaps.map.dispose();const wall = new THREE.Mesh(wallGeo, new THREE.MeshStandardMaterial({ map: ban, normalMap:wallMaps.normalMap,normalScale:new THREE.Vector2(.3,.3),roughnessMap:wallMaps.roughnessMap,roughness: .9 })); wall.name='outer-sponsor-wall';wall.castShadow = true; wall.receiveShadow = true; scene.add(wall);
    const ft = fenceTexture(); ft.repeat.set(1, 3.5);
    const fenceGeo = ribbon(trk, N, s => { const h = trk.height(s, trk.outer) + 1.15; return [[trk.outer + 0.15, h], [trk.outer + 0.15, h + 5.2]]; }, [0, 1], 1.6);
    const fence = new THREE.Mesh(fenceGeo, new THREE.MeshStandardMaterial({ map: ft, alphaTest: 0.4, transparent: false, side: THREE.DoubleSide, metalness: .15, roughness: .8, color: 0x9a9da2 }));
    scene.add(fence);
    // posts + top cable
    const postN = Math.floor(trk.P / 5);
    const posts = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.06, 0.06, 5.4, 6), new THREE.MeshStandardMaterial({ color: 0x9aa0a6, metalness: .15, roughness: .8 }), postN);
    const mtx = new THREE.Matrix4();
    for (let i = 0; i < postN; i++) { const s = i * 5, p = trk.point(s, trk.outer + 0.2), h = trk.height(s, trk.outer) + 1.15 + 2.7; mtx.makeTranslation(p.x, inPitGate(trk,s)?-100:h, p.z); posts.setMatrixAt(i, mtx); }
    scene.add(posts);
    // outer embankment down to ground
    const emb = ribbon(trk, N, s => { const h = trk.height(s, trk.outer); return [[trk.outer + 0.35, h], [trk.outer + 4 + h * 1.6, trk.smooth ? -0.3 : -0.18]]; }, [0, 1], 10);
    // This ribbon's profile runs from track edge outward: reverse its wall-oriented winding.
    for(let i=0;i<emb.index.count;i+=3){const b=emb.index.getX(i+1);emb.index.setX(i+1,emb.index.getX(i+2));emb.index.setX(i+2,b);}emb.computeVertexNormals();closeRibbonNormals(emb,N,2);
    this.embankmentGeo=emb;
    const embT = grassTexture('#2a3d1e'); embT.repeat.set(1, 1);
    scene.add(Object.assign(new THREE.Mesh(emb, new THREE.MeshStandardMaterial({ map: embT, roughness: 1 })), { receiveShadow: true }));

    // Low, sparse, drive-over inside markers (not a continuous collision wall).
    const tireN = Math.floor(trk.P / 24);
    const tires = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.42, 0.42, 0.18, 10), new THREE.MeshStandardMaterial({ color: 0xffffff, roughness: 0.85 }), tireN);
    const cA = new THREE.Color(0x151515), cB = new THREE.Color(0xe8e8e8);
    for (let i = 0; i < tireN; i++) { const s = i * 24, p = trk.point(s, -T.W/2-5.6); mtx.makeTranslation(p.x, this.infield.heightAt(p.x,p.z)+.09, p.z); tires.setMatrixAt(i, mtx); tires.setColorAt(i, (Math.floor(i / 3) % 2) ? cA : cB); }
    tires.castShadow = true; scene.add(tires);

    // start/finish line + checkered flag stand
    { const sp = [], si = []; const n = 12; for (let j = 0; j <= n; j++) { const d = -T.W / 2 + T.W * j / n; for (const ds of [-0.45, 0.45]) { const p = trk.point(ds, d); sp.push(p.x, trk.height(ds, d) + 0.04, p.z); } }
      for (let j = 0; j < n; j++) { const a = j * 2; si.push(a, a + 2, a + 1, a + 1, a + 2, a + 3); }
      const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(sp, 3)); g.setIndex(si); g.computeVertexNormals();
      const sf = new THREE.Mesh(g, new THREE.MeshStandardMaterial({ color: 0xf4f0e8, roughness: 0.85, side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2 })); sf.receiveShadow = true; scene.add(sf); }
    const steel = new THREE.MeshStandardMaterial({ color: 0x414950, metalness: .12, roughness: .88 });
    const stand = new THREE.Group();
    const fsW = T.W + 4;
    const beam = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.2, fsW), steel); beam.position.set(0, 9, T.R + 1); stand.add(beam);
    for (const z of [T.R - fsW / 2 + 1, T.R + fsW / 2 + 1]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.5, 9, 0.5), steel); leg.position.set(0, 4.5, z); leg.castShadow = true; stand.add(leg); }
    const ckTex = (() => { const c = document.createElement('canvas'); c.width = 256; c.height = 64; const g = c.getContext('2d'); for (let x = 0; x < 16; x++) for (let y = 0; y < 4; y++) { g.fillStyle = (x + y) % 2 ? '#111' : '#fff'; g.fillRect(x * 16, y * 16, 16, 16); } const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; return t; })();
    for (const x of [-0.82, 0.82]) { const ck = new THREE.Mesh(new THREE.PlaneGeometry(fsW, 1.0), new THREE.MeshStandardMaterial({ map: ckTex, emissive: 0x333333, emissiveMap: ckTex })); ck.position.set(x, 9, T.R + 1); ck.rotation.y = x > 0 ? Math.PI / 2 : -Math.PI / 2; stand.add(ck); }
    // flagman on the stand (outside end) — waves the flag that matches the race state
    { const fm = new THREE.Group(); fm.position.set(0, 9.6, T.R + fsW / 2 - 0.4);
      const shirtM = new THREE.MeshStandardMaterial({ color: 0xf2f2f2, roughness: 0.8 }), skin = new THREE.MeshStandardMaterial({ color: 0xc89070, roughness: 0.8 });
      const pl = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.15, 2.2), steel); pl.position.y = -0.1; fm.add(pl);
      const rail = new THREE.Mesh(new THREE.BoxGeometry(2.2, 0.06, 0.06), steel); rail.position.set(0, 1.0, -1.08); fm.add(rail);
      const legs = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.85, 0.42), new THREE.MeshStandardMaterial({ color: 0x1b2230 })); legs.position.y = 0.43; fm.add(legs);
      const torso = new THREE.Mesh(new THREE.BoxGeometry(0.32, 0.62, 0.5), shirtM); torso.position.y = 1.17; fm.add(torso);
      const head = new THREE.Mesh(new THREE.SphereGeometry(0.15, 10, 8), skin); head.position.y = 1.62; fm.add(head);
      const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.16, 0.16, 0.08, 10), new THREE.MeshStandardMaterial({ color: 0x111111 })); cap.position.y = 1.72; fm.add(cap);
      const arm = new THREE.Group(); arm.position.set(0, 1.42, -0.3); fm.add(arm);
      const ua = new THREE.Mesh(new THREE.BoxGeometry(0.1, 0.6, 0.1), shirtM); ua.position.y = 0.28; arm.add(ua);
      const stick = new THREE.Mesh(new THREE.CylinderGeometry(0.015, 0.015, 0.9, 5), steel); stick.position.y = 0.95; arm.add(stick);
      const flagMat = new THREE.MeshStandardMaterial({ color: 0x22cc44, emissive: 0x22cc44, emissiveIntensity: 0.5, side: THREE.DoubleSide, roughness: 0.8 });
      const fg = new THREE.Mesh(new THREE.PlaneGeometry(0.9, 0.62, 6, 1), flagMat); fg.position.set(0.47, 1.15, 0); arm.add(fg);
      fm.rotation.y = Math.PI / 2; // faces the oncoming cars
      stand.add(fm); this.flagman = { arm, flag: fg, mat: flagMat, ck: ckTex };
    }
    scene.add(stand);

    const standStart=scene.children.length;
    // ----- grandstands with crowd along the frontstretch -----
    const standZ = T.R + trk.outer + (trk.smooth ? 24 : 7);
    const gsMat = new THREE.MeshStandardMaterial({ color: 0x7d8288, metalness: 0.5, roughness: 0.6 });
    const len = T.L + 70, rows = 16;
    const crowdMat = new THREE.MeshStandardMaterial({ roughness: 0.9 }); this.crowdU = { uTime: { value: 0 }, uExcite: { value: 0.3 } };
    crowdMat.onBeforeCompile = sh => {
      Object.assign(sh.uniforms, this.crowdU);
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime, uExcite;')
        .replace('#include <begin_vertex>', `#include <begin_vertex>
          float ph = instanceMatrix[3].x * 1.7 + instanceMatrix[3].z * 3.1;
          float up = max(0.0, sin(uTime * (3.0 + fract(ph) * 3.0) + ph)) * uExcite * step(0.45, fract(ph * 0.37 + 0.2));
          transformed.y += up * 0.28 + sin(uTime * 1.3 + ph) * 0.02;`);
    };
    const people = new THREE.InstancedMesh(new THREE.BoxGeometry(0.45, 0.8, 0.35), crowdMat, Math.floor(len / 0.62) * rows);
    let pi = 0; const shirt = [0xc81d25, 0x1e5fd8, 0xf2c014, 0xffffff, 0x222222, 0x1f9e4a, 0xff6a00, 0x7a2bd1, 0x8a6a4a, 0x445566];
    for (let r = 0; r < rows; r++) {
      const step = new THREE.Mesh(new THREE.BoxGeometry(len, 0.5 + r * 0.55, 0.95), gsMat);
      step.position.set(0, (0.5 + r * 0.55) / 2, standZ + r * 0.95); step.receiveShadow = true; step.castShadow = r % 4 === 0; scene.add(step);
      for (let x = -len / 2 + 0.4; x < len / 2 - 0.3; x += 0.62) {
        if (rnd() < 0.18 || rnd()>detail.crowd || T.id==='salina'&&[-60,-20,20,60].some(a=>Math.abs(x-a)<1)) continue;
        mtx.makeTranslation(x + (rnd() - 0.5) * 0.15, 0.5 + r * 0.55 + 0.4, standZ + r * 0.95 - 0.1); people.setMatrixAt(pi, mtx);
        people.setColorAt(pi, new THREE.Color(shirt[Math.floor(rnd() * shirt.length)]).multiplyScalar(0.6 + rnd() * 0.5)); pi++;
      }
    }
    people.count = pi;people.name='grandstand-crowd';scene.add(people);
    const roofM = new THREE.Mesh(new THREE.BoxGeometry(len, 0.4, rows * 0.95 + 4), steel); roofM.position.set(0, 0.5 + rows * 0.55 + 6, standZ + rows * 0.95 / 2 + 1); roofM.castShadow = true; scene.add(roofM);
    const press = new THREE.Mesh(new THREE.BoxGeometry(26, 4, 5), new THREE.MeshStandardMaterial({ color: 0x3b2a20, roughness: 0.5 })); press.position.set(0, 0.5 + rows * 0.55 + 2.8, standZ + rows * 0.95 + 1); scene.add(press);
    const pressWin = new THREE.Mesh(new THREE.PlaneGeometry(24, 1.6), new THREE.MeshStandardMaterial({ color: 0xffd9a0, emissive: 0xffc070, emissiveIntensity: 1.2 })); pressWin.position.set(0, 0.5 + rows * 0.55 + 3.1, standZ + rows * 0.95 - 1.55); pressWin.rotation.y = Math.PI; scene.add(pressWin);
    // track name sign on the press box
    const nameC = document.createElement('canvas'); nameC.width = 1024; nameC.height = 128; const ng = nameC.getContext('2d'); ng.fillStyle = '#7a1d10'; ng.fillRect(0, 0, 1024, 128); ng.fillStyle = '#fff'; ng.font = 'italic 900 84px Impact, Arial Black'; ng.textAlign = 'center'; ng.textBaseline = 'middle'; ng.fillText(T.name.toUpperCase(), 512, 66, 990);
    const nt = new THREE.CanvasTexture(nameC); nt.colorSpace = THREE.SRGBColorSpace;
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(36, 4.5), new THREE.MeshStandardMaterial({ map: nt, emissive: 0xffffff, emissiveMap: nt, emissiveIntensity: 0.5 })); sign.name='track-name-sign';sign.rotation.y = Math.PI; sign.position.set(0, 0.5 + rows * 0.55 + 7.5, standZ - 0.5); scene.add(sign);

    const standGroup=new THREE.Group();standGroup.name='grounded-grandstands';for(const o of scene.children.slice(standStart))standGroup.add(o);standGroup.position.y=-.3;scene.add(standGroup);
    for(const o of standGroup.children){if(o.geometry?.type==='BoxGeometry'&&o.geometry.parameters?.depth===.95)groundObject(this.groundSupports,o,()=>-.3,{kind:'grandstand footing'});}
    // ----- light poles with glowing heads (+ a few real point lights) -----
    const poleMat = new THREE.MeshStandardMaterial({ color: 0x55595e, metalness: 0.6, roughness: 0.5 });
    const lampMat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xfff2d0, emissiveIntensity: 2.0 });
    const towerPoses=[],nPoles=24;
    for(let i=0;i<nPoles;i++){
      let s=(i+.5)/nPoles*trk.P;const gate=trk.s2-Math.min(25,trk.R*.35);if(Math.abs(s-gate)<10)s+=14;
      const p=trk.point(s,trk.outer+13),c=trk.point(s,T.W*.18),h=this.terrainHeight(p.x,p.z);
      towerPoses.push({x:p.x,y:h,z:p.z,height:30+(i%3)*1.5,tx:c.x,tz:c.z});
      this.pools[i].set(c.x,c.z,Math.max(10,Math.min(20,trk.P/24*.48)));
    }

    // ----- scoreboard outside turn 2 (live running order)
    { const sbC = document.createElement('canvas'); sbC.width = 512; sbC.height = 320; this.sbC = sbC;
      const sbT = new THREE.CanvasTexture(sbC); sbT.colorSpace = THREE.SRGBColorSpace; this.sbT = sbT;
      const sS = (trk.s1 + trk.s2) / 2, sp = trk.point(sS, trk.outer + 16), a = Math.PI - sp.th;
      const g = new THREE.Group(); g.position.set(sp.x, trk.smooth ? outsideHeight(trk, sS, 16) : 0, sp.z); g.rotation.y = a; scene.add(g);
      const face = new THREE.Mesh(new THREE.PlaneGeometry(16, 10), new THREE.MeshStandardMaterial({ map: sbT, emissive: 0xffffff, emissiveMap: sbT, emissiveIntensity: 0.9, color: 0x222222 }));
      face.name='track-scoreboard-sign';face.position.set(0, 15, 0.31); g.add(face);
      const back = new THREE.Mesh(new THREE.BoxGeometry(16.8, 10.8, 0.6), steel); back.position.y = 15; g.add(back);
      for (const x of [-5, 5]) { const leg = new THREE.Mesh(new THREE.BoxGeometry(0.6, 10, 0.6), steel); leg.position.set(x, 5, -0.2); leg.castShadow = true; g.add(leg);groundFoot(this.groundSupports,leg,(x,z)=>this.terrainHeight(x,z),{kind:'scoreboard footing'}); }
      this.drawScoreboard(); }
    this.pits=createPitWorld(this);
    // Keep foundations outside the real access lane and hauler parking bays;
    // grade to the completed terrain/lot, never to a pre-road height estimate.
    for(const p of towerPoses){const dx=p.x-p.tx,dz=p.z-p.tz,l=Math.hypot(dx,dz)||1;
      for(let k=0;k<24;k++){const inLot=Math.abs(p.x-this.pits.origin.x)<80&&p.z>-58&&p.z<48;
        if(this.pits.road.nearest(p.x,p.z).distance>=9&&!inLot)break;p.x+=dx/l*6;p.z+=dz/l*6;}
      p.y=this.terrainHeight(p.x,p.z);
    }
    this.stadium=stadiumTowers(scene,towerPoses,{name:'night-towers'});
    for(let i=0;i<tireN;i++)groundObject(this.groundSupports,tires,(x,z)=>this.infield.heightAt(x,z),{kind:'low inside marker',instance:i});
    const infieldStart=scene.children.length;
    // ----- infield: support trucks, canopies, tool carts, light towers (the "infield pit" look)
    { const iz = -(T.R - T.W / 2 - 7) * 0.35, n = clamp(Math.floor(T.L / 26), 2, 6), cols = [0xdfe3e8, 0x2a3a5a, 0x7a1d10, 0x30302e, 0x1f5f3a, 0xc9a227];
      const canM = cols.map(c => new THREE.MeshStandardMaterial({ color: c, roughness: 0.7, side: THREE.DoubleSide }));
      for (let i = 0; i < n; i++) {
        const x = -T.L / 2 + 10 + i * (T.L - 20) / Math.max(1, n - 1);
        const tr = new THREE.Mesh(new THREE.BoxGeometry(9, 3, 2.5), new THREE.MeshStandardMaterial({ color: cols[(i + 2) % 6], roughness: 0.5, metalness: 0.2 })); tr.position.set(x, 1.5, iz - 3); tr.castShadow = true; scene.add(tr);
        const cab = new THREE.Mesh(new THREE.BoxGeometry(2.6, 2.4, 2.4), new THREE.MeshStandardMaterial({ color: 0x222428, metalness: 0.4, roughness: 0.4 })); cab.position.set(x + 5.9, 1.2, iz - 3); scene.add(cab);
        const top = new THREE.Mesh(new THREE.ConeGeometry(3.4, 0.9, 4, 1, true), canM[i % 6]); top.rotation.y = Math.PI / 4; top.position.set(x, 3.2, iz + 2.2); scene.add(top);
        for (const [dx, dz] of [[-2.3, -2.3], [2.3, -2.3], [-2.3, 2.3], [2.3, 2.3]]) { const p = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 2.8, 4), steel); p.position.set(x + dx, 1.4, iz + 2.2 + dz); scene.add(p); }
        const cart = new THREE.Mesh(new THREE.BoxGeometry(1.2, 1.0, 0.7), new THREE.MeshStandardMaterial({ color: 0xc81d25, metalness: 0.5, roughness: 0.4 })); cart.position.set(x - 1.2, 0.5, iz + 2.6); scene.add(cart);
        for (let k = 0; k < 4; k++) { const tire = new THREE.Mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.36, 12), new THREE.MeshStandardMaterial({ color: 0x151515, roughness: 0.9 })); tire.position.set(x + 1.4, 0.18 + k * 0.36, iz + 3.2); scene.add(tire); }
      }
      // two infield light towers
      for (const x of [-T.L / 3, T.L / 3]) { const tw = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.2, 9, 6), steel); tw.position.set(x, 4.5, iz + 7); scene.add(tw);
        const lh = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.8, 2), lampMat); lh.position.set(x, 9, iz + 7); scene.add(lh);
      }
    }
    const infieldGroup=new THREE.Group();infieldGroup.name='grounded-infield-equipment';for(const o of scene.children.slice(infieldStart))infieldGroup.add(o);infieldGroup.position.y=-.25;scene.add(infieldGroup);
    for(const o of infieldGroup.children){if(!o.geometry)continue;o.geometry.computeBoundingBox();if(Math.abs(o.position.y+o.geometry.boundingBox.min.y)<.001)groundObject(this.groundSupports,o,()=>-.25,{kind:'infield support'});}
    polishInfield(this);
    // ----- treeline -----
    const treeN = Math.round(500*detail.trees);
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.3, 0.4, 4, 5), new THREE.MeshStandardMaterial({ color: 0x3a2a1a }), treeN);
    const crowns = new THREE.InstancedMesh(crownGeometry(3.6,this.app.quality==='low'), new THREE.MeshStandardMaterial({ color: 0x60794b, map:foliageMap(), roughness: 1 }), treeN);
    for (let i = 0; i < treeN; i++) {
      const a = rnd() * Math.PI * 2, r = 230 + rnd() * 260, x = Math.cos(a) * r * 1.3, sc = 0.8 + rnd() * 1.1; let z = Math.sin(a) * r; if((Math.abs(x-this.pits.origin.x)<85&&Math.abs(z)<60)||this.pits.road.nearest(x,z).distance<15)z-=100;
      mtx.compose(new THREE.Vector3(x, -.3+2*sc, z), new THREE.Quaternion(), new THREE.Vector3(sc, sc, sc)); trunks.setMatrixAt(i, mtx);
      mtx.compose(new THREE.Vector3(x, -.3+5.1*sc, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rnd(), rnd(), 0)), new THREE.Vector3(sc, sc * 1.2, sc)); crowns.setMatrixAt(i, mtx);
    }
    scene.add(trunks, crowns);
    for(let i=0;i<treeN;i++)groundObject(this.groundSupports,trunks,()=>-.3,{kind:'tree trunk',instance:i});
    buildSalina(this);buildInfieldObstacles(this);this.grass=raceGrass(this);
    // dust
    const dc = new THREE.Color(T.clay[0], T.clay[1], T.clay[2]).lerp(new THREE.Color(0xe8c8a8), 0.35);
    this.dust = new Dust(scene, 3000, dc);this.dust.setBudget(detail.dust); this.dust.mat.uniforms.uLight.value = 0.9;
  }
  // ------------------------------------------------------------------ cars
  buildCars(startBack) {
    const { trk, T, app } = this; const st = app.state;
    this.cars = [];
    const round = st ? st.round : 2;
    const DF = DIFFICULTY[app.settings?.diff] || DIFFICULTY.normal;
    const drivers = AI_DRIVERS.map(d => ({ ...d }));
    const entries = drivers.map(d => ({ driverId:d.id, name: d.name, num: d.num, color: d.color, accent: d.accent, sponsor: d.sponsor, livery: d.livery, ai: { lane: d.lane, skill: d.skill + round * 0.003 + DF.skill, aggr: Math.min(1, d.aggr * DF.aggr), cons: d.cons, adapt: d.adapt, style: d.style, kind: d.kind, mist: DF.mist, read: DF.read, curLane: d.lane }, power: 1 + 0.035 * round, grip: 1 + 0.012 * round, stab: 0.3 }));
    const pp = st ? app.carParams() : { power: 1, grip: 1, stab: 0.3, damage: 0 };
    const me = { driverId: PLAYER_ID, name: st ? st.driver : DEFAULT_DRIVER, num: st?.num || DEFAULT_PROFILE.num, color: st?.color ?? DEFAULT_PROFILE.color, accent: st?.accent ?? DEFAULT_PROFILE.accent, player: !this.attract, power: pp.power, grip: pp.grip, stab: pp.stab, damage: Math.min(90, pp.damage) };  // junk car gets zip-tied together to start
    me.livery={scheme:st?.scheme??DEFAULT_PROFILE.scheme,cageColor:st?.cageColor??DEFAULT_PROFILE.cageColor};
    me.sponsor = st?.sponsor || 'RED CLAY RACING';
    if (this.attract) me.ai = { lane: 0.3, skill: 0.95, aggr: 0.6, cons: 0.95, adapt: 0.5, curLane: 0.3 };
    // grid: player starts 4th, or last when late
    const slot = startBack ? 5 : 3; entries.splice(slot, 0, me);
    entries.forEach((e, i) => {
      // rolling start: two-wide on the backstretch, already moving at pace speed
      const row = Math.floor(i / 2), side = i % 2 ? 1 : -1;
      const p = trk.point(trk.s3 - 14 - row * 9, side * Math.min(3.2, T.W * 0.18));
      const v0 = this.attract ? 20 : this.paceSpeed();
      const car = makeCar({ x: p.x, z: p.z, th: p.th, vx: Math.cos(p.th) * v0, vz: Math.sin(p.th) * v0, power: e.power, grip: e.grip, stab: e.stab });
      car.damage = e.damage || 0; car.startDmg = car.damage; car.driverId = e.driverId; car.name = e.name; car.num = e.num; car.ai = e.ai; car.player = !!e.player;
      car.paceLane = side < 0 ? -0.32 : 0.26; car.led = 0; car.mud = 0; car.lexanMud = 0; car.lookT = Math.random() * 0.5;
      car.prevS = trk.project(car.x, car.z).s; car.s = car.prevS; car.lap = 0; car.dist = 0;
      car.mesh = makeLateModel({ color: e.color, accent: e.accent, num: e.num, sponsor: e.sponsor, name: e.name, livery: e.livery, cockpit: !!e.player && !this.attract });
      car.mesh.rotation.order = 'YXZ'; this.scene.add(car.mesh); car.grid = i; car.color = e.color;
      if (this.attract) { car.lap = 1; }
      car.startPos = i;
      car.contactShadow=new ContactShadow(this.scene,car.mesh);
      this.cars.push(car);
    });
    this.player = this.cars.find(c => c.player) || this.cars[slot];
    this.tearOffs = 5;this.formationOrder=[...this.cars];this.formationS=this.cars[0].s;this.formationV=this.paceSpeed();
  }
  paceSpeed() { return 14 + this.T.R * 0.035; }
  drawScoreboard() {
    const c = this.sbC; if (!c) return; const g = c.getContext('2d'), T = this.T;
    g.fillStyle = '#07080b'; g.fillRect(0, 0, 512, 320); g.strokeStyle = '#c9a227'; g.lineWidth = 6; g.strokeRect(3, 3, 506, 314);
    g.font = '900 34px Impact, Arial Black'; g.textBaseline = 'middle'; g.fillStyle = '#ffd23d'; g.textAlign = 'left';
    const lead = this.order?.[0], lap = lead ? clamp(lead.lap, 0, T.laps) : 0;
    g.fillText(this.flag === 'pace' ? 'PACE LAPS' : `LAP ${Math.max(1, lap)} / ${T.laps}`, 18, 32);
    const fc = { green: '#2fd15a', yellow: '#ffd400', white: '#ffffff', checkered: '#ffffff', pace: '#ffd400' }[this.flag] || '#2fd15a';
    g.fillStyle = fc; g.fillRect(380, 12, 112, 40); g.fillStyle = '#000'; g.font = '900 22px Arial Black'; g.textAlign = 'center';
    g.fillText({ green: 'GREEN', yellow: 'CAUTION', white: 'WHITE', checkered: 'FINISH', pace: 'PACE' }[this.flag] || '', 436, 33);
    g.textAlign = 'left'; g.font = '900 30px Impact, Arial Black';
    (this.order || this.cars || []).slice(0, 6).forEach((car, i) => {
      const y = 82 + i * 39; g.fillStyle = '#ffd23d'; g.fillText(String(i + 1), 22, y);
      g.fillStyle = '#' + new THREE.Color(car.color).getHexString(); g.fillRect(58, y - 15, 64, 30); g.fillStyle = '#fff'; g.textAlign = 'center'; g.fillText(car.num, 90, y + 1); g.textAlign = 'left';
      g.fillStyle = car.player ? '#ffd23d' : '#e8e8e8'; g.fillText(car.name.split(' ').pop().toUpperCase(), 140, y);
    });
    if (this.sbT) this.sbT.needsUpdate = true;
  }
  buildHud() {
    const T = this.T;
    const h = document.createElement('div'); h.id = 'hud';h.className='night-race-hud';
    h.innerHTML = `
      <div class="hud-box" style="left:16px;top:16px"><div class="lbl">POSITION</div><div class="big"><span id="h-pos">-</span><span style="font-size:22px">/${this.cars.length}</span></div></div>
      <div class="hud-box" style="left:130px;top:16px"><div class="lbl">LAP</div><div class="big"><span id="h-lap">1</span><span style="font-size:22px">/<span id="h-laps">${T.laps}</span></span></div></div>
      <div class="hud-flag" id="h-flag" style="left:16px;top:96px"><i></i><span>PACE LAP</span></div>
      <div class="hud-box" style="left:244px;top:16px;min-width:180px"><div class="lbl">${T.name.toUpperCase()}</div><div style="font:700 14px Segoe UI">${T.event} • ${T.size}</div><div style="font:600 12px Segoe UI;color:#bba48e" id="h-groove">groove: middle</div><div style="font:600 12px Segoe UI;color:#9fb0c0" id="h-track">track: tacky</div></div>
      <div class="hud-box" style="right:16px;top:16px;text-align:right"><div class="lbl">SPEED</div><div class="big"><span id="h-spd">0</span><span style="font-size:18px"> MPH</span></div>
        <div class="lbl" style="margin-top:6px">DAMAGE</div><div class="bar" style="width:140px"><i id="h-dmg" style="width:0%"></i></div>
        <div class="lbl" style="margin-top:6px">TIRES</div><div class="bar tire" style="width:140px"><i id="h-tire" style="width:100%"></i></div>
        <div class="lbl" style="margin-top:6px" id="h-tear">TEAR-OFFS 5</div></div>
      <div class="hud-box order" style="right:16px;top:190px;min-width:190px" id="h-order"></div>
      <canvas id="h-map" width="220" height="130" class="hud-box" style="left:16px;bottom:40px;padding:0"></canvas>
      <div class="coach" id="race-coach"></div><div class="race-messages" role="status"><div id="center-msg"></div><div id="sub-msg"></div></div>
      <div class="hint">W/↑ throttle • S/↓ brake (hold when stopped = reverse) • A/D ←/→ steer • C camera • T tear-off • R reset to track • P/Esc pause • H guide</div>`;
    const auto=document.createElement('div');auto.className='auto-pace';auto.id='auto-pace';auto.hidden=true;h.append(auto);
    this.app.ui.appendChild(h);this.coach=h.querySelector('#race-coach');this.showCoach=!this.app.settings?.tutorialSeen;
    this.hud = { pos: h.querySelector('#h-pos'), lap: h.querySelector('#h-lap'), spd: h.querySelector('#h-spd'), dmg: h.querySelector('#h-dmg'), order: h.querySelector('#h-order'), map: h.querySelector('#h-map').getContext('2d'), msg: h.querySelector('#center-msg'), sub: h.querySelector('#sub-msg'), groove: h.querySelector('#h-groove'), laps: h.querySelector('#h-laps'), flag: h.querySelector('#h-flag'), track: h.querySelector('#h-track'), tire: h.querySelector('#h-tire'), tear: h.querySelector('#h-tear') };
  }
  // ------------------------------------------------------------------ update
  update(dt) {
    if(this.ended||this.pausedRace)return;
    const {app,trk}=this;dt=Number.isFinite(dt)?clamp(dt,0,.05):0;
    this.time += dt;
    if (!this.attract) {
      if (app.tap('KeyC')) { this.camMode = (this.camMode + 1) % 3; this.player.mesh.userData.setInCar?.(this.camMode === 1); }
      if (this.pausedRace) return;
      if (app.tap('KeyT')) {
        const p = this.player;
        if (this.tearOffs > 0 && p.lexanMud > 0.04) { this.tearOffs--; p.lexanMud = 0; p.mesh.userData.lexanMud = 0; p.mesh.userData.updateLook?.(p.mud, p.damage); this.flash(`TEAR-OFF (${this.tearOffs} left)`, 0.9, '#9fd6ff'); }
        else if (!this.tearOffs) this.flash('OUT OF TEAR-OFFS', 0.9, '#ff9a4a');
      }
      if (app.tap('KeyR') && this.phase === 'race') { const p = this.player, pr = trk.project(p.x, p.z), pt = trk.point(pr.s, 0);if(allWheelsOffClay(p,trk,pr))p.lapInvalid=true;delete p.formationArc; Object.assign(p, { x: pt.x, z: pt.z, th: pt.th, vx: 0, vz: 0, w: 0,steer:0,reversing:false,reverseHold:0,yawCatch:0,recoverTime:0 }); this.flash('RESET', 1); }
    }
    if(this.player?.dnf&&!this.ended&&this.phase!=='cooldown')this.retire();
    this.updateFlags(dt);
    // physics (fixed substeps)
    this.acc += dt; const h = 1 / 120; let steps = 0;
    const pin = this.attract ? null : app.input();this.audioInput=pin;
    while(this.acc>=h&&steps<8){this.acc-=h;steps++;for(const c of this.cars){const p=c.previousPose||(c.previousPose={});p.x=c.x;p.z=c.z;p.th=c.th;}this.physics(h,pin);}
    if(this.acc>=h)this.acc%=h;const alpha=app.manual?1:clamp(this.acc/h,0,1);
    for(const c of this.cars){const p=c.previousPose||c,v=c.renderPose||(c.renderPose={});if(Math.hypot(c.x-p.x,c.z-p.z)>5){p.x=c.x;p.z=c.z;p.th=c.th;}v.x=lerp(p.x,c.x,alpha);v.z=lerp(p.z,c.z,alpha);v.th=p.th+wrapAngle(c.th-p.th)*alpha;}
    // update race standings
    for (const c of this.cars) c.dist = c.dnf?(c.retiredDist??(c.lap-1)*trk.P+c.s):(c.lap - 1) * trk.P + c.s;
    this.order=(this.flag==='pace'&&app.settings.autoPace!==false)?[...this.formationOrder]:[...this.cars].sort((a, b) => (a.finishRank ?? 99) - (b.finishRank ?? 99) || Number(!!a.dnf)-Number(!!b.dnf) || b.dist - a.dist);
    if (this.phase === 'cooldown') { this.cool -= dt; if (this.cool <= 0) {this.endRace();return;} }
    // track dries & rubbers in as the feature goes on
    if (!this.attract) { const lead = this.order[0], prog = clamp((lead.dist) / (this.T.laps * trk.P), 0, 1); trk.dry = clamp(this.dry0 + 0.78 * prog, 0, 0.92); }
    else trk.dry = 0.45;
    this.dryU.value = trk.dry;
    this.excite = Math.max(0.25, this.excite - dt * 0.15); if (this.crowdU) { this.crowdU.uTime.value = this.time; this.crowdU.uExcite.value = this.excite; }
    if ((this.sbAcc = (this.sbAcc || 0) + dt) > 0.5) { this.sbAcc = 0; this.drawScoreboard(); }
    this.updateSurface(dt);
    this.paceCar?.update(dt);
    this.updateVisuals(dt);updateRetirementVisuals(this);
    this.updateCamera(dt);
    this.updateAudio(dt);
    if (!this.attract){this.updateHud();const a=document.querySelector('#auto-pace');if(a){a.hidden=true;a.textContent=this.flag==='yellow'?'AUTO CAUTION — holding P'+((this.formationOrder||[]).indexOf(this.player)+1):'AUTO PACE — get ready for green';}}
    if (this.msgT > 0) { this.msgT -= dt; if (this.msgT <= 0 && this.phase === 'race') this.hud.msg.textContent = ''; }
  }
  physics(h, pin) {
    const { trk } = this; const racing = this.phase === 'race' || this.phase === 'attract' || this.phase === 'cooldown' || this.phase === 'pace';
    const pace = this.flag === 'pace' || this.flag === 'yellow', green = !pace && (this.phase === 'race' || this.phase === 'attract');
    const leader = this.paceLeader;
    updateRetirements(this,h);
    if(pace&&this.app.settings.autoPace!==false&&!this.attract){
      if(this.formationActive===false){const lead=(this.formationOrder||this.cars).find(c=>!c.dnf);this.formationS=lead?.s||0;this.formationV=Math.max(4,lead?.speed||this.paceSpeed());}
      this.formationActive=true;this.autoFormation(h);return;
    }
    if(this.formationActive){this.formationActive=false;for(const c of this.cars)delete c.formationArc;}
    if(this.handover>0)this.handover=Math.max(0,this.handover-h);
    for(const c of this.cars){c._contactBudget=2*h;c.contactHold=Math.max(0,(c.contactHold||0)-h);}
    computeDraft(this.cars, trk);
    for (const c of this.cars) {
      if(c.retirement)continue;
      let inp;
      const ps = this.paceSpeed() * (this.flag === 'yellow' ? 0.88 : 1);
      const ctx = { dt: h, green, pace, paceSpeed: c === leader ? ps : ps + 4, paceLane: this.flag === 'pace' ? c.paceLane : this.flag === 'yellow' ? (c.cautionLane ?? -0.1) : -0.1, hold: green ? (4 - (this.greenT || 0)) / 2 : 0 };
      c.human = c.player && !!pin && !this.app.autopilot && !c.finished; c.assist = c.human ? (this.app.settings.assist || 'high') : null;
      if (c.player && pin) {
        inp = this.app.autopilot ? aiInput(c, trk, (c.ai ||= { lane: 0.3, skill: 0.9, aggr: 0.6, cons: 0.97, adapt: 0.5, curLane: 0.3 }), this.cars, ctx) : { ...pin };
        if(this.handover>0&&!this.app.autopilot){const a=1-this.handover/.3,prev=this.releaseInput||{steer:0,throttle:.25,brake:0};for(const k of ['steer','throttle','brake'])inp[k]=lerp(prev[k],inp[k],a);}
        if (pace && !this.app.autopilot && c.speed > ctx.paceSpeed + 2) { inp.throttle *= 0.15; }
        if (c.finished) inp = cooldownInput(c,trk,this.cars,h);
        if (c.damage >= 100) inp = { steer: 0, throttle: 0, brake: 0.3 };
      } else if (c.finished) inp = cooldownInput(c,trk,this.cars,h);
      else inp = aiInput(c, trk, c.ai, this.cars, ctx);
      if (!racing) inp = { steer: 0, throttle: 0, brake: 1 };
      // A brake stomp in a corner must not suddenly select reverse. Stop,
      // then deliberately keep holding brake for 0.7 s to back out of trouble.
      if(c.player && !c.finished && racing && pin && !this.app.autopilot){
        const fwd=c.vx*Math.cos(c.th)+c.vz*Math.sin(c.th),v=Math.hypot(c.vx,c.vz);
        if(pin.brake && !pin.throttle && (v<1.2 || c.reversing) && fwd<.8){
          c.reverseHold=(c.reverseHold||0)+h;
          if(c.reverseHold>.7){c.reversing=true;inp.brake=0;c.vx-=Math.cos(c.th)*3.2*h;c.vz-=Math.sin(c.th)*3.2*h;if(fwd < -5){c.vx*=.99;c.vz*=.99;}}
        }else{c.reverseHold=0;if(fwd>-.35)c.reversing=false;}
      }
      stepCar(c, inp, trk, h);
      if ((this.phase === 'race' || this.phase === 'pace') && (!c.player || this.app.autopilot) && !c.finished && !c.dnf) {
        c.stuckT = Math.hypot(c.vx, c.vz) < 2 ? (c.stuckT || 0) + h : 0;
        if (c.contactHold>0)c.stuckT=0;
        if (c.stuckT > 2.5 && !(c.player && (c.reversing || pin?.brake))) { const pr = trk.project(c.x, c.z), pt = trk.point(pr.s, 0); Object.assign(c, { x: pt.x, z: pt.z, th: pt.th, vx: Math.cos(pt.th) * 6, vz: Math.sin(pt.th) * 6, w: 0, stuckT: 0 }); }
      }
      updateInfieldProgress(this,c,h);const solid=collideInfield(this,c,h);if(solid>2.6)this.hit(c,(solid-2.2)*2.2,'infield object');
      const im = wallCollide(c, trk,h);
      if (im > 2.6) this.hit(c, (im - 2.2) * 2.2, 'wall');
      if (!c.dnf&&(!c.player || this.attract)&&!c.contactHold) { if (checkStuck(c, trk, h)) {} }
    }
    for (let i = 0; i < this.cars.length; i++) for (let j = i + 1; j < this.cars.length; j++) {
      const im = carCollide(this.cars[i], this.cars[j],h);
      if (im > 3) { this.hit(this.cars[i], (im - 2.6) * 1.1, 'car'); this.hit(this.cars[j], (im - 2.6) * 1.1, 'car'); }
    }
    // Last operation after ALL car/car impulses: no neighbor can leave a car
    // embedded again. Recover wall-bound humans/finishers despite contactHold.
    for(const c of this.cars){resolveWallPenetration(c,trk);recoverWallStuck(c,trk,h,this.cars,this.app.autopilot||!c.player||c.finished);}
    // lap counting
    for (const c of this.cars) {
      const pr=trk.project(c.x,c.z),s=pr.s;c.s=s;if(c.dnf||c.finished||pr.d< -trk.W/2-8){c.prevS=s;continue;}
      if (c.prevS > trk.P * 0.75 && s < trk.P * 0.25) this.crossLine(c);
      else if (c.prevS < trk.P * 0.25 && s > trk.P * 0.75) c.lap--;
      c.prevS = s;
    }
  }
  autoFormation(h){
    const trk=this.trk,yellow=this.flag==='yellow',targetV=this.paceSpeed()*(yellow?.88:1);
    this.formationV+=(targetV-this.formationV)*(1-Math.exp(-h*1.5));this.formationS+=this.formationV*h;
    let settled=true,lead=null;
    (this.formationOrder||this.cars).forEach((c,i)=>{if(c.dnf)return;
      // slots are measured from the formation leader's own arc (Night19), so a leader that
      // lags the virtual pace point can never be swallowed by the rows behind it
      const ds=Math.floor(i/2)*9,target=(lead&&Number.isFinite(lead.formationArc)&&lead.formationEpoch===this.cautions?lead.formationArc:this.formationS)-ds,q=trk.project(c.x,c.z),oldS=c.s;
      let lane=(i%2?1:-1)*Math.min(3.2,this.T.W*.18);   // Night19: two-wide under pace AND caution (leader inside)
      const stopped=this.cars.find(o=>o.retirement&&Math.abs(((target-o.s+trk.P*1.5)%trk.P)-trk.P*.5)<16&&Math.abs(o.d-lane)<3);
      if(stopped)lane=clamp(stopped.d+4,-trk.W/2+2,trk.W/2-2);
      if(!Number.isFinite(c.formationArc)||c.formationEpoch!==this.cautions){c.formationArc=target+((q.s-target+trk.P*100.5)%trk.P-trk.P*.5);c.formationSpeed=Math.hypot(c.vx,c.vz);c.formationLane=q.d;c.formationEpoch=this.cautions;}
      // Critically damped, acceleration-limited gap servo. Never integrate then snap
      // back to a moving target; each car owns a continuous unwrapped arc distance.
      let desired=this.formationV,err=target-c.formationArc;
      // Critical gap damping + jerk-limited acceleration. Caution rows only
      // merge once there is bumper clearance; never correct world positions.
      const ahead=(this.formationOrder||this.cars).slice(0,i).filter(o=>!o.dnf);
      // Night19 two-wide: rows only care about cars that share (or are moving into)
      // their lane, plus a no-passing rule so out-of-order cars fall back behind
      // their row before merging; lane changes wait while anything is alongside.
      const myRow=Math.floor(i/2);
      ahead.forEach((o,j)=>{const arc=o.formationArc??o.s,gap=((arc-c.formationArc+trk.P*1.5)%trk.P)-trk.P*.5,oL=o.formationLane??o.d,lat=Math.abs(oL-c.formationLane),into=Math.abs(oL-lane)<2.8;
        if(gap>0&&gap<9&&(lat<2.8||into)){if(lat>=2.8&&Math.abs(c.formationLane-lane)>.5&&gap<7)lane=c.formationLane;else desired=Math.min(desired,(o.formationSpeed||0)+Math.max(-4,(gap-7)*.8));}
        const rows=myRow-Math.floor(j/2);if(rows>0&&gap<9*rows+6){desired=Math.min(desired,(o.formationSpeed||0)+Math.max(-4,(gap-9*rows+1)*.6));}
        if(rows>0&&gap<3){desired=Math.min(desired,(o.formationSpeed||0)-1.5);if(Math.abs(gap)<6&&lat<4.6&&Math.abs(lane-c.formationLane)>.3)lane=c.formationLane;}});
      const accel=clamp(err*.5+(desired-c.formationSpeed)*1.6,yellow&&(err<-3||desired<c.formationSpeed-3)?-4.5:-2.2,1.6);c.formationAccel=(c.formationAccel||0)+clamp(accel-(c.formationAccel||0),-(yellow?6:3.5)*h,3.5*h);c.formationSpeed+=c.formationAccel*h;
      c.formationSpeed=Math.max(0,c.formationSpeed);c.formationArc+=c.formationSpeed*h;if(Math.abs(err)>2.5||Math.abs(lane-c.formationLane)>1)settled=false;
      c.formationLane+=clamp((lane-c.formationLane)*1.5,-.8,.8)*h;
      const pt=trk.point(c.formationArc,c.formationLane),ox=c.x,oz=c.z;
      c.x=pt.x;c.z=pt.z;c.th+=clamp(wrapAngle(pt.th-c.th)*6,-1.8,1.8)*h;
      c.vx=(c.x-ox)/h;c.vz=(c.z-oz)/h;c.speed=Math.hypot(c.vx,c.vz);c.w=-c.formationSpeed*trk.curvature(c.formationArc);c.steer=-Math.atan(2.8*trk.curvature(c.formationArc));c.throttle=.25;c.brake=0;c.human=false;c.reverseHold=0;c.reversing=false;c.s=trk.project(c.x,c.z).s;c.d=c.formationLane;
      if(oldS>trk.P*.75&&c.s<trk.P*.25){c.lap++;c.lapStart=this.time;}c.prevS=c.s;if(!lead)lead=c;
    });
    this.formationSettled=settled;
  }
  hit(c, dmg, kind) {
    if (dmg <= 0) return;
    const was = c.damage; c.damage = Math.min(100, c.damage + dmg);
    if (c.player && !this.attract) {
      if (dmg > 4) this.flash(kind === 'wall' ? 'INTO THE WALL!' : 'CONTACT!', 0.9, '#ff5a4a');
      this.shake = Math.min(1, (this.shake || 0) + dmg * 0.06);
      if(c.damage>=100&&was<100&&!c.finished)this.retire();
    }
    if(!c.player&&!this.attract&&c.damage>=100&&!c.finished)retireAI(this,c,'wreck damage');
    c.lookT = 0; // repaint damage/mud on next visual tick
  }
  updateFlags(dt) {
    if (this.attract || !this.hud) return;
    const trk = this.trk, T = this.T, hud = this.hud;
    const L = (this.order || this.cars).find(c => !c.dnf && !c.finished) || this.cars[0]; this.paceLeader = L;
    if (this.phase === 'pace') {
      this.paceT += dt;
      hud.sub.textContent = `${T.laps}-lap feature • rolling start, two by two • starting P${this.player.grid + 1}${this.app.state?.late ? ' (late arrival — sent to the rear)' : ''}`;
      if (this.msgT <= 0) { hud.msg.textContent = L.s > trk.s4 - 4 || L.s < trk.s3 - 60 ? 'ONE TO GO… GET READY' : 'PACE LAP'; hud.msg.style.color = '#ffd400'; }
      const inZone = L.s > trk.s4 + T.L * 0.2 && L.s < trk.s4 + T.L * 0.45;
      if (inZone || this.paceT > 40) this.goGreen();
    } else if (this.flag === 'yellow') {
      this.cautionT += dt;
      if (this.cautionT > 10 && (this.formationSettled !== false || this.app.settings.autoPace === false || this.cautionT > 30) && (this.paceCar?.ready() ?? true) && L.s > trk.s4 + 6 && L.s < trk.s4 + T.L * 0.4) this.goGreen();
      else if (this.cautionT > 10) hud.sub.textContent = 'Restart when the leader hits the frontstretch — get ready!';
    } else if (this.phase === 'race') {
      this.greenT += dt;
      if (T.laps >= 5 && this.cautions < 2 && this.greenT > 3 && L.lap < T.laps - 1 && this.flag === 'green') {
        for (const c of this.cars) { if (c.dnf || c.finished) continue; c.slowT = c.speed < 4.5 ? (c.slowT || 0) + dt : 0; if (c.slowT > 1.2) { this.throwCaution(c); break; } }
      }
    }
  }
  goGreen() {
    const restart = this.flag === 'yellow';
    if(this.app.settings.autoPace!==false){this.handover=.3;this.releaseInput={steer:this.player.steer||0,throttle:.25,brake:0};this.player.reverseHold=0;this.player.reversing=false;}
    this.phase = 'race'; this.flag = (this.paceLeader?.lap ?? 0) >= this.T.laps ? 'white' : 'green'; this.greenT = 0; this.excite = 1;
    this.flash(restart ? 'GREEN — RESTART!' : 'GREEN GREEN GREEN', 1.8, '#5fd16a'); this.hud.sub.textContent = '';
    this.app.audio.crowdCheer?.();
  }
  throwCaution(c) {
    this.formationOrder=[...(this.order||this.cars)].filter(o=>!o.dnf&&!o.finished);if(!this.formationOrder.includes(this.player)&&!this.player.dnf)this.formationOrder.push(this.player);this.formationS=this.formationOrder[0]?.s||0;this.formationV=this.formationOrder[0]?.speed||this.paceSpeed();this.formationOrder.forEach((o,i)=>{o.cautionLane=i%2?0.26:-0.32;});this.formationSettled=false;
    this.flag = 'yellow'; this.cautions++; this.cautionT = 0; this.excite = 0.8; for (const o of this.cars) o.slowT = 0;
    this.flash('CAUTION', 2.2, '#ffd400'); this.hud.sub.textContent = `#${String(c.num).replace(/[&<>]/g,"")} ${String(c.name).replace(/[&<>]/g,"")} is stopped — slow down, line up two-wide, no passing`;
  }
  flash(t, sec = 1.2, color = '#fff') { if (!this.hud) return; this.hud.msg.textContent = t; this.hud.msg.style.color = color; this.msgT = sec; }
  crossLine(c) {
    if(c.dnf||c.finished)return;
    if(c.lapInvalid){c.lapInvalid=false;c.invalidLaps=(c.invalidLaps||0)+1;c.infieldAdvance=0;c.infieldTime=0;c.lapStart=this.time;if(c.player)this.flash('LAP NOT COUNTED — INFIELD CUT',2,'#ffc780');return;}
    c.infieldAdvance=0;c.lap++;
    if (this.attract) return;
    const T = this.T;
    if (c.lap > 1) { c.lastLap = this.time - (c.lapStart || this.time); if (!c.bestLap || c.lastLap < c.bestLap) c.bestLap = c.lastLap; }
    c.lapStart = this.time;
    const isLeader = !this.finishOrder.length && this.order?.find(o => !o.dnf) === c;
    if (isLeader && c.lap > 1) c.led++;
    if (isLeader && c.lap === T.laps && this.flag === 'green') this.flag = 'white';
    if (c.lap > T.laps && !this.finishOrder.length) { this.flag = 'checkered'; this.excite = 1; }
    if (c.lap > T.laps && !c.finished) {
      c.finished = true; c.finishRank = this.finishOrder.length; this.finishOrder.push(c);
      if (c.player) { this.phase = 'cooldown'; this.cool = 4; this.hud.msg.textContent = '🏁 CHECKERED'; this.hud.msg.style.color = '#fff'; this.msgT = 99; this.hud.sub.textContent = `You finished P${c.finishRank + 1}`; }
    } else if (c.player && c.lap === T.laps) this.flash('WHITE FLAG — last lap!', 1.6, '#fff');
  }
  endRace() {
    if (this.ended) return; this.ended = true;
    for(const c of this.cars)resolveWallPenetration(c,this.trk);
    const final = [...this.finishOrder];
    const rest = this.cars.filter(c => !c.finished).sort((a, b) => b.dist - a.dist);
    // a DNF'd player drops behind running cars
    const dnf = rest.filter(c => c.dnf), run = rest.filter(c => !c.dnf);
    final.push(...run, ...dnf);
    const pm = v => Math.round(v * this.T.purse / 50) * 50;
    const res = final.map((c, i) => ({ driverId:c.driverId, name: c.name, num: c.num, pos: i + 1, start: c.startPos + 1, gain: c.startPos - i, led: c.led || 0, pts: POINTS[i] || 30, purse: pm(PURSE[i] || 1200), player: c.player, best: c.bestLap, dmg: c.damage, dnf: !!c.dnf }));
    // bonus money for the player: laps led, hard charger (most spots gained), clean race, contingency top 5
    const me = res.find(r => r.player);
    if (me) {
      const maxGain = Math.max(...res.map(r => r.gain)), b = [];
      if (me.led) b.push([`Lap leader bonus (${me.led} lap${me.led > 1 ? 's' : ''})`, pm(BONUS.lapLed * me.led)]);
      if (me.gain > 0 && me.gain === maxGain && !me.dnf) b.push([`Hard charger (+${me.gain} spots)`, pm(BONUS.hardCharger)]);
      if (!me.dnf && this.player.damage - (this.player.startDmg || 0) < 6) b.push(['Clean race award', pm(BONUS.clean)]);
      if (me.pos <= 5 && !me.dnf) b.push(['Contingency decals (top 5)', pm(BONUS.contingencyTop5)]);
      me.bonus = b; me.bonusTotal = b.reduce((a, x) => a + x[1], 0);
    }
    import('./ui.js').then(UI => UI.applyResults(this.app, res, this.player.damage));
  }
  updateSurface(dt=0,force=false) {
    if(this.app.quality && this.trk.surface.quality!==this.app.quality){
      this.trk.surface=this.trk.surface.regrid(this.app.quality);
      const f=this.trk.surface;this.surfaceTex.dispose();this.surfaceTex.image={data:f.bytes,width:f.N,height:f.M};
      this.surfaceSize.set(f.N,f.M);this.surfaceTex.needsUpdate=true;force=true;
    }
    const f=this.trk.surface;this.surfaceAcc=(this.surfaceAcc||0)+dt;
    if(!force && (f.version===f.uploaded || this.surfaceAcc<.24))return;
    this.surfaceAcc=0;f.upload();this.surfaceTex.needsUpdate=true;
    const pos=this.trackGeo.attributes.position,ds=this.trackD,M=ds.length,N=this.trackN;
    let cache=this.rutMeshCache;
    if(!cache){
      cache=this.rutMeshCache={base:new Float32Array(pos.count),amp:new Float32Array(pos.count),edge:new Float32Array(M)};
      for(let j=0;j<M;j++){const d=Math.min(ds[j],this.trk.outer),u=(d+this.trk.W/2)/this.trk.W;cache.edge[j]=.12*Math.sin(Math.PI*clamp((u-.79)/.21,0,1)/2)**2;}
      for(let i=0;i<=N;i++){const s=i/N*this.trk.P,cf=this.trk.cornerFactor(s),entry=Math.min(1,4*cf*(1-cf)+.22*cf);for(let j=0;j<M;j++){const k=i*M+j,d=Math.min(ds[j],this.trk.outer);cache.base[k]=pos.getY(k);cache.amp[k]=entry*(.033*(Math.sin(s*f.wave1+d*5.2)*.65+Math.sin(s*f.wave2-d*3.7)*.35)-.014);}}
    }
    if(cache.field!==f){
      cache.field=f;cache.row=new Uint32Array(N+1);cache.next=new Uint32Array(N+1);cache.a=new Float64Array(N+1);cache.col=new Uint32Array(M);cache.b=new Float64Array(M);
      for(let i=0;i<=N;i++){const u=(i===N?0:i/N*f.N),q=Math.floor(u);cache.row[i]=q*f.M;cache.next[i]=((q+1)%f.N)*f.M;cache.a[i]=u-q;}
      for(let j=0;j<M;j++){const v=clamp((Math.min(ds[j],this.trk.outer)+this.trk.W/2)/f.dy,0,f.M-1),q=Math.min(f.M-2,Math.floor(v));cache.col[j]=q;cache.b[j]=v-q;}
    }
    const out=pos.array;
    for(let i=0;i<=N;i++){const a=cache.a[i],clay=f.clay[cache.row[i]/f.M]*(1-a)+f.clay[cache.next[i]/f.M]*a;for(let j=0;j<M;j++){const k=i*M+j;if(ds[j]<-this.trk.W/2){out[k*3+1]=cache.base[k];continue;}const b=cache.b[j],p=cache.row[i]+cache.col[j],q=cache.next[i]+cache.col[j];
      const wear=(f.wear[p]*(1-b)+f.wear[p+1]*b)*(1-a)+(f.wear[q]*(1-b)+f.wear[q+1]*b)*a;
      const rut=(f.ruts[p]*(1-b)+f.ruts[p+1]*b)*(1-a)+(f.ruts[q]*(1-b)+f.ruts[q+1]*b)*a;
      out[k*3+1]=cache.base[k]-.012*wear+rut*cache.amp[k]+clay*cache.edge[j];
    }}
    pos.needsUpdate=true;
    // Central differences give smooth finite normals in one grid pass (including
    // the duplicated seam), instead of re-accumulating every triangle twice.
    const normal=this.trackGeo.attributes.normal,nn=normal.array;
    for(let i=0;i<=N;i++)for(let j=0;j<M;j++){const p=(i*M+Math.max(0,j-1))*3,q=(i*M+Math.min(M-1,j+1))*3,r=((i===0||i===N?N-1:i-1)*M+j)*3,t=((i===N||i===0?1:i+1)*M+j)*3;
      const ax=out[q]-out[p],ay=out[q+1]-out[p+1],az=out[q+2]-out[p+2],bx=out[t]-out[r],by=out[t+1]-out[r+1],bz=out[t+2]-out[r+2];let x=ay*bz-az*by,y=az*bx-ax*bz,z=ax*by-ay*bx,inv=1/Math.max(1e-12,Math.hypot(x,y,z)),k=(i*M+j)*3;nn[k]=x*inv;nn[k+1]=y*inv;nn[k+2]=z*inv;
    }normal.needsUpdate=true;
  }
  // ------------------------------------------------------------------ visuals
  updateVisuals(dt) {
    const { trk, dust } = this;
    for (const c of this.cars) {
      const v=(!this.app.manual&&c.renderPose)||c,m=c.mesh,pr=trk.project(v.x,v.z);
      // sit the car on the actual surface: sample the height under all four tires and build the
      // body frame from the fore/aft grade and the side-to-side slope (banking, transitions, cushion ridge)
      const cs0 = Math.cos(v.th), sn0 = Math.sin(v.th);
      const hAt = (f, r) => { const q = trk.project(v.x + cs0 * f - sn0 * r, v.z + sn0 * f + cs0 * r); return trk.height(q.s, q.d); };
      const hFL = hAt(1.3, -0.85), hFR = hAt(1.3, 0.85), hRL = hAt(-1.4, -0.85), hRR = hAt(-1.4, 0.85);
      const y = (hFL + hFR + hRL + hRR) / 4;
      const gF = ((hFL + hFR) - (hRL + hRR)) / 2 / 2.7, gR = ((hFR + hRR) - (hFL + hRL)) / 2 / 1.7;
      // tiny smoothing so the cushion/transition seams never pop (fast enough to stay glued to the surface)
      const k = 1 - Math.exp(-dt * 20);
      c.gF = c.gF === undefined ? gF : lerp(c.gF, gF, k); c.gR = c.gR === undefined ? gR : lerp(c.gR, gR, k);
      m.position.set(v.x,y,v.z);
      const F = _vF.set(cs0, c.gF, sn0).normalize(), R = _vR.set(-sn0, c.gR, cs0);
      const U = _vU.crossVectors(R, F).normalize(); R.crossVectors(F, U).normalize();
      _mB.makeBasis(F, U, R); _qS.setFromRotationMatrix(_mB);
      // suspension on top: body leans to the outside of the turn, squats under power, dives on the brakes
      const fwd = c.vx * cs0 + c.vz * sn0;
      c.prevF = c.prevF ?? fwd; const acc = (fwd - c.prevF) / Math.max(dt, 1e-3); c.prevF = fwd;
      const lat = c.w * c.speed;
      c.bRoll = lerp(c.bRoll || 0, clamp(-lat * 0.005, -0.05, 0.05), 1 - Math.exp(-dt * 8));
      c.bPitch = lerp(c.bPitch || 0, clamp(acc * 0.0035, -0.035, 0.04), 1 - Math.exp(-dt * 6));
      _eB.set(c.bRoll, 0, c.bPitch, 'YXZ'); _qB.setFromEuler(_eB);
      m.quaternion.copy(_qS).multiply(_qB);
      // Body suspension responds to ruts; tire travel is solved below.
      m.position.y += c.bump || 0;
      // Independent wheel travel keeps all four contact patches on the bank,
      // even while the body rolls/squats across an easement or cushion ridge.
      m.updateWorldMatrix(true,false);
      const rest = m.userData.wheelRest, low = m.userData.lowWheels;
      if (rest) {
        const upY = _vU.set(0, 1, 0).applyQuaternion(m.quaternion).y;
        rest.forEach((p, i) => {
          let travel = 0;
          for (let j = 0; j < 3; j++) {
            _vContact.set(p.x, travel, p.z).applyMatrix4(m.matrixWorld);
            const q = trk.project(_vContact.x, _vContact.z);
            // Along the surface normal, vertical error converts by cos(bank).
            travel = clamp(travel + (trk.height(q.s, q.d) - _vContact.y) * upY, -0.18, 0.18);
          }
          m.userData.wheels[i].position.y = p.y + travel;
          if (low?.[i]) low[i].position.y = p.y + travel;
        });
      }
      // wheels
      const wh = m.userData.wheels; c.wheelRot = (c.wheelRot || 0) + (fwd + c.wheelSpin * 12 * c.throttle) * dt / WHEEL_R;
      wh.forEach((w, i) => { w.rotation.z = -c.wheelRot; if (i < 2) w.rotation.y = -c.steer * 0.45; });
      c.contactShadow?.update((x,z)=>{const q=trk.project(x,z);return trk.height(q.s,q.d);});
      // dust: from rear tires, more when sliding / spinning / in the cushion
      const g = trk.groove(pr.d,pr.s);
      const slide = Math.min(1.5, Math.abs(c.slipR) * 3 + c.wheelSpin * 0.6);
      const rate = Math.max(0,c.speed-1.8)*.9*g.dust*(.4+slide)*(.55+.35*trk.dry)*(this.attract ? .65 : 1);
      c.dustAcc = (c.dustAcc || 0) + rate * dt;
      const cs = Math.cos(v.th), sn = Math.sin(v.th);
      while (c.dustAcc > 1) {
        c.dustAcc -= 1;
        const side = Math.random() < 0.5 ? -0.86 : 0.86;
        const px = c.x - cs * 1.6 - sn * side, pz = c.z - sn * 1.6 + cs * side;
        dust.emit(px, y + 0.3, pz, c.vx * 0.35 + (Math.random() - 0.5) * 3 + (-sn) * (c.slipR * 8), 0.6 + Math.random() * 1.8, c.vz * 0.35 + (Math.random() - 0.5) * 3 + cs * (c.slipR * 8), 1.0 + Math.random() * .9, 1.3 + Math.random() * 1.0);
      }
      if (c.damage > 55 && Math.random() < dt * (c.retirement?.parked?2:20)) dust.emit(c.x + cs * 1.8, y + 1, c.z + sn * 1.8, 0, 2, 0, 1.0, 1.4); // steam/smoke
      // mud: worse in the cushion, while sliding, and running in someone's roost; less as the track dries
      let roost = 0;
      for (const o of this.cars) { if (o === c) continue; let ds = o.s - c.s; if (ds < -trk.P / 2) ds += trk.P; if (ds > trk.P / 2) ds -= trk.P; if (ds > 2 && ds < 22 && Math.abs(o.d - c.d) < 3) roost = Math.max(roost, 1 - ds / 22); }
      const wet = 1 - (trk.dry || 0) * 0.7, sp01 = Math.min(1, c.speed / 30);
      c.mud = Math.min(.78, c.mud + dt * wet * sp01 * (0.003 + roost * 0.012 + (c.zone === 'cushion' ? 0.012 : 0) + slide * 0.004));
      if (c.player) c.lexanMud = Math.min(1, c.lexanMud + dt * wet * sp01 * (0.003 + roost * 0.06));
      if ((c.lookT -= dt) <= 0) { c.lookT = 0.5; m.userData.lexanMud = c.lexanMud; m.userData.updateLook?.(c.mud, c.damage); }
    }
    // in-car: steering wheel + gauges
    if (this.player && this.camMode === 1 && !this.attract) {
      const ud = this.player.mesh.userData, p = this.player;
      if (ud.wheelGrp) ud.wheelGrp.rotation.x = p.steer * 1.6;
      if ((this.gT = (this.gT || 0) + 1) % 4 === 0) ud.drawGauges?.(this.rpm || 0.3, p.speed * 2.237, 82 + p.damage * 0.35 + p.speed * 0.15, clamp(0.72 - p.damage * 0.003, 0.2, 0.9), clamp(p.lap, 1, this.T.laps), this.T.laps);
    }
    // flagman waves the flag that matches the race state
    if (this.flagman) {
      const f = this.flagman, fl = this.flag;
      const col = { green: 0x22cc44, yellow: 0xffd400, pace: 0xffd400, white: 0xffffff, checkered: 0xffffff }[fl] || 0x22cc44;
      if (f.cur !== fl) { f.cur = fl; f.mat.color.set(col); f.mat.emissive.set(col); f.mat.map = fl === 'checkered' ? f.ck : null; f.mat.emissiveMap = fl === 'checkered' ? f.ck : null; f.mat.needsUpdate = true; }
      const wave = fl === 'pace' ? 0.4 : 1;
      f.arm.rotation.z = -0.3 + Math.sin(this.time * (fl === 'checkered' ? 7 : 5)) * 0.9 * wave; f.arm.rotation.x = Math.sin(this.time * 2.5) * 0.25 * wave;
      const pos = f.flag.geometry.attributes.position; if (!f.base) f.base = Float32Array.from(pos.array);
      for (let i = 0; i < pos.count; i++) { const x = f.base[i * 3]; pos.array[i * 3 + 2] = Math.sin(this.time * 9 + x * 6) * 0.08 * (x + 0.45); }
      pos.needsUpdate = true;
    }
    dust.update(dt);this.nightArt?.particles.update(dt);this.nightArt?.atmosphere.update(dt);
    // shadow light follows the focus car
    this.nightArt?.refreshShadow(dt);
    // NightShadows fits and snaps the existing key immediately before render.
  }
  // engine audio: every car is its own V8 voice; listener rides the camera
  updateAudio(dt) {
    if (this.attract || !this.player) return;
    const p = this.player, au = this.app.audio, cam = this.camera, fw = _vF.set(0, 0, -1).applyQuaternion(cam.quaternion);
    const car = c => ({ id: c.num ? (String(c.num).split('').reduce((a, ch) => a * 31 + ch.charCodeAt(0), 7) % 9973) : 1, x: c.x, y: c.mesh?.position.y ?? 0, z: c.z, vx: c.speed * Math.cos(c.th), vz: c.speed * Math.sin(c.th), speed: c.speed, wheelSpin: c.wheelSpin || 0, throttle: c.throttle || 0 });
    const f = { dt, cam: this.camMode === 1 ? 'incar' : this.camMode === 2 ? 'tv' : 'chase', L: { x: cam.position.x, y: cam.position.y, z: cam.position.z, fx: fw.x, fy: fw.y, fz: fw.z },
      player: { speed: p.speed, wheelSpin: p.wheelSpin || 0, throttle: !this.app.autopilot&&!p.finished&&p.damage<100&&this.audioInput&&(this.flag!=='pace'&&this.flag!=='yellow'||this.audioInput.throttle>0)?this.audioInput.throttle:p.throttle||0,freeRev:!this.app.autopilot&&!!this.audioInput?.throttle&&(this.flag==='pace'||this.flag==='yellow'||Math.abs(p.speed)<1&&this.audioInput.brake>0) }, cars: this.cars.filter(o => o !== p&&(!o.dnf||o.retirement?.mode==='limping'&&!o.retirement.parked)).map(car) };

    const slide = clamp(Math.abs(p.slipR) * 2.5 + p.wheelSpin * 0.5, 0, 1) * clamp(p.speed / 12, 0, 1);
    au.surface?.(slide, p.speed / 40, p.zone === 'cushion' ? 1 : 0);
    const near = this.cars.reduce((a, o) => o === p ? a : Math.max(a, 1 - Math.hypot(o.x - p.x, o.z - p.z) / 40), 0);
    au.field?.(near, this.excite * (p.z > 0 ? 1 : 0.35));
    f.surf = [slide, p.speed / 40, p.zone === 'cushion' ? 1 : 0]; f.fieldV = [near, this.excite * (p.z > 0 ? 1 : 0.35)];
    au.race?.(f);
    this.rpm = au.rpm ? au.rpm / 7600 : clamp(0.22 + p.speed / 44 + p.wheelSpin * 0.3 + p.throttle * 0.04, 0, 1.1);
    if (this.app.audioRec) this.app.audioRec.push(JSON.parse(JSON.stringify(f)));
  }
  updateCamera(dt) {
    const cam = this.camera;
    if (this.attract) {
      // slow TV-style orbit following the leader
      this.orbit += dt * 0.12;
      const lead = this.order?.[0] || this.cars[0];
      const tx = lead.x, tz = lead.z;
      const r = 26, ang = this.orbit;
      const want = new THREE.Vector3(tx + Math.cos(ang) * r, 9 + Math.sin(this.orbit * 0.7) * 3, tz + Math.sin(ang) * r);
      cam.position.lerp(want, 1 - Math.exp(-dt * 2)); cam.lookAt(tx, 1, tz); return;
    }
    const physical=this.player,c=(!this.app.manual&&physical.renderPose)?Object.assign(Object.create(physical),physical.renderPose):physical,pr=this.trk.project(c.x,c.z),y=this.trk.height(pr.s,pr.d);
    const forward=c.vx*Math.cos(c.th)+c.vz*Math.sin(c.th),blend=c.reversing?0:clamp((forward-4)/6,0,1),velA=c.th+wrapAngle(Math.atan2(c.vz,c.vx)-c.th)*blend;
    const rawShake=this.shake||0;this.shake=Math.max(0,rawShake-dt*2);const shake=rawShake*(this.app.settings?.shake??1)*(forward<0||c.reversing ? .18 : 1)*clamp(c.speed/5,.12,1);
    const sx = (Math.random() - 0.5) * shake * 0.4, sy = (Math.random() - 0.5) * shake * 0.4;
    if (this.camMode !== 1 && c.mesh.userData.inCarOn) { c.mesh.userData.setInCar?.(false); c.mesh.userData.inCarOn = false; }
    if (this.camMode === 0) {
      const aim=c.th+wrapAngle(velA-c.th)*.55;
      this.camHeading=this.camHeading===undefined?aim:this.camHeading+wrapAngle(aim-this.camHeading)*(1-Math.exp(-dt*5));
      const a=this.camHeading;
      // a car tucked right behind us would block the chase view: lift the camera over it
      let occ = 0;
      for (const o of this.cars) { if (o === c || o.dnf) continue; const rx = o.x - c.x, rz = o.z - c.z, along = -(rx * Math.cos(a) + rz * Math.sin(a)), lat = Math.abs(-rx * Math.sin(a) + rz * Math.cos(a)); if (along > 1 && along < 11 && lat < 2.4) occ = Math.max(occ, 1 - along / 11); }
      this.camLift = lerp(this.camLift || 0, occ, 1 - Math.exp(-dt * 3));
      const back = 6.2 - this.camLift * 1.2;
      const want = new THREE.Vector3(c.x - Math.cos(a) * back, y + 2.15 + this.camLift * 3.4, c.z - Math.sin(a) * back);
      const cp=this.trk.project(want.x,want.z);
      if(cp.d>this.trk.outer-1){want.x-=cp.nx*(cp.d-this.trk.outer+1);want.z-=cp.nz*(cp.d-this.trk.outer+1);}
      const ch=this.trk.project(want.x,want.z);want.y=Math.max(want.y,this.trk.height(ch.s,ch.d)+1.3);
      if (!this.camInit) { cam.position.copy(want); this.camInit = true; }
      cam.position.lerp(want, 1 - Math.exp(-dt * 6));
      const vib = clamp(c.speed / 40, 0, 1) * (c.zone === 'cushion' ? 0.026 : 0.012) * (this.app.settings?.shake ?? 1);
      cam.position.x += sx + (Math.random() - 0.5) * vib; cam.position.y += sy + Math.sin(this.time * 37) * vib;
      cam.fov = lerp(cam.fov, clamp(62+c.speed*.28,62,75),1-Math.exp(-dt*3)); cam.updateProjectionMatrix();
      const focus=new THREE.Vector3(c.x+Math.cos(a)*5,y+1.05,c.z+Math.sin(a)*5);
      if(!this.camFocus)this.camFocus=focus.clone();this.camFocus.lerp(focus,1-Math.exp(-dt*12));cam.up.set(0,1,0);cam.lookAt(this.camFocus);
    } else if (this.camMode === 1) {
      const m = c.mesh; m.updateMatrixWorld();
      if (!m.userData.inCarOn) { m.userData.setInCar?.(true); m.userData.inCarOn = true; }
      const vib = clamp(c.speed / 40, 0, 1) * 0.006 * (this.app.settings?.shake ?? 1);
      // head looks a little into the corner (toward where the car is sliding)
      const look = clamp(wrapAngle(velA - c.th), -.35, .35) * 5;
      const eye = new THREE.Vector3(DRIVER_EYE[0], DRIVER_EYE[1] + Math.sin(this.time * 41) * vib, DRIVER_EYE[2] + (Math.random() - 0.5) * vib).applyMatrix4(m.matrixWorld), tgt = new THREE.Vector3(20, 1.03, -0.16 + look).applyMatrix4(m.matrixWorld);
      cam.position.copy(eye); cam.position.x += sx * 0.15; cam.position.y += sy * 0.15; cam.up.set(0, 1, 0); cam.lookAt(tgt); cam.fov = 72; cam.updateProjectionMatrix();
    } else {
      const want = new THREE.Vector3(c.x * 0.6, 24, this.T.R + this.trk.outer + 26);
      cam.position.lerp(want, 1 - Math.exp(-dt * 3)); cam.lookAt(c.x, y, c.z);
      const d = cam.position.distanceTo(new THREE.Vector3(c.x, y, c.z)); cam.fov = clamp(1800 / d, 12, 55); cam.updateProjectionMatrix();
    }
    this.dust.mat.uniforms.uScale.value=(this.app.renderer?.domElement?.height || 720)/(2*Math.tan(cam.fov*Math.PI/360));
  }
  updateHud() {
    const { hud, player: p, T } = this; if (!hud) return;
    const pos = this.order.indexOf(p) + 1;
    if(this.coach&&this.showCoach){let msg=this.phase==='pace'?'<b>ROLLING START</b>Stay in line until green. Short steering taps are easier than holding full lock.':this.time<17?'<b>LET THE CAR SLIDE</b>Ease into the throttle. High assist catches extra yaw; avoid chasing it with opposite lock.':this.time<28?'<b>READ THE CLAY</b>The groove dries and ruts form. Try another lane if the entry feels rough. C changes camera; T clears the windshield.':'';this.coach.innerHTML=msg;if(this.time>28){this.showCoach=false;this.app.settings.tutorialSeen=true;this.app.saveSettings?.();}}

    hud.pos.textContent = pos; hud.lap.textContent = clamp(p.lap, 1, T.laps); if (hud.laps.textContent != T.laps) hud.laps.textContent = T.laps;
    const fl=this.flag,auto=(fl==='pace'||fl==='yellow')&&this.app.settings.autoPace!==false;if(hud.flag.dataset.f!==fl||hud.flag.dataset.auto!==String(auto)){hud.flag.dataset.f=fl;hud.flag.dataset.auto=String(auto); hud.flag.className = 'hud-flag f-' + fl; hud.flag.querySelector('span').textContent = { pace: 'PACE LAP', green: 'GREEN FLAG', yellow: 'CAUTION', white: 'WHITE — LAST LAP', checkered: 'CHECKERED' }[fl]+(auto?' · AUTO':''); }
    hud.tire.style.width = Math.round((p.tire ?? 1) * 100) + '%'; hud.tear.textContent = `TEAR-OFFS ${this.tearOffs}` + (p.lexanMud > 0.35 && this.camMode === 1 ? ' — press T!' : '');
    const dry = this.trk.dry; hud.track.textContent = 'track: ' + (dry < 0.3 ? 'tacky — bottom is fast' : dry < 0.6 ? 'drying — middle/top coming in' : 'rubbered groove / rutted entries — choose your line');
    hud.spd.textContent = Math.round(p.speed * 2.237); hud.dmg.style.width = p.damage.toFixed(0) + '%';
    hud.groove.textContent = 'groove: ' + p.zone + (p.zone === 'cushion' ? ' (big bite, careful!)' : '');
    if ((this.hudT = (this.hudT || 0) + 1) % 10 === 0) {
      hud.order.innerHTML = '<div class="lbl">RUNNING ORDER</div>' + this.order.map((c, i) => `<div class="${c.player ? 'me' : ''}">${i + 1}. #${String(c.num).replace(/[&<>]/g,"")} ${String(c.name).replace(/[&<>]/g,"")}${c.finished ? ' 🏁' : ''}${c.dnf ? ' (DNF)' : ''}</div>`).join('');
    }
    // mini map
    const g = hud.map, W = 220, H = 130, sc = Math.min((W - 20) / (T.L + 2 * T.R + 20), (H - 20) / (2 * T.R + 20));
    g.clearRect(0, 0, W, H); g.save(); g.translate(W / 2, H / 2);
    g.strokeStyle = '#a5552c'; g.lineWidth = T.W * sc; g.beginPath();
    for (let i = 0; i <= 240; i++) { const c = this.trk.center(i / 240 * this.trk.P); i ? g.lineTo(c.x * sc, c.z * sc) : g.moveTo(c.x * sc, c.z * sc); }
    g.closePath(); g.stroke();
    for (const c of this.cars) { g.fillStyle = c.player ? '#ffc83d' : '#' + new THREE.Color(c.color).getHexString(); g.beginPath(); g.arc(c.x * sc, c.z * sc, c.player ? 4.5 : 3.2, 0, 7); g.fill(); if (c.player) { g.strokeStyle = '#000'; g.lineWidth = 1.5; g.stroke(); } }
    g.restore();
  }
  dispose() { this.surfaceTex?.dispose(); disposeScene(this.scene); }
}

// ribbon around the oval: profile(s) -> [[d, y], ...]; vCoords per profile vertex; u scaled by s/uLen
function ribbon(trk, N, profile, vCoords, uLen) {
  const n0 = profile(0).length, pos = [], uv = [], idx = [];
  const gate=pitGateS(trk),half=pitGateHalfArc(trk),ss=[...Array.from({length:N+1},(_,i)=>i/N*trk.P),gate-half,gate+half].sort((a,b)=>a-b);N=ss.length-1;
  for(let i=0;i<=N;i++){
    const s=ss[i],prof=profile(s);
    prof.forEach(([d, y], j) => { const p = trk.point(s, d); pos.push(p.x, y, p.z); uv.push(s / uLen, vCoords[j]); });
  }
  for (let i = 0; i < N; i++) for (let j = 0; j < n0 - 1; j++) { if(inPitGate(trk,(ss[i]+ss[i+1])*.5))continue; const a = i * n0 + j, b = a + n0; idx.push(a, b, a + 1, a + 1, b, b + 1); }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2)); g.setIndex(idx);g.userData.arcRows=ss; g.computeVertexNormals(); closeRibbonNormals(g, N, n0); return g;
}

// The generic ribbon is wound into this wall's solid profile. Its near face
// was culled, exposing the far face's backwards print from the racing surface.
// Give each face its own corners/UVs, turn the solid faces outward, and run U
// left-to-right for THAT face's viewer (opposite directions inside/outside).
// Keep exactly the same physical profile, pit-gate triangles and one draw.
function sponsorWallRibbon(trk, N) {
  const raw=ribbon(trk,N,s=>{const h=trk.height(s,trk.outer);return [[trk.outer,h],[trk.outer,h+1.15],[trk.outer+.35,h+1.15],[trk.outer+.35,h-.1]];},[0,1,1.05,0],18);
  const pos=[],uv=[],idx=[],P=raw.attributes.position,U=raw.attributes.uv,corners=[0,1,1,2,2,3],rows=raw.userData.arcRows.length;
  for(let row=0;row<rows;row++)for(let j=0;j<6;j++){
    const k=row*4+corners[j];pos.push(P.getX(k),P.getY(k),P.getZ(k));
    // Whole atlas repeats also prevent a cut word at the start/finish seam.
    const u=raw.userData.arcRows[row]/trk.P*Math.max(1,Math.round(trk.P/18));
    uv.push(u*(j<4?-1:1),U.getY(k));
  }
  const I=raw.index;
  for(let i=0;i<I.count;i+=3){
    const a=I.getX(i),b=I.getX(i+1),c=I.getX(i+2),face=Math.min(a%4,b%4,c%4);
    const map=k=>Math.floor(k/4)*6+face*2+(k%4-face);
    idx.push(map(a),map(c),map(b));
  }
  const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setIndex(idx);g.userData.arcRows=raw.userData.arcRows;g.userData.readableWallFaces=true;g.computeVertexNormals();closeRibbonNormals(g,rows-1,6);raw.dispose();return g;
}

// Match the duplicate UV seam normals, so the start/finish seam cannot sparkle.
function closeRibbonNormals(g, N, M) {
  const n = g.attributes.normal;
  for (let j = 0; j < M; j++) {
    const k = N * M + j;
    const x = n.getX(j) + n.getX(k), y = n.getY(j) + n.getY(k), z = n.getZ(j) + n.getZ(k), len = Math.hypot(x, y, z) || 1;
    n.setXYZ(j, x / len, y / len, z / len); n.setXYZ(k, x / len, y / len, z / len);
  }
}
function outsideHeight(trk, s, offset) {
  const h = trk.height(s, trk.outer);
  return lerp(h, trk.smooth ? -0.3 : -0.18, clamp((offset - 0.35) / (3.65 + h * 1.6), 0, 1));
}
