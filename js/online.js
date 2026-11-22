import {db} from './firebase-config.js';
import {ref,get,set,remove,onValue,off,runTransaction,onDisconnect} from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js';
import {createBattle,resolveRound,REVEAL_MS,validAction} from './battle-core.js';
const uidKey=(a,b)=>[a,b].sort().join('_');
export async function joinMatch(user,team,onFound){
 const my=ref(db,`matchQueueV2/${user.uid}`);const queue=ref(db,'matchQueueV2');
 let candidate=null;const snap=await get(queue);
 snap.forEach(x=>{if(!candidate&&x.key!==user.uid&&x.val()?.state==='waiting'&&Date.now()-(x.val().at||0)<60000)candidate=x.key;});
 if(candidate){const peer=ref(db,`matchQueueV2/${candidate}`);const claimed=await runTransaction(peer,v=>v?.state==='waiting'?{...v,state:'paired',peer:user.uid}:undefined,{applyLocally:false});
 if(claimed.committed){const id='duel_'+uidKey(candidate,user.uid)+'_'+claimed.snapshot.val().at;const room=ref(db,`duelsV2/${id}`);await runTransaction(room,v=>v||{...createBattle(claimed.snapshot.val().team,team),ids:[candidate,user.uid],names:[claimed.snapshot.val().name,user.displayName||'玩家'],createdAt:Date.now()},{applyLocally:false});onFound(id);return ()=>{};}}
 await set(my,{state:'waiting',at:Date.now(),name:user.displayName||'玩家',team});onDisconnect(my).remove();
 const callback=s=>{const v=s.val();if(v?.state==='paired'){const id='duel_'+uidKey(user.uid,v.peer)+'_'+v.at;off(my,'value',callback);onFound(id);remove(my).catch(console.error);}};
 onValue(my,callback);return ()=>{off(my,'value',callback);remove(my).catch(console.error);};
}
export function watchRoom(id,callback){const r=ref(db,`duelsV2/${id}`);const fn=s=>callback(s.val());onValue(r,fn);return ()=>off(r,'value',fn);}
async function digest(payload){const bytes=new TextEncoder().encode(payload);const hash=await crypto.subtle.digest('SHA-256',bytes);return Array.from(new Uint8Array(hash),x=>x.toString(16).padStart(2,'0')).join('');}
const storageKey=(id,round)=>`luck-duel:${id}:${round}`;
export async function submitSecret(id,battle,side,action){if(battle.phase!=='commit'||!validAction(battle,side,action))throw Error('行動無效或已過截止時間');
 const bytes=crypto.getRandomValues(new Uint8Array(24));const nonce=Array.from(bytes,x=>x.toString(16).padStart(2,'0')).join('');const hash=await digest(JSON.stringify(action)+nonce);
 const r=ref(db,`duelsV2/${id}`);const tx=await runTransaction(r,v=>{if(!v||v.phase!=='commit'||v.round!==battle.round||v.commitments?.[side]||Date.now()>v.deadline)return;v.commitments={...v.commitments,[side]:hash};return v;},{applyLocally:false});
 if(!tx.committed)throw Error('行動已提交或超時');localStorage.setItem(storageKey(id,battle.round),JSON.stringify({action,nonce}));await progressRoom(id);}
export async function progressRoom(id){const r=ref(db,`duelsV2/${id}`);
 const tx=await runTransaction(r,v=>{if(!v||v.phase==='ended')return;
 const now=Date.now();if(v.phase==='commit'&&(Object.keys(v.commitments||{}).length===2||now>=v.deadline)){
 v.phase='reveal';v.deadline=now+REVEAL_MS;v.reveals=v.reveals||{};return v;}
 return;},{applyLocally:false});return tx.snapshot.val();}
export async function revealMine(id,battle,side){if(battle.phase!=='reveal'||!battle.commitments?.[side]||battle.reveals?.[side])return;
 const saved=localStorage.getItem(storageKey(id,battle.round));if(!saved)return;
 const {action,nonce}=JSON.parse(saved);if(await digest(JSON.stringify(action)+nonce)!==battle.commitments[side])return;
 const r=ref(db,`duelsV2/${id}`);await runTransaction(r,v=>{if(!v||v.phase!=='reveal'||v.round!==battle.round||v.reveals?.[side])return;v.reveals={...v.reveals,[side]:{action,nonce}};return v;},{applyLocally:false});await finishRound(id);}
export async function finishRound(id){const r=ref(db,`duelsV2/${id}`);const observed=(await get(r)).val();if(!observed||observed.phase!=='reveal')return;
 if(Object.keys(observed.reveals||{}).length<2&&Date.now()<observed.deadline)return;
 const verified=await Promise.all([0,1].map(async s=>{const reveal=observed.reveals?.[s];if(!reveal||!observed.commitments?.[s])return null;return await digest(JSON.stringify(reveal.action)+reveal.nonce)===observed.commitments[s]?reveal.action:null;}));
 await runTransaction(r,v=>{if(!v||v.phase!=='reveal'||v.round!==observed.round||JSON.stringify(v.reveals||{})!==JSON.stringify(observed.reveals||{})||Date.now()<v.deadline&&Object.keys(v.reveals||{}).length<2)return;
 // Null reveals are timeouts. Manual skip carries a valid commitment and resets the streak.
 for(let s=0;s<2;s++)v.players[s].timeouts=verified[s]?0:(v.players[s].timeouts||0)+1;
 if(v.players[0].timeouts>=3||v.players[1].timeouts>=3){v.winner=v.players[0].timeouts>=3&&v.players[1].timeouts>=3?'draw':v.players[0].timeouts>=3?1:0;v.phase='ended';v.logs=[...v.logs,'連續 3 回合超時，判定敗北'];return v;}
 return resolveRound(v,verified.map((a,s)=>a||{kind:'skip',unit:v.players[s].units.findIndex(u=>u.hp>0)}));},{applyLocally:false});}
export async function claimResult(id,uid,side,winner){const path=ref(db,`users/${uid}`);let reward=null;
 await runTransaction(path,v=>{if(!v||v.claimedGames?.[id])return;v.claimedGames={...v.claimedGames,[id]:true};const result=winner==='draw'?'draw':winner===side?'win':'loss';const points=result==='win'?20:result==='loss'?-10:0;v.rating=Math.max(0,(v.rating||1000)+points);v.coins=(v.coins||0)+(result==='win'?100:result==='loss'?50:75);v[result==='win'?'wins':result==='loss'?'losses':'draws']=(v[result==='win'?'wins':result==='loss'?'losses':'draws']||0)+1;reward={result,points,coins:result==='win'?100:result==='loss'?50:75};return v;},{applyLocally:false});return reward;}
