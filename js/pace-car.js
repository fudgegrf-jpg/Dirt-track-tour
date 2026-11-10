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
// One shell with hard panel breaks. Door columns on the reference photo put the side
// glass at about a quarter of the body height under a black roof. The hood stays flat
// and the grille top stays below that line. Flat shading stops the fenders melting.
function sampleKeys(keys,x){
 if(x>=keys[0][0])return keys[0][1];
 for(let i=0;i<keys.length-1;i++){
  const [x0,y0]=keys[i],[x1,y1]=keys[i+1];
  if(x<=x0&&x>=x1)return y0+(y1-y0)*((x0-x)/(x0-x1||1));
 }
 return keys.at(-1)[1];
}
function h2Shell(){
 const fa=4.821/2-.78,ra=fa-3.119,axles=[fa,ra];
 const xs=[];
 const span=(a,b,n)=>{for(let i=0;i<=n;i++){const x=+(a+(b-a)*i/n).toFixed(4);if(!xs.length||Math.abs(xs.at(-1)-x)>.01)xs.push(x);}};
 span(2.30,1.55,3);span(1.55,.62,3);span(.62,.08,3);span(.08,-1.28,5);span(-1.28,-1.72,3);span(-1.72,-2.36,3);
 // Flat hood until 0.62, then a steep windshield up to the roof. Linear, so the break stays sharp.
 const topKeys=[[2.30,1.14],[.62,1.18],[.50,1.34],[.10,1.88],[-.02,1.95],[-1.22,1.95],[-1.42,1.68],[-1.72,1.28],[-2.36,1.14]];
 const flared=x=>axles.some(a=>Math.abs(x-a)<.52);
 const botY=x=>{let y=.42;for(const a of axles){const d=Math.abs(x-a),R=.60;if(d<R)y=Math.max(y,.40+Math.sqrt(Math.max(0,1-(d/R)**2))*.56);}return y;};
 const ring=x=>{
  const bot=botY(x),top=sampleKeys(topKeys,x),hw=flared(x)?1.06:.94;
  const right=[[bot,.03],[bot,hw*.8],[bot+.04,hw],[(bot+Math.min(top,1.32))*.5,hw],[Math.min(top-.04,1.32),hw],[top,hw*.82],[top,hw*.2],[top+.008,0]];
  const full=right.slice();
  for(let i=right.length-2;i>=0;i--)full.push([right[i][0],-right[i][1]]);
  return full.map(([y,z])=>[x,y,z]);
 };
 const rings=xs.map(ring),N=rings[0].length,pos=[],iy=[],ib=[];
 for(const r of rings)for(const p of r)pos.push(p[0],p[1],p[2]);
 const faceBlack=quad=>{let y=0,x=0,minY=1e9;for(const p of quad){x+=p[0];y+=p[1];minY=Math.min(minY,p[1]);}x/=4;y/=4;
  const cabin=x<.12&&x>-1.35;
  return y<.50||(cabin&&minY>1.84);
 };
 for(let s=0;s<rings.length-1;s++){
  const base=s*N;
  for(let i=0;i<N;i++){
   const a=base+i,b=base+(i+1)%N,c=base+N+i,d=base+N+(i+1)%N;
   const quad=[rings[s][i],rings[s][(i+1)%N],rings[s+1][i],rings[s+1][(i+1)%N]];
   if(Math.hypot(quad[1][1]-quad[0][1],quad[1][2]-quad[0][2])<.003)continue;
   (faceBlack(quad)?ib:iy).push(a,b,c,b,d,c);
  }
 }
 const cap=(si,sign)=>{
  const ring=rings[si],base=si*N;
  for(let i=0;i<6;i++){
   const a=base+i,b=base+i+1,d=base+(N-1-i),c=base+(N-1-(i+1));
   const y=(ring[i][1]+ring[i+1][1])/2,bucket=y<.55?ib:iy;
   sign>0?bucket.push(a,d,b,b,d,c):bucket.push(a,b,d,b,c,d);
  }
  const a=base+6,b=base+7,c=base+8,y=(ring[6][1]+ring[7][1])/2,bucket=y<.55?ib:iy;
  sign>0?bucket.push(a,c,b):bucket.push(a,b,c);
 };
 cap(0,1);cap(rings.length-1,-1);
 const geo=()=>{const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));return g;};
 const tidy=g=>{g.computeVertexNormals();const n=g.attributes.normal;for(let i=0;i<n.count;i++){const l=Math.hypot(n.getX(i),n.getY(i),n.getZ(i));if(!Number.isFinite(l)||l<.5)n.setXYZ(i,0,1,0);}return g;};
 const paint=geo();paint.setIndex(iy);tidy(paint);
 const black=geo();black.setIndex(ib);tidy(black);
 return {paint,black,top:x=>sampleKeys(topKeys,x)};
}
export function makePaceCar(low=false){
 const g=new THREE.Group();g.name='pace-car';g.rotation.order='YXZ';
 const L=4.821,WB=3.119,frontOH=.78,frontAxle=L/2-frontOH,rearAxle=frontAxle-WB,trackW=1.763;
 const tireR=(17*0.0254+2*0.315*0.70)/2,tireW=.32,halfT=trackW/2;
 const paint=new THREE.MeshPhysicalMaterial({color:0xf0c400,metalness:.28,roughness:.38,clearcoat:.45,clearcoatRoughness:.3,flatShading:true});
 const blackMat=new THREE.MeshStandardMaterial({color:0x161411,roughness:.7,metalness:.02,flatShading:true});
 const glass=new THREE.MeshPhysicalMaterial({color:0x1c3344,metalness:.5,roughness:.07,clearcoat:1,clearcoatRoughness:.05,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2});
 const add=(geo,mat,x,y,z,name)=>{const m=new THREE.Mesh(geo,mat);m.position.set(x,y,z);if(name)m.name=name;m.castShadow=!low&&mat!==glass;m.receiveShadow=!low;g.add(m);return m;};
 const rubber=new THREE.MeshStandardMaterial({color:0x1c1a17,roughness:.94}),alloy=new THREE.MeshStandardMaterial({color:0xd5dbe0,metalness:.86,roughness:.22}),
  chrome=new THREE.MeshStandardMaterial({color:0xe8eef2,metalness:.9,roughness:.16});
 const box=(w,h,d)=>new THREE.BoxGeometry(w,h,d);
 const pane=(name,ax,ay,az,bx,by,bz,cx,cy,cz,dx,dy,dz)=>{
  const geo=new THREE.BufferGeometry();
  geo.setAttribute('position',new THREE.Float32BufferAttribute([ax,ay,az,bx,by,bz,cx,cy,cz,dx,dy,dz],3));
  geo.setIndex([0,1,2,0,2,3]);geo.computeVertexNormals();const nn=geo.attributes.normal;for(let i=0;i<nn.count;i++){const l=Math.hypot(nn.getX(i),nn.getY(i),nn.getZ(i));if(!Number.isFinite(l)||l<.5)nn.setXYZ(i,0,0,1);}
  const m=add(geo,glass,0,0,0,name);m.castShadow=false;return m;
 };
 const shell=h2Shell();
 add(shell.paint,paint,0,0,0,'h2-body');
 add(shell.black,blackMat,0,0,0,'h2-trim');
 // Windshield is the steep face: 0.52 m of rise over 0.36 m of run, 1.46 m wide.
 pane('h2-glass-wind',.56,1.36,-.82,.56,1.36,.82,.16,1.88,.76,.16,1.88,-.76);
 const frame=(x0,x1,y0,y1,z,name)=>{
  const s=Math.sign(z)||1,cx=(x0+x1)/2,cy=(y0+y1)/2;
  add(box(Math.abs(x1-x0)+.07,(y1-y0)+.07,.03),blackMat,cx,cy,z,'h2-frame');
  pane(name,x0,y0,z+s*.016,x1,y0,z+s*.016,x1,y1,z+s*.016,x0,y1,z+s*.016);
 };
 for(const s of[-1,1]){
  frame(.18,-.38,1.40,1.78,s*1.0,'h2-glass-side');
  frame(-.52,-1.02,1.40,1.78,s*1.0,'h2-glass-side');
  frame(-1.16,-1.38,1.48,1.76,s*.98,'h2-glass-quarter');
  add(box(.09,.46,.05),blackMat,-.45,1.59,s*1.02,'h2-bpillar');
  add(box(.09,.42,.05),blackMat,-1.09,1.60,s*1.0,'h2-cpillar');
  add(box(.18,.14,.24),blackMat,.22,1.55,s*1.12,'h2-mirror');
  add(box(1.1,.04,.045),blackMat,-.55,1.97,s*.55,'h2-rail');
 }
 pane('h2-glass-rear',-1.48,1.78,-.6,-1.48,1.78,.6,-1.66,1.42,.55,-1.66,1.42,-.55);
 add(box(.045,.045,1.0),blackMat,-.2,1.985,0,'h2-crossbar');
 add(box(.045,.045,1.0),blackMat,-.9,1.985,0,'h2-crossbar');
 // Grille is on the nose and ends below the hood (hood line is y=1.14).
 const gTop=1.05,gBot=.66;
 add(box(.05,gTop-gBot,.90),blackMat,2.36,(gTop+gBot)/2,0,'h2-grille-pocket');
 add(box(.02,gTop-gBot+.05,.028),chrome,2.40,(gTop+gBot)/2,-.47);add(box(.02,gTop-gBot+.05,.028),chrome,2.40,(gTop+gBot)/2,.47);
 add(box(.02,.028,.96),chrome,2.40,gTop+.01,0);add(box(.02,.028,.96),chrome,2.40,gBot-.01,0);
 const bars=new THREE.InstancedMesh(box(.016,gTop-gBot-.05,.028),chrome,7),bm=new THREE.Matrix4();
 for(let i=0;i<7;i++)bm.makeTranslation(2.385,(gTop+gBot)/2,-.32+i*(.64/6)),bars.setMatrixAt(i,bm);
 bars.name='h2-vertical-grille';g.add(bars);
 const headMat=new THREE.MeshStandardMaterial({color:0xf4f7fb,emissive:0xdfe7f2,emissiveIntensity:.35,roughness:.14,metalness:.04});
 const turnMat=new THREE.MeshBasicMaterial({color:0xffb03a}),tailMat=new THREE.MeshStandardMaterial({color:0x8a1814,emissive:0xff2a1a,emissiveIntensity:.45,roughness:.35});
 const lampGeo=new THREE.CylinderGeometry(.07,.07,.028,low?12:18).rotateZ(Math.PI/2);
 const bezelGeo=new THREE.TorusGeometry(.082,.01,6,low?14:20).rotateY(Math.PI/2);
 for(const s of[-1,1]){
  const lamp=add(lampGeo,headMat,2.40,.90,s*.72,'h2-headlamp');lamp.castShadow=false;
  add(bezelGeo,chrome,2.39,.90,s*.72).castShadow=false;
  add(new THREE.CylinderGeometry(.024,.024,.02,10).rotateZ(Math.PI/2),turnMat,2.31,.72,s*.84).castShadow=false;
  add(box(.03,.36,.08),tailMat,-2.36,1.08,s*.78).castShadow=false;
 }
 add(box(.7,.05,.24),blackMat,-.45,1.99,0,'h2-lightbar');
 const lamps=[],sprites=[],tex=glowTexture();
 for(const s of[-1,1]){
  const mat=new THREE.MeshStandardMaterial({color:0xffb000,emissive:0xffaa00,emissiveIntensity:1.4,roughness:.4});
  const lamp=add(box(.18,.045,.09),mat,-.45,2.03,s*.06,'h2-pace-lamp');lamp.castShadow=false;lamps.push(lamp);
  if(!low||s>0){const sp=new THREE.Sprite(new THREE.SpriteMaterial({map:tex,color:0xffb020,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true,opacity:.4}));sp.scale.setScalar(.28);sp.position.set(-.45,2.05,s*.06);g.add(sp);sprites.push(sp);}
 }
 const seg=low?16:24,tread=tireGeo(tireR,tireW,seg);
 const lipGeo=new THREE.TorusGeometry(.20,.016,low?5:7,low?18:24);
 const hubGeo=new THREE.CylinderGeometry(.05,.05,.03,low?8:12).rotateX(Math.PI/2);
 const spokeGeo=box(.14,.028,.016);spokeGeo.translate(.078,0,.01);
 for(const [x,z] of [[frontAxle,halfT],[frontAxle,-halfT],[rearAxle,halfT],[rearAxle,-halfT]]){
  add(tread,rubber,x,tireR,z,'h2-tire');
  const oz=z+Math.sign(z)*.06;
  add(lipGeo,alloy,x,tireR,oz,'h2-rim');
  add(hubGeo,alloy,x,tireR,oz+.01,'h2-hub');
  for(let i=0;i<6;i++){const sp=add(spokeGeo,alloy,x,tireR,oz,'h2-spoke');sp.rotation.z=i*Math.PI/3;}
 }
 const spare=add(tread,rubber,-2.52,1.05,0,'h2-spare');spare.rotation.y=Math.PI/2;spare.scale.setScalar(.9);
 add(new THREE.CylinderGeometry(.17,.17,.05,low?10:14).rotateZ(Math.PI/2),alloy,-2.56,1.05,0);
 const c=document.createElement('canvas');c.width=512;c.height=64;const ctx=c.getContext('2d');ctx.fillStyle='#1a1408';ctx.font='700 46px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('PACE CAR',256,34);
 const texLabel=new THREE.CanvasTexture(c);texLabel.colorSpace=THREE.SRGBColorSpace;const label=new THREE.MeshBasicMaterial({map:texLabel,transparent:true,depthWrite:false});
 for(const s of[-1,1]){const m=new THREE.Mesh(new THREE.PlaneGeometry(.78,.12),label);m.position.set(-.05,1.08,s*1.0);if(s<0)m.rotation.y=Math.PI;g.add(m);}
 let tris=0;g.traverse(o=>{if(o.isMesh||o.isInstancedMesh){const n=o.geometry?.index?o.geometry.index.count/3:(o.geometry?.attributes.position.count||0)/3;tris+=n*(o.isInstancedMesh?o.count:1);}});
 g.userData={lamps,sprites,bar:lamps[0],frontAxle,rearAxle,trackWidth:trackW,halfLength:2.85,halfWidth:1.1,bodyLength:L,bodyWidth:2.062,bodyHeight:1.976,grille:'seven-vertical',lampsShape:'round',triangles:Math.round(tris)};return g;
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
 probe(new THREE.Vector3(-.1,1.58,1.7),new THREE.Vector3(0,0,-1),'h2-glass');
 probe(new THREE.Vector3(-.8,1.58,-1.7),new THREE.Vector3(0,0,1),'h2-glass');
 probe(new THREE.Vector3(3.4,.90,.72),new THREE.Vector3(-1,0,0),'h2-headlamp');
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
