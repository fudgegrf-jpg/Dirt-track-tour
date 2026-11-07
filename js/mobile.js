// Pointer Events keep every finger independent: steering never releases a pedal.
export const isTouchDevice = () => navigator.maxTouchPoints > 0 || matchMedia('(pointer:coarse)').matches;
const clamp = x => Math.max(-1, Math.min(1, x));
export class MobileControls {
  constructor(app) {
    this.app=app;this.enabled=app.isMobile;this.gas=new Set();this.brake=new Set();this.left=new Set();this.right=new Set();this.steer=0;this.steerPointer=null;this.tilt=false;this.tiltValue=0;this.neutral=null;
    document.body.classList.toggle('mobile',this.enabled);
    this.root=document.createElement('div');this.root.id='mobile-ui';
    const icon=(paths)=>`<svg viewBox="0 0 24 24" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">${paths}</svg>`;
    const icons={camera:icon('<path d="M3 7h5l2-3h4l2 3h5v13H3Z"/><circle cx="12" cy="13" r="4"/>'),pause:icon('<path d="M8 5v14M16 5v14"/>'),settings:icon('<path d="M3 6h18M3 12h18M3 18h18"/><circle cx="8" cy="6" r="2"/><circle cx="16" cy="12" r="2"/><circle cx="10" cy="18" r="2"/>'),fullscreen:icon('<path d="M3 9V3h6M15 3h6v6M21 15v6h-6M9 21H3v-6"/>'),tilt:icon('<rect x="7" y="3" width="10" height="18" rx="2"/><path d="m2 9 2-2 2 2m12 6 2 2 2-2"/>'),clear:icon('<path d="M3 17 10 5h4l7 12ZM5 15l12-5"/>'),reset:icon('<path d="M5 9a8 8 0 1 1-1 7M3 3v6h6"/>'),cruise:icon('<path d="M3 19a9 9 0 1 1 18 0M12 15l5-7M6 11l1 1M12 6v2"/>'),jake:icon('<path d="M4 6h13v12H4Zm13 4h4v6h-4M8 9v6M12 9v6"/>'),exit:icon('<path d="M4 21V3h7M9 21V11h12m-5-5 5 5-5 5"/>'),travel:icon('<path d="m14 2-9 12h6l-1 8 9-12h-6Z"/>'),horn:icon('<path d="m4 10 13-5v14L4 14Zm0 0v4M20 9v6"/>'),winch:icon('<path d="M3 8h18v10H3Zm6 0V4h6v4M12 11v7l4 3"/>')};
    const button=(id,label,attr='data-driving')=>`<button id="touch-${id}" ${attr} title="${label}" aria-label="${label}">${icons[id]}<span>${label}</span></button>`;
    this.root.innerHTML=`<div class="mobile-tools" aria-label="Game controls">
      <div class="touch-primary">${button('pause','Pause')}${button('camera','Camera')}${button('settings','Settings')}${button('fullscreen','Fullscreen','')}</div>
      <div class="touch-center">${button('cruise','Cruise','data-phase="highway" aria-pressed="false"')}${button('jake','Jake','data-phase="highway" aria-pressed="true"')}${button('horn','Horn','data-phase="highway"')}${button('winch','Winch $300','data-phase="load"')}</div>
      <div class="touch-side-left">${button('tilt','Tilt','data-driving aria-pressed="false"')}${button('clear','Clear','data-phase="race"')}</div>
      <div class="touch-side-right">${button('reset','Reset','data-phase="race"')}${button('travel','Travel','data-phase="highway"')}${button('exit','Exit','data-phase="highway"')}</div>
    </div><div class="touch-telemetry" hidden><canvas id="touch-map" width="228" height="136" aria-label="Live track mini-map with every car"></canvas><div class="touch-pills"><div class="touch-pill"><span class="touch-timer-icon">◷</span><b id="touch-time">00:00.00</b></div><div class="touch-pill touch-cash"><span>$</span><b id="touch-cash">15,000</b></div><div class="touch-status" id="touch-status">LAP 1 · P 1</div><div class="touch-condition" id="touch-condition"></div><div class="touch-road-prompt" id="touch-road-prompt"></div></div></div>
    <div id="touch-driving">
      <div id="touch-steer" role="slider" aria-label="Steering wheel: drag or rotate" aria-valuemin="-100" aria-valuemax="100" aria-valuenow="0"><svg class="touch-wheel" viewBox="0 0 140 140" aria-hidden="true"><defs><linearGradient id="wheel-metal" x2="0" y2="1"><stop stop-color="#d9e0e3"/><stop offset="1" stop-color="#737d85"/></linearGradient></defs><circle cx="70" cy="70" r="54" fill="none" stroke="#101820b8" stroke-width="19"/><circle cx="70" cy="70" r="54" fill="none" stroke="#d9e0e3a6" stroke-width="11"/><path d="m25 49 35 12h20l35-12-2 14-29 15-7 40H63l-7-40-29-15Z" fill="url(#wheel-metal)" stroke="#263540" stroke-width="2"/><circle cx="70" cy="70" r="22" fill="#263540d9" stroke="#dbe2e6a6" stroke-width="3"/><text x="70" y="76" text-anchor="middle" fill="#fff" font-family="sans-serif" font-size="15" font-weight="800">42</text><path d="M70 12v11" stroke="#efbc70" stroke-width="5"/></svg><span class="wheel-caption">STEER</span></div>
      <div id="touch-arrows"><button id="touch-left" aria-label="Hold steer left">◀</button><button id="touch-right" aria-label="Hold steer right">▶</button></div>
      <div class="touch-pedals"><button id="touch-brake" aria-label="Hold brake, or reverse when stopped"><span>BRAKE</span><small>REVERSE</small></button><button id="touch-gas" aria-label="Hold throttle"><span>GAS</span></button></div>
    </div><div id="rotate-phone" role="status"><div class="rotate-card"><div class="rotate-icon">↻</div><h2>Rotate to landscape</h2><p>Turn your phone sideways to drive.<br>The game waits while you rotate.</p></div></div>`;
    document.body.append(this.root);this.steerEl=this.root.querySelector('#touch-steer');
    const $=id=>this.root.querySelector('#touch-'+id);
    const action=(id,f)=>$(id).addEventListener('click',f);
    const key=(id,code)=>action(id,()=>{this.app.pressed.add(code);});
    key('camera','KeyC');key('clear','KeyT');key('reset','KeyR');key('cruise','KeyQ');key('jake','KeyJ');key('winch','KeyX');key('horn','KeyB');
    action('settings',()=>this.app.openSettings());action('travel',()=>this.app.mode?.openFastTravel?.());
    action('pause',()=>{this.app.togglePause();this.sync();});
    action('exit',()=>{const m=app.mode;if(m?.fuelAutopilot||m?.exits?.some(e=>m.t.S>e.S-200&&m.t.S<e.S+40))app.pressed.add('KeyE');else app.toast('Tap Exit near a truck-stop sign; keep right and slow down.');});
    action('tilt',()=>this.toggleTilt());action('fullscreen',()=>this.fullscreen());
    const hold=(el,set)=>{
      el.addEventListener('pointerdown',e=>{if(!this.driving)return;e.preventDefault();set.add(e.pointerId);el.setPointerCapture(e.pointerId);el.classList.add('held');});
      const up=e=>{set.delete(e.pointerId);el.classList.toggle('held',set.size>0);};
      for(const name of ['pointerup','pointercancel','lostpointercapture'])el.addEventListener(name,up);
    };
    hold($('gas'),this.gas);hold($('brake'),this.brake);hold($('left'),this.left);hold($('right'),this.right);
    const dead=x=>Math.abs(x)<.07?0:Math.sign(x)*(Math.abs(x)-.07)/.93;
    this.steerEl.addEventListener('pointerdown',e=>{if(!this.driving||this.steerPointer!==null)return;e.preventDefault();const r=this.steerEl.getBoundingClientRect(),x=e.clientX-r.left-r.width/2,y=e.clientY-r.top-r.height/2;this.steerPointer=e.pointerId;this.steerEl.setPointerCapture(e.pointerId);this.steerAngle=Math.atan2(y,x);this.steerX=e.clientX;this.linearDrag=Math.hypot(x,y)<r.width*.18;this.rawSteer=0;this.steer=dead(this.rawSteer);this.paintSteer();});
    this.steerEl.addEventListener('pointermove',e=>{if(e.pointerId!==this.steerPointer)return;e.preventDefault();const r=this.steerEl.getBoundingClientRect(),angle=Math.atan2(e.clientY-r.top-r.height/2,e.clientX-r.left-r.width/2);let delta=angle-this.steerAngle;if(delta>Math.PI)delta-=Math.PI*2;if(delta< -Math.PI)delta+=Math.PI*2;this.rawSteer=clamp(this.rawSteer+(this.linearDrag?(e.clientX-this.steerX)/(r.width*.42):delta/1.92));this.steerAngle=angle;this.steerX=e.clientX;this.steer=dead(this.rawSteer);this.paintSteer();});
    const release=e=>{if(e.pointerId===this.steerPointer){this.steerPointer=null;this.steer=0;this.paintSteer();}};
    for(const name of ['pointerup','pointercancel','lostpointercapture'])this.steerEl.addEventListener(name,release);
    addEventListener('blur',()=>this.reset());
    document.addEventListener('visibilitychange',()=>{if(document.hidden){this.reset();this.app.audio.stop();}});
    addEventListener('orientationchange',()=>{this.reset();this.neutral=null;this.sync();});
    document.addEventListener('contextmenu',e=>e.preventDefault());
    document.addEventListener('gesturestart',e=>e.preventDefault(),{passive:false});
    document.addEventListener('gesturechange',e=>e.preventDefault(),{passive:false});
    // A trusted user gesture is required by Safari; retry after interrupted contexts.
    const unlock=()=>this.app.audio.unlockMusic();
    document.addEventListener('pointerdown',unlock,{capture:true,passive:true});
    document.addEventListener('touchstart',unlock,{capture:true,passive:true});
    this.orientation=e=>{
      if(!this.tilt||!Number.isFinite(e.beta)||!Number.isFinite(e.gamma))return;
      const a=(screen.orientation?.angle??window.orientation??0)*Math.PI/180;
      const raw=e.gamma*Math.cos(a)+e.beta*Math.sin(a);
      if(this.neutral===null)this.neutral=raw;
      this.tiltValue+=(clamp((raw-this.neutral)/22)-this.tiltValue)*.3;
      if(this.steerPointer===null)this.paintSteer();
    };
    this.sync();
  }
  paintSteer(){const value=this.steerPointer!==null?this.steer:this.tilt?this.tiltValue:0;this.steerEl.style.setProperty('--steer',String(value));this.steerEl.setAttribute('aria-valuenow',Math.round(value*100));this.steerEl.classList.toggle('steering-active',this.steerPointer!==null);}
  reset(){this.gas.clear();this.brake.clear();this.left.clear();this.right.clear();this.steerPointer=null;this.steer=0;this.tiltValue=0;this.neutral=null;this.root.querySelectorAll('.held').forEach(e=>e.classList.remove('held'));this.paintSteer();}
  apply(inp){if(!this.driving)return;if(this.left.size||this.right.size)inp.steer=Number(!!this.right.size)-Number(!!this.left.size);else if(this.steerPointer!==null)inp.steer=this.steer;else if(this.tilt)inp.steer=this.tiltValue;inp.throttle=Math.max(inp.throttle,this.gas.size?1:0);inp.brake=Math.max(inp.brake,this.brake.size?1:0);}
  sync(){
    const a=this.app,phase=a.phase;const portrait=this.enabled&&innerHeight>innerWidth;
    if(portrait&&!this.portrait){this.reset();a.audio.stop();}this.portrait=portrait;
    const driving=this.enabled&&!portrait&&!a.paused&&!document.hidden&&!a.mode?.done&&!a.mode?.ended&&!a.mode?.menu&&['race','load','highway'].includes(phase);
    if(this.driving&&!driving)this.reset();this.driving=driving;
    document.body.classList.toggle('touch-driving',driving);
    this.root.querySelector('#rotate-phone').hidden=!portrait;
    this.root.querySelector('#touch-driving').hidden=!driving;this.root.querySelector('.touch-telemetry').hidden=!driving;this.root.dataset.steering=a.settings.touchSteering==='arrows'?'arrows':'wheel';this.updateHud();
    for(const el of this.root.querySelectorAll('[data-driving]'))el.hidden=!driving;
    for(const el of this.root.querySelectorAll('[data-phase]'))el.hidden=!driving||el.dataset.phase!==phase;
    const reset=this.root.querySelector('#touch-reset');if(phase==='load'){reset.hidden=!driving;reset.querySelector('span').textContent='Re-align';reset.setAttribute('aria-label','Re-align at trailer ramp');}else{reset.querySelector('span').textContent='Reset';reset.setAttribute('aria-label','Reset');}
    const winch=this.root.querySelector('#touch-winch');winch.setAttribute('aria-pressed',String(!!a.mode?.winch));winch.querySelector('span').textContent=a.mode?.winch?'Release':'Winch $300';
    this.root.querySelector('#touch-jake').setAttribute('aria-pressed',String(a.mode?.jakeEnabled!==false));
    this.root.querySelector('#touch-cruise').setAttribute('aria-pressed',String(!!(phase==='highway'&&a.mode?.t?.cruise)));
    this.root.querySelector('#touch-travel').disabled=!!document.querySelector('#highway-fasttravel')?.disabled;
    this.root.querySelector('#touch-exit').classList.toggle('available',phase==='highway'&&!!a.mode?.exits?.some(e=>a.mode.t.S>e.S-200&&a.mode.t.S<e.S+40));
  }
  updateHud(force=false){
    if(!this.driving)return;const now=performance.now();if(!force&&this.hudTime&&now-this.hudTime<90)return;this.hudTime=now;
    const a=this.app,m=a.mode,$=id=>this.root.querySelector('#touch-'+id),race=a.phase==='race',highway=a.phase==='highway',seconds=m.time||0;
    $('time').textContent=highway?m.clockStr():`${String(Math.floor(seconds/60)).padStart(2,'0')}:${(seconds%60).toFixed(2).padStart(5,'0')}`;
    $('cash').textContent=Math.round(a.state?.money||0).toLocaleString('en-US');this.root.querySelector('.touch-wheel text').textContent=String(a.state?.num||'42');
    $('status').textContent=race?`LAP ${Math.min(m.T.laps,Math.max(1,m.player.lap))}/${m.T.laps} · P ${Math.max(1,(m.order||m.cars).indexOf(m.player)+1)}/${m.cars.length} · ${Math.round((m.player.speed||0)*2.237)} MPH`:highway?`${Math.round(Math.abs(m.t.v)*2.237)} MPH · DIESEL ${Math.round(m.fuel*100)}% · ${Math.max(0,Math.round((m.Lg-m.t.S)*m.mpm))} MI`:'PADDOCK · ALIGN WITH BAY 42';
    $('condition').textContent=race?`DAMAGE ${Math.round(m.player.damage)}% · TIRES ${Math.round((m.player.tire??1)*100)}% · TEARS ${m.tearOffs}`:highway?`RIG ${Math.round(a.state.haulerDmg)}% · FATIGUE ${Math.round(m.fatigue*100)}% · ${Math.max(0,m.deadline-m.hours).toFixed(1)}H LEFT`:'HOLD BRAKE TO STOP, THEN REVERSE';
    $('road-prompt').textContent=highway?(m.filling?'FUELING · LEAVE BAY TO STOP':m.fuelAutopilot?'EXIT ASSIST · STEER OR BRAKE TO CANCEL':m.exits.some(e=>m.t.S>e.S-220&&m.t.S<e.S+300)?'TRUCK STOP · KEEP RIGHT · TAP EXIT':m.fuel<.12?'LOW DIESEL · TAKE NEXT EXIT':''):'';
    const canvas=$('map'),c=canvas.getContext('2d'),w=canvas.width,h=canvas.height;c.clearRect(0,0,w,h);c.lineCap='round';
    if(race){if(this.mapMode!==m){this.mapMode=m;const pts=Array.from({length:100},(_,i)=>m.trk.point(i/100*m.trk.P,0)),xs=pts.map(p=>p.x),zs=pts.map(p=>p.z),minX=Math.min(...xs),minZ=Math.min(...zs),dx=Math.max(...xs)-minX,dz=Math.max(...zs)-minZ,k=Math.min((w-32)/dx,(h-28)/dz);this.mapProject=p=>({x:16+(p.x-minX)*k+(w-32-dx*k)/2,y:14+(p.z-minZ)*k+(h-28-dz*k)/2});this.mapPoints=pts.map(this.mapProject);this.mapWidth=Math.max(9,m.T.W*k);}
      c.beginPath();this.mapPoints.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();c.strokeStyle='#b5cad32b';c.lineWidth=this.mapWidth+4;c.stroke();c.strokeStyle='#101d2be6';c.lineWidth=this.mapWidth;c.stroke();c.strokeStyle='#dae8ec88';c.lineWidth=1;c.stroke();for(const car of [...m.cars.filter(x=>!x.player),m.player]){const p=this.mapProject(car);c.beginPath();c.arc(p.x,p.y,car.player?5:3,0,Math.PI*2);c.fillStyle=car.player?'#ffd18b':car.dnf?'#a7a8a9':'#e0f5ff';c.fill();if(car.player){c.strokeStyle='#111c28';c.lineWidth=2;c.stroke();}}this.mapCarCount=m.cars.length;
    }else if(highway){c.lineWidth=25;c.strokeStyle='#ccd9e938';c.beginPath();c.moveTo(110,h+10);c.bezierCurveTo(155,65,70,50,125,-10);c.stroke();c.lineWidth=2;c.setLineDash([7,7]);c.strokeStyle='#e1eff9aa';c.stroke();c.setLineDash([]);for(const t of m.traffic){const rel=t.S-m.t.S;if(Math.abs(rel)>200)continue;c.fillStyle=t.oncoming?'#ffb5a7':'#d0e6ff';c.fillRect(110+(t.lat-m.t.lat)*1.4,90-rel*.4,5,8);}c.fillStyle='#ffd18b';c.beginPath();c.moveTo(116,80);c.lineTo(109,94);c.lineTo(123,94);c.closePath();c.fill();}
    else{c.fillStyle='#cbdbe6';c.font='bold 20px sans-serif';c.fillText('BAY 42',72,74);}
  }
  async toggleTilt(){
    if(this.tilt){this.tilt=false;this.reset();}
    else{
      if(!window.DeviceOrientationEvent){this.app.toast('Tilt is unavailable here. Use the steering wheel.');return;}
      try{
        if(typeof DeviceOrientationEvent.requestPermission==='function'&&await DeviceOrientationEvent.requestPermission()!=='granted'){this.app.toast('Tilt permission denied. Touch steering still works.');return;}
        this.neutral=null;this.tiltValue=0;this.tilt=true;
        addEventListener('deviceorientation',this.orientation);
        this.app.toast('Tilt on: hold level to calibrate, then gently tilt left/right. Tap Touch to turn off.');
      }catch{this.app.toast('Tilt needs HTTPS and motion permission. Touch steering still works.');return;}
    }
    const b=this.root.querySelector('#touch-tilt');b.querySelector('span').textContent=this.tilt?'Touch':'Tilt';b.setAttribute('aria-pressed',String(this.tilt));this.paintSteer();
  }
  async fullscreen(){
    try{
      if(document.fullscreenElement||document.webkitFullscreenElement){await(document.exitFullscreen?.()??document.webkitExitFullscreen?.());return;}
      const el=document.documentElement,request=el.requestFullscreen||el.webkitRequestFullscreen;
      if(!request){this.app.toast('iPhone: Share → Add to Home Screen for fullscreen.');return;}
      await request.call(el);
      if(this.enabled)screen.orientation?.lock?.('landscape').catch(()=>{});
    }catch{this.app.toast('Fullscreen unavailable. On iPhone use Share → Add to Home Screen.');}
  }
}
