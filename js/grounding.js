import * as THREE from 'three';
// Explicit support ledger: ground contacts and mounted fittings are distinct.
// Store geometry-derived base coordinates so QA checks rendered geometry, not a second height formula.
export function groundObject(ledger,object,ground,{kind='prop',support=0,instance=null}={}){
 object.geometry?.computeBoundingBox();
 const b=object.geometry?.boundingBox;if(!b)return;
 object.updateWorldMatrix(true,false);
 const local=new THREE.Vector3((b.min.x+b.max.x)/2,b.min.y,(b.min.z+b.max.z)/2);
 const matrix=new THREE.Matrix4();if(instance!==null){object.getMatrixAt(instance,matrix);matrix.premultiply(object.matrixWorld);}else matrix.copy(object.matrixWorld);
 const base=local.clone().applyMatrix4(matrix),target=ground(base.x,base.z)+support,delta=target-base.y;
 if(instance!==null){object.getMatrixAt(instance,matrix);matrix.elements[13]+=delta;object.setMatrixAt(instance,matrix);object.instanceMatrix.needsUpdate=true;}else{object.position.y+=delta;object.updateWorldMatrix(true,false);}
 ledger.push({object,instance,local,ground,support,kind});
}
export function supportErrors(ledger){const m=new THREE.Matrix4();return ledger.map(r=>{r.object.updateWorldMatrix(true,false);if(r.instance!==null){r.object.getMatrixAt(r.instance,m);m.premultiply(r.object.matrixWorld);}else m.copy(r.object.matrixWorld);const b=r.local.clone().applyMatrix4(m),expected=r.ground(b.x,b.z)+r.support;return{kind:r.kind,error:Math.abs(b.y-expected),x:b.x,z:b.z};});}
// Ground only the lower foot of a post; its attached sign/canopy/deck stays aligned.
export function groundFoot(ledger,object,ground,{kind='support',instance=null}={}){
 if(instance!==null){groundObject(ledger,object,ground,{kind,instance});return;}
 object.updateWorldMatrix(true,false);object.geometry=object.geometry.clone();object.geometry.computeBoundingBox();const b=object.geometry.boundingBox,min=b.min.y,max=b.max.y,p=object.geometry.attributes.position,world=new THREE.Vector3(),inverse=object.matrixWorld.clone().invert(),feet=[];
 for(let i=0;i<p.count;i++){if(p.getY(i)>min+1e-5)continue;world.fromBufferAttribute(p,i).applyMatrix4(object.matrixWorld);world.y=ground(world.x,world.z);world.applyMatrix4(inverse);p.setY(i,world.y);feet.push(new THREE.Vector3(p.getX(i),p.getY(i),p.getZ(i)));}p.needsUpdate=true;object.geometry.computeVertexNormals();object.geometry.computeBoundingBox();
 for(const local of feet)ledger.push({object,instance:null,local,ground,support:0,kind});
}
export function projectHighway(h,x,z){let S=0,best=Infinity;for(let i=0;i<h.X.length;i+=12){const d=(h.X[i]-x)**2+(h.Z[i]-z)**2;if(d<best){best=d;S=h.S0+i*2;}}for(let i=0;i<5;i++){const a=h.at(S);S+=(x-a.x)*Math.cos(a.th)+(z-a.z)*Math.sin(a.th);}const a=h.at(S);return{S,lat:-(x-a.x)*Math.sin(a.th)+(z-a.z)*Math.cos(a.th)};}
