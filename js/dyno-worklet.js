import {cylinderCutGain} from './engine-limiter.js';
// Night18: Garrett's synthesized V8 pack (seamless loops at the pack's shared gain);
// persistent sample player only. Two loop sets (on-throttle and off-throttle),
// each crossfaded equal-power only with its RPM neighbours. Phase is a shared
// 720-degree engine clock. Cubic interpolation, no allocation, network or node
// creation in process(). Optional fixed tone EQ and output trim come from the
// bank (none of it follows RPM); a soft knee rounds only rare peaks.
const KNEE=.45;
function biquad(type,f,gainDB,q,fs){const A=Math.pow(10,gainDB/40),w=2*Math.PI*Math.min(f,fs*.45)/fs,c=Math.cos(w),s=Math.sin(w);let b0,b1,b2,a0,a1,a2;
 if(type==='peak'){const al=s/(2*q);b0=1+al*A;b1=-2*c;b2=1-al*A;a0=1+al/A;a1=-2*c;a2=1-al/A;}
 else{const al=s/2*Math.sqrt((A+1/A)*(1/q-1)+2),r=2*Math.sqrt(A)*al;b0=A*((A+1)+(A-1)*c+r);b1=-2*A*((A-1)+(A+1)*c);b2=A*((A+1)+(A-1)*c-r);a0=(A+1)-(A-1)*c+r;a1=2*((A-1)-(A+1)*c);a2=(A+1)-(A-1)*c-r;}
 return{b0:b0/a0,b1:b1/a0,b2:b2/a0,a1:a1/a0,a2:a2/a0,z1:0,z2:0};}
class EngineLoopProcessor extends AudioWorkletProcessor{
 static get parameterDescriptors(){return[{name:'active',defaultValue:0,minValue:0,maxValue:1,automationRate:'k-rate'},{name:'rpm',defaultValue:2000,minValue:500,maxValue:11000,automationRate:'k-rate'},{name:'load',defaultValue:0,minValue:0,maxValue:1,automationRate:'k-rate'},{name:'limiter',defaultValue:0,minValue:0,maxValue:1,automationRate:'k-rate'}];}
 constructor({processorOptions:o}){super();this.on=o.on;this.off=o.off;this.phase=o.phase||0;this.fade=0;this.alive=true;this.stride=o.cheap?2:1;this.lastOutput=0;const fs=sampleRate/this.stride;this.level=o.level??1;this.lift=o.lift!==false;this.eq=(o.eq||[]).map(e=>biquad(e[0],e[1],e[2],e[3],fs));this.slots=[0,1,2,3].map(()=>({l:null,g:0,x:0,s:0}));this.port.onmessage=e=>{if(e.data?.dispose)this.alive=false;};}
 pick(set,rpm,w,o){let i=0;while(i<set.length-2&&rpm>set[i+1].rpm)i++;const a=set[i],b=set[i+1],u=Math.max(0,Math.min(1,Math.log(rpm/a.rpm)/Math.log(b.rpm/a.rpm))),ga=Math.cos(u*Math.PI/2),gb=Math.sin(u*Math.PI/2),norm=w/Math.sqrt(1+2*ga*gb*a.correlation),A=this.slots[o],B=this.slots[o+1];A.l=a;A.g=ga*norm;B.l=b;B.g=gb*norm;}
 process(inputs,outputs,p){if(!this.alive)return false;const y=outputs[0][0],rpm=p.rpm[0],load=p.load[0],step=rpm/(120*sampleRate);
  if(p.active[0]<.001){this.phase+=step*y.length;this.fade=0;this.lastOutput=0;return true;}
  // Optional: above the top off-throttle loop, lift-off can borrow the on loop.
  const off=this.off,top=off[off.length-1].rpm,h=!this.lift||rpm<=top?0:Math.min(1,Math.log(rpm/top)/.14),le=load+(1-load)*h;
  this.pick(this.on,rpm,Math.sin(le*Math.PI/2),0);this.pick(off,rpm,Math.cos(le*Math.PI/2),2);
  const S=this.slots,stride=this.stride;
  for(const s of S){if(s.g<1e-4){s.g=0;continue;}const n=s.l.data.length;s.x=((this.phase+s.l.phaseOffset)/s.l.cycles%1)*n;s.s=step*n/s.l.cycles*stride;}
  const fadeStep=stride/(sampleRate*.035),lim=p.limiter[0];
  for(let k=0;k<y.length;k+=stride){
   let v=0;
   for(let j=0;j<4;j++){const s=S[j];if(!s.g)continue;const d=s.l.data,n=d.length,x=s.x,i=x|0,t=x-i,xm=d[i?i-1:n-1],x0=d[i],x1=d[i+1<n?i+1:i+1-n],x2=d[i+2<n?i+2:i+2-n];
    v+=s.g*((((.5*(x2-xm)+1.5*(x0-x1))*t+(xm-2.5*x0+2*x1-.5*x2))*t+.5*(x1-xm))*t+x0);let nx=x+s.s;if(nx>=n)nx-=n;s.x=nx;}
   const m=v<0?-v:v;if(m>KNEE)v=(v<0?-1:1)*(KNEE+(m-KNEE)/(1+(m-KNEE)*2.5));
   for(let e=0;e<this.eq.length;e++){const q=this.eq[e],o=q.b0*v+q.z1;q.z1=q.b1*v-q.a1*o+q.z2;q.z2=q.b2*v-q.a2*o;v=o;}
   v*=this.level;this.fade=Math.min(1,this.fade+fadeStep);// Firing-phase limiter cuts at audio rate (Night16 behavior).
   const value=v*this.fade*cylinderCutGain((this.phase+step*k)*8,lim);if(stride===2){y[k]=(this.lastOutput+value)*.5;y[k+1]=value;}else y[k]=value;this.lastOutput=value;
  }
  this.phase+=step*y.length;return true;
 }
}
registerProcessor('jayden-dyno',EngineLoopProcessor);
