// Original procedural 410-ci cross-plane, cammed open-header racing V8.
// No recordings, measured impulse responses, reference audio or external assets.
// Bake once, share two immutable buffers across the persistent voice pool.
export const FIRING_ORDER=Object.freeze([1,8,4,3,6,5,7,2]);
export const RACING_V8=Object.freeze({idle:1700,limit:7800,onRPM:3500,offRPM:1700});
const TAU=2*Math.PI,cache=new Map();
const rms=a=>Math.sqrt(a.reduce((s,x)=>s+x*x,0)/a.length)||1e-8;
function eq(a,sr,f,Q=.7,type='lp',db=0){
 const w=TAU*Math.min(f,sr*.44)/sr,c=Math.cos(w),s=Math.sin(w),al=s/(2*Q),A=10**(db/40);let b0,b1,b2,a0=1+al,a1=-2*c,a2=1-al;
 if(type==='hp'){b0=(1+c)/2;b1=-1-c;b2=b0;}
 else if(type==='peak'){b0=1+al*A;b1=-2*c;b2=1-al*A;a0=1+al/A;a2=1-al/A;}
 else {b0=(1-c)/2;b1=1-c;b2=b0;}
 b0/=a0;b1/=a0;b2/=a0;a1/=a0;a2/=a0;let x1=0,x2=0,y1=0,y2=0;
 // Two warm periods; never reset the filter at a cylinder firing or loop edge.
 for(let rep=0;rep<3;rep++)for(let i=0;i<a.length;i++){const x=a[i],y=b0*x+b1*x1+b2*x2-a1*y1-a2*y2;x2=x1;x1=x;y2=y1;y1=y;if(rep===2)a[i]=y;}
}
function header(a,sr,metres,reflect,damp){
 // Hot exhaust raises sound speed above ambient: negative open-end reflection.
 const D=Math.max(2,Math.round(sr*2*metres/510)),line=new Float32Array(D);let p=0,lp=0;
 for(let rep=0;rep<3;rep++)for(let i=0;i<a.length;i++){lp+=(line[p]-lp)*damp;const y=a[i]-reflect*lp;line[p]=y;p=(p+1)%D;if(rep===2)a[i]=y;}
}
export function racingV8(sr,rpm=3500,load=1){
 const key=[sr,rpm,load].join(':');if(cache.has(key))return cache.get(key);
 const on=load>.5,cycles=on?48:32,N=Math.round(sr*120/rpm*cycles),cycle=N/cycles,bank=[new Float32Array(N),new Float32Array(N)],flow=new Float32Array(N),asp=new Float32Array(N),mech=new Float32Array(N),air=new Float32Array(N);
 let seed=on?410812:170084,walk=0;const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 const idle=Math.max(0,1-(rpm-1700)/2800),width=cycle*(on?.025:.042),rise=width*(on?.17:.13);
 const add=(a,at,width,strength,derivative=false)=>{for(let j=0;j<Math.ceil(width*9);j++){const u=Math.floor(at)+j-at;if(u<=0)continue;const x=u/width,r=u/rise,e=Math.exp(-r),tail=Math.exp(-x),v=1-e,fade=x<7?1:.5+.5*Math.cos(Math.PI*(x-7)/2);a[((Math.floor(at)+j)%N+N)%N]+=strength*(derivative?(3*v*v*e*width/rise-v*v*v):v*v*v)*tail*fade;}};
 for(let c=0;c<cycles;c++){
  walk=.57*walk+.43*(random()*2-1);const cam=on?1:1+idle*(.22*Math.sin(TAU*c/3.2)+.12*walk),wander=(on?.001:.005)*cycle*walk;
  for(let k=0;k<8;k++){
   const cylinder=FIRING_ORDER[k],b=cylinder%2,primary=[.81,.89,.94,.84,1.02,.91,.86,.98][cylinder-1],travel=sr*primary/510;
   const at=c*cycle+k*cycle/8+wander+(random()-.5)*cycle*(on?.0007:.0035);
   const imbalance=1+.075*Math.sin(cylinder*2.31),variation=1+(random()*2-1)*(on?.055:.30*idle+.045),miss=!on&&random()<.018*idle?.38:1,strength=imbalance*variation*cam*miss;
   add(bank[b],at+travel,width,strength,true);add(flow,at,width,strength);
   // Intake valves open half a four-stroke cycle away from exhaust blowdown.
   add(asp,at+cycle*.5,cycle*.045,on?strength:.10*strength);
   add(mech,at+cycle*.24,sr*.00055,.7+.3*random());
   // Small deterministic afterfires on overrun; density rises with playback RPM.
   if(!on&&random()<.065)add(bank[b],at+cycle*(.12+.12*random()),width*.23,.35+.8*random(),true);
  }
 }
 header(bank[0],sr,1.08,.57,.40);header(bank[1],sr,.97,.53,.43);
 header(bank[0],sr,.46,.29,.57);header(bank[1],sr,.40,.27,.53);
 for(let i=0;i<N;i++)air[i]=random()*2-1;
 const hiss=new Float32Array(air),induction=new Float32Array(air),clatter=new Float32Array(air),out=new Float32Array(N),delay=Math.round(sr*.00038);
 eq(hiss,sr,650,.7,'hp');eq(hiss,sr,on?3900:3000);
 eq(induction,sr,150,.7,'hp');eq(induction,sr,1050,.65);eq(induction,sr,430,1.1,'peak',4);
 eq(clatter,sr,1800,.7,'hp');eq(clatter,sr,3600);
 const fm=flow.reduce((s,x)=>s+x,0)/N,fr=rms(flow),ar=rms(asp),mr=rms(mech),hr=rms(hiss),ir=rms(induction),cr=rms(clatter);
 for(let i=0;i<N;i++)out[i]=bank[1][i]+.73*bank[0][(i-delay+N)%N]+.42*(flow[i]-fm);
 eq(out,sr,38,.7,'hp');eq(out,sr,115,.8,'peak',4.5);eq(out,sr,240,.9,'peak',2);eq(out,sr,1900,.8,'peak',-3);
 const br=rms(out);
 for(let i=0;i<N;i++){
  const pulse=Math.min(2,flow[i]/fr),breath=.15+.85*pulse;
  out[i]+=br*((on?.045:.075)*hiss[i]/hr*breath+(on?.16:.025)*induction[i]/ir*asp[i]/ar+.012*clatter[i]/cr*mech[i]/mr);
 }
 const drive=(on?1.55:1.15)*.32/rms(out);for(let i=0;i<N;i++)out[i]=Math.tanh(out[i]*drive);
 // Keep an anti-alias reserve for the off/idle buffer's >4x high-RPM playback.
 const cut=on?Math.min(2200,sr*.12):Math.min(1400,sr*.06);eq(out,sr,cut);eq(out,sr,cut);eq(out,sr,32,.7,'hp');
 // Fixed-delta raised-cosine boundary repair: no loop-edge click/amplitude dip.
 const edge=Math.round(sr*.006),mid=(out[0]+out.at(-1))*.5,left=mid-out[0],right=mid-out.at(-1);
 for(let i=0;i<edge;i++){const w=.5+.5*Math.cos(Math.PI*i/(edge-1));out[i]+=left*w;out[N-1-i]+=right*w;}
 const gain=.20/rms(out);for(let i=0;i<N;i++)out[i]*=gain;cache.set(key,out);return out;
}
