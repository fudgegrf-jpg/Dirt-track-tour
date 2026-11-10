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
// Closed rounded section. Points run around YZ, z to the right, y up.
function shellOutline(hw,top,bot,rad,crown,n){
 const r=Math.max(.02,Math.min(rad,(top-bot)*.45,hw*.45)),k=Math.max(1,n);
 const pts=[],arc=(cx,cy,a0,a1)=>{for(let i=0;i<=k;i++){const a=a0+(a1-a0)*i/k;pts.push([cx+Math.cos(a)*r,cy+Math.sin(a)*r]);}};
 arc(hw-r,bot+r,-Math.PI/2,0);
 arc(hw-r,top-r,0,Math.PI/2);
 arc(-hw+r,top-r,Math.PI/2,Math.PI);
 arc(-hw+r,bot+r,Math.PI,Math.PI*1.5);
 for(const p of pts)if(p[1]>top-r*1.4)p[1]+=crown*(1-Math.min(1,(p[0]/hw)**2));
 return pts;
}
function loftMesh(stations,around){
 const rings=stations.map(s=>shellOutline(s.hw,s.top,s.bot,s.rad,s.crown||0,around).map(([z,y])=>new THREE.Vector3(s.x,y,z)));
 const N=rings[0].length,pos=[],idx=[];
 for(const ring of rings)for(const p of ring)pos.push(p.x,p.y,p.z);
 for(let s=0;s<rings.length-1;s++)for(let i=0;i<N;i++){
  const a=s*N+i,b=s*N+(i+1)%N,c=(s+1)*N+i,d=(s+1)*N+(i+1)%N;
  idx.push(a,b,c,b,d,c);
 }
 const cap=(ring,sign)=>{const base=pos.length/3,c=new THREE.Vector3();for(const p of ring)c.add(p);c.multiplyScalar(1/ring.length);pos.push(c.x,c.y,c.z);const hub=pos.length/3-1;for(const p of ring)pos.push(p.x,p.y,p.z);for(let i=0;i<N;i++){const u=base+1+i,v=base+1+(i+1)%N;sign>0?idx.push(hub,v,u):idx.push(hub,u,v);}};
 cap(rings[0],1);cap(rings.at(-1),-1);
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setIndex(idx);g.computeVertexNormals();return g;
}
function tireLathe(radius,width,seg){
 const pts=[];const n=10;
 for(let i=0;i<=n;i++){const u=i/n,side=(u-.5)*width,bulge=Math.sin(u*Math.PI);let r=radius-.03*(1-bulge);
  if(u>.38&&u<.62){const tread=(u-.5)/.24;r-=.012*Math.pow(Math.sin(tread*Math.PI*3),2);}
  pts.push(new THREE.Vector2(r,side));}
 return new THREE.LatheGeometry(pts,seg).rotateZ(Math.PI/2);
}
function alloyGeo(low){
 const parts=[new THREE.CylinderGeometry(.2,.22,.12,low?10:16),new THREE.TorusGeometry(.2,.018,6,low?12:20)];
 const spoke=new THREE.BoxGeometry(.035,.16,.045);
 for(let i=0;i<6;i++){const g=spoke.clone();g.rotateZ(i*Math.PI/3);g.translate(.1,0,0);parts.push(g);}
 const lip=new THREE.TorusGeometry(.205,.028,6,low?14:22);parts.push(lip);
 const pos=[];
 for(const g of parts){g.rotateX(Math.PI/2);const p=g.attributes.position;for(let i=0;i<p.count;i++)pos.push(p.getX(i),p.getY(i),p.getZ(i));g.dispose();}
 const out=new THREE.BufferGeometry();out.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));out.computeVertexNormals();return out;
}
export function makePaceCar(low=false){
 const g=new THREE.Group();g.name='pace-car';g.rotation.order='YXZ';
 const around=low?2:3;
 const L=4.821,WB=3.119,frontOH=.78,frontAxle=L/2-frontOH,rearAxle=frontAxle-WB,trackW=1.763,tireR=(17*0.0254+2*0.315*0.70)/2;
 const paint=new THREE.MeshPhysicalMaterial({color:0xc6b08a,metalness:.22,roughness:.42,clearcoat:.4,clearcoatRoughness:.28});
 const black=new THREE.MeshStandardMaterial({color:0x141618,roughness:.72});
 const glass=new THREE.MeshPhysicalMaterial({color:0x102028,metalness:.45,roughness:.06,clearcoat:1,clearcoatRoughness:.05,envMapIntensity:.8});
 const add=(geo,mat,x,y,z)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);m.castShadow=!low;m.receiveShadow=!low;g.add(m);return m;};
 const rubber=new THREE.MeshStandardMaterial({color:0x161412,roughness:.97}),alloy=new THREE.MeshStandardMaterial({color:0xc5ccd2,metalness:.82,roughness:.24}),
  chrome=new THREE.MeshStandardMaterial({color:0xdfe4e8,metalness:.9,roughness:.16});
 // Body is split around the axles so the side skin does not swallow the tires.
 const nose=loftMesh([
  {x:2.34,top:1.22,bot:.44,hw:.96,rad:.04},
  {x:2.06,top:1.24,bot:.78,hw:1.00,rad:.05}
 ],around);
 const hood=loftMesh([
  {x:2.18,top:1.24,bot:.88,hw:.99,rad:.04,crown:.008},
  {x:1.35,top:1.30,bot:.90,hw:1.00,rad:.05,crown:.014},
  {x:.42,top:1.32,bot:1.06,hw:1.00,rad:.04,crown:.008}
 ],around);
 const doors=loftMesh([
  {x:1.02,top:1.32,bot:.40,hw:1.00,rad:.05,crown:.01},
  {x:.1,top:1.30,bot:.42,hw:1.00,rad:.05},
  {x:-.88,top:1.30,bot:.42,hw:1.00,rad:.05}
 ],around);
 const quarter=loftMesh([
  {x:-.95,top:1.28,bot:.90,hw:1.00,rad:.04},
  {x:-2.16,top:1.16,bot:.88,hw:.98,rad:.04}
 ],around);
 const tail=loftMesh([
  {x:-2.08,top:1.16,bot:.38,hw:.98,rad:.05},
  {x:-2.46,top:1.04,bot:.32,hw:.94,rad:.04}
 ],around);
 for(const part of [nose,hood,doors,quarter,tail])add(part,paint,0,0,0);
 const roof=loftMesh([
  {x:.36,top:1.86,bot:1.66,hw:.86,rad:.035},
  {x:.02,top:1.96,bot:1.74,hw:.94,rad:.04,crown:.01},
  {x:-1.05,top:1.97,bot:1.76,hw:.95,rad:.04,crown:.012},
  {x:-1.58,top:1.86,bot:1.64,hw:.86,rad:.035}
 ],around);
 add(roof,paint,0,0,0);
 add(new THREE.BoxGeometry(.36,.2,1.55),paint,.42,1.40,0);
 add(new THREE.BoxGeometry(.2,.12,1.7),paint,0,1.82,0);
 const glassPane=(x0,y0,z0,x1,y1,z1)=>{const geo=new THREE.BufferGeometry();const dx=x1-x0,dy=y1-y0,len=Math.hypot(dx,dy)||1,nx=-dy/len,ny=dx/len;const hw=.76;geo.setAttribute('position',new THREE.Float32BufferAttribute([x0+nx*.02,y0+ny*.02,-hw,x0,y0,hw,x1,y1,hw,x0+nx*.02,y0+ny*.02,-hw,x1,y1,hw,x1+nx*.02,y1+ny*.02,-hw,x0,y0,-hw,x0-nx*.02,y0-ny*.02,hw,x1-nx*.02,y1-ny*.02,hw,x0,y0,-hw,x1-nx*.02,y1-ny*.02,hw,x1,y1,-hw],3));geo.computeVertexNormals();return add(geo,glass,0,0,z0||0);};
 glassPane(.34,1.46,0,.08,1.80,0);
 for(const s of[-1,1])for(const [x0,x1] of [[.18,-.5],[-.7,-1.32]]){const h=.44,pane=add(new THREE.PlaneGeometry(x0-x1,h),glass,(x0+x1)/2,1.32+h/2,s*.9);pane.castShadow=false;if(s<0)pane.rotation.y=Math.PI;}
 const rearWin=add(new THREE.PlaneGeometry(1.36,.4),glass,-1.52,1.54,0);rearWin.rotation.y=-Math.PI/2;rearWin.castShadow=false;
 const pillar=(x,z,h,w)=>add(new THREE.BoxGeometry(w,h,.12),paint,x,1.30+h/2,z);
 for(const z of[-.9,.9]){pillar(.28,z,.52,.16);pillar(-.6,z,.54,.12);pillar(-1.4,z,.5,.16);}
 // Fender belts close the seam over each wheel and leave the tire visible below.
 for(const s of[-1,1]){
  add(new THREE.BoxGeometry(1.55,.5,.2),paint,frontAxle,1.02,s*.99);
  add(new THREE.BoxGeometry(1.4,.46,.2),paint,rearAxle,.98,s*.99);
 }
 add(beveledBox(1.7,.14,1.9,.03,2),black,.06,.48,0);
 if(!low)for(const z of[-.34,.34])add(new THREE.BoxGeometry(.34,.03,.12),black,.78,1.345,z);
 // Recessed seven-slot grille and round lamps, set back from the bumper face.
 add(new THREE.BoxGeometry(.06,.46,.92),black,2.36,.98,0);
 const bars=new THREE.InstancedMesh(new THREE.BoxGeometry(.025,.48,.032),chrome,7),bm=new THREE.Matrix4();
 for(let i=0;i<7;i++){bm.makeTranslation(2.39,.98,-.32+i*(.64/6));bars.setMatrixAt(i,bm);}bars.name='h2-vertical-grille';g.add(bars);
 const headMat=new THREE.MeshStandardMaterial({color:0xf4f7ff,emissive:0xe7eef8,emissiveIntensity:.55,roughness:.18,metalness:.12});
 const turnMat=new THREE.MeshBasicMaterial({color:0xffb03a}),tailMat=new THREE.MeshStandardMaterial({color:0x6a1010,emissive:0xff2a1a,emissiveIntensity:.7,roughness:.35});
 for(const z of[-.72,.72]){
  add(new THREE.CylinderGeometry(.125,.125,.05,low?12:20).rotateZ(Math.PI/2),headMat,2.40,1.02,z).castShadow=false;
  add(new THREE.TorusGeometry(.145,.02,6,low?12:18).rotateY(Math.PI/2),chrome,2.42,1.02,z).castShadow=false;
  add(new THREE.CylinderGeometry(.045,.045,.04,low?8:12).rotateZ(Math.PI/2),turnMat,2.40,.78,z*1.22).castShadow=false;
 }
 add(beveledBox(.22,.28,1.96,.04,2),black,2.38,.5,0);
 add(beveledBox(.28,.28,2.04,.04,2),black,-2.28,.5,0);
 for(const z of[-.88,.88])add(beveledBox(.04,.5,.18,.015,2),tailMat,-2.4,1.12,z).castShadow=false;
 const tires=new THREE.InstancedMesh(tireLathe(tireR,.34,low?14:22),rubber,4);
 const rims=new THREE.InstancedMesh(alloyGeo(low),alloy,4),wm=new THREE.Matrix4();
 [[frontAxle,trackW/2],[frontAxle,-trackW/2],[rearAxle,trackW/2],[rearAxle,-trackW/2]].forEach(([x,z],i)=>{wm.makeTranslation(x,tireR,z);tires.setMatrixAt(i,wm);rims.setMatrixAt(i,wm);});
 g.add(tires,rims);
 for(const z of[-1,1]){add(beveledBox(.22,.16,.14,.03,2),paint,.55,1.38,z*1.02);add(new THREE.BoxGeometry(.08,.04,.04),black,z>0?.15:-.95,1.16,z*.995);}
 const spare=add(new THREE.CylinderGeometry(.42,.42,.16,low?12:20).rotateZ(Math.PI/2),rubber,-2.55,1.12,0);spare.castShadow=false;
 add(new THREE.CylinderGeometry(.24,.24,.18,low?10:16).rotateZ(Math.PI/2),paint,-2.62,1.12,0).castShadow=false;
 if(!low){for(const x of[-1.2,-.3,.5])add(new THREE.BoxGeometry(.04,.025,1.55),black,x,2.03,0);}
 const c=document.createElement('canvas');c.width=512;c.height=80;const ctx=c.getContext('2d');ctx.fillStyle='#1a140c';ctx.font='700 54px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('PACE CAR',256,42);
 const texLabel=new THREE.CanvasTexture(c);texLabel.colorSpace=THREE.SRGBColorSpace;const label=new THREE.MeshBasicMaterial({map:texLabel,transparent:true,depthWrite:false});
 for(const s of[-1,1]){const m=new THREE.Mesh(new THREE.PlaneGeometry(1.05,.2),label);m.position.set(.05,1.05,s*1.01);if(s<0)m.rotation.y=Math.PI;g.add(m);}
 for(const z of[-1.005,1.005])add(new THREE.BoxGeometry(1.7,.03,.012),new THREE.MeshStandardMaterial({color:0xe0a020,roughness:.5}),.05,.95,z);
 const bar=new THREE.Group();bar.position.set(-.2,2.08,0);g.add(bar);add(beveledBox(.55,.05,.72,.015,2),black,0,.02,0);
 const lamps=[],sprites=[],tex=glowTexture();
 for(const s of[-1,1]){const mat=new THREE.MeshStandardMaterial({color:0x6a3a00,emissive:0xffa000,emissiveIntensity:2.2,roughness:.3});const lamp=add(new THREE.BoxGeometry(.22,.045,.28),mat,0,.06,s*.16);lamp.castShadow=false;lamps.push(lamp);
  if(!low||s>0){const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,color:0xffb020,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true,opacity:.75}));sp.scale.setScalar(low?1.1:.7);sp.position.set(0,.08,low?0:s*.16);bar.add(sp);sprites.push(sp);}}
 let tris=0;g.traverse(o=>{if(o.isMesh||o.isInstancedMesh){const n=o.geometry?.index?o.geometry.index.count/3:(o.geometry?.attributes.position.count||0)/3;tris+=n*(o.isInstancedMesh?o.count:1);}});
 g.userData={lamps,sprites,bar,frontAxle,rearAxle,trackWidth:trackW,halfLength:2.85,halfWidth:1.1,bodyLength:L,bodyWidth:2.062,bodyHeight:1.976,grille:'seven-vertical',lampsShape:'round',triangles:Math.round(tris)};return g;
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
