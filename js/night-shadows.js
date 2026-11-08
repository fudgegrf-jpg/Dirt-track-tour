// Original budgeted night-race shadows. One existing stadium key, never a light
// per tower. Camera-independent light-space texel snapping prevents swimming.
import * as THREE from 'three';
import {qualityPreset} from './quality.js';
export class NightShadows {
 constructor(race){
  this.race=race;this.key=race.key;this.focus=new THREE.Vector3();this.target=new THREE.Vector3();this.matrix=new THREE.Matrix4();this.local=new THREE.Matrix4();this.dummy=new THREE.Object3D();
  // A fixed dominant stadium bank: use the actual tower's ground-to-lamp ray.
  // Do not switch nearest towers mid-corner or rotate the shadow grid with camera.
  const roots=race.stadium?.userData.stadium?.roots||[],root=roots.reduce((best,p)=>!best||p.z>best.z?p:best,null);
  this.direction=new THREE.Vector3(root?.x||30,(root?.height||32)+(root?.y||0),root?.z||40).normalize();
  // Avoid an almost horizontal stadium ray on very large ovals.
  this.direction.y=Math.max(this.direction.y,.70);this.direction.normalize();
  this.right=new THREE.Vector3().crossVectors(new THREE.Vector3(0,1,0),this.direction).normalize();this.up=new THREE.Vector3().crossVectors(this.direction,this.right).normalize();
  this.parts=[[0,.49,0,4.65,.60,1.92],[-.25,1.00,0,1.95,.48,1.42],[-2.20,.98,0,.16,.43,2.04],...[...race.player.mesh.userData.wheelRest||[]].map(p=>[p.x,p.y,p.z,.58,.59,.28])];
  // One instanced depth-only draw for the whole field, instead of hundreds of
  // tread/panel/driver draws. Layer 30 is seen only by this shadow camera.
  this.proxy=new THREE.InstancedMesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshBasicMaterial({color:0xffffff}),race.cars.length*this.parts.length);
  this.proxy.name='night10-car-shadow-proxies';this.proxy.castShadow=true;this.proxy.layers.set(30);this.proxy.frustumCulled=false;this.proxy.instanceMatrix.setUsage(THREE.DynamicDrawUsage);race.scene.add(this.proxy);this.key.shadow.camera.layers.enable(30);
  for(const c of race.cars)c.mesh.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=false;}});
  // Existing static shadow casters (walls, haulers, scenery) stay intact.
  for(const o of race.stadium?.children||[])if(o.isInstancedMesh&&['CylinderGeometry','BoxGeometry'].includes(o.geometry.type)&&o.material?.type!=='MeshBasicMaterial')o.castShadow=true;
  this.key.name='night10-dominant-stadium-key';this.key.shadow.autoUpdate=false;this.key.shadow.intensity=.86;this.key.shadow.bias=-.000035;this.key.shadow.normalBias=.014;this.key.shadow.radius=1.6;
  this.configure();
 }
 configure(){
  const {race,key}=this,q=race.app.quality,enabled=q!=='low',half=q==='high'?38:32;
  this.enabled=enabled;this.half=half;key.castShadow=enabled;this.proxy.visible=enabled;
  const sh=key.shadow,size=Math.min(qualityPreset(q).shadow,race.app.isMobile?(q==='low'?512:1024):Infinity);if(sh.mapSize.x!==size){sh.map?.dispose();sh.map=null;sh.mapSize.set(size,size);}sh.camera.left=sh.camera.bottom=-half;sh.camera.right=sh.camera.top=half;sh.camera.near=1;sh.camera.far=180;sh.camera.updateProjectionMatrix();
  if(!enabled&&sh.map){sh.map.dispose();sh.map=null;}sh.needsUpdate=enabled;
  for(const c of race.cars){const a=c.contactShadow?.mesh.geometry.attributes.aOpacity;if(!a)continue;for(let i=0;i<a.count;i++)a.setX(i,i<9?(enabled?.19:.34):(enabled?.48:.58));a.needsUpdate=true;}
  race.scene.userData.night10Shadows={mode:enabled?'one soft-PCF stadium key + contact':'contact blobs only',shadowLights:enabled?1:0,halfExtentMeters:half,mapSize:enabled?sh.mapSize.x:0,carProxyInstances:this.proxy.count,towerRay:this.direction.toArray(),texelMeters:half*2/sh.mapSize.x,stabilized:true};
 }
 prepare(){
  const {race,key}=this;if((race.app.quality!=='low')!==this.enabled||this.quality!==race.app.quality){this.quality=race.app.quality;this.configure();}
  // Called immediately before rendering: map and light transform are always
  // updated together, never a moving light sampling yesterday's cached map.
  race.player.mesh.getWorldPosition(this.focus);const t=this.target,step=this.half*2/key.shadow.mapSize.x;
  const u=Math.round(this.focus.dot(this.right)/step)*step,v=Math.round(this.focus.dot(this.up)/step)*step,w=this.focus.dot(this.direction);
  t.copy(this.right).multiplyScalar(u).addScaledVector(this.up,v).addScaledVector(this.direction,w);key.target.position.copy(t);key.position.copy(t).addScaledVector(this.direction,90);key.target.updateMatrixWorld();key.updateMatrixWorld();
  if(!this.enabled)return;
  let at=0;for(const c of race.cars){c.mesh.updateWorldMatrix(true,false);for(const p of this.parts){this.dummy.position.set(p[0],p[1],p[2]);this.dummy.rotation.set(0,0,0);this.dummy.scale.set(p[3],p[4],p[5]);this.dummy.updateMatrix();this.matrix.multiplyMatrices(c.mesh.matrixWorld,this.dummy.matrix);this.proxy.setMatrixAt(at++,this.matrix);}}
  this.proxy.instanceMatrix.needsUpdate=true;key.shadow.needsUpdate=true;
 }
}
