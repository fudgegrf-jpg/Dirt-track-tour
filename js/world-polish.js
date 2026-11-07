import * as THREE from 'three';
import {instances,beveledBox} from './details.js';
// A handful of instanced draws adds small-scale depth rather than thousands of separate props.
export function polishInfield(race){const {trk,scene,app}=race,low=app.quality==='low',poses=[];let seed=2781;const rand=()=>((seed=Math.imul(seed,1664525)+1013904223|0)>>>0)/4294967296;
 const verts=[];for(let i=0;i<3;i++){const a=i*Math.PI/3,c=Math.cos(a),s=Math.sin(a);verts.push(-.20*c,0,-.20*s,.20*c,0,.20*s,.04*c,.45,.04*s);}const geo=new THREE.BufferGeometry();geo.setAttribute('position',new THREE.Float32BufferAttribute(verts,3));geo.computeVertexNormals();
 for(let i=0;i<(low?420:1900);i++){const x=(rand()-.5)*(trk.L+trk.R*1.4),z=(rand()-.5)*trk.R*1.55,q=trk.project(x,z);if(q.d>trk.inner-5||Math.abs(z)<12)continue;const k=.5+rand();poses.push({x,z,y:-.25,sx:k,sy:k,sz:k,ry:rand()*6.28});}
 const grass=instances(scene,geo,new THREE.MeshStandardMaterial({color:0x667746,roughness:1,side:THREE.DoubleSide}),poses);for(let i=0;i<poses.length;i++)grass.setColorAt(i,new THREE.Color().setHSL(.21+rand()*.035,.23+rand()*.15,.48+rand()*.16));
 // Rubber seams and small amber studs on service-road approach surfaces are baked by materials.
 // Infield water tank / race-control barriers have real feet on the infield slab.
 const steel=new THREE.MeshStandardMaterial({color:0x909c9e,metalness:.55,roughness:.43}),tank=new THREE.Mesh(new THREE.CylinderGeometry(1.15,1.15,3,low?16:32),steel);tank.rotation.z=Math.PI/2;tank.position.set(-trk.L*.3,1.40,5);scene.add(tank);
 const supports=[];for(const dx of[-.9,.9])supports.push({x:-trk.L*.3+dx,y:.20,z:5});instances(scene,beveledBox(.15,.9,1.55,.03,2),steel,supports);
 const headColor=new THREE.MeshStandardMaterial({color:0xbb9476,roughness:.96});const bodies=scene.getObjectByName('grandstand-crowd');
 if(bodies&&bodies.count){headColor.onBeforeCompile=bodies.material.onBeforeCompile;const heads=new THREE.InstancedMesh(new THREE.SphereGeometry(.15,low?6:10,low?5:8),headColor,bodies.count),mat=new THREE.Matrix4();for(let i=0;i<bodies.count;i++){bodies.getMatrixAt(i,mat);mat.elements[13]+=.51;heads.setMatrixAt(i,mat);}bodies.parent.add(heads);}
}
