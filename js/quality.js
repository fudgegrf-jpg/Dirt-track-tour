// Quality changes detail, never exposure, tire physics, AI count, or assist.
export const QUALITY={
 low:{label:'Low',dpr:1,scale:.85,shadow:1024,dust:800,trackN:600,lanes:28,rutN:256,rutM:48,trees:.5,crowd:.55,lod:24},
 medium:{label:'Medium',dpr:1.25,scale:1,shadow:1536,dust:1600,trackN:800,lanes:40,rutN:384,rutM:72,trees:.75,crowd:.8,lod:28},
 high:{label:'High',dpr:1.5,scale:1,shadow:1536,dust:2200,trackN:800,lanes:40,rutN:384,rutM:72,trees:1,crowd:1,lod:36}
};
export const qualityPreset=q=>QUALITY[q]||QUALITY.medium;

export function resolveQuality(choice,mobile=false){if(choice!=='auto')return QUALITY[choice]?choice:'medium';const constrained=typeof navigator!=='undefined'&&((navigator.hardwareConcurrency||8)<=4||(navigator.deviceMemory||8)<=4);return mobile||constrained?'low':'medium';}
