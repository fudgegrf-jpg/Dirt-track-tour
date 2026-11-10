import * as THREE from 'three';
import {beveledBox} from './details.js';
import {glowTexture} from './gfx.js';
// Night19: visible street-style pace car attached to the existing invisible
// pace logic (formation arc / pace leader). Kinematic only: it is never in the
// race car list, never collides, and only uses the apron + an infield spot.
const wrapP=(v,P)=>((v%P)+P)%P,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function makePaceCar(low=false){
 const g=new THREE.Group();g.name='pace-car';g.rotation.order='YXZ';
 const n=low?2:4,paint=new THREE.MeshStandardMaterial({color:0xf3f1ea,metalness:.35,roughness:.38}),black=new THREE.MeshStandardMaterial({color:0x141618,roughness:.6}),glass=new THREE.MeshStandardMaterial({color:0x10171d,metalness:.4,roughness:.15}),amberStripe=new THREE.MeshStandardMaterial({color:0xf0a21a,roughness:.5});
 const add=(geo,mat,x,y,z,p=g)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=!low;m.receiveShadow=!low;p.add(m);return m;};
 // Night20: original lifted full-size 4x4 pace truck (generic design, no real-vehicle badges): tall slab-sided body,
 // big off-road tires under black flares, steel bumpers, roof rack and the amber light bar.
 const rubber=new THREE.MeshStandardMaterial({color:0x111213,roughness:.92}),rim=new THREE.MeshStandardMaterial({color:0x5d6166,metalness:.6,roughness:.4}),
  steel=new THREE.MeshStandardMaterial({color:0x1d2022,metalness:.5,roughness:.55}),chrome=new THREE.MeshStandardMaterial({color:0xb8bec4,metalness:.85,roughness:.25});
 add(beveledBox(5.0,.8,2.0,.12,n),paint,0,.96,0);                          // body sides / doors
 add(beveledBox(1.55,.07,1.9,.03,n),paint,1.72,1.38,0);                    // flat hood
 add(beveledBox(3.05,.62,1.86,.1,n),glass,-.62,1.67,0);                     // tall greenhouse
 add(beveledBox(3.12,.08,1.92,.04,n),paint,-.62,2.0,0);                     // roof
 for(const px of[.92,-.42,-1.98])add(new THREE.BoxGeometry(px>0?.12:.16,.62,1.9),paint,px,1.67,0); // A/B/D pillars
 for(const z of[-.86,.86])add(new THREE.BoxGeometry(2.8,.05,.06),steel,-.62,2.08,z);           // roof rack rails
 for(const px of[-1.7,.45])add(new THREE.BoxGeometry(.06,.05,1.74),steel,px,2.1,0);
 for(const z of[-1.005,1.005])add(new THREE.BoxGeometry(4.5,.14,.02),amberStripe,-.05,1.14,z); // amber body stripe
 // grille (horizontal bars), slim LED headlamps, steel bumpers with tow hooks, side steps, mirrors
 add(new THREE.BoxGeometry(.06,.4,1.36),black,2.49,1.1,0);
 for(const y of[.98,1.1,1.22])add(new THREE.BoxGeometry(.05,.035,1.32),chrome,2.52,y,0);
 add(beveledBox(.32,.28,2.06,.05,2),steel,2.5,.66,0);add(beveledBox(.3,.28,2.06,.05,2),steel,-2.5,.7,0);
 const hook=new THREE.MeshStandardMaterial({color:0xc4271d,roughness:.5});for(const z of[-.55,.55])add(new THREE.BoxGeometry(.12,.08,.1),hook,2.68,.62,z);
 for(const z of[-1.07,1.07]){add(new THREE.BoxGeometry(2.3,.05,.2),steel,.05,.52,z);add(new THREE.BoxGeometry(.18,.16,.08),black,.95,1.52,z);}
 // door lettering
 const c=document.createElement('canvas');c.width=512;c.height=96;const x=c.getContext('2d');x.fillStyle='#000';x.font='900 64px Arial Black, Arial';x.textAlign='center';x.textBaseline='middle';x.fillText('PACE CAR',256,50);
 const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;const label=new THREE.MeshBasicMaterial({map:t,transparent:true,depthWrite:false});
 for(const s of[-1,1]){const m=new THREE.Mesh(new THREE.PlaneGeometry(1.8,.34),label);m.position.set(-.35,.88,s*1.008);if(s<0)m.rotation.y=Math.PI;g.add(m);}
 for(const [px,pz]of[[1.62,-.9],[1.62,.9],[-1.5,-.9],[-1.5,.9]]){
  const w=add(new THREE.CylinderGeometry(.46,.46,.34,low?12:20).rotateX(Math.PI/2),rubber,px,.46,pz);w.castShadow=false;
  add(new THREE.CylinderGeometry(.25,.25,.36,low?8:12).rotateX(Math.PI/2),rim,px,.46,pz).castShadow=false;
  if(pz>0)add(beveledBox(1.22,.16,2.12,.05,2),black,px,1.0,0);             // fender flare over each axle
 }
 const head=new THREE.MeshBasicMaterial({color:0xf4f6ff}),tail=new THREE.MeshBasicMaterial({color:0xff2a1a});
 for(const z of[-.82,.82]){add(new THREE.BoxGeometry(.04,.09,.3),head,2.51,1.27,z).castShadow=false;add(new THREE.BoxGeometry(.04,.34,.1),tail,-2.51,1.18,z*1.1).castShadow=false;}
 // roof light bar: two emissive halves + additive glow sprites (no real lights)
 const bar=new THREE.Group();bar.position.set(-.1,2.17,0);g.add(bar);add(beveledBox(.34,.1,1.42,.04,2),black,0,0,0,bar);
 const lamps=[],sprites=[],tex=glowTexture();
 for(const s of[-1,1]){const mat=new THREE.MeshStandardMaterial({color:0x6b3e00,emissive:0xffa000,emissiveIntensity:2.5,roughness:.3});const lamp=add(new THREE.BoxGeometry(.28,.12,.6),mat,0,.09,s*.36,bar);lamp.castShadow=false;lamps.push(lamp);
  if(!low||s>0){const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,color:0xffa21c,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true,opacity:.9}));sp.scale.setScalar(low?2.4:1.9);sp.position.set(0,.2,low?0:s*.36);bar.add(sp);sprites.push(sp);}}
 g.userData={lamps,sprites,bar};return g;
}
export class PaceCar{
 constructor(race){
  this.race=race;const trk=race.trk,T=race.T,low=race.app.quality==='low';
  this.mesh=makePaceCar(low);race.scene.add(this.mesh);
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
  const h=(f,q)=>{const cs=Math.cos(th),sn=Math.sin(th),x=p.x+cs*f-sn*q,z=p.z+sn*f+cs*q,pr=t.project(x,z);return t.height(pr.s,pr.d);};
  const fl=h(1.4,-.85),fr=h(1.4,.85),rl=h(-1.4,-.85),rr=h(-1.4,.85);
  m.position.set(p.x,(fl+fr+rl+rr)/4,p.z);m.rotation.y=-th;m.rotation.z=Math.atan2((fl+fr)-(rl+rr),2*2.8);m.rotation.x=-Math.atan2((fr+rr)-(fl+rl),2*1.7);
 }
 lights(on){
  const u=this.mesh.userData,ph=Math.floor(this.t*6)%2;
  u.lamps.forEach((l,i)=>{l.material.emissiveIntensity=on?(i===ph?3.2:.35):.06;});
  u.sprites.forEach((s,i)=>{s.visible=on&&(this.low||i===ph);});
 }
 // Oriented-box clearance (metres) to every race car, for QA. Never alters cars.
 clearance(){
  const corners=(x,z,th,hl,hw)=>{const c=Math.cos(th),s=Math.sin(th);return[[hl,hw],[hl,-hw],[-hl,hw],[-hl,-hw]].map(([a,b])=>({x:x+c*a-s*b,z:z+s*a+c*b}));};
  const A=corners(this.x,this.z,this.th,2.6,1.07);let min=Infinity;
  for(const c of this.race.cars){if(Math.hypot(c.x-this.x,c.z-this.z)>12)continue;const B=corners(c.x,c.z,c.th,2.7,1.05);let sep=-Infinity;
   for(const th of[this.th,this.th+Math.PI/2,c.th,c.th+Math.PI/2]){const ax=Math.cos(th),az=Math.sin(th),pa=A.map(p=>p.x*ax+p.z*az),pb=B.map(p=>p.x*ax+p.z*az);sep=Math.max(sep,Math.max(Math.min(...pa)-Math.max(...pb),Math.min(...pb)-Math.max(...pa)));}
   min=Math.min(min,sep);}
  this.minClear=Math.min(this.minClear,min);this.lastClear=min;
 }
}
