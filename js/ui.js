import {PLAYER_ID,driverIdFor,driverName,migrateDriverIds} from './driver-identity.js';
import {storage} from './storage.js';
// 2D overlay screens (DOM): title, schedule, shop, results, route map, arrival, season summary.
import { DEFAULT_DRIVER, DEFAULT_PROFILE, TRACKS, ROUTES, AI_DRIVERS, UPGRADES, CREW_POOL, POINTS } from './data.js';

const $ = (html) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; };
export const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
export const icon = (name) => {
 const paths={arrow:'<path d="M4 12h15m-6-6 6 6-6 6"/>',check:'<path d="m5 12 4 4L19 6"/>',settings:'<path d="m9 3 1-1h4l1 3 3 1 3 1-1 4v3l1 3-3 2-3 1-1 2h-4l-1-3-3-1-3-1 1-4v-3L3 7l3-2 3-1Z"/><circle cx="12" cy="12" r="3"/>',flag:'<path d="M5 21V4m0 0c5-5 9 5 14 0v10c-5 5-9-5-14 0"/><path d="M5 9c5-5 9 5 14 0M12 4v10"/>',close:'<path d="m6 6 12 12M6 18 18 6"/>'};
 return `<svg class="ui-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name]||paths.arrow}</svg>`;
};
const brand=()=>`<div class="brand">${icon('flag')}<span>DIRT TRACK TOUR</span></div>`;
const header=(label,right='2026 SEASON')=>`<header class="front-header">${brand()}<span class="header-context">${label}</span><span class="header-meta">${right}</span></header>`;
const hex = (n) => '#' + (n >>> 0).toString(16).padStart(6, '0');
const fmt = (n) => '$' + Math.round(n).toLocaleString('en-US');
export const REPAIR_PER_PT = 70, HAULER_PER_PT = 90, LATE_FEE = 500;

export function routeMiles(route) {
  let m = 0; const R = 3958.8, rad = Math.PI / 180;
  for (let i = 1; i < route.pts.length; i++) {
    const [lo1, la1] = route.pts[i - 1], [lo2, la2] = route.pts[i];
    const a = Math.sin((la2 - la1) * rad / 2) ** 2 + Math.cos(la1 * rad) * Math.cos(la2 * rad) * Math.sin((lo2 - lo1) * rad / 2) ** 2;
    m += 2 * R * Math.asin(Math.sqrt(a));
  }
  return Math.round(m * 1.12);
}
export const deadlineHours = (route, st) => routeMiles(route) / 58 + 2.5 + (st.slackBonus || 0);
function repairCost(app) { const mech = app.crew('Mechanic'); return Math.round(app.state.carDmg * REPAIR_PER_PT * (1 - (mech ? 0.08 * mech.skill : 0))); }
function identityNotice(st){return st.driverIdentityEstimated?'<p class="muted">Legacy save: some old driver records are estimated; original records are archived.</p>':'';}
function standingsRows(st) {
  return Object.entries(st.standings).sort((a, b) => b[1] - a[1]).map(([n, p], i) => `<tr class="${n === PLAYER_ID ? 'me' : ''}"><td>${i + 1}</td><td>${esc(driverName(st,n))}</td><td style="text-align:right">${st.standingEstimates?.[n]?'~':''}${p}</td></tr>`).join('');
}
function screen(app, html) { const el = $(`<div class="screen">${html}</div>`); app.ui.appendChild(el); return el; }
function toast(app, msg, bad = true) { document.querySelectorAll('.toast').forEach(t=>t.remove()); const t = $(`<div class="toast" style="background:${bad ? 'rgba(180,40,20,.9)' : 'rgba(40,140,60,.9)'}">${msg}</div>`); app.ui.appendChild(t); setTimeout(() => t.remove(), 2200); }

// ---------------------------------------------------------------- title
export function title(app) {
 const saved=app.load(),has=!!saved,completed=has&&saved.results?.length>=TRACKS.length&&!['load','results'].includes(saved.phase);
 const profile={...DEFAULT_PROFILE,...(app.profileOverride||saved||app.profile||{})};
 if(!profile.driver?.trim())profile.driver=DEFAULT_DRIVER;
 const el=screen(app,`<div class="front-shell title-shell">${header('YOUR RACING STORY')}
 <main class="title-stage"><section class="title-intro"><div class="kicker">RACE. BUILD. HAUL.</div><h1>Earn your<br><em>place.</em></h1><p class="title-description">Two legendary tracks.<br>One season to make yours.</p>
 <div class="driver-chip"><span class="driver-number">${esc(profile.num)}</span><div><small>YOUR DRIVER</small><strong>${esc(profile.driver)}</strong></div><button id="t-edit" class="text-button" aria-label="Edit driver profile">Edit ${icon('arrow')}</button></div>
 <nav class="title-nav">${has?`<button id="t-cont">${completed?'Season recap':'Continue season'} ${icon('arrow')}</button>`:''}<button id="t-new" class="${has?'alt':''}">${has?'New season':'Start career'} ${icon('arrow')}</button><button id="t-set" class="text-button">Settings ${icon('settings')}</button></nav></section>
 <div class="hero-caption"><span class="hero-rule"></span><small>SUPER LATE MODEL / #${esc(profile.num)}</small><strong>${esc(profile.team)}</strong><span>BUILT FOR THE CLAY.</span></div></main>
 <footer class="front-footer"><span>${app.isMobile?'Touch + tilt steering':'Keyboard + controller'}<i></i> Autosaves between stages</span><span class="footer-tour">01 RACE <i>/</i> 02 BUILD <i>/</i> 03 HAUL</span></footer></div>
 <div id="career-editor" class="modal-layer" hidden><section class="panel profile-modal" role="dialog" aria-modal="true" aria-labelledby="career-title"><header class="modal-head"><div><div class="kicker">MAKE IT YOURS</div><h2 id="career-title">Driver & livery</h2></div><button id="t-close" class="icon-button alt" aria-label="Close profile editor">${icon('close')}</button></header>
 <div class="profile-fields"><div class="form-grid"><label>Driver<input id="t-name" value="${esc(profile.driver)}" maxlength="20" autocomplete="off"></label><label>Race team<input id="t-team" value="${esc(profile.team)}" maxlength="24" autocomplete="off"></label></div><div><div class="identity-row"><label>Number<input id="t-num" value="${esc(profile.num)}" maxlength="3"></label><label>Body<input id="t-col" type="color" value="${hex(profile.color)}"></label><label>Accent<input id="t-acc" type="color" value="${hex(profile.accent)}"></label><label>Cage<input id="t-cage" type="color" value="${hex(profile.cageColor)}"></label></div><label class="livery-field">Livery<select id="t-style">${['Swoosh','Split','Stripes','Scallops','Fade','Shards','Blade','Retro','Classic 42'].map((n,i)=>`<option value="${i}" ${i===profile.scheme?'selected':''}>${n}</option>`).join('')}</select></label></div></div>
 <footer class="modal-footer"><span class="muted">A fresh identity. The same dirt.</span><button id="t-apply">Save profile ${icon('check')}</button></footer></section></div>`);
 const editor=el.querySelector('#career-editor'),v=id=>el.querySelector(id).value;
 const read=()=>({driver:v('#t-name').trim()||DEFAULT_DRIVER,team:v('#t-team').trim()||'Red Clay Racing',num:(v('#t-num').trim()||DEFAULT_PROFILE.num).toUpperCase(),color:parseInt(v('#t-col').slice(1),16),accent:parseInt(v('#t-acc').slice(1),16),cageColor:parseInt(v('#t-cage').slice(1),16),scheme:+v('#t-style'),liveryDefaultsVersion:2});
 const close=()=>{editor.hidden=true;el.querySelector('#t-edit').focus({preventScroll:true});};
 el.querySelector('#t-edit').onclick=()=>{editor.hidden=false;el.querySelector('#t-close').focus({preventScroll:true});};el.querySelector('#t-close').onclick=close;
 el.querySelector('#t-style').onchange=e=>{if(+e.target.value!==8)return;for(const[id,key]of[['#t-col','color'],['#t-acc','accent'],['#t-cage','cageColor']])el.querySelector(id).value=hex(DEFAULT_PROFILE[key]);el.querySelector('#t-num').value=DEFAULT_PROFILE.num;};
 el.querySelector('#t-apply').onclick=()=>{app.profile=app.profileOverride=read();storage.setItem('dtt.profile',JSON.stringify(app.profile));app.goto('title');el.querySelector('#t-edit')?.blur();};
 editor.onkeydown=e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();close();}if(e.key==='Enter'&&e.target.matches('input:not([type=color])')){e.preventDefault();el.querySelector('#t-apply').click();}if(e.key==='Tab'){const f=[...editor.querySelectorAll('button,input,select')],i=f.indexOf(document.activeElement);if(e.shiftKey&&i===0){e.preventDefault();f.at(-1).focus();}else if(!e.shiftKey&&i===f.length-1){e.preventDefault();f[0].focus();}}};
 el.querySelector('#t-new').onclick=()=>{if(has&&!completed&&(saved.results?.length||Object.values(saved.up||{}).some(v=>v))&&!confirm('Start a new season? This replaces your current autosave.'))return;app.state=app.newState(read());app.profile=read();app.profileOverride=null;app.save();app.goto('schedule');};
 el.querySelector('#t-set').onclick=()=>app.openSettings();if(has)el.querySelector('#t-cont').onclick=()=>{app.state=saved;const ph=saved.phase;app.goto(completed?'season':({results:'load',arrive:'shop',title:'shop'}[ph]||ph||'shop'));};
}
export function schedule(app) {
 const st=app.state;const el=screen(app,`<div class="front-shell schedule-shell">${header('THE CHAMPIONSHIP',`${st.season||2026} / ROUND ${st.round+1} OF ${TRACKS.length}`)}<div class="view-heading"><div><div class="kicker">${TRACKS.length} TRACKS. ONE CHAMPION.</div><h2>The tour.</h2></div><span class="muted">${esc(st.driver)} · #${esc(st.num)}</span></div><main class="schedule-body"><section class="calendar-map panel"><div class="map-label"><span class="kicker">YOUR SEASON / UNITED STATES</span><span class="pill">${st.results.length} / ${TRACKS.length} COMPLETE</span></div><canvas id="seasonmap" aria-label="Map of the active championship tracks"></canvas><div class="map-note">Race the clay. Make every mile count.</div></section><ol class="schedule-list">${TRACKS.map((t,i)=>`<li class="${i<st.round?'done':i===st.round?'next':''}"><span class="round-n">${String(i+1).padStart(2,'0')}</span><div><div class="event-round">${i<st.round?'COMPLETE':i===st.round?'NEXT UP':'ROUND '+(i+1)}</div><b>${t.name}</b><p>${t.city} · ${t.size} · ${t.laps} laps</p></div><span class="round-chevron">${i<st.round?icon('check'):icon('arrow')}</span></li>`).join('')}</ol></main><footer class="view-footer"><div><span class="kicker">TEAM BANK</span><strong class="money">${fmt(st.money)}</strong></div><span class="muted">Load. Haul. Repeat.<br>Make the meeting to keep your grid spot.</span><button id="go">Enter garage ${icon('arrow')}</button></footer></div>`);
 const cv=el.querySelector('#seasonmap'),fit=()=>{const r=cv.getBoundingClientRect();cv.width=r.width*Math.min(devicePixelRatio,1.5);cv.height=r.height*Math.min(devicePixelRatio,1.5);drawUSMap(cv,{round:st.round});};fit();const ro=new ResizeObserver(()=>{if(!cv.isConnected)return ro.disconnect();fit();});ro.observe(cv);el.querySelector('#go').onclick=()=>app.goto('shop');
}

export function shop(app) {
 const st=app.state,T=app.track;let tab='setup';
 const render=()=>{
  app.ui.innerHTML='';const rc=repairCost(app),hc=Math.round(st.haulerDmg*HAULER_PER_PT),par=app.carParams();
  const payroll=st.crew.reduce((n,id)=>n+(CREW_POOL.find(c=>c.id===id)?.salary||0),0);
  const benefits={engine:'+6.5% power per level. More drive off the corner.',tires:'+3% grip per level. More bite on dry clay.',shocks:'A calmer rear end under power. Less snap on corner exit.'};
  const upg=Object.entries(UPGRADES).map(([k,u])=>{const lv=st.up[k],next=lv+1<u.names.length?u.cost[lv+1]:null;
   return `<article class="upgrade"><div class="upgrade-title"><b>${u.label}</b><span class="pips">${u.names.map((_,i)=>`<span class="${i<=lv?'on':''}"></span>`).join('')}</span><small>LEVEL ${lv+1} / ${u.names.length}</small></div><div class="upgrade-path"><span>${u.names[lv]}</span>${next!==null?`<span style="color:var(--accent)">→</span><strong>${u.names[lv+1]}</strong>`:'<span class="pill ok">FULLY UPGRADED</span>'}</div><div class="upgrade-bottom"><p>${benefits[k]||u.desc}${next!==null?`<br><span style="color:var(--muted)">${st.money>=next?`Bank after install: ${fmt(st.money-next)}`:`Need ${fmt(next-st.money)} more`}</span>`:''}</p>${next!==null?`<button data-up="${k}" ${st.money<next?'disabled':''}>Install · ${fmt(next)}</button>`:''}</div></article>`;
  }).join('');
  const crew=CREW_POOL.map(c=>{const hired=st.crew.includes(c.id),same=st.crew.map(id=>CREW_POOL.find(x=>x.id===id)).find(x=>x.role===c.role&&x.id!==c.id);
   return `<article class="crew-card ${hired?'hired':''}"><div class="crew-role">${c.role}${hired?' · ON YOUR TEAM':''}</div><h3>${c.name}</h3><div class="stars">${'★'.repeat(c.skill)}${'☆'.repeat(4-c.skill)}</div><p>${c.perk}</p><footer><b>${fmt(c.salary)}<small>PER RACE</small></b>${hired?`<button class="alt" data-fire="${c.id}">Release</button>`:`<button data-hire="${c.id}" ${same?`disabled title="Release ${same.name} first"`:''}>${same?'Role filled':'Hire'}</button>`}</footer></article>`;
  }).join('');
  const el=screen(app,`<div class="shop-shell"><aside class="garage-intro"><div><div class="kicker">YOUR GARAGE / ROUND ${String(st.round+1).padStart(2,'0')}</div><h2>${esc(st.team)}</h2><span class="pill">#${esc(st.num)} · ${esc(st.driver)}</span><p class="garage-location">${T.city} / ${T.size}</p></div><div><div class="garage-statline"><div><b>${Math.round(par.power*100)}%</b><span>POWER</span></div><div><b>${Math.round(par.grip*100)}%</b><span>GRIP</span></div><div><b>${(app.settings.assist||'high').toUpperCase()}</b><span>ASSIST</span></div></div><div class="garage-ready"><span class="kicker">SUPER LATE MODEL</span><p>Ready for your next chapter.</p></div></div></aside>
  <section class="panel shop-main"><header class="shop-head"><div><div class="kicker">RACE SHOP · ${st.round+1} / ${TRACKS.length}</div><h2>${T.name}</h2></div><div class="bank"><div class="kicker">TEAM BANK</div><span class="money">${fmt(st.money)}</span><small>Crew payroll ${fmt(payroll)} / race</small></div></header><div class="shop-event">${T.city} · ${T.event} · ${T.size} · ${T.bank}° top banking · ${T.laps} laps${st.late?' <span class="pill warn">LATE ARRIVAL · REAR START</span>':''}</div>
  <nav class="shop-tabs" aria-label="Race shop"><button data-tab="setup" class="${tab==='setup'?'active':''}">Setup</button><button data-tab="crew" class="${tab==='crew'?'active':''}">Crew <span style="opacity:.6">${st.crew.length}</span></button><button data-tab="points" class="${tab==='points'?'active':''}">Standings</button></nav>
  <div class="shop-scroll" ${tab==='setup'?'':'hidden'}><div class="readiness-grid"><div class="readiness"><div class="row"><b>Race car</b><span class="pill ${st.carDmg>10?'warn':'ok'}">${st.carDmg?`${Math.round(st.carDmg)}% DAMAGE`:'READY'}</span></div><div class="bar"><i style="width:${Math.min(100,st.carDmg)}%"></i></div><button class="alt" id="rep" ${!st.carDmg||st.money<rc?'disabled':''}>${st.carDmg?`Repair · ${fmt(rc)}`:'No repairs needed'}</button></div><div class="readiness"><div class="row"><b>Hauler</b><span class="pill ${st.haulerDmg>10?'warn':'ok'}">${st.haulerDmg?`${Math.round(st.haulerDmg)}% DAMAGE`:'READY'}</span></div><div class="bar"><i style="width:${Math.min(100,st.haulerDmg)}%"></i></div><button class="alt" id="hrep" ${!st.haulerDmg||st.money<hc?'disabled':''}>${st.haulerDmg?`Road service · ${fmt(hc)}`:'Ready for the road'}</button></div></div>
  <div class="section-label"><h3>Performance</h3><span class="muted">SEASON UPGRADES</span></div>${upg}<details class="prep-note"><summary>Track prep & driving tips</summary><p>Fresh clay at the green. Tire lines build rubber, ruts at entry/exit, and a growing cushion. The dry black groove gains speed. Use short steering taps and let the car settle. High assist catches excess yaw; Medium and lower give you more to manage. Press H for controls.</p></details></div>
  <div class="shop-scroll" ${tab==='crew'?'':'hidden'}><div class="section-label" style="margin-top:0"><h3>People make the difference</h3><span class="pill ${payroll>st.money?'warn':''}">${fmt(payroll)} / RACE</span></div><p class="muted" style="margin:0 0 13px">One person per role. Salary comes out of your feature payout, not when you hire. Release a crew member to free their seat.</p><div class="crew-grid">${crew}</div></div>
  <div class="shop-scroll" ${tab==='points'?'':'hidden'}><div class="section-label"><h3>Championship standings</h3><span class="muted">${st.results.length} / ${TRACKS.length} FEATURES COMPLETE</span></div><table class="shop-standings"><tr><th>Pos</th><th>Driver</th><th style="text-align:right">Points</th></tr>${standingsRows(st)}</table>${identityNotice(st)}<p class="muted" style="margin-top:16px">Points reward every finish: ${POINTS.join(' / ')}. Bring it home clean and build the team for the next round.</p></div>
  <footer class="shop-footer"><div class="row"><button class="alt" id="sched">Schedule</button><button class="alt" id="menu">Main menu</button></div><div><button id="race">Go racing ${icon('arrow')}</button><div class="status-caption" style="text-align:right">${st.carDmg>60?'Damage will hurt your pace — consider a repair.':`Rolling start · ${T.laps} laps`}</div></div></footer></section></div>`);
  el.querySelectorAll('[data-tab]').forEach(b=>b.onclick=()=>{tab=b.dataset.tab;render();});
  el.querySelector('#rep').onclick=()=>{if(!st.carDmg||st.money<rc)return;st.money-=rc;st.carDmg=0;app.save();render();toast(app,'Race car repaired',false);};
  el.querySelector('#hrep').onclick=()=>{if(!st.haulerDmg||st.money<hc)return;st.money-=hc;st.haulerDmg=0;app.save();render();toast(app,'Hauler ready for the road',false);};
  el.querySelectorAll('[data-up]').forEach(b=>b.onclick=()=>{const k=b.dataset.up,price=UPGRADES[k].cost[st.up[k]+1];if(!price||st.money<price)return;st.money-=price;st.up[k]++;app.save();render();toast(app,UPGRADES[k].label+' upgraded',false);});
  el.querySelectorAll('[data-hire]').forEach(b=>b.onclick=()=>{if(!st.crew.includes(b.dataset.hire)){st.crew.push(b.dataset.hire);app.save();render();}});
  el.querySelectorAll('[data-fire]').forEach(b=>b.onclick=()=>{st.crew=st.crew.filter(x=>x!==b.dataset.fire);app.save();render();});
  el.querySelector('#race').onclick=()=>app.goto('race');el.querySelector('#sched').onclick=()=>app.goto('schedule');el.querySelector('#menu').onclick=()=>app.goto('title');
 };render();
}

// ---------------------------------------------------------------- results
export function applyResults(app, res, playerDmg) {
  const st = app.state; if (!st) return;
  if(st.results[st.round])return;
  migrateDriverIds(st);
  res=res.map(r=>({...r,driverId:driverIdFor(r)}));
  const me = res.find(r => r.driverId===PLAYER_ID);
  for (const r of res) st.standings[r.driverId] = (st.standings[r.driverId] || 0) + r.pts;
  const payroll = st.crew.reduce((a, id) => a + (CREW_POOL.find(c => c.id === id)?.salary || 0), 0);
  const bonus = me.bonusTotal || 0;
  st.money += me.purse + bonus - payroll; st.earnings = (st.earnings || 0) + me.purse + bonus;
  st.carDmg = Math.min(100, playerDmg);
  st.results.push({ trackId:app.track.id,driverId:PLAYER_ID,classification:Object.fromEntries(res.map(r=>[r.driverId,{driverId:r.driverId,name:r.name,player:r.player,pos:r.pos,pts:r.pts}])),track: app.track.short, pos: me.pos, pts: me.pts, purse: me.purse + bonus, late: st.late, dnf: me.dnf });
  st.late = false;
  st.lastClassification={round:st.round,res,byDriverId:Object.fromEntries(res.map(r=>[r.driverId,r])),payroll};st.phase=me.dnf?'load':'results';app.save();
  app.goto(me.dnf?'load':'results', { res, payroll });
}
export function results(app, { res, payroll } = {}) {
  const st = app.state, last = st.round >= TRACKS.length - 1;
  if (!res) { app.goto('load'); return; }
  const me = res.find(r => r.player);
  const bonus = me.bonus || [], bonusTotal = me.bonusTotal || 0, net = me.purse + bonusTotal - (payroll || 0);
  const gainTxt = g => g > 0 ? `<span class="up">▲${g}</span>` : g < 0 ? `<span class="down">▼${-g}</span>` : '<span class="muted">—</span>';
  const el=screen(app,`<div class="front-shell result-shell">${header('POST RACE',`${app.track.short.toUpperCase()} / ROUND ${st.round+1}`)}<main class="result-body"><section class="result-overview"><div class="kicker">${me.dnf?'FEATURE ENDED':me.pos===1?'VICTORY LANE':'FEATURE COMPLETE'}</div><h2>${me.pos===1?'Your moment.':'Keep building.'}</h2><div class="finish-position"><small>FINISHED</small><strong>P${me.pos}</strong>${me.dnf?'<span class="pill warn">DNF</span>':''}</div><p class="result-driver">${esc(st.driver)} <span>#${esc(st.num)}</span></p><p class="muted">Started P${me.start} · ${me.gain>0?'gained '+me.gain:me.gain<0?'lost '+(-me.gain):'held position'}${me.led?' · '+me.led+' laps led':''}</p><div class="result-metrics"><div><b>+${me.pts}</b><small>POINTS</small></div><div><b>${me.best?me.best.toFixed(2)+'s':'—'}</b><small>BEST LAP</small></div></div><div class="net-payout"><small>NET THIS RACE</small><strong>${net<0?'−':''}${fmt(Math.abs(net))}</strong></div></section>
 <section class="panel result-board"><header><div class="kicker">${app.track.event.toUpperCase()}</div><h3>Feature classification</h3><span class="muted">${app.track.name}</span></header><div class="classification-scroll"><table class="res-table"><thead><tr><th>Pos</th><th>Driver</th><th>+/−</th><th>Best</th><th>Pts</th><th>Purse</th></tr></thead><tbody>${res.map(r=>`<tr class="${r.player?'me':''}"><td>${r.dnf?'DNF':String(r.pos).padStart(2,'0')}</td><td><span class="car-number">${esc(r.num)}</span>${esc(r.name)}</td><td>${gainTxt(r.gain)}</td><td>${r.best?r.best.toFixed(2)+'s':'—'}</td><td>${r.estimated?'~':''}${r.pts??'—'}</td><td>${fmt(r.purse)}</td></tr>`).join('')}</tbody></table><details class="payout"><summary>Payout breakdown & standings</summary><div class="pl"><span>Finishing purse</span><b>${fmt(me.purse)}</b></div>${bonus.map(([l,a])=>`<div class="pl"><span>${l}</span><b>+${fmt(a)}</b></div>`).join('')}<div class="pl"><span>Crew payroll</span><b>−${fmt(payroll||0)}</b></div><div class="pl"><span>Repairs needed</span><b>${Math.round(st.carDmg)}% damage</b></div><h3>Championship</h3><table>${standingsRows(st)}</table>${identityNotice(st)}</details></div><small class="classification-hint">${res.length} drivers · scroll for the full classification</small></section></main><footer class="view-footer"><div><span class="kicker">TEAM BANK</span><strong class="money">${fmt(st.money)}</strong></div><span class="muted">${last?'Every mile earned.':'Next up / load the race car.'}</span><button id="go">Return to pits ${icon('arrow')}</button></footer></div>`);
  el.querySelector('#go').onclick = () => app.goto('load');
}
// called by the loading mini-game
export function afterLoad(app, r) {
  const st = app.state;
  if(r.round!==undefined&&r.round!==st.round)return;
  if(st.loadLog?.round===st.round)return;
  st.money -= r.cost; st.carDmg = Math.min(100, st.carDmg + r.dmg); st.slackBonus = r.bonusHours; st.loadLog = {...r,round:st.round}; st.phase=st.round>=TRACKS.length-1?'season':'highway';app.save();
  app.goto(st.round>=TRACKS.length-1?'season':'highway');
}

// ---------------------------------------------------------------- map
const US = [[-124.7, 48.4], [-124.0, 46.3], [-124.1, 43.0], [-124.4, 40.4], [-123.0, 38.0], [-121.9, 36.6], [-120.6, 34.6], [-118.4, 34.0], [-117.1, 32.5], [-114.7, 32.7], [-111.1, 31.3], [-108.2, 31.3], [-106.5, 31.8], [-104.5, 29.6], [-103.1, 29.0], [-101.4, 29.8], [-99.5, 27.5], [-97.4, 25.9], [-97.4, 27.8], [-95.0, 29.3], [-93.8, 29.7], [-91.0, 29.2], [-89.2, 29.1], [-89.6, 30.2], [-88.0, 30.4], [-86.5, 30.4], [-85.0, 29.6], [-84.0, 30.0], [-82.8, 28.0], [-82.6, 27.0], [-81.7, 25.9], [-80.4, 25.2], [-80.0, 26.7], [-80.6, 28.4], [-81.3, 30.3], [-81.0, 31.9], [-79.2, 33.2], [-77.9, 34.0], [-75.5, 35.2], [-76.0, 36.9], [-75.9, 37.9], [-75.0, 38.8], [-74.0, 40.0], [-73.9, 40.6], [-72.0, 41.1], [-70.0, 41.7], [-70.6, 42.6], [-70.7, 43.1], [-69.0, 44.1], [-67.0, 44.8], [-67.8, 47.1], [-69.2, 47.4], [-71.5, 45.0], [-74.9, 45.0], [-76.8, 43.6], [-79.0, 43.3], [-79.1, 42.8], [-82.5, 41.7], [-83.5, 41.7], [-82.4, 43.0], [-82.6, 45.4], [-84.6, 46.5], [-88.4, 48.3], [-89.6, 48.0], [-94.8, 49.4], [-95.2, 49.0], [-123.0, 49.0]];
const INTERSTATES = {
  'I-10': [[-118.2, 34.05], [-112.07, 33.45], [-106.5, 31.8], [-98.5, 29.4], [-95.4, 29.8], [-90.1, 29.95], [-88.04, 30.69], [-84.28, 30.44], [-81.66, 30.33]],
  'I-40': [[-117.0, 34.9], [-111.65, 35.2], [-106.65, 35.08], [-101.8, 35.2], [-97.5, 35.47], [-92.3, 34.75], [-90.05, 35.15], [-86.78, 36.16], [-83.92, 35.96], [-79.8, 36.07], [-77.9, 34.2]],
  'I-70': [[-112.1, 38.6], [-108.5, 39.06], [-104.99, 39.74], [-97.6, 38.84], [-94.58, 39.1], [-92.33, 38.95], [-90.2, 38.63], [-86.16, 39.77], [-84.89, 39.83], [-83.0, 39.96], [-79.9, 40.1], [-76.7, 39.6]],
  'I-80': [[-122.3, 37.8], [-119.8, 39.5], [-111.9, 40.76], [-104.8, 41.14], [-96.0, 41.26], [-93.62, 41.59], [-90.58, 41.52], [-87.6, 41.6], [-83.55, 41.65], [-80.6, 41.1], [-75.0, 41.0], [-74.1, 40.85]],
  'I-90': [[-122.3, 47.6], [-117.4, 47.66], [-111.0, 45.7], [-103.2, 44.08], [-96.7, 43.55], [-91.2, 43.8], [-87.6, 41.88], [-81.7, 41.5], [-78.9, 42.9], [-73.8, 42.65], [-71.06, 42.36]],
  'I-95': [[-80.19, 25.77], [-81.66, 30.33], [-81.1, 32.08], [-79.9, 34.2], [-77.4, 37.54], [-77.03, 38.9], [-75.16, 39.95], [-74.0, 40.71], [-71.4, 41.82], [-71.06, 42.36], [-70.25, 43.66], [-68.77, 44.8]],
  'I-35': [[-98.5, 29.4], [-97.74, 30.27], [-96.8, 32.78], [-97.5, 35.47], [-97.34, 37.69], [-94.58, 39.1], [-93.62, 41.59], [-93.27, 44.98], [-92.1, 46.78]],
  'I-55': [[-90.1, 29.95], [-90.18, 32.3], [-90.05, 35.15], [-89.5, 37.3], [-90.2, 38.63], [-89.65, 39.8], [-87.6, 41.88]],
  'I-65': [[-88.04, 30.69], [-86.3, 32.37], [-86.8, 33.52], [-86.78, 36.16], [-85.76, 38.25], [-86.16, 39.77], [-87.3, 41.6]],
  'I-75': [[-80.3, 26.1], [-82.46, 27.95], [-82.64, 30.19], [-83.6, 32.84], [-84.39, 33.75], [-85.31, 35.05], [-83.92, 35.96], [-84.5, 39.1], [-84.19, 39.76], [-83.55, 41.65], [-83.05, 42.33], [-84.35, 46.5]],
  'I-20': [[-104.0, 31.4], [-101.9, 31.99], [-96.8, 32.78], [-93.75, 32.5], [-90.18, 32.3], [-86.8, 33.52], [-84.39, 33.75], [-81.03, 34.0]],
  'I-74': [[-90.58, 41.52], [-89.59, 40.69], [-88.24, 40.12], [-86.16, 39.77], [-84.5, 39.1]],
};
export function drawUSMap(cv, opts={}) {
 const g=cv.getContext('2d'),W=cv.width,H=cv.height,ui=Math.min(devicePixelRatio,1.5);if(!W||!H)return;
 const lon0=-100,lon1=-75,lat0=25,lat1=45,k=Math.cos(38*Math.PI/180),sc=Math.min((W-24*ui)/((lon1-lon0)*k),(H-24*ui)/(lat1-lat0)),ox=(W-(lon1-lon0)*k*sc)/2,oy=(H-(lat1-lat0)*sc)/2;
 const P=([lo,la])=>[ox+(lo-lon0)*k*sc,oy+(lat1-la)*sc];
 g.clearRect(0,0,W,H);g.fillStyle='#101b20';g.fillRect(0,0,W,H);g.lineJoin='round';g.lineCap='round';
 g.beginPath();US.forEach((p,i)=>i?g.lineTo(...P(p)):g.moveTo(...P(p)));g.closePath();g.fillStyle='#1b2a30';g.fill();g.strokeStyle='#405057';g.lineWidth=ui;g.stroke();
 g.strokeStyle='#ffffff08';g.lineWidth=ui;for(let lo=-100;lo<-74;lo+=5){g.beginPath();g.moveTo(...P([lo,25]));g.lineTo(...P([lo,45]));g.stroke();}for(let la=25;la<=45;la+=5){g.beginPath();g.moveTo(...P([-100,la]));g.lineTo(...P([-75,la]));g.stroke();}
 for(const line of Object.values(INTERSTATES)){g.strokeStyle='#728b902c';g.lineWidth=ui;g.beginPath();line.forEach((p,i)=>i?g.lineTo(...P(p)):g.moveTo(...P(p)));g.stroke();}
 const route=opts.route,pts=(route?route.pts:TRACKS.map(t=>[t.lon,t.lat])).map(P);g.beginPath();pts.forEach((p,i)=>i?g.lineTo(...p):g.moveTo(...p));g.strokeStyle=route?'#d2f77f':'#d2f77f66';g.lineWidth=(route?3:1.5)*ui;if(!route)g.setLineDash([5*ui,7*ui]);g.stroke();g.setLineDash([]);
 if(route){const lens=pts.slice(1).map((p,i)=>Math.hypot(p[0]-pts[i][0],p[1]-pts[i][1]));let d=(opts.progress??((opts.t||0)*.08%1))*lens.reduce((a,b)=>a+b,0),i=0;while(i<lens.length-1&&d>lens[i])d-=lens[i++];const u=Math.min(1,d/(lens[i]||1)),a=pts[i],b=pts[i+1];g.fillStyle='#fff';g.strokeStyle='#101b20';g.lineWidth=2*ui;g.beginPath();g.arc(a[0]+(b[0]-a[0])*u,a[1]+(b[1]-a[1])*u,5*ui,0,Math.PI*2);g.fill();g.stroke();}
 const offsets=[[12,20],[12,23],[-95,3],[-100,-14],[12,-14]],boxes=[];
 TRACKS.forEach((t,i)=>{const[x,y]=P([t.lon,t.lat]),active=i===opts.round,done=i<opts.round;g.fillStyle=active?'#d2f77f':done?'#8faca0':'#a5b3b7';g.strokeStyle='#101b20';g.lineWidth=3*ui;g.beginPath();g.arc(x,y,(active?8:5)*ui,0,Math.PI*2);g.fill();g.stroke();if(active){g.strokeStyle='#d2f77f55';g.lineWidth=ui;g.beginPath();g.arc(x,y,12*ui,0,Math.PI*2);g.stroke();}
 const label=`${i+1}  ${t.short}`;g.font=`${active?700:500} ${12*ui}px Arial`;const w=g.measureText(label).width;let lx=Math.max(10*ui,Math.min(W-w-10*ui,x+offsets[i][0]*ui)),ly=Math.max(18*ui,Math.min(H-10*ui,y+offsets[i][1]*ui));
 for(let n=0;n<6&&boxes.some(b=>lx<b.x+b.w&&lx+w>b.x&&ly>b.y-15*ui&&ly-15*ui<b.y);n++)ly=ly-19*ui>15*ui?ly-19*ui:ly+24*ui;
 boxes.push({x:lx,y:ly,w});g.strokeStyle='#80959966';g.lineWidth=ui;g.beginPath();g.moveTo(x,y);g.lineTo(lx+(lx<x?w:0),ly-5*ui);g.stroke();g.fillStyle=active?'#e1f4ba':'#d0dadb';g.textAlign='left';g.textBaseline='alphabetic';g.fillText(label,lx,ly);
 });
}
export function map(app) {
  const st = app.state, route = app.route, from = TRACKS[st.round], to = TRACKS[st.round + 1];
  if(!route||!from||!to){app.goto(st.results.length>=TRACKS.length?'season':'shop');return;}
  const miles = routeMiles(route), dl = deadlineHours(route, st), co = app.crew('Co-Driver');
  const fuelCost = Math.round(miles / 6.5 * 4.1);
  const el=screen(app,`<div class="front-shell route-shell">${header('THE MILES BETWEEN',`ROUND ${st.round+1} → ${st.round+2}`)}<div class="view-heading"><div><div class="kicker">YOUR NEXT DESTINATION</div><h2>On the road.</h2></div><span class="muted">${from.short} ${icon('arrow')} ${to.short}</span></div><main class="route-layout"><section class="panel route-map"><div class="map-label"><span class="kicker">ROUTE / ${route.hwy.join(' · ')}</span><span class="pill">${miles} MI</span></div><canvas id="usmap" aria-label="Travel route to the next race"></canvas></section><section class="panel route-info"><header><div class="kicker">DESTINATION</div><h3>${to.name}</h3><p class="muted">${to.city}</p></header><div class="travel-stats"><div><b>${miles}</b><small>MILES</small></div><div><b>${dl.toFixed(1)}h</b><small>DEADLINE</small></div><div><b>${fmt(fuelCost)}</b><small>EST. DIESEL</small></div></div><div class="rig-status"><div class="row"><span>Fuel</span><div class="bar"><i style="width:${st.fuel*100}%"></i></div><b>${Math.round(st.fuel*100)}%</b></div><div class="row"><span>Fatigue</span><div class="bar"><i style="width:${st.fatigue*100}%"></i></div><b>${Math.round(st.fatigue*100)}%</b></div><div class="row"><span>Rig damage</span><div class="bar"><i style="width:${st.haulerDmg}%"></i></div><b>${Math.round(st.haulerDmg)}%</b></div></div><details class="route-tips"><summary>Road notes</summary><p class="muted">75 mph trap. Take signed exits for diesel and rest. Arrive before the drivers’ meeting to avoid a rear start and ${fmt(LATE_FEE)} fee.${st.slackBonus?' Your quick load added '+st.slackBonus.toFixed(1)+'h.':''}</p></details></section></main><footer class="view-footer route-footer"><div><span class="kicker">TEAM BANK</span><strong class="money">${fmt(st.money)}</strong></div><span class="muted">Make the meeting.<br>Keep your starting spot.</span><div class="route-actions"><button id="auto" class="alt" ${co?'':'disabled title="Hire a CDL co-driver in the garage"'}>${co?'Co-driver · '+fmt(fuelCost+400):'Co-driver · locked'}</button><button id="drive">Drive the route ${icon('arrow')}</button></div></footer></div>`);
  const cv = el.querySelector('#usmap');
  const fit = () => { const r = cv.getBoundingClientRect(); cv.width = r.width * Math.min(devicePixelRatio,1.5); cv.height = r.height * Math.min(devicePixelRatio,1.5); drawUSMap(cv, { route, round: st.round }); };
  fit();
  const ro=new ResizeObserver(fit);ro.observe(cv);
  let t0 = performance.now(), alive = true;
  const loop = () => { if (!alive || !cv.isConnected) {ro.disconnect();return;} drawUSMap(cv, { route, round: st.round, t: (performance.now() - t0) / 1000 }); requestAnimationFrame(loop); };
  loop();
  el.querySelector('#drive').onclick = () => { alive = false; app.goto('highway'); };
  el.querySelector('#auto').onclick = () => {
    alive = false; const hrs = miles / 60 + 1.0;
    applyArrival(app, { hours: hrs, deadline: dl, fuelSpent: fuelCost + 400, rigDmg: 0, tickets: 0, tows: 0, auto: true });
  };
}
export function applyArrival(app, info) {
  const st = app.state;
  if(!app.route||!TRACKS[st.round+1]){app.goto(st.results.length>=TRACKS.length?'season':'shop');return;}
  const late = info.hours > info.deadline;
  st.round++; st.late = late; st.slackBonus = 0;
  if (late) st.money -= LATE_FEE;
  if (info.auto) { st.money -= info.fuelSpent; st.fatigue = 0.1; st.fuel = 0.8; }
  st.arrival = { ...info, late }; app.save();
  app.goto('arrive', st.arrival);
}
export function arrive(app, info) {
  const st = app.state, T = app.track; info = info || st.arrival || {};
  const el = screen(app, `<div class="panel arrival-panel" style="width:560px;margin-left:auto;margin-right:40px">
    <div class="kicker">ROAD REPORT</div><h2>${T.name}</h2><div class="muted">${T.city} • ${T.event}</div>
    <div class="arrival-status ${info.late?'down':'up'}">${info.late ? 'A late arrival.' : 'Right on time.'}</div>
    <table><tr><td>Travel time</td><td>${(info.hours || 0).toFixed(1)} h (deadline ${(info.deadline || 0).toFixed(1)} h)</td></tr>
      ${info.fastTravel?'<tr><td>Paid fast travel</td><td>Relief driver · delivered to paddock</td></tr>':''}
      ${info.auto ? '<tr><td>Driver</td><td>Co-driver hauled it overnight</td></tr>' : ''}
      <tr><td>Fuel & stops</td><td>${fmt(info.fuelSpent || 0)}</td></tr>
      ${info.tickets ? `<tr><td>Speeding tickets</td><td style="color:#ff5a4a">${info.tickets} × $250</td></tr>` : ''}
      ${info.tows ? `<tr><td>Tow (ran out of diesel)</td><td style="color:#ff5a4a">$650 + 3h</td></tr>` : ''}
      ${info.rigDmg ? `<tr><td>Rig damage on the road</td><td style="color:#ff5a4a">${info.rigDmg.toFixed(0)}% (race car took ${(info.carDmg || 0).toFixed(0)}%)</td></tr>` : ''}
      ${info.late ? `<tr><td>Late fee / start</td><td style="color:#ff5a4a">${fmt(LATE_FEE)} • start at the REAR</td></tr>` : ''}</table>
    <div class="row" style="margin-top:12px"><span class="money">${fmt(st.money)}</span><span style="flex:1"></span><button id="go">Unload to the shop →</button></div></div>`);
  el.querySelector('#go').onclick = () => app.goto('shop');
}
// ---------------------------------------------------------------- season end
export function season(app) {
 const st=app.state,rows=Object.entries(st.standings).sort((a,b)=>b[1]-a[1]),pos=rows.findIndex(r=>r[0]===PLAYER_ID)+1;
 const wins=st.results.filter(r=>r.pos===1).length,top3=st.results.filter(r=>r.pos<=3).length;
 st.phase='season';app.save();
 const el=screen(app,`<div class="panel season-panel"><header class="season-hero"><div><div class="kicker">2026 DIRT TRACK TOUR / SEASON RECAP</div><h2>${pos===1?'Tour champion!':'Every mile earned.'}</h2><p class="muted">${esc(st.driver)} · #${esc(st.num)} · ${esc(st.team)}</p></div><div class="season-medal">P${pos}</div></header>
 <div class="season-stats"><div class="card"><b>${wins}</b><span>FEATURE WINS</span></div><div class="card"><b>${top3}</b><span>PODIUMS</span></div><div class="card"><b>${st.standings[PLAYER_ID]||0}</b><span>CHAMPIONSHIP POINTS</span></div><div class="card"><b>${fmt(st.earnings||0)}</b><span>TOTAL WINNINGS</span></div></div>
 <div class="season-tables"><section><h3>Final championship standings</h3><table><tr><th>Pos</th><th>Driver</th><th>Pts</th></tr>${standingsRows(st)}</table>${identityNotice(st)}</section><section><h3>Your tour, one feature at a time</h3><table><tr><th>Track</th><th>Fin</th><th>Pts</th><th>Purse</th></tr>${st.results.map(r=>`<tr><td>${r.track}${r.late?' · late':''}</td><td>${r.dnf?'DNF':'P'+r.pos}</td><td>${r.pts}</td><td>${fmt(r.purse)}</td></tr>`).join('')}</table><p class="muted" style="margin-top:15px">${TRACKS.length} legendary dirt tracks and the miles in between. Thanks for taking the tour.</p><div class="kicker">TEAM BANK</div><span class="money">${fmt(st.money)}</span></section></div>
 ${st.legacyOpponentPointsEstimated?'<p class="muted">Legacy save: opponent points were rebuilt for the active rounds from preserved ranking; original standings are archived.</p>':''}
 <div class="journey-footer"><button id="recap-menu" class="alt">Main menu</button><button id="again">Start a new season →</button></div></div>`);
 el.querySelector('#recap-menu').onclick=()=>app.goto('title');el.querySelector('#again').onclick=()=>{app.clearSave();app.state=null;app.goto('title');};
}
