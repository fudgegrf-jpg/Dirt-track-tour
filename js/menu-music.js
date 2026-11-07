// Owner-supplied "Nitro Riffs" by Jayden (made with Suno).
// HTML media streams compressed MP3 from a Blob: no full-song PCM allocation on phones.
const PRIME='data:audio/wav;base64,UklGRmQGAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YUAGAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA';
class LegacyMenuMusic {
 constructor(audio) {
  this.audio=audio;this.ctx=audio.ctx;this.unlocked=false;this.active=false;this.phase='title';this.target=0;
  this.media=new Audio(PRIME);this.media.loop=true;this.media.preload='auto';this.media.setAttribute('playsinline','');
  this.gain=this.ctx.createGain();this.gain.gain.value=0;this.source=this.ctx.createMediaElementSource(this.media);this.source.connect(this.gain);this.gain.connect(audio.master);
 }
 setPhase(phase){this.phase=phase;this.active=!['race','highway','load'].includes(phase);this.apply();}
 unlock(){
  // Prime this same media element synchronously in the first input gesture, for iOS.
  if(!this.unlocked){this.unlocked=true;this.media.play().catch(()=>{});}
  this.apply();
 }
 async prepare(){
  const chunks=await Promise.all([import('./nitro-audio-1.js'),import('./nitro-audio-2.js'),import('./nitro-audio-3.js')]);
  const parts=chunks.map(({default:text})=>{const raw=atob(text),bytes=new Uint8Array(raw.length);for(let i=0;i<raw.length;i++)bytes[i]=raw.charCodeAt(i);return bytes;});
  this.url=URL.createObjectURL(new Blob(parts,{type:'audio/mpeg'}));this.media.pause();this.media.src=this.url;this.media.load();this.ready=true;
  const t=this.ctx.currentTime;this.gain.gain.cancelScheduledValues(t);this.gain.gain.setValueAtTime(0,t);this.apply();
 }
 apply(){
  const st=this.audio.app?.settings||{},on=this.active&&this.unlocked&&!this.audio.muted&&!st.musicMuted&&!document.hidden;
  this.target=on?Math.max(0,Math.min(1,st.musicVolume??.35)):0;clearTimeout(this.pauseTimer);
  if(this.target>0&&!this.ready&&!this.pending)this.pending=this.prepare().catch(e=>{this.error=e.message;console.warn('Menu song unavailable',e);}).finally(()=>{this.pending=null;});
  const t=this.ctx.currentTime,g=this.gain.gain;g.cancelScheduledValues(t);g.setValueAtTime(g.value,t);g.setTargetAtTime(this.target,t,this.target>0?.28:.09);
  if(this.target>0&&this.ready&&this.media.paused)this.media.play().then(()=>{this.error=null;}).catch(e=>{if(this.target>0&&e.name!=='AbortError')this.error=e.message;});
  if(!this.target)this.pauseTimer=setTimeout(()=>{if(!this.target)this.media.pause();},1000);
 }
 dispose(){clearTimeout(this.pauseTimer);this.media.pause();this.media.removeAttribute('src');this.media.load();this.source.disconnect();this.gain.disconnect();if(this.url)URL.revokeObjectURL(this.url);}
}

export class MenuMusic { constructor(audio){if(globalThis.DTTMusicBoot)return globalThis.DTTMusicBoot.attach(audio);return new LegacyMenuMusic(audio);} }
