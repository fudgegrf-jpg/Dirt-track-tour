// Display names are labels, never championship keys. These IDs do not change
// when a driver is renamed, or when the player chooses an opponent's name.
import {AI_DRIVERS,POINTS,TRACKS} from './data.js';
export const PLAYER_ID='player';
export const DRIVER_IDENTITY_VERSION=1;
const roster=new Map(AI_DRIVERS.map(d=>[d.id,d]));
const opponent=name=>AI_DRIVERS.find(d=>d.name===name);
const number=v=>typeof v==='number'&&Number.isFinite(v);
const copy=o=>JSON.parse(JSON.stringify(o));
function estimatedPlayerShare(total,n,old,driver){
 if(!n)return Math.ceil(total/2);
 // Prefer a split that is attainable under the scoring table, not two
 // invented half-awards. A one-race save also reveals the occupied places.
 const occupied=n===1?AI_DRIVERS.filter(d=>d.name!==driver).map(d=>old[d.name]):[];
 const awards=POINTS.filter(p=>!occupied.includes(p));let totals=new Set([0]);
 for(let i=0;i<n;i++)totals=new Set([...totals].flatMap(t=>awards.map(p=>t+p)));
 const choices=[...totals].filter(t=>totals.has(total-t)).sort((a,b)=>Math.abs(a-total/2)-Math.abs(b-total/2));
 return choices[0]??Math.max(n*Math.min(...POINTS),Math.min(n*Math.max(...POINTS),Math.round(total/2)));
}
export const classificationRows=c=>Array.isArray(c)?c:Object.values(c||{});
export function driverIdFor(row){
 if(row.player)return PLAYER_ID;
 if(row.driverId===PLAYER_ID||roster.has(row.driverId))return row.driverId;
 return opponent(row.name)?.id||`legacy:${encodeURIComponent(row.name||'unknown')}`;
}
export function driverName(s,id){return id===PLAYER_ID?s.driver:roster.get(id)?.name||s.driverNames?.[id]||id;}

// Old summaries retained the player's exact finish/points; full classifications
// additionally identify the player by flag, position, or unique points award.
function migrateClassification(input,s,summary={}){
 const rows=classificationRows(input),used=new Set(),out={};
 let pi=rows.findIndex(r=>r.driverId===PLAYER_ID||r.player===true);
 if(pi<0){const candidates=rows.map((r,i)=>({r,i})).filter(({r})=>r.name===s.driver);
  const byPos=candidates.filter(({r})=>number(summary.pos)&&r.pos===summary.pos);
  const byPts=candidates.filter(({r})=>number(summary.pts)&&r.pts===summary.pts);
  if(byPos.length===1)pi=byPos[0].i;
  else if(byPts.length===1)pi=byPts[0].i;
  else if(candidates.length===1&&!opponent(s.driver))pi=candidates[0].i;
 }
 for(let i=0;i<rows.length;i++){
  const r=rows[i],id=i===pi?PLAYER_ID:(r.driverId&&roster.has(r.driverId)?r.driverId:opponent(r.name)?.id);
  // Two indistinguishable rows cannot both silently become one opponent.
  if(!id||used.has(id)||i!==pi&&r.name===s.driver&&opponent(s.driver)&&pi<0)continue;
  used.add(id);out[id]={...r,driverId:id,player:id===PLAYER_ID};
 }
 if(!out[PLAYER_ID])out[PLAYER_ID]={driverId:PLAYER_ID,name:s.driver,player:true,pos:summary.pos??null,pts:number(summary.pts)?summary.pts:null};
 for(const d of AI_DRIVERS)if(!out[d.id])out[d.id]={driverId:d.id,name:d.name,player:false,pos:null,pts:null,estimated:true};
 for(const row of Object.values(out))if(!number(row.pts))row.estimated=true;
 return out;
}
export function migrateDriverIds(s){
 if(!s||typeof s!=='object'||s.driverIdentityVersion===DRIVER_IDENTITY_VERSION)return false;
 // This verbatim archive is deliberately not rewritten by future migrations.
 s.driverIdentityArchive ||= copy({driver:s.driver,standings:s.standings||{},results:s.results||[],lastClassification:s.lastClassification||null,legacyOpponentPointsEstimated:!!s.legacyOpponentPointsEstimated});
 const old=s.standings||{},results=Array.isArray(s.results)?s.results:[],legacyEstimated=!!s.legacyOpponentPointsEstimated;
 s.driverId=PLAYER_ID;s.driverNames={...Object.fromEntries(AI_DRIVERS.map(d=>[d.id,d.name])),[PLAYER_ID]:s.driver};
 for(let i=0;i<results.length;i++){
  const r=results[i];r.driverId=PLAYER_ID;
  const latest=s.lastClassification?.round===i?s.lastClassification.res:null;
  r.classification=migrateClassification(latest?.length?latest:r.classification,s,r);
  if(!number(r.pts)&&number(r.classification[PLAYER_ID]?.pts))r.pts=r.classification[PLAYER_ID].pts;
  r.classificationEstimated=Object.values(r.classification).some(row=>row.estimated);
 }
 if(s.lastClassification){
  const last=s.lastClassification,summary=results[last.round]||{};
  last.byDriverId=migrateClassification(last.res||last.byDriverId,s,summary);
  last.res=Object.values(last.byDriverId).sort((a,b)=>(a.pos??99)-(b.pos??99));
 }
 const n=results.length,min=n*Math.min(...POINTS),max=n*Math.max(...POINTS);
 const validTotal=v=>number(v)&&v>=min&&v<=max;
 const knownPlayer=results.every(r=>number(r.pts));
 const playerTotal=knownPlayer?results.reduce((p,r)=>p+r.pts,0):null;
 const standings={},estimated={},unknown=[];
 // A missing race history must not silently zero an existing points balance.
 standings[PLAYER_ID]=playerTotal!==null&&(n>0||!(old[s.driver]>0))?playerTotal:(number(old[s.driver])?old[s.driver]:0);
 if(playerTotal===null&&opponent(s.driver)&&number(old[s.driver]))standings[PLAYER_ID]=estimatedPlayerShare(old[s.driver],n,old,s.driver);
 estimated[PLAYER_ID]=playerTotal===null||n===0&&standings[PLAYER_ID]>0;
 for(const d of AI_DRIVERS){
  const rows=results.map(r=>r.classification[d.id]);
  const complete=n>0&&rows.every(r=>number(r.pts));
  if(complete){standings[d.id]=rows.reduce((p,r)=>p+r.pts,0);estimated[d.id]=rows.some(r=>r.estimated);}
  else if(d.name!==s.driver&&number(old[d.name])){standings[d.id]=old[d.name];estimated[d.id]=legacyEstimated||!validTotal(old[d.name]);}
  else if(d.name===s.driver){
   let split=playerTotal===null?null:old[d.name]-playerTotal;
   if(!n&&number(old[d.name])&&old[d.name]>0){standings[d.id]=old[d.name]-standings[PLAYER_ID];estimated[d.id]=true;continue;}
   // Night11 sometimes replaced the merged total with player-only points.
   // Use its untouched archive only when it covers exactly these active races.
   const archive=s.disabledTrackArchive,archived=archive?.results;
   const sameHistory=Array.isArray(archived)&&archived.length===n&&archived.every((r,i)=>
    (r.trackId||r.track)===(results[i].trackId||results[i].track)||TRACKS.some(t=>[t.id,t.short,t.name].includes(r.trackId||r.track)&&[t.id,t.short,t.name].includes(results[i].trackId||results[i].track)));
   if(!validTotal(split)&&knownPlayer&&sameHistory&&number(archive.standings?.[d.name]))split=archive.standings[d.name]-playerTotal;
   if(validTotal(split)){standings[d.id]=split;estimated[d.id]=legacyEstimated;}
   else unknown.push(d);
  }else unknown.push(d);
 }
 // With a full eight-car grid, the points budget can recover the missing AI
 // total exactly even when Night11 already overwrote the original merged key.
 let budget=n*POINTS.reduce((a,b)=>a+b,0)-standings[PLAYER_ID]-AI_DRIVERS.reduce((a,d)=>a+(standings[d.id]??0),0);
 if(unknown.length===1&&validTotal(budget)){
  standings[unknown[0].id]=budget;estimated[unknown[0].id]=Object.values(estimated).some(Boolean);unknown.length=0;
 }
 for(let i=0;i<unknown.length;i++){
  const d=unknown[i],left=unknown.length-i;
  const value=number(budget)?Math.max(min,Math.min(max,Math.round(budget/left))):min;
  standings[d.id]=value;estimated[d.id]=true;budget-=value;
 }
 // Keep unusual/older roster entries instead of dropping their accumulated points.
 for(const [name,pts]of Object.entries(old))if(name!==s.driver&&!opponent(name)){
  const id=`legacy:${encodeURIComponent(name)}`;standings[id]=pts;s.driverNames[id]=name;estimated[id]=true;
 }
 // Preserve the historical AI-first tie ordering used by the championship UI.
 s.standings=Object.fromEntries([...AI_DRIVERS.map(d=>[d.id,standings[d.id]??0]),[PLAYER_ID,standings[PLAYER_ID]],...Object.entries(standings).filter(([id])=>id.startsWith('legacy:'))]);
 s.standingEstimates=estimated;
 s.driverIdentityEstimated=Object.values(estimated).some(Boolean)||results.some(r=>r.classificationEstimated);
 s.driverIdentityVersion=DRIVER_IDENTITY_VERSION;
 return true;
}
