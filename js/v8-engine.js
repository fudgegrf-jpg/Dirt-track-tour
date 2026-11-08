// Original procedural cross-plane, big-cam V8: reference-informed chopped-idle voicing. No recordings or third-party samples.
// All combustion and turbulence kernels are circular and C1-smooth. Filtering is
// warmed over repeated periods; the live graph never resets at a firing event.
const TAU=Math.PI*2;
const level=a=>Math.sqrt(a.reduce((s,x)=>s+x*x,0)/a.length)||1e-9;
function filter(a,sr,type,f,Q=.7,db=0){
 const w=TAU*Math.min(sr*.44,f)/sr,c=Math.cos(w),s=Math.sin(w),al=s/(2*Q),A=10**(db/40);let b0,b1,b2,a0,a1,a2;
 if(type==='hp'){b0=(1+c)/2;b1=-(1+c);b2=b0;a0=1+al;a1=-2*c;a2=1-al;}
 else if(type==='lp'){b0=(1-c)/2;b1=1-c;b2=b0;a0=1+al;a1=-2*c;a2=1-al;}
 else {b0=1+al*A;b1=-2*c;b2=1-al*A;a0=1+al/A;a1=-2*c;a2=1-al/A;}
 b0/=a0;b1/=a0;b2/=a0;a1/=a0;a2/=a0;let x1=0,x2=0,y1=0,y2=0;
 for(let rep=0;rep<4;rep++)for(let i=0;i<a.length;i++){const x=a[i],y=b0*x+b1*x1+b2*x2-a1*y1-a2*y2;x2=x1;x1=x;y2=y1;y1=y;if(rep===3)a[i]=y;}
}
function header(a,sr,length,feedback,damping){const n=a.length,D=Math.round(2*length*sr/343),buf=new Float32Array(D);let j=0,lp=0;
 for(let rep=0;rep<4;rep++)for(let i=0;i<n;i++){lp+=(buf[j]-lp)*damping;const v=a[i]-feedback*lp;buf[j]=v;j=(j+1)%D;if(rep===3)a[i]=v;}
}
export function cammedV8(sr,rpm=3500,load=1){
 const cycles=32,N=Math.round(sr*120/rpm*cycles),cycle=N/cycles,banks=[new Float32Array(N),new Float32Array(N)],flow=new Float32Array(N),on=Math.max(0,Math.min(1,load));
 const order=[1,8,4,3,6,5,7,2],strength=[1.06,.88,1.12,.85,.96,1.08,.90,1.02];
 for(let c=0;c<cycles;c++)for(let k=0;k<8;k++){
  const p=TAU*(c+(1-on)*k/8)/cycles,cam=(1-on)*(.28*Math.sin(p*16+.2)+.10*Math.sin(p*48+.9)),cyl=order[k],bank=cyl%2;
  const jitter=(1-on)*cycle*.003*(Math.sin(p*7+k*1.7)+.5*Math.sin(p*13-k));
  const at=c*cycle+k*cycle/8+jitter+sr*(bank?.00036:.00012),width=cycle*(on?.014:.012),rise=width*.3,len=Math.ceil(width*10),amp=strength[k]*(1+cam+.055*Math.sin(p*5+cyl));
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
 const fm=flow.reduce((s,x)=>s+x,0)/N,fr=Math.sqrt(flow.reduce((s,x)=>s+(x-fm)**2,0)/N)||1e-9,pressure=.16*level(out)/fr;
 for(let i=0;i<N;i++)out[i]+=pressure*(flow[i]-fm);
 filter(out,sr,'hp',35);filter(out,sr,'pk',120,.8,6);filter(out,sr,'pk',350,.9,6);filter(out,sr,'pk',1800,.85,2.0*on);
 filter(noise,sr,'hp',on?650:700);filter(noise,sr,'lp',Math.min(on?3700:18000,sr*(on?.15:.42)));
 if(!on){filter(noise,sr,'pk',2800,.7,5);filter(noise,sr,'pk',14000,.75,4);}
 const body=level(out),nr=level(noise),fg=level(flow),ng=body/nr*(on?.23:2.3),gain=.32/body;
 // Closed-throttle loop has continuous pulse-synchronous header chuff and
 // a two-cycle cam beat. At 870 RPM: firing 58 Hz; cam chop 3.625 Hz.
 // Pure procedural engine-order pressure retains the deep thump beneath rasp.
 for(let i=0;i<N;i++){
  const p=TAU*i/N,cam=on?1:.63+.30*Math.sin(p*16+.2)+.10*Math.sin(p*48+.9);
  const air=noise[i]*(on?.32+.55*Math.min(2,flow[i]/fg):.10+.85*Math.min(2,flow[i]/fg));
  const thump=on?0:body*(1.0*Math.sin(p*cycles*8)+.28*Math.sin(p*cycles*12+.4));
  out[i]=Math.tanh((out[i]+thump+ng*air)*gain*(on?1.65:1.1))*cam;
 }
 // Loaded layer retains its anti-alias reserve. The wider idle/off layer
 // uses native source resampling plus the existing smoothed output lowpass.
 const cutoff=Math.min(on?5200:17000,sr*(on?.14:.44));filter(out,sr,'lp',cutoff,.7);filter(out,sr,'lp',cutoff,.7);filter(out,sr,'hp',32);
 const scale=.18/level(out);for(let i=0;i<N;i++)out[i]*=scale;return out;
}
