import {qualityPreset} from './quality.js';
// Shared CPU/GPU track-UV surface. Metres and wheel passes, not frame count,
// drive accumulation. The same bilinear field deforms the mesh and tire physics.
const clamp = (x,a,b)=>Math.max(a,Math.min(b,x));
export class TrackSurface {
  constructor(track, quality='high') {
    this.track=track; this.quality=quality;
    const p=qualityPreset(quality);this.N=p.rutN;this.M=p.rutM;
    this.wave1=Math.round(track.P*2.8/(2*Math.PI))*2*Math.PI/track.P;this.wave2=Math.round(track.P*5.3/(2*Math.PI))*2*Math.PI/track.P;
    this.dx=track.P/this.N; this.dy=track.W/(this.M-1);
    this.wear=new Float32Array(this.N*this.M); this.ruts=new Float32Array(this.wear.length);
    this.clay=new Float32Array(this.N); this.mean=new Float32Array(this.M);this.roughMean=new Float32Array(this.M);
    this.bytes=new Uint8Array(this.N*this.M*4); this.version=0; this.passes=0;
    this.entry=new Float32Array(this.N);this.ripple=new Float32Array(this.N*this.M);this.edge=new Float32Array(this.M);
    for(let i=0;i<this.N;i++){const f=track.cornerFactor(i*this.dx);this.entry[i]=Math.min(1,4*f*(1-f)+.22*f);}
    // These waves depend on track coordinates, not on wear. Cache once rather
    // than doing tens of thousands of trigonometric samples every texture upload.
    for(let j=0;j<this.M;j++){const d=j*this.dy-track.W/2,u=(d+track.W/2)/track.W;this.edge[j]=Math.sin(Math.PI*clamp((u-.79)/.21,0,1)/2)**2;for(let i=0;i<this.N;i++){const s=i*this.dx;this.ripple[i*this.M+j]=.033*(Math.sin(s*this.wave1+d*5.2)*.65+Math.sin(s*this.wave2-d*3.7)*.35)-.014;}}
  }
  paint(s,d,distance,slip=0) {
    if(distance<=0 || d < -this.track.W/2 || d > this.track.W/2) return;
    const S=((s%this.track.P)+this.track.P)%this.track.P/this.dx, D=(d+this.track.W/2)/this.dy;
    const i0=Math.floor(S), j0=Math.floor(D), a=distance*.014;
    const ns=Math.ceil(2.3/this.dx), nd=Math.ceil(1.35/this.dy);
    for(let ii=i0-ns;ii<=i0+ns;ii++){
      const i=(ii%this.N+this.N)%this.N, ds=(ii-S)*this.dx;
      const longitudinal=Math.exp(-ds*ds/2.4);
      const ink=a*longitudinal;
      for(let j=Math.max(0,j0-nd);j<=Math.min(this.M-1,j0+nd);j++){
        const dd=(j-D)*this.dy, broad=Math.exp(-dd*dd/1.3);
        // Distinct tire trenches on both sides of the driven line.
        const tires=Math.exp(-(((dd-.83)/.21)**2))+Math.exp(-(((dd+.83)/.21)**2));
        const k=i*this.M+j;
        const old=this.wear[k];this.wear[k]=Math.min(1.4,old+ink*broad);
        this.mean[j]+=(this.wear[k]-old)/this.N;
        const oldRut=this.ruts[k];this.ruts[k]=Math.min(1.2,oldRut+ink*tires*(.65+Math.min(.8,Math.abs(slip))));
        this.roughMean[j]+=(this.ruts[k]-oldRut)*this.entry[i]/this.N;
      }
      this.clay[i]=Math.min(1.25,this.clay[i]+ink*(.22+Math.min(.7,Math.abs(slip))));
    }
    this.version++;this.passes+=distance/this.track.P;
  }
  sample(field,s,d) {
    const u=((s%this.track.P)+this.track.P)%this.track.P/this.dx, v=clamp((d+this.track.W/2)/this.dy,0,this.M-1);
    const i=Math.floor(u), j=Math.min(this.M-2,Math.floor(v)), a=u-i,b=v-j;
    const k=i*this.M+j,k1=((i+1)%this.N)*this.M+j;
    return (field[k]*(1-b)+field[k+1]*b)*(1-a)+(field[k1]*(1-b)+field[k1+1]*b)*a;
  }
  state(s,d) {
    if(d < -this.track.W/2 || d > this.track.W/2+.6)return {wear:0,rough:0,height:0};
    const wear=this.sample(this.wear,s,d), rut=this.sample(this.ruts,s,d);
    const f=this.track.cornerFactor(s), rough=rut*Math.min(1,4*f*(1-f)+.22*f);
    const u=(d+this.track.W/2)/this.track.W, edge=clamp((u-.79)/.21,0,1);
    const S=((s%this.track.P)+this.track.P)%this.track.P/this.dx,i=Math.floor(S), a=S-i;
    const clay=this.clay[i]*(1-a)+this.clay[(i+1)%this.N]*a;
    const ripple=Math.sin(s*this.wave1+d*5.2)*.65+Math.sin(s*this.wave2-d*3.7)*.35;
    const height=-.012*wear + rough*(.033*ripple-.014) + .12*clay*Math.sin(Math.PI*edge/2)**2;
    return {wear,rough,height};
  }
  lane(d) {
    const j=clamp(Math.round((d+this.track.W/2)/this.dy),0,this.M-1);
    return this.mean[j];
  }
  laneRough(d) {
    const j=clamp(Math.round((d+this.track.W/2)/this.dy),0,this.M-1);return this.roughMean[j];
  }
  regrid(quality) {
    if(quality===this.quality)return this;
    const next=new TrackSurface(this.track,quality);
    for(let i=0;i<next.N;i++){
      const s=i*next.dx,u=s/this.dx,k=Math.floor(u),a=u-k;
      next.clay[i]=this.clay[k%this.N]*(1-a)+this.clay[(k+1)%this.N]*a;
      for(let j=0;j<next.M;j++){
        const d=j*next.dy-this.track.W/2,n=i*next.M+j;
        next.wear[n]=this.sample(this.wear,s,d);next.ruts[n]=this.sample(this.ruts,s,d);
      }
    }
    next.passes=this.passes;next.version=this.version+1;next.upload();return next;
  }
  upload() {
    // Rows are lateral d, columns are arc-length s, matching texture UVs.
    this.mean.fill(0);this.roughMean.fill(0);
    for(let i=0;i<this.N;i++)for(let j=0;j<this.M;j++){
      const k=i*this.M+j, p=(j*this.N+i)*4, s=i*this.dx,d=j*this.dy-this.track.W/2;
      this.mean[j]+=this.wear[k]/this.N;
      const wear=this.wear[k],rough=this.ruts[k]*this.entry[i],height=-.012*wear+rough*this.ripple[k]+.12*this.clay[i]*this.edge[j];this.roughMean[j]+=rough/this.N;
      this.bytes[p]=Math.round(clamp(wear,0,1)*255);
      this.bytes[p+1]=Math.round(clamp(rough,0,1)*255);
      this.bytes[p+2]=Math.round(clamp(this.clay[i],0,1)*255);
      this.bytes[p+3]=Math.round(clamp((height+.12)/.3,0,1)*255);
    }
    this.uploaded=this.version;return this.bytes;
  }
}
