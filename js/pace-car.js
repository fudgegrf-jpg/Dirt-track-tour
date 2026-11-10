import * as THREE from 'three';
import {glowTexture} from './gfx.js';
// Visible pace car on the existing pace logic (formation arc / pace leader).
// Kinematic only: it is never in the race car list, never collides, and only
// uses the apron plus an infield spot. The mesh is an original H2-proportioned SUV.
const wrapP=(v,P)=>((v%P)+P)%P,clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
// Original low-poly Hummer H2 pace SUV. Proportions follow the published 2003 H2
// spec (189.8 x 81.2 x 77.8 in, 122.8 in wheelbase, 69.4 in track, LT315/70R17).
// No Hummer wordmark, badge, or copied mesh — shape only, plus the pace light bar.
// Closed surface of revolution. Profile is [radius, axial] and is closed by the caller.
// Revolution is around Y, then rotateX(PI/2) so the axle lies on Z. Indices are real triangles.
function revolve(profile,seg){
 const count=profile.length,pos=[],idx=[];
 for(let i=0;i<=seg;i++){
  const a=i/seg*Math.PI*2,c=Math.cos(a),s=Math.sin(a);
  for(let k=0;k<count;k++){const [r,y]=profile[k];pos.push(c*r,y,s*r);}
 }
 for(let i=0;i<seg;i++)for(let k=0;k<count;k++){
  const k2=(k+1)%count,a=i*count+k,b=i*count+k2,c=(i+1)*count+k,d=(i+1)*count+k2;
  idx.push(a,b,c,b,d,c);
 }
 const g=new THREE.BufferGeometry();
 g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
 g.setIndex(idx);g.computeVertexNormals();g.rotateX(Math.PI/2);g.computeVertexNormals();
 return g;
}
// Watertight tire: sidewalls, tread, and the inner bead barrel. Axle is local Z.
function tireGeo(radius,width,seg){
 const hw=width*.5,bead=radius*.62,side=radius*.78;
 const ring=[
  [bead,-hw*.42],[side,-hw*.88],[radius*.93,-hw*.98],[radius*.995,-hw*.62],
  [radius,-hw*.18],[radius,hw*.18],[radius*.995,hw*.62],[radius*.93,hw*.98],
  [side,hw*.88],[bead,hw*.42],[bead*.98,hw*.22],[bead*.98,-hw*.22]
 ];
 return revolve(ring,seg);
}
// Squared fender lip. Local origin is the wheel center; +Z is outboard.
// The arch runs over the tire from the front cheek to the rear cheek.
function flareGeo(radius,seg){
 const a0=Math.PI*.16,a1=Math.PI*.84,lip=.12,depth=.34;
 const profile=[[radius+.01,0],[radius+.04,.02],[radius+lip,.05],[radius+lip+.01,.14],[radius+lip,depth],[radius+.025,depth-.02],[radius+.008,.1]];
 const P=profile.length,pos=[],idx=[];
 for(let i=0;i<=seg;i++){
  const a=a0+(a1-a0)*i/seg,c=Math.cos(a),s=Math.sin(a);
  for(const [r,z] of profile)pos.push(c*r,s*r,z);
 }
 for(let i=0;i<seg;i++)for(let k=0;k<P-1;k++){
  const a=i*P+k,b=a+1,c=a+P,d=c+1;
  idx.push(a,c,b,b,c,d);
 }
 const cap=(i,sign)=>{
  const base=i*P;let cx=0,cy=0,cz=0;
  for(let k=0;k<P;k++){cx+=pos[(base+k)*3];cy+=pos[(base+k)*3+1];cz+=pos[(base+k)*3+2];}
  const hub=pos.length/3;pos.push(cx/P,cy/P,cz/P);
  for(let k=0;k<P;k++){const u=base+k,v=base+(k+1)%P;sign>0?idx.push(hub,v,u):idx.push(hub,u,v);}
 };
 cap(0,-1);cap(seg,1);
 const g=new THREE.BufferGeometry();
 g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));
 g.setIndex(idx);g.computeVertexNormals();return g;
}
export function makePaceCar(low=false){
 const g=new THREE.Group();g.name='pace-car';g.rotation.order='YXZ';
 const L=4.821,WB=3.119,frontOH=.78,frontAxle=L/2-frontOH,rearAxle=frontAxle-WB,trackW=1.763;
 const tireR=(17*0.0254+2*0.315*0.70)/2,tireW=.30;
 const paint=new THREE.MeshPhysicalMaterial({color:0xc4a36a,metalness:.18,roughness:.46,clearcoat:.35,clearcoatRoughness:.3});
 const black=new THREE.MeshStandardMaterial({color:0x141618,roughness:.72});
 const glass=new THREE.MeshPhysicalMaterial({color:0x0b1216,metalness:.55,roughness:.08,clearcoat:1,clearcoatRoughness:.06,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:1,polygonOffsetUnits:1});
 const add=(geo,mat,x,y,z,name)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);if(name)m.name=name;m.castShadow=!low&&mat!==glass;m.receiveShadow=!low;g.add(m);return m;};
 const rubber=new THREE.MeshStandardMaterial({color:0x1a1816,roughness:.96}),alloy=new THREE.MeshStandardMaterial({color:0xd5dbe0,metalness:.84,roughness:.22}),
  chrome=new THREE.MeshStandardMaterial({color:0xe6ebef,metalness:.92,roughness:.14});
 const box=(w,h,d)=>new THREE.BoxGeometry(w,h,d);
 const pane=(name,ax,ay,az,bx,by,bz,cx,cy,cz,dx,dy,dz)=>{
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute([ax,ay,az,bx,by,bz,cx,cy,cz,dx,dy,dz],3));
  geo.setIndex([0,1,2,0,2,3]);geo.computeVertexNormals();
  const m=add(geo,glass,0,0,0,name);m.castShadow=false;return m;
 };
 const seg=low?14:22,halfT=trackW/2,doorHw=.74,belt=1.30,roofTop=1.97;
 // Door shell sits inboard of the tires. Flares, not the door skin, make the width.
 add(box(2.05,.92,doorHw*2),paint,.08,.84,0,'h2-doors');
 add(box(1.9,.12,doorHw*2-.04),black,.08,.46,0,'h2-rocker');
 // Thin flat hood between the fenders. Short nose: the face is the grille, not a wall.
 const hood=add(box(1.55,.06,1.36),paint,1.18,1.16,0,'h2-hood');hood.rotation.z=-.02;
 // Dark cabin behind the glass so the panes read as glazing.
 add(box(1.4,.56,1.5),black,-.52,1.62,0,'h2-cabin');
 add(box(1.52,.1,1.7),paint,-.66,1.92,0,'h2-roof');
 // Frames overlap the glass edges. Nothing crosses the middle of a pane.
 add(box(.24,.14,1.7),paint,.44,1.28,0,'h2-cowl');
 add(box(.1,.08,1.55),paint,.06,1.90,0,'h2-header');
 for(const s of[-1,1]){
  const pillar=(x,h,w)=>add(box(w,h,.14),paint,x,1.28+h/2,s*.92);
  pillar(.18,.7,.12);pillar(-.55,.7,.11);pillar(-1.28,.68,.16);
  add(box(1.85,.1,.12),paint,-.5,1.92,s*.86);
  add(box(2.0,.1,.1),paint,.02,1.30,s*(doorHw-.01));
 }
 pane('h2-glass-wind',.50,1.26,-.84,.50,1.26,.84,.16,1.96,.8,.16,1.96,-.8);
 for(const s of[-1,1])pane('h2-glass-side',.12,1.26,s*.78,-1.32,1.26,s*.78,-1.32,1.96,s*.78,.12,1.96,s*.78);
 pane('h2-glass-rear',-1.38,1.30,-.74,-1.38,1.30,.74,-1.38,1.96,.72,-1.38,1.96,-.72);
 // Roof rails sit on the roof skin. The pace lamp is a low bar, not a floating rack.
 for(const s of[-1,1])add(box(1.2,.02,.04),black,-.55,roofTop+.01,s*.62,'h2-rail');
 // Squared flares over each tire, outboard of the door.
 const flare=flareGeo(tireR+.015,low?8:14);
 const wheels=[[frontAxle,halfT],[frontAxle,-halfT],[rearAxle,halfT],[rearAxle,-halfT]];
 for(const [x,z] of wheels){
  const lip=add(flare,paint,x,tireR,Math.sign(z)* (doorHw-.02),'h2-flare');
  if(z<0)lip.rotation.y=Math.PI;
 }
 // Front fender caps beside a recessed grille. They stop short of a full-width slab.
 for(const s of[-1,1]){
  add(box(.50,.42,.40),paint,1.76,.96,s*.72,'h2-fender');
  add(box(.42,.28,.34),paint,-1.85,.98,s*.72,'h2-quarter');
 }
 add(box(.12,.1,1.2),paint,1.86,1.16,0,'h2-hood-nose');
 // One fascia plate closes the gaps between the fender caps. The grille sits in front of it.
 add(box(.1,.62,1.62),paint,1.84,.9,0,'h2-fascia');
 add(box(.05,.4,.48),black,1.92,.94,0,'h2-grille-pocket');
 add(box(.04,.48,.05),paint,1.96,.94,-.26);add(box(.04,.48,.05),paint,1.96,.94,.26);
 add(box(.04,.05,.56),paint,1.96,1.16,0);add(box(.04,.05,.56),paint,1.96,.72,0);
 const bars=new THREE.InstancedMesh(box(.02,.40,.028),chrome,7),bm=new THREE.Matrix4();
 for(let i=0;i<7;i++)bm.compose(new THREE.Vector3(1.95,.94,-.18+i*(.36/6)),new THREE.Quaternion(),new THREE.Vector3(1,1,1)),bars.setMatrixAt(i,bm);
 bars.name='h2-vertical-grille';g.add(bars);
 const headMat=new THREE.MeshStandardMaterial({color:0xf7f8ff,emissive:0xe7eef8,emissiveIntensity:.45,roughness:.16,metalness:.08});
 const turnMat=new THREE.MeshBasicMaterial({color:0xffb03a}),tailMat=new THREE.MeshStandardMaterial({color:0x6a1010,emissive:0xff2a1a,emissiveIntensity:.65,roughness:.35});
 const lampGeo=new THREE.CylinderGeometry(.082,.082,.04,low?12:18).rotateZ(Math.PI/2);
 const bezelGeo=new THREE.TorusGeometry(.098,.012,6,low?14:20).rotateY(Math.PI/2);
 const turnGeo=new THREE.CylinderGeometry(.032,.032,.03,low?8:12).rotateZ(Math.PI/2);
 for(const s of[-1,1]){
  const lamp=add(lampGeo,headMat,2.12,.98,s*.70,'h2-headlamp');lamp.castShadow=false;
  add(bezelGeo,chrome,2.09,.98,s*.70).castShadow=false;
  add(turnGeo,turnMat,2.08,.76,s*.78).castShadow=false;
  add(box(.04,.32,.1),tailMat,-2.22,1.02,s*.78).castShadow=false;
 }
 add(box(.18,.26,1.72),black,2.08,.52,0,'h2-bumper');
 add(box(.12,.2,1.55),black,-2.22,.46,0,'h2-rear-bumper');
 // Closed tires on Z, rims as real indexed meshes (not a stripped vertex soup).
 const tread=tireGeo(tireR,tireW,seg);
 const lipGeo=new THREE.TorusGeometry(.205,.015,low?5:7,low?16:22);
 const hubGeo=new THREE.CylinderGeometry(.055,.055,.04,low?8:12).rotateX(Math.PI/2);
 const spokeGeo=box(.15,.034,.02);spokeGeo.translate(.085,0,.02);
 for(const [x,z] of wheels){
  add(tread,rubber,x,tireR,z,'h2-tire');
  const oz=z+Math.sign(z)*.08;
  add(lipGeo,alloy,x,tireR,oz,'h2-rim');
  add(hubGeo,alloy,x,tireR,oz+.01,'h2-hub');
  for(let i=0;i<6;i++){const s=add(spokeGeo,alloy,x,tireR,oz,'h2-spoke');s.rotation.z=i*Math.PI/3;}
 }
 for(const s of[-1,1])add(box(.14,.1,.12),paint,.40,1.40,s*1.02,'h2-mirror');
 const spare=add(tread,rubber,-2.42,1.0,0,'h2-spare');spare.rotation.y=Math.PI/2;spare.scale.setScalar(.88);
 add(new THREE.CylinderGeometry(.22,.22,.08,low?10:14).rotateZ(Math.PI/2),paint,-2.46,1.0,0,'h2-spare-cover');
 const c=document.createElement('canvas');c.width=512;c.height=80;const ctx=c.getContext('2d');ctx.fillStyle='#1a140c';ctx.font='700 54px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('PACE CAR',256,42);
 const texLabel=new THREE.CanvasTexture(c);texLabel.colorSpace=THREE.SRGBColorSpace;const label=new THREE.MeshBasicMaterial({map:texLabel,transparent:true,depthWrite:false});
 for(const s of[-1,1]){const m=new THREE.Mesh(new THREE.PlaneGeometry(.9,.16),label);m.name='h2-label';m.position.set(.15,1.02,s*(doorHw+.01));if(s<0)m.rotation.y=Math.PI;g.add(m);}
 const stripe=new THREE.MeshStandardMaterial({color:0xd7a441,roughness:.5});
 for(const s of[-1,1])add(box(1.7,.025,.012),stripe,.05,1.08,s*(doorHw+.004));
 const bar=new THREE.Group();bar.position.set(-.35,roofTop+.03,0);g.add(bar);
 add(box(.5,.04,.36),black,-.35,roofTop+.05,0,'h2-lightbar');
 const lamps=[],sprites=[],tex=glowTexture();
 for(const s of[-1,1]){const mat=new THREE.MeshStandardMaterial({color:0x6a3a00,emissive:0xffa000,emissiveIntensity:2.2,roughness:.3});const lamp=add(box(.16,.035,.14),mat,-.35,roofTop+.08,s*.08,'h2-pace-lamp');lamp.castShadow=false;lamps.push(lamp);
  if(!low||s>0){const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,color:0xffb020,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true,opacity:.7}));sp.scale.setScalar(low?.9:.55);sp.position.set(-.35,roofTop+.1,low?0:s*.08);g.add(sp);sprites.push(sp);}}
 let tris=0;g.traverse(o=>{if(o.isMesh||o.isInstancedMesh){const n=o.geometry?.index?o.geometry.index.count/3:(o.geometry?.attributes.position.count||0)/3;tris+=n*(o.isInstancedMesh?o.count:1);}});
 g.userData={lamps,sprites,bar,frontAxle,rearAxle,trackWidth:trackW,halfLength:2.85,halfWidth:1.1,bodyLength:L,bodyWidth:2.062,bodyHeight:1.976,grille:'seven-vertical',lampsShape:'round',triangles:Math.round(tris)};return g;
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
   if(o.name==='h2-tire')tires++;
   geo.computeBoundingBox();size.subVectors(geo.boundingBox.max,geo.boundingBox.min);
   if(!(size.z<size.x*.55&&size.z<size.y*.55&&size.x>.7&&size.y>.7))fails.push(`tire axis ${size.x.toFixed(2)} ${size.y.toFixed(2)} ${size.z.toFixed(2)}`);
  }
  if(o.name==='h2-rim'){
   rims++;geo.computeBoundingBox();size.subVectors(geo.boundingBox.max,geo.boundingBox.min);
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
 if(glass<4)fails.push('glass '+glass);
 const ray=new THREE.Raycaster(),meshes=[];
 group.traverse(o=>{if(o.isMesh)meshes.push(o);});
 const probe=(origin,dir,expect)=>{
  ray.set(origin,dir.clone().normalize());
  const hit=ray.intersectObjects(meshes,false)[0];
  if(!hit||!hit.object.name.startsWith(expect))fails.push(`ray ${expect} hit ${hit?.object.name||'nothing'}`);
 };
 probe(new THREE.Vector3(1.35,1.55,0),new THREE.Vector3(-1,.04,0),'h2-glass');
 probe(new THREE.Vector3(-.4,1.6,1.6),new THREE.Vector3(0,0,-1),'h2-glass');
 probe(new THREE.Vector3(3.2,.98,.70),new THREE.Vector3(-1,0,0),'h2-headlamp');
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
