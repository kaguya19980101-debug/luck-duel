// js/data.js

// ==========================================
// 屬性相剋表
// 火→草→水→火（循環）, 光⇄暗互剋
// 相剋傷害 ×1.3
// ==========================================
export const TYPE_CHART = {
    fire:  { strong: 'grass', weak: 'water' },
    grass: { strong: 'water', weak: 'fire'  },
    water: { strong: 'fire',  weak: 'grass' },
    light: { strong: 'dark',  weak: 'dark'  },
    dark:  { strong: 'light', weak: 'light' },
};
export const TYPE_MULTIPLIER = 1.3;

// ==========================================
// 技能觸發時機說明
// on_win_duel      猜拳勝後
// on_lose_duel     猜拳敗後
// on_attack        發動攻擊時
// on_defend        被攻擊時
// on_move          移動時
// on_death         死亡時
// on_turn_start    自己回合開始
// ==========================================

export const CHARACTERS = [

    // ════════════════════════════════
    // 🔥 火屬性  火→草  被水克
    // ════════════════════════════════
    {
        id: "0001", name: "ichi", attribute: "fire", rarity: "R",
        hp: 100, max_hp: 100, attack: 150, range: 1,
        img: "img/characters/0001.webp",
        passive: {
            name: "火花",
            trigger: "on_attack",
            effect: "chance_burn",
            chance: 0.10,
            value: 20,
            desc: "攻擊時 10% 機率對目標附加燒傷，每回合損失 20 HP（持續 2 回合）"
        }
    },
    {
        id: "0002", name: "ni", attribute: "fire", rarity: "R",
        hp: 110, max_hp: 110, attack: 150, range: 1,
        img: "img/characters/0002.webp",
        passive: {
            name: "助燃",
            trigger: "on_win_duel",
            effect: "chain_atk_boost",
            value: 15,
            desc: "本回合若已有友軍猜拳獲勝，自身傷害額外 +15"
        }
    },
    {
        id: "0003", name: "san", attribute: "fire", rarity: "R",
        hp: 120, max_hp: 120, attack: 150, range: 1,
        img: "img/characters/0003.webp",
        passive: {
            name: "餘燼",
            trigger: "on_death",
            effect: "death_splash",
            value: 40,
            desc: "死亡時對擊殺自己的敵人造成 40 點反傷"
        }
    },
    {
        id: "0004", name: "shi", attribute: "fire", rarity: "SR",
        hp: 150, max_hp: 150, attack: 170, range: 1,
        img: "img/characters/0004.webp",
        active: {
            name: "連環爆",
            trigger: "on_win_duel",
            effect: "chain_aoe",
            value: 50,
            bonus_per_adj: 15,
            desc: "對目標造成 50 傷害，每有1個相鄰敵人額外+15（最多+45）"
        },
        passive: {
            name: "炎盾",
            trigger: "on_defend",
            effect: "counter_burn",
            chance: 0.30,
            value: 25,
            desc: "被攻擊時 30% 機率令攻擊者附加燒傷，每回合損失 25 HP"
        }
    },
    {
        id: "0005", name: "go", attribute: "fire", rarity: "SSR",
        hp: 200, max_hp: 200, attack: 195, range: 1,
        img: "img/characters/0005.webp",
        active: {
            name: "烈焰風暴",
            trigger: "on_win_duel",
            effect: "aoe_type_bonus",
            value: 70,
            type_bonus_value: 100,
            type_bonus_target: "grass",
            desc: "對目標周圍4格造成 70 傷害；命中草屬性時改為 100"
        },
        passive: {
            name: "鳳凰之心",
            trigger: "on_death",
            effect: "death_aoe_pct",
            value: 0.40,
            desc: "死亡時爆炸，對周圍所有敵人造成「自身最大HP × 40%」傷害"
        },
        leader: {
            name: "烈火號令",
            effect: "team_atk_pct",
            value: 0.20,
            desc: "【隊長技】全隊 ATK +20%"
        }
    },

    // ════════════════════════════════
    // 🌿 草屬性  草→水  被火克
    // ════════════════════════════════
    {
        id: "0006", name: "roku", attribute: "grass", rarity: "R",
        hp: 120, max_hp: 120, attack: 150, range: 1,
        img: "img/characters/0006.webp",
        passive: {
            name: "萌芽",
            trigger: "on_turn_start",
            effect: "heal_self",
            value: 15,
            desc: "每回合開始回復 15 HP"
        }
    },
    {
        id: "0007", name: "nana", attribute: "grass", rarity: "R",
        hp: 130, max_hp: 130, attack: 150, range: 1,
        img: "img/characters/0007.webp",
        passive: {
            name: "韌性",
            trigger: "on_defend",
            effect: "stack_atk",
            value: 10,
            desc: "每次被攻擊後，下次自身攻擊 +10（可無限疊加）"
        }
    },
    {
        id: "0008", name: "hachi", attribute: "grass", rarity: "R",
        hp: 140, max_hp: 140, attack: 150, range: 1,
        img: "img/characters/0008.webp",
        passive: {
            name: "光合作用",
            trigger: "on_move",
            effect: "heal_self",
            value: 12,
            desc: "每次移動回復 12 HP"
        }
    },
    {
        id: "0009", name: "kyuu", attribute: "grass", rarity: "SR",
        hp: 170, max_hp: 170, attack: 160, range: 1,
        img: "img/characters/0009.webp",
        active: {
            name: "寄生藤",
            trigger: "on_win_duel",
            effect: "lifesteal_conditional",
            value: 30,
            low_hp_multiplier: 2,
            desc: "偷取目標 30 HP；若自身HP未滿，偷取量翻倍（偷取 60）"
        },
        passive: {
            name: "茁壯",
            trigger: "on_win_duel",
            effect: "stack_atk_permanent",
            value: 10,
            desc: "每贏一次決鬥，永久 ATK +10（可無限疊加）"
        }
    },
    {
        id: "0010", name: "jyuu", attribute: "grass", rarity: "SSR",
        hp: 240, max_hp: 240, attack: 165, range: 1,
        img: "img/characters/0010.webp",
        active: {
            name: "纏縛領域",
            trigger: "on_win_duel",
            effect: "aoe_immobilize",
            value: 60,
            duration: 1,
            desc: "造成 60 傷害，並使目標及相鄰敵人下回合無法移動"
        },
        passive: {
            name: "世界樹",
            trigger: "on_turn_start",
            effect: "team_heal_and_stack_atk",
            heal_value: 12,
            atk_stack: 8,
            desc: "全隊回復 12 HP；自身每存活1回合永久 ATK +8"
        },
        leader: {
            name: "大地脈動",
            effect: "team_heal_per_turn",
            value: 10,
            desc: "【隊長技】全隊每回合額外回復 +10 HP（疊加被動效果）"
        }
    },

    // ════════════════════════════════
    // 💧 水屬性  水→火  被草克
    // ════════════════════════════════
    {
        id: "0011", name: "jyuuichi", attribute: "water", rarity: "R",
        hp: 130, max_hp: 130, attack: 150, range: 1,
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
        hp: 140, max_hp: 140, attack: 150, range: 1,
        img: "img/characters/0012.webp",
        passive: {
            name: "緩流",
            trigger: "on_defend",
            effect: "damage_reduce_pct",
            value: 0.20,
            desc: "被攻擊時受到傷害減少 20%"
        }
    },
    {
        id: "0013", name: "jyuusan", attribute: "water", rarity: "R",
        hp: 150, max_hp: 150, attack: 150, range: 1,
        img: "img/characters/0013.webp",
        passive: {
            name: "淨化泡沫",
            trigger: "on_turn_start",
            effect: "cleanse_self",
            desc: "每回合開始自動清除自身燒傷、凍結、禁足狀態"
        }
    },
    {
        id: "0014", name: "jyuushi", attribute: "water", rarity: "SR",
        hp: 180, max_hp: 180, attack: 160, range: 1,
        img: "img/characters/0014.webp",
        active: {
            name: "漩渦吸取",
            trigger: "on_win_duel",
            effect: "lifesteal",
            value: 50,
            lifesteal_pct: 0.60,
            desc: "造成 50 傷害並回復等同傷害 60% 的 HP（回復 30）"
        },
        passive: {
            name: "潮汐守護",
            trigger: "on_defend",
            effect: "adj_shield",
            value: 20,
            desc: "被攻擊時替相鄰友軍各補 20 點護盾"
        }
    },
    {
        id: "0015", name: "jyuugo", attribute: "water", rarity: "SSR",
        hp: 250, max_hp: 250, attack: 165, range: 1,
        img: "img/characters/0015.webp",
        active: {
            name: "寒冰牢籠",
            trigger: "on_win_duel",
            effect: "freeze",
            value: 55,
            duration: 2,
            desc: "造成 55 傷害並凍結目標 2 回合（無法移動、無法發動主動技）"
        },
        passive: {
            name: "潮汐庇護",
            trigger: "on_turn_start",
            effect: "adj_heal_and_self_dr",
            heal_value: 25,
            dr_per_ally: 0.10,
            dr_cap: 0.50,
            desc: "替周圍友軍各補 25 HP；周圍每有1名友軍，自身減傷+10%（上限50%）"
        },
        leader: {
            name: "深海守護",
            effect: "team_hp_pct",
            value: 0.15,
            desc: "【隊長技】全隊最大 HP +15%（上場前計算）"
        }
    },

    // ════════════════════════════════
    // ✨ 光屬性  光→暗  被暗克
    // ════════════════════════════════
    {
        id: "0016", name: "hikari", attribute: "light", rarity: "R",
        hp: 120, max_hp: 120, attack: 150, range: 1,
        img: "img/characters/0016.webp",
        passive: {
            name: "微光",
            trigger: "on_turn_start",
            effect: "heal_self",
            value: 18,
            desc: "每回合開始回復 18 HP"
        }
    },
    {
        id: "0017", name: "taiyo", attribute: "light", rarity: "R",
        hp: 130, max_hp: 130, attack: 150, range: 1,
        img: "img/characters/0017.webp",
        passive: {
            name: "守護",
            trigger: "on_defend",
            effect: "share_damage_adj",
            value: 0.30,
            desc: "被攻擊時，替相鄰友軍分擔其受到傷害的 30%"
        }
    },
    {
        id: "0018", name: "sora", attribute: "light", rarity: "R",
        hp: 140, max_hp: 140, attack: 150, range: 1,
        img: "img/characters/0018.webp",
        passive: {
            name: "聖癒",
            trigger: "on_win_duel",
            effect: "heal_adj_ally",
            value: 20,
            desc: "猜拳獲勝後替相鄰友軍各回復 20 HP"
        }
    },
    {
        id: "0019", name: "ryu", attribute: "light", rarity: "SR",
        hp: 190, max_hp: 190, attack: 165, range: 1,
        img: "img/characters/0019.webp",
        active: {
            name: "聖裁",
            trigger: "on_win_duel",
            effect: "type_execute",
            value: 55,
            type_bonus_target: "dark",
            type_multiplier: 2.0,
            desc: "造成 55 傷害；目標為暗屬性時傷害翻倍（110）"
        },
        passive: {
            name: "光輝護盾",
            trigger: "on_turn_start",
            effect: "self_shield",
            value: 25,
            desc: "每回合開始替自身附加 25 點護盾（不疊加，重置）"
        }
    },
    {
        id: "0020", name: "kaguya", attribute: "light", rarity: "SSR",
        hp: 240, max_hp: 240, attack: 170, range: 1,
        img: "img/characters/0020.webp",
        active: {
            name: "神聖領域",
            trigger: "on_turn_start",
            effect: "team_shield_and_cleanse",
            value: 30,
            desc: "全隊補 30 點護盾並清除燒傷、凍結、禁足狀態"
        },
        passive: {
            name: "復活曙光",
            trigger: "on_death",
            effect: "revive_once",
            revive_hp_pct: 0.50,
            desc: "死亡時 50% 機率以 50% HP 原地復活（每場限一次）"
        },
        leader: {
            name: "神聖降臨",
            effect: "team_atk_vs_type",
            value: 0.30,
            target_type: "dark",
            desc: "【隊長技】全隊對暗屬性傷害 +30%"
        }
    },

    // ════════════════════════════════
    // 🟣 暗屬性  暗→光  被光克
    // ════════════════════════════════
    {
        id: "0021", name: "kage", attribute: "dark", rarity: "R",
        hp: 110, max_hp: 110, attack: 155, range: 1,
        img: "img/characters/0021.webp",
        passive: {
            name: "暗刺",
            trigger: "on_attack",
            effect: "execute_bonus",
            threshold_pct: 0.30,
            value: 25,
            desc: "目標 HP 低於 30% 時，造成傷害 +25"
        }
    },
    {
        id: "0022", name: "yami", attribute: "dark", rarity: "R",
        hp: 120, max_hp: 120, attack: 155, range: 1,
        img: "img/characters/0022.webp",
        passive: {
            name: "荊棘",
            trigger: "on_defend",
            effect: "thorns",
            value: 20,
            desc: "每次被攻擊，攻擊者反受 20 HP 傷害"
        }
    },
    {
        id: "0023", name: "oni", attribute: "dark", rarity: "R",
        hp: 130, max_hp: 130, attack: 160, range: 1,
        img: "img/characters/0023.webp",
        passive: {
            name: "嗜血",
            trigger: "on_attack",
            effect: "execute_scaling",
            max_bonus_pct: 0.50,
            desc: "目標 HP 越低傷害越高（最高 +50%，線性計算）"
        }
    },
    {
        id: "0024", name: "ankoku", attribute: "dark", rarity: "SR",
        hp: 170, max_hp: 170, attack: 175, range: 1,
        img: "img/characters/0024.webp",
        active: {
            name: "暗影處決",
            trigger: "on_win_duel",
            effect: "instant_kill_or_atk_steal",
            insta_kill_chance: 0.30,
            fallback_value: 60,
            atk_steal_pct: 0.20,
            desc: "30% 機率秒殺目標；失敗則造成 60 傷害並竊取目標 ATK 的 20% 加給自身"
        },
        passive: {
            name: "詛咒",
            trigger: "on_defend",
            effect: "curse_attacker",
            value: 25,
            desc: "被攻擊時，攻擊者也損失 25 HP（詛咒反傷）"
        }
    },
    {
        id: "0025", name: "akuma", attribute: "dark", rarity: "SSR",
        hp: 210, max_hp: 210, attack: 180, range: 1,
        img: "img/characters/0025.webp",
        active: {
            name: "獻祭契約",
            trigger: "on_win_duel",
            effect: "sacrifice_nuke",
            self_cost: 40,
            value: 130,
            on_kill_team_atk: 20,
            desc: "消耗自身 40 HP，對目標造成 130 傷害；若擊殺則全隊永久 ATK +20"
        },
        passive: {
            name: "亡靈契約",
            trigger: "on_death",
            effect: "death_team_atk_boost",
            value: 30,
            desc: "死亡時隨機讓一名友軍永久 ATK +30"
        },
        leader: {
            name: "獻血誓約",
            effect: "team_atk_pct_with_cost",
            atk_bonus: 0.10,
            hp_cost_per_turn: 5,
            desc: "【隊長技】全隊 ATK +10%，但每回合全隊各損失 5 HP"
        }
    }
];

// ==========================================
// 隊長技套用（在 game.js initGameBoard 時呼叫）
// 讀取隊伍第一格（index 0）的 leader 技能
// ==========================================
export function getLeaderSkill(team) {
    const captain = team?.[0];
    if (!captain || captain.rarity !== 'SSR' || !captain.leader) return null;
    return captain.leader;
}

// ==========================================
// 屬性相剋倍率計算
// ==========================================
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
