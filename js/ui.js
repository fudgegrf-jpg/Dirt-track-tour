// 2D overlay screens (DOM): title, schedule, shop, results, route map, arrival, season summary.
import { TRACKS, ROUTES, AI_DRIVERS, UPGRADES, CREW_POOL, POINTS } from './data.js';

const $ = (html) => { const d = document.createElement('div'); d.innerHTML = html.trim(); return d.firstChild; };
const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
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
function standingsRows(st) {
  return Object.entries(st.standings).sort((a, b) => b[1] - a[1]).map(([n, p], i) => `<tr class="${n === st.driver ? 'me' : ''}"><td>${i + 1}</td><td>${esc(n)}</td><td style="text-align:right">${p}</td></tr>`).join('');
}
function screen(app, html) { const el = $(`<div class="screen">${html}</div>`); app.ui.appendChild(el); return el; }
function toast(app, msg, bad = true) { const t = $(`<div class="toast" style="background:${bad ? 'rgba(180,40,20,.9)' : 'rgba(40,140,60,.9)'}">${msg}</div>`); app.ui.appendChild(t); setTimeout(() => t.remove(), 2200); }

// ---------------------------------------------------------------- title
export function title(app) {
  const saved=app.load(),has=!!saved,completed=has&&saved.results?.length>=TRACKS.length;
  const el=screen(app,`<div class="title-layout"><div class="kicker">2026 • SUPER LATE MODEL RACING</div>
   <h1 class="title-wordmark">Dirt Track<br><em>Tour</em></h1>
   <p class="title-copy">Chase the cushion. Build your team. Haul your own race car across America. Five tracks. One championship.</p>
   <div class="team-form"><div class="form-grid"><label>Driver<input id="t-name" value="${esc(saved?.driver||'Dale Rhodes')}" maxlength="20" autocomplete="off"></label><label>Race team<input id="t-team" value="${esc(saved?.team||'Red Clay Racing')}" maxlength="24" autocomplete="off"></label></div>
    <div class="identity-row"><label>Car number<input id="t-num" value="${esc(saved?.num||'21')}" maxlength="3"></label><label>Body<input id="t-col" type="color" value="${hex(saved?.color??0xc81d25)}"></label><label>Accent<input id="t-acc" type="color" value="${hex(saved?.accent??0xffffff)}"></label><label>Cage<input id="t-cage" type="color" value="${hex(saved?.cageColor??0xc92127)}"></label></div>
    <label style="margin-top:12px">Livery style<select id="t-style">${["Swoosh","Split","Stripes","Scallops","Fade","Shards","Blade","Retro"].map((n,i)=>`<option value="${i}" ${i===(saved?.scheme??4)?"selected":""}>${n}</option>`).join("")}</select></label><div class="title-actions">${has?`<button id="t-cont">${completed?'View season recap':'Continue season →'}</button>`:''}<button id="t-new" class="${has?'alt':''}">${has?'New season':'Start your season →'}</button><button id="t-set" class="alt">Settings</button></div>
   </div><div class="title-journey"><span><b>01</b> RACE THE CLAY</span><span><b>02</b> BUILD THE TEAM</span><span><b>03</b> HAUL THE MILES</span></div>
   <p class="title-foot">${app.isMobile?'Touch or tilt • Autosaves between stages<br>High assist recommended. Turn your phone sideways.':'Keyboard or controller • Autosaves between stages • H for driving help<br>High assist makes keyboard driving forgiving. All five assist levels are in Settings.'}</p></div>`);
  const start=()=>{if(has&&!completed&&(saved.results?.length||Object.values(saved.up||{}).some(v=>v))&&!confirm('Start a new season? This replaces your current autosave.'))return;const v=id=>el.querySelector(id).value;
   app.state=app.newState({driver:v('#t-name').trim()||'You',team:v('#t-team').trim()||'Your Racing',num:(v('#t-num').trim()||'21').toUpperCase(),color:parseInt(v('#t-col').slice(1),16),accent:parseInt(v('#t-acc').slice(1),16),cageColor:parseInt(v('#t-cage').slice(1),16),scheme:+v('#t-style')});app.save();app.goto('schedule');};
  el.querySelector('#t-new').onclick=start;el.querySelectorAll('input:not([type=color])').forEach(i=>i.onkeydown=e=>{if(e.key==='Enter'){e.preventDefault();start();}});
  el.querySelector('#t-set').onclick=()=>app.openSettings();if(has)el.querySelector('#t-cont').onclick=()=>{app.state=saved;const ph=saved.phase;app.goto(completed?'season':({results:'load',arrive:'shop',title:'shop'}[ph]||ph||'shop'));};
}
export function schedule(app) {
 const st=app.state;const el=screen(app,`<div class="panel schedule-panel"><div class="kicker">THE ${st.season||2026} CHAMPIONSHIP</div><h2 style="font-size:30px;margin-top:6px">Five tracks. Every mile earned.</h2><div class="muted">Super late models • race, wrench, load, and haul between rounds</div>
 <ol class="schedule-list">${TRACKS.map((t,i)=>`<li class="${i<st.round?'done':i===st.round?'next':''}"><span class="round-n">${String(i+1).padStart(2,'0')}</span><div><b>${t.name}</b> ${i===st.round?'<span class="pill ok" style="margin-left:8px">NEXT UP</span>':''}<p>${t.city} · ${t.size} · ${t.bank}° top banking · ${t.laps} laps</p></div><span class="event">${t.event}${t.purse>1?`<br>purse ×${t.purse}`:''}</span></li>`).join('')}</ol>
 <div class="journey-footer"><p class="muted">Load your own hauler after each feature. Make the next drivers’ meeting to keep your starting spot. Late arrivals start at the rear and pay ${fmt(LATE_FEE)}.</p><div style="text-align:right"><span class="money">${fmt(st.money)}</span><br><button id="go" style="margin-top:8px">Open the race shop →</button></div></div></div>`);
 el.querySelector('#go').onclick=()=>app.goto('shop');
}

export function shop(app) {
 const st=app.state,T=app.track;let tab='setup';
 const render=()=>{
  app.ui.innerHTML='';const rc=repairCost(app),hc=Math.round(st.haulerDmg*HAULER_PER_PT),par=app.carParams();
  const payroll=st.crew.reduce((n,id)=>n+(CREW_POOL.find(c=>c.id===id)?.salary||0),0);
  const benefits={engine:'+6.5% power per level. More drive off the corner.',tires:'+3% grip per level. More bite on dry clay.',shocks:'A calmer rear end under power. Less snap on corner exit.'};
  const upg=Object.entries(UPGRADES).map(([k,u])=>{const lv=st.up[k],next=lv+1<u.names.length?u.cost[lv+1]:null;
   return `<article class="upgrade"><div class="upgrade-title"><b>${u.label}</b><span class="pips">${u.names.map((_,i)=>`<span class="${i<=lv?'on':''}"></span>`).join('')}</span><small>LEVEL ${lv+1} / ${u.names.length}</small></div><div class="upgrade-path"><span>${u.names[lv]}</span>${next!==null?`<span style="color:#e6aa70">→</span><strong>${u.names[lv+1]}</strong>`:'<span class="pill ok">FULLY UPGRADED</span>'}</div><div class="upgrade-bottom"><p>${benefits[k]||u.desc}${next!==null?`<br><span style="color:#6f899f">${st.money>=next?`Bank after install: ${fmt(st.money-next)}`:`Need ${fmt(next-st.money)} more`}</span>`:''}</p>${next!==null?`<button data-up="${k}" ${st.money<next?'disabled':''}>Install · ${fmt(next)}</button>`:''}</div></article>`;
  }).join('');
  const crew=CREW_POOL.map(c=>{const hired=st.crew.includes(c.id),same=st.crew.map(id=>CREW_POOL.find(x=>x.id===id)).find(x=>x.role===c.role&&x.id!==c.id);
   return `<article class="crew-card ${hired?'hired':''}"><div class="crew-role">${c.role}${hired?' · ON YOUR TEAM':''}</div><h3>${c.name}</h3><div class="stars">${'★'.repeat(c.skill)}${'☆'.repeat(4-c.skill)}</div><p>${c.perk}</p><footer><b>${fmt(c.salary)}<small>PER RACE</small></b>${hired?`<button class="alt" data-fire="${c.id}">Release</button>`:`<button data-hire="${c.id}" ${same?`disabled title="Release ${same.name} first"`:''}>${same?'Role filled':'Hire'}</button>`}</footer></article>`;
  }).join('');
  const el=screen(app,`<div class="shop-shell"><aside class="garage-intro"><div><div class="kicker">PADDOCK / ROUND ${String(st.round+1).padStart(2,'0')}</div><h2>${esc(st.team)}</h2><span class="pill">#${esc(st.num)} · ${esc(st.driver)}</span><p>${T.desc}</p></div><div><div class="garage-statline"><div><b>${Math.round(par.power*100)}%</b><span>POWER</span></div><div><b>${Math.round(par.grip*100)}%</b><span>GRIP</span></div><div><b>${(app.settings.assist||'high').toUpperCase()}</b><span>ASSIST</span></div></div><div class="garage-ready"><div class="kicker">THE SURFACE CHANGES</div><p>Find the black groove as the clay dries. Ruts work the suspension; the cushion builds by the wall. High assist lets you lean on it.</p></div></div></aside>
  <section class="panel shop-main"><header class="shop-head"><div><div class="kicker">RACE SHOP · ${st.round+1} / 5</div><h2>${T.name}</h2></div><div class="bank"><div class="kicker">TEAM BANK</div><span class="money">${fmt(st.money)}</span><small>Crew payroll ${fmt(payroll)} / race</small></div></header><div class="shop-event">${T.city} · ${T.event} · ${T.size} · ${T.bank}° top banking · ${T.laps} laps${st.late?' <span class="pill warn">LATE ARRIVAL · REAR START</span>':''}</div>
  <nav class="shop-tabs" aria-label="Race shop"><button data-tab="setup" class="${tab==='setup'?'active':''}">Car & setup</button><button data-tab="crew" class="${tab==='crew'?'active':''}">Crew <span style="opacity:.6">${st.crew.length}</span></button><button data-tab="points" class="${tab==='points'?'active':''}">Championship</button></nav>
  <div class="shop-scroll" ${tab==='setup'?'':'hidden'}><div class="readiness-grid"><div class="readiness"><div class="row"><b>Race car</b><span class="pill ${st.carDmg>10?'warn':'ok'}">${st.carDmg?`${Math.round(st.carDmg)}% DAMAGE`:'READY'}</span></div><div class="bar"><i style="width:${Math.min(100,st.carDmg)}%"></i></div><button class="alt" id="rep" ${!st.carDmg||st.money<rc?'disabled':''}>${st.carDmg?`Repair · ${fmt(rc)}`:'No repairs needed'}</button></div><div class="readiness"><div class="row"><b>Hauler</b><span class="pill ${st.haulerDmg>10?'warn':'ok'}">${st.haulerDmg?`${Math.round(st.haulerDmg)}% DAMAGE`:'READY'}</span></div><div class="bar"><i style="width:${Math.min(100,st.haulerDmg)}%"></i></div><button class="alt" id="hrep" ${!st.haulerDmg||st.money<hc?'disabled':''}>${st.haulerDmg?`Road service · ${fmt(hc)}`:'Ready for the road'}</button></div></div>
  <div class="section-label"><h3>Make the car yours</h3><span class="muted">Permanent for this season</span></div>${upg}<details class="prep-note"><summary>Track prep & driving tips</summary><p>Fresh clay at the green. Tire lines build rubber, ruts at entry/exit, and a growing cushion. The dry black groove gains speed. Use short steering taps and let the car settle. High assist catches excess yaw; Medium and lower give you more to manage. Press H for controls.</p></details></div>
  <div class="shop-scroll" ${tab==='crew'?'':'hidden'}><div class="section-label" style="margin-top:0"><h3>People make the difference</h3><span class="pill ${payroll>st.money?'warn':''}">${fmt(payroll)} / RACE</span></div><p class="muted" style="margin:0 0 13px">One person per role. Salary comes out of your feature payout, not when you hire. Release a crew member to free their seat.</p><div class="crew-grid">${crew}</div></div>
  <div class="shop-scroll" ${tab==='points'?'':'hidden'}><div class="section-label"><h3>Championship standings</h3><span class="muted">${st.results.length} / 5 FEATURES COMPLETE</span></div><table class="shop-standings"><tr><th>Pos</th><th>Driver</th><th style="text-align:right">Points</th></tr>${standingsRows(st)}</table><p class="muted" style="margin-top:16px">Points reward every finish: ${POINTS.join(' / ')}. Bring it home clean and build the team for the next round.</p></div>
  <footer class="shop-footer"><div class="row"><button class="alt" id="sched">Schedule</button><button class="alt" id="menu">Main menu</button></div><div><button id="race">Go racing →</button><div class="status-caption" style="text-align:right">${st.carDmg>60?'Damage will hurt your pace — consider a repair.':'Rolling start · H for controls'}</div></div></footer></section></div>`);
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
  const me = res.find(r => r.player);
  for (const r of res) st.standings[r.name] = (st.standings[r.name] || 0) + r.pts;
  const payroll = st.crew.reduce((a, id) => a + (CREW_POOL.find(c => c.id === id)?.salary || 0), 0);
  const bonus = me.bonusTotal || 0;
  st.money += me.purse + bonus - payroll; st.earnings = (st.earnings || 0) + me.purse + bonus;
  st.carDmg = Math.min(100, playerDmg);
  st.results.push({ track: app.track.short, pos: me.pos, pts: me.pts, purse: me.purse + bonus, late: st.late, dnf: me.dnf });
  st.late = false;
  app.save();
  app.goto('results', { res, payroll });
}
export function results(app, { res, payroll } = {}) {
  const st = app.state, last = st.round >= TRACKS.length - 1;
  if (!res) { app.goto('load'); return; }
  const me = res.find(r => r.player);
  const bonus = me.bonus || [], bonusTotal = me.bonusTotal || 0, net = me.purse + bonusTotal - (payroll || 0);
  const gainTxt = g => g > 0 ? `<span class="up">▲${g}</span>` : g < 0 ? `<span class="down">▼${-g}</span>` : '<span class="muted">—</span>';
  const el = screen(app, `<div class="flex results-layout" style="margin-left:auto;margin-right:24px"><div class="panel results" style="width:640px">
    <h2>${app.track.event.toUpperCase()} — FEATURE RESULTS</h2><div class="muted">${app.track.name}, ${app.track.city}</div>
    <div class="res-head"><div class="res-pos" style="color:${me.pos === 1 ? '#ffc83d' : '#fff'}">${me.pos === 1 ? 'VICTORY LANE!' : 'P' + me.pos}${me.dnf ? ' (DNF)' : ''}</div>
      <div class="res-sub">Started P${me.start} • ${me.gain > 0 ? 'gained ' + me.gain : me.gain < 0 ? 'lost ' + (-me.gain) : 'held position'}${me.led ? ` • led ${me.led} lap${me.led > 1 ? 's' : ''}` : ''}${me.best ? ` • best lap ${me.best.toFixed(2)}s` : ''}</div></div>
    <table class="res-table"><tr><th>Pos</th><th>Driver</th><th>Start</th><th>+/−</th><th>Led</th><th>Best lap</th><th>Pts</th><th>Purse</th></tr>${res.map(r => `<tr class="${r.player ? 'me' : ''}"><td>${r.pos}</td><td>#${esc(r.num)} ${esc(r.name)}${r.dnf ? ' (DNF)' : ''}</td><td>${r.start}</td><td>${gainTxt(r.gain)}</td><td>${r.led || ''}</td><td>${r.best ? r.best.toFixed(2) + 's' : '—'}</td><td>+${r.pts}</td><td>${fmt(r.purse)}</td></tr>`).join('')}</table>
    <div class="payout"><h3>Payout</h3>
      <div class="pl"><span>Finishing purse (P${me.pos})</span><b>${fmt(me.purse)}</b></div>
      ${bonus.map(([l, a]) => `<div class="pl bonus"><span>${l}</span><b>+${fmt(a)}</b></div>`).join('')}
      <div class="pl neg"><span>Crew payroll</span><b>−${fmt(payroll || 0)}</b></div>
      <div class="pl total"><span>Net this race</span><b class="${net >= 0 ? 'money' : 'down'}">${net >= 0 ? '' : '−'}${fmt(Math.abs(net))}</b></div>
      <div class="pl"><span>Car damage to repair</span><b>${Math.round(st.carDmg)}%</b></div>
      <div class="pl"><span>Bank</span><b class="money">${fmt(st.money)}</b></div></div>
    <div class="row"><span style="flex:1"></span>${last ? '<button id="go">Season summary →</button>' : '<button id="go">Load the hauler →</button>'}</div></div>
    <div class="panel" style="width:280px"><h3>Standings</h3><table>${standingsRows(st)}</table></div></div>`);
  el.querySelector('#go').onclick = () => app.goto(last ? 'season' : 'load');
}
// called by the loading mini-game
export function afterLoad(app, r) {
  const st = app.state;
  st.money -= r.cost; st.carDmg = Math.min(100, st.carDmg + r.dmg); st.slackBonus = r.bonusHours; st.loadLog = r; app.save();
  app.goto('map');
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
export function drawUSMap(cv, opts) {
  const g = cv.getContext('2d'), W = cv.width, H = cv.height;
  const lon0 = -125.5, lon1 = -66, lat0 = 24, lat1 = 50, k = Math.cos(38 * Math.PI / 180);
  const sc = Math.min(W / ((lon1 - lon0) * k), H / (lat1 - lat0)) * 0.98, ox = (W - (lon1 - lon0) * k * sc) / 2, oy = (H - (lat1 - lat0) * sc) / 2;
  const P = ([lo, la]) => [ox + (lo - lon0) * k * sc, oy + (lat1 - la) * sc];
  g.clearRect(0, 0, W, H);
  const bg = g.createRadialGradient(W / 2, H / 2, 50, W / 2, H / 2, W * 0.7); bg.addColorStop(0, '#16222b'); bg.addColorStop(1, '#070b10'); g.fillStyle = bg; g.fillRect(0, 0, W, H);
  // grid
  g.strokeStyle = 'rgba(120,170,200,0.06)'; g.lineWidth = 1; for (let lo = -125; lo < -65; lo += 5) { g.beginPath(); g.moveTo(...P([lo, 24])); g.lineTo(...P([lo, 50])); g.stroke(); } for (let la = 25; la < 50; la += 5) { g.beginPath(); g.moveTo(...P([-126, la])); g.lineTo(...P([-66, la])); g.stroke(); }
  g.beginPath(); US.forEach((p, i) => i ? g.lineTo(...P(p)) : g.moveTo(...P(p))); g.closePath();
  const lg = g.createLinearGradient(0, 0, 0, H); lg.addColorStop(0, '#3b3a2c'); lg.addColorStop(1, '#4a3424'); g.fillStyle = lg; g.fill();
  g.shadowColor = 'rgba(120,200,255,0.4)'; g.shadowBlur = 12; g.strokeStyle = '#9fc6d8'; g.lineWidth = 2; g.stroke(); g.shadowBlur = 0;
  // interstates
  g.lineJoin = 'round'; g.lineCap = 'round';
  for (const [name, line] of Object.entries(INTERSTATES)) {
    g.strokeStyle = 'rgba(30,70,160,0.8)'; g.lineWidth = 3; g.beginPath(); line.forEach((p, i) => i ? g.lineTo(...P(p)) : g.moveTo(...P(p))); g.stroke();
    g.strokeStyle = 'rgba(160,190,255,0.5)'; g.lineWidth = 1; g.stroke();
    const [x, y] = P(line[Math.floor(line.length / 2)]); g.fillStyle = '#1a3d8f'; g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.beginPath(); g.arc(x, y, 11, 0, 7); g.fill(); g.stroke();
    g.fillStyle = '#fff'; g.font = '700 9px Arial'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(name.slice(2), x, y + 1);
  }
  // route
  if (opts.route) {
    const pts = opts.route.pts.map(P);
    g.strokeStyle = '#ffc83d'; g.lineWidth = 6; g.shadowColor = '#ffb020'; g.shadowBlur = 18; g.beginPath(); pts.forEach((p, i) => i ? g.lineTo(...p) : g.moveTo(...p)); g.stroke(); g.shadowBlur = 0;
    g.setLineDash([10, 8]); g.lineDashOffset = -(opts.t || 0) * 30; g.strokeStyle = '#3a2000'; g.lineWidth = 2; g.stroke(); g.setLineDash([]);
    // city ticks
    g.fillStyle = '#e9c9a0'; g.font = '600 11px Segoe UI, Arial'; g.textAlign = 'left';
    opts.route.cities.forEach((c, i) => { const p = pts[Math.min(pts.length - 2, i + 1)]; g.beginPath(); g.arc(p[0], p[1], 3, 0, 7); g.fill(); g.fillText(c, p[0] + 6, p[1] - 6); });
    // truck marker along the route
    const f = opts.progress ?? ((opts.t || 0) * 0.08 % 1); const segL = []; let tot = 0;
    for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); segL.push(l); tot += l; }
    let d = f * tot, i = 0; while (i < segL.length - 1 && d > segL[i]) { d -= segL[i]; i++; }
    const a = pts[i], b = pts[i + 1], u = Math.min(1, d / segL[i]); const tx = a[0] + (b[0] - a[0]) * u, ty = a[1] + (b[1] - a[1]) * u;
    g.fillStyle = '#fff'; g.shadowColor = '#fff'; g.shadowBlur = 14; g.beginPath(); g.arc(tx, ty, 6, 0, 7); g.fill(); g.shadowBlur = 0; g.font = '16px serif'; g.fillText('🚚', tx - 9, ty - 10);
  }
  // tracks
  TRACKS.forEach((t, i) => {
    const [x, y] = P([t.lon, t.lat]); const done = i < opts.round, next = i === opts.round + 1, cur = i === opts.round;
    g.fillStyle = cur ? '#5fd16a' : next ? '#ffc83d' : done ? '#777' : '#ff7a4a'; g.strokeStyle = '#000'; g.lineWidth = 2;
    g.beginPath(); g.arc(x, y, next || cur ? 9 : 7, 0, 7); g.fill(); g.stroke();
    g.fillStyle = '#fff'; g.font = '800 13px Segoe UI, Arial'; g.textAlign = 'left'; g.shadowColor = '#000'; g.shadowBlur = 4; g.fillText(`${i + 1}. ${t.short}`, x + 12, y + 4); g.shadowBlur = 0;
  });
}
export function map(app) {
  const st = app.state, route = app.route, from = TRACKS[st.round], to = TRACKS[st.round + 1];
  const miles = routeMiles(route), dl = deadlineHours(route, st), co = app.crew('Co-Driver');
  const fuelCost = Math.round(miles / 6.5 * 4.1);
  const el = screen(app, `<div class="route-layout" style="position:absolute;inset:0;display:flex;gap:18px;padding:22px">
    <div class="panel route-map" style="flex:1;padding:10px;display:flex"><canvas id="usmap" style="width:100%;height:100%"></canvas></div>
    <div class="panel route-info" style="width:360px">
      <h2>ROUTE PLANNER</h2>
      <div style="font:700 17px Segoe UI">${from.short} → <span style="color:#ffc83d">${to.name}</span></div><div class="muted">${from.city} → ${to.city}</div>
      <div class="card" style="margin-top:12px"><div>Via <b>${route.hwy.join(' → ')}</b></div><div>Distance: <b>${miles} mi</b></div><div>Deadline: <b>${dl.toFixed(1)} h</b> to make the drivers' meeting${st.slackBonus ? ` <span style="color:#5fd16a">(+${st.slackBonus.toFixed(1)}h from a quick load)</span>` : ''}</div>
        <div>Est. diesel: ~${fmt(fuelCost)} (${(miles / 6.5).toFixed(0)} gal @ $4.10)</div></div>
      <div class="card"><div class="row"><span style="width:90px">Fuel</span><div class="bar"><i style="width:${st.fuel * 100}%;background:#ffc83d"></i></div></div>
        <div class="row"><span style="width:90px">Fatigue</span><div class="bar"><i style="width:${st.fatigue * 100}%"></i></div></div>
        <div class="row"><span style="width:90px">Rig damage</span><div class="bar"><i style="width:${st.haulerDmg}%"></i></div></div>
        ${st.loadLog ? `<div class="muted" style="margin-top:6px">Loading: ${st.loadLog.time.toFixed(0)}s${st.loadLog.dmg ? `, ${st.loadLog.dmg.toFixed(0)}% car damage` : ', clean'}${st.loadLog.cost ? `, cost ${fmt(st.loadLog.cost)}` : ''}</div>` : ''}</div>
      <p class="muted">Drive it yourself: stay under the limit (75 mph trap), stop at truck stops for diesel & rest (E near an exit). Run dry = tow. Too tired = drifting. Wrecking the rig damages the race car inside.</p>
      <button id="drive" style="width:100%;font-size:18px">🚚 Hit the road (drive)</button>
      <button id="auto" class="alt" style="width:100%" ${co ? '' : 'disabled title="Hire a CDL co-driver in the shop"'}>Co-driver hauls it overnight (${fmt(fuelCost + 400)})</button>
      <div class="row" style="margin-top:8px"><span class="money">${fmt(st.money)}</span></div>
    </div></div>`);
  const cv = el.querySelector('#usmap');
  const fit = () => { const r = cv.getBoundingClientRect(); cv.width = r.width * Math.min(devicePixelRatio,1.5); cv.height = r.height * Math.min(devicePixelRatio,1.5); };
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
  const late = info.hours > info.deadline;
  st.round++; st.late = late; st.slackBonus = 0;
  if (late) st.money -= LATE_FEE;
  if (info.auto) { st.money -= info.fuelSpent; st.fatigue = 0.1; st.fuel = 0.8; }
  st.arrival = { ...info, late }; app.save();
  app.goto('arrive', st.arrival);
}
export function arrive(app, info) {
  const st = app.state, T = app.track; info = info || st.arrival || {};
  const el = screen(app, `<div class="panel" style="width:560px;margin-left:auto;margin-right:40px">
    <h2>ARRIVED: ${T.name.toUpperCase()}</h2><div class="muted">${T.city} • ${T.event}</div>
    <div style="font:italic 900 40px Impact;margin:10px 0;color:${info.late ? '#ff5a4a' : '#5fd16a'}">${info.late ? 'LATE FOR THE DRIVERS\' MEETING' : 'MADE IT ON TIME'}</div>
    <table><tr><td>Travel time</td><td>${(info.hours || 0).toFixed(1)} h (deadline ${(info.deadline || 0).toFixed(1)} h)</td></tr>
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
 const st=app.state,rows=Object.entries(st.standings).sort((a,b)=>b[1]-a[1]),pos=rows.findIndex(r=>r[0]===st.driver)+1;
 const wins=st.results.filter(r=>r.pos===1).length,top3=st.results.filter(r=>r.pos<=3).length;
 st.phase='season';app.save();
 const el=screen(app,`<div class="panel season-panel"><header class="season-hero"><div><div class="kicker">2026 DIRT TRACK TOUR / SEASON RECAP</div><h2>${pos===1?'Tour champion!':'Every mile earned.'}</h2><p class="muted">${esc(st.driver)} · #${esc(st.num)} · ${esc(st.team)}</p></div><div class="season-medal">P${pos}</div></header>
 <div class="season-stats"><div class="card"><b>${wins}</b><span>FEATURE WINS</span></div><div class="card"><b>${top3}</b><span>PODIUMS</span></div><div class="card"><b>${st.standings[st.driver]||0}</b><span>CHAMPIONSHIP POINTS</span></div><div class="card"><b>${fmt(st.earnings||0)}</b><span>TOTAL WINNINGS</span></div></div>
 <div class="season-tables"><section><h3>Final championship standings</h3><table><tr><th>Pos</th><th>Driver</th><th>Pts</th></tr>${standingsRows(st)}</table></section><section><h3>Your tour, one feature at a time</h3><table><tr><th>Track</th><th>Fin</th><th>Pts</th><th>Purse</th></tr>${st.results.map(r=>`<tr><td>${r.track}${r.late?' · late':''}</td><td>${r.dnf?'DNF':'P'+r.pos}</td><td>${r.pts}</td><td>${fmt(r.purse)}</td></tr>`).join('')}</table><p class="muted" style="margin-top:15px">Five legendary dirt tracks and the miles in between. Thanks for taking the tour.</p><div class="kicker">TEAM BANK</div><span class="money">${fmt(st.money)}</span></section></div>
 <div class="journey-footer"><button id="recap-menu" class="alt">Main menu</button><button id="again">Start a new season →</button></div></div>`);
 el.querySelector('#recap-menu').onclick=()=>app.goto('title');el.querySelector('#again').onclick=()=>{app.clearSave();app.state=null;app.goto('title');};
}
