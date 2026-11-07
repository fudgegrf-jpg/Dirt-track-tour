import * as THREE from 'three';
import {pbrMaps} from './gfx2-materials.js';
import {groundObject} from './grounding.js';
// One level datum, shared by the old paddock physics and every hauler/prop foot.
export function createPitLot(race,root,origin){
 const low=race.app.quality==='low',maps=pbrMaps('asphalt',[30,18.4]),material=new THREE.MeshPhysicalMaterial({...maps,color:0xc3c5c5,roughness:1,metalness:0,specularIntensity:0,envMapIntensity:0});material.normalScale.setScalar(.14);
 material.onBeforeCompile=s=>s.fragmentShader=s.fragmentShader.replace('#include <map_fragment>','#include <map_fragment>\nfloat lotGray=dot(diffuseColor.rgb,vec3(0.2126,0.7152,0.0722));diffuseColor.rgb=vec3(0.98,0.99,1.0)*mix(0.075,0.18,clamp(lotGray*2.0,0.0,1.0));').replace('#include <roughnessmap_fragment>','#include <roughnessmap_fragment>\nroughnessFactor=clamp(0.92+roughnessFactor*0.07,0.92,0.99);');material.customProgramCacheKey=()=> 'pit-asphalt-v1';
 const surface=new THREE.Mesh(new THREE.PlaneGeometry(150,92),material);surface.name='asphalt-paddock-surface';surface.rotation.x=-Math.PI/2;surface.position.set(0,0,-5);surface.receiveShadow=true;root.add(surface);
 const canvas=document.createElement('canvas');canvas.width=low?1024:2048;canvas.height=low?640:1280;const g=canvas.getContext('2d');g.setTransform(canvas.width/150,0,0,canvas.height/92,canvas.width/2,51*canvas.height/92);
 function line(points,color,width=.14,dash=[]){g.strokeStyle=color;g.lineWidth=width;g.setLineDash(dash);g.beginPath();points.forEach(([x,z],i)=>i?g.lineTo(x,z):g.moveTo(x,z));g.stroke();g.setLineDash([]);}
 // Baked paint/joints/stains add one coplanar, polygon-offset draw, not raised strips.
 for(let x=-60;x<75;x+=30)line([[x,-51],[x,41]],'rgba(12,15,17,.23)',.08);
 for(let z=-26;z<41;z+=28)line([[-75,z],[75,z]],'rgba(12,15,17,.20)',.07);
 const slots=[];let seed=142;const rand=()=>((seed=Math.imul(seed,1664525)+1013904223|0)>>>0)/4294967296;
 function addBay(x,z,player=false){const a=x-6.2,b=x+24.8;slots.push({x,z,player,from:a,to:b});for(const dz of[-2.35,2.35])line([[a,z+dz],[b,z+dz]],'rgba(234,231,213,.93)',.17);line([[a,z-2.35],[a,z+2.35]],'rgba(229,184,72,.96)',.22);line([[b,z-2.35],[b,z+2.35]],'rgba(229,184,72,.85)',.14,[.8,.5]);
  for(let k=0;k<4;k++){const sx=x-1+rand()*6,sz=z+(rand()-.5)*1.5;g.fillStyle=`rgba(35,29,24,${.08+rand()*.12})`;g.beginPath();g.ellipse(sx,sz,.3+rand()*.9,.2+rand()*.35,rand()*3,0,Math.PI*2);g.fill();}
  if(player){for(const dz of[-1.14,1.14])line([[4,z+dz],[17,z+dz]],'rgba(236,190,74,.93)',.12,[1.4,.7]);g.save();g.translate(10,z-4.8);g.rotate(Math.PI/2);g.fillStyle='rgba(226,225,211,.8)';g.font='bold 2.2px Arial';g.textAlign='center';g.fillText('BAY '+(race.app.state?.num||'42'),0,0);g.restore();}
 }
 for(const d of[-.8,.8]){g.strokeStyle='rgba(33,30,27,.12)';g.lineWidth=.24;g.beginPath();g.moveTo(63+d,-49);g.bezierCurveTo(63+d,-20,49+d,2,15+d,0);g.stroke();g.strokeStyle='rgba(37,32,28,.07)';g.lineWidth=.12;g.beginPath();g.moveTo(66+d,-48);g.bezierCurveTo(64+d,-18,42+d,8,10+d,7);g.stroke();}
 for(const [x,z]of[[12,8],[-38,12],[27,-14],[42,28]])for(let k=0;k<4;k++){g.fillStyle='rgba(30,26,23,.11)';g.beginPath();g.ellipse(x+(rand()-.5)*.7,z+(rand()-.5)*.4,.35+rand()*.65,.15+rand()*.25,rand()*3,0,Math.PI*2);g.fill();}
 const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;texture.anisotropy=8;const decals=new THREE.Mesh(surface.geometry,new THREE.MeshStandardMaterial({map:texture,transparent:true,depthWrite:false,roughness:1,metalness:0,polygonOffset:true,polygonOffsetFactor:-2,polygonOffsetUnits:-2}));decals.name='paddock-paint-joints-stains';decals.rotation.copy(surface.rotation);decals.position.copy(surface.position);decals.receiveShadow=true;decals.renderOrder=1;root.add(decals);
 // Graded perimeter apron reaches the existing -0.3 m terrain. The road owns the north-east opening.
 const P=[],U=[];function quad(a,b,c,d){for(const p of[a,b,c,a,c,d]){P.push(...p);U.push((p[0]+75)/5,(41-p[2])/5);}}
 quad([-75,0,-51],[44,0,-51],[44,-.3,-54],[-78,-.3,-54]);
 quad([-75,0,41],[-75,0,-51],[-78,-.3,-54],[-78,-.3,44]);
 quad([75,0,41],[-75,0,41],[-78,-.3,44],[78,-.3,44]);
 quad([75,0,-51],[75,0,41],[78,-.3,44],[78,-.3,-51]);
 const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(P,3));geo.setAttribute('uv',new THREE.Float32BufferAttribute(U,2));geo.computeVertexNormals();const apronMaterial=material.clone();for(const name of['map','normalMap','roughnessMap']){apronMaterial[name]=material[name].clone();apronMaterial[name].repeat.set(1,1);}apronMaterial.onBeforeCompile=material.onBeforeCompile;apronMaterial.customProgramCacheKey=material.customProgramCacheKey;const apron=new THREE.Mesh(geo,apronMaterial);apron.name='graded-asphalt-perimeter';apron.receiveShadow=true;root.add(apron);
 const curbPos=[];function curbSegment(x,z,w,d){curbPos.push({x,z,w,d});}
 curbSegment(-74.7,-5,.4,91.2);curbSegment(74.7,-5,.4,91.2);curbSegment(0,40.7,149,.4);curbSegment(-11.5,-50.7,126,.4); // entrance remains open x52..75
 const curb=new THREE.InstancedMesh(new THREE.BoxGeometry(1,.15,1),material,curbPos.length),matrix=new THREE.Matrix4(),q=new THREE.Quaternion();curb.name='paddock-edge-curbs';root.add(curb);for(let i=0;i<curbPos.length;i++){const p=curbPos[i];matrix.compose(new THREE.Vector3(p.x,.075,p.z),q,new THREE.Vector3(p.w,1,p.d));curb.setMatrixAt(i,matrix);groundObject(race.groundSupports,curb,()=>0,{kind:'paddock curb foot',instance:i});}curb.receiveShadow=true;
 function heightAt(wx,wz){const x=wx-origin.x,z=wz-origin.z,dx=Math.max(0,Math.abs(x)-75),dz=Math.max(0,-51-z,z-41),d=Math.max(dx,dz);if(d>3)return null;if(z< -51&&x>=44)return null;return-.3*d/3;}
 return{surface,decals,apron,curb,slots,addBay,heightAt,finish(){texture.needsUpdate=true;},datum:0,entry:{minX:52,maxX:75,z:-51},tileMeters:5};
}
