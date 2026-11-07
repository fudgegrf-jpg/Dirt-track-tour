import * as THREE from 'three';
import clay from './gfx2-assets-clay.js';
import grass from './gfx2-assets-grass.js';
import asphalt from './gfx2-assets-asphalt.js';
import concrete from './gfx2-assets-concrete.js';
import metal from './gfx2-assets-metal.js';
import wood from './gfx2-assets-wood.js';
// All JPEGs are local text-safe data URLs, not third-party runtime requests.
const sets={clay,grass,asphalt,concrete,metal,wood},images={},bases={};
export const materialDiagnostics=[];
await Promise.all(Object.entries(sets).flatMap(([kind,maps])=>Object.entries(maps).map(async([name,url])=>{
 const image=new Image();image.src=url;try{await image.decode();(images[kind]||={})[name]=image;}catch(e){materialDiagnostics.push(kind+'/'+name+': '+e.message);const c=document.createElement('canvas');c.width=c.height=8;const g=c.getContext('2d');g.fillStyle=name==='normalMap'?'#8080ff':name==='roughnessMap'?'#dddddd':'#777466';g.fillRect(0,0,8,8);(images[kind]||={})[name]=c;}
})));
export function scanImage(kind){return images[kind].map;}
export function pbrMaps(kind,repeat=[1,1]){if(!bases[kind]){bases[kind]={};for(const[name,image]of Object.entries(images[kind])){const t=new THREE.Texture(image);t.wrapS=t.wrapT=THREE.RepeatWrapping;t.anisotropy=8;t.colorSpace=name==='map'?THREE.SRGBColorSpace:THREE.NoColorSpace;t.needsUpdate=true;t.userData.gfx2Kind=kind;bases[kind][name]=t;}}
 const result={};for(const[name,t]of Object.entries(bases[kind])){const clone=t.clone();clone.repeat.set(...repeat);result[name]=clone;}return result;}
export function scanClay(rgb){const p=pbrMaps('clay'),size=512,c=document.createElement('canvas');c.width=c.height=size;const g=c.getContext('2d');g.drawImage(scanImage('clay'),0,0,size,size);const d=g.getImageData(0,0,size,size);for(let i=0;i<d.data.length;i+=4){const f=Math.min(1.55,Math.max(.4,(d.data[i]*.3+d.data[i+1]*.59+d.data[i+2]*.11)/132));for(let k=0;k<3;k++)d.data[i+k]=Math.min(255,rgb[k]*255*f);}g.putImageData(d,0,0);p.map.dispose();p.map=new THREE.CanvasTexture(c);p.map.colorSpace=THREE.SRGBColorSpace;p.map.wrapS=p.map.wrapT=THREE.RepeatWrapping;p.map.anisotropy=8;p.map.userData.gfx2Kind='clay';return{map:p.map,bump:p.roughnessMap,normal:p.normalMap,roughness:p.roughnessMap};}
export function pbrMaterial(kind,options={},repeat=[1,1]){const m=new THREE.MeshStandardMaterial({...pbrMaps(kind,repeat),roughness:kind==='wood'?.65:kind==='metal'?.55:.94,metalness:kind==='metal'?.65:0,...options});m.normalScale.setScalar(kind==='grass'?.3:.35);return m;}
export function upgradeScanMaterials(scene){const done=new Set();scene.traverse(o=>{for(const m of Array.isArray(o.material)?o.material:[o.material]){if(!m||done.has(m)||!m.isMeshStandardMaterial)continue;done.add(m);const kind=m.map?.userData?.gfx2Kind;if(!kind||m.normalMap)continue;const p=pbrMaps(kind),factor=m.map.userData.gfx2Repeat||1;p.map.dispose();p.normalMap.repeat.copy(m.map.repeat).multiplyScalar(factor);p.roughnessMap.repeat.copy(p.normalMap.repeat);m.normalMap=p.normalMap;m.roughnessMap=p.roughnessMap;m.normalScale.setScalar(kind==='grass'?.3:kind==='asphalt'?.22:.3);m.needsUpdate=true;}});}
