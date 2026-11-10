// Shared visual/physical gate limits, measured along the OUTER wall, not
// centerline arc length. The opening is where the level pit lane crosses the
// wall on the backstretch. It is a closed gate while racing (trk.pitOpen false)
// and only open in the post-race paddock scene.
const smooth=x=>{x=Math.max(0,Math.min(1,x));return x*x*(3-2*x);};
// Peel starts just after turn 2's easement. The offset eases onto a shelf
// parallel to the backstretch, then the lane holds that shelf until it leaves
// for the paddock before turn 3 starts to bank.
export const PIT_BLEND_FROM=16,PIT_BLEND_LEN=56,PIT_LEAVE_BEFORE=20,PIT_SHELF=4.25,PIT_INSET=2.6;
export function pitOffset(t,s){
 const a=t.s2+PIT_BLEND_FROM,b=a+PIT_BLEND_LEN,d0=t.outer-PIT_INSET,d1=t.outer+PIT_SHELF;
 if(s<=a)return d0;if(s>=b)return d1;return d0+(d1-d0)*smooth((s-a)/(b-a));
}
export const pitGateS=t=>{const a=t.s2+PIT_BLEND_FROM,b=a+PIT_BLEND_LEN;let lo=a,hi=b;for(let i=0;i<28;i++){const m=(lo+hi)/2;if(pitOffset(t,m)<t.outer)lo=m;else hi=m;}return (lo+hi)/2;};
export const pitGateHalfArc=t=>7.5/(1+t.curvature(pitGateS(t))*t.outer);
export const inPitGate=(t,s,margin=0)=>Math.abs(((s-pitGateS(t)+t.P*1.5)%t.P)-t.P*.5)<pitGateHalfArc(t)+margin;
