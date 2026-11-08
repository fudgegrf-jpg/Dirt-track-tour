// Active championship policy. Archived venues are not imported here or in data.js.
import {TRACKS,AI_DRIVERS,POINTS} from './data.js';
export const SEASON_TRACK_VERSION=2;
export const validRound = round => Number.isInteger(round)&&round>=0&&round<TRACKS.length;
export function migrateSeasonSave(s){
 if(!s||typeof s!=='object')return false;
 const ids=TRACKS.map(t=>t.id);
 if(s.seasonTrackVersion===SEASON_TRACK_VERSION&&JSON.stringify(s.seasonTrackIds)===JSON.stringify(ids)&&validRound(s.round))return false;
 const oldRound=Number.isInteger(s.round)?s.round:0,oldPhase=s.phase,original=Array.isArray(s.results)?s.results.filter(r=>r&&typeof r==='object'):[];
 const matches=(r,t)=>[t.id,t.short,t.name,...(t.id==='salina'?['Volusia','volusia']:[])].includes(r.trackId||r.track);
 const active=TRACKS.map(t=>original.find(r=>matches(r,t)));let count=0;while(count<active.length&&active[count])count++;
 // Keep the full pre-migration record for restoring the longer championship.
 s.disabledTrackArchive ||= JSON.parse(JSON.stringify({round:s.round,phase:s.phase,results:original,standings:s.standings||{},lastClassification:s.lastClassification||null,log:s.log||[],pitPose:s.pitPose||null,arrival:s.arrival||null}));
 const oldStandings={...(s.standings||{})};
 const removed=original.some(r=>!TRACKS.some(t=>matches(r,t)))||Object.values(oldStandings).reduce((n,v)=>n+(Number.isFinite(v)?v:0),0)>count*POINTS.reduce((n,v)=>n+v,0)+.5;
 s.results=active.slice(0,count).map((r,i)=>({...r,track:TRACKS[i].short,trackId:TRACKS[i].id}));
 s.standings={...oldStandings};
 if(removed){
  s.standings=Object.fromEntries(AI_DRIVERS.map(d=>[d.name,0]));s.standings[s.driver]=0;
  const order=AI_DRIVERS.map(d=>d.name).sort((a,b)=>(oldStandings[b]||0)-(oldStandings[a]||0));
  for(let i=0;i<s.results.length;i++){
   const result=s.results[i],classification=result.classification||(s.lastClassification?.round===i?s.lastClassification.res:null);
   if(Array.isArray(classification)&&classification.length===AI_DRIVERS.length+1&&classification.every(r=>Number.isFinite(r.pts))){
    for(const r of classification)if(Object.hasOwn(s.standings,r.name))s.standings[r.name]+=r.pts;
   }else{
    // Old saves stored only aggregate AI points, not every race classification.
    // Rebuild a legal ACTIVE-round points budget using preserved opponent rank;
    // flag the estimate in the UI and retain the untouched original in archive.
    s.legacyOpponentPointsEstimated=true;let ai=0;const pos=Math.max(0,Math.min(POINTS.length-1,(result.pos||8)-1));
    for(let rank=0;rank<POINTS.length;rank++)if(rank!==pos)s.standings[order[ai++]]+=POINTS[rank];
   }
  }
 }
 s.standings[s.driver]=s.results.reduce((n,r)=>n+(Number.isFinite(r.pts)?r.pts:0),0);
 const complete=count===TRACKS.length,last=TRACKS.length-1,oldValid=validRound(s.round);
 let round=oldValid?oldRound:Math.min(count,last),phase=oldPhase||'shop';
 if(!['title','schedule','shop','race','results','load','map','highway','arrive','season'].includes(phase))phase=complete?'season':'shop';
 if(!oldValid||round>count||(!complete&&phase==='season')){round=Math.min(count,last);phase=complete?'season':'shop';}
 if(complete&&((!oldValid)||['highway','map','arrive','shop','race','schedule'].includes(phase))){round=last;phase='season';}
 if(['highway','map'].includes(phase)&&round>=last)phase=complete?'season':'shop';
 const moved=round!==oldRound||phase!==oldPhase||!oldValid;
 if(moved){delete s.pitPose;delete s.loadLog;delete s.lastClassification;s.arrival=null;s.slackBonus=0;s.late=false;}
 if(Array.isArray(s.log))s.log=s.log.filter(r=>!r||!r.track||TRACKS.some(t=>matches(r,t)));
 for(const key of ['trackId','selectedTrack','selectedTrackId','quickTrack','quickTrackId','track'])if(typeof s[key]==='string'&&!TRACKS.some(t=>[t.id,t.name,t.short].includes(s[key])))s[key]=TRACKS[round].id;
 s.round=round;s.phase=phase;s.seasonTrackVersion=SEASON_TRACK_VERSION;s.seasonTrackIds=ids;return true;
}
