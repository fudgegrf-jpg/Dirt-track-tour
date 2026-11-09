import * as THREE from 'three';
// Night19 post-race pit return. Every AI car drives itself back to its own team
// hauler on a precomputed, smoothed path (kinematic: no physics, no per-frame
// planning). Loaders drive up their ramp and the gate closes behind them;
// parkers stop just outside their (already open) trailer at a varied angle.
// Simple forward-cone yielding keeps cars from touching each other or the player.
const FLOOR=1.25,RAMP_LEN=4.6,RAMP_RUN=RAMP_LEN*Math.cos(Math.asin(FLOOR/RAMP_LEN)),OPEN_ROT=Math.asin(FLOOR/RAMP_LEN),HALF_W=1.05,HALF_L=2.7;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v)),lerp=(a,b,t)=>a+(b-a)*t,ease=t=>t*t*(3-2*t);
const wrapA=a=>Math.atan2(Math.sin(a),Math.cos(a));
let seed=4242;const rnd=()=>((seed=Math.imul(seed,1664525)+1013904223>>>0)/4294967296);
function obb(x,z,th,hl,hw){const c=Math.cos(th),s=Math.sin(th);return[[hl,hw],[hl,-hw],[-hl,hw],[-hl,-hw]].map(([a,b])=>[x+c*a-s*b,z+s*a+c*b]);}
// signed separation of two oriented boxes (negative = overlap)
export function boxGap(a,b){const A=obb(a.x,a.z,a.th,HALF_L,HALF_W),B=obb(b.x,b.z,b.th,b.hl??HALF_L,b.hw??HALF_W);let sep=-Infinity;for(const th of[a.th,a.th+Math.PI/2,b.th,b.th+Math.PI/2]){const ax=Math.cos(th),az=Math.sin(th),pa=A.map(p=>p[0]*ax+p[1]*az),pb=B.map(p=>p[0]*ax+p[1]*az);sep=Math.max(sep,Math.max(Math.min(...pa)-Math.max(...pb),Math.min(...pb)-Math.max(...pa)));}return sep;}
const a0Inf=()=>Infinity;
export class PitReturn{
 constructor(load,{settle=false}={}){
  this.load=load;const race=load.race,pits=load.pits;this.race=race;this.pits=pits;this.trk=race.trk;this.o=load.offset;
  this.low=race.app.quality==='low'||!!race.app.isMobile;this.t=0;this.frame=0;
  this.stats={minGap:Infinity,minGapPlayer:Infinity,minGapPlayerAny:Infinity,pairs:null,loaded:0,parked:0,doneAt:{},gates:{}};
  seed=4242+(race.app.state?.round||0)*97;
  const ai=race.cars.filter(c=>!c.player),rigs=pits.rigs||[];
  this.agents=ai.map((c,k)=>{const rig=rigs.find(r=>r.driverId===c.driverId)||rigs[k%Math.max(1,rigs.length)];return this.makeAgent(c,rig,k);}).filter(Boolean);
  // closest-to-home leaves first; staggered, varied departures
  const order=[...this.agents].sort((a,b)=>a.len-b.len);order.forEach((a,r)=>{a.delay=.5+r*1.1+rnd()*.8;});
  // cars that finished side by side leave well apart so the second one merges in behind
  order.forEach((a,r)=>{for(const b of order.slice(0,r))if(Math.hypot(a.x-b.x,a.z-b.z)<11&&a.delay<b.delay+2.6)a.delay=b.delay+2.6+rnd()*.7;});
  for(const a of this.agents){const m=a.mesh;m.traverse(o=>{if(o.isLOD){if(this.low){o.autoUpdate=false;o.levels[0].object.visible=false;o.levels[1].object.visible=true;}else o.autoUpdate=true;}});a.c.retirement?.hazards&&(a.c.retirement.hazards.visible=false);}
  // cars that finished the race already touching are exempt until they first separate
  this.contact0=new Map();for(let i=0;i<this.agents.length;i++)for(let j=i+1;j<this.agents.length;j++){const g=boxGap(this.agents[i],this.agents[j]);if(g<.3)this.contact0.set(i+','+j,g);}
  this.stats.startContacts=this.contact0.size;
  // likewise any car already touching the player when the scene opens (race-end pose)
  {const pc=load.c;this.playerContact0=new Map();this.agents.forEach((a,i)=>{const g=boxGap(a,{x:pc.x,z:pc.z,th:pc.th,hl:2.75,hw:1.1});if(g<.3)this.playerContact0.set(i,g);});this.stats.startPlayerContacts=this.playerContact0.size;}
  if(settle)this.settleAll();else for(const a of this.agents)this.pose(a,0,true);
 }
 local(p){return{x:p.x-this.o.x,z:p.z-this.o.z};}
 tp(s,d){const p=this.trk.point(s,d);return{x:p.x-this.o.x,z:p.z-this.o.z};}
 makeAgent(c,rig,k){
  if(!rig)return null;const trk=this.trk,P=trk.P,W=trk.W,pits=this.pits,drive=pits.road.drive,o=this.o;
  const loader=rig.role==='loader',spd=.86+rnd()*.22,lane=(rnd()-.5)*2.4,jit=()=>(rnd()-.5)*1.2;
  const pts=[],push=(p,kind)=>{const l=pts[pts.length-1];if(!l||Math.hypot(l.x-p.x,l.z-p.z)>.8)pts.push({x:p.x,z:p.z,kind});};
  const start=this.local(c),q=trk.project(c.x,c.z);push(start,'track');
  let s0=q.s,d0=q.d;
  if(q.d<-W/2-2){// retired in the infield: diagonal forward onto the apron, clear of equipment and the pace car
   const f=this.race.infield,pc=this.race.paceCar,solid=p=>!f||f.obstacles.every(b=>Math.hypot(Math.max(0,Math.abs(p.x-b.x)-b.hx),Math.max(0,Math.abs(p.z-b.z)-b.hz))>2.2)&&(!pc||Math.hypot(p.x-pc.x,p.z-pc.z)>5.5);
   let pick=null;for(const ds of[18,26,34,42,12,50,8]){const e=trk.point(q.s+ds,-W/2-2.4);let ok=true;for(let i=1;i<=20;i++){const u=i/20,p={x:c.x+(e.x-c.x)*u,z:c.z+(e.z-c.z)*u};if(!solid(p)){ok=false;break;}}if(ok){pick=ds;break;}}
   const ds=pick??18;push(this.tp(q.s+ds*.45,lerp(q.d,-W/2-2.4,.6)),'track');s0=q.s+ds;d0=-W/2-2.4;push(this.tp(s0,d0),'track');
  }else{const h={x:start.x+Math.cos(c.th)*3,z:start.z+Math.sin(c.th)*3};push(h,'track');}
  // track: run the remaining arc to the approach point, blending to the exit lane
  const sA=pits.gateS-35,dA=trk.outer-12;let run=((sA-s0)%P+P)%P;if(run<14)run+=P;
  for(let u=8;u<run;u+=4){const t=ease(clamp(u/Math.min(140,run*.8),0,1)),dl=lerp(d0,clamp(dA+lane*(1-ease(clamp((u-run+60)/60,0,1))),-W/2+1.6,W/2-1.6),t);push(this.tp(s0+u,dl),'track');}
  // pit road: the same graded lane the player follows, ending at the lot entrance
  for(let i=0;i<drive.length-4;i++)push(drive[i],i<6?'track':'road');
  // paddock lot: per-rig lane
  const z0=rig.z,rear=rig.rear,R=[];
  if(rig.side==='right'){R.push({x:63,z:-46},{x:66.5,z:-41},{x:69,z:z0-7},{x:68.6,z:z0-2.6},{x:65.6,z:z0},{x:61.5,z:z0},{x:rear+RAMP_RUN+.35,z:z0,kind:'foot'});}
  else if(rig.side==='north'){const zl=z0>20?24.4:z0;R.push({x:63,z:-40},{x:63,z:-28},{x:63,z:-6},{x:62.4,z:4.5},{x:58.5,z:10.6},{x:50,z:13.6+(zl-16)*.4},{x:38,z:zl},{x:24,z:zl+jit()*.4});}
  else{R.push({x:61,z:-44.5},{x:55,z:-40.2},{x:44,z:-39.2},{x:28,z:-39},{x:19.5,z:-37.8},{x:16.4,z:-34.5});if(z0>-20)R.push({x:16.2,z:-27},{x:15.6,z:z0-3.2});}
  for(const p of R)push(p,'lot');
  let park=null;
  if(loader){if(rig.side!=='right')push({x:rear+RAMP_RUN+6,z:z0},'lot'),push({x:rear+RAMP_RUN+.35,z:z0},'foot');push({x:rear-.2,z:z0},'ramp');push({x:rear-11.65,z:z0},'ramp');}
  else{const px=rear+rig.rampRun+3.6+rnd()*1.8,pz=z0+(rnd()-.5)*1.6,th=Math.PI+(rig.i%2?1:-1)*(.1+rnd()*.17);park={x:px,z:pz,th};
   push({x:px-Math.cos(th)*7.5,z:pz-Math.sin(th)*7.5},'lot');push({x:px-Math.cos(th)*3.5,z:pz-Math.sin(th)*3.5},'lot');push({x:px,z:pz},'lot');}
  // smooth + resample at ~0.6 m
  const curve=new THREE.CatmullRomCurve3(pts.map(p=>new THREE.Vector3(p.x,0,p.z)),false,'centripetal'),len=curve.getLength(),N=Math.max(8,Math.ceil(len/.6)),sp=curve.getSpacedPoints(N);
  const kinds=pts.map(p=>p.kind),path=sp.map((v,i)=>({x:v.x,z:v.z,kind:'lot'})),cum=[0];
  // assign kinds from the nearest raw waypoint index (monotone walk)
  let j=0;for(let i=0;i<path.length;i++){const p=path[i];while(j<pts.length-1&&Math.hypot(pts[j+1].x-p.x,pts[j+1].z-p.z)<=Math.hypot(pts[j].x-p.x,pts[j].z-p.z)+.01)j++;p.kind=kinds[Math.min(pts.length-1,j+(Math.hypot(pts[j].x-p.x,pts[j].z-p.z)>1&&j<pts.length-1?1:0))]||'lot';if(i)cum.push(cum[i-1]+Math.hypot(p.x-path[i-1].x,p.z-path[i-1].z));}
  const vk={track:15,road:10.8,lot:5.8,foot:2.2,ramp:1.35};
  for(let i=0;i<path.length;i++){const a=path[Math.max(0,i-3)],b=path[i],cc=path[Math.min(path.length-1,i+3)],h1=Math.atan2(b.z-a.z,b.x-a.x),h2=Math.atan2(cc.z-b.z,cc.x-b.x),ds=Math.max(.3,cum[Math.min(path.length-1,i+3)]-cum[Math.max(0,i-3)]),k=Math.abs(wrapA(h2-h1))/ds;
   const lotZone=Math.abs(b.x)<75&&b.z>-51&&b.z<41&&b.kind==='road'?'lot':b.kind;b.v=Math.min(vk[lotZone]*spd,Math.sqrt(4/Math.max(k,1e-4)));b.v=Math.max(b.v,b.kind==='ramp'?1:2.2);}
  if(rig.side==='right')for(let i=Math.floor(path.length*.6);i<path.length;i++){const q=path[i];if(q.z>z0-7.5&&q.x>59)q.cross=true;}
  // ramp foot by geometry (last approach to the foot point), not by waypoint labels
  let footIdx=-1;if(loader){const fx=rear+RAMP_RUN+.35;let best=1e9;for(let i=Math.floor(path.length*.6);i<path.length;i++){const d=Math.hypot(path[i].x-fx,path[i].z-z0);if(d<best){best=d;footIdx=i;}}for(let i=footIdx;i<path.length;i++){path[i].kind='ramp';path[i].v=Math.min(path[i].v,1.35*spd+.1);}}
  path[path.length-1].v=0;for(let i=path.length-2;i>=0;i--){const ds=cum[i+1]-cum[i],dec=path[i].kind==='ramp'?.8:3;path[i].v=Math.min(path[i].v,Math.sqrt(path[i+1].v**2+2*dec*ds));}
  for(let i=0;i<path.length;i++)path[i].th=Math.atan2(path[Math.min(path.length-1,i+1)].z-path[Math.max(0,i-1)].z,path[Math.min(path.length-1,i+1)].x-path[Math.max(0,i-1)].x);
  return{c,mesh:c.mesh,rig,loader,path,cum,len:cum[cum.length-1],u:0,v:0,state:'wait',delay:0,idle:2+rnd()*2,stopT:0,wait:0,footU:footIdx>=0?cum[footIdx]:a0Inf(),park,x:start.x,z:start.z,th:c.th,y:0,wr:0,k,gate:loader?0:1,gateState:loader?'closed':'open',shadowT:0,acc:0};
 }
 sample(a,u){const cum=a.cum,p=a.path,n=cum.length;u=clamp(u,0,a.len);let lo=clamp(Math.floor(u/a.len*(n-1)),0,n-2);while(lo>0&&cum[lo]>u)lo--;while(lo<n-2&&cum[lo+1]<u)lo++;const t=clamp((u-cum[lo])/Math.max(1e-6,cum[lo+1]-cum[lo]),0,1),A=p[lo],B=p[lo+1]||A;return{x:lerp(A.x,B.x,t),z:lerp(A.z,B.z,t),th:A.th+wrapA(B.th-A.th)*t,v:lerp(A.v,B.v,t),kind:t<.5?A.kind:B.kind,cross:A.cross,i:lo};}
 // own-rig ramp / trailer floor first, then the paddock / road / track surface
 height(a,x,z){const r=a.rig,xr=x-r.rear;if(Math.abs(z-r.z)<1.22){const run=a.loader?RAMP_RUN*clamp(a.gate,0,1):r.rampRun;if(a.loader&&xr<0&&xr>-16.2)return FLOOR;if(xr>=0&&xr<=run&&run>.5&&(a.loader?a.gate>.97:true))return FLOOR*(1-xr/run);}return this.load.height(x,z);}
 pose(a,dt,force=false){
  const m=a.mesh,cs=Math.cos(a.th),sn=Math.sin(a.th),h=(f,l)=>this.height(a,a.x+cs*f-sn*l,a.z+sn*f+cs*l);
  let hF,hR,roll=0;if(this.low){hF=h(1.32,0);hR=h(-1.36,0);}else{const fl=h(1.32,-.85),fr=h(1.32,.85),rl=h(-1.36,-.85),rr=h(-1.36,.85);hF=(fl+fr)/2;hR=(rl+rr)/2;roll=-Math.atan2((fr+rr)-(fl+rl),2*1.7);}
  const y=(hF+hR)/2,k=force?1:1-Math.exp(-dt*18);a.pitch=force?Math.atan2(hF-hR,2.68):lerp(a.pitch||0,Math.atan2(hF-hR,2.68),k);a.roll=force?roll:lerp(a.roll||0,roll,k);
  m.position.set(a.x+this.o.x,y,a.z+this.o.z);m.rotation.set(a.roll,-a.th,a.pitch);a.y=y;
  a.wr+=a.v*dt/.42;for(const w of m.userData.wheels||[])w.rotation.z=-a.wr;
  if(force||(a.shadowT-=dt)<=0){a.shadowT=this.low?.25:.1;a.c.contactShadow?.update((x,z)=>this.height(a,x-this.o.x,z-this.o.z));}
 }
 gateUpdate(a,dt){if(!a.loader)return;const rp=a.rig.rig.userData.rampPivot,len=a.rig.rig.userData.rampLen;
  if(a.gateState==='closed'&&a.state!=='done'&&a.state!=='wait'&&a.footU-a.u<38)a.gateState='opening';
  if(a.gateState==='opening'){a.gate=Math.min(1,a.gate+dt/1.8);if(a.gate>=1)a.gateState='open';}
  if(a.gateState==='closing'){a.gate=Math.max(0,a.gate-dt/2.2);if(a.gate<=0){a.gateState='shut';this.stats.gates[a.c.driverId]='closed';}}
  const e=ease(a.gate);rp.rotation.z=lerp(-Math.PI/2,OPEN_ROT,e);rp.scale.x=lerp(1,RAMP_LEN/len,e);}
 settleAll(){for(const a of this.agents){a.u=a.len;const p=a.path[a.path.length-1];a.x=p.x;a.z=p.z;a.th=a.park?a.park.th:p.th;a.v=0;a.state='done';a.idle=0;a.doneAt=0;if(a.loader){a.gate=0;a.gateState='shut';this.stats.gates[a.c.driverId]='closed';this.gateUpdate(a,0);a.gate=1;this.pose(a,0,true);a.gate=0;}else this.pose(a,0,true);}this.count();}
 count(){this.stats.loaded=this.agents.filter(a=>a.state==='done'&&a.loader).length;this.stats.parked=this.agents.filter(a=>a.state==='done'&&!a.loader).length;}
 update(dt){
  if(!dt)return;this.t+=dt;this.frame++;const L=this.load,pc=L.c,cam=L.camera.position,o=this.o;
  const player={x:pc.x,z:pc.z,th:pc.th,player:true};
  const moving=this.agents.filter(a=>a.state!=='done');
  const pq=this.trk.project(pc.x+o.x,pc.z+o.z),playerTrack={player:true,trackS:pq.d>-this.trk.W/2-1.5&&pq.d<this.trk.outer?pq.s:undefined,trackD:pq.d,v:Math.abs(pc.v||0),state:'go'};
  for(const a of this.agents){if(a.state==='done'){a.trackS=undefined;continue;}const k=this.sample(a,a.u).kind;if(k==='track'){const q=this.trk.project(a.x+o.x,a.z+o.z);a.trackS=q.d>-this.trk.W/2-1.5?q.s:undefined;a.trackD=q.d;}else a.trackS=undefined;}
  // 1. desired speeds: sweep my own path ahead as a 3-point capsule against every
  //    other car (and the player). Lane merges and queues both resolve by yielding.
  const caps=b=>{const c=Math.cos(b.th),s=Math.sin(b.th);return[[b.x,b.z],[b.x+c*2,b.z+s*2],[b.x-c*2,b.z-s*2]];};
  const others=[...this.agents.map(b=>({ref:b,x:b.x,z:b.z,th:b.th,pts:caps(b)})),{ref:player,x:player.x,z:player.z,th:player.th,pts:caps(player)}];
  for(const a of moving){
   // a car still sitting on the track pulls away early when the player closes from behind in its lane
   if(a.state==='wait'&&a.trackS!==undefined&&playerTrack.trackS!==undefined&&!a.ignorePlayer){const P=this.trk.P,gap=((a.trackS-playerTrack.trackS)%P+P*1.5)%P-P*.5;if(gap>0&&gap<34&&Math.abs((a.trackD??0)-playerTrack.trackD)<3.6)a.delay=Math.min(a.delay,this.t+.1+(a.k*.618%1)*.7);}
   if(a.state==='wait'){if(this.t>=a.delay)a.state='go';else{a.hits=[];continue;}}
   const here=this.sample(a,a.u);let vt=here.v;a.hits=[];
   if(a.loader&&a.u<a.footU&&a.gateState!=='open'){const rem=a.footU-a.u;vt=Math.min(vt,Math.sqrt(Math.max(0,2*2.5*(rem-.2))));}
   const look=Math.min(a.len-a.u,4.5+a.v*1.25);
   for(const o of others){const b=o.ref;if(b===a||(b.player&&a.ignorePlayer))continue;if(Math.hypot(o.x-a.x,o.z-a.z)>look+9)continue;
    // never brake for a player who is behind (or beside and behind) my centre: stopping would only get me rear-ended
    if(b.player&&(o.x-a.x)*Math.cos(a.th)+(o.z-a.z)*Math.sin(a.th)<.4)continue;
    for(let ds=.8;ds<=look+.01;ds+=1.4){const q=this.sample(a,a.u+ds),me=caps(q).slice(0,2);/* centre + nose: my tail is the follower job */let hit=false;for(const m of me){for(const pnt of o.pts)if(Math.hypot(m[0]-pnt[0],m[1]-pnt[1])<2.65){hit=true;break;}if(hit)break;}
     if(hit){a.hits.push({b,lim:Math.max(0,(ds-1.2)*.9)});break;}}}
   // cool-down lap: no passing on the oval. Followers keep ~7 m to anything ahead in
   // track arc regardless of lane, so merges into the exit lane always happen in order.
   if(here.kind==='track'&&a.trackS!==undefined){const P=this.trk.P;for(const b of [...this.agents,playerTrack]){if(b===a||b.trackS===undefined||(b.player&&a.ignorePlayer))continue;const gap=((b.trackS-a.trackS)%P+P*1.5)%P-P*.5;if(gap>0&&gap<16){const lim=Math.max(0,(b.state==='wait'?0:b.v)+(gap-7.5)*.8);vt=Math.min(vt,lim);if(b.player&&lim<.3)a.hits.push({b:player,lim});}if(gap>0&&gap<7.5&&b.state==='wait'){b.holdT=(b.holdT||0)+dt;if(b.holdT>1.2)b.delay=Math.min(b.delay,this.t);}}}
   // pull away from a player rolling up behind (the player has no AI collision): bounded by traffic ahead in step 1b
   {const dx=pc.x-a.x,dz=pc.z-a.z,al=dx*Math.cos(a.th)+dz*Math.sin(a.th),lat=Math.abs(-dx*Math.sin(a.th)+dz*Math.cos(a.th)),pv=Math.abs(pc.v||0);a.escape=!a.ignorePlayer&&al<0&&al>-9.5&&lat<2.8&&pv>a.v-.5&&here.kind!=='ramp';if(a.escape)vt=Math.max(vt,Math.min(pv+2.5,15));}
   a.vbase=vt;
  }
  // mutual conflicts (merges, the east-lane crossing): whoever separates by moving
  // goes first; otherwise lane traffic beats a crossing car, then the car ahead, then index
  const minD=(q,o)=>{let m=1e9;for(const p of caps(q).slice(0,2))for(const r of caps(o))m=Math.min(m,Math.hypot(p[0]-r[0],p[1]-r[1]));return m;};
  const step=(a)=>{const q=this.sample(a,a.u+1);return{x:q.x,z:q.z,th:q.th};};
  for(const a of moving){if(!a.hits)continue;let vt=a.vbase??0;const fx=Math.cos(a.th),fz=Math.sin(a.th);
   for(const h of a.hits){const b=h.b;
    if(!b.player&&b.hits?.some(x=>x.b===a)){const sepA=minD(step(a),b)>minD(a,b)+.05,sepB=minD(step(b),a)>minD(b,a)+.05;let win;
     if(sepA!==sepB)win=sepA;else{const ca=this.sample(a,a.u).cross?1:0,cb=this.sample(b,b.u).cross?1:0;if(ca!==cb)win=ca<cb;else{const al=(b.x-a.x)*fx+(b.z-a.z)*fz;win=Math.abs(al)>1?al<0:a.k<b.k;}}
     if(win)continue;}
    vt=Math.min(vt,h.lim);
    if(b.state==='wait'){b.holdT=(b.holdT||0)+dt;if(b.holdT>1.2)b.delay=Math.min(b.delay,this.t);}}
   const pOnly=a.hits.length&&a.hits.every(h=>h.b.player);if(pOnly&&vt<.3){a.wait+=dt;if(a.wait>6)a.ignorePlayer=true;}else a.wait=0;
   a.vt=vt;}
  // 2. integrate, LOD for far cars on mobile
  for(const a of moving){if(a.state==='wait'){this.gateUpdate(a,dt);continue;}
   a.acc+=dt;const far=this.low&&Math.hypot(a.x+o.x-cam.x,a.z+o.z-cam.z)>70&&!this.agents.some(b=>b!==a&&b.state!=='done'&&Math.hypot(b.x-a.x,b.z-a.z)<16);if(far&&(this.frame+a.k)%2)continue;const h=a.acc;a.acc=0;
   const vt=a.vt??0;a.v+=clamp(vt-a.v,-4.5*h,(a.escape?5.5:2.6)*h);a.v=Math.max(0,a.v);a.u=Math.min(a.len,a.u+a.v*h);
   const p=this.sample(a,a.u);a.x=p.x;a.z=p.z;
   // heading: path tangent; parkers rotate into their varied final angle over the last metres
   let th=p.th;if(a.park){const rem=a.len-a.u;if(rem<3.6)th=a.park.th+wrapA(p.th-a.park.th)*clamp(rem/3.6,0,1);}a.th=th;
   a.throttle=a.v<(a.vt??0)-.3?.45:.12;this.gateUpdate(a,h);
   if(a.u>=a.len-.02&&a.v<.05){a.v=0;a.state='done';a.doneAt=this.t;this.stats.doneAt[a.c.driverId]=+this.t.toFixed(1);if(a.loader)a.closeAt=this.t+.8;this.pose(a,h,false);a.c.contactShadow?.update((x,z)=>this.height(a,x-o.x,z-o.z));this.count();continue;}
   this.pose(a,h,far);
  }
  for(const a of this.agents)if(a.state==='done'&&a.loader&&a.gateState==='open'&&this.t>=a.closeAt){a.gateState='closing';}
  for(const a of this.agents)if(a.state==='done'&&(a.gateState==='closing'))this.gateUpdate(a,dt);
  for(const a of this.agents)if(a.state==='done'&&a.idle>0)a.idle-=dt;
  // 3. QA: oriented-box separation among AI and to the player (cheap: only close pairs)
  const all=this.agents;for(let i=0;i<all.length;i++){const a=all[i];if(a.state==='wait'&&this.t<1)continue;for(let j=i+1;j<all.length;j++){const b=all[j];if(Math.hypot(a.x-b.x,a.z-b.z)>7)continue;if(a.state==='done'&&b.state==='done')continue;const g=boxGap(a,b),key=i+','+j;if(this.contact0.has(key)){if(g>.5)this.contact0.delete(key);else if(g>=this.contact0.get(key)-.05)continue;}if(g<this.stats.minGap){this.stats.minGap=g;this.stats.pairs=[a.c.driverId,b.c.driverId,+this.t.toFixed(1)];if(g<0&&this.debug)this.stats.overlap=[a,b].map(q=>({id:q.c.driverId,st:q.state,x:+q.x.toFixed(2),z:+q.z.toFixed(2),th:+q.th.toFixed(3),v:+q.v.toFixed(2),vt:q.vt,u:+q.u.toFixed(1),hits:(q.hits||[]).map(h=>(h.b.c?.driverId||'P')+':'+h.lim.toFixed(1))}));}}
   if(a.state!=='done'&&!a.ignorePlayer&&Math.hypot(a.x-pc.x,a.z-pc.z)<7){const g=boxGap(a,{x:pc.x,z:pc.z,th:pc.th,hl:2.75,hw:1.1}),dl=Math.hypot(pc.x-a.x,pc.z-a.z)||1,ux=(pc.x-a.x)/dl,uz=(pc.z-a.z)/dl,al=a.v*(Math.cos(a.th)*ux+Math.sin(a.th)*uz)-.3;const i0=this.playerContact0.get(i);if(i0!==undefined&&g>.5)this.playerContact0.delete(i);const exempt=i0!==undefined&&g>=i0-.05&&g<=.5;if(exempt){}else if(g<this.stats.minGapPlayerAny)this.stats.minGapPlayerAny=g;
     // the player still drives through AI cars exactly as in Night18; only contacts where the
     // AI car is the one closing in (the AI's responsibility) count against the AI
     if(al>0){if(g<this.stats.minGapPlayer){this.stats.minGapPlayer=g;this.stats.playerPair=[a.c.driverId,+this.t.toFixed(1)];}}else if(g<0)this.stats.playerOverlapsFromBehind=(this.stats.playerOverlapsFromBehind||0)+1;}}
 }
 // nearest AI car in front of a pose (used by the player's paid winch assist to queue politely)
 carAhead(p){const fx=Math.cos(p.th),fz=Math.sin(p.th);let best=null;for(const a of this.agents){if(a.state==='done')continue;const dx=a.x-p.x,dz=a.z-p.z,al=dx*fx+dz*fz,lat=Math.abs(-dx*fz+dz*fx);if(al<=0||al>16||lat>2.7)continue;if(!best||al<best.gap)best={gap:al,v:a.state==='wait'?0:a.v,id:a.c.driverId};}return best;}
 done(){return this.agents.every(a=>a.state==='done')&&this.agents.every(a=>!a.loader||a.gateState==='shut');}
 // engine voices for the paddock mix: idle down after stopping, then switch off
 audioCars(){const id=c=>c.num?String(c.num).split('').reduce((a,ch)=>a*31+ch.charCodeAt(0),7)%9973:1;
  return this.agents.filter(a=>a.state!=='wait'&&(a.state!=='done'||a.idle>0)).map(a=>({id:id(a.c),x:a.x+this.o.x,y:a.y,z:a.z+this.o.z,vx:a.v*Math.cos(a.th),vz:a.v*Math.sin(a.th),speed:a.v,wheelSpin:0,throttle:a.state==='done'?0:a.throttle||0}));}
 snapshot(){return this.agents.map(a=>({id:a.c.driverId,role:a.loader?'loader':'parker',side:a.rig.side,state:a.state,u:+a.u.toFixed(1),len:+a.len.toFixed(1),v:+a.v.toFixed(2),x:+a.x.toFixed(2),z:+a.z.toFixed(2),th:+a.th.toFixed(3),y:+a.y.toFixed(2),gate:a.gateState,ramp:+a.rig.rig.userData.rampPivot.rotation.z.toFixed(3),doneAt:a.doneAt}));}
}
