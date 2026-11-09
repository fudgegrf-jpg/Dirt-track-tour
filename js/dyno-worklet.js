// Jayden Fudge's authorized engine recording; persistent sample player only.
// Two adjacent RPM loops, phase-coherent in 720-degree engine cycles. No node
// creation, network, allocations, FFTs, or synthesized cylinders in process().
class JaydenDynoProcessor extends AudioWorkletProcessor{
 static get parameterDescriptors(){return[{name:'active',defaultValue:0,minValue:0,maxValue:1,automationRate:'k-rate'},{name:'rpm',defaultValue:2000,minValue:500,maxValue:11000,automationRate:'k-rate'},{name:'load',defaultValue:0,minValue:0,maxValue:1,automationRate:'k-rate'}];}
 constructor({processorOptions:o}){super();this.loops=o.loops;this.release=o.release;this.phase=o.phase||0;this.fade=0;this.tail=-1;this.armed=false;this.alive=true;this.coast=0;this.stride=o.cheap?2:1;this.lastOutput=0;this.port.onmessage=e=>{if(e.data?.dispose)this.alive=false;};}
 read(b,phase){const data=b.data,n=data.length,x=(phase/b.cycles*n)%n,i=Math.floor(x),u=x-i;return data[i]+(data[(i+1)%n]-data[i])*u;}
 process(inputs,outputs,p){if(!this.alive)return false;const y=outputs[0][0],rpm=p.rpm[0],load=p.load[0],loops=this.loops;if(p.active[0]<.001){this.phase+=rpm/(120*sampleRate)*y.length;this.tail=-1;this.armed=false;this.fade=0;this.coast=0;this.lastOutput=0;return true;}let i=0;while(i<loops.length-2&&rpm>loops[i+1].rpm)i++;
  const a=loops[i],b=loops[i+1],u=Math.max(0,Math.min(1,(Math.log(rpm)-Math.log(a.rpm))/(Math.log(b.rpm)-Math.log(a.rpm)))),ga=Math.cos(u*Math.PI/2),gb=Math.sin(u*Math.PI/2),step=rpm/(120*sampleRate);
  if(load>.65)this.armed=true;if(this.armed&&load<.25&&rpm>3500){this.tail=0;this.tailRate=Math.max(.6,Math.min(1.1,rpm/7800))*this.release.sampleRate/sampleRate;this.armed=false;}
  const tail=this.release.data,da=a.data,db=b.data,na=da.length,nb=db.length;
  let xa=((this.phase+a.phaseOffset)/a.cycles%1)*na,xb=((this.phase+b.phaseOffset)/b.cycles%1)*nb;
  const stride=this.stride,sa=step*na/a.cycles*stride,sb=step*nb/b.cycles*stride,coastK=stride===2?.4816:.28,dry=.72+.28*load,wet=.28*(1-load),fadeStep=stride/(sampleRate*.035),norm=1/Math.sqrt(1+2*ga*gb*a.correlation);
  for(let k=0;k<y.length;k+=stride){
   const ia=xa|0,ib=xb|0,qa=xa-ia,qb=xb-ib;
   let v=(da[ia]+(da[ia+1<na?ia+1:0]-da[ia])*qa)*ga+(db[ib]+(db[ib+1<nb?ib+1:0]-db[ib])*qb)*gb;v*=norm;
   xa+=sa;if(xa>=na)xa-=na;xb+=sb;if(xb>=nb)xb-=nb;
   // The source has no long steady overrun take: reduce pressure on lift,
   // retaining the real recorded header tone, plus its short actual release.
   this.coast+=(v-this.coast)*coastK;v=v*dry+this.coast*wet;
   if(this.tail>=0){const j=Math.floor(this.tail);if(j<tail.length-1){const q=this.tail-j;v+=(tail[j]+(tail[j+1]-tail[j])*q)*.24;this.tail+=this.tailRate*stride;}else this.tail=-1;}
   this.fade=Math.min(1,this.fade+fadeStep);const value=v*this.fade;if(stride===2){y[k]=(this.lastOutput+value)*.5;y[k+1]=value;}else y[k]=value;this.lastOutput=value;
  }
  this.phase+=step*y.length;return true;
 }
}
registerProcessor('jayden-dyno',JaydenDynoProcessor);
