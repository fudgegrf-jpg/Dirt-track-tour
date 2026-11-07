export const DEFAULT_DRIVER = 'Jayden Fudge';
export const DEFAULT_PROFILE = Object.freeze({driver:DEFAULT_DRIVER,team:'Red Clay Racing',num:'42',color:0xf1f0e7,accent:0x135bc4,cageColor:0x135bc4,scheme:8});
// Only the complete legacy identity/paint tuple qualifies, never a customized team/car.
export function migrateDefaultLivery(s) {
 if(!s || s.liveryDefaultsVersion>=2)return false;
 const name=typeof s.driver==='string'&&s.driver.trim()?s.driver:DEFAULT_DRIVER;
 const untouched=(name===DEFAULT_DRIVER||name==='Dale Rhodes')&&String(s.num??'21')==='21'
  &&(s.team??'Red Clay Racing')==='Red Clay Racing'&&(s.color??0xc81d25)===0xc81d25
  &&(s.accent??0xffffff)===0xffffff&&(s.cageColor??0xc92127)===0xc92127&&(s.scheme??4)===4
  &&(s.sponsor==null||s.sponsor==='RED CLAY RACING')&&s.third==null;
 if(!untouched)return false;
 for(const key of ['num','color','accent','cageColor','scheme'])s[key]=DEFAULT_PROFILE[key];
 s.liveryDefaultsVersion=2;return true;
}
// Season data: real, well-known US dirt tracks (geometry is a stylized approximation).
export const TRACKS = [
  { id:'salina', name:'Salina Highbanks Speedway', short:'Salina', city:'Pryor Creek, OK', lat:36.29555, lon:-95.200245,
    size:'3/8-mile', desc:'Narrow Oklahoma highbanks. Dark, moist clay beneath the aluminum grandstands.', event:'Highbanks Showdown',
    L:110, R:61, W:17, bank:26, laps:6, purse:1.0, clay:[0.32,0.22,0.15], cushion:1.0 },
  { id:'batesville', name:'Batesville Motor Speedway', short:'Batesville', city:'Locust Grove, AR', lat:35.77, lon:-91.64,
    size:'3/8-mile', desc:'Tight Arkansas bullring. Slick, rough, races around the bottom.', event:'Ozark Showdown',
    L:110, R:48, W:18, bank:13, laps:8, purse:0.9, clay:[0.58,0.30,0.17], cushion:0.6 },
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

// Interstate routes between rounds (waypoints lon/lat roughly along the real highways)
export const ROUTES = [
  { from:'salina', to:'batesville', hwy:['OK-20 E','US-412 E','US-63 S','US-167 S'], main:'US-412 E',
    pts:[[-95.200245,36.29555],[-94.8,36.17],[-94.14,36.18],[-93.72,36.08],[-93.12,36.23],[-91.48,36.31],[-91.64,35.77]],
    cities:['Siloam Springs','Springdale','Huntsville','Harrison','Hardy'] },
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

// skill = raw pace, aggr = how hard they push/pass/follow, cons = consistency (fewer mistakes), lane = favorite groove
// (-1 bottom .. +1 cushion), adapt = how quickly they move up as the track slicks off.
export const AI_DRIVERS = [
  { name:'Cody Strickland', kind:'veteran', num:'7S', color:0x1e5fd8, accent:0xffffff, skill:0.958, aggr:0.55, cons:0.96, lane:0.55, adapt:0.3, style:'Cushion king',       sponsor:'CLAYMASTER TIRES', livery:{ scheme:2, third:0xf2c014 } },
  { name:'Jared McCrary', kind:'slider',   num:'99', color:0xf2c014, accent:0x111111, skill:0.95,aggr:0.8,  cons:0.9,  lane:-0.4, adapt:0.8, style:'Slider artist',      sponsor:'RED DIRT OIL', livery:{ scheme:1, third:0xffffff } },
  { name:'Bo Tillman', kind:'veteran',      num:'18', color:0x1f9e4a, accent:0xffffff, skill:0.944, aggr:0.45, cons:0.95, lane:0.1,  adapt:0.6, style:'Smooth veteran',     sponsor:'BIG E FEED & SEED', livery:{ scheme:7, third:0x111214 } },
  { name:'Tanner Haskins', kind:'slider',  num:'44', color:0xe8e8e8, accent:0xc81d25, skill:0.935,aggr:0.9,  cons:0.82, lane:0.68, adapt:0.2, style:'Wall-banger',        sponsor:'BACKROADS DIESEL', livery:{ scheme:6, third:0x111214 } },
  { name:'Ricky Pruitt', kind:'bottom',    num:'3P', color:0x7a2bd1, accent:0xffd400, skill:0.93,aggr:0.35, cons:0.93, lane:-0.15,adapt:0.5, style:'Points racer',       sponsor:'NIGHT SHIFT ENERGY', livery:{ scheme:3, third:0xffffff } },
  { name:'Wade Kimbrough', kind:'bottom',  num:'1K', color:0xff6a00, accent:0x111111, skill:0.925,aggr:0.7,  cons:0.85, lane:-0.55,adapt:0.7, style:'Bottom feeder',      sponsor:"HAULIN' HOGS BBQ", livery:{ scheme:5, third:0xffffff } },
  { name:'Shane Dupree', kind:'rookie',    num:'57', color:0x111214, accent:0xffffff, skill:0.918,aggr:0.6,  cons:0.8,  lane:0.3,  adapt:0.5, style:'Rookie hotshoe',     sponsor:'SLICK TRACK BREWING', livery:{ scheme:0, third:0x8a2be2 } },
];

export const POINTS = [50, 44, 40, 37, 35, 33, 31, 29];
export const PURSE  = [10000, 6000, 4200, 3200, 2400, 1800, 1500, 1200];
// contingency / bonus money paid on top of the purse
export const BONUS = { lapLed: 150, hardCharger: 600, clean: 300, pole: 0, contingencyTop5: 250 };

export const UPGRADES = {
  engine: { label:'Engine', names:['Crate 604','Built 400ci','Open 430ci','Big-Block 470ci'], cost:[0,6000,11000,18000], desc:'More horsepower off the corner.' },
  tires:  { label:'Tires',  names:['Hard','Medium','Soft','Grooved Soft'], cost:[0,2500,4500,7000], desc:'More side bite on slick clay.' },
  shocks: { label:'Shocks', names:['Stock','Valved','Coil-over','Custom 4-link'], cost:[0,3000,5500,9000], desc:'Calmer rear under throttle; less snap oversteer.' },
};

export const CREW_POOL = [
  { id:'c1', role:'Crew Chief', name:'Earl "Wrench" Dawson', skill:4, salary:900, perk:'+grip from setup' },
  { id:'c2', role:'Crew Chief', name:'Lacey Moon', skill:2, salary:450, perk:'+grip from setup' },
  { id:'m1', role:'Mechanic',   name:'Hector Ruiz', skill:4, salary:700, perk:'cheaper repairs, faster loading' },
  { id:'m2', role:'Mechanic',   name:'Skeeter Boyd', skill:2, salary:350, perk:'cheaper repairs, faster loading' },
  { id:'t1', role:'Tire Guy',   name:'Junior Pratt', skill:3, salary:400, perk:'grooving & siping = more bite' },
  { id:'d1', role:'Co-Driver',  name:'Marla Jenkins (CDL-A)', skill:3, salary:600, perk:'shares the wheel: slower fatigue, can auto-haul' },
];
