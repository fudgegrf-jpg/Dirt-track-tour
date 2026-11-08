// Original instanced stadium hardware and pre-baked optical glow. No live lights.
import * as THREE from 'three';
import {glowTexture} from './gfx.js';
export function stadiumTowers(scene,poses,{height=32,name='stadium-v4'}={}){
 const g=new THREE.Group();g.name=name;scene.add(g);const n=poses.length,d=new THREE.Object3D(),q=new THREE.Object3D(),v=new THREE.Vector3();
 const metal=new THREE.MeshStandardMaterial({color:0x626977,roughness:.8,metalness:.4,emissive:0x151a26,emissiveIntensity:.35});
 const concrete=new THREE.MeshStandardMaterial({color:0x777a80,roughness:1});
 const bulb=new THREE.MeshBasicMaterial({color:new THREE.Color(5.5,4.8,3.7),fog:false,toneMapped:false,side:THREE.DoubleSide});
 const mast=new THREE.InstancedMesh(new THREE.CylinderGeometry(.27,.46,1,7),metal,n),feet=new THREE.InstancedMesh(new THREE.BoxGeometry(1.4,.35,1.4),concrete,n),frame=new THREE.InstancedMesh(new THREE.BoxGeometry(5.5,2.5,.22),metal,n),lamps=new THREE.InstancedMesh(new THREE.CircleGeometry(.38,8),bulb,n*12);
 for(const o of [mast,feet,frame,lamps]){o.castShadow=false;o.receiveShadow=false;g.add(o);}
 const glowMat=new THREE.MeshBasicMaterial({map:glowTexture(),color:0xffdeb0,transparent:true,opacity:.58,blending:THREE.AdditiveBlending,depthWrite:false,depthTest:true,fog:false,toneMapped:false});
 glowMat.onBeforeCompile=sh=>{sh.vertexShader=sh.vertexShader.replace('#include <project_vertex>',`vec4 mvPosition=modelViewMatrix*instanceMatrix*vec4(0.,0.,0.,1.);mvPosition.xy+=position.xy*vec2(length(instanceMatrix[0].xyz),length(instanceMatrix[1].xyz));gl_Position=projectionMatrix*mvPosition;`);};glowMat.customProgramCacheKey=()=> 'stadium-billboard-v4';
 const glows=new THREE.InstancedMesh(new THREE.PlaneGeometry(1,1),glowMat,n);glows.frustumCulled=false;glows.name='stadium-cheap-glow';g.add(glows);
 const roots=[];
 poses.forEach((p,i)=>{const H=p.height||height,root=p.y||0;roots.push({x:p.x,y:root,z:p.z,height:H});
  d.position.set(p.x,root+H/2,p.z);d.rotation.set(0,0,0);d.scale.set(1,H,1);d.updateMatrix();mast.setMatrixAt(i,d.matrix);
  d.position.y=root+.175;d.scale.set(1,1,1);d.updateMatrix();feet.setMatrixAt(i,d.matrix);
  q.position.set(p.x,root+H,p.z);q.lookAt(p.tx||0,root+2,p.tz||0);q.updateMatrix();frame.setMatrixAt(i,q.matrix);
  for(let a=0;a<4;a++)for(let b=0;b<3;b++){v.set((a-1.5)*1.28,(b-1)*.83,.28).applyMatrix4(q.matrix);d.position.copy(v);d.quaternion.copy(q.quaternion);d.scale.set(1,1,.45);d.updateMatrix();lamps.setMatrixAt(i*12+a*3+b,d.matrix);}
  d.position.set(p.x,root+H,p.z);d.rotation.set(0,0,0);d.scale.set(7.5,5.8,1);d.updateMatrix();glows.setMatrixAt(i,d.matrix);
 });
 for(const o of [mast,feet,frame,lamps])o.computeBoundingSphere();g.userData.stadium={towers:n,lamps:n*12,drawCalls:5,realLights:0,shadowLights:0,roots};return g;
}
export function studioStadium(scene){const poses=Array.from({length:12},(_,i)=>{const a=i/12*Math.PI*2;return{x:Math.cos(a)*100,y:0,z:Math.sin(a)*100,height:9.5+(i%3)*.6,tx:0,tz:0};});const g=stadiumTowers(scene,poses,{name:'menu-stadium-v4'});g.traverse(o=>{if(o.material)o.material.fog=false;});return g;}
