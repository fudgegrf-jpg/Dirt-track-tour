import {PLAYER_ID,DRIVER_IDENTITY_VERSION} from './driver-identity.js';
import {storage} from './storage.js';
import {migrateSeasonSave,SEASON_TRACK_VERSION} from './season.js';
import {GraphicsFinishPass} from './gfx2-post.js';
import {upgradeScanMaterials} from './gfx2-materials.js';
import { MobileControls, isTouchDevice } from './mobile.js';
import {QUALITY,qualityPreset,resolveQuality} from './quality.js';
import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { DEFAULT_DRIVER, DEFAULT_PROFILE, migrateDefaultLivery, TRACKS, ROUTES, AI_DRIVERS, CREW_POOL } from './data.js';
import { RaceScene } from './race.js';
import { LoadScene } from './load.js';
import { HighwayScene } from './highway.js';
import { ShowroomScene } from './showroom.js';
import * as UI from './ui.js';
import { GameAudio } from './audio.js';
import { loadCarFonts } from './models.js';

const SAVE_KEY = 'dirtTrackTour.v1';

class App {
  constructor() {
    this.isMobile = isTouchDevice();
    this.canvas = document.getElementById('gl');
    this.renderer = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: true, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping; this.renderer.toneMappingExposure = 1.0;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.shadowMap.enabled = true; this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.composer = new EffectComposer(this.renderer,new THREE.WebGLRenderTarget(1,1,{type:THREE.HalfFloatType,depthTexture:new THREE.DepthTexture(1,1)}));
    this.graphicsFinish=new GraphicsFinishPass();
    this.renderPass = new RenderPass(new THREE.Scene(), new THREE.PerspectiveCamera());
    this.bloom = new UnrealBloomPass(new THREE.Vector2(512, 512), 0.1, 0.25, 3.0);
    this.composer.addPass(this.renderPass);this.composer.addPass(this.graphicsFinish); this.bloom.enabled=false; this.composer.addPass(this.bloom); this.composer.addPass(new OutputPass());
    this.qualityChoice=storage.getItem('dtt.quality')||'auto';if(!QUALITY[this.qualityChoice]&&this.qualityChoice!=='auto')this.qualityChoice='auto';this.quality=resolveQuality(this.qualityChoice,this.isMobile);
    this.ui = document.getElementById('ui');
    this.keys = new Set(); this.padKeys = new Set(); this.pressed = new Set();
    addEventListener('keydown', e => { if (['ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Space'].includes(e.code) && !['INPUT','TEXTAREA','SELECT'].includes(e.target.tagName)) e.preventDefault(); if (!this.keys.has(e.code)) this.pressed.add(e.code); this.keys.add(e.code); });
    addEventListener('keyup', e => this.keys.delete(e.code));
    addEventListener('blur', () => this.keys.clear());
    addEventListener('resize', () => this.resize());
    this.mode = null; this.last = performance.now(); this.paused = false; this.manual = false;
    this.settings = Object.assign({ shake: 1, volume: 0.8, crowd: 1, cam: 'chase', assist: 'high', diff: 'normal', autoPace: true,musicVolume:.35,musicMuted:false,touchSteering:'wheel' }, (() => { try { return JSON.parse(storage.getItem('dtt.settings')) || {}; } catch (e) { return {}; } })());
    // One-time migration: existing saves receive the safer new default too.
    // Subsequent explicit Off/Low/Medium/High/Max choices are respected.
    if(this.settings.assistVersion!==2){this.settings.assist='high';this.settings.assistVersion=2;storage.setItem('dtt.settings',JSON.stringify(this.settings));}
    if(!['off','low','med','high','max'].includes(this.settings.assist))this.settings.assist='high';
    this.audio = new GameAudio(this);
    addEventListener('pointerdown',()=>this.audio.unlockMusic(),{passive:true});addEventListener('keydown',()=>this.audio.unlockMusic());document.addEventListener('visibilitychange',()=>this.audio.music?.apply());
    this.mobile = new MobileControls(this);
    addEventListener('gamepadconnected', e => this.toast?.(`Controller connected: ${e.gamepad.id.slice(0, 32)}`));
    this.state = this.load();
    try { this.profile = JSON.parse(storage.getItem('dtt.profile')) || {}; } catch { this.profile = {}; }
    const paintMigrated=migrateDefaultLivery(this.profile);
    const profileRenamed=this.profile.driver==='Dale Rhodes'&&paintMigrated;if(profileRenamed)this.profile.driver=DEFAULT_DRIVER;
    if(paintMigrated||profileRenamed)storage.setItem('dtt.profile',JSON.stringify(this.profile));
    this.applyQuality();
    this.resize();
    document.getElementById('loading')?.remove();
    this.goto('title');this.warnStorage();
    requestAnimationFrame(t => this.frame(t));
  }
  // ---------- input helpers ----------
  key(...codes) { return codes.some(c => this.keys.has(c)||this.padKeys.has(c)); }
  tap(code) { if (this.pressed.has(code)) { this.pressed.delete(code); return true; } return false; }
  input() {
    const l = this.key('ArrowLeft', 'KeyA'), r = this.key('ArrowRight', 'KeyD');
    const inp = { steer: (r ? 1 : 0) - (l ? 1 : 0), throttle: this.key('ArrowUp', 'KeyW') ? 1 : 0, brake: this.key('ArrowDown', 'KeyS') ? 1 : 0 };
    const g = this.pad;
    if (g) { // analog gamepad: left stick steers (with a small deadzone), RT gas, LT brake
      const ax = Math.abs(g.steer) < 0.08 ? 0 : g.steer;
      if (ax) inp.steer = Math.max(-1, Math.min(1, ax));
      inp.throttle = Math.max(inp.throttle, g.gas); inp.brake = Math.max(inp.brake, g.brake);
    }
    this.mobile?.apply(inp);
    return inp;
  }
  // poll the first connected gamepad; buttons become key taps so every scene's shortcuts work on a controller
  pollPad() {
    const gp = navigator.getGamepads ? [...navigator.getGamepads()].find(x => x && x.connected) : null;
    if (!gp) { this.pad = null; this.padKeys.clear();this.padPrev={};return; }
    const b = i => gp.buttons[i] ? (gp.buttons[i].value ?? (gp.buttons[i].pressed ? 1 : 0)) : 0;
    this.pad = { steer: gp.axes[0] || 0, gas: b(7), brake: b(6) };
    const map = { 0: 'Space', 1: 'KeyX', 2: 'KeyE', 3: 'KeyC', 4: 'KeyQ', 5: this.phase==='highway'?'KeyJ':'KeyT', 8: 'KeyR', 9: 'Escape', 12: 'ArrowUp', 13: 'ArrowDown' };
    this.padPrev = this.padPrev || {};
    for (const [i, code] of Object.entries(map)) {
      const down = b(+i) > 0.5;
      if (down && !this.padPrev[i]) { this.pressed.add(code); this.padKeys.add(code); }
      if (!down && this.padPrev[i]) this.padKeys.delete(code);
      this.padPrev[i] = down;
    }
  }
  saveSettings() { storage.setItem('dtt.settings', JSON.stringify(this.settings)); this.audio.applyVolume();this.warnStorage(); }
  toast(msg) {
    document.querySelectorAll('.toast').forEach(t=>t.remove());
    const d = document.createElement('div'); d.className = 'toast'; d.textContent = msg; document.body.appendChild(d);
    setTimeout(() => d.classList.add('out'), 2200); setTimeout(() => d.remove(), 2800);
  }
  // ---------- pause + settings overlay (Esc / Start) ----------
  togglePause(force) {
    const on = force ?? !this.paused;
    this.mobile?.reset();
    document.getElementById('pause')?.remove();
    this.paused = on;this.audio.setMusicPhase(on?'pause':this.phase);
    if (!on) return;
    this.audio.stop();
    const d = document.createElement('div'); d.id = 'pause';
    d.setAttribute('role','dialog'); d.setAttribute('aria-modal','true'); d.setAttribute('aria-label','Pause menu');
    d.innerHTML = `<div class="panel pause-card"><section><div class="kicker">SESSION PAUSED</div><h2>Take a breather.</h2><p class="pause-driver">${UI.esc(this.state?.driver || DEFAULT_DRIVER)}</p><p class="muted">${this.isMobile?'Tap Resume when you’re ready.':'Esc / Start to get back to it.'}<br>Earlier stages are autosaved.</p></section><nav class="pause-actions"><button id="p-res">Resume ${UI.icon('arrow')}</button><button id="p-set" class="alt">Settings ${UI.icon('settings')}</button>${this.phase==='race'&&!this.mode?.player?.finished&&!this.mode?.player?.dnf?'<button id="p-retire" class="alt">Retire to paddock</button>':''}<button id="p-quit" class="text-button">Return to title</button></nav></div>`;
    document.body.appendChild(d);
    d.querySelector('#p-res').onclick = () => this.togglePause(false);
    d.querySelector('#p-set').onclick = () => this.openSettings();
    if(d.querySelector('#p-retire'))d.querySelector('#p-retire').onclick=()=>{if(!confirm('Retire from this race? You will be classified DNF and recovered straight to your hauler.'))return;this.togglePause(false);this.mode.retire();this.mode.endRace();};
    d.querySelector('#p-quit').onclick = () => { this.togglePause(false); this.goto('title'); };
  }
  openHelp() {
    if(document.getElementById('help')){this.closeHelp();return;}
    this.mobile?.reset();this.helpWasPaused=this.paused;this.paused=true;this.audio.stop();this.audio.setMusicPhase('help');this.keys.clear();
    const d=document.createElement('div');d.id='help';d.innerHTML=`<div class="panel"><div class="kicker">DRIVING GUIDE</div><h2 style="margin-top:8px">Find your rhythm, not full lock.</h2><p class="muted">High assist is the keyboard-friendly default. The car still slides; the assist catches excess yaw and softens bumps. Start with short steering taps and let it settle.</p><div class="help-grid"><section><h3>On the clay</h3><p><kbd>W</kbd> / <kbd>↑</kbd> Throttle<br><kbd>S</kbd> / <kbd>↓</kbd> Brake; hold when stopped to reverse<br><kbd>A</kbd> <kbd>D</kbd> / <kbd>←</kbd> <kbd>→</kbd> Steer<br><kbd>C</kbd> Chase / cockpit / trackside<br><kbd>T</kbd> Tear off muddy windshield<br><kbd>R</kbd> Recover to center of the track</p><p>Fresh clay: try the bottom. As it dries, explore the middle and cushion. Ruts bounce the body; High assist keeps the steering effects gentle.</p></section><section><h3>In the paddock & on the road</h3><p>Loading: creep up the striped ramp, stop in the green box. <kbd>X</kbd> lets the crew winch for $300.<br>Highway: arrows/WASD, <kbd>S</kbd> / <kbd>↓</kbd> brake, then hold to reverse, <kbd>E</kbd> take a signed exit, <kbd>C</kbd> change camera.<br><kbd>Q</kbd> Cruise control, <kbd>B</kbd> air horn, <kbd>H</kbd> this guide.</p><p>Controller: left stick, RT gas, LT brake; Y camera, A/B/X actions, Start pause.<br><kbd>P</kbd> / Esc pause · <kbd>M</kbd> mute · <kbd>G</kbd> graphics</p></section></div><div class="row" style="margin-top:18px;justify-content:space-between"><span class="muted">High / Max assist are recommended for a relaxed keyboard race.</span><button id="help-close">Got it →</button></div></div>`;document.body.appendChild(d);d.querySelector('#help-close').onclick=()=>this.closeHelp();
  }
  closeHelp(){document.getElementById('help')?.remove();this.paused=!!this.helpWasPaused;this.audio.setMusicPhase(this.paused?'pause':this.phase);this.keys.clear();this.pressed.clear();}
  openSettings() {
    this.mobile?.reset();document.getElementById('settings')?.remove();this.settingsWasPaused=this.paused;this.paused=true;this.audio.stop();this.audio.setMusicPhase('settings');
    const S = this.settings, d = document.createElement('div'); d.id = 'settings';
    const sl = (id, label, v, min, max, step) => `<div class="row set-row slider-row"><label for="${id}">${label}</label><input type="range" id="${id}" min="${min}" max="${max}" step="${step}" value="${v}"><span id="${id}-v">${Math.round(v*100)}%</span></div>`;
    d.setAttribute('role','dialog');d.setAttribute('aria-modal','true');d.setAttribute('aria-label','Settings');
    d.innerHTML = `<div class="panel settings-card"><header class="modal-head"><div><div class="kicker">PERSONALIZE</div><h2>Your drive.</h2></div><span class="pill">${this.isMobile?'TOUCH + TILT':'KEYBOARD / CONTROLLER'}</span></header><div class="settings-body"><section><h3>Audio & feel</h3>
      ${sl('s-vol','Master volume',S.volume,0,1,.05)}${sl('s-music','Menu music',S.musicVolume,0,1,.05)}<div class="row set-row"><label>Menu music</label><button id="s-music-mute" class="alt">${S.musicMuted?'Unmute music':'Mute music'}</button></div>${sl('s-crowd','Crowd & field',S.crowd,0,1,.05)}${sl('s-shake','Camera shake',S.shake,0,1.5,.05)}
      <div class="row set-row"><label>Sound</label><button id="s-mute" class="alt">${this.audio.muted?'Unmute':'Mute'}</button></div></section><section><h3>Driving & display</h3>
      <div class="row set-row"><label for="s-q">Graphics</label><select id="s-q"><option value="auto">Auto (device recommended)</option><option value="low">Low</option><option value="medium">Medium</option><option value="high">High</option></select></div>
      <div class="row set-row"><label for="s-touch">Touch steering</label><select id="s-touch"><option value="wheel">Analog wheel</option><option value="arrows">Left / right arrows</option></select></div>
      <div class="row set-row"><label for="s-assist">Steering assist</label><select id="s-assist"><option value="off">Off · pro</option><option value="low">Low</option><option value="med">Medium</option><option value="high">High · recommended</option><option value="max">Max · relaxed</option></select></div>
      <div class="row set-row"><label for="s-diff">AI difficulty</label><select id="s-diff"><option value="easy">Easy</option><option value="normal">Normal</option><option value="hard">Hard</option></select></div>
      <div class="row set-row"><label for="s-auto">Auto-drive pace laps & cautions</label><select id="s-auto"><option value="on">On · recommended</option><option value="off">Off · manual</option></select></div><div class="row set-row"><label for="s-cam">Race camera</label><select id="s-cam"><option value="chase">Chase</option><option value="incar">Cockpit</option></select></div></section></div>
      <footer class="modal-footer"><button id="s-help" class="text-button">Driving guide ${UI.icon('arrow')}</button><button id="s-done">Done ${UI.icon('check')}</button></footer></div>`;
    document.body.appendChild(d);
    d.querySelector('#s-q').value = this.qualityChoice; d.querySelector('#s-cam').value = S.cam; d.querySelector('#s-assist').value = S.assist || 'high'; d.querySelector('#s-diff').value = S.diff || 'normal';
    d.querySelector('#s-touch').value=S.touchSteering==='arrows'?'arrows':'wheel';d.querySelector('#s-touch').onchange=e=>{S.touchSteering=e.target.value;this.mobile?.reset();this.saveSettings();this.mobile?.sync();};
    d.querySelector('#s-auto').value=S.autoPace===false?'off':'on';d.querySelector('#s-auto').onchange=e=>{S.autoPace=e.target.value==='on';this.saveSettings();};
    const bind = (id, key) => { const e = d.querySelector('#' + id); e.oninput = () => { S[key] = +e.value; d.querySelector(`#${id}-v`).textContent = Math.round(S[key] * 100) + '%'; this.saveSettings(); }; };
    d.querySelector('#s-music-mute').onclick=e=>{S.musicMuted=!S.musicMuted;this.saveSettings();e.target.textContent=S.musicMuted?'Unmute music':'Mute music';};
    bind('s-music','musicVolume');bind('s-vol', 'volume'); bind('s-crowd', 'crowd'); bind('s-shake', 'shake');
    d.querySelector('#s-q').onchange = e => { this.setQuality(e.target.value); };
    d.querySelector('#s-assist').onchange = e => { S.assist = e.target.value; this.saveSettings(); };
    d.querySelector('#s-diff').onchange = e => { S.diff = e.target.value; this.saveSettings(); };
    d.querySelector('#s-cam').onchange = e => { S.cam = e.target.value;if(this.phase==='race'){this.mode.camMode=S.cam==='incar'?1:0;this.mode.camInit=false;} this.saveSettings(); };
    d.querySelector('#s-mute').onclick = e => { this.audio.toggleMute(); e.target.textContent = this.audio.muted ? 'Unmute' : 'Mute'; };
    d.querySelector('#s-help').onclick=()=>this.openHelp();d.querySelector('#s-done').onclick = () => this.closeSettings();
  }
  closeSettings(){document.getElementById('settings')?.remove();this.paused=!!this.settingsWasPaused;this.audio.setMusicPhase(this.paused?'pause':this.phase);this.keys.clear();}
  fade() {
    const f = document.getElementById('fade'); if (!f || this.manual) return;
    f.style.transition = 'none'; f.style.opacity = 1; void f.offsetWidth;
    f.style.transition = 'opacity 0.4s ease-out'; f.style.opacity = 0;
  }
  // ---------- state ----------
  newState(opts = {}) {
    const standings = {}; for (const d of AI_DRIVERS) standings[d.id] = 0;
    const driver = opts.driver?.trim() || DEFAULT_DRIVER; standings[PLAYER_ID] = 0;
    return { v: 1, driverId:PLAYER_ID,driverIdentityVersion:DRIVER_IDENTITY_VERSION,driver, team: opts.team || 'Red Clay Racing', num: opts.num || DEFAULT_PROFILE.num, color: opts.color ?? DEFAULT_PROFILE.color, accent: opts.accent ?? DEFAULT_PROFILE.accent, cageColor:opts.cageColor??DEFAULT_PROFILE.cageColor, scheme:opts.scheme??DEFAULT_PROFILE.scheme, liveryDefaultsVersion:2,
      seasonTrackVersion:SEASON_TRACK_VERSION,seasonTrackIds:TRACKS.map(t=>t.id),round: 0, money: 15000, carDmg: 0, haulerDmg: 0, fuel: 0.7, fatigue: 0, up: { engine: 0, tires: 0, shocks: 0 }, crew: ['m2'],
      standings, results: [], phase: 'shop', late: false, slackBonus: 0, arrival: null, earnings: 0, log: [] };
  }
  load() {
    try {
      const s = JSON.parse(storage.getItem(SAVE_KEY));
      if (s && s.v === 1) {
        const paintMigrated=migrateDefaultLivery(s);
        if(!s.salinaLayoutVersion){if(s.results?.[0]?.track==='Volusia')s.results[0].track='Salina';if(s.round===0&&s.pitPose?.c&&(Math.abs(s.pitPose.c.x)>75||s.pitPose.c.z< -51||s.pitPose.c.z>41))delete s.pitPose;s.salinaLayoutVersion=1;storage.setItem(SAVE_KEY,JSON.stringify(s));}
        if (!s.driver?.trim() || (s.driver === 'Dale Rhodes' && paintMigrated)) {
          const old = s.driver ?? ''; s.driver = DEFAULT_DRIVER; s.standings ||= {};
          if (!s.driverIdentityVersion && old !== DEFAULT_DRIVER && Object.hasOwn(s.standings, old)) {
            s.standings[DEFAULT_DRIVER] = (s.standings[DEFAULT_DRIVER] || 0) + (s.standings[old] || 0);
            delete s.standings[old];
          } else if(!s.driverIdentityVersion)s.standings[DEFAULT_DRIVER] ??= 0;
          // Historical result/player records may also contain the previous default.
          const rename = o => { if (!o || typeof o !== 'object') return;
            for (const k of Object.keys(o)) { if ((k === 'name' || k === 'driver') && o[k] === old) o[k] = DEFAULT_DRIVER; else rename(o[k]); }
          }; rename(s.results); rename(s.log);
          storage.setItem(SAVE_KEY, JSON.stringify(s));
        }
        let settledStage=false;
        if(s.phase==='race'&&s.results?.[s.round]){s.phase='load';settledStage=true;}
        if(s.phase==='load'&&s.loadLog?.round===s.round){s.phase=s.round>=TRACKS.length-1?'season':'highway';settledStage=true;}
        if(migrateSeasonSave(s)||paintMigrated||settledStage)storage.setItem(SAVE_KEY,JSON.stringify(s));
        return s;
      }
    } catch (e) {} return null;
  }
  warnStorage(){if(storage.failed&&!this.storageWarned){this.storageWarned=true;this.toast('Autosave unavailable — progress lasts until this page is reloaded.');}}
  save() { if (this.state) storage.setItem(SAVE_KEY, JSON.stringify(this.state));this.warnStorage(); }
  clearSave() { storage.removeItem(SAVE_KEY); }
  get track() { return TRACKS[Math.max(0,Math.min(Number.isInteger(this.state?.round)?this.state.round:0,TRACKS.length-1))]; }
  get route() { return ROUTES[this.state?.round??0]; }
  crew(role) { return (this.state?.crew || []).map(id => CREW_POOL.find(c => c.id === id)).find(c => c && c.role === role); }
  carParams() {
    const s = this.state, chief = this.crew('Crew Chief'), tire = this.crew('Tire Guy');
    return { power: 1 + 0.065 * s.up.engine, grip: 1 + 0.03 * s.up.tires + (chief ? 0.01 * chief.skill : 0) + (tire ? 0.008 * tire.skill : 0), stab: 0.25 * s.up.shocks, damage: s.carDmg };
  }
  // ---------- flow ----------
  goto(phase, params = {}) {
    if(this.state&&migrateSeasonSave(this.state))this.save();
    if(['highway','map'].includes(phase)&&!this.route)phase=this.state?.results?.length>=TRACKS.length?'season':'shop';
    if(phase==='race'&&!this.manual&&!params.warmed)return this.loadRace();
    if(!params.warmed){this.transitionToken=(this.transitionToken||0)+1;this.warming=false;this.transitioning=false;document.getElementById('race-loading')?.remove();}
    this.mobile?.reset();
    document.body.dataset.phase=phase;
    const retained=(phase==='results'&&this.mode instanceof RaceScene)||(phase==='load'&&this.mode instanceof RaceScene);
    const race=retained?this.mode:null;if(race)race.pausedRace=true;
    if (this.mode&&!retained) { this.mode.dispose?.(); this.mode = null; }
    this.ui.innerHTML = ''; this.phase = phase; this.audio.stop();this.audio.setMusicPhase(phase);
    this.helpWasPaused=false;document.getElementById('help')?.remove();this.togglePause(false); document.getElementById('settings')?.remove(); this.fade();
    this.bloom.strength = 0.1; this.bloom.radius = 0.25; this.bloom.threshold = 3.0; this.renderer.toneMappingExposure = 1; // scenes may override
    document.getElementById('vignette').style.opacity = 0;
    if (this.state && !['title', 'schedule', 'season'].includes(phase)) { this.state.phase = phase; this.save(); }
    switch (phase) {
      case 'title': this.mode = new ShowroomScene(this, { hero: true, profile: this.profileOverride || this.state || this.profile }); UI.title(this); break;
      case 'schedule': this.mode = null; UI.schedule(this); break;
      case 'shop': this.mode = new ShowroomScene(this); UI.shop(this); break;
      case 'race': this.mode = new RaceScene(this, { track: this.track, startBack: this.state.late }); break;
      case 'results': this.mode = race||new ShowroomScene(this, { spin: true }); UI.results(this, params); break;
      case 'load': this.mode = new LoadScene(this, {race:race||new RaceScene(this,{track:this.track})}); break;
      case 'map': this.mode = null; UI.map(this); break;
      case 'highway': this.mode = new HighwayScene(this, { route: this.route }); break;
      case 'arrive': this.mode = new ShowroomScene(this); UI.arrive(this, params); break;
      case 'season': this.mode = null; UI.season(this); break;
    }
    if (this.mode) { this.renderPass.scene = this.mode.scene; this.renderPass.camera = this.mode.camera; this.applyQuality(); }
    this.canvas.style.visibility = this.mode ? 'visible' : 'hidden';
    this.mobile?.sync();
  }
  async loadRace(){
    const token=this.transitionToken=(this.transitionToken||0)+1,start=performance.now();this.warming=true;this.transitioning=true;this.mobile?.reset();
    document.getElementById('race-loading')?.remove();const overlay=document.createElement('div');overlay.id='race-loading';overlay.setAttribute('role','status');overlay.innerHTML='<div><b>PREPARING THE CLAY</b><p>Warming cars, grass, shadows and audio…</p></div>';document.body.append(overlay);
    const paint=()=>new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));
    try{await paint();if(token!==this.transitionToken)return;const build=performance.now();this.goto('race',{warmed:true});const race=this.mode;race.updateSurface(0,true);race.grass?.prepare(race.camera,0);if(race.hud){const old=race.hud.msg.textContent;race.hud.msg.textContent='ONE TO GO… GET READY';void race.hud.msg.offsetWidth;await document.fonts.ready;race.hud.msg.textContent=old;}this.transitionMetrics={buildMs:performance.now()-build};await paint();if(token!==this.transitionToken)return;
      const audio=performance.now();this.audio.ensure();this.transitionMetrics.audioMs=performance.now()-audio;
      // Night20: fetch/decode the V8 sound pack behind this screen (in parallel with shader warm-up) so the
      // race opens on the real engine instead of the fallback synth swapping over mid pace lap. Capped wait.
      const enginePack=Promise.race([Promise.resolve(this.audio.loadDyno?.()).catch(()=>false),new Promise(r=>setTimeout(()=>r(false),5000))]);
      const upload=performance.now(),textures=new Set();race.scene.traverse(o=>{for(const m of Array.isArray(o.material)?o.material:[o.material])if(m)for(const v of Object.values(m))if(v?.isTexture)textures.add(v);});for(const t of textures)this.renderer.initTexture(t);this.transitionMetrics.uploadMs=performance.now()-upload;
      // Compile hidden cockpit, low LOD, dust/smoke and flag variants as well as
      // the initial view. Damage changes uniforms only, not shader topology.
      // High renders into a linear composer target, not directly to the sRGB
      // canvas. Compile BOTH contexts, including hidden/checkered variants;
      // warming only the canvas left five cold programs on first later use.
      const compileScene=async()=>{const target=this.renderer.getRenderTarget();try{this.renderer.setRenderTarget(null);await this.renderer.compileAsync(race.scene,race.camera);if(this.quality==='high'){this.renderer.setRenderTarget(this.composer.readBuffer);await this.renderer.compileAsync(race.scene,race.camera);}}finally{this.renderer.setRenderTarget(target);}};
      const compile=performance.now(),visibility=[];race.scene.traverse(o=>{visibility.push([o,o.visible]);o.visible=true;});await compileScene();for(const[o,v]of visibility)o.visible=v;
      if(race.flagman){const m=race.flagman.mat,old=m.map;m.map=race.flagman.ck;m.emissiveMap=m.map;m.needsUpdate=true;await compileScene();m.map=old;m.emissiveMap=old;m.needsUpdate=true;}
      await compileScene();this.transitionMetrics.compileMs=performance.now()-compile;
      const post=performance.now();let drawMs=0;for(let i=0;i<3;i++){const t=performance.now();race.key.shadow.needsUpdate=true;this.render();this.renderer.getContext().finish();await new Promise(r=>requestAnimationFrame(r));if(i>0)drawMs+=performance.now()-t;}this.transitionMetrics.firstDrawMs=performance.now()-post;this.transitionMetrics.warmDrawAverageMs=drawMs/2;
      // Auto keeps a conservative Medium base; adapt resolution behind the
      // loading screen rather than allowing a first-lap MAX-quality stall.
      if(this.qualityChoice==='auto'&&!this.manual){const ms=drawMs/2;this.transitionMetrics.presentedWarmMs=ms;if(ms>32&&this.quality!=='low'){this.quality='low';this.transitionMetrics.autoTier='low';this.applyQuality();race.updateSurface(0,true);race.grass?.prepare(race.camera,0);}const scale=Math.max(.65,Math.min(1,(this.autoScale||1)*Math.sqrt(16.7/Math.max(ms,1))));this.autoScale=scale;this.applyQuality();await compileScene();this.render();this.renderer.getContext().finish();await paint();this.transitionMetrics.autoScale=scale;}
      for(const c of race.cars){Object.assign(c.previousPose,{x:c.x,z:c.z,th:c.th});Object.assign(c.renderPose,c.previousPose);}race.acc=0;this.keys.clear();this.pressed.clear();this.last=performance.now();this.transitionMetrics.totalMs=performance.now()-start;this.transitionMetrics.programs=this.renderer.info.programs.length;
      const packWait=performance.now();await enginePack;this.transitionMetrics.enginePackWaitMs=performance.now()-packWait;this.transitionMetrics.enginePack=this.audio.sampleState||'none';this.last=performance.now();
      if(token===this.transitionToken){this.warming=false;this.transitioning=false;overlay.classList.add('ready');setTimeout(()=>overlay.remove(),250);}
    }catch(e){console.error('Race preparation failed',e);if(token===this.transitionToken){this.warming=false;this.transitioning=false;overlay.remove();this.toast('Could not prepare the race. Return to the menu and try again.');}}
  }
  setQuality(choice){this.qualityChoice=QUALITY[choice]||choice==='auto'?choice:'auto';this.quality=resolveQuality(this.qualityChoice,this.isMobile);this.applyQuality();}
  applyQuality(){
    if(this.mode?.scene)upgradeScanMaterials(this.mode.scene);
    const p={...qualityPreset(this.quality)};if(this.isMobile){p.dpr=Math.min(p.dpr,this.quality==='low'?1:this.quality==='medium'?1:1.25);p.shadow=Math.min(p.shadow,this.quality==='low'?512:1024);p.dust=Math.min(p.dust,this.quality==='low'?450:1000);p.lod=Math.min(p.lod,24);}
    storage.setItem('dtt.quality',this.qualityChoice||this.quality);
    this.renderer.setPixelRatio(Math.min(devicePixelRatio,p.dpr)*p.scale*(this.qualityChoice==='auto'?(this.autoScale||1):1));this.composer.setPixelRatio(this.renderer.getPixelRatio());
    this.mode?.scene?.traverse(o=>{if(o.isLight&&o.castShadow&&o.shadow){const sh=o.shadow;sh.radius=this.quality==='low'?1:1.6;if(sh.mapSize.x!==p.shadow){sh.map?.dispose();sh.map=null;sh.mapSize.set(p.shadow,p.shadow);sh.needsUpdate=true;}}if(o.isLOD&&!o.userData.grass3d&&o.levels[1])o.levels[1].distance=p.lod;});(this.mode?.nightArt||this.mode?.race?.nightArt)?.shadows.configure();this.mode?.dust?.setBudget(p.dust);this.resize();
  }
  resize() {
    const w = innerWidth, h = innerHeight;
    this.renderer.setSize(w, h, false); this.composer.setSize(w, h);
    this.bloom.resolution.set(w / 2, h / 2);this.graphicsFinish.uniforms.resolution.value.set(w*this.renderer.getPixelRatio(),h*this.renderer.getPixelRatio());
    if (this.mode?.camera) { this.mode.camera.aspect = w / h; this.mode.camera.updateProjectionMatrix(); }
    this.mode?.onResize?.(w, h);
    this.mobile?.sync();
  }
  render() {
    if (!this.mode) return;
    (this.mode.nightArt||this.mode.race?.nightArt)?.shadows.prepare();
    (this.mode.grass||this.mode.race?.grass)?.update(this.mode.camera,this.mode.time??(typeof this.mode.t==='number'?this.mode.t:this.mode.race?.time)??0);
    if (this.quality === 'high'){this.graphicsFinish.uniforms.nearFar.value.set(this.mode.camera.near,this.mode.camera.far);this.composer.render();} else this.renderer.render(this.mode.scene, this.mode.camera);
  }
  step(dt) { if(this.warming)return; if (this.mode && (!this.paused || (this.mode instanceof ShowroomScene && this.mode.studio)) && !this.mobile?.portrait) this.mode.update(dt); this.pressed.clear(); }
  frame(t) {
    requestAnimationFrame(t2 => this.frame(t2));
    const dt = Math.max(0,Math.min(0.05,(t-this.last)/1000)); this.last = t;
    this.mobile?.sync();
    if(this.manual||this.warming)return;
    this.pollPad();
    const typing=['INPUT','TEXTAREA','SELECT'].includes(document.activeElement?.tagName);
    if(!typing&&this.tap('KeyH'))this.openHelp();
    if (!typing&&!document.getElementById('help')&&this.tap('KeyP') && !document.getElementById('settings') && ['race', 'load', 'highway'].includes(this.phase)) this.togglePause();
    if (this.tap('Escape')) {
      if(document.getElementById('help'))this.closeHelp();
      else if (document.getElementById('settings')) this.closeSettings();
      else if (['race', 'load', 'highway'].includes(this.phase)) this.togglePause();
    }
    if (this.tap('KeyG') && document.activeElement?.tagName !== 'INPUT') { this.setQuality(['auto','low','medium','high'][(['auto','low','medium','high'].indexOf(this.qualityChoice)+1)%4]);this.toast(qualityPreset(this.quality).label+' graphics'); }
    if (!typing&&this.tap('KeyM')) this.audio.toggleMute();
    this.step(dt); this.render();
  }
  money(n) { return '$' + Math.round(n).toLocaleString('en-US'); }
}

await loadCarFonts();   // livery number & sponsor fonts (OFL), capped at 2.5 s so a slow load never blocks the game
const app = new App();
window.DTT = app; // exposed for automated testing
globalThis.DTTMusicBoot?.markGameReady?.(); // Bulk song cannot compete with critical game/texture downloads.
// deterministic test helper: advance the active mode by N seconds of game time
app.advance = (sec, dt = 1 / 60) => { for (let t = 0; t < sec; t += dt) app.step(dt); app.render(); };
