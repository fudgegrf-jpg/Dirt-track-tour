// Original low-cost Salina service lane: existing asphalt scan, drive-over
// edging and instanced lamps. No extra real lights/shadow maps; one tiny procedural halo texture.
import * as THREE from 'three';
import {pbrMaps} from './gfx2-materials.js';
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
export function salinaRoadMaterial(){
 const material=new THREE.MeshPhysicalMaterial({...pbrMaps('asphalt',[1,1]),color:0xffffff,roughness:.99,metalness:0,specularIntensity:0,envMapIntensity:0,vertexColors:true});material.normalScale.setScalar(.1);
 const uniforms=material.userData.pitPools={pitLampFirst:{value:0},pitLampLast:{value:0}};
 material.onBeforeCompile=s=>{Object.assign(s.uniforms,uniforms);s.fragmentShader=s.fragmentShader.replace('#include <common>',`#include <common>
uniform float pitLampFirst;uniform float pitLampLast;
float pitPool(vec2 uv){float station=uv.y*7.0;float along=mod(station-pitLampFirst+12.0,24.0)-12.0;float lat=uv.x*7.0;float wide=exp(-pow((lat-1.7)/3.7,2.0))+exp(-pow((lat+1.7)/3.7,2.0));return exp(-pow(along/6.8,2.0))*wide*.58*smoothstep(pitLampFirst-9.0,pitLampFirst,station)*(1.0-smoothstep(pitLampLast,pitLampLast+9.0,station));}
`).replace('#include <map_fragment>',`#include <map_fragment>
float pitGray=dot(diffuseColor.rgb,vec3(.2126,.7152,.0722));float wear=1.0-.12*exp(-pow((abs(vMapUv.x*7.0)-.86)/.24,2.0))*(.8+.2*sin(vMapUv.y*2.0));diffuseColor.rgb=vec3(.98,.99,1.0)*mix(.065,.16,clamp(pitGray*2.0,0.0,1.0))*wear;
`).replace('#include <emissivemap_fragment>',`#include <emissivemap_fragment>
totalEmissiveRadiance+=vec3(.125,.096,.058)*pitPool(vMapUv);
`);};material.customProgramCacheKey=()=> 'salina-asphalt-pools-v1';return material;
}
function merged(geometries){const p=[],n=[];for(const g of geometries){const q=g.index?g.toNonIndexed():g;p.push(...q.attributes.position.array);n.push(...q.attributes.normal.array);if(q!==g)q.dispose();g.dispose();}const out=new THREE.BufferGeometry();out.setAttribute('position',new THREE.Float32BufferAttribute(p,3));out.setAttribute('normal',new THREE.Float32BufferAttribute(n,3));return out;}
export function salinaPitRoadArt({race,root,origin,samples,length,gateStation,heightAt,mesh,barriers}){
 const trk=race.trk,triangles=[],curbP=[],curbC=[],up=new THREE.Vector3(0,1,0),M=new THREE.Matrix4(),one=new THREE.Vector3(1,1,1),stations=[];
 const tangent=i=>{const a=samples[Math.max(0,i-1)],b=samples[Math.min(samples.length-1,i+1)];return new THREE.Vector3(b.x-a.x,0,b.z-a.z).normalize();};
 const stationStart=gateStation+16,stationEnd=length-5;
 function vertex(i,side,lat,raise){const p=samples[i],d=tangent(i),x=p.x-d.z*side*lat,z=p.z+d.x*side*lat,y=heightAt(x,z);if(y===null||z>origin.z-52||trk.project(x,z).d<trk.outer+1)return null;const station=i*length/260,fade=smooth((station-stationStart)/8)*smooth((stationEnd-station)/8);return{x,y:y+raise*fade,z};}
 function tri(a,b,c,tone){if((b.z-a.z)*(c.x-a.x)-(b.x-a.x)*(c.z-a.z)<0)[b,c]=[c,b];triangles.push([a,b,c]);for(const p of[a,b,c]){curbP.push(p.x-origin.x,p.y,p.z-origin.z);curbC.push(tone,tone*.98,tone*.91);}}
 for(const side of[-1,1])for(let i=1;i<samples.length-2;i++){if(i*length/260<stationStart)continue;const shape=[[2.94,0],[3.08,.075],[3.37,.075],[3.51,0]],a=shape.map(([lat,h])=>vertex(i,side,lat,h)),b=shape.map(([lat,h])=>vertex(i+1,side,lat,h));if(a.some(p=>!p)||b.some(p=>!p))continue;for(let j=0;j<3;j++){const tone=j===1?(i%8===0?.42:.65):.47;tri(a[j],a[j+1],b[j],tone);tri(b[j],a[j+1],b[j+1],tone);}}
 const curbGeo=new THREE.BufferGeometry();curbGeo.setAttribute('position',new THREE.Float32BufferAttribute(curbP,3));curbGeo.setAttribute('color',new THREE.Float32BufferAttribute(curbC,3));curbGeo.computeVertexNormals();const curbs=new THREE.Mesh(curbGeo,new THREE.MeshStandardMaterial({vertexColors:true,roughness:1,metalness:0,emissive:0x080704}));curbs.name='salina-pit-road-beveled-curbs';curbs.receiveShadow=true;root.add(curbs);
 const first=Math.ceil((gateStation+24)/24)*24;
 for(let at=first;at<length-18;at+=24){const f=at/length*260,i=Math.floor(f),u=f-i,a=samples[i],b=samples[i+1],d=tangent(i),center={x:THREE.MathUtils.lerp(a.x,b.x,u),z:THREE.MathUtils.lerp(a.z,b.z,u)};if(center.z>origin.z-57||trk.project(center.x,center.z).d<trk.outer+8)continue;const pair=[];
  for(const side of[-1,1]){const x=center.x-d.z*side*5.4,z=center.z+d.x*side*5.4,y=heightAt(x,z);if(y===null)continue;pair.push({x,y,z,side,d});}
  if(pair.length===2)stations.push({station:at,pair});
 }
 const count=stations.length*2,shaftGeo=merged([new THREE.BoxGeometry(.12,6.2,.12).translate(0,3.1,0),new THREE.BoxGeometry(.5,.16,.5).translate(0,.08,0),new THREE.BoxGeometry(1.45,.10,.10).translate(.68,6.1,0)]);
 const hardware=new THREE.InstancedMesh(shaftGeo,new THREE.MeshStandardMaterial({color:0x747b80,roughness:.8,metalness:.2,emissive:0x080807}),count),heads=new THREE.InstancedMesh(new THREE.BoxGeometry(.68,.12,.32).translate(1.24,6.04,0),new THREE.MeshBasicMaterial({color:0xffe2ad,toneMapped:false}),count);
 hardware.name='salina-pit-road-instanced-poles';heads.name='salina-pit-road-emissive-lamps';root.add(hardware,heads);
 // Crossed, depth-tested translucent halos remain visible without per-frame
 // camera alignment, extra light nodes, or a separate postprocess.
 const canvas=document.createElement('canvas');canvas.width=canvas.height=32;const g=canvas.getContext('2d'),grad=g.createRadialGradient(16,16,0,16,16,16);grad.addColorStop(0,'rgba(255,232,185,.7)');grad.addColorStop(.18,'rgba(255,210,140,.2)');grad.addColorStop(1,'rgba(255,190,110,0)');g.fillStyle=grad;g.fillRect(0,0,32,32);const tex=new THREE.CanvasTexture(canvas),haloGeo=merged([new THREE.PlaneGeometry(1.8,1.8).translate(1.24,6.04,0),new THREE.PlaneGeometry(1.8,1.8).rotateY(Math.PI/2).translate(1.24,6.04,0)]),halos=new THREE.InstancedMesh(haloGeo,new THREE.MeshBasicMaterial({map:tex,transparent:true,opacity:.32,depthWrite:false,side:THREE.DoubleSide,blending:THREE.AdditiveBlending,toneMapped:false}),count);
 // merged() deliberately preserves only position/normal; both crossed planes
 // share the same simple 0..1 UV layout.
 const uv=[];for(let k=0;k<2;k++)uv.push(0,1,0,0,1,1,0,0,1,0,1,1);haloGeo.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));halos.name='salina-pit-road-lamp-halos';root.add(halos);
 let index=0;for(const row of stations)for(const p of row.pair){const inward=new THREE.Vector3(p.d.z*p.side,0,-p.d.x*p.side),q=new THREE.Quaternion().setFromAxisAngle(up,-Math.atan2(inward.z,inward.x));M.compose(new THREE.Vector3(p.x-origin.x,p.y,p.z-origin.z),q,one);hardware.setMatrixAt(index,M);heads.setMatrixAt(index,M);halos.setMatrixAt(index++,M);barriers.push({x:p.x-origin.x,z:p.z-origin.z,r:.24,pole:true});}
 const pools=mesh.material.userData.pitPools;if(stations.length){pools.pitLampFirst.value=stations[0].station;pools.pitLampLast.value=stations.at(-1).station;}
 return{triangles,curbs,hardware,heads,halos,lightCount:0,poleCount:count,stations:stations.map(r=>r.station),curbHeight:.075,curbDriveOver:true,draws:4};
}
