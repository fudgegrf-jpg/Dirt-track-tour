import * as THREE from 'three';
import {instances,beveledBox} from './details.js';
// A handful of instanced draws adds small-scale depth rather than thousands of separate props.
export function polishInfield(race){const {trk,scene,app}=race,low=app.quality==='low',poses=[];let seed=2781;const rand=()=>((seed=Math.imul(seed,1664525)+1013904223|0)>>>0)/4294967296;
 // Streamed alpha-cutout 3D grass is provided by grass-3d.js.
 // Rubber seams and small amber studs on service-road approach surfaces are baked by materials.
 // Infield water tank / race-control barriers have real feet on the infield slab.
 const steel=new THREE.MeshStandardMaterial({color:0x909c9e,metalness:.55,roughness:.43}),tank=new THREE.Mesh(new THREE.CylinderGeometry(1.15,1.15,3,low?16:32),steel);tank.rotation.z=Math.PI/2;tank.position.set(-trk.L*.3,1.40,5);scene.add(tank);
 const supports=[];for(const dx of[-.9,.9])supports.push({x:-trk.L*.3+dx,y:.20,z:5});instances(scene,beveledBox(.15,.9,1.55,.03,2),steel,supports);
 const headColor=new THREE.MeshStandardMaterial({color:0xbb9476,roughness:.96});const bodies=scene.getObjectByName('grandstand-crowd');
 if(bodies&&bodies.count){headColor.onBeforeCompile=bodies.material.onBeforeCompile;const heads=new THREE.InstancedMesh(new THREE.SphereGeometry(.15,low?6:10,low?5:8),headColor,bodies.count),mat=new THREE.Matrix4();for(let i=0;i<bodies.count;i++){bodies.getMatrixAt(i,mat);mat.elements[13]+=.51;heads.setMatrixAt(i,mat);}bodies.parent.add(heads);}
}
