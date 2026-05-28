// js/data.js

export const TYPE_CHART = {
    fire:  { strong: 'grass', weak: 'water' },
    grass: { strong: 'water', weak: 'fire'  },
    water: { strong: 'fire',  weak: 'grass' },
    light: { strong: 'dark',  weak: 'dark'  },
    dark:  { strong: 'light', weak: 'light' },
};
export const TYPE_MULTIPLIER = 1.3;

export const TRIGGER_LABELS = {
    on_win_duel:   '猜拳勝後',
    on_lose_duel:  '猜拳敗後',
    on_attack:     '攻擊時',
    on_defend:     '被攻擊時',
    on_move:       '移動時',
    on_death:      '死亡時',
    on_turn_start: '回合開始',
};

export const CHARACTERS = [

    // 🔥 火屬性 — 爆發輸出
    {
        id: "0001", name: "ichi", attribute: "fire", rarity: "R",
        hp: 180, max_hp: 180, attack: 100, range: 1,
        img: "img/characters/0001.webp",
        passive: {
            name: "鬥志",
            trigger: "on_win_duel",
            effect: "extra_damage",
            value: 15,
            desc: "猜拳獲勝後對目標額外造成 15 點傷害"
        }
    },
    {
        id: "0002", name: "ni", attribute: "fire", rarity: "R",
        hp: 190, max_hp: 190, attack: 100, range: 1,
        img: "img/characters/0002.webp",
        passive: {
            name: "餘燼",
            trigger: "on_death",
            effect: "death_splash",
            value: 30,
            desc: "死亡時對擊殺自己的敵人造成 30 點傷害"
        }
    },
    {
        id: "0003", name: "san", attribute: "fire", rarity: "R",
        hp: 200, max_hp: 200, attack: 105, range: 1,
        img: "img/characters/0003.webp",
        passive: {
            name: "怒火",
            trigger: "on_defend",
            effect: "stack_atk",
            value: 8,
            desc: "每次被攻擊後，自身 ATK 永久 +8"
        }
    },
    {
        id: "0004", name: "shi", attribute: "fire", rarity: "SR",
        hp: 210, max_hp: 210, attack: 108, range: 1,
        img: "img/characters/0004.webp",
        active: {
            name: "爆炎斬",
            trigger: "on_win_duel",
            effect: "extra_damage",
            value: 40,
            desc: "猜拳獲勝後對目標額外造成 40 點傷害"
        },
        passive: {
            name: "戰意",
            trigger: "on_win_duel",
            effect: "stack_atk",
            value: 8,
            desc: "每次猜拳獲勝，自身 ATK 永久 +8"
        }
    },
    {
        id: "0005", name: "go", attribute: "fire", rarity: "SSR",
        hp: 230, max_hp: 230, attack: 115, range: 1,
        img: "img/characters/0005.webp",
        active: {
            name: "烈焰衝擊",
            trigger: "on_win_duel",
            effect: "extra_damage",
            value: 60,
            desc: "猜拳獲勝後對目標額外造成 60 點傷害"
        },
        passive: {
            name: "鳳凰之心",
            trigger: "on_death",
            effect: "death_splash",
            value: 60,
            desc: "死亡時對擊殺自己的敵人造成 60 點傷害"
        },
        leader: {
            name: "烈火號令",
            effect: "team_atk_pct",
            value: 0.15,
            desc: "【隊長技】全隊 ATK +15%"
        }
    },

    // 🌿 草屬性 — 成長持久
    {
        id: "0006", name: "roku", attribute: "grass", rarity: "R",
        hp: 200, max_hp: 200, attack: 100, range: 1,
        img: "img/characters/0006.webp",
        passive: {
            name: "萌芽",
            trigger: "on_turn_start",
            effect: "heal_self",
            value: 12,
            desc: "每回合開始回復 12 HP"
        }
    },
    {
        id: "0007", name: "nana", attribute: "grass", rarity: "R",
        hp: 190, max_hp: 190, attack: 100, range: 1,
        img: "img/characters/0007.webp",
        passive: {
            name: "光合作用",
            trigger: "on_move",
            effect: "heal_self",
            value: 12,
            desc: "每次移動回復 12 HP"
        }
    },
    {
        id: "0008", name: "hachi", attribute: "grass", rarity: "R",
        hp: 185, max_hp: 185, attack: 105, range: 1,
        img: "img/characters/0008.webp",
        passive: {
            name: "韌性",
            trigger: "on_defend",
            effect: "stack_atk",
            value: 8,
            desc: "每次被攻擊後，自身 ATK 永久 +8"
        }
    },
    {
        id: "0009", name: "kyuu", attribute: "grass", rarity: "SR",
        hp: 220, max_hp: 220, attack: 108, range: 1,
        img: "img/characters/0009.webp",
        active: {
            name: "寄生藤",
            trigger: "on_win_duel",
            effect: "lifesteal",
            value: 30,
            lifesteal_pct: 1.0,
            desc: "猜拳獲勝後吸取目標 30 HP 補給自己"
        },
        passive: {
            name: "茁壯",
            trigger: "on_win_duel",
            effect: "stack_atk",
            value: 8,
            desc: "每次猜拳獲勝，自身 ATK 永久 +8"
        }
    },
    {
        id: "0010", name: "jyuu", attribute: "grass", rarity: "SSR",
        hp: 250, max_hp: 250, attack: 112, range: 1,
        img: "img/characters/0010.webp",
        active: {
            name: "生命汲取",
            trigger: "on_win_duel",
            effect: "lifesteal",
            value: 50,
            lifesteal_pct: 1.0,
            desc: "猜拳獲勝後吸取目標 50 HP 補給自己"
        },
        passive: {
            name: "世界樹",
            trigger: "on_turn_start",
            effect: "heal_self",
            value: 20,
            desc: "每回合開始回復 20 HP"
        },
        leader: {
            name: "大地脈動",
            effect: "team_heal_per_turn",
            value: 10,
            desc: "【隊長技】全隊每回合額外回復 10 HP"
        }
    },

    // 💧 水屬性 — 防禦生存
    {
        id: "0011", name: "jyuuichi", attribute: "water", rarity: "R",
        hp: 210, max_hp: 210, attack: 100, range: 1,
        img: "img/characters/0011.webp",
        passive: {
            name: "水療",
            trigger: "on_move",
            effect: "heal_self",
            value: 12,
            desc: "每次移動回復 12 HP"
        }
    },
    {
        id: "0012", name: "jyuuni", attribute: "water", rarity: "R",
        hp: 205, max_hp: 205, attack: 100, range: 1,
        img: "img/characters/0012.webp",
        passive: {
            name: "緩流",
            trigger: "on_defend",
            effect: "damage_reduce_pct",
            value: 0.15,
            desc: "被攻擊時受到傷害減少 15%"
        }
    },
    {
        id: "0013", name: "jyuusan", attribute: "water", rarity: "R",
        hp: 195, max_hp: 195, attack: 100, range: 1,
        img: "img/characters/0013.webp",
        passive: {
            name: "回潮",
            trigger: "on_turn_start",
            effect: "heal_self",
            value: 12,
            desc: "每回合開始回復 12 HP"
        }
    },
    {
        id: "0014", name: "jyuushi", attribute: "water", rarity: "SR",
        hp: 230, max_hp: 230, attack: 105, range: 1,
        img: "img/characters/0014.webp",
        active: {
            name: "漩渦吸取",
            trigger: "on_win_duel",
            effect: "lifesteal",
            value: 30,
            lifesteal_pct: 1.0,
            desc: "猜拳獲勝後吸取目標 30 HP 補給自己"
        },
        passive: {
            name: "潮汐守護",
            trigger: "on_defend",
            effect: "damage_reduce_pct",
            value: 0.25,
            desc: "被攻擊時受到傷害減少 25%"
        }
    },
    {
        id: "0015", name: "jyuugo", attribute: "water", rarity: "SSR",
        hp: 260, max_hp: 260, attack: 108, range: 1,
        img: "img/characters/0015.webp",
        active: {
            name: "深海反擊",
            trigger: "on_lose_duel",
            effect: "thorns",
            value: 60,
            desc: "猜拳落敗時對攻擊者造成 60 點反傷"
        },
        passive: {
            name: "潮汐庇護",
            trigger: "on_defend",
            effect: "damage_reduce_pct",
            value: 0.30,
            desc: "被攻擊時受到傷害減少 30%"
        },
        leader: {
            name: "深海守護",
            effect: "team_dr_pct",
            value: 0.10,
            desc: "【隊長技】全隊受到傷害減少 10%"
        }
    },

    // ✨ 光屬性 — 均衡輔助
    {
        id: "0016", name: "hikari", attribute: "light", rarity: "R",
        hp: 185, max_hp: 185, attack: 100, range: 1,
        img: "img/characters/0016.webp",
        passive: {
            name: "微光",
            trigger: "on_turn_start",
            effect: "heal_self",
            value: 12,
            desc: "每回合開始回復 12 HP"
        }
    },
    {
        id: "0017", name: "taiyo", attribute: "light", rarity: "R",
        hp: 195, max_hp: 195, attack: 100, range: 1,
        img: "img/characters/0017.webp",
        passive: {
            name: "守護",
            trigger: "on_defend",
            effect: "damage_reduce_pct",
            value: 0.15,
            desc: "被攻擊時受到傷害減少 15%"
        }
    },
    {
        id: "0018", name: "sora", attribute: "light", rarity: "R",
        hp: 190, max_hp: 190, attack: 105, range: 1,
        img: "img/characters/0018.webp",
        passive: {
            name: "聖癒",
            trigger: "on_win_duel",
            effect: "heal_self",
            value: 20,
            desc: "猜拳獲勝後回復 20 HP"
        }
    },
    {
        id: "0019", name: "ryu", attribute: "light", rarity: "SR",
        hp: 215, max_hp: 215, attack: 110, range: 1,
        img: "img/characters/0019.webp",
        active: {
            name: "聖裁",
            trigger: "on_win_duel",
            effect: "extra_damage",
            value: 35,
            desc: "猜拳獲勝後對目標額外造成 35 點傷害"
        },
        passive: {
            name: "光輝回復",
            trigger: "on_turn_start",
            effect: "heal_self",
            value: 20,
            desc: "每回合開始回復 20 HP"
        }
    },
    {
        id: "0020", name: "kaguya", attribute: "light", rarity: "SSR",
        hp: 240, max_hp: 240, attack: 112, range: 1,
        img: "img/characters/0020.webp",
        active: {
            name: "神聖衝擊",
            trigger: "on_win_duel",
            effect: "extra_damage",
            value: 55,
            desc: "猜拳獲勝後對目標額外造成 55 點傷害"
        },
        passive: {
            name: "聖光庇護",
            trigger: "on_defend",
            effect: "damage_reduce_pct",
            value: 0.20,
            desc: "被攻擊時受到傷害減少 20%"
        },
        leader: {
            name: "神聖降臨",
            effect: "team_atk_pct",
            value: 0.12,
            desc: "【隊長技】全隊 ATK +12%"
        }
    },

    // 🟣 暗屬性 — 高風險爆發
    {
        id: "0021", name: "kage", attribute: "dark", rarity: "R",
        hp: 180, max_hp: 180, attack: 108, range: 1,
        img: "img/characters/0021.webp",
        passive: {
            name: "荊棘",
            trigger: "on_defend",
            effect: "thorns",
            value: 15,
            desc: "被攻擊時對攻擊者造成 15 點反傷"
        }
    },
    {
        id: "0022", name: "yami", attribute: "dark", rarity: "R",
        hp: 185, max_hp: 185, attack: 105, range: 1,
        img: "img/characters/0022.webp",
        passive: {
            name: "暗刺",
            trigger: "on_win_duel",
            effect: "extra_damage",
            value: 15,
            desc: "猜拳獲勝後對目標額外造成 15 點傷害"
        }
    },
    {
        id: "0023", name: "oni", attribute: "dark", rarity: "R",
        hp: 175, max_hp: 175, attack: 110, range: 1,
        img: "img/characters/0023.webp",
        passive: {
            name: "嗜血",
            trigger: "on_win_duel",
            effect: "stack_atk",
            value: 10,
            desc: "每次猜拳獲勝，自身 ATK 永久 +10"
        }
    },
    {
        id: "0024", name: "ankoku", attribute: "dark", rarity: "SR",
        hp: 205, max_hp: 205, attack: 115, range: 1,
        img: "img/characters/0024.webp",
        active: {
            name: "暗影一擊",
            trigger: "on_win_duel",
            effect: "extra_damage",
            value: 45,
            desc: "猜拳獲勝後對目標額外造成 45 點傷害"
        },
        passive: {
            name: "詛咒",
            trigger: "on_defend",
            effect: "thorns",
            value: 25,
            desc: "被攻擊時對攻擊者造成 25 點反傷"
        }
    },
    {
        id: "0025", name: "akuma", attribute: "dark", rarity: "SSR",
        hp: 215, max_hp: 215, attack: 118, range: 1,
        img: "img/characters/0025.webp",
        active: {
            name: "獻祭契約",
            trigger: "on_win_duel",
            effect: "sacrifice_extra_damage",
            self_cost: 30,
            value: 100,
            desc: "消耗自身 30 HP，對目標額外造成 100 點傷害"
        },
        passive: {
            name: "亡靈之力",
            trigger: "on_death",
            effect: "death_splash",
            value: 50,
            desc: "死亡時對擊殺自己的敵人造成 50 點傷害"
        },
        leader: {
            name: "獻血誓約",
            effect: "team_atk_pct",
            value: 0.15,
            desc: "【隊長技】全隊 ATK +15%（每回合全隊損失 5 HP）"
        }
    }
];

export function getLeaderSkill(team) {
    const captain = team?.[2];
    if (!captain || captain.rarity !== 'SSR' || !captain.leader) return null;
    return captain.leader;
}

export function getTypeMultiplier(attackerAttr, defenderAttr) {
    const chart = TYPE_CHART[attackerAttr];
    if (!chart) return 1;
    if (chart.strong === defenderAttr) return TYPE_MULTIPLIER;
    if (chart.weak   === defenderAttr) return 1 / TYPE_MULTIPLIER;
    return 1;
}

export function getRandomTeam(count) {
    const shuffled = [...CHARACTERS].sort(() => 0.5 - Math.random());
    return shuffled.slice(0, count);
}
