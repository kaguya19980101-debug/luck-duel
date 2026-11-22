import { COMPANION_BY_ID,GEAR_BY_ID,SKILL_BY_ID,HERO_CLASSES,STARTER_IDS } from './catalog.js';
export const TURN_MS=30000;export const REVEAL_MS=10000;
const clamp=(x,a,b)=>Math.max(a,Math.min(b,x));
const gearEffect=(u,kind)=>Object.values(u.gear||{}).map(id=>GEAR_BY_ID[id]).filter(g=>g?.effect===kind).reduce((n,g)=>n+g.value,0);
export function teamFromAccount(account,side){
 const h=account.hero;const c=HERO_CLASSES[h.class];let gearHp=0,gearAttack=0;
 for(const id of Object.values(h.equipment||{})){const g=GEAR_BY_ID[id];if(g){gearHp+=g.hp;gearAttack+=g.attack;}}
 // PvP stat gap limit: equipment adds at most 36 HP and 12 ATK; gear effects still apply.
 let hp=c.hp+Math.min(36,gearHp),attack=c.attack+Math.min(12,gearAttack);
 const p=SKILL_BY_ID[h.skills?.passive];if(p?.kind==='flatHp')hp+=p.value;
 const leader=SKILL_BY_ID[h.skills?.leader];
 const hero={id:'hero',name:`${account.name||'玩家'}・${h.class==='novice'?'初心者':({sword:'劍士',mage:'法師',archer:'弓手',healer:'補師'}[h.class])}`,side,hp,maxHp:hp,attack,shield:0,guard:0,active:SKILL_BY_ID[h.skills?.active]||SKILL_BY_ID.starter_active,passive:p,gear:h.equipment||{},attribute:'light',isHero:true};
 const ids=[...new Set([...(account.team||[]),...STARTER_IDS])].filter(x=>COMPANION_BY_ID[x]).slice(0,4);
 const units=[hero,...ids.map(id=>{const x=COMPANION_BY_ID[id];return {id,name:x.name,side,hp:x.hp,maxHp:x.hp,attack:x.attack,shield:0,guard:0,active:x.active,passive:x.passive,attribute:x.attribute,isHero:false};})];
 if(leader?.kind==='leaderHp')for(const u of units){u.maxHp+=Math.round(u.maxHp*leader.value);u.hp=u.maxHp;}
 if(leader?.kind==='leaderAttack')for(const u of units)u.attack=Math.round(u.attack*(1+leader.value));
 return {units,energy:1,timeouts:0,skillCount:0,leader:leader||SKILL_BY_ID.starter_leader};
}
export function createBattle(a,b,now=Date.now()){for(const [side,team] of [a,b].entries())for(const u of team.units)u.side=side;return {round:1,phase:'commit',deadline:now+TURN_MS,players:[a,b],commitments:{},reveals:{},logs:['對戰開始，雙方暗選行動。'],winner:null,mode:'pvp'};}
export function validAction(battle,side,action){const team=battle.players[side];const u=team.units[action?.unit];if(!u||u.hp<=0)return false;
 if(action.kind==='skip')return true;if(action.kind==='guard')return true;
 const target=battle.players[action.kind==='skill'&&['heal','teamHeal','shield','buff','guard'].includes(u.active?.kind)?side:1-side]?.units[action.target];
 if(action.kind==='attack')return !!target&&target.hp>0;
 if(action.kind==='skill'){if(team.energy<(u.active?.cost||0))return false;if(['heal','shield','buff','guard'].includes(u.active.kind))return !!target&&target.hp>0;if(u.active.kind==='teamHeal')return true;return !!target&&target.hp>0;}
 return false;}
const alive=t=>t.units.filter(u=>u.hp>0);
function effectValue(t,kind){return t.leader?.kind===kind?t.leader.value:0;}
function heal(u,n){const before=u.hp;u.hp=clamp(u.hp+Math.max(0,Math.round(n)),0,u.maxHp);return u.hp-before;}
function guard(u,p){u.guard=Math.max(u.guard,clamp(p,0,.8));}
function applySupport(b,s,a,log){const t=b.players[s],u=t.units[a.unit],x=u.active;const target=t.units[a.target];
 if(a.kind==='guard'||(a.kind==='skill'&&x.kind==='guard')){guard(u,(a.kind==='guard'?.35:x.value)+(u.passive?.kind==='guardBonus'?u.passive.value:0)+gearEffect(u,'guardBonus'));if(u.passive?.kind==='guardHeal')heal(u,u.passive.value);if(x?.counter&&a.kind==='skill')u.counter=x.counter;if(gearEffect(u,'guardNextAttack'))u.nextAttack=(u.nextAttack||0)+gearEffect(u,'guardNextAttack');log.push(`${u.name} 防守`);return;}
 if(a.kind!=='skill')return;
 if(x.kind==='heal'){const amount=x.value*(1+effectValue(t,'leaderHeal')+(u.passive?.kind==='healPct'?u.passive.value:0))+gearEffect(u,'healFlat');const restored=heal(target,amount+gearEffect(target,'receivedHeal'));if(gearEffect(u,'overhealShield')&&restored<amount)target.shield+=gearEffect(u,'overhealShield');if(u.passive?.kind==='firstHealShield'&&!u.firstHealDone){target.shield+=u.passive.value;u.firstHealDone=true;}log.push(`${u.name} 治療 ${target.name} ${restored} HP`);}
 if(x.kind==='teamHeal'){for(const friend of alive(t))heal(friend,x.value);log.push(`${u.name} 治療全隊`);}
 if(x.kind==='shield'){target.shield+=x.value;log.push(`${u.name} 為 ${target.name} 施加護盾`);}
 if(x.kind==='buff'){target.bonus=(target.bonus||0)+x.value;log.push(`${u.name} 強化 ${target.name}`);}
}
function damageAmount(b,s,u,v,a){const t=b.players[s];let power=u.attack+(u.bonus||0);if(a.kind==='skill'){power*=u.active.value||1;if(u.passive?.kind==='skillDamage')power*=1+u.passive.value;power*=1+effectValue(t,'leaderSkill');}else{power*=.72;power*=1+effectValue(t,'leaderNormal');}
 if(a.kind==='skill'){power*=1+gearEffect(u,'skillDamage');if(u.passive?.kind==='skillExecute'&&v.hp/v.maxHp<.3)power*=1+u.passive.value;if(t.skillCount%3===0)power*=1+effectValue(t,'leaderThirdSkill');}
 else {power+=gearEffect(u,'attackFlat');power*=1+(u.nextAttack||0);}
 if(u.passive?.kind==='lowHpAttack'&&u.hp/u.maxHp<.3)power*=1+u.passive.value;
 if(u.passive?.kind==='lowTargetBonus'&&v.hp/v.maxHp<.5)power+=u.passive.value;
 if(u.passive?.kind==='execute'&&v.hp/v.maxHp<.3)power+=u.passive.value;
 if(v.hp/v.maxHp<.5)power+=gearEffect(u,'lowTargetFlat');
 if(v.hp/v.maxHp<.3)power+=gearEffect(u,'executeFlat');
 if(v.hp/v.maxHp>.7)power+=gearEffect(u,'highTargetFlat');
 if(u.passive?.kind==='lowTargetPct'&&v.hp/v.maxHp<.5)power*=1+u.passive.value;
 if(effectValue(t,'leaderExecute')&&v.hp/v.maxHp<.3)power*=1+effectValue(t,'leaderExecute');
 if(u.passive?.kind==='sameTargetPct'&&u.lastTarget===v.id)power*=1+u.passive.value;
 if(v.mark)power*=1+v.mark;
 if(u.passive?.kind==='loneStand'&&alive(t).length<alive(b.players[1-s]).length)power*=1+u.passive.value;
 if(u.weaken)power*=1-u.weaken;
 if(effectValue(t,'leaderOutnumbered')&&alive(t).length<alive(b.players[1-s]).length)power*=1+effectValue(t,'leaderOutnumbered');
 const attrs={fire:{grass:1.15,water:.85},grass:{water:1.15,fire:.85},water:{fire:1.15,grass:.85},light:{dark:1.15},dark:{light:1.15}};
 power*=attrs[u.attribute]?.[v.attribute]||1;
 let reduction=v.guard+(v.passive?.kind==='reduce'?v.passive.value:0)+effectValue(b.players[1-s],'leaderGuard');
 if(!v.hitOnce)reduction+=gearEffect(v,'firstHitReduce')+(v.passive?.kind==='firstHitReduce'?v.passive.value:0);
 if(a.kind==='skill'&&!v.skillHitOnce)reduction+=gearEffect(v,'firstSkillReduce');
 for(const ally of alive(b.players[1-s]))if(ally.passive?.kind==='auraReduce')reduction+=ally.passive.value;
 for(const ally of alive(t))if(ally.passive?.kind==='auraAttack')power*=1+ally.passive.value;
 return Math.max(1,Math.round(power*(1-clamp(reduction,0,.85))));}
export function resolveRound(input,actions,now=Date.now()){
 const b=structuredClone(input);if(b.winner!==null||b.round>80)return b;
 const chosen=actions.map((a,s)=>validAction(b,s,a)?a:{kind:'skip',unit:alive(b.players[s]).length?b.players[s].units.findIndex(u=>u.hp>0):0});
 const old=b.players.map(p=>p.units.map(u=>u.hp));const log=[`第 ${b.round} 回合`];
 for(let s=0;s<2;s++){const a=chosen[s],u=b.players[s].units[a.unit];if(!u||u.hp<=0)continue;if(a.kind==='skill'){b.players[s].energy-=u.active.cost;b.players[s].skillCount=(b.players[s].skillCount||0)+1;}else if(a.kind==='attack')b.players[s].energy=Math.min(3,b.players[s].energy+1);if(a.kind==='skip')log.push(`${u.name} 跳過`);}
 for(let s=0;s<2;s++)if(chosen[s].kind==='guard'||chosen[s].kind==='skill'&&['heal','teamHeal','shield','buff','guard'].includes(b.players[s].units[chosen[s].unit]?.active?.kind))applySupport(b,s,chosen[s],log);
 for(let s=0;s<2;s++){const a=chosen[s],u=b.players[s].units[a.unit],x=u?.active;if(a.kind==='skill'&&x?.kind==='damage'){if(x.selfHeal)heal(u,x.selfHeal);if(x.selfShield)u.shield+=x.selfShield;if(x.teamHeal)for(const f of alive(b.players[s]))heal(f,x.teamHeal);}}
 const hits=[];for(let s=0;s<2;s++){const a=chosen[s],u=b.players[s].units[a.unit];if(!u||old[s][a.unit]<=0||!['attack','skill'].includes(a.kind))continue;
 if(a.kind==='skill'&&u.active.kind!=='damage')continue;const v=b.players[1-s].units[a.target];if(!v||old[1-s][a.target]<=0)continue;hits.push({s,u,v,d:damageAmount(b,s,u,v,a),kind:a.kind});}
 // Both attacks are calculated from pre-damage state, so a dying actor still acts.
 for(const h of hits){let d=h.d;const absorbed=Math.min(h.v.shield,d);h.v.shield-=absorbed;d-=absorbed;h.v.hp=Math.max(0,h.v.hp-d);h.v.hitOnce=true;if(h.kind==='skill')h.v.skillHitOnce=true;h.u.lastTarget=h.v.id;if(h.kind==='attack'){h.u.nextAttack=0;h.u.weaken=0;}if(h.u.passive?.kind==='attackStack'&&h.kind==='attack')h.u.bonus=Math.min(30,(h.u.bonus||0)+h.u.passive.value);if(h.v.passive?.kind==='hitStack')h.v.shield+=h.v.passive.value;if(h.v.passive?.kind==='thorns'&&d)h.u.hp=Math.max(0,h.u.hp-h.v.passive.value);log.push(`${h.u.name} 對 ${h.v.name} 造成 ${d} 傷害`);if(h.v.counter&&d){h.u.hp=Math.max(0,h.u.hp-h.v.counter);h.v.counter=0;}if(h.v.guard&&effectValue(b.players[h.v.side],'leaderCounter'))h.u.hp=Math.max(0,h.u.hp-effectValue(b.players[h.v.side],'leaderCounter'));if(h.kind==='skill'){if(h.u.passive?.kind==='skillBurn')h.v.burn={damage:h.u.passive.value,turns:2};if(h.u.active?.selfCost)h.u.hp=Math.max(0,h.u.hp-h.u.active.selfCost);if(h.u.active?.weaken)h.v.weaken=h.u.active.weaken;const splash=h.u.active?.splash||gearEffect(h.u,'splashBonus');if(splash)for(const foe of b.players[1-h.s].units)if(foe!==h.v&&foe.hp>0)foe.hp=Math.max(0,foe.hp-Math.round(splash*(1-gearEffect(foe,'splashReduce'))));}}
 for(const t of b.players)for(const u of alive(t)){if(u.burn?.turns){u.hp=Math.max(0,u.hp-u.burn.damage);u.burn.turns--;}if(u.hp>0&&u.hp/u.maxHp<.5&&!u.lowHealUsed&&gearEffect(u,'lowHpFirstHeal')){heal(u,gearEffect(u,'lowHpFirstHeal'));u.lowHealUsed=true;}}
 for(let iteration=0;iteration<10;iteration++){let changed=false;for(let s=0;s<2;s++){const t=b.players[s];for(const u of t.units){if(u.hp<=0&&!u.deathHandled){u.deathHandled=true;changed=true;log.push(`${u.name} 倒下`);if(u.passive?.kind==='deathTeamHeal')for(const ally of alive(t))heal(ally,u.passive.value);if(u.passive?.kind==='deathDamage'){const foe=alive(b.players[1-s])[0];if(foe)foe.hp=Math.max(0,foe.hp-u.passive.value);}if(u.passive?.kind==='deathMark'){const foe=alive(b.players[1-s])[0];if(foe)foe.mark=(foe.mark||0)+u.passive.value;}if(u.passive?.kind==='deathBuff')for(const ally of alive(t))ally.bonus=(ally.bonus||0)+u.passive.value;if(u.passive?.kind==='deathTeamShield')for(const ally of alive(t))ally.shield+=u.passive.value;}}}if(!changed)break;}
 for(const t of b.players)for(const u of alive(t)){if(u.passive?.kind==='regen')heal(u,u.passive.value);if(effectValue(t,'leaderLowShield')&&u.hp/u.maxHp<.3&&!u.lowShieldUsed){u.shield+=effectValue(t,'leaderLowShield');u.lowShieldUsed=true;}u.guard=0;}
 const counts=b.players.map(p=>alive(p).length);b.winner=counts[0]===0&&counts[1]===0?'draw':counts[0]===0?1:counts[1]===0?0:null;
 if(b.winner===null&&b.round===80)b.winner=counts[0]===counts[1]?'draw':counts[0]>counts[1]?0:1;
 b.logs=[...b.logs,...log].slice(-60);b.round++;b.phase=b.winner===null?'commit':'ended';b.deadline=now+TURN_MS;b.commitments={};b.reveals={};return b;
}
