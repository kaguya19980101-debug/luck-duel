import { STARTER_IDS,COMPANION_BY_ID,GEAR_BY_ID,SKILL_BY_ID,POOLS,HERO_CLASSES,canEquip } from './catalog.js';
export const SHARDS={R:50,SR:150,SSR:500};
export const COST=100;
export const SLOT_KEYS=['weapon','armor','hat','hands','shoes'];
export function freshAccount(name='玩家'){
 return {name,coins:10000,shards:0,rating:1000,wins:0,losses:0,draws:0,hero:{class:'novice',branch:null,equipment:{},skills:{active:'starter_active',passive:'starter_passive',leader:'starter_leader'}},inventory:Object.fromEntries(STARTER_IDS.map(x=>[x,{count:1}])),items:{starter_active:1,starter_passive:1,starter_leader:1},team:[...STARTER_IDS],tutorialDone:false,claimedGames:{}};
}
export function normalizeAccount(raw,name){
 const a=raw?structuredClone(raw):freshAccount(name);a.name=a.name||name||'玩家';
 a.coins=Number(a.coins)||0;a.shards=Number(a.shards??a.soulShards)||0;a.rating=Number.isFinite(Number(a.rating))?Number(a.rating):1000;
 a.inventory=a.inventory||{};a.items=a.items||{};a.hero=a.hero||{class:'novice'};
 for(const [id,entry] of Object.entries(a.inventory)){const count=Number(entry?.count)||1;if(count>1&&COMPANION_BY_ID[id]){a.shards+=(count-1)*SHARDS[COMPANION_BY_ID[id].rarity];a.inventory[id]={count:1};}}
 delete a.soulShards;
 if(!HERO_CLASSES[a.hero.class])a.hero.class='novice';a.hero.equipment=a.hero.equipment||{};
 a.hero.skills=a.hero.skills||{};
 for(const slot of ['active','passive','leader']){const id='starter_'+slot;a.items[id]=1;if(!SKILL_BY_ID[a.hero.skills[slot]]||!a.items[a.hero.skills[slot]]||!canEquip(a.hero.class,SKILL_BY_ID[a.hero.skills[slot]]))a.hero.skills[slot]=id;}
 // Preserve an older five-card account; old captain becomes a normal companion.
 let team=Array.isArray(a.team)?a.team:[];team=team.map(x=>typeof x==='string'?x:x?.id).filter(x=>COMPANION_BY_ID[x]&&a.inventory[x]);
 for(const id of STARTER_IDS){if(!a.inventory[id])a.inventory[id]={count:1};if(!team.includes(id))team.push(id);}
 a.team=[...new Set(team)].slice(0,4);
 for(const slot of SLOT_KEYS){const id=a.hero.equipment[slot];if(id&&(!a.items[id]||!GEAR_BY_ID[id]||GEAR_BY_ID[id].slot!==slot||!canEquip(a.hero.class,GEAR_BY_ID[id])))delete a.hero.equipment[slot];}
 a.claimedGames=a.claimedGames||{};a.tutorialDone=!!a.tutorialDone;return a;
}
export function pickSummon(random=Math.random){
 const p=random();const rarity=p<.02?'SSR':p<.12?'SR':'R';
 const q=random();const type=q<.4?'card':q<.5?'weapon':q<.6?'armor':q<.7?'hat':q<.8?'hands':q<.9?'shoes':'skill';
 const eligible=POOLS[type].filter(x=>x.rarity===rarity);return {id:eligible[Math.floor(random()*eligible.length)].id,type,rarity};
}
export function rollSummons(count,random=Math.random){
 if(![1,10].includes(count))throw Error('僅支援單抽或十抽');
 const out=Array.from({length:count},()=>pickSummon(random));
 if(count===10&&!out.some(x=>x.rarity!=='R')){const i=Math.floor(random()*10);const same=POOLS[out[i].type].filter(x=>x.rarity==='SR');out[i]={id:same[Math.floor(random()*same.length)].id,type:out[i].type,rarity:'SR',guaranteed:true};}
 return out;
}
export function applySummons(account,draws){
 const a=normalizeAccount(account);if(a.coins<draws.length*COST)throw Error('遊戲幣不足');a.coins-=draws.length*COST;
 const results=[];
 for(const d of draws){const container=d.type==='card'?a.inventory:a.items;const exists=!!container[d.id];if(exists)a.shards+=SHARDS[d.rarity];else container[d.id]=d.type==='card'?{count:1}:1;results.push({...d,duplicate:exists,shards:exists?SHARDS[d.rarity]:0});}
 return {account:a,results};
}
export function equip(account,slot,id){const a=normalizeAccount(account);if(slot==='class'){if(!HERO_CLASSES[id]||id==='novice'||!a.tutorialDone)throw Error('尚未解鎖職業');a.hero.class=id;a.hero.branch=null;for(const key of SLOT_KEYS)if(a.hero.equipment[key]&&!canEquip(id,GEAR_BY_ID[a.hero.equipment[key]]))delete a.hero.equipment[key];for(const s of ['active','passive','leader'])if(!canEquip(id,SKILL_BY_ID[a.hero.skills[s]]))a.hero.skills[s]='starter_'+s;return a;}
 if(SLOT_KEYS.includes(slot)){if(id&&(!a.items[id]||GEAR_BY_ID[id]?.slot!==slot||!canEquip(a.hero.class,GEAR_BY_ID[id])))throw Error('不能裝備此物品');if(id)a.hero.equipment[slot]=id;else delete a.hero.equipment[slot];return a;}
 if(['active','passive','leader'].includes(slot)){if(!a.items[id]||SKILL_BY_ID[id]?.slot!==slot||!canEquip(a.hero.class,SKILL_BY_ID[id]))throw Error('技能不適用此職業');a.hero.skills[slot]=id;return a;}
 throw Error('未知欄位');}
export const BASIC_SHOP=Object.freeze({gear_sword_R:200,gear_mage_R:200,gear_archer_R:200,gear_healer_R:200,gear_armor_R:150,gear_hat_R:150,gear_hands_R:150,gear_shoes_R:150});
export function buyBasicGear(account,id){const a=normalizeAccount(account);const price=BASIC_SHOP[id];if(!price)throw Error('商品不存在');if(a.items[id])throw Error('已擁有這件裝備');if(a.shards<price)throw Error('靈魂碎片不足');a.shards-=price;a.items[id]=1;return a;}
