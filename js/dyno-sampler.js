// Loaded only on the first car-engine use. No startup media fetch/decode.
// Night18: Garrett's synthesized V8 pack. Ogg Vorbis first where the browser
// says it can play it; MP3 twin for older Safari/iOS (<18.4) or any decode failure.
import {DYNO_BANK} from './dyno-bank.js';
const modules=new WeakMap();
function canPlay(type){try{return typeof document!=='undefined'&&document.createElement('audio').canPlayType(type)!=='';}catch{return false;}}
export function pickAssets(list=DYNO_BANK.assets){const ok=list.filter(a=>a.type==='audio/mpeg'||canPlay(a.type));return ok.length?ok:list.slice(-1);}
function trim(buffer,start,duration,seam=false){
 const sr=buffer.sampleRate,i=Math.round(start*sr),n=Math.round(duration*sr);if(n<128||i+n>buffer.length)throw Error('Dyno sample atlas is truncated');
 const data=buffer.getChannelData(0).slice(i,i+n);let energy=0,peak=0;for(const v of data){if(!Number.isFinite(v))throw Error('Invalid dyno sample');energy+=v*v;peak=Math.max(peak,Math.abs(v));}
 if(Math.sqrt(energy/n)<.01)throw Error('Dyno sample is silent');// pack loops keep their shared gain: no per-loop normalization
 if(seam){const edge=Math.min(Math.round(sr*.004),n>>3),mid=(data[0]+data[n-1])*.5,l=mid-data[0],r=mid-data[n-1];for(let j=0;j<edge;j++){const w=.5+.5*Math.cos(Math.PI*j/(edge-1));data[j]+=l*w;data[n-1-j]+=r*w;}}
 return data;
}
// MP3 decoders differ in whether they expose encoder priming. Match a tiny
// authorized-recording fingerprint once, so Safari/Android cuts use the same
// actual PCM boundaries rather than accidentally including padding silence.
export function atlasOffset(buffer,sync=DYNO_BANK.sync){
 const bytes=Uint8Array.from(atob(sync.pcm16),c=>c.charCodeAt(0)),dv=new DataView(bytes.buffer),ref=new Float32Array(bytes.length/2);let refEnergy=0;
 for(let j=0;j<ref.length;j++){ref[j]=dv.getInt16(j*2,true)/32767;refEnergy+=ref[j]*ref[j];}
 const data=buffer.getChannelData(0),sr=buffer.sampleRate;
 const score=offset=>{let dot=0,energy=0;for(let j=0;j<ref.length;j++){const x=(sync.start+offset+j/sync.rate)*sr,i=Math.floor(x),u=x-i;if(i<0||i+1>=data.length)return-1;const v=data[i]+(data[i+1]-data[i])*u;dot+=v*ref[j];energy+=v*v;}return dot/Math.sqrt(Math.max(1e-12,energy*refEnergy));};
 let offset=0,best=-1;for(let t=sync.minOffset;t<=sync.maxOffset;t+=.0005){const q=score(t);if(q>best){best=q;offset=t;}}
 const center=offset;for(let t=center-.0005;t<=center+.0005;t+=1/sr){const q=score(t);if(q>best){best=q;offset=t;}}
 if(best<.72)throw Error('Dyno atlas synchronization failed');return{offset,correlation:best};
}
export async function loadDyno(au){
 const c=au.ctx;if(!c?.audioWorklet||typeof AudioWorkletNode==='undefined')throw Error('AudioWorklet unavailable; Night12 fallback retained');
 au.sampleState='loading';const controller=new AbortController(),timer=setTimeout(()=>controller.abort(),10000);
 try{
  if(!modules.has(c))modules.set(c,c.audioWorklet.addModule(new URL('./dyno-worklet.js',import.meta.url)));
  const decodeFirst=async()=>{let err;for(const a of pickAssets()){try{const r=await fetch(new URL(a.url,import.meta.url),{signal:controller.signal,cache:'force-cache'});if(!r.ok)throw Error('Dyno sample HTTP '+r.status);const b=await c.decodeAudioData(await r.arrayBuffer());const sync=atlasOffset(b);au.sampleFormat=a.type;return[b,sync];}catch(e){err=e;if(controller.signal.aborted)break;}}throw err;};
  const [[buffer,sync]]=await Promise.all([decodeFirst(),modules.get(c)]);au.sampleSync=sync;
  // Shared loops (idle/light load) appear in both sets but are decoded once.
 const cache=new Map(),set=list=>list.map(b=>{if(!cache.has(b.name))cache.set(b.name,trim(buffer,b.start+sync.offset,b.duration,true));return{name:b.name,rpm:b.rpm,cycles:b.cycles,phaseOffset:b.phaseOffset,correlation:b.nextCorrelation,data:cache.get(b.name)};});
 const on=set(DYNO_BANK.on),off=set(DYNO_BANK.off),tone={level:DYNO_BANK.level??1,eq:DYNO_BANK.eq||[],lift:DYNO_BANK.liftAboveTop!==false};
 au.sampleMap=DYNO_BANK.rpmMap;au.sampleBakedLoad=!!DYNO_BANK.bakedLoad;au.sampleBytes=buffer.length*buffer.numberOfChannels*4;au.sampleDecodedRate=buffer.sampleRate;
  const voices=[au.player,...au.aiPool],audible=!au.offline&&voices.some(v=>v.lastVolume>1e-4);
  try{
   for(const v of voices){v.sampleSwapping=true;if(audible){v.out.gain.cancelScheduledValues(c.currentTime);v.out.gain.setTargetAtTime(0,c.currentTime,.008);}}
   if(audible)await new Promise(resolve=>setTimeout(resolve,45));
   for(const [i,v]of voices.entries())v.installSamples({on,off,...tone,phase:i*.283,cheap:i>0});
  }finally{
   for(const v of voices){v.sampleSwapping=false;v.out.gain.setTargetAtTime(v.lastVolume||0,c.currentTime,.02);}
  }
  au.sampleState='ready';au.stats.sampleVoices=[au.player,...au.aiPool].filter(v=>v.sampler).length;au.stats.engineSources=2*([au.player,...au.aiPool].length-au.stats.sampleVoices);return true;
 }finally{clearTimeout(timer);}
}
