import * as THREE from 'three';
// Conforming ground decals, NOT a light/sprite: depth-tested, normal blending,
// always sampled onto the same physical surface as the tires.
export class ContactShadow {
  constructor(scene, model, truck=false) {
    this.model=model;this.parents=truck?[...new Set((model.userData.wheels||[]).map(w=>w.parent))]:[];
    this.patches=truck ? [[-7,0,23,3,.17],...(model.userData.wheels||[]).map(w=>[0,0,1.1,.75,.46,w])]
      : [[0,0,5.1,2.05,.19],...(model.userData.wheelRest||[]).map(p=>[p.x,p.z,.65,.48,.54])];
    const pos=[],uv=[],op=[],idx=[];
    this.patches.forEach((p,k)=>{for(let i=0;i<3;i++)for(let j=0;j<3;j++){pos.push(0,0,0);uv.push(i/2,j/2);op.push(p[4]);}for(let i=0;i<2;i++)for(let j=0;j<2;j++){const a=k*9+i*3+j;idx.push(a,a+1,a+3,a+3,a+1,a+4);}});
    const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(pos,3));g.setAttribute('uv',new THREE.Float32BufferAttribute(uv,2));g.setAttribute('aOpacity',new THREE.Float32BufferAttribute(op,1));g.setIndex(idx);
    const m=new THREE.ShaderMaterial({transparent:true,depthTest:true,depthWrite:false,side:THREE.DoubleSide,polygonOffset:true,polygonOffsetFactor:-1,polygonOffsetUnits:-1,
      vertexShader:'attribute float aOpacity; varying vec2 vUv; varying float vOpacity; void main(){vUv=uv;vOpacity=aOpacity;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.);}',
      fragmentShader:'varying vec2 vUv; varying float vOpacity; void main(){float r=length((vUv-.5)*2.);float a=(1.-smoothstep(.12,1.,r))*vOpacity; if(a<.003)discard;gl_FragColor=vec4(.035,.026,.018,a); #include <colorspace_fragment> }'.replace(' #include','\n#include').replace('> }','>\n}')});
    this.mesh=new THREE.Mesh(g,m);this.mesh.frustumCulled=false;this.mesh.renderOrder=1;scene.add(this.mesh);this.v=new THREE.Vector3();
  }
  update(height) {
    const model=this.model;model.updateWorldMatrix(true,false);for(const parent of this.parents)parent.updateWorldMatrix(true,false);const a=this.mesh.geometry.attributes.position;
    let k=0;for(const p of this.patches)for(let i=0;i<3;i++)for(let j=0;j<3;j++){
      const wheel=p[5],parent=wheel?.parent;
      this.v.set((wheel?.position.x ?? p[0])+(i/2-.5)*p[2],0,(wheel?.position.z ?? p[1])+(j/2-.5)*p[3]).applyMatrix4(parent?parent.matrixWorld:model.matrixWorld);
      a.setXYZ(k++,this.v.x,height(this.v.x,this.v.z)+.006,this.v.z);
    }
    a.needsUpdate=true;
  }
}
// Actual tire radii are the wheel groups' rest y values. Sample the road under
// each contact patch; correct suspension without changing the body ride height.
const V=new THREE.Vector3(),U=new THREE.Vector3();
export function seatWheels(model,height) {
  const rest=model.userData.wheelRest;if(!rest)return;
  model.updateWorldMatrix(true,false);const uy=U.set(0,1,0).applyQuaternion(model.quaternion).y;
  rest.forEach((p,i)=>{let dy=0;for(let n=0;n<4;n++){V.set(p.x,dy,p.z).applyMatrix4(model.matrixWorld);dy+= (height(V.x,V.z)-V.y)*uy;}dy=Math.max(-.22,Math.min(.22,dy));model.userData.wheels[i].position.y=p.y+dy;if(model.userData.lowWheels?.[i])model.userData.lowWheels[i].position.y=p.y+dy;});
}

// Conform the articulated truck's individual wheel groups to road crests/sags.
export function seatRigWheels(model,height){
 model.updateWorldMatrix(true,false);for(const parent of new Set((model.userData.wheels||[]).map(w=>w.parent)))if(parent!==model)parent.updateWorldMatrix(true,false);
 for(const w of model.userData.wheels||[]){const r=w.userData.radius;if(!r)continue;const parent=w.parent,uy=U.set(0,1,0).transformDirection(parent.matrixWorld).y;let dy=0;
 for(let n=0;n<4;n++){V.set(w.position.x,dy,w.position.z).applyMatrix4(parent.matrixWorld);dy+=(height(V.x,V.z)-V.y)*uy;}
 w.position.y=r+Math.max(-.4,Math.min(.4,dy));}
}
