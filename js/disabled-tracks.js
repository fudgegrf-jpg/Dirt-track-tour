// ARCHIVE ONLY: deliberately NOT imported by the playable game.
// Restore by appending DISABLED_TRACKS to TRACKS and DISABLED_ROUTES to ROUTES
// in data.js, then bump SEASON_TRACK_VERSION and update its migration/tests.
// All shared procedural geometry/textures/lighting code is retained.
export const DISABLED_TRACKS = [
  { id:'i55', name:'I-55 Raceway', short:'I-55', city:'Pevely, MO', lat:38.28, lon:-90.40,
    size:'1/3-mile', desc:'Banked bullring right off the interstate. Wheel-to-wheel action.', event:'Riverbottom Classic',
    L:90, R:44, W:17, bank:16, laps:9, purse:1.0, clay:[0.46,0.25,0.15], cushion:0.9 },
  { id:'knoxville', name:'Knoxville Raceway', short:'Knoxville', city:'Knoxville, IA', lat:41.32, lon:-93.11,
    size:'1/2-mile', desc:'"Sprint Car Capital" semi-banked half-mile. Long straights, black Iowa gumbo.', event:'Heartland Nationals',
    L:170, R:62, W:22, bank:10, laps:6, purse:1.3, clay:[0.36,0.22,0.15], cushion:0.7 },
  { id:'eldora', name:'Eldora Speedway', short:'Eldora', city:'Rossburg, OH', lat:40.33, lon:-84.63,
    size:'1/2-mile', desc:'"The Big E". Ultra high-banked, cushion right against the wall. A crown-jewel summer event.', event:'Big E Summer Classic',
    L:140, R:60, W:21, bank:24, laps:6, purse:2.0, clay:[0.55,0.29,0.17], cushion:1.2 },
];
export const DISABLED_ROUTES = [
  { from:'batesville', to:'i55', hwy:['US-67 N','I-55 N'], main:'US-67 N',
    pts:[[-91.64,35.77],[-90.96,36.07],[-90.39,36.76],[-90.45,37.60],[-90.40,38.28]],
    cities:['Walnut Ridge','Poplar Bluff','Fredericktown'] },
  { from:'i55', to:'knoxville', hwy:['I-70 W','I-35 N','IA-92 E'], main:'I-35 N',
    pts:[[-90.40,38.28],[-90.30,38.70],[-92.33,38.95],[-94.58,39.10],[-94.02,40.25],[-93.62,41.59],[-93.11,41.32]],
    cities:['St. Louis','Columbia','Kansas City','Bethany','Des Moines'] },
  { from:'knoxville', to:'eldora', hwy:['I-80 E','I-74 E','I-70 E','US-127 N'], main:'I-74 E',
    pts:[[-93.11,41.32],[-93.05,41.70],[-90.58,41.52],[-89.59,40.69],[-88.24,40.12],[-86.16,39.77],[-84.89,39.83],[-84.63,40.33]],
    cities:['Newton','Davenport','Peoria','Champaign','Indianapolis','Richmond'] },
];
