// Shared visual/physical gate limits, measured along the OUTER wall, not
// centerline arc length. A 4.8 m opening is about two late-model body widths.
export const pitGateS=t=>t.s2-Math.min(25,t.R*.35);
export const pitGateHalfArc=t=>2.4/(1+t.curvature(pitGateS(t))*t.outer);
export const inPitGate=(t,s,margin=0)=>Math.abs(((s-pitGateS(t)+t.P*1.5)%t.P)-t.P*.5)<pitGateHalfArc(t)+margin;
