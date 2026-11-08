// Quality changes detail, never exposure, tire physics, AI count, or assist.
export const QUALITY={
 low:{label:'Low',dpr:1,scale:.85,shadow:1024,dust:500,trackN:600,lanes:24,rutN:256,rutM:48,trees:.5,crowd:.55,lod:16},
 medium:{label:'Medium',dpr:1.25,scale:1,shadow:1536,dust:1100,trackN:600,lanes:32,rutN:384,rutM:72,trees:.75,crowd:.8,lod:22},
 high:{label:'High',dpr:1.5,scale:1,shadow:1536,dust:1800,trackN:640,lanes:32,rutN:384,rutM:72,trees:1,crowd:1,lod:28}
};
export const qualityPreset=q=>QUALITY[q]||QUALITY.medium;

export function resolveQuality(choice,mobile=false){if(choice!=='auto')return QUALITY[choice]?choice:'medium';const constrained=typeof navigator!=='undefined'&&((navigator.hardwareConcurrency||8)<=4||(navigator.deviceMemory||8)<=4);return mobile||constrained?'low':'medium';}
