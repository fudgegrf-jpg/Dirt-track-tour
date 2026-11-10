// Shared visual/physical gate limits, measured along the OUTER wall, not
// centerline arc length. A 4.8 m opening is about two late-model body widths.
// Night20: the pit lane peels straight off the end of the backstretch, right before turn 3 (was a narrow
// gate late in turn 2). The opening is where the lane's shallow (11 deg) split crosses the wall line. It is a
// closed gate while racing (trk.pitOpen false) and only open in the post-race paddock scene.
export const pitGateS=t=>t.s3-24.5;
export const pitGateHalfArc=t=>7.5/(1+t.curvature(pitGateS(t))*t.outer);
export const inPitGate=(t,s,margin=0)=>Math.abs(((s-pitGateS(t)+t.P*1.5)%t.P)-t.P*.5)<pitGateHalfArc(t)+margin;
