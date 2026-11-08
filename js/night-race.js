import {NightShadows} from './night-shadows.js';
import {DustyAir} from './dusty-air.js';
// Original night-show art direction. No reference photographs or licensed game art.
import * as THREE from 'three';
const CLOD_BUDGET={low:32,medium:72,high:120};
function mergeGeometries(geos){
 const out=new THREE.BufferGeometry();
 for(const name of Object.keys(geos[0].attributes)){
  const first=geos[0].attributes[name];
  if(geos.some(g=>!g.attributes[name]||g.attributes[name].itemSize!==first.itemSize||g.attributes[name].normalized!==first.normalized))return null;
  const size=geos.reduce((n,g)=>n+g.attributes[name].array.length,0),data=new first.array.constructor(size);let at=0;
  for(const g of geos){data.set(g.attributes[name].array,at);at+=g.attributes[name].array.length;}
  out.setAttribute(name,new THREE.BufferAttribute(data,first.itemSize,first.normalized));
 }
 return out;
}

// One material pass: no transparent, depth-tested duplicate body panels. Shared
// uniform is changed at the existing 2 Hz look cadence, never rebuilt per frame.
export function installNightMud(materials){
 const mud={value:0};
 for(const m of new Set(materials)){
  const old=m.onBeforeCompile;
  m.onBeforeCompile=function(s,r){old?.call(this,s,r);s.uniforms.uNightMud=mud;
   s.vertexShader='varying vec3 vNightBody;varying vec3 vNightBodyN;\n'+s.vertexShader;
   s.vertexShader=s.vertexShader.replace('#include <begin_vertex>','#include <begin_vertex>\nvNightBody=position;vNightBodyN=normal;');
   s.fragmentShader='varying vec3 vNightBody;varying vec3 vNightBodyN;uniform float uNightMud;\n'+s.fragmentShader;
   s.fragmentShader=s.fragmentShader.replace('#include <color_fragment>',`#include <color_fragment>
    if(uNightMud>.0001){
    // Dominant-plane projection avoids stripes/stretching on the hood/nose.
    // Independently jittered centimeter-scale chips plus a low dusty haze.
    vec3 an=abs(normalize(vNightBodyN));
    vec2 plane=an.y>max(an.x,an.z)?vNightBody.xz:(an.x>an.z?vNightBody.zy:vNightBody.xy);
    vec2 cells=plane*42.0,cell=floor(cells);
    float grain=fract(sin(dot(cell,vec2(127.1,311.7)))*43758.5453);
    vec2 center=vec2(fract(grain*13.1),fract(grain*31.7));
    float splash=(1.0-smoothstep(.12,.4,length((fract(cells)-center)*vec2(.85,1.2))))*step(.3,grain);
    float lower=1.0-smoothstep(.22,1.35,vNightBody.y);
    float clayMask=uNightMud*clamp(lower*.38+splash*.75,.0,.85);
    diffuseColor.rgb=mix(diffuseColor.rgb,vec3(.205,.119,.065),clayMask);}`);
  };
  m.customProgramCacheKey=()=> 'night-mud-2';m.needsUpdate=true;
 }
 return mud;
}

function staticMaterialKey(m){
 if(m.onBeforeCompile!==THREE.Material.prototype.onBeforeCompile)return m.uuid;
 const props=[];
 for(const key of Object.keys(m).sort()){
  if(['uuid','name','version','userData','_listeners'].includes(key))continue;
  const v=m[key];if(typeof v==='function')continue;
  props.push([key,v?.isTexture?v.uuid:v?.isColor?v.getHex():v?.toArray?v.toArray():v]);
 }
 return JSON.stringify(props);
}

// Bake *only* explicitly static groups, preserving material state, shadow
// flags and all vertex attributes. Cars, gates, pit rigs, flags and scoreboard
// mechanisms are deliberately outside this list. Never batch dynamic objects.
export function batchNightStatic(group,recursive=false){
 group.updateWorldMatrix(true,true);const inv=group.matrixWorld.clone().invert(),bins=new Map();
 const visit=o=>{if(!o.isMesh||o.isInstancedMesh||Array.isArray(o.material)||!o.visible||o.matrixWorld.determinant()<0)return;
  const key=staticMaterialKey(o.material)+'|'+o.castShadow+'|'+o.receiveShadow+'|'+Object.keys(o.geometry.attributes).sort().join(',');
  if(!bins.has(key))bins.set(key,[]);bins.get(key).push(o);};
 if(recursive)group.traverse(visit);else group.children.slice().forEach(visit);
 let before=0,after=0;
 for(const objects of bins.values()){
  before+=objects.length;if(objects.length<2){after+=objects.length;continue;}
  const geos=objects.map(o=>{const geo=o.geometry.index?o.geometry.toNonIndexed():o.geometry.clone();geo.applyMatrix4(new THREE.Matrix4().multiplyMatrices(inv,o.matrixWorld));return geo;});
  const merged=mergeGeometries(geos,false);geos.forEach(g=>g.dispose());
  if(!merged){after+=objects.length;continue;}
  const m=new THREE.Mesh(merged,objects[0].material);m.castShadow=objects[0].castShadow;m.receiveShadow=objects[0].receiveShadow;m.name='night-static-batch';
  merged.computeBoundingSphere();for(const o of objects){o.visible=false;o.userData.nightSupportOnly=true;}group.add(m);after++;
 }
 group.userData.nightBatch={before,after};return group.userData.nightBatch;
}

export function nightRaceArt(race){
 const stats=[],unbudgetedLights=[];
 race.scene.traverse(o=>{if(o.isPointLight)unbudgetedLights.push(o);});
 // Pit-lot lamps stay emissive. Their five off-screen point lights otherwise
 // execute in every clay/car fragment; the warm stadium key also lights the lot.
 for(const light of unbudgetedLights)light.removeFromParent();
 for(const name of ['grounded-grandstands','grounded-infield-equipment']){const group=race.scene.getObjectByName(name);if(group)stats.push({name,...batchNightStatic(group)});}
 // The warm key is a budgeted stadium-light approximation, not the sun. A single
 // shadow map is recentered only on refresh, with no shadowed light per tower.
 race.key.shadow.autoUpdate=false;race.key.shadow.needsUpdate=true;race.shadowT=0;
 const ground=race.scene.children.find(o=>o.geometry?.type==='PlaneGeometry'&&o.geometry.parameters.width===3000);
 if(ground?.material)ground.material.color.set(0x68735a);
 race.scene.userData.nightOnly=true;
 const shadows=new NightShadows(race),refreshShadow=()=>{};
 return {atmosphere:new DustyAir(race),version:2,shadows,refreshShadow,pointLightsRemoved:unbudgetedLights.length,particles:new NightRoost(race),staticBatches:stats,lighting:'vertex stadium pools + one budgeted warm shadow key',clay:'matte',mudPasses:0};
}

// Fixed-capacity opaque clods: one instanced draw, no allocations/emitters added
// on contact. Short ballistic life returns them below the dirt before recycling.
export class NightRoost {
 constructor(race){this.race=race;this.capacity=CLOD_BUDGET[race.app.quality]||72;this.budget=this.capacity;this.next=0;this.seed=0x4e494748;this.credit=0;this.life=new Float32Array(this.capacity);this.xyz=new Float32Array(this.capacity*3);this.vel=new Float32Array(this.capacity*3);this.floor=new Float32Array(this.capacity);this.scale=new Float32Array(this.capacity);this.dummy=new THREE.Object3D();
  this.mesh=new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1,0),new THREE.MeshStandardMaterial({color:0x785137,roughness:1,metalness:0}),this.capacity);this.mesh.name='night-roost-clods';this.mesh.frustumCulled=false;this.mesh.instanceMatrix.setUsage(THREE.DynamicDrawUsage);this.dummy.scale.setScalar(0);this.dummy.updateMatrix();for(let i=0;i<this.capacity;i++)this.mesh.setMatrixAt(i,this.dummy.matrix);race.scene.add(this.mesh);
 }
 random(){let s=this.seed;s^=s<<13;s^=s>>>17;s^=s<<5;this.seed=s>>>0;return this.seed/4294967296;}
 emit(c){const i=this.next++%this.budget,j=i*3,a=c.th,side=(this.random()-.5)*1.7,back=1.7,base=this.race.trk.height(c.s,c.d);this.life[i]=.4+this.random()*.35;this.floor[i]=base+.015;this.scale[i]=.025+this.random()*.035;this.xyz[j]=c.x-Math.cos(a)*back-Math.sin(a)*side;this.xyz[j+1]=base+.15;this.xyz[j+2]=c.z-Math.sin(a)*back+Math.cos(a)*side;const v=-Math.min(7,Math.abs(c.speed)*.2);this.vel[j]=Math.cos(a)*v+(this.random()-.5)*2;this.vel[j+1]=1+this.random()*2;this.vel[j+2]=Math.sin(a)*v+(this.random()-.5)*2;}
 update(dt){if(dt<=0)return;dt=Math.min(dt,.05);const budget=Math.min(this.capacity,CLOD_BUDGET[this.race.app.quality]||72);if(budget!==this.budget){this.budget=budget;this.life.fill(0,budget);this.mesh.count=budget;}const cars=this.race.cars||[],cap=this.budget/120;for(const c of cars){if(c.dnf||c.speed<8||c.inPits||c.zone==='grass'||c.d>this.race.trk.outer||c.d< -this.race.trk.W/2-.5)continue;const slip=Math.max(Math.abs(c.slipR||0),Math.abs(c.slipF||0)),loose=c.zone==='cushion'?1.5:.3;this.credit+=dt*(slip*8+loose*3)*cap;while(this.credit>=1){this.emit(c);this.credit--;}}
  let alive=0;for(let i=0;i<this.budget;i++){const j=i*3,d=this.dummy;this.life[i]-=dt;if(this.life[i]>0){this.vel[j+1]-=9.8*dt;for(let k=0;k<3;k++)this.xyz[j+k]+=this.vel[j+k]*dt;if(this.xyz[j+1]<this.floor[i])this.life[i]=0;}
   if(this.life[i]>0){alive++;d.position.fromArray(this.xyz,j);d.scale.setScalar(this.scale[i]*Math.min(1,this.life[i]*12));d.rotation.set(i*.83+this.life[i]*6,i*.39,0);}else{d.position.set(0,-100,0);d.scale.setScalar(0);}d.updateMatrix();this.mesh.setMatrixAt(i,d.matrix);}
  this.mesh.instanceMatrix.needsUpdate=true;this.alive=alive;
 }
}
