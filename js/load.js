import {inPitGate} from './pit-gate.js';
import { ContactShadow, seatWheels } from './contact.js';
// Hauler loading mini-game: drive the late model up the ramp into the enclosed trailer and park it.
import * as THREE from 'three';
import { makeLateModel, makeSemi, makeSky, dirtTextures, glowTexture, trailerTexture, disposeScene } from './gfx.js';
import { clamp, lerp, wrapAngle } from './physics.js';
import * as UI from './ui.js';

const RAMP_LEN = 4.6, FLOOR = 1.25, RAMP_HALF = 1.22, IN_HALF = 1.25, FRONT_X = -15.4;
export class LoadScene {
  constructor(app,{race}={}) {
    this.app=app;this.race=race;race.pausedRace=true;this.scene=race.scene;this.camera=race.camera;this.pits=race.pits;this.offset=this.pits.origin;this.semi=this.pits.semi;
    this.rampTarget=Math.asin(FLOOR/RAMP_LEN);this.semi.userData.rampPivot.rotation.z=this.rampTarget;
    const st=app.state,p=race.player;this.car=p.mesh;this.car.userData.setInCar?.(false);
    this.c={x:p.x-this.offset.x,z:p.z-this.offset.z,th:p.th,v:Math.min(11.18,p.speed||0),steer:0};
    if(st.pitPose?.round===st.round&&st.pitPose.layout!==2){const old=st.pitPose.c;if(!old||Math.abs(old.x)>72||old.z< -43||old.z>39)st.pitPose.c={...this.c};if(st.pitPose.session){st.pitPose.session.pathIndex=0;st.pitPose.session.exitStarted=false;}st.pitPose.layout=2;}
    if(st.pitPose?.round===st.round)Object.assign(this.c,st.pitPose.c);
    this.contact=p.contactShadow;this.rigContact=new ContactShadow(this.scene,this.semi,true);this.rigContact.update(()=>0);
    race.cars.filter(c=>!c.player).forEach((c,i)=>{const b=this.pits.bays[i%this.pits.bays.length];c.mesh.position.set(this.offset.x+b.x,0,this.offset.z+b.z+Math.floor(i/this.pits.bays.length)*4);c.mesh.rotation.set(0,Math.PI,0);c.mesh.traverse(o=>{if(o.isLOD){o.autoUpdate=false;o.levels[0].object.visible=false;o.levels[1].object.visible=true;}});c.contactShadow.update(()=>0);});
    this.goal=new THREE.Mesh(new THREE.PlaneGeometry(2.3,2.2),new THREE.MeshStandardMaterial({color:0xd2f77f,emissive:0x799f33,emissiveIntensity:.25,transparent:true,opacity:.65}));this.goal.rotation.x=-Math.PI/2;this.goal.position.set(-11.65,FLOOR+.02,0);this.pits.root.add(this.goal);
    this.t=0;this.timer=0;this.dmg=0;this.hits=0;this.falls=0;this.hold=0;this.cool=0;this.camMode=0;this.intro=0;this.done=false;this.winch=false;this.winchUsed=false;this.crew=[];this.pathIndex=0;this.loading=false;
    if(st.pitPose?.round===st.round&&st.pitPose.session)Object.assign(this,st.pitPose.session);
    this.winchUsed=!!(this.winchUsed||this.winch);
    if(st.pitPose?.round===st.round&&st.pitPose.routeVersion!==3&&!this.loading){const path=this.pits.road.drive,q=race.trk.project(this.c.x+this.offset.x,this.c.z+this.offset.z);this.exitStarted=q.d>race.trk.outer+1;this.pathIndex=this.exitStarted?path.reduce((best,p,i)=>Math.hypot(this.c.x-p.x,this.c.z-p.z)<Math.hypot(this.c.x-path[best].x,this.c.z-path[best].z)?i:best,0):0;}

    if(![this.c.x,this.c.z,this.c.th,this.c.v,this.c.steer].every(Number.isFinite)||(this.c.wr!==undefined&&!Number.isFinite(this.c.wr))){Object.assign(this.c,{x:13,z:0,th:Math.PI,v:0,steer:0,wr:0});this.winch=false;this.loading=true;this.exitStarted=true;}
    if(!Number.isFinite(this.pathIndex))this.pathIndex=0;
    this.towed=!!st.results?.[st.round]?.dnf;
    if(this.towed&&!st.pitPose?.session){Object.assign(this.c,{x:13,z:0,th:Math.PI,v:0,steer:0});this.exitStarted=true;this.pathIndex=this.pits.road.drive.length-1;this.intro=.65;this.towMessage=5;st.pitPose={layout:2,routeVersion:3,round:st.round,c:{...this.c},session:{exitStarted:true,pathIndex:this.pathIndex}};app.save();}
    const mech=app.crew('Mechanic');this.par=35+(mech?mech.skill*2:0);app.ui.innerHTML='';this.buildHud();this.wheelH=this.wheelPts(this.c).map(w=>this.height(w.x,w.z));this.car.position.set(this.c.x+this.offset.x,this.height(this.c.x,this.c.z),this.c.z+this.offset.z);this.car.rotation.set(0,-this.c.th,0);this.updateCamera(1);this.updateHud();
  }
  buildHud() {
    const h = document.createElement('div'); h.id = 'hud';
    h.className='pit-hud';h.innerHTML=`<section class="pit-status"><div class="kicker">${UI.esc(this.app.track.short)} / POST RACE</div><h3 id="pit-stage">Return to your hauler</h3><p id="l-st">Take the marked corner pit entrance · 25 mph limit</p><div class="pit-metrics"><span><b id="pit-speed">0</b> MPH</span><span>LOAD <b id="l-t">0.0</b>s / ${this.par}s</span><span>DAMAGE +<b id="l-d">0%</b></span></div><canvas id="l-al" width="200" height="60"></canvas></section><section class="pit-nav"><canvas id="pit-map" width="220" height="150"></canvas><span id="pit-dist"></span></section><div class="race-messages loading-messages" role="status"><div id="center-msg"></div><div id="sub-msg"></div></div><div class="hint">25 mph in the pits · WASD / arrows · C camera · X winch / release ($300 once) · R re-align at ramp</div>`;
    this.app.ui.appendChild(h);
    this.hud = { t: h.querySelector('#l-t'), d: h.querySelector('#l-d'), al: h.querySelector('#l-al').getContext('2d'), st: h.querySelector('#l-st'), msg: h.querySelector('#center-msg'), sub: h.querySelector('#sub-msg') };
    this.hud.msg.textContent='';this.hud.sub.textContent='';
  }
  height(x, z) {
    if (x < 0 && x > -16.2 && Math.abs(z) < IN_HALF + 0.05) return FLOOR;
    const rx = RAMP_LEN * Math.cos(this.rampTarget);
    if (x >= 0 && x <= rx && Math.abs(z) <= RAMP_HALF) return FLOOR * (1 - x / rx);
    const wx=x+this.offset.x,wz=z+this.offset.z,q=this.race.trk.project(wx,wz);if(q.d<=this.race.trk.outer+1&&q.d>this.race.trk.inner-2){const h=this.race.trackHeightAt(wx,wz);if(h!==null)return h;}
    if(Math.abs(x)<=75&&z>=-51&&z<=41)return 0;
    return this.pits.road.heightAt(wx,wz)??this.race.terrainHeight(wx,wz);
  }
  wheelPts(c) {
    const cs = Math.cos(c.th), sn = Math.sin(c.th);
    return [[1.32, -0.86], [1.32, 0.7], [-1.36, -0.85], [-1.36, 0.91]].map(([lx, lz]) => ({ x: c.x + cs * lx - sn * lz, z: c.z + sn * lx + cs * lz, lx, lz }));
  }
  corners(c) {
    const cs = Math.cos(c.th), sn = Math.sin(c.th);
    return [[2.85, -1.10], [2.85, 1.10], [-2.65, -1.10], [-2.65, 1.10], [0, -1.10], [0, 1.10]].map(([lx, lz]) => ({ x: c.x + cs * lx - sn * lz, z: c.z + sn * lx + cs * lz, lx }));
  }
  blocked(c,previous=null) {
    const wx=c.x+this.offset.x,wz=c.z+this.offset.z,q=this.race.trk.project(wx,wz);
    const lot=Math.abs(c.x)<75&&c.z>-53&&c.z<43;
    // Open ground and graded shoulders are drivable. Only visible objects can
    // stop the return trip; being off the route is guidance, not an invisible wall.
    if(lot)for(const o of this.pits.obstacles)if(Math.abs(c.x-o.x)<o.w+2.8&&Math.abs(c.z-o.z)<o.d+1.1)return 'object';
    for(const b of this.race.infield?.obstacles||[]){if(Math.abs(wx-b.x)>b.hx+4||Math.abs(wz-b.z)>b.hz+4)continue;for(const off of[-1.65,0,1.65]){const px=wx+Math.cos(c.th)*off,pz=wz+Math.sin(c.th)*off;if(Math.hypot(Math.max(0,Math.abs(px-b.x)-b.hx),Math.max(0,Math.abs(pz-b.z)-b.hz))<1)return 'object';}}
    const corners=this.corners(c),oldCorners=previous?this.corners(previous):null,outer=this.race.trk.outer,oldCenter=previous?this.race.trk.project(previous.x+this.offset.x,previous.z+this.offset.z):null;
    for(let i=0;i<corners.length;i++){const p=corners[i],pr=this.race.trk.project(p.x+this.offset.x,p.z+this.offset.z);if(inPitGate(this.race.trk,pr.s))continue;if(oldCorners){const old=this.race.trk.project(oldCorners[i].x+this.offset.x,oldCorners[i].z+this.offset.z),inside=oldCenter.d<outer,movingAway=inside?q.d<oldCenter.d-.001:q.d>oldCenter.d+.001,cross=inside?old.d<outer&&pr.d>=outer:old.d>outer+.35&&pr.d<=outer+.35;if(cross&&!movingAway)return 'trackwall';}else if(Math.abs(pr.d-outer)<.32)return 'trackwall';}
    for(const o of this.pits.road.barriers||[])if(corners.some(p=>Math.hypot(p.x-o.x,p.z-o.z)<o.r))return 'object';
    // Trailer collision is strictly bounded on BOTH axes in trailer-local space.
    if(c.x<FRONT_X-4||c.x>3||Math.abs(c.z)>4.5)return null;
    const centerOut = Math.abs(c.z) > IN_HALF + 0.25;
    for (const p of this.corners(c)) {
      if (p.x < 0.02 && p.x > -22) {
        if (!centerOut && Math.abs(p.z) > IN_HALF - 0.03) return 'trailer';
        if (centerOut && Math.abs(p.z) < IN_HALF + 0.2) return 'trailer';
      }
      if (Math.abs(c.z)<2 && p.lx>0 && p.x<FRONT_X && p.x>FRONT_X-1.2) return 'front';
    }
    return null;
  }
  update(dt) {
    if(!Number.isFinite(dt)||dt<0)return;dt=Math.min(dt,.1);
    const { app, c } = this;this.t+=dt;
    if(![c.x,c.z,c.th,c.v,c.steer].every(Number.isFinite)||(c.wr!==undefined&&!Number.isFinite(c.wr)))this.recoverWinch();
    if(app.tap('KeyR')&&!this.done)this.recoverWinch();
    if (app.tap('KeyC')) this.camMode = (this.camMode + 1) % 3;
    if(this.towMessage>0)this.towMessage=Math.max(0,this.towMessage-dt);
    // ramp opens during intro
    const rp = this.semi.userData.rampPivot; rp.rotation.z = lerp(rp.rotation.z, this.rampTarget, 1 - Math.exp(-dt * 2.2));
    if (this.intro > 0) { this.intro -= dt; if (this.intro <= 0) { this.hud.msg.textContent = ''; this.hud.sub.textContent = ''; } }
    if (!this.done) {
      if(this.winch)this.winchUsed=true;
      if(app.tap('KeyX')){this.winch=!this.winch;this.winchUsed||=this.winch;this.autoProgress=null;c.v=0;this.hud.sub.textContent=this.winch?'Crew winching · X release / R re-align · $300 once':'Winch released · drive or reverse freely';}
      let inp = app.input();this.audioThrottle=inp.throttle;this.audioFree=!!inp.brake||this.intro>0;
      if (this.intro > 0) {inp = { steer: 0, throttle: 0, brake: 0 };c.v=0;}
      if(this.winch&&(inp.throttle||inp.brake||Math.abs(inp.steer)>.2)){this.winch=false;c.v=0;this.hud.sub.textContent='Winch released — manual control';}
      if(this.winch)inp=this.autopilot(dt);
      if(c.x<17&&c.x> -17&&Math.abs(c.z)<4)this.loading=true;
      if(this.loading)this.timer += dt*(this.winch?1.6:1);
      // kinematic drive
      const maxV = this.loading ? (this.winch?1.3:2.35) : 11.18;
      c.steer += clamp(inp.steer - c.steer, -2.2 * dt, 2.2 * dt);
      if(inp.throttle&&inp.brake)c.v=Math.sign(c.v)*Math.max(0,Math.abs(c.v)-5*dt);
      else if (inp.throttle) c.v = Math.min(maxV, c.v + 2.0 * dt);
      else if (inp.brake) c.v = c.v > 0.05 ? Math.max(0, c.v - 5 * dt) : Math.max(-2.0, c.v - 1.6 * dt);
      else c.v *= Math.exp(-dt * 1.6);
      // gravity on the ramp: slight roll-back
      const prev = { ...c };
      c.th = wrapAngle(c.th + c.v / 2.8 * Math.tan(c.steer * 0.55) * dt);
      c.x += Math.cos(c.th) * c.v * dt; c.z += Math.sin(c.th) * c.v * dt;
      // The same coordinates cover the oval, graded exit and paddock; no teleport/clamp to a loading room.
      this.cool -= dt;
      const b=this.blocked(c,prev);
      if (b) {
        const sp = Math.abs(c.v);
        Object.assign(c,prev);c.v=-prev.v*.25;
        if(this.winch&&this.loading){this.winch=false;c.v=0;this.hud.sub.textContent='Winch paused at obstruction · reverse to back out, or R / Re-align';}
        if (this.cool <= 0 && sp > 0.35) { const d = 1 + sp * 2.6; this.dmg += d; this.hits++; this.cool = 0.6; this.shake = 0.5; this.flash(b==='front'?'BANG! Hit the cabinets':b==='trailer'?'SCRAPED THE TRAILER WALL':b==='trackwall'?'CONTACT — TRACK WALL':'CONTACT — PADDOCK OBJECT', '#ff5a4a'); }
      }
      // falling off the ramp edge
      const hs = this.wheelPts(c).map(w => this.height(w.x, w.z));
      if (Math.max(Math.abs(hs[0] - hs[1]), Math.abs(hs[2] - hs[3])) > 0.4 && c.x > -1 && c.x<5&&Math.abs(c.z)<2 && !this.falling) {
        this.falling = 1.0; this.dmg += 6; this.falls++; this.flash('OFF THE RAMP! +6% damage', '#ff5a4a'); this.shake = 1;
      }
      // goal: parked in the green box
      const inGoal = c.x < -10.4 && c.x > -12.9 && Math.abs(c.z) < 0.35 && Math.abs(wrapAngle(c.th - Math.PI)) < 0.12;
      if (inGoal && Math.abs(c.v) < 0.25) { this.hold += dt; this.hud.st.textContent = `HOLD IT… ${(1.2 - this.hold).toFixed(1)}`; } else this.hold = 0;
      this.goal.material.color.setHex(inGoal ? 0x40ff70 : 0xffc83d); this.goal.material.emissive.setHex(inGoal ? 0x20ff50 : 0xffa000);
      if (this.hold > 1.2) this.finish();
      this.wheelH = hs;
    }
    if (this.falling) {
      this.falling -= dt;
      if (this.falling <= 0) { this.falling = 0; Object.assign(this.c, { x: 13, z: 0, th: Math.PI, v: 0, steer: 0 }); this.flash('Crew pushed it back. Try again.', '#fff'); }
    }
    // pose the car on its four wheels
    const hs = this.wheelH || [0, 0, 0, 0];
    const hF = (hs[0] + hs[1]) / 2, hR = (hs[2] + hs[3]) / 2, hLft = (hs[0] + hs[2]) / 2, hRt = (hs[1] + hs[3]) / 2;
    const m = this.car;
    const y = (hF + hR) / 2 - (this.falling ? (1 - this.falling) * 0.6 : 0);
    m.position.set(c.x+this.offset.x, y, c.z+this.offset.z);
    m.rotation.y = -c.th;
    m.rotation.z = lerp(m.rotation.z, Math.atan2(hF - hR, 2.68), 1-Math.exp(-dt*26));
    m.rotation.x = lerp(m.rotation.x, -Math.atan2(hRt - hLft, 1.7) + (this.falling ? 0.25 * Math.sign(c.z || 1) * -1 : 0), 1-Math.exp(-dt*22));
    c.wr = (c.wr || 0) + c.v * dt / 0.42;
    m.userData.wheels.forEach((w, i) => { w.rotation.z = -c.wr; if (i < 2) w.rotation.y = -c.steer * 0.5; });
    if(!this.falling)seatWheels(m,(x,z)=>this.height(x-this.offset.x,z-this.offset.z));
    this.contact.update((x,z)=>this.height(x-this.offset.x,z-this.offset.z));
    // roof cutaway while inside so you can see
    const inside = c.x < 1.5; this.semi.userData.roof.visible = !inside || this.camMode === 2;
    this.crew.forEach((p, i) => { p.userData.arm.rotation.x = Math.sin(this.t * 4 + i) * 0.6 * (i ? 1 : -1) + (i ? -2.4 : 2.4); p.lookAt(c.x, 0, c.z); });
    this.pits.marker.visible=!this.loading&&Math.hypot(c.x,c.z)>18;this.race.key.position.set(m.position.x+30,90,m.position.z+40);this.race.key.target.position.copy(m.position);this.race.nightArt?.refreshShadow(dt);this.race.nightArt?.atmosphere.update(dt,false);
    this.updateCamera(dt);
    this.updateHud();
    if(this.done){this.secureT=(this.secureT||0)+dt;this.hud.msg.textContent=this.secureT<1.6?'TYING DOWN':'READY TO ROLL';rp.rotation.z=lerp(this.rampTarget,-Math.PI/2,clamp((this.secureT-1.6)/2,0,1));if(this.secureT>4){delete app.state.pitPose;UI.afterLoad(app,this.result);return;}}
    else if((this.saveT=(this.saveT||0)+dt)>2){this.saveT=0;app.state.pitPose={layout:2,routeVersion:3,round:app.state.round,c:{...c},session:{timer:this.timer,dmg:this.dmg,hits:this.hits,falls:this.falls,winch:this.winch,winchUsed:this.winchUsed,loading:this.loading,pathIndex:this.pathIndex,exitStarted:this.exitStarted}};app.save();}
    this.app.audio.paddock?.({dt,speed:c.v,throttle:this.done?0:this.audioThrottle||0,freeRev:this.audioFree||Math.abs(c.v)<1});
  }
  recoverWinch(){
    Object.assign(this.c,{x:13,z:0,th:Math.PI,v:0,steer:0,wr:0});this.winch=false;this.loading=true;this.exitStarted=true;this.pathIndex=this.pits.road.drive.length-1;this.falling=0;this.hold=0;this.autoProgress=null;
    this.wheelH=this.wheelPts(this.c).map(w=>this.height(w.x,w.z));
    if(this.hud)this.hud.sub.textContent='Crew re-aligned at ramp · drive or X / Winch to retry';
  }
  autopilot(dt=1/60) {
    const c=this.c,trk=this.race.trk;let tx,tz;const lot=Math.abs(c.x)<72&&c.z>-51&&c.z<39,path=this.pits.road.drive,localStart=lot&&!this.exitStarted;
    if(!this.exitStarted&&!lot){const q=trk.project(c.x+this.offset.x,c.z+this.offset.z),ds=(this.pits.gateS-q.s+trk.P)%trk.P;if(ds<38||this.pits.road.nearest(c.x+this.offset.x,c.z+this.offset.z).distance<6){this.exitStarted=true;this.pathIndex=path.reduce((best,p,i)=>Math.hypot(c.x-p.x,c.z-p.z)<Math.hypot(c.x-path[best].x,c.z-path[best].z)?i:best,0);this.pathIndex=Math.min(path.length-1,this.pathIndex+1);}else{const p=trk.point(q.s+16,0);tx=p.x-this.offset.x;tz=p.z-this.offset.z;}}
    if(tx===undefined&&!this.loading){this.exitStarted=true;if(localStart)this.pathIndex=path.length-2;
      // Reproject a resumed/off-route car FORWARD onto the current lane. Do not
      // orbit an obsolete waypoint behind a narrower gate or an old saved path.
      const closest=path.reduce((best,p,i)=>Math.hypot(c.x-p.x,c.z-p.z)<Math.hypot(c.x-path[best].x,c.z-path[best].z)?i:best,0);
      if(closest>this.pathIndex+2)this.pathIndex=Math.min(path.length-1,closest+1);
      let p=path[Math.min(this.pathIndex,path.length-1)];while(this.pathIndex<path.length-1){const prev=path[Math.max(0,this.pathIndex-1)],d=Math.hypot(c.x-p.x,c.z-p.z),nearGate=Math.hypot(c.x+this.offset.x-this.pits.gate.x,c.z+this.offset.z-this.pits.gate.z)<22,passed=(c.x-p.x)*(p.x-prev.x)+(c.z-p.z)*(p.z-prev.z)>0;if(!(d<(nearGate?2.2:5)||passed&&d<12))break;p=path[++this.pathIndex];}[tx,tz]=[p.x,p.z];}
    if(this.loading){
      // Align on the open pad BEFORE the nose enters the narrow trailer.
      if(c.x>5&&(Math.abs(c.z)>.025||Math.abs(wrapAngle(Math.PI-c.th))>.012)){
        const aligned={...c,z:c.z+clamp(-c.z,-.6*dt,.6*dt),th:c.th+clamp(wrapAngle(Math.PI-c.th),-.5*dt,.5*dt)};
        if(!this.blocked(aligned)){Object.assign(c,aligned);c.v=0;this.autoProgress={x:c.x,z:c.z,t:this.t};return{steer:0,throttle:0,brake:0};}
      }
      tx=c.x-4;tz=0;
    }
    const want=Math.atan2(tz-c.z,tx-c.x),steer=clamp(wrapAngle(want-c.th)*2.2,-1,1),stop=c.x< -11.4&&Math.abs(c.z)<.4;
    // Paid assist slows for heading corrections instead of pinning full throttle into a narrow exit.
    if(stop&&Math.abs(c.v)<.12)c.v=0;
    if(!this.autoProgress||Math.hypot(c.x-this.autoProgress.x,c.z-this.autoProgress.z)>1)this.autoProgress={x:c.x,z:c.z,t:this.t};
    if(!this.loading&&this.t-this.autoProgress.t>1.8){this.autoReverseUntil=this.t+1.3;this.autoProgress={x:c.x,z:c.z,t:this.t};}
    if(!this.loading&&this.t<(this.autoReverseUntil||0))return{steer:-steer,throttle:0,brake:1};
    if(this.loading&&this.t-this.autoProgress.t>3){this.winch=false;this.hud.sub.textContent='Winch paused — X release / R re-align';return{steer:0,throttle:0,brake:0};}
    const target=this.loading?1.3:clamp(8-Math.abs(wrapAngle(want-c.th))*6,3,8);
    return{steer,throttle:!stop&&c.v<target-.08?1:0,brake:stop?(c.v>.05?1:0):(c.v>target+.15?1:0)};
  }
  flash(t, col) { this.hud.msg.textContent = t; this.hud.msg.style.color = col; clearTimeout(this.ft); this.ft = setTimeout(() => { if (this.hud) this.hud.msg.textContent = ''; }, 1400); }
  updateCamera(dt) {
    const cam = this.camera, c = this.c, m = this.car;
    const sh = (this.shake || 0); this.shake = Math.max(0, sh - dt * 2);
    let want, look;
    if (this.intro > 0&&!this.towed) { const a = this.intro / 2.2; want = new THREE.Vector3(20 + a * 8, 5 + a * 4, 9 - a * 2); look = new THREE.Vector3(-2, 1.5, 0); }
    else if (this.camMode === 0) { want = new THREE.Vector3(c.x - Math.cos(c.th) * 7, m.position.y + 3.9, c.z - Math.sin(c.th) * 7); look = new THREE.Vector3(c.x + Math.cos(c.th) * 4, m.position.y + 0.8, c.z + Math.sin(c.th) * 4); }
    else if (this.camMode === 1) { want = new THREE.Vector3(-14.8, 3.6, 0); look = new THREE.Vector3(c.x, m.position.y + 0.6, c.z); }
    else { want = new THREE.Vector3(9, 2.2, 6.5); look = new THREE.Vector3(c.x, m.position.y + 0.8, c.z); }
    want.add(this.offset);look.add(this.offset);
    cam.position.lerp(want, 1 - Math.exp(-dt * (this.intro > 0 ? 3 : 5))); cam.position.x += (Math.random() - 0.5) * sh * 0.3; cam.position.y += (Math.random() - 0.5) * sh * 0.3;
    cam.lookAt(look);
  }
  updateHud() {
    const h=this.hud,c=this.c;if(!h)return;
    document.querySelector('#pit-speed').textContent=Math.round(Math.abs(c.v)*2.237);
    document.querySelector('#pit-stage').textContent=this.done?'Securing your car':this.loading?'Straight. Slow. Centered.':'Return to your hauler';
    document.querySelector('#pit-dist').textContent=`BAY ${this.app.state.num} · ${Math.round(Math.hypot(c.x,c.z))} m`;
    const mg=document.querySelector('#pit-map').getContext('2d'),trk=this.race.trk,pts=this.pits.road.samples,all=[...pts,{x:this.offset.x-75,z:-46},{x:this.offset.x+75,z:42}];for(let i=0;i<60;i++)all.push(trk.point(i/60*trk.P,0));const minX=Math.min(...all.map(p=>p.x)),maxX=Math.max(...all.map(p=>p.x)),minZ=Math.min(...all.map(p=>p.z)),maxZ=Math.max(...all.map(p=>p.z)),scale=Math.min(200/(maxX-minX),130/(maxZ-minZ)),project=(x,z)=>[10+(x-minX)*scale,10+(z-minZ)*scale];mg.fillStyle='#142027';mg.fillRect(0,0,220,150);mg.strokeStyle='#73838a';mg.lineWidth=2;mg.beginPath();for(let i=0;i<=80;i++){const p=trk.point(i/80*trk.P,0),a=project(p.x,p.z);i?mg.lineTo(...a):mg.moveTo(...a);}mg.stroke();mg.strokeStyle='#d2f77f';mg.beginPath();pts.forEach((p,i)=>{const a=project(p.x,p.z);i?mg.lineTo(...a):mg.moveTo(...a);});mg.stroke();const bay=project(this.offset.x,this.offset.z),player=project(c.x+this.offset.x,c.z+this.offset.z);mg.fillStyle='#d2f77f';mg.fillRect(bay[0]-3,bay[1]-2,6,4);mg.fillStyle='#fff';mg.beginPath();mg.arc(...player,3,0,7);mg.fill();

    if(this.towMessage>0){document.querySelector('#pit-stage').textContent='Recovered to Bay '+this.app.state.num;h.st.textContent='DNF · Crew delivered your car. Line up with the ramp or call the winch.';h.st.setAttribute('role','status');}
    h.t.textContent = this.timer.toFixed(1); h.t.style.color = this.timer > this.par ? '#ff5a4a' : '#fff';
    h.d.textContent = this.dmg.toFixed(0) + '%';
    const g = h.al; g.clearRect(0, 0, 200, 60); g.fillStyle = '#2a1a10'; g.fillRect(10, 22, 180, 16);
    g.fillStyle = '#5fd16a'; g.fillRect(100 - 0.35 * 60, 22, 0.7 * 60, 16);
    const off = clamp(c.z, -1.5, 1.5), ang = wrapAngle(c.th - Math.PI);
    g.save(); g.translate(100 + off * 60, 30); g.rotate(ang); g.fillStyle = '#ffc83d'; g.fillRect(-14, -6, 28, 12); g.fillStyle = '#000'; g.fillRect(-14, -2, 6, 4); g.restore();
    if(this.towMessage>0)return;
    if(Math.abs(c.x)>72||c.z< -51||c.z>39){const wx=c.x+this.offset.x,wz=c.z+this.offset.z,road=this.pits.road.nearest(wx,wz),gate=Math.hypot(wx-this.pits.gate.x,wz-this.pits.gate.z);h.st.textContent=gate<28?'Narrow gate · 25 mph · follow the marked lane':road.distance>10?'Off lane — follow green mini-map route · 25 mph':'Follow the loop road to Bay '+this.app.state.num+' · 25 mph';return;}
    if(!this.loading){h.st.textContent='Your blue / white hauler is in Bay '+this.app.state.num+'. Approach the striped ramp.';return;}
    if (this.hold <= 0 && !this.done) h.st.textContent = c.x > 0.5 ? (Math.abs(c.z) < 0.4 && Math.abs(ang) < 0.1 ? 'lined up — go!' : Math.abs(c.z)>.4?`ramp to your ${c.z>0?'RIGHT':'LEFT'} — ease over`:'straighten the car before climbing') : 'ease forward to the green box';
  }
  finish() {
    this.done = true; this.hud.st.textContent = 'PARKED'; this.c.v = 0;
    const t = this.timer, over = Math.max(0, t - this.par);
    const cost = Math.round(over * 15) + (this.winchUsed ? 300 : 0);
    const bonus = this.winchUsed ? 0 : clamp((this.par - t) / this.par, 0, 1) * (this.dmg ? 0.5 : 1.2);
    const r = { round:this.app.state.round,time: t, dmg: this.dmg, cost, bonusHours: +bonus.toFixed(2), hits: this.hits, falls: this.falls, winch: this.winchUsed };
    this.result = r;
    this.semi.userData.rampPivot.rotation.z = this.rampTarget;
    this.hud.msg.textContent='TYING DOWN';this.hud.sub.textContent='Crew securing the car. Ramp closing…';
  }
  dispose() { clearTimeout(this.ft); this.hud = null; this.race.dispose(); }
}
