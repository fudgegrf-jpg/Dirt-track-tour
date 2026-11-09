import * as THREE from 'three';
import {instances} from './details.js';
import {glowTexture} from './gfx.js';
// Night19 highway first pass (ATS-inspired): raised pavement markers on both
// carriageways, mile markers, and median twin-arm street lights around every
// exit with emissive heads, glow sprites and additive pools. No real lights.
const MEDIAN=14;
export function polishRoad(h){
 const low=h.app.quality==='low',scene=h.scene,stats={rpm:0,lights:0,markers:0},exitZone=S=>h.exits.some(e=>S>e.S-230&&S<e.S+520);
 // raised pavement markers: white on our lane line, amber along the median edge
 const white=[],amber=[];
 for(let S=6;S<h.Lg+500;S+=low?36:24){for(const lat of[3.7,-MEDIAN-3.7])white.push(Object.assign(h.pt(S,lat,.03),{ry:-h.at(S).th}));if(!low&&!exitZone(S)){amber.push(Object.assign(h.pt(S+12,-.25,.03),{ry:-h.at(S).th}));amber.push(Object.assign(h.pt(S+12,-MEDIAN+.25,.03),{ry:-h.at(S).th}));}}
 const rpmGeo=new THREE.BoxGeometry(.1,.035,.1),wm=new THREE.MeshStandardMaterial({color:0xf2f2ea,emissive:0xd8d8c8,emissiveIntensity:.25,roughness:.3}),am=new THREE.MeshStandardMaterial({color:0xe9a52a,emissive:0xd08a18,emissiveIntensity:.25,roughness:.3});
 instances(scene,rpmGeo,wm,white);if(amber.length)instances(scene,rpmGeo,am,amber);h.lamps=h.lamps||[];h.lamps.push(wm,am);stats.rpm=white.length+amber.length;
 // mile markers (route miles: the leg is compressed 9 m per mile)
 const post=new THREE.MeshStandardMaterial({color:0x6b7378,metalness:.4,roughness:.5}),posts=[];
 for(let S=450;S<h.Lg;S+=450){if(exitZone(S))continue;const p=h.pt(S,12.7),y=h.terrainY?h.terrainY(S,12.7):p.y;posts.push({x:p.x,y:y+.7,z:p.z});
  if(!low){const c=document.createElement('canvas');c.width=64;c.height=128;const g=c.getContext('2d');g.fillStyle='#0d5d34';g.fillRect(0,0,64,128);g.strokeStyle='#f0f3ee';g.lineWidth=3;g.strokeRect(3,3,58,122);g.fillStyle='#f0f3ee';g.font='bold 18px Arial';g.textAlign='center';g.fillText('MILE',32,34);g.font='bold 30px Arial';g.fillText(String(Math.round(S/9)),32,82);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;
   const m=new THREE.MeshStandardMaterial({map:t,emissive:0xffffff,emissiveMap:t,emissiveIntensity:.05,roughness:.5});const plate=new THREE.Mesh(new THREE.PlaneGeometry(.3,.6),m);plate.position.set(p.x,y+1.35,p.z);plate.rotation.y=-h.at(S).th-Math.PI/2;scene.add(plate);h.signs?.push(m);}
  stats.markers++;}
 if(posts.length)instances(scene,new THREE.BoxGeometry(.06,1.4,.06),post,posts);
 // median street lights around exits: one pole, two arms, two heads, sprite + pool per side
 const poles=[],arms=[],heads=[],pools=[],sprites=[];
 for(const e of h.exits)for(let S=e.S-200;S<e.S+520;S+=low?110:70){const th=h.at(S).th,base=h.pt(S,-MEDIAN/2),gy=h.groundY?h.groundY(S,-MEDIAN/2):base.y;poles.push({x:base.x,y:gy+5.5,z:base.z});
  for(const [lat,road] of[[-MEDIAN/2+3.2,1.8],[-MEDIAN/2-3.2,-MEDIAN-1.8]]){const a=h.pt(S,(lat+(-MEDIAN/2))/2);arms.push({x:a.x,y:gy+10.8,z:a.z,ry:-th+Math.PI/2});const hd=h.pt(S,lat);heads.push({x:hd.x,y:gy+10.65,z:hd.z,ry:-th+Math.PI/2});sprites.push(new THREE.Vector3(hd.x,gy+10.4,hd.z));const r=h.pt(S,road,.04);pools.push({x:r.x,y:r.y,z:r.z,sx:20,sz:20});}
  stats.lights++;}
 if(poles.length){const steel=new THREE.MeshStandardMaterial({color:0x8d969b,metalness:.5,roughness:.45}),lampM=new THREE.MeshStandardMaterial({color:0xfff1d6,emissive:0xffd59a,emissiveIntensity:.3});
  instances(scene,new THREE.CylinderGeometry(.13,.2,11,low?6:10),steel,poles);instances(scene,new THREE.BoxGeometry(.1,.1,6.4),steel,arms);instances(scene,new THREE.BoxGeometry(1.1,.18,.45),lampM,heads);h.lamps.push(lampM);
  const glow=glowTexture(),pm=new THREE.MeshBasicMaterial({map:glow,color:0xffcf8f,transparent:true,opacity:0,blending:THREE.AdditiveBlending,depthWrite:false,polygonOffset:true,polygonOffsetFactor:-4,polygonOffsetUnits:-4});pm.userData.base=.22;
  instances(scene,new THREE.PlaneGeometry(1,1).rotateX(-Math.PI/2),pm,pools).renderOrder=2;h.roadGlow=[pm];
  if(!low){const sm=new THREE.SpriteMaterial({map:glow,color:0xffe1b0,blending:THREE.AdditiveBlending,depthWrite:false,transparent:true,opacity:0});sm.userData.base=.8;for(const p of sprites){const s=new THREE.Sprite(sm);s.position.copy(p);s.scale.setScalar(3.4);scene.add(s);}h.roadGlow.push(sm);}}
 return stats;
}
