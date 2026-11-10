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
 // 2003 H2 published size. The face follows the civilian H2: seven vertical grille
 // slots and round lamps, not a horizontal-bar truck grille. No name badge.
 const L=4.821,WB=3.119,frontOH=.78,frontAxle=L/2-frontOH,rearAxle=frontAxle-WB,trackW=1.763,tireR=(17*0.0254+2*0.315*0.70)/2;
 const paint=new THREE.MeshStandardMaterial({color:0xc8b89a,metalness:.22,roughness:.48});
 const black=new THREE.MeshStandardMaterial({color:0x121416,roughness:.78});
 const glass=new THREE.MeshStandardMaterial({color:0x070b10,metalness:.62,roughness:.06,envMapIntensity:1.1});
 const amber=new THREE.MeshStandardMaterial({color:0xf0a21a,roughness:.45,emissive:0x5a3208,emissiveIntensity:.35});
 const add=(geo,mat,x,y,z,p=g)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=!low;m.receiveShadow=!low;p.add(m);return m;};
 const rubber=new THREE.MeshStandardMaterial({color:0x14120f,roughness:.96}),rim=new THREE.MeshStandardMaterial({color:0xd5dbe0,metalness:.78,roughness:.28}),
  steel=new THREE.MeshStandardMaterial({color:0x1a1e20,metalness:.4,roughness:.58}),chrome=new THREE.MeshStandardMaterial({color:0xd7dde2,metalness:.88,roughness:.18});
 // Tall body stops at the belt so the glass is the cabin, not a beige panel.
 add(beveledBox(4.55,.34,2.08,.05,n),black,-.06,.52,0);
 add(beveledBox(2.85,.58,1.96,.05,n),paint,-.62,1.02,0);
 add(beveledBox(1.42,.07,1.86,.02,2),paint,1.28,1.30,0);
 add(beveledBox(.55,.16,1.7,.03,2),paint,1.85,1.16,0);
 if(!low)for(const z of[-.32,.32])add(new THREE.BoxGeometry(.28,.025,.1),black,.72,1.345,z);
 const windshield=add(new THREE.BoxGeometry(.045,.7,1.68),glass,.48,1.66,0);windshield.rotation.z=-.36;windshield.castShadow=false;
 add(new THREE.BoxGeometry(1.75,.48,1.72),new THREE.MeshStandardMaterial({color:0x07080a,roughness:1}),-.35,1.64,0);
 for(const s of[-1,1]){const side=add(new THREE.PlaneGeometry(1.95,.5),glass,-.38,1.66,s*1.005);side.castShadow=false;if(s<0)side.rotation.y=Math.PI;}
 const rearGlass=add(new THREE.PlaneGeometry(1.55,.46),glass,-1.78,1.64,0);rearGlass.rotation.y=-Math.PI/2;rearGlass.castShadow=false;
 add(beveledBox(2.15,.06,1.9,.02,2),paint,-.45,1.95,0);
 for(const z of[-.84,.84])add(new THREE.BoxGeometry(.07,.5,.08),paint,.5,1.62,z);
 for(const z of[-.84,.84])add(new THREE.BoxGeometry(.08,.48,.08),paint,-1.5,1.58,z);
 if(!low){for(const z of[-.86,.86])add(new THREE.BoxGeometry(1.7,.035,.04),steel,-.4,2.02,z);add(new THREE.BoxGeometry(.04,.03,1.64),steel,-.15,2.03,0);}
 for(const z of[-1.02,1.02])add(new THREE.BoxGeometry(3.6,.05,.018),amber,-.2,.76,z);
 // Seven vertical slots: black opening, chrome dividers. Round lamps outboard.
 add(new THREE.BoxGeometry(.05,.5,1.02),black,2.36,1.02,0);
 const bars=new THREE.InstancedMesh(new THREE.BoxGeometry(.06,.52,.028),chrome,8),bm=new THREE.Matrix4();
 for(let i=0;i<8;i++){bm.makeTranslation(2.4,1.02,-.44+i*(.88/7));bars.setMatrixAt(i,bm);}bars.name='h2-vertical-grille';bars.castShadow=false;g.add(bars);
 const lampGeo=new THREE.CylinderGeometry(.115,.115,.05,low?12:18).rotateZ(Math.PI/2);
 const bezelGeo=new THREE.TorusGeometry(.132,.022,6,low?12:18).rotateY(Math.PI/2);
 const headMat=new THREE.MeshStandardMaterial({color:0xf7f8ff,emissive:0xdde4ee,emissiveIntensity:.45,roughness:.2,metalness:.15});
 const tailMat=new THREE.MeshBasicMaterial({color:0xff2a1a}),turnMat=new THREE.MeshBasicMaterial({color:0xffb03a});
 for(const z of[-.7,.7]){
  add(new THREE.BoxGeometry(.04,.32,.32),black,2.34,1.06,z);
  add(lampGeo,headMat,2.4,1.06,z).castShadow=false;
  add(bezelGeo,chrome,2.41,1.06,z).castShadow=false;
  add(new THREE.CylinderGeometry(.055,.055,.04,low?10:14).rotateZ(Math.PI/2),turnMat,2.4,.84,z*1.22).castShadow=false;
 }
 add(beveledBox(.36,.3,2.1,.04,2),black,2.28,.5,0);
 add(beveledBox(.24,.26,2.02,.04,2),black,-2.3,.52,0);
 for(const z of[-.86,.86])add(new THREE.BoxGeometry(.04,.42,.16),tailMat,-2.42,1.14,z).castShadow=false;
 const tireGeo=new THREE.CylinderGeometry(tireR,tireR,.36,low?12:18).rotateX(Math.PI/2);
 const rimGeo=new THREE.CylinderGeometry(.2,.2,.38,low?8:12).rotateX(Math.PI/2);
 for(const [px,pz]of[[frontAxle,-trackW/2],[frontAxle,trackW/2],[rearAxle,-trackW/2],[rearAxle,trackW/2]]){
  add(tireGeo,rubber,px,tireR,pz).castShadow=false;
  add(rimGeo,rim,px,tireR,pz).castShadow=false;
 }
 for(const px of[frontAxle,rearAxle])add(beveledBox(1.02,.2,2.12,.04,2),black,px,.96,0);
 for(const z of[-1.05,1.05])add(new THREE.BoxGeometry(1.85,.055,.16),steel,.05,.4,z);
 for(const z of[-1,1])add(new THREE.BoxGeometry(.16,.18,.12),black,.62,1.42,z*1.08).castShadow=false;
 add(new THREE.CylinderGeometry(.46,.46,.22,low?12:18).rotateZ(Math.PI/2),rubber,-2.62,1.16,0).castShadow=false;
 if(!low)add(new THREE.TorusGeometry(.46,.04,6,16).rotateY(Math.PI/2),chrome,-2.72,1.16,0).castShadow=false;
 const c=document.createElement('canvas');c.width=512;c.height=96;const ctx=c.getContext('2d');ctx.fillStyle='#111';ctx.font='900 64px Arial Black, Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('PACE CAR',256,50);
 const texLabel=new THREE.CanvasTexture(c);texLabel.colorSpace=THREE.SRGBColorSpace;const label=new THREE.MeshBasicMaterial({map:texLabel,transparent:true,depthWrite:false});
 for(const s of[-1,1]){const m=new THREE.Mesh(new THREE.PlaneGeometry(1.15,.24),label);m.position.set(-.45,1.02,s*1.0);if(s<0)m.rotation.y=Math.PI;g.add(m);}
 const bar=new THREE.Group();bar.position.set(-.35,2.06,0);g.add(bar);add(beveledBox(.26,.06,.9,.02,2),black,0,0,0,bar);
 const lamps=[],sprites=[],tex=glowTexture();
 for(const s of[-1,1]){const mat=new THREE.MeshStandardMaterial({color:0x6b3e00,emissive:0xffa000,emissiveIntensity:2.4,roughness:.3});const lamp=add(new THREE.BoxGeometry(.2,.07,.36),mat,0,.06,s*.2,bar);lamp.castShadow=false;lamps.push(lamp);
  if(!low||s>0){const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,color:0xffa21c,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true,opacity:.8}));sp.scale.setScalar(low?1.3:.85);sp.position.set(0,.1,low?0:s*.2);bar.add(sp);sprites.push(sp);}}
 g.userData={lamps,sprites,bar,frontAxle,rearAxle,trackWidth:trackW,halfLength:2.75,halfWidth:1.08,bodyLength:L,bodyWidth:2.062,bodyHeight:1.976,grille:'seven-vertical',lampsShape:'round'};return g;
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
