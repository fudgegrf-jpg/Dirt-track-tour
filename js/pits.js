import {groundObject,groundFoot} from './grounding.js';
import {pitLayout,createPitRoad} from './pit-road.js';
import {canvasTexture,enrichPaddock,pitchedRoof,beveledBox} from './details.js';
import * as THREE from 'three';
import {makeSemi} from './gfx.js';
import {createPitLot} from './pit-lot.js';
import {matteClay} from './clay-matte.js';
import {AI_DRIVERS} from './data.js';
import {polishPaddock,polishPitRoad} from './paddock-polish.js';
// One paddock generator, located from the actual backstretch of each oval.
export function createPitWorld(race){
 const {app,trk,T,scene}=race,st=app.state||app.profile||{};
 const {gate,origin,gateS}=pitLayout(trk),root=new THREE.Group();root.position.copy(origin);scene.add(root);
 const low=app.quality==='low', obstacles=[],bays=[];const mat=c=>new THREE.MeshStandardMaterial({color:c,roughness:.88});
 const steel=mat(0x48535b),black=mat(0x22272a),lime=mat(0xd2f77f);
 function box(x,y,z,w,h,d,m,solid=false){const o=new THREE.Mesh(new THREE.BoxGeometry(w,h,d),m);o.position.set(x,y,z);o.castShadow=!low;o.receiveShadow=true;root.add(o);if(Math.abs(y-h/2)<.011){groundObject(race.groundSupports,o,()=>0,{kind:'paddock ground support'});}if(solid)obstacles.push({x,z,w:w/2,d:d/2});return o;}
 const lot=createPitLot(race,root,origin);
 const road=createPitRoad(race,root,origin,matteClay({map:race.dirt.map,normalMap:race.dirt.normal,normalScale:new THREE.Vector2(.25,.25),roughnessMap:race.dirt.roughness,roughness:.96})),h=road.height;
 function sign(text,x,z,y=3,w=8){const c=document.createElement('canvas');c.width=512;c.height=128;const g=c.getContext('2d');g.fillStyle='#142027';g.fillRect(0,0,512,128);g.strokeStyle='#d2f77f';g.lineWidth=6;g.strokeRect(4,4,504,120);g.fillStyle='#e9f0ed';g.font='600 40px Arial';g.textAlign='center';g.fillText(text,256,80,480);const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;const m=new THREE.Mesh(new THREE.PlaneGeometry(w,w/4),new THREE.MeshBasicMaterial({map:t,side:THREE.FrontSide}));m.position.set(x,y,z);root.add(m);const back=new THREE.Mesh(m.geometry,m.material);back.rotation.y=Math.PI;m.add(back);
 const posts=[];for(const dx of[-w*.38,w*.38]){const post=new THREE.Mesh(new THREE.BoxGeometry(.10,y,.10),steel);post.position.set(dx,-y/2,-.08);m.add(post);posts.push(post);}
 m.userData.groundSign=()=>{for(const post of posts)groundFoot(race.groundSupports,post,(wx,wz)=>Math.abs(wx-origin.x)<=75&&wz>=-51&&wz<=41?0:(road.heightAt(wx,wz)??race.terrainHeight(wx,wz)),{kind:'pit sign post'});};
 return m;}
 const entrySign=sign('PITS / 25 MPH',gate.x-origin.x+7,gate.z-origin.z, h+3.7,10);entrySign.rotation.y=-gate.th+Math.PI/2;sign('PADDOCK / 25 MPH',52,-45,3.5,9);
 const semi=makeSemi({team:st.team||'Red Clay Racing',num:st.num||'42',color:st.color??0xf1f0e7,accent:st.accent??0x135bc4,cabColor:st.accent??0x135bc4,scheme:st.scheme,detail:app.quality});semi.rotation.y=Math.PI;semi.position.x=-17.8;root.add(semi);semi.userData.rampPivot.scale.x=4.6/semi.userData.rampLen;semi.userData.rampPivot.rotation.z=Math.asin(1.25/4.6);
 obstacles.push({x:-31,z:0,w:5,d:1.8});
 // Player's parking bay and centerline are paint, never light flares.
 lot.addBay(-17.8,0,true);
 sign('BAY '+(st.num||'42')+' / '+(st.driver||'Jayden Fudge').toUpperCase(),-9,-3,4.5,8);
 const marker=new THREE.Mesh(new THREE.ConeGeometry(.22,.6,3),new THREE.MeshBasicMaterial({color:0xd2f77f}));marker.rotation.z=Math.PI;marker.position.set(3,5,0);root.add(marker);
 // Night19: every AI team always has its own hauler (low quality uses the low-detail rig).
 // Loaders keep the gate shut until their car returns; parkers race with the ramp down.
 const count=AI_DRIVERS.length,rigs=[],LOADERS=new Set([1,4,5,6]);
 for(let i=0;i<count;i++){
  const row=i%2?1:-1,z=i>3?-32+(i-4)*10:row*(16+Math.floor(i/2)*9),x=i>3?36:-17.8;const d=AI_DRIVERS[i%AI_DRIVERS.length];
  const rig=makeSemi({team:d.name.split(' ')[1]+' Racing',num:d.num,color:d.color,accent:d.accent,cabColor:d.color,detail:low?'low':'medium'});rig.rotation.y=Math.PI;rig.position.set(x,0,z);root.add(rig);const role=LOADERS.has(i)?'loader':'parker';rig.userData.rampPivot.rotation.z=role==='parker'?Math.asin(1.25/rig.userData.rampLen):-Math.PI/2;obstacles.push({x:x+5,z,w:14,d:1.8});bays.push({x: x+10,z:z+5});lot.addBay(x,z);
  rigs.push({i,x,z,rear:x+17.8,rig,driverId:d.id,num:d.num,color:d.color,role,side:i>3?'right':z>0?'north':'south',rampRun:rig.userData.rampLen*Math.cos(Math.asin(1.25/rig.userData.rampLen))});
  const weave=canvasTexture('fabric',256),fabric=new THREE.MeshStandardMaterial({color:d.color,map:weave,bumpMap:weave,bumpScale:.025,roughness:.85});const canopy=new THREE.Mesh(pitchedRoof(11,5,.75),fabric);canopy.position.set(x-7,3.5,z+5);canopy.castShadow=!low;root.add(canopy);for(const dx of[-12,-2])for(const dz of[3,7])box(x+dx,1.7,z+dz,.07,3.4,.07,steel);
  box(x-6,.6,z+5,1.8,1.2,.8,fabric,true);box(x-10,.45,z+5,1.4,.9,1,black,true);
 }
 // Instanced spares and perimeter posts keep mobile draw calls down.
 const n=low?24:64,tires=new THREE.InstancedMesh(new THREE.TorusGeometry(.32,.115,low?6:10,low?16:28).rotateX(Math.PI/2),black,n),mx=new THREE.Matrix4();for(let i=0;i<n;i++){const b=bays[Math.floor(i/4)%bays.length];mx.makeTranslation(b.x-10,.115+(i%4)*.23,b.z+3);tires.setMatrixAt(i,mx);}root.add(tires);for(let i=0;i<n;i+=4)groundObject(race.groundSupports,tires,()=>0,{kind:'spare tire stack foot',instance:i});
 for(const z of[-44,40]){if(z===-44){box(-11.5,2,z,127,.06,.1,steel);box(73.5,2,z,3,.06,.1,steel);}else box(0,2,z,150,.06,.1,steel);for(let x=-72;x<=72;x+=8){if(z===-44&&x>52&&x<72)continue;box(x,1,z,.08,2,.08,steel);}}
 for(const [x,z]of[[-40,-30],[26,-26],[-35,27],[26,28]]){box(x,5,z,.18,10,.18,steel);box(x,10,z,2,.22,.65,new THREE.MeshStandardMaterial({color:0xe2ded1,emissive:0xffdfb0,emissiveIntensity:.6}));if((x>0)||!low){const light=new THREE.PointLight(0xffe9cf,95,65,1.5);light.position.set(x,9,z);root.add(light);}}
 // Low-poly crew silhouettes beside, never on, the ramp.
 for(const z of[-3.5,3.5]){const g=new THREE.Group(),body=new THREE.Mesh(new THREE.CapsuleGeometry(.22,.55,low?4:7,low?8:14),mat(0x135bc4));body.position.y=1.1;g.add(body);for(const a of[-.13,.13]){const leg=new THREE.Mesh(new THREE.BoxGeometry(.15,.8,.19),black);leg.position.set(a,.4,0);g.add(leg);}const head=new THREE.Mesh(new THREE.SphereGeometry(.18,low?12:20,low?8:12),mat(0xcb9874));head.position.y=1.7;g.add(head);g.position.set(5,0,z);root.add(g);}
 const strip=box(-8,4.1,0,14,.035,.10,new THREE.MeshStandardMaterial({color:0xcfe3ef,emissive:0xdfefff,emissiveIntensity:.5}));const l=new THREE.PointLight(0xdcecff,8,16,1.5);l.position.set(-7,3,0);root.add(l);
 const polish=polishPaddock(race,{root,lot,rigs,obstacles,low});polish.road=polishPitRoad(race,{root,road,origin,low});
 enrichPaddock(race,{root,bays,origin});lot.finish();
 for(const o of root.children)o.userData.groundSign?.();
 return {root,origin,gate,gateS,road,lot,semi,obstacles,bays,rigs,polish,marker,height:h};
}
