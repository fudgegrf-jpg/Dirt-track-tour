import * as THREE from 'three';
import { buildH2, H2_LAMP } from './h2-body.js';
// Visible pace car on the existing pace logic (formation arc / pace leader).
// Kinematic only: it is never in the race car list, never collides, and only
// uses the apron plus an infield spot. The mesh is an original H2-proportioned SUV.
const wrapP=(v,P)=>((v%P)+P)%P,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
export function makePaceCar(low=false){
 const g=new THREE.Group();g.name='pace-car';g.rotation.order='YXZ';
 buildH2(g,low);return g;
}
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
  if(o.name==='h2-tire'||o.name==='h2-spare'){
   if(o.name==='h2-tire')tires+=o.isInstancedMesh?o.count:1;
   geo.computeBoundingBox();size.subVectors(geo.boundingBox.max,geo.boundingBox.min);
   if(!(size.z<size.x*.55&&size.z<size.y*.55&&size.x>.7&&size.y>.7))fails.push(`tire axis ${size.x.toFixed(2)} ${size.y.toFixed(2)} ${size.z.toFixed(2)}`);
  }
  if(o.name==='h2-rim'){
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
 probe(new THREE.Vector3(-.1,1.58,1.7),new THREE.Vector3(0,0,-1),'h2-glass');
 probe(new THREE.Vector3(-.8,1.58,-1.7),new THREE.Vector3(0,0,1),'h2-glass');
 probe(new THREE.Vector3(3.4,H2_LAMP.y,H2_LAMP.z),new THREE.Vector3(-1,0,0),'h2-headlamp');
 return fails;
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
