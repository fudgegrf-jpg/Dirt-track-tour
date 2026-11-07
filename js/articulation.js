// Independent trailer axle body + a holonomic fifth-wheel/kingpin constraint.
// The hitch fixes translation, NOT heading: its tandem axles follow their own
// inside path, with yaw inertia, tire damping, wind and a soft jackknife stop.
const wrap=a=>Math.atan2(Math.sin(a),Math.cos(a));
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
export const HITCH=-2.6,AXLE=13.225,JACKKNIFE=1.05;
function hitch(m,T){const a=m.at(T.S),p=m.pt(T.S,T.lat),th=a.th+T.yaw;return{x:p.x+HITCH*Math.cos(th),z:p.z+HITCH*Math.sin(th),th};}
export function ensureTrailer(m){const T=m.t,h=hitch(m,T);if(!T.trailerBody||Math.abs((T.trailerBody.sourceS??T.S)-T.S)>40){const heading=h.th+(T.trailer||0);T.trailerBody={mass:T.trailerBody?.mass||12800,heading,yawRate:T.tw||0,x:h.x-AXLE*Math.cos(heading),z:h.z-AXLE*Math.sin(heading),vx:0,vz:0,sourceS:T.S,hitchX:h.x,hitchZ:h.z};}return T.trailerBody;}
export function syncTrailer(m){const T=m.t,B=ensureTrailer(m),h=hitch(m,T);B.heading=h.th+T.trailer;B.yawRate=T.tw??B.yawRate;B.hitchX=h.x;B.hitchZ=h.z;B.x=h.x-AXLE*Math.cos(B.heading);B.z=h.z-AXLE*Math.sin(B.heading);B.sourceS=T.S;const a=m.at(T.S),p=m.pt(T.S,T.lat),dx=B.x-p.x,dz=B.z-p.z;B.S=T.S+dx*Math.cos(a.th)+dz*Math.sin(a.th);B.lat=T.lat-dx*Math.sin(a.th)+dz*Math.cos(a.th);B.yaw=wrap(B.heading-m.at(B.S).th);}
export function stepTrailer(m,dt,previous,wind=0,bow=0){if(!(dt>0)){syncTrailer(m);return;}const T=m.t,B=ensureTrailer(m),h=hitch(m,T),old=hitch(m,previous),ox=B.x,oz=B.z;const vx=(h.x-old.x)/dt,vz=(h.z-old.z)/dt;
 const target=(-vx*Math.sin(B.heading)+vz*Math.cos(B.heading))/AXLE;
 const inertia=Math.sqrt(B.mass/12800);B.yawRate+=(target-B.yawRate)*(1-Math.exp(-dt*5/inertia));B.yawRate+=(wind*.007+bow*.1)*dt;
 const relative=wrap(B.heading-h.th),outward=Math.sign(relative)*B.yawRate;
 if(Math.abs(relative)>JACKKNIFE-.15&&outward>0)B.yawRate*=Math.exp(-dt*20);
 B.heading+=B.yawRate*dt;T.trailer=clamp(wrap(B.heading-h.th),-JACKKNIFE,JACKKNIFE);B.heading=h.th+T.trailer;T.tw=B.yawRate;syncTrailer(m);B.vx=(B.x-ox)/dt;B.vz=(B.z-oz)/dt;B.speed=Math.hypot(B.vx,B.vz);
}
