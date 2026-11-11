import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { buildH2, H2_LAMP, windAt, rearGlassAt } from './h2-body.js';
import { beveledBox } from './details.js';
import { glowTexture } from './gfx.js';
// Visible pace car on the existing pace logic (formation arc / pace leader).
// Kinematic only: it is never in the race car list, never collides, and only
// uses the apron plus an infield spot. The mesh is an original compact pace
// SUV built by scripts/build_pace_suv.py. The procedural shell is the
// fallback if the GLB does not load.
const wrapP=(v,P)=>((v%P)+P)%P,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const glbCache={high:null,low:null};
let glbPromise=null;
function paceEnv(){
 if(paceEnv.tex)return paceEnv.tex;
 const W=128,H=64,d=new Uint8Array(W*H*4);
 for(let j=0;j<H;j++)for(let i=0;i<W;i++){
  const v=(j+.5)/H,u=(i+.5)/W;
  const sky=v>0.52,k=(j*W+i)*4;
  const r=sky?170:46,g=sky?188:48,b=sky?206:50;
  const blob=Math.exp(-((Math.min(Math.abs(u-.08),1-Math.abs(u-.08))**2)/0.002)-((v-.7)**2)/0.01);
  d[k]=Math.min(255,r+140*blob);d[k+1]=Math.min(255,g+140*blob);d[k+2]=Math.min(255,b+130*blob);d[k+3]=255;
 }
 const t=new THREE.DataTexture(d,W,H);t.colorSpace=THREE.SRGBColorSpace;
 t.mapping=THREE.EquirectangularReflectionMapping;t.needsUpdate=true;paceEnv.tex=t;return t;
}
function dressGlb(src,low){
 const env=paceEnv();
 const g=src.clone(true);g.name='pace-car';g.rotation.order='YXZ';
 g.traverse(o=>{
  if(!o.isMesh)return;
  const mats=Array.isArray(o.material)?o.material:[o.material];
  for(const m of mats){
   if(!m)continue;
   m.envMap=env;
   if(m.name==='glass'||o.name.startsWith('h2-glass')){
    m.side=THREE.DoubleSide;m.transparent=false;m.opacity=1;m.depthWrite=true;
    m.metalness=Math.max(m.metalness??0,.8);m.roughness=Math.min(m.roughness??1,.08);
    m.envMapIntensity=1.1;
   }else if(m.name==='paint'||m.name==='h2-paint'){
    m.envMapIntensity=.4;
    if('clearcoat' in m){m.clearcoat=1;m.clearcoatRoughness=.06;}
   }else if(m.name==='chrome'){
    m.metalness=1;m.roughness=.1;m.envMapIntensity=1.25;
   }else if(m.name==='rim'){
    m.metalness=.6;m.roughness=.35;m.envMapIntensity=.9;
   }else if(m.name==='lens'){
    m.metalness=0;m.roughness=.04;m.transparent=true;m.opacity=.25;m.depthWrite=false;
    if('transmission' in m){m.transmission=.92;m.thickness=.02;m.transparent=false;m.opacity=1;m.depthWrite=true;}
   }
   m.needsUpdate=true;
  }
 });
 const paceMat=[0,1].map(()=>new THREE.MeshStandardMaterial({color:0xffb000,emissive:0xffaa00,emissiveIntensity:1.4,roughness:.35}));
 const lamps=[],sprites=[],tex=glowTexture();
 const roof=new THREE.Box3().setFromObject(g).max.y;
 for(const side of[1,-1]){
  const pod=new THREE.Mesh(beveledBox(.1,.026,.13,.006,2),paceMat[side>0?0:1]);
  pod.position.set(.2,roof+0.012,side*.16);pod.name='h2-pace-lamp';g.add(pod);lamps.push(pod);
  const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,color:0xffb020,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true,opacity:.5}));
  sp.scale.setScalar(low?0.32:0.46);sp.position.set(.2,roof+0.04,side*.16);g.add(sp);
  if(!low||side>0)sprites.push(sp);else sp.visible=false;
 }
 let tris=0,draws=0;
 const tires=[];
 g.updateMatrixWorld(true);
 g.traverse(o=>{if(!o.isMesh)return;draws++;
  const n=o.geometry.index?o.geometry.index.count/3:o.geometry.attributes.position.count/3;
  tris+=n*(o.isInstancedMesh?o.count:1);
  if(/^h2-tire\d*$/.test(o.name)){
   const box=new THREE.Box3().setFromObject(o);
   tires.push(g.worldToLocal(box.getCenter(new THREE.Vector3())));
  }
 });
 const box=new THREE.Box3().setFromObject(g),size=box.getSize(new THREE.Vector3());
 tires.sort((a,b)=>b.x-a.x);
 const axle=list=>list.reduce((s,p)=>s+p.x,0)/list.length;
 const frontAxle=tires.length>=4?axle(tires.slice(0,2)):WB()/2;
 const rearAxle=tires.length>=4?axle(tires.slice(-2)):-WB()/2;
 const trackWidth=tires.length?Math.max(...tires.map(p=>p.z))-Math.min(...tires.map(p=>p.z)):69.4*0.0254;
 g.userData={lamps,sprites,bar:lamps[0],frontAxle,rearAxle,trackWidth,
  halfLength:size.x*0.5,halfWidth:size.z*0.5,bodyLength:size.x,bodyWidth:size.z,bodyHeight:size.y,
  grille:'slats',lampsShape:'swept',triangles:Math.round(tris),drawCalls:draws,source:'glb'};
 return g;
}
const WB=()=>122.8*0.0254;
// Chrome with no environment renders as flat gray. This is a small room with
// a bright skylight, filtered through PMREM so the surround and the wheels reflect.
export function bindPaceEnv(renderer, root, night=false){
 const scene=new THREE.Scene();
 const wall=(c)=>new THREE.MeshBasicMaterial({color:c,side:THREE.BackSide});
 scene.add(new THREE.Mesh(new THREE.BoxGeometry(14,8,14),[
  wall(night?0x243040:0xd7e0e8), wall(night?0x1a2430:0xb7c3ce),
  wall(night?0x101820:0xf5f8fc), wall(night?0x3a2a1c:0x6e6556),
  wall(night?0x243040:0xe8eef3), wall(night?0x1a2430:0xc9d3dc),
 ]));
 const panel=new THREE.Mesh(new THREE.PlaneGeometry(5,.7), new THREE.MeshBasicMaterial({color:night?0xffe1a8:0xffffff}));
 panel.position.set(1.5,2.4,-5); scene.add(panel);
 const pmrem=new THREE.PMREMGenerator(renderer);
 const env=pmrem.fromScene(scene,0.04).texture;
 pmrem.dispose();
 root.traverse(o=>{
  if(!o.isMesh)return;
  for(const m of [].concat(o.material)){
   if(!m)continue;
   if(m.name==='chrome'||m.name==='rim'||m.name==='paint'||m.name==='bowl'||m.name==='lens'){
    m.envMap=env; m.needsUpdate=true;
   }
  }
 });
 return env;
}
export function preloadH2(){
 if(glbPromise)return glbPromise;
 const loader=new GLTFLoader();
 const file=name=>new URL('../assets/models/'+name,import.meta.url).href;
 const load=url=>new Promise((res,rej)=>loader.load(url,res,undefined,rej));
 glbPromise=Promise.all([load(file('h2.glb')),load(file('h2-low.glb'))]).then(([hi,lo])=>{
  glbCache.high=hi.scene;glbCache.low=lo.scene;
 }).catch(err=>{console.warn('H2 model failed, using the procedural shell',err);glbCache.high=glbCache.low=null;});
 return glbPromise;
}
export function makePaceCar(low=false){
 const src=low?glbCache.low:glbCache.high;
 if(src)return dressGlb(src,low);
 const g=new THREE.Group();g.name='pace-car';g.rotation.order='YXZ';
 buildH2(g,low);return g;
}
preloadH2();
export function auditPaceCar(group){
 const fails=[],size=new THREE.Vector3();
 let tires=0,rims=0,glass=0;
 group.updateMatrixWorld(true);
 group.traverse(o=>{
  if(!o.isMesh)return;
  const geo=o.geometry,n=geo?.attributes?.normal,p=geo?.attributes?.position;
  if(!p||p.count<3){fails.push((o.name||'mesh')+' empty');return;}
  if(!n||n.count!==p.count)fails.push((o.name||'mesh')+' normals');
  else for(let i=0;i<n.count;i+=Math.max(1,n.count/24|0)){
   const l=Math.hypot(n.getX(i),n.getY(i),n.getZ(i));
   if(!Number.isFinite(l)||l<.5||l>1.5){fails.push((o.name||'mesh')+' bad normal');break;}
  }
  const tireName=/^h2-tire\d*$/.test(o.name),rimName=/^h2-rim\d*$/.test(o.name);
  if(tireName||o.name==='h2-spare'){
   if(tireName)tires+=o.isInstancedMesh?o.count:1;
   geo.computeBoundingBox();size.subVectors(geo.boundingBox.max,geo.boundingBox.min);
   if(!(size.z<size.x*.55&&size.z<size.y*.55&&size.x>.7&&size.y>.7))fails.push(`tire axis ${size.x.toFixed(2)} ${size.y.toFixed(2)} ${size.z.toFixed(2)}`);
  }
  if(rimName){
   rims+=o.isInstancedMesh?o.count:1;geo.computeBoundingBox();size.subVectors(geo.boundingBox.max,geo.boundingBox.min);
   if(!(size.z<size.x*.5&&size.z<size.y*.5&&size.x>.35&&size.y>.35))fails.push(`rim axis ${size.x.toFixed(2)} ${size.y.toFixed(2)} ${size.z.toFixed(2)}`);
  }
  if(o.name.startsWith('h2-glass')){
   glass++;
   if(o.material.side!==THREE.DoubleSide)fails.push(o.name+' side');
   if(o.material.transparent||o.material.opacity<1)fails.push(o.name+' hole');
  }
 });
 if(tires!==4)fails.push('tires '+tires);
 if(rims!==4)fails.push('rims '+rims);
 if(glass<1)fails.push('glass '+glass);
 const ray=new THREE.Raycaster(),meshes=[];
 group.traverse(o=>{if(o.isMesh)meshes.push(o);});
 const probe=(origin,dir,expect)=>{
  ray.set(origin,dir.clone().normalize());
  const hit=ray.intersectObjects(meshes,false)[0];
  if(!hit||!hit.object.name.startsWith(expect))fails.push(`ray ${expect} hit ${hit?.object.name||'nothing'}`);
 };
 const toLocal=p=>group.worldToLocal(p);
 if(group.userData.source==='glb'){
  // The CC0 glass and lamps are not on the procedural shell's coordinates.
  // Aim at the real lens and at the real windshield, and require a filled surface.
  let lampOk=false,lampNote='nothing';
  for(const lamp of meshes.filter(o=>o.name.startsWith('h2-headlamp'))){
   const pos=lamp.geometry.attributes.position,pts=[];
   for(let i=0;i<pos.count;i+=2)pts.push(toLocal(lamp.localToWorld(new THREE.Vector3().fromBufferAttribute(pos,i))));
   if(pts.length<4)continue;
   const maxX=Math.max(...pts.map(p=>p.x));
   const front=pts.filter(p=>p.x>maxX-0.06&&Math.abs(p.z)>0.35);
   const pool=front.length?front:pts.filter(p=>p.x>maxX-0.06);
   pool.sort((a,b)=>Math.abs(b.z)-Math.abs(a.z));
   const aim=pool[Math.min(3,pool.length-1)];
   for(const dz of [0,.1,-.06,.18]){
    const c=aim.clone();c.z+=Math.sign(c.z||1)*dz;
    const origin=c.clone();origin.x+=0.5;
    ray.set(origin,new THREE.Vector3(-1,0,0));
    const hit=ray.intersectObjects(meshes,false)[0];
    lampNote=hit?hit.object.name:'nothing';
    if(hit&&hit.object.name.startsWith('h2-headlamp')&&hit.distance<0.6){lampOk=true;break;}
   }
  }
  if(!lampOk){
   const nose=Math.max(...meshes.filter(o=>o.name.startsWith('h2-headlamp')).flatMap(o=>{
    const pos=o.geometry.attributes.position,xs=[];
    for(let i=0;i<pos.count;i+=5){const p=toLocal(o.localToWorld(new THREE.Vector3().fromBufferAttribute(pos,i)));xs.push(p.x);} 
    return xs;
   }),0);
   for(const z of [.5,.68,.84,-.5,-.68,-.84])for(const y of [.78,.92,1.05]){
    ray.set(new THREE.Vector3(nose+0.45,y,z),new THREE.Vector3(-1,0,0));
    const hit=ray.intersectObjects(meshes,false)[0];
    lampNote=hit?hit.object.name:'nothing';
    if(hit&&hit.object.name.startsWith('h2-headlamp')&&hit.distance<0.7){lampOk=true;break;}
   }
  }
  if(!lampOk)fails.push('ray h2-headlamp hit '+lampNote);
  const glassPts=[];
  for(const g of meshes.filter(o=>o.name.startsWith('h2-glass'))){
   const pos=g.geometry.attributes.position;
   const step=Math.max(1,pos.count/48|0);
   for(let i=0;i<pos.count;i+=step)glassPts.push(toLocal(g.localToWorld(new THREE.Vector3().fromBufferAttribute(pos,i))));
  }
  if(glassPts.length<8)fails.push('glass surface');
  else{
   const sideSeesGlass=(sign)=>{
    const pts=glassPts.filter(p=>Math.sign(p.z)===sign&&p.y>1.3&&p.y<1.9);
    pts.sort((a,b)=>Math.abs(b.z)-Math.abs(a.z));
    const tries=pts.filter((_,i)=>i%Math.max(1,pts.length/16|0)===0).slice(0,16);
    let note='nothing';
    for(const p of tries){
     const origin=p.clone();origin.z+=sign*0.5;
     ray.set(origin,new THREE.Vector3(0,0,-sign));
     const hit=ray.intersectObjects(meshes,false)[0];
     note=hit?hit.object.name:'nothing';
     if(hit&&hit.object.name.startsWith('h2-glass')&&hit.distance<0.55)return '';
    }
    return note;
   };
   for(const sign of [1,-1]){
    const note=sideSeesGlass(sign);
    if(note)fails.push('ray h2-glass hit '+note);
   }
   const xs=glassPts.map(p=>p.x),minX=Math.min(...xs),maxX=Math.max(...xs),span=Math.max(0.2,maxX-minX);
   const band=(pred,n)=>glassPts.filter(pred).filter((_,i,a)=>i%Math.max(1,a.length/n|0)===0).slice(0,n);
   for(const p of [...band(p=>p.x>maxX-span*0.2,8),...band(p=>p.x<minX+span*0.2,6)]){
    const origin=p.clone();origin.x+=p.x>=0?0.22:-0.22;
    const dir=p.clone().sub(origin),dist=dir.length();
    ray.set(origin,dir.normalize());
    const hit=ray.intersectObjects(meshes,false)[0];
    if(!hit||hit.distance>dist+0.04)fails.push(`opening ${p.x.toFixed(2)},${p.y.toFixed(2)} hit ${hit?.object.name||'nothing'}`);
   }
  }
 }else{
 probe(new THREE.Vector3(-.1,1.58,1.7),new THREE.Vector3(0,0,-1),'h2-glass');
 probe(new THREE.Vector3(-.8,1.58,-1.7),new THREE.Vector3(0,0,1),'h2-glass');
 probe(new THREE.Vector3(3.4,H2_LAMP.y,H2_LAMP.z),new THREE.Vector3(-1,0,0),'h2-headlamp');
 const seal=(samples,out)=>{
  for(const [u,v] of samples){
   const p=samples===rearSamples?rearGlassAt(u,v):windAt(u,v);
   const target=new THREE.Vector3(...p);
   const origin=target.clone().add(out(u,v));
   const dir=target.clone().sub(origin);
   const dist=dir.length();
   ray.set(origin,dir.normalize());
   const hit=ray.intersectObjects(meshes,false)[0];
   if(!hit||hit.distance>dist+.05)fails.push(`opening ${u},${v} hit ${hit?.object.name||'nothing'}`);
  }
 };
 const rearSamples=[[-1,.08],[-1,.92],[1,.08],[1,.92],[0,.95],[0,.08]];
 seal([[-1,.05],[-1,.5],[-1,.95],[1,.05],[1,.5],[1,.95],[0,.97],[-.7,.95],[.7,.95]],(u,v)=>new THREE.Vector3(.7,.02,Math.sign(u||1)*.22));
 seal(rearSamples,(u)=>new THREE.Vector3(-.65,.02,Math.sign(u||1)*.2));
 }
 return fails;
}
export class PaceCar{
 constructor(race){
  this.race=race;const trk=race.trk,T=race.T,low=race.app.quality==='low';
  this.mesh=makePaceCar(low);
  if(race.app?.renderer)bindPaceEnv(race.app.renderer,this.mesh,race.skyPreset==='night'||race.app.quality==='low');
  race.scene.add(this.mesh);
  this.apronD=-T.W/2-2.6;this.spotD=-T.W/2-11;this.gap=16;this.low=low;
  this.spot=this.pickSpot();
  const lead=race.formationOrder?.[0]||race.cars[0];this.lArc=lead.s;this.lPrev=lead.s;this.lead=lead;
  this.arc=this.lArc+this.gap;this.d=0;this.v=race.paceSpeed();this.state='lead';this.t=0;this.minClear=Infinity;this.log=[];
  this.pose();
 }
 // Infield spot after the frontstretch green zone, clear of equipment, light bases
 // and retirement parking (reserved so recovery parking keeps 7 m away).
 pickSpot(){
  const r=this.race,t=r.trk,f=r.infield,P=t.P;let best=null;
  const clear=(p,m)=>(!f||f.obstacles.every(b=>Math.hypot(Math.max(0,Math.abs(p.x-b.x)-b.hx),Math.max(0,Math.abs(p.z-b.z)-b.hz))>m))&&(!f||f.parking.every(b=>Math.hypot(p.x-b.x,p.z-b.z)>8));
  for(let k=0;k<60&&!best;k++){const S=wrapP(t.s4+t.L*.45+150+k*8,P),p=t.point(S,this.spotD);if(!clear(p,4))continue;let ok=true;for(let j=-6;j<=6;j++){const u=Math.abs(j)/6,q=t.point(S+j*6,this.spotD+(this.apronD-this.spotD)*u);if(!clear(q,2.6)){ok=false;break;}}if(ok)best={s:S,x:p.x,z:p.z};}
  if(!best){const p=t.point(wrapP(t.s4+t.L*.7,P),this.spotD);best={s:wrapP(t.s4+t.L*.7,P),x:p.x,z:p.z};}
  f?.parking.push({x:best.x,z:best.z,pace:true});return best;
 }
 // restart only once the pace car is back out front on the racing surface
 ready(){return this.state!=='lead'||(this.arc-this.lArc>10&&this.d>-1.5)||this.race.cautionT>40;}
 leaderInfo(){
  const r=this.race,P=r.trk.P,list=(r.flag==='pace'||r.flag==='yellow')&&r.formationOrder?r.formationOrder:r.order||r.cars,L=list.find(c=>!c.dnf&&!c.finished)||r.paceLeader||r.cars[0];
  if(L!==this.lead){this.lead=L;this.lPrev=L.s;this.lArc=this.lArc+(((L.s-wrapP(this.lArc,P))%P+P*1.5)%P-P*.5);}
  else{this.lArc+=((L.s-this.lPrev)%P+P*1.5)%P-P*.5;this.lPrev=L.s;}
  return L;
 }
 update(dt){
  const r=this.race,t=r.trk,P=t.P;if(!dt)return;this.t+=dt;
  const L=this.leaderInfo(),lv=Math.max(0,L.speed||0),caution=r.flag==='pace'||r.flag==='yellow';
  let g=this.arc-this.lArc;
  if(caution&&(this.state==='peel'||this.state==='parked')){this.state='lead';// re-centre relative arc: prefer "ahead" up to 0.65 lap
   const rel=wrapP(this.arc-this.lArc,P);this.arc=this.lArc+(rel>P*.75?rel-P:rel);g=this.arc-this.lArc;this.log.push({t:r.time,ev:'rejoin',flag:r.flag,g:+g.toFixed(1)});}
  if(!caution&&this.state==='lead'){this.state='peel';const rel=wrapP(this.spot.s-wrapP(this.arc,P),P);this.spotArc=this.arc+(rel<60?rel+P:rel);this.log.push({t:r.time,ev:'peel',flag:r.flag,spotIn:+(this.spotArc-this.arc).toFixed(1)});}
  let vt=this.v,lane=this.d;
  if(this.state==='lead'){
   const parkedStart=this.v<.5&&this.d<this.apronD-1;
   vt=lv+clamp((this.gap-g)*.8,-9,g<0?11:8);if(g>45&&parkedStart)vt=0;    // wait in the infield for the field to approach
   lane=g>11?0:this.apronD;if(parkedStart&&vt<.5)lane=this.d;             // catch-up runs on the apron, never the racing surface
  }else if(this.state==='peel'){
   const rem=this.spotArc-this.arc;lane=rem<46?this.spotD:this.apronD;
   vt=g>4?Math.max(lv+3,Math.min(26,this.v+1)):lv+4;if(this.d<-t.W/2-1.2)vt=Math.min(vt,Math.sqrt(Math.max(0,2*3.2*(rem-.5))),24);
   if(this.d>-t.W/2-1.2&&g<4)lane=this.apronD;
   if(rem<.6&&this.v<.3){this.state='parked';this.v=0;this.log.push({t:r.time,ev:'parked'});}
  }else{vt=0;lane=this.d;}
  // traffic guard (lapped cars still falling back into the formation): never merge
  // beside a car, never close on one ahead in the pace car's own lane
  if(this.state!=='parked'){const me=wrapP(this.arc,P);for(const c of r.cars){const rel=((c.s-me)%P+P*1.5)%P-P*.5;if(Math.abs(rel)>24)continue;const cd=t.project(c.x,c.z).d;
   if(Math.abs(rel)<12&&lane>this.d+.2&&cd<this.d+4&&cd>this.d-1)lane=this.d;
   if(rel>0&&Math.abs(cd-this.d)<2.6)vt=Math.min(vt,Math.max(0,(c.speed||0)+(rel-8)*.6));}}
  this.v+=clamp(vt-this.v,-6*dt,4.5*dt);this.v=Math.max(0,this.v);this.arc+=this.v*dt;
  const dLane=lane-this.d,rate=this.state==='peel'&&this.d<-t.W/2?2.2:2.6;this.d+=clamp(dLane,-rate*dt,rate*dt)*Math.min(1,this.v/3+(this.state==='lead'?.3:0));
  this.pose(dt);this.lights(caution||this.state==='peel');this.clearance();
 }
 pose(dt=0){
  const t=this.race.trk,P=t.P,s=wrapP(this.arc,P),p=t.point(s,this.d),m=this.mesh,ahead=t.point(s+1.5,this.d+(this.lastDD||0));
  const th=Math.atan2(ahead.z-p.z,ahead.x-p.x);this.x=p.x;this.z=p.z;this.th=th;
  const ud=m.userData,xf=ud.frontAxle??1.63,xr=ud.rearAxle??-1.49,halfT=(ud.trackWidth??1.76)/2;
  const h=(f,q)=>{const cs=Math.cos(th),sn=Math.sin(th),x=p.x+cs*f-sn*q,z=p.z+sn*f+cs*q,pr=t.project(x,z);return t.height(pr.s,pr.d);};
  const fl=h(xf,-halfT),fr=h(xf,halfT),rl=h(xr,-halfT),rr=h(xr,halfT);
  m.position.set(p.x,(fl+fr+rl+rr)/4,p.z);m.rotation.y=-th;m.rotation.z=Math.atan2((fl+fr)-(rl+rr),xf-xr);m.rotation.x=-Math.atan2((fr+rr)-(fl+rl),halfT*2);
 }
 lights(on){
  const u=this.mesh.userData,ph=Math.floor(this.t*6)%2;
  u.lamps.forEach((l,i)=>{l.material.emissiveIntensity=on?(i===ph?3.2:.35):.06;});
  u.sprites.forEach((s,i)=>{s.visible=on&&(this.low||i===ph);});
 }
 // Oriented-box clearance (metres) to every race car, for QA. Never alters cars.
 clearance(){
  const corners=(x,z,th,hl,hw)=>{const c=Math.cos(th),s=Math.sin(th);return[[hl,hw],[hl,-hw],[-hl,hw],[-hl,-hw]].map(([a,b])=>({x:x+c*a-s*b,z:z+s*a+c*b}));};
  const ud=this.mesh.userData,A=corners(this.x,this.z,this.th,ud.halfLength??2.55,ud.halfWidth??1.06);let min=Infinity;
  for(const c of this.race.cars){if(Math.hypot(c.x-this.x,c.z-this.z)>12)continue;const B=corners(c.x,c.z,c.th,2.7,1.05);let sep=-Infinity;
   for(const th of[this.th,this.th+Math.PI/2,c.th,c.th+Math.PI/2]){const ax=Math.cos(th),az=Math.sin(th),pa=A.map(p=>p.x*ax+p.z*az),pb=B.map(p=>p.x*ax+p.z*az);sep=Math.max(sep,Math.max(Math.min(...pa)-Math.max(...pb),Math.min(...pb)-Math.max(...pa)));}
   min=Math.min(min,sep);}
  this.minClear=Math.min(this.minClear,min);this.lastClear=min;
 }
}
