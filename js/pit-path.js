// Plan of the pit lane: parallel to the backstretch, then one gentle curve into
// the paddock. Pure math (no THREE) so geometry tests can run in node.
import {pitGateS,pitOffset,PIT_BLEND_FROM,PIT_LEAVE_BEFORE} from './pit-gate.js';
const lerp=(a,b,t)=>a+(b-a)*t;
const clamp=(v,a,b)=>Math.max(a,Math.min(b,v));
const wrap=a=>{while(a>Math.PI)a-=2*Math.PI;while(a<-Math.PI)a+=2*Math.PI;return a;};
// Smootherstep. Zero slope at both ends so the shelf and the lot join without a kink.
const drop=u=>{u=clamp(u,0,1);return u*u*u*(u*(u*6-15)+10);};
export function pitLanePlan(trk,origin){
 const gateS=pitGateS(trk),entryS=trk.s2+PIT_BLEND_FROM,leaveS=trk.s3-PIT_LEAVE_BEFORE,shelfY=trk.height(gateS,trk.outer);
 const pts=[];
 for(let s=entryS;s<=leaveS+1e-6;s+=2){const d=pitOffset(trk,Math.min(s,leaveS)),p=trk.point(Math.min(s,leaveS),d);pts.push({x:p.x,z:p.z,s,d});}
 const prev=pts.at(-2),last=pts.at(-1),th0=Math.atan2(last.z-prev.z,last.x-prev.x);
 const ex=origin.x+63,endTh=Math.PI-0.52;
 const P0=last,P3={x:ex,z:-51.35},L1=50,L2=36;
 const P1={x:P0.x+Math.cos(th0)*L1,z:P0.z+Math.sin(th0)*L1};
 const P2={x:P3.x-Math.cos(endTh)*L2,z:P3.z-Math.sin(endTh)*L2};
 for(let i=1;i<=36;i++){const t=i/36,mt=1-t;pts.push({x:mt**3*P0.x+3*mt*mt*t*P1.x+3*mt*t*t*P2.x+t**3*P3.x,z:mt**3*P0.z+3*mt*mt*t*P1.z+3*mt*t*t*P2.z+t**3*P3.z});}
 let along=0;
 for(let i=0;i<pts.length;i++){
  const p=pts[i];
  if(i){const dx=p.x-pts[i-1].x,dz=p.z-pts[i-1].z;along+=Math.hypot(dx,dz);p.th=Math.atan2(dz,dx);}
  else p.th=th0;
  p.along=along;
  const q=trk.project(p.x,p.z);p.out=q.d-trk.outer;p.qs=q.s;
  p.trackTh=trk.center(q.s).th;p.ang=wrap(p.th-p.trackTh);
 }
 const length=along;
 let clearAlong=length;
 for(const p of pts)if(p.out>8){clearAlong=p.along;break;}
 const descendLen=Math.max(36,Math.min(72,length-clearAlong-14));
 for(const p of pts)p.y=p.out<0.15?trk.height(p.qs,trk.project(p.x,p.z).d):lerp(shelfY,0,drop((p.along-clearAlong)/descendLen));
 return {pts,gateS,entryS,entryD:pitOffset(trk,entryS),leaveS,shelfY,length,clearAlong,descendLen,ex};
}
// Positive when offsetting to the left of travel moves away from the oval.
export function outwardSign(trk,x,z,dx,dz){
 const len=Math.hypot(dx,dz)||1;dx/=len;dz/=len;
 const ox=x-dz*3,oz=z+dx*3;
 return trk.project(ox,oz).d>=trk.project(x,z).d?1:-1;
}
