import * as THREE from 'three';
import {beveledBox,instances} from './details.js';
import {glowTexture} from './gfx.js';
// Night19 paddock "work and love": baked lane paint, clay tracks and labels, plus
// instanced generators, drums, tire stacks, crew and extra night lighting.
// Everything sits outside the AI return corridors (see pit-return.js) and the
// player's lane; real lights are not added (emissive heads + additive pools only).
let seed=1907;const rnd=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
export const NEW_POLES=[[-55,-20],[-55,20],[73,22],[8,-41.5],[40,34]];
export function polishPaddock(race,{root,lot,rigs,obstacles,low}){
 seed=1907;const night=race.skyPreset==='night',g=lot.ctx,line=lot.line,stats={props:0,draws:0};
 // ---- baked paint: return lanes, arrows, row labels, clay tire tracks, stains
 const dash=[1.6,1.4];
 line([[61,-47],[61,6]],'rgba(232,198,86,.55)',.13,dash);                     // east lane divider
 line([[58,-41.7],[19,-41.7]],'rgba(232,229,210,.5)',.12);line([[56,-36.6],[20,-36.6]],'rgba(232,229,210,.42)',.12,dash);
 line([[13.6,-36],[13.6,-19]],'rgba(232,229,210,.4)',.12,dash);line([[18.6,-36],[18.6,-24]],'rgba(232,229,210,.4)',.12,dash);
 const arrow=(x,z,a,s=1)=>{g.save();g.translate(x,z);g.rotate(a);g.fillStyle='rgba(236,233,214,.58)';g.beginPath();g.moveTo(1.6*s,0);g.lineTo(-.2*s,-.95*s);g.lineTo(-.2*s,-.38*s);g.lineTo(-1.5*s,-.38*s);g.lineTo(-1.5*s,.38*s);g.lineTo(-.2*s,.38*s);g.lineTo(-.2*s,.95*s);g.closePath();g.fill();g.restore();};
 for(const z of[-38,-18,0])arrow(63,z,Math.PI/2);arrow(48,-39.2,Math.PI);arrow(30,-39,Math.PI);arrow(16.2,-30,Math.PI/2);arrow(46,14.6,Math.PI*.94);
 const label=(t,x,z,size=2,rot=Math.PI/2,col='rgba(226,225,211,.62)')=>{g.save();g.translate(x,z);g.rotate(rot);g.fillStyle=col;g.font=`bold ${size}px Arial`;g.textAlign='center';g.fillText(t,0,0);g.restore();};
 label('ROW A',-4,-33.5,2.4,0);label('ROW B',66,-46.5,2.2,0);label('PIT EXIT ↑',57,-47.5,1.4,0);
 for(const r of rigs){label('#'+r.num,r.rear+(r.side==='right'?2.4:3.2),r.z-3.6,1.5,0,'rgba(229,184,72,.7)');}
 // clay carried in from the track: two-wheel dust tracks along every lane
 const tracks=[[[63,-50],[63,-28],[63,4],[58,11],[46,15],[24,16]],[[62,-46],[52,-39.5],[30,-39],[17,-37],[16,-24]],[[63,-46],[68,-38],[69,-19],[66,-12],[58,-12]],[[63,4],[45,5],[25,1.5],[10,0]]];
 for(const pts of tracks)for(const off of[-.82,.82])for(let pass=0;pass<(low?2:4);pass++){g.strokeStyle=`rgba(118,66,38,${.05+rnd()*.05})`;g.lineWidth=.22+rnd()*.25;g.beginPath();pts.forEach(([x,z],i)=>{const jx=(rnd()-.5)*.35,jz=(rnd()-.5)*.35;i?g.lineTo(x+off+jx,z+off*.2+jz):g.moveTo(x+off+jx,z+jz);});g.stroke();}
 for(let k=0;k<(low?18:40);k++){const x=-70+rnd()*140,z=-42+rnd()*80;g.fillStyle=`rgba(${rnd()<.5?'34,28,24':'112,64,36'},${.05+rnd()*.07})`;g.beginPath();g.ellipse(x,z,.4+rnd()*1.4,.25+rnd()*.6,rnd()*3,0,Math.PI*2);g.fill();}
 // ---- props (instanced, shared materials)
 const yellow=new THREE.MeshStandardMaterial({color:0xd9a21b,roughness:.55}),dark=new THREE.MeshStandardMaterial({color:0x1d2225,roughness:.7}),blue=new THREE.MeshStandardMaterial({color:0x1f4f9a,roughness:.5,metalness:.3}),red=new THREE.MeshStandardMaterial({color:0xa6281d,roughness:.5,metalness:.3});
 const gens=[],genFrames=[],drumsB=[],drumsR=[],tires=[],people=[],heads=[],bulbs=[];
 for(const r of rigs){const x=r.x,z=r.z,add=(o,w,d)=>{obstacles.push({x:o.x,z:o.z,w,d});};
  const gp={x:x+3,y:.33,z:z+3.6};gens.push(gp);genFrames.push({x:gp.x,y:.36,z:gp.z});add(gp,.55,.4);
  drumsB.push({x:x+6,y:.44,z:z+3.4});drumsR.push({x:x+6.75,y:.44,z:z+3.5});add({x:x+6.4,z:z+3.45},.85,.4);
  const n=3+Math.floor(rnd()*3);for(let k=0;k<n;k++)tires.push({x:x+9,y:.12+k*.235,z:z+3.5,ry:rnd()*3});add({x:x+9,z:z+3.5},.45,.45);
  // crew: two under the canopy, one beside the ramp
  for(const [px,pz]of[[x-6.2,z+4.2],[x-8.4,z+5.6],[r.rear+(r.role==='parker'?2.6:3.6),z+(r.role==='parker'?3.2:-3.3)]]){const ry=rnd()*6.28,sc=.92+rnd()*.14;people.push({x:px,y:1.02*sc,z:pz,ry,sx:sc,sy:sc,sz:sc,color:r.color??0x135bc4});heads.push({x:px,y:1.66*sc,z:pz});}
  if(!low)for(let k=0;k<10;k++)bulbs.push({x:x-12.4+k*1.2,y:3.05+Math.sin(k/9*Math.PI)*-.25,z:z+7.55});}
 const genBox=beveledBox(.95,.62,.62,.06,low?2:3);instances(root,genBox,yellow,gens).castShadow=!low;instances(root,new THREE.BoxGeometry(1.05,.06,.7),dark,genFrames);
 const drum=new THREE.CylinderGeometry(.29,.29,.88,low?10:16);instances(root,drum,blue,drumsB).castShadow=!low;instances(root,drum,red,drumsR).castShadow=!low;
 instances(root,new THREE.TorusGeometry(.32,.115,low?6:8,low?14:22).rotateX(Math.PI/2),dark,tires);
 const shirt=new THREE.MeshStandardMaterial({color:0xffffff,roughness:.8}),body=instances(root,new THREE.CapsuleGeometry(.23,.95,low?3:5,low?6:10),shirt,people);people.forEach((p,i)=>body.setColorAt(i,new THREE.Color(p.color)));body.instanceColor.needsUpdate=true;body.castShadow=!low;
 instances(root,new THREE.SphereGeometry(.17,low?8:12,low?6:8),new THREE.MeshStandardMaterial({color:0xc48d6a,roughness:.8}),heads);
 if(bulbs.length)instances(root,new THREE.SphereGeometry(.07,6,4),new THREE.MeshBasicMaterial({color:night?0xffd9a0:0xd8c8a8}),bulbs);
 // ---- lighting: extra poles (emissive heads) + additive light pools on the asphalt
 const steel=new THREE.MeshStandardMaterial({color:0x48535b,roughness:.8}),head=new THREE.MeshStandardMaterial({color:0xe2ded1,emissive:0xffdfb0,emissiveIntensity:night?1.1:.3});
 instances(root,new THREE.BoxGeometry(.18,10,.18),steel,NEW_POLES.map(([x,z])=>({x,y:5,z})));instances(root,new THREE.BoxGeometry(2,.22,.65),head,NEW_POLES.map(([x,z])=>({x,y:10,z})));for(const [x,z]of NEW_POLES)obstacles.push({x,z,w:.3,d:.3});
 const glow=glowTexture(),poolMat=new THREE.MeshBasicMaterial({map:glow,color:0xffc98a,transparent:true,opacity:night?.2:.06,blending:THREE.AdditiveBlending,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4}),all=[[-40,-30],[26,-26],[-35,27],[26,28],...NEW_POLES];
 instances(root,new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2),poolMat,all.map(([x,z])=>({x,y:.03,z,sx:24,sz:24}))).renderOrder=2;
 if(!low){const sp=new THREE.SpriteMaterial({map:glow,color:0xffe2b8,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true,opacity:night?.75:.2});for(const [x,z]of NEW_POLES){const s=new THREE.Sprite(sp);s.position.set(x,9.8,z);s.scale.setScalar(4.2);root.add(s);}}
 stats.props=gens.length+drumsB.length*2+tires.length+people.length+bulbs.length;stats.draws=11+(low?0:NEW_POLES.length);return stats;
}
// Pit road polish: reflective delineators on both edges (all tracks), painted edge
// and centre lines on the Salina asphalt lane, and light pools under lamps.
export function polishPitRoad(race,{root,road,origin,low}){
 const trk=race.trk,S=road.samples,L=road.length,night=race.skyPreset==='night',salina=race.T.id==='salina';
 const tan=i=>{const a=S[Math.max(0,i-1)],b=S[Math.min(S.length-1,i+1)],d=new THREE.Vector2(b.x-a.x,b.z-a.z).normalize();return d;};
 const ok=(x,z)=>{if(Math.abs(x-origin.x)<78&&z>origin.z-56&&z<origin.z+44)return false;if(trk.project(x,z).d<trk.outer+4)return false;return(road.barriers||[]).every(b=>Math.hypot(x-origin.x-b.x,z-origin.z-b.z)>(b.r||.5)+1.2);};
 const posts=[],tops=[],step=low?22:14;
 for(let at=10;at<L-6;at+=step){const f=at/L*(S.length-1),i=Math.floor(f),p=S[i],d=tan(i);for(const side of[-1,1]){const lat=salina?4.25:4.6,x=p.x-d.y*side*lat,z=p.z+d.x*side*lat;if(!ok(x,z))continue;const y=road.heightAt(x,z)??p.y;posts.push({x:x-origin.x,y:y+.5,z:z-origin.z});tops.push({x:x-origin.x,y:y+.92,z:z-origin.z});}}
 instances(root,new THREE.CylinderGeometry(.05,.06,1,6),new THREE.MeshStandardMaterial({color:0xf2f2ec,roughness:.6}),posts);
 instances(root,new THREE.BoxGeometry(.08,.14,.08),new THREE.MeshBasicMaterial({color:night?0xffb23a:0xd9952e}),tops);
 let lines=0;
 if(salina){// thin painted ribbons riding the asphalt (one merged draw)
  const P=[],C=[],push=(a,b,c,col)=>{for(const q of[a,b,c]){P.push(q.x-origin.x,q.y,q.z-origin.z);C.push(...col);}};
  const pt=(i,lat)=>{const p=S[i],d=tan(i),x=p.x-d.y*lat,z=p.z+d.x*lat,y=road.heightAt(x,z);return y===null||y===undefined?null:{x,y:y+.025,z};};
  const strip=(lat,w,col,dashOn)=>{for(let i=1;i<S.length-2;i++){const st=i*L/(S.length-1);if(dashOn&&Math.floor(st/3)%3)continue;const a=pt(i,lat-w/2),b=pt(i,lat+w/2),c=pt(i+1,lat-w/2),e=pt(i+1,lat+w/2);if(!a||!b||!c||!e)continue;if(!ok((a.x+e.x)/2,(a.z+e.z)/2)&&trk.project(a.x,a.z).d<trk.outer+4)continue;if(Math.abs(a.x-origin.x)<76&&a.z>origin.z-52)continue;push(a,c,b,col);push(b,c,e,col);lines++;}};
  strip(-2.62,.12,[.92,.91,.86],false);strip(2.62,.12,[.92,.91,.86],false);strip(0,.11,[.88,.72,.25],true);
  const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(P,3));geo.setAttribute('color',new THREE.Float32BufferAttribute(C,3));geo.computeVertexNormals();
  const m=new THREE.Mesh(geo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:.7,polygonOffset:true,polygonOffsetFactor:-3,polygonOffsetUnits:-3,side:THREE.DoubleSide}));m.name='salina-pit-road-paint';m.receiveShadow=true;root.add(m);}
 // a few warm pools along the lane (no real lights)
 const pools=[];for(let at=30;at<L-20;at+=low?60:36){const f=at/L*(S.length-1),p=S[Math.floor(f)];if(!ok(p.x+6,p.z)&&!ok(p.x-6,p.z))continue;if(Math.abs(p.x-origin.x)<78&&p.z>origin.z-56)continue;pools.push({x:p.x-origin.x,y:(road.heightAt(p.x,p.z)??p.y)+.04,z:p.z-origin.z,sx:16,sz:16});}
 if(pools.length)instances(root,new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2),new THREE.MeshBasicMaterial({map:glowTexture(),color:0xffc98a,transparent:true,opacity:night?.14:.04,blending:THREE.AdditiveBlending,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4}),pools).renderOrder=2;
 return{delineators:posts.length,paintQuads:lines,pools:pools.length};
}
