// Original V7 half-octave-lower cross-plane V8: coherent irregular combustion, not a recording.
// All combustion and turbulence kernels are circular and C1-smooth. Filtering is
// warmed over repeated periods; the live graph never resets at a firing event.
const TAU=Math.PI*2;
// Artistic acoustic mapping only: physical RPM / instant throttle stay intact.
// One factor lowers the firing clock and exhaust/body formants by six semitones.
export const V8_VOICE_SCALE=Math.SQRT1_2;
const level=a=>Math.sqrt(a.reduce((s,x)=>s+x*x,0)/a.length)||1e-9;
function filter(a,sr,type,f,Q=.7,db=0){
 const w=TAU*Math.min(sr*.44,f)/sr,c=Math.cos(w),s=Math.sin(w),al=s/(2*Q),A=10**(db/40);let b0,b1,b2,a0,a1,a2;
 if(type==='hp'){b0=(1+c)/2;b1=-(1+c);b2=b0;a0=1+al;a1=-2*c;a2=1-al;}
 else if(type==='lp'){b0=(1-c)/2;b1=1-c;b2=b0;a0=1+al;a1=-2*c;a2=1-al;}
 else {b0=1+al*A;b1=-2*c;b2=1-al*A;a0=1+al/A;a1=-2*c;a2=1-al/A;}
 b0/=a0;b1/=a0;b2/=a0;a1/=a0;a2/=a0;let x1=0,x2=0,y1=0,y2=0;
 for(let rep=0;rep<4;rep++)for(let i=0;i<a.length;i++){const x=a[i],y=b0*x+b1*x1+b2*x2-a1*y1-a2*y2;x2=x1;x1=x;y2=y1;y1=y;if(rep===3)a[i]=y;}
}
function header(a,sr,length,feedback,damping){const n=a.length,D=Math.round(2*length*sr/(343)),buf=new Float32Array(D);let j=0,lp=0;
 for(let rep=0;rep<4;rep++)for(let i=0;i<n;i++){lp+=(buf[j]-lp)*damping;const v=a[i]-feedback*lp;buf[j]=v;j=(j+1)%D;if(rep===3)a[i]=v;}
}
// Original stochastic event statistics, NOT a recorded envelope/phase trace.
// One circular firing schedule drives pressure, noise bursts and bass together.
function idleEvents(N,count){
 const at=new Float64Array(count+1),amp=new Float32Array(count);let seed=193329,ar=0,total=0;
 const random=()=>{seed=(Math.imul(seed,1664525)+1013904223)>>>0;return seed/4294967296;};
 for(let k=0;k<count;k++){
  ar=.52*ar+(random()*2-1)*.48;
  const stumble=random()<.026,beat=Math.PI*2*k/16;
  const interval=1+.065*Math.sin(beat+.2)+.018*Math.sin(Math.PI*2*k/128+.4)+.045*ar+(stumble?.075:0);
  total+=interval;at[k+1]=total;
  amp[k]=(stumble?.37:1)*(.52+.96*random())*(1+.13*ar);
 }
 for(let k=0;k<=count;k++)at[k]=at[k]/total*N;
 return{at,amp};
}
// Monotone cubic phase interpolation has continuous frequency at every firing.
function eventPhase(at,k,x){const n=at.length-1,h=at[k+1]-at[k],prev=k?at[k]-at[k-1]:at[n]-at[n-1],next=k+1<n?at[k+2]-at[k+1]:at[1]-at[0],u=(x-at[k])/h,m0=2/(prev+h),m1=2/(h+next);return k+(u*u*(3-2*u)+(u*u*u-2*u*u+u)*h*m0+(u*u*u-u*u)*h*m1);}
function rawCammedV8(sr,rpm=3500,load=1){
 // Longer loaded periods allow slow torque breathing, not a high-RPM idle lope.
 const cycles=load?128:32,N=Math.round(sr*120/rpm*cycles),cycle=N/cycles,banks=[new Float32Array(N),new Float32Array(N)],flow=new Float32Array(N),on=Math.max(0,Math.min(1,load));
 const events=on?null:idleEvents(N,cycles*8);
 const order=[1,8,4,3,6,5,7,2],strength=[1.06,.88,1.12,.85,.96,1.08,.90,1.02];
 for(let c=0;c<cycles;c++)for(let k=0;k<8;k++){
  const p=TAU*(c+(1-on)*k/8)/cycles,cam=(1-on)*(.28*Math.sin(p*16+.2)+.10*Math.sin(p*48+.9)),cyl=order[k],bank=cyl%2;
  const jitter=0;
  const at=(events?events.at[c*8+k]:c*cycle+k*cycle/8)+jitter+sr*(bank?.00036:.00012),width=cycle*(on?.014:.034),rise=width*(on?.3:.065),len=Math.ceil(width*10),amp=(on?strength[k]:Math.max(.2,1+(strength[k]-1)*2.7))*(1+cam+.055*Math.sin(p*5+cyl))*(events?events.amp[c*8+k]:1);
  for(let j=0;j<len;j++){const u=Math.floor(at)+j-at;if(u<=0)continue;const z=u/width,v=u/rise,e=Math.exp(-v),r=1-e,tail=Math.exp(-z),fade=z<8?1:.5+.5*Math.cos(Math.PI*(z-8)/2);
   const pressure=r*r*r*tail,derivative=(3*r*r*e*width/rise-r*r*r)*tail;
   const i=((Math.floor(at)+j)%N+N)%N;banks[bank][i]+=amp*derivative*fade;flow[i]+=amp*pressure*fade;
  }
 }
 // Longer primary/collector resonances shift the body down without pitching
 // the engine or changing firing order, lope, RPM response or pop scheduling.
 header(banks[0],sr,1.13,.53,.40);header(banks[1],sr,1.03,.56,.38);header(banks[0],sr,.43,.24,.55);header(banks[1],sr,.39,.26,.53);
 const out=new Float32Array(N),noise=new Float32Array(N);let seed=914273;
 for(let i=0;i<N;i++){seed=(Math.imul(seed,1664525)+1013904223)>>>0;noise[i]=seed/2147483648-1;out[i]=banks[1][i]+.82*banks[0][(i-Math.round(sr*.00022)+N)%N];}
 // Retain a little smooth combustion-pressure body beneath the derivative
 // bark; this is the same circular firing train, not a new oscillator/voice.
 const fm=flow.reduce((s,x)=>s+x,0)/N,fr=Math.sqrt(flow.reduce((s,x)=>s+(x-fm)**2,0)/N)||1e-9,pressure=.18*level(out)/fr;
 for(let i=0;i<N;i++)out[i]+=pressure*(flow[i]-fm);
 const pressureAir=new Float32Array(noise);if(pressureAir){filter(pressureAir,sr,'hp',on?45:15);filter(pressureAir,sr,'lp',on?140:230,.7);}
 filter(out,sr,'hp',35);filter(out,sr,'pk',120,.8,6);filter(out,sr,'pk',350,.9,6);filter(out,sr,'pk',1800,.85,2.0*on);
 filter(noise,sr,'hp',on?650:700);filter(noise,sr,'lp',Math.min(on?3700:18000,sr*(on?.15:.42)));
 if(!on){filter(noise,sr,'pk',2800,.7,5);filter(noise,sr,'pk',14000,.75,4);}
 const body=level(out),bassGain=pressureAir?(on?.14:1.4)*level(out)/level(pressureAir):0,nr=level(noise),fg=level(flow),ng=body/nr*(on?.21:2.1),gain=.32/body;
 // Closed-throttle loop has continuous pulse-synchronous header chuff and
 // a two-cycle cam beat. At nominal 870 RPM: firing ~41 Hz; slow cam chop ~2.56 Hz.
 // Pure procedural engine-order pressure retains the deep thump beneath rasp.
 let event=0;
 for(let i=0;i<N;i++){
  if(events)while(event<cycles*8-1&&i>=events.at[event+1])event++;
  const phase=events?eventPhase(events.at,event,i):i/N*cycles*8;
  const p=TAU*i/N,beat=TAU*phase/16,cam=on?.91+.25*Math.sin(p+.8)+.13*Math.sin(p*2+1.4):.68+.29*Math.sin(beat+.2)+.075*Math.sin(beat*3+.9);
  const air=noise[i]*(on?.32+.55*Math.min(2,flow[i]/fg):.10+.85*Math.min(2,flow[i]/fg));
  const thump=on?body*(.29*Math.sin(TAU*phase/4+.2)+.10*Math.sin(TAU*phase/2+.4)):body*(1.75*Math.sin(TAU*phase)+.43*Math.sin(TAU*phase*1.5+.4));
  const frac=phase-Math.floor(phase),blend=frac*frac*(3-2*frac),cyl=events?Math.sqrt(events.amp[event]*(1-blend)+events.amp[(event+1)%(cycles*8)]*blend):1;
  out[i]=Math.tanh((out[i]+thump+ng*air+(pressureAir?pressureAir[i]*bassGain*(on?1:1+.35*Math.sin(beat+.2)):0))*gain*(on?1.65:1.1))*cam*cyl;
 }
 // Loaded layer retains its anti-alias reserve. The wider idle/off layer
 // uses native source resampling plus the existing smoothed output lowpass.
 const cutoff=Math.min(on?5200:17000,sr*(on?.14:.44));filter(out,sr,'lp',cutoff,.7);filter(out,sr,'lp',cutoff,.7);filter(out,sr,'hp',32);
 const scale=.18/level(out);for(let i=0;i<N;i++)out[i]*=scale;return out;
}

// Numeric, parametric body EQ only: no recorded waveform or measured IR.
export const V4_BANDS=[20,25,31.5,40,50,63,80,100,125,160,200,250,315,400,500,630,800,1000,1250,1600,2000,2500,3150,4000,5000,6300,8000,10000,12500,16000];
export const V6_OFF_GAINS=[-9,-17,-12,5.7141,-8.75,-5.75,-0.1959,-5.3537,-8.75,-0.003,-5.0361,-8.75,-8.75,-3.1433,-8.5782,-5.3557,3.3945,-2.6951,-5.2899,-4.0759,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0,0.0];
// Legacy exports stay compatible with existing engine diagnostics.
export const V4_GAINS=V6_OFF_GAINS;
// V6 numeric spectral targets only; no source audio/envelope is embedded.
export const V6_ON_GAINS=[-7.4165,8.75,-8.0663,-4.1834,4.4237,-1.8529,-1.7846,0.3049,7.3653,-0.5636,-7.9437,-8.75,-1.6242,5.9749,-7.8104,-5.0595,-8.1766,-7.9321,-8.75,-8.75,-8.2368,-8.2842,-7.8486,-8.516,4.656,0.0,0.0,0.0,0.0,0.0];
const loadedCache=new Map();
export function cammedV8(sr,rpm=3500,load=1){const cached=load===1&&rpm===3500;if(cached&&loadedCache.has(sr))return loadedCache.get(sr);const a=rawCammedV8(sr,rpm,load);if(load){for(let i=0;i<V4_BANDS.length;i++)if(Math.abs(V6_ON_GAINS[i])>.01)filter(a,sr,'pk',V4_BANDS[i]*rpm/3500,3.2,V6_ON_GAINS[i]);filter(a,sr,'lp',Math.min(5200,sr*.14),.7);filter(a,sr,'lp',Math.min(5200,sr*.14),.7);filter(a,sr,'pk',100*rpm/3500,.65,1.2);filter(a,sr,'pk',1600*rpm/3500,.65,-1.2);const k=.18/level(a);for(let i=0;i<a.length;i++)a[i]*=k;}if(cached)loadedCache.set(sr,a);return a;}
const v4BankCache=new Map();
// Legacy name; this is now the V6 native-rate off/idle bank.
export function v4IdleBank(sr){
 if(v4BankCache.has(sr))return v4BankCache.get(sr);
 const nominalFrames=2**Math.ceil(Math.log2(sr*120/870*32)),rpm=sr*120*32/nominalFrames;
 // Native bank lengths remain unchanged. The persistent source playback map
 // applies V8_VOICE_SCALE, preserving the exact cam pattern without extra PCM.
 const mid=cammedV8(sr,rpm,0),n=mid.length;
 for(let i=0;i<V4_BANDS.length;i++)if(Math.abs(V4_GAINS[i])>.01)filter(mid,sr,'pk',V4_BANDS[i]*rpm/870,4.318,V4_GAINS[i]);
 // Pitch-safe overrun reserve: the off bank may run beyond 10x nominal.
 filter(mid,sr,'lp',sr*.041,.7);filter(mid,sr,'lp',sr*.041,.7);
 filter(mid,sr,'pk',120*rpm/870,.65,1.2);filter(mid,sr,'pk',1600*rpm/870,.65,-1.2);
 const gain=.18/level(mid);for(let i=0;i<n;i++)mid[i]*=gain;
 // Original diffuse early reflections: delay lengths and side strength are
 // synthetic, not a recorded room response. All work is cached before playback.
 const side=new Float32Array(n),left=new Float32Array(n),right=new Float32Array(n);
 const d1=Math.round(sr*.0117*870/rpm),d2=Math.round(sr*.0233*870/rpm),d3=Math.round(sr*.0411*870/rpm);
 for(let i=0;i<n;i++)side[i]=mid[(i-d1+n)%n]-mid[(i-d2+n)%n]+.3*(mid[(i-d3+n)%n]-mid[(i-d1+n)%n]);
 const sg=.3616*level(mid)/level(side);for(let i=0;i<n;i++){left[i]=mid[i]+side[i]*sg;right[i]=mid[i]-side[i]*sg;}
 const bank={rpm,left,right};v4BankCache.set(sr,bank);return bank;
}
