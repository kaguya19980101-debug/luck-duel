import { CHARACTERS } from './data.js';

export const STARTER_IDS = ['0001', '0006', '0012', '0016'];
export const SLOT_LABELS = { weapon: '武器', armor: '甲', hat: '帽', hands: '手', shoes: '鞋' };
export const CLASS_NAMES = { novice: '初心者', sword: '劍', mage: '法', archer: '弓', healer: '補' };
export const HERO_CLASSES = {
  novice: { hp: 205, attack: 100, weapon: null, branches: [] },
  sword: { hp: 230, attack: 105, weapon: 'sword', branches: ['守衛', '決鬥者'] },
  mage: { hp: 190, attack: 115, weapon: 'mage', branches: ['元素使', '秘術師'] },
  archer: { hp: 195, attack: 112, weapon: 'archer', branches: ['狙擊手', '遊俠'] },
  healer: { hp: 215, attack: 95, weapon: 'healer', branches: ['治療師', '聖護者'] },
};

// The existing art, names, attributes and rarity come from data.js. These stats
// and skills are the editable first-pass balance proposal from the workbook.
const hp = [190,200,185,205,215,205,195,200,210,220,210,215,200,220,230,190,200,185,205,215,180,185,175,195,205];
const attack = [105,100,108,110,115,100,100,105,108,112,100,100,102,105,108,100,100,105,110,112,108,110,112,115,118];
const act = [
 ['烈焰突刺',1,'damage',1.2],['焰盾',1,'guard',0.1],['燃魂',2,'damage',1.5],['爆炎斬',2,'damage',1.45],['獻祭衝擊',3,'damage',1.9],
 ['翠葉',1,'heal',25],['纏繞',1,'damage',0.9],['根刺',1,'damage',1.1],['寄生藤',2,'damage',1.2],['生命汲取',3,'damage',1.45],
 ['水療',1,'heal',30],['緩流',1,'guard',0.4],['潮汐守護',1,'shield',25],['漩渦吸取',2,'damage',1.2],['深海反擊',3,'guard',0.4],
 ['微光',1,'heal',25],['守護',1,'guard',0.4],['鼓舞',1,'buff',15],['聖裁',2,'damage',1.45],['神聖衝擊',3,'damage',1.7],
 ['荊棘守勢',1,'guard',0.4],['暗刺',1,'damage',1.25],['嗜血',2,'damage',1.4],['暗影一擊',2,'damage',1.6],['獻祭契約',3,'damage',1.9],
];
const pass = [
 ['鬥志','lowTargetBonus',12],['餘燼','deathDamage',30],['背水','lowHpAttack',0.2],['延燒','skillBurn',10],['鳳凰之心','deathDamage',60],
 ['萌芽','regen',6],['光合作用','guardHeal',10],['韌性','hitStack',3],['茁壯','attackStack',2],['落葉歸根','deathTeamHeal',30],
 ['清流','guardHeal',8],['水幕','reduce',0.1],['潮汐靈氣','auraReduce',0.03],['潮汐壁壘','reduce',0.15],['潮汐庇護','reduce',0.2],
 ['曙光','regen',6],['庇護','reduce',0.1],['光輝靈氣','auraAttack',0.03],['光輝回復','regen',10],['復仇聖印','deathMark',0.15],
 ['荊棘','thorns',10],['暗殺者','execute',20],['嗜血本能','attackStack',4],['亡靈獻祭','deathBuff',12],['孤軍','loneStand',0.2],
];

export const COMPANIONS = CHARACTERS.map((old,i) => {
  const [aName,cost,kind,value] = act[i];
  const [pName,pKind,pValue] = pass[i];
  const id=old.id;
  const extras={
    '0003':{selfCost:15},'0004':{splash:20},'0007':{weaken:0.1},'0008':{selfShield:10},
    '0009':{selfHeal:25},'0010':{teamHeal:12},'0014':{selfHeal:30},'0015':{counter:55},
    '0020':{teamHeal:10},'0021':{counter:20},'0023':{selfHeal:20},'0025':{selfCost:25}
  }[id]||{};
  return {id,name:old.name,attribute:old.attribute,rarity:old.rarity,hp:hp[i],attack:attack[i],img:old.img,
    active:{name:aName,cost,kind,value,...extras},passive:{name:pName,kind:pKind,value:pValue}};
});
export const COMPANION_BY_ID=Object.fromEntries(COMPANIONS.map(x=>[x.id,x]));

const gearSpecs=[
 ['sword','weapon','劍','長劍',0,[5,7,9],['','guardNextAttack','guardNextAttack'],[0,0.05,0.12]],
 ['mage','weapon','法','法杖',0,[5,7,9],['','skillDamage','splashBonus'],[0,0.05,10]],
 ['archer','weapon','弓','長弓',0,[5,7,9],['','lowTargetFlat','executeFlat'],[0,5,12]],
 ['healer','weapon','補','補杖',0,[5,7,9],['','healFlat','overhealShield'],[0,5,15]],
 ['armor','armor',null,'旅者甲',[18,24,30],0,['','guardBonus','firstHitReduce'],[0,0.05,0.15]],
 ['hat','hat',null,'旅者帽',[10,14,18],0,['','receivedHeal','lowHpFirstHeal'],[0,5,8]],
 ['hands','hands',null,'旅者手套',0,[3,4,5],['','attackFlat','highTargetFlat'],[0,3,8]],
 ['shoes','shoes',null,'旅者鞋',[8,11,14],0,['','splashReduce','firstSkillReduce'],[0,0.05,0.1]],
];
const rarity=['R','SR','SSR'];
export const GEAR=gearSpecs.flatMap(([code,slot,career,name,hps,atts,effects,values])=>rarity.map((r,i)=>({
  id:`gear_${code}_${r}`,type:'gear',slot,career:slot==='weapon'?code:null,rarity:r,name:`${name} ${r}`,
  hp:Array.isArray(hps)?hps[i]:hps,attack:Array.isArray(atts)?atts[i]:atts,
  effect:effects[i],value:values[i]
})));
export const GEAR_BY_ID=Object.fromEntries(GEAR.map(x=>[x.id,x]));

// kind is used by the shared battle engine. A main-character skill has one
// active, passive or leader slot. These are drawn independently of companions.
const skillRows=[
 ['starter_active','練習打擊','novice','active','R',1,'damage',1.1],
 ['starter_passive','初學堅韌','novice','passive','R',0,'flatHp',5],
 ['starter_leader','新手號令','novice','leader','R',0,'leaderHp',0.03],
 ['heavy_hit','重擊','all','active','SR',2,'damage',1.5],
 ['first_aid','救急','all','active','SR',2,'heal',30],
 ['tenacity','堅韌','all','passive','SR',0,'flatHp',10],
 ['alert','警戒','all','passive','SSR',0,'firstHitReduce',0.15],
 ['discipline','團隊紀律','all','leader','SR',0,'leaderAttack',0.04],
 ['desperate','絕境指揮','all','leader','SSR',0,'leaderOutnumbered',0.08],
 ['sword_strike','突斬','sword','active','R',1,'damage',1.2],
 ['sword_counter','護衛反擊','sword','active','SSR',3,'guard',0.4],
 ['sword_wall','鐵壁','sword','passive','SR',0,'guardBonus',0.08],
 ['sword_resolve','不屈','sword','passive','SSR',0,'deathTeamShield',20],
 ['sword_leader','堅守號令','sword','leader','SR',0,'leaderGuard',0.05],
 ['sword_legend','反擊號令','sword','leader','SSR',0,'leaderCounter',20],
 ['mage_fireball','火球','mage','active','R',1,'damage',1.2],
 ['mage_stars','雙星爆','mage','active','SSR',3,'damage',1.5],
 ['mage_focus','法力專注','mage','passive','SR',0,'skillDamage',0.05],
 ['mage_burst','元素爆發','mage','passive','SSR',0,'skillExecute',0.1],
 ['mage_leader','奧術號令','mage','leader','SR',0,'leaderSkill',0.04],
 ['mage_legend','星火號令','mage','leader','SSR',0,'leaderThirdSkill',0.1],
 ['archer_shot','精準射擊','archer','active','R',1,'damage',1.3],
 ['archer_pierce','穿心箭','archer','active','SSR',3,'damage',1.8],
 ['archer_hunt','狩獵','archer','passive','SR',0,'lowTargetPct',0.06],
 ['archer_focus','專注','archer','passive','SSR',0,'sameTargetPct',0.1],
 ['archer_leader','狩獵號令','archer','leader','SR',0,'leaderNormal',0.04],
 ['archer_legend','追擊號令','archer','leader','SSR',0,'leaderExecute',0.1],
 ['healer_heal','治癒術','healer','active','R',1,'heal',35],
 ['healer_prayer','群體祈願','healer','active','SSR',3,'teamHeal',25],
 ['healer_care','醫者','healer','passive','SR',0,'healPct',0.1],
 ['healer_bless','祝福','healer','passive','SSR',0,'firstHealShield',20],
 ['healer_leader','療癒號令','healer','leader','SR',0,'leaderHeal',0.05],
 ['healer_legend','守護號令','healer','leader','SSR',0,'leaderLowShield',10],
];
export const HERO_SKILLS=skillRows.map(([id,name,career,slot,rarity,cost,kind,value])=>({id,type:'skill',name,career,slot,rarity,cost,kind,value,
  ...(id==='sword_counter'?{counter:50}:{}),...(id==='mage_stars'?{splashPower:0.7}:{}),...(id==='archer_pierce'?{executePct:0.1}:{}),
  starter:id.startsWith('starter_')}));
export const SKILL_BY_ID=Object.fromEntries(HERO_SKILLS.map(x=>[x.id,x]));

export function canEquip(heroClass,item){
  if(!item)return false;
  if(item.type==='gear')return item.slot!=='weapon'||heroClass==='novice'||item.career===heroClass;
  return item.type==='skill'&&(item.career==='all'||item.career==='novice'||item.career===heroClass);
}
export function itemById(id){return COMPANION_BY_ID[id]||GEAR_BY_ID[id]||SKILL_BY_ID[id]||null;}
export const POOLS={card:COMPANIONS,weapon:GEAR.filter(g=>g.slot==='weapon'),armor:GEAR.filter(g=>g.slot==='armor'),hat:GEAR.filter(g=>g.slot==='hat'),hands:GEAR.filter(g=>g.slot==='hands'),shoes:GEAR.filter(g=>g.slot==='shoes'),skill:HERO_SKILLS.filter(s=>!s.starter)};
