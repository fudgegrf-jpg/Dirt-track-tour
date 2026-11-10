import * as THREE from 'three';
import {beveledBox} from './details.js';
import {glowTexture} from './gfx.js';
// Visible pace car on the existing pace logic (formation arc / pace leader).
// Kinematic only: it is never in the race car list, never collides, and only
// uses the apron plus an infield spot. The mesh is an original H2-proportioned SUV.
const wrapP=(v,P)=>((v%P)+P)%P,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
// Original low-poly Hummer H2 pace SUV. Proportions follow the published 2003 H2
// spec (189.8 x 81.2 x 77.8 in, 122.8 in wheelbase, 69.4 in track, LT315/70R17).
// No Hummer wordmark, badge, or copied mesh — shape only, plus the pace light bar.
export function makePaceCar(low=false){
 const g=new THREE.Group();g.name='pace-car';g.rotation.order='YXZ';
 const n=low?2:3;
 const L=4.821,WB=3.119,frontOH=.78,frontAxle=L/2-frontOH,rearAxle=frontAxle-WB,trackW=1.763,tireR=(17*0.0254+2*0.315*0.70)/2;
 const paint=new THREE.MeshStandardMaterial({color:0xf3f1ea,metalness:.28,roughness:.42}),black=new THREE.MeshStandardMaterial({color:0x141618,roughness:.72}),glass=new THREE.MeshStandardMaterial({color:0x243848,metalness:.35,roughness:.18}),amber=new THREE.MeshStandardMaterial({color:0xf0a21a,roughness:.5});
 const add=(geo,mat,x,y,z,p=g)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=!low;m.receiveShadow=!low;p.add(m);return m;};
 const rubber=new THREE.MeshStandardMaterial({color:0x111213,roughness:.94}),rim=new THREE.MeshStandardMaterial({color:0xb7bcc2,metalness:.72,roughness:.32}),
  steel=new THREE.MeshStandardMaterial({color:0x1a1e20,metalness:.45,roughness:.55}),chrome=new THREE.MeshStandardMaterial({color:0xc5ccd2,metalness:.82,roughness:.22});
 // High beltline, short flat hood, black cladding, upright glass band. Roof at the 77.8 in spec.
 add(beveledBox(4.62,.32,2.06,.05,n),black,-.04,.56,0);
 add(beveledBox(4.35,.62,1.98,.06,n),paint,-.12,1.05,0);
 add(beveledBox(1.28,.06,1.92,.02,2),paint,1.48,1.28,0);
 add(beveledBox(2.05,.5,1.8,.04,n),glass,-.32,1.64,0);
 add(beveledBox(2.28,.06,1.92,.02,2),paint,-.28,1.94,0);
 add(new THREE.BoxGeometry(.1,.52,1.82),paint,.72,1.64,0);
 add(new THREE.BoxGeometry(.12,.52,1.82),paint,-1.38,1.64,0);
 if(!low)for(const z of[-.88,.88])add(new THREE.BoxGeometry(1.9,.04,.045),steel,-.28,2.01,z);
 for(const z of[-1.0,1.0])add(new THREE.BoxGeometry(3.9,.055,.02),amber,-.15,.74,z);
 // Squared grille of horizontal slats between rectangular lamps. No name badge.
 add(new THREE.BoxGeometry(.07,.58,1.16),black,2.4,1.02,0);
 const bars=low?5:7;for(let i=0;i<bars;i++)add(new THREE.BoxGeometry(.045,.028,1.08),chrome,2.45,.78+i*(.46/(bars-1)),0);
 const head=new THREE.MeshBasicMaterial({color:0xf4f6ff}),tail=new THREE.MeshBasicMaterial({color:0xff2a1a}),turn=new THREE.MeshBasicMaterial({color:0xffb03a});
 for(const z of[-.78,.78]){add(new THREE.BoxGeometry(.05,.22,.3),head,2.42,1.16,z).castShadow=false;add(new THREE.BoxGeometry(.04,.08,.28),turn,2.43,.96,z).castShadow=false;}
 add(beveledBox(.34,.28,2.06,.04,2),steel,2.34,.52,0);
 add(beveledBox(.22,.26,2.02,.04,2),steel,-2.28,.54,0);
 for(const z of[-.82,.82])add(new THREE.BoxGeometry(.04,.36,.18),tail,-2.4,1.16,z).castShadow=false;
 for(const [px,pz]of[[frontAxle,-trackW/2],[frontAxle,trackW/2],[rearAxle,-trackW/2],[rearAxle,trackW/2]]){
  add(new THREE.CylinderGeometry(tireR,tireR,.3,low?12:18).rotateX(Math.PI/2),rubber,px,tireR,pz).castShadow=false;
  add(new THREE.CylinderGeometry(.2,.2,.32,low?8:12).rotateX(Math.PI/2),rim,px,tireR,pz).castShadow=false;
 }
 for(const px of[frontAxle,rearAxle])add(beveledBox(.98,.18,2.08,.04,2),black,px,.98,0);
 for(const z of[-1.04,1.04])add(new THREE.BoxGeometry(1.9,.05,.14),steel,.1,.4,z);
 for(const z of[-1,1])add(new THREE.BoxGeometry(.14,.1,.16),black,.7,1.5,z*1.02).castShadow=false;
 // Tailgate-mounted spare, the H2's rear silhouette, without a logo cover.
 add(new THREE.CylinderGeometry(.42,.42,.2,low?12:16).rotateZ(Math.PI/2),rubber,-2.58,1.18,0).castShadow=false;
 if(!low)add(new THREE.TorusGeometry(.42,.045,6,14).rotateY(Math.PI/2),steel,-2.66,1.18,0).castShadow=false;
 const c=document.createElement('canvas');c.width=512;c.height=96;const ctx=c.getContext('2d');ctx.fillStyle='#111';ctx.font='900 64px Arial Black, Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('PACE CAR',256,50);
 const texLabel=new THREE.CanvasTexture(c);texLabel.colorSpace=THREE.SRGBColorSpace;const label=new THREE.MeshBasicMaterial({map:texLabel,transparent:true,depthWrite:false});
 for(const s of[-1,1]){const m=new THREE.Mesh(new THREE.PlaneGeometry(1.2,.26),label);m.position.set(-.25,1.05,s*0.995);if(s<0)m.rotation.y=Math.PI;g.add(m);}
 const bar=new THREE.Group();bar.position.set(-.2,2.04,0);g.add(bar);add(beveledBox(.28,.07,1.05,.03,2),black,0,0,0,bar);
 const lamps=[],sprites=[],tex=glowTexture();
 for(const s of[-1,1]){const mat=new THREE.MeshStandardMaterial({color:0x6b3e00,emissive:0xffa000,emissiveIntensity:2.5,roughness:.3});const lamp=add(new THREE.BoxGeometry(.22,.08,.42),mat,0,.07,s*.24,bar);lamp.castShadow=false;lamps.push(lamp);
  if(!low||s>0){const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,color:0xffa21c,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true,opacity:.85}));sp.scale.setScalar(low?1.5:1.05);sp.position.set(0,.12,low?0:s*.24);bar.add(sp);sprites.push(sp);}}
 g.userData={lamps,sprites,bar,frontAxle,rearAxle,trackWidth:trackW,halfLength:2.7,halfWidth:1.08,bodyLength:L,bodyWidth:2.062,bodyHeight:1.976};return g;
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
