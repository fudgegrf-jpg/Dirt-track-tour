// Quality changes detail, never exposure, tire physics, AI count, or assist.
export const QUALITY={
 low:{label:'Performance',dpr:1,scale:.85,shadow:1024,dust:800,trackN:600,lanes:28,rutN:256,rutM:48,trees:.5,crowd:.55,lod:34},
 medium:{label:'Balanced',dpr:1.25,scale:1,shadow:1536,dust:1600,trackN:800,lanes:40,rutN:384,rutM:72,trees:.75,crowd:.8,lod:44},
 high:{label:'Detail',dpr:1.5,scale:1,shadow:2048,dust:3000,trackN:1000,lanes:56,rutN:512,rutM:96,trees:1,crowd:1,lod:55}
};
export const qualityPreset=q=>QUALITY[q]||QUALITY.medium;
