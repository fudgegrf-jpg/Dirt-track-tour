import {pbrMaterial} from './gfx2-materials.js';
import * as THREE from 'three';
import {beveledBox,batchStatic,canvasTexture} from './details.js';
import {woodTexture} from './truck-cockpit.js';
// Dimensions in metres; tractor +X forward, driver's seat on -Z.
export function buildCab(m){
 const u=m.semi.userData,dash=new THREE.Group();u.tractor.add(dash);m.dash=dash;dash.name='crafted-cab-interior';
 const material=(color,roughness=.75,metalness=0)=>new THREE.MeshStandardMaterial({color,roughness,metalness});
 const leather=canvasTexture('rubber',256);leather.repeat.set(8,8);const pad=new THREE.MeshStandardMaterial({color:0x302e28,map:leather,bumpMap:leather,bumpScale:.0015,roughness:.94}),wood=pbrMaterial('wood',{roughness:.48,metalness:.02},[2,1]),chrome=material(0xc6c3ad,.34,.72),black=material(0x171b1c),beige=material(0x827969,.94);
 const add=(geo,mat,x,y,z,rx=0,ry=0,rz=0)=>{const o=new THREE.Mesh(geo,mat);o.position.set(x,y,z);o.rotation.set(rx,ry,rz);dash.add(o);return o;};
 // Sculpted upholstered shelf, full-depth hardwood fascia and recessed lower console.
 add(beveledBox(.62,.48,2.30,.10,5),wood,1.63,2.43,0);
 add(beveledBox(.68,.12,2.34,.052,5),pad,1.60,2.72,0);
 add(beveledBox(.52,.29,2.22,.04,3),black,1.66,2.09,0);
 add(beveledBox(.17,.59,2.15,.055,5),chrome,1.265,2.48,0);
 add(beveledBox(.18,.56,2.12,.046,5),wood,1.25,2.48,0);
 // Recessed, continuous main instrument pod; live atlas stays crisp on phones.
 add(beveledBox(.16,.48,2.04,.035,4),black,1.205,2.43,0);
 const gc=document.createElement('canvas');gc.width=1536;gc.height=384;m.gaugeCtx=gc.getContext('2d');m.gaugeCtx.scale(1.5,1.5);m.gaugeTex=new THREE.CanvasTexture(gc);m.gaugeTex.colorSpace=THREE.SRGBColorSpace;m.gaugeTex.anisotropy=8;
 const gaugeFace=add(new THREE.PlaneGeometry(2.01,.5025),new THREE.MeshBasicMaterial({map:m.gaugeTex,toneMapped:false}),1.114,2.43,0,0,-Math.PI/2);gaugeFace.name='cab-gauge-display';m.gaugeT=0;
 // Vents and switch rows are inset into the fascia, never suspended above it.
 for(const z of[-.83,.77]){add(beveledBox(.05,.10,.30,.012,3),chrome,1.135,2.72,z);add(new THREE.BoxGeometry(.056,.076,.273),black,1.11,2.72,z);for(let j=0;j<5;j++)add(new THREE.BoxGeometry(.06,.005,.26),material(0x6b6d65),1.10,2.69+j*.014,z);}
 add(beveledBox(.18,.10,2.12,.025,3),wood,1.25,2.16,0);
 for(let i=0;i<12;i++){const z=-.99+i*.18;add(beveledBox(.032,.057,.075,.006,2),black,1.135,2.16,z);add(new THREE.BoxGeometry(.007,.006,.024),material(i===9?0xda7c35:0xd9d2b4),1.112,2.17,z);}
 const radio=document.createElement('canvas');radio.width=512;radio.height=96;const r=radio.getContext('2d');r.fillStyle='#0a1618';r.fillRect(0,0,512,96);r.fillStyle='#9bd6b0';r.font='36px monospace';r.fillText('CB 19   /   13 SPEED',15,59);const rt=new THREE.CanvasTexture(radio);rt.colorSpace=THREE.SRGBColorSpace;add(new THREE.PlaneGeometry(.62,.10),new THREE.MeshBasicMaterial({map:rt,toneMapped:false}),1.36,2.03,.51,0,-Math.PI/2);
 // Tilted leather steering wheel, proper connected spokes and steering-column stalks.
 const pivot=new THREE.Group();pivot.position.set(.70,2.47,-.46);pivot.quaternion.setFromUnitVectors(new THREE.Vector3(0,0,1),new THREE.Vector3(-.78,.62,0).normalize());dash.add(pivot);m.wheel=new THREE.Group();pivot.add(m.wheel);
 const rim=new THREE.Mesh(new THREE.TorusGeometry(.255,.034,14,64),pad);m.wheel.add(rim);
 for(const a of[.18,Math.PI-.18,-Math.PI/2]){const spoke=new THREE.Mesh(beveledBox(.205,.044,.027,.013,3),chrome);spoke.position.set(Math.cos(a)*.13,Math.sin(a)*.13,0);spoke.rotation.z=a;m.wheel.add(spoke);}
 const hub=new THREE.Mesh(beveledBox(.16,.12,.065,.035,5),pad);hub.position.z=.025;m.wheel.add(hub);
 const badge=new THREE.Mesh(new THREE.CircleGeometry(.023,24),chrome);badge.position.z=.06;m.wheel.add(badge);
 const column=new THREE.Mesh(new THREE.CylinderGeometry(.038,.065,.56,16),black);column.rotation.x=Math.PI/2;column.position.z=-.28;pivot.add(column);
 const stalk=new THREE.Mesh(new THREE.CylinderGeometry(.009,.012,.20,10),black);stalk.rotation.z=-Math.PI/2;stalk.position.set(-.15,0,-.08);pivot.add(stalk);
 // Closed footwell and upholstered door cards prevent seeing roadway through the cabin.
 add(new THREE.BoxGeometry(1.95,.07,2.28),black,.55,1.53,0);
 add(beveledBox(.54,.60,.52,.04,3),black,1.47,1.87,-.46);
 add(beveledBox(.26,.18,.22,.035,3),black,1.20,2.09,-.46);
 for(const sz of[-1,1]){add(beveledBox(1.73,.84,.13,.04,4),beige,.69,2.01,sz*1.13);add(beveledBox(.65,.085,.16,.025,3),pad,.55,2.28,sz*1.05);add(beveledBox(.13,.025,.045,.01,3),chrome,1.03,2.37,sz*1.042);}
 // Windshield surrounds and door cards share matching endpoints (no isolated floating bars).
 for(const sz of[-1,1]){add(beveledBox(.12,.87,.13,.035,4),beige,1.63,3.08,sz*1.10,0,0,-.24);add(beveledBox(1.75,.22,.13,.045,4),pad,.69,2.56,sz*1.13);add(beveledBox(.13,.93,.13,.035,4),beige,-.16,3.02,sz*1.13);add(beveledBox(.35,.045,.78,.025,4),beige,1.40,3.47,sz*.54,0,0,.18);}
 add(beveledBox(.38,.13,2.32,.04,4),beige,1.54,3.50,0);add(new THREE.BoxGeometry(1.93,.055,2.32),beige,.56,3.59,0);add(new THREE.BoxGeometry(.055,.79,.045),beige,1.63,3.08,0,0,0,-.24);
 // Painted hood slopes down toward the road. Wipers are attached to its windshield cowl.
 const hood=add(beveledBox(2.6,.22,2.00,.10,5),new THREE.MeshStandardMaterial({color:0x922b24,metalness:.25,roughness:.34}),3.06,2.66,0,0,0,-.035);hood.name='cab-red-hood';add(new THREE.BoxGeometry(2.55,.009,.018),chrome,3.06,2.777,0,0,0,-.035);
 for(const sz of[-1,1]){add(new THREE.BoxGeometry(.034,.034,.58),black,1.91,2.83,sz*.52,0,sz*.06,0);add(new THREE.BoxGeometry(.024,.13,.022),black,1.86,2.78,sz*.76,0,0,-.3);}
 // Economical rearward mirror image: horizon, lane perspective, our trailer and nearby traffic.
 m.mirrorCanvases=[];for(const sz of[-1,1]){add(beveledBox(.08,.46,.26,.035,4),chrome,1.23,3.03,sz*1.48);const c=document.createElement('canvas');c.width=128;c.height=256;const t=new THREE.CanvasTexture(c);t.colorSpace=THREE.SRGBColorSpace;m.mirrorCanvases.push({ctx:c.getContext('2d'),texture:t,side:sz});const mirror=add(new THREE.PlaneGeometry(.22,.41),new THREE.MeshBasicMaterial({map:t,toneMapped:false}),1.182,3.03,sz*1.48,0,-Math.PI/2);mirror.name='rearward-mirror';add(new THREE.BoxGeometry(.48,.025,.025),chrome,1.46,2.82,sz*1.32,0,sz*.45,0);}
 batchStatic(dash,[pivot]);dash.traverse(o=>{if(o.isMesh){o.castShadow=false;o.receiveShadow=false;}});
 const dome=new THREE.PointLight(0xffecd4,1.4,3.4,1.5);dome.position.set(.5,3.35,-.3);dash.add(dome);m.cabFill=dome;const dg=new THREE.PointLight(0xffa040,0,1.4,2);dg.position.set(1.05,2.85,-.52);dash.add(dg);m.dashGlow=dg;
 m.glass=u.tractor.children.filter(o=>o!==dash&&!o.isLight&&!m.heads.some(l=>l.target===o));dash.visible=false;
}
