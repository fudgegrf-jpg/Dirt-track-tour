import { DEFAULT_DRIVER, DEFAULT_PROFILE } from './data.js';
import { ContactShadow } from './contact.js';
// Background 3D scene behind the 2D shop / results / arrival overlays: your rig in the pits at dusk.
import * as THREE from 'three';
import { makeLateModel, makeSemi, makeSky, dirtTextures, grassTexture, glowTexture, disposeScene } from './gfx.js';

export class ShowroomScene {
  constructor(app, opts = {}) {
    this.app = app; const st = app.state || {};
    const s = this.scene = new THREE.Scene();
    if (opts.hero || app.phase === 'shop') { this.studio=true; this.setupStudio(opts.profile || app.state || app.profile || {}); return; }
    this.camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 5000);
    s.fog = new THREE.Fog(0xb2a08f, 65, 250);
    app.bloom.strength=0.035;app.bloom.threshold=4;app.renderer.toneMappingExposure=0.88;
    s.add(makeSky({ top: 0x1a2350, horizon: 0xb2a08f, bottom: 0xa68f7b, sunDir: [-0.6, 0.06, -0.8], sunColor: 0xffb070, sunSize: 0.035 }));
    s.add(new THREE.HemisphereLight(0x9ab0ff, 0x8b8074, 1.0));
    s.add(new THREE.AmbientLight(0xb8afa2, 0.85));
    // Broad, non-shadowing pit fill illuminates tire sidewalls and chassis.
    // Matte trailer panels prevent this becoming another specular hotspot.
    const pitFill=new THREE.DirectionalLight(0xffead5,1.2);pitFill.position.set(0,9,24);pitFill.target.position.set(-5,0,-3);s.add(pitFill,pitFill.target);
    const sun = new THREE.DirectionalLight(0xffcba0, 1.6); sun.position.set(-40, 14, -50); sun.castShadow = true; sun.shadow.mapSize.set(2048, 2048);
    Object.assign(sun.shadow.camera, { left: -25, right: 25, top: 25, bottom: -25, near: 1, far: 150 }); sun.shadow.bias = -0.00003; sun.shadow.normalBias=0.004; s.add(sun);
    const dirt = dirtTextures([0.45, 0.28, 0.18]); dirt.map.repeat.set(30, 30); dirt.bump.repeat.set(30, 30);
    const g = new THREE.Mesh(new THREE.PlaneGeometry(600, 600), new THREE.MeshStandardMaterial({ map: dirt.map, bumpMap: dirt.bump, bumpScale: 0.12, roughness: 1, color: 0xb0a090 }));
    g.rotation.x = -Math.PI / 2; g.receiveShadow = true; s.add(g);
    // the rig, ramp down
    const semi = makeSemi({ team: st.team || 'Red Clay Racing', num: st.num || DEFAULT_PROFILE.num, color: st.color ?? DEFAULT_PROFILE.color, accent: st.accent ?? DEFAULT_PROFILE.accent, cabColor:st.scheme===8?st.accent:0x1a1a1e,scheme:st.scheme });
    semi.position.set(6, 0, -6); semi.rotation.y = 0.15; s.add(semi);
    const u = semi.userData; u.rampPivot.rotation.z = Math.asin(u.floorY / u.rampLen); // ramp down to the ground
    // awning + work lights + tool boxes
    const awn = new THREE.Mesh(new THREE.BoxGeometry(12, 0.08, 4), new THREE.MeshStandardMaterial({ color: st.color ?? DEFAULT_PROFILE.color, roughness: 0.6, side: THREE.DoubleSide }));
    awn.position.set(-4, 4.2, -3.6); s.add(awn);
    this.car = makeLateModel({ color: st.color ?? DEFAULT_PROFILE.color, accent: st.accent ?? DEFAULT_PROFILE.accent, num: st.num || DEFAULT_PROFILE.num,name:st.driver,sponsor:st.sponsor||'RED CLAY RACING',livery:{scheme:st.scheme??DEFAULT_PROFILE.scheme,cageColor:st.cageColor??DEFAULT_PROFILE.cageColor} });
    this.car.position.set(-6, 0, 0.5); this.car.rotation.y = 0.5; s.add(this.car);
    this.contact=new ContactShadow(s,this.car);this.contact.update(()=>0);
    this.rigContact=new ContactShadow(s,semi,true);this.rigContact.update(()=>0);
    const dm = (st.carDmg || 0) / 100; this.car.userData.paint.color.multiplyScalar(1 - dm * 0.5);
    const tb = new THREE.Mesh(new THREE.BoxGeometry(1.6, 1.1, 0.7), new THREE.MeshStandardMaterial({ color: 0xb01010, metalness: 0.5, roughness: 0.35 })); tb.position.set(-11, 0.55, -2.4); tb.castShadow = true; s.add(tb);
    for (let i = 0; i < 4; i++) { const t = new THREE.Mesh(new THREE.CylinderGeometry(0.44, 0.44, 0.38, 20), new THREE.MeshStandardMaterial({ color: 0x57524c, roughness: 0.95 })); t.position.set(-1.5 + (i % 2) * 0.1, 0.19 + Math.floor(i / 2) * 0.0 + i * 0.39, -2.8); t.castShadow = true; s.add(t); }
    const wl = new THREE.PointLight(0xfff0d0, 0, 30, 1.6); wl.position.set(-6, 3.9, -2.5); s.add(wl);
    // distant track light poles & treeline silhouettes
    for (let i=0;i<10;i++){const p=new THREE.Mesh(new THREE.CylinderGeometry(.3,.4,26,8),new THREE.MeshStandardMaterial({color:0x454950,roughness:.9}));p.position.set(-90+i*22,13,-80);s.add(p);const lamp=new THREE.Mesh(new THREE.BoxGeometry(.45,.6,1.6),new THREE.MeshStandardMaterial({color:0xddd7c8,emissive:0xffddaa,emissiveIntensity:.5,roughness:1}));lamp.position.set(p.position.x,26,-80);s.add(lamp);}
    const crowns = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(4, 1), new THREE.MeshStandardMaterial({ color: 0x52614b, roughness:1 }), 100);
    const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(.22,.35,6,6),new THREE.MeshStandardMaterial({color:0x655344,roughness:1}),100);
    const m=new THREE.Matrix4();for(let i=0;i<100;i++){
      const x=-240+i*4.8+Math.sin(i*3.7)*2,z=-140-Math.sin(i*2.3)*14,h=6.2+Math.sin(i*1.7)*.8;
      m.makeScale(1,1.35,1);m.setPosition(x,h,z);crowns.setMatrixAt(i,m);
      m.makeTranslation(x,3,z);trunks.setMatrixAt(i,m);
    }s.add(crowns,trunks);
    this.t = 0; this.spin = opts.spin;
  }
  setupStudio(st) {
    const app=this.app,s=this.scene;this.t=0;this.camera=new THREE.PerspectiveCamera(38,innerWidth/innerHeight,.1,180);
    s.background=new THREE.Color(0x111b20);s.fog=new THREE.Fog(0x111b20,22,65);
    app.bloom.strength=0;app.bloom.threshold=4;app.renderer.toneMappingExposure=.9;
    s.add(new THREE.HemisphereLight(0xe3edf5,0x39434a,1.8));s.add(new THREE.AmbientLight(0xc5d1d7,.65));
    const key=new THREE.DirectionalLight(0xfff4e6,2.4);key.position.set(5,9,8);key.castShadow=true;key.shadow.mapSize.set(2048,2048);Object.assign(key.shadow.camera,{left:-8,right:8,top:8,bottom:-8,near:.1,far:35});key.shadow.bias=-.00003;key.shadow.normalBias=.004;s.add(key);
    const rim=new THREE.DirectionalLight(0xc9dce6,1.7);rim.position.set(-7,6,-5);s.add(rim);
    const floor=new THREE.Mesh(new THREE.PlaneGeometry(180,180),new THREE.MeshStandardMaterial({color:0x28343a,roughness:.94,metalness:.08}));floor.rotation.x=-Math.PI/2;floor.receiveShadow=true;s.add(floor);
    const ring=new THREE.Mesh(new THREE.RingGeometry(4.35,4.365,128),new THREE.MeshBasicMaterial({color:0x75888a,transparent:true,opacity:.22,depthWrite:false}));ring.rotation.x=-Math.PI/2;ring.position.y=.008;s.add(ring);
    this.car=makeLateModel({color:st.color??DEFAULT_PROFILE.color,accent:st.accent??DEFAULT_PROFILE.accent,num:st.num||DEFAULT_PROFILE.num,name:st.driver||DEFAULT_DRIVER,sponsor:st.team||'RED CLAY RACING',livery:{scheme:st.scheme??DEFAULT_PROFILE.scheme,cageColor:st.cageColor??DEFAULT_PROFILE.cageColor}});this.car.rotation.y=-.12;s.add(this.car);this.contact=new ContactShadow(s,this.car);this.contact.update(()=>0);
    const dm=(st.carDmg||0)/100;this.car.userData.paint.color.multiplyScalar(1-dm*.4);this.update(0);
  }
  update(dt) {
    this.t += dt;
    if(this.studio){
      const title=this.app.phase==='title',compact=innerWidth<1000||this.app.isMobile;
      const a=.75+Math.sin(this.t*.07)*.035,r=compact?(title?9:11.8):11.4;
      this.camera.position.set(Math.cos(a)*r,3.5,Math.sin(a)*r);this.camera.lookAt(0,.8,0);
      const target=title?(compact?.70:.70):(compact?.16:.27);
      this.camera.filmOffset=(.5-target)*2*this.camera.getFilmWidth()*this.camera.aspect*Math.tan(this.camera.fov*Math.PI/360);this.camera.updateProjectionMatrix();return;
    }
    const a = -0.9 + Math.sin(this.t * 0.08) * 0.35;
    // car on the left of the screen so the UI panel can sit on the right
    if(this.app.phase==='shop'){this.camera.position.set(5,3.5,12);this.camera.lookAt(-6,1,.5);this.camera.filmOffset=14.5;this.camera.updateProjectionMatrix();return;}
    this.camera.position.set(-6 + Math.cos(a) * 13, 3.2, 2.5 - Math.sin(a) * 13);
    this.camera.lookAt(-1.5, 1.2, -1.5);
  }
  dispose() { disposeScene(this.scene); }
}
