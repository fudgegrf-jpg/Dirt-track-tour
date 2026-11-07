// Pointer Events keep every finger independent: steering never releases a pedal.
export const isTouchDevice = () => navigator.maxTouchPoints > 0 || matchMedia('(pointer:coarse)').matches;
const clamp = x => Math.max(-1, Math.min(1, x));
export class MobileControls {
  constructor(app) {
    this.app=app;this.enabled=app.isMobile;this.gas=new Set();this.brake=new Set();this.steer=0;this.steerPointer=null;this.tilt=false;this.tiltValue=0;this.neutral=null;
    document.body.classList.toggle('mobile',this.enabled);
    this.root=document.createElement('div');this.root.id='mobile-ui';
    this.root.innerHTML=`<div class="mobile-tools" aria-label="Game controls">
      <button id="touch-camera" data-driving title="Change camera" aria-label="Change camera">Cam</button>
      <button id="touch-pause" data-driving title="Pause" aria-label="Pause game">Pause</button>
      <button id="touch-tilt" data-driving aria-pressed="false" title="Enable tilt steering; hold phone comfortably to calibrate">Tilt</button>
      <button id="touch-clear" data-phase="race" title="Clear muddy windshield">Clear</button>
      <button id="touch-reset" data-phase="race" title="Recover car to the track">Reset</button>
      <button id="touch-cruise" data-phase="highway" aria-pressed="false" title="Toggle cruise control">Cruise</button>
      <button id="touch-jake" data-phase="highway" aria-pressed="true" title="Toggle engine brake">Jake</button>
      <button id="touch-exit" data-phase="highway" title="Take a signed truck-stop exit: keep right and slow down">Exit</button>
      <button id="touch-winch" data-phase="load" title="Crew winch costs $300 of in-game money">Winch $300</button>
      <button id="touch-fullscreen" title="Toggle fullscreen" aria-label="Toggle fullscreen">⛶</button>
    </div><div id="touch-driving">
      <div id="touch-steer" role="slider" aria-label="Steering" aria-valuemin="-100" aria-valuemax="100" aria-valuenow="0"><span>◀ &nbsp; STEER &nbsp; ▶</span><div class="steer-track"><i></i></div></div>
      <div class="touch-pedals"><button id="touch-brake" aria-label="Hold brake, or reverse when stopped">BRAKE<br><small>/ reverse</small></button><button id="touch-gas" aria-label="Hold throttle">GAS</button></div>
    </div><div id="rotate-phone" role="status"><div class="rotate-card"><div class="rotate-icon">↻</div><h2>Rotate to landscape</h2><p>Turn your phone sideways to drive.<br>The game waits while you rotate.</p></div></div>`;
    document.body.append(this.root);this.steerEl=this.root.querySelector('#touch-steer');
    const $=id=>this.root.querySelector('#touch-'+id);
    const action=(id,f)=>$(id).addEventListener('click',f);
    const key=(id,code)=>action(id,()=>{this.app.pressed.add(code);});
    key('camera','KeyC');key('clear','KeyT');key('reset','KeyR');key('cruise','KeyQ');key('jake','KeyJ');key('winch','KeyX');
    action('pause',()=>{this.app.togglePause();this.sync();});
    action('exit',()=>{const m=app.mode;if(m?.fuelAutopilot||m?.exits?.some(e=>m.t.S>e.S-200&&m.t.S<e.S+40))app.pressed.add('KeyE');else app.toast('Tap Exit near a truck-stop sign; keep right and slow down.');});
    action('tilt',()=>this.toggleTilt());action('fullscreen',()=>this.fullscreen());
    const hold=(el,set)=>{
      el.addEventListener('pointerdown',e=>{if(!this.driving)return;e.preventDefault();set.add(e.pointerId);el.setPointerCapture(e.pointerId);el.classList.add('held');});
      const up=e=>{set.delete(e.pointerId);el.classList.toggle('held',set.size>0);};
      for(const name of ['pointerup','pointercancel','lostpointercapture'])el.addEventListener(name,up);
    };
    hold($('gas'),this.gas);hold($('brake'),this.brake);
    const slide=e=>{const r=this.steerEl.getBoundingClientRect();this.steer=clamp((e.clientX-r.left-r.width/2)/(r.width*.42));this.paintSteer();};
    this.steerEl.addEventListener('pointerdown',e=>{if(!this.driving||this.steerPointer!==null)return;e.preventDefault();this.steerPointer=e.pointerId;this.steerEl.setPointerCapture(e.pointerId);slide(e);});
    this.steerEl.addEventListener('pointermove',e=>{if(e.pointerId===this.steerPointer){e.preventDefault();slide(e);}});
    const release=e=>{if(e.pointerId===this.steerPointer){this.steerPointer=null;this.steer=0;this.paintSteer();}};
    for(const name of ['pointerup','pointercancel','lostpointercapture'])this.steerEl.addEventListener(name,release);
    addEventListener('blur',()=>this.reset());
    document.addEventListener('visibilitychange',()=>{if(document.hidden){this.reset();this.app.audio.stop();}});
    addEventListener('orientationchange',()=>{this.reset();this.neutral=null;this.sync();});
    document.addEventListener('contextmenu',e=>e.preventDefault());
    document.addEventListener('gesturestart',e=>e.preventDefault(),{passive:false});
    document.addEventListener('gesturechange',e=>e.preventDefault(),{passive:false});
    // A trusted user gesture is required by Safari; retry after interrupted contexts.
    const unlock=()=>{if(this.app.audio.ensure())this.app.audio.ctx.resume()?.catch(()=>{});};
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
  paintSteer(){const value=this.steerPointer!==null?this.steer:this.tilt?this.tiltValue:0;this.steerEl.style.setProperty('--steer',String(value));this.steerEl.setAttribute('aria-valuenow',Math.round(value*100));}
  reset(){this.gas.clear();this.brake.clear();this.steerPointer=null;this.steer=0;this.tiltValue=0;this.neutral=null;this.root.querySelectorAll('.held').forEach(e=>e.classList.remove('held'));this.paintSteer();}
  apply(inp){if(!this.driving)return;if(this.steerPointer!==null)inp.steer=this.steer;else if(this.tilt)inp.steer=this.tiltValue;inp.throttle=Math.max(inp.throttle,this.gas.size?1:0);inp.brake=Math.max(inp.brake,this.brake.size?1:0);}
  sync(){
    const a=this.app,phase=a.phase;const portrait=this.enabled&&innerHeight>innerWidth;
    if(portrait&&!this.portrait){this.reset();a.audio.stop();}this.portrait=portrait;
    const driving=this.enabled&&!portrait&&!a.paused&&!document.hidden&&!a.mode?.done&&!a.mode?.ended&&!a.mode?.menu&&['race','load','highway'].includes(phase);
    if(this.driving&&!driving)this.reset();this.driving=driving;
    document.body.classList.toggle('touch-driving',driving);
    this.root.querySelector('#rotate-phone').hidden=!portrait;
    this.root.querySelector('#touch-driving').hidden=!driving;
    for(const el of this.root.querySelectorAll('[data-driving]'))el.hidden=!driving;
    for(const el of this.root.querySelectorAll('[data-phase]'))el.hidden=!driving||el.dataset.phase!==phase;
    this.root.querySelector('#touch-jake').setAttribute('aria-pressed',String(a.mode?.jakeEnabled!==false));
    this.root.querySelector('#touch-cruise').setAttribute('aria-pressed',String(!!(phase==='highway'&&a.mode?.t?.cruise)));
    this.root.querySelector('#touch-exit').classList.toggle('available',phase==='highway'&&!!a.mode?.exits?.some(e=>a.mode.t.S>e.S-200&&a.mode.t.S<e.S+40));
  }
  async toggleTilt(){
    if(this.tilt){this.tilt=false;this.reset();}
    else{
      if(!window.DeviceOrientationEvent){this.app.toast('Tilt is unavailable here. Use the steering bar.');return;}
      try{
        if(typeof DeviceOrientationEvent.requestPermission==='function'&&await DeviceOrientationEvent.requestPermission()!=='granted'){this.app.toast('Tilt permission denied. Touch steering still works.');return;}
        this.neutral=null;this.tiltValue=0;this.tilt=true;
        addEventListener('deviceorientation',this.orientation);
        this.app.toast('Tilt on: hold level to calibrate, then gently tilt left/right. Tap Touch to turn off.');
      }catch{this.app.toast('Tilt needs HTTPS and motion permission. Touch steering still works.');return;}
    }
    const b=this.root.querySelector('#touch-tilt');b.textContent=this.tilt?'Touch':'Tilt';b.setAttribute('aria-pressed',String(this.tilt));this.paintSteer();
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
