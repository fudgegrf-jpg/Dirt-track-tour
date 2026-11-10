// Geometry checks for the level backstretch pit lane. No DOM, no WebGL.
import { OvalTrack } from '../js/physics.js';
import { TRACKS } from '../js/data.js';
import { pitLanePlan, outwardSign } from '../js/pit-path.js';
import { inPitGate, pitGateHalfArc, PIT_BLEND_FROM, PIT_BLEND_LEN } from '../js/pit-gate.js';

const wrap = a => { while (a > Math.PI) a -= 2 * Math.PI; while (a < -Math.PI) a += 2 * Math.PI; return a; };
const fails = [];
const check = (name, ok, detail) => { if (!ok) fails.push(name + (detail ? ' — ' + detail : '')); };

for (const id of ['salina', 'batesville']) {
  const T = TRACKS.find(t => t.id === id);
  const trk = new OvalTrack({ ...T, surfaceQuality: 'low' });
  const origin = { x: trk.point(trk.s3 + Math.PI * trk.R / 2, trk.outer).x - 105 };
  const plan = pitLanePlan(trk, origin);
  const pts = plan.pts;
  check(id + ' length', plan.length > 140 && plan.length < 280, plan.length.toFixed(1));
  check(id + ' shelf height', plan.shelfY > 0.4 && plan.shelfY < 3, plan.shelfY.toFixed(2));
  check(id + ' gate on the opening', inPitGate(trk, plan.gateS));
  check(id + ' opening wide enough', pitGateHalfArc(trk) > 6 && pitGateHalfArc(trk) < 9, pitGateHalfArc(trk).toFixed(2));

  let minR = 1e9, maxGrade = 0;
  const signs = new Set();
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i], ds = b.along - a.along;
    if (i > 1) {
      const dth = Math.abs(wrap(b.th - pts[i - 2].th)), ds2 = b.along - pts[i - 2].along;
      if (dth > 1e-4) minR = Math.min(minR, ds2 / dth);
    }
    if (ds > 0.05) maxGrade = Math.max(maxGrade, Math.abs(b.y - a.y) / ds);
    signs.add(outwardSign(trk, b.x, b.z, Math.cos(b.th), Math.sin(b.th)));
  }
  check(id + ' curve radius', minR > 40, minR.toFixed(1) + ' m');
  check(id + ' grade', maxGrade < 0.09, (maxGrade * 100).toFixed(1) + '%');
  check(id + ' outward side stable', signs.size === 1, [...signs].join(','));

  const settledAt = trk.s2 + PIT_BLEND_FROM + PIT_BLEND_LEN;
  const parallel = pts.filter(p => p.s && p.s >= settledAt - 1 && p.s <= plan.leaveS);
  check(id + ' has a parallel run', parallel.length > 4, String(parallel.length));
  const ang = Math.max(...parallel.map(p => Math.abs(p.ang) * 180 / Math.PI));
  check(id + ' parallel to the straight', ang < 2.5, ang.toFixed(2) + '°');
  const flare = pts.filter(p => p.s && p.out > 0.2 && p.s < settledAt);
  const flareAng = Math.max(...flare.map(p => Math.abs(p.ang) * 180 / Math.PI));
  check(id + ' merge angle', flareAng < 12, flareAng.toFixed(2) + '°');
  const ySpread = Math.max(...parallel.map(p => p.y)) - Math.min(...parallel.map(p => p.y));
  check(id + ' shelf is level', ySpread < 0.02, ySpread.toFixed(3) + ' m');
  check(id + ' shelf matches the wall', Math.abs(parallel[0].y - plan.shelfY) < 0.02);

  const before = pts.filter(p => p.along < plan.clearAlong + 0.5 && p.out > 1.2 && p.out < 7);
  const broke = before.filter(p => Math.abs(p.y - plan.shelfY) > 0.04);
  check(id + ' no early drop beside the wall', broke.length === 0, String(broke.length));

  const end = pts.at(-1);
  check(id + ' meets the lot flat', Math.abs(end.y) < 0.02 && end.z > -52.2 && end.z < -50.8, `y ${end.y.toFixed(3)} z ${end.z.toFixed(1)}`);
  check(id + ' stays outside after the gate', pts.filter(p => p.along > 40 && p.out < -0.3).length === 0);

  if (id === 'salina') {
    const backZ = -(T.R + trk.outer + 18);
    for (const [x, z, w] of [[-84, backZ - 5, 18], [-105, backZ - 5, 14]]) {
      let md = 1e9;
      for (const p of pts) {
        const dx = Math.max(0, Math.abs(p.x - x) - w / 2), dz = Math.max(0, Math.abs(p.z - z) - 3.5);
        md = Math.min(md, Math.hypot(dx, dz));
      }
      check('salina shed ' + x + ' clearance', md > 8, md.toFixed(1) + ' m');
    }
  }
}

if (fails.length) {
  console.error(fails.join('\n'));
  process.exit(1);
}
console.log('pit-road plan ok (' + TRACKS.map(t => t.id).join(', ') + ')');
