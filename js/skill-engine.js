// js/skill-engine.js
// ==========================================
// 技能計算引擎
// 不負責任何 UI，只計算結果回傳 logs
// ==========================================

import { getTypeMultiplier } from './data.js';
import { gameState, CPU_UID } from './state.js';

// ==========================================
// Log 建立工具
// ==========================================
export function makeLog(type, text, extra = {}) {
    // type: 'info' | 'duel' | 'damage' | 'heal' | 'skill' | 'death' | 'turn'
    return { type, text, time: Date.now(), ...extra };
}

// ==========================================
// 主要計算：決鬥結算（含技能觸發）
// ==========================================
export function resolveDuelDamage({
    board,
    attackerIdx,
    defenderIdx,
    attackerChoice,
    defenderChoice,
    myUid,
}) {
    const logs = [];
    let newBoard = JSON.parse(JSON.stringify(board));

    const attacker = newBoard[attackerIdx];
    const defender = newBoard[defenderIdx];
    if (!attacker || !defender) return { newBoard, logs };

    // 1. 勝負判定
    const BEATS = { attack: 'magic', magic: 'trap', trap: 'attack' };
    let result = 'draw';
    let defenderHalved = false;

    if (attackerChoice === defenderChoice) {
        result = 'draw';
    } else if (attackerChoice === 'defend' && defenderChoice === 'defend') {
        result = 'draw';
    } else if (attackerChoice === 'defend') {
        result = 'def_win'; defenderHalved = true;
    } else if (defenderChoice === 'defend') {
        result = 'att_win'; defenderHalved = true;
    } else if (BEATS[attackerChoice] === defenderChoice) {
        result = 'att_win';
    } else {
        result = 'def_win';
    }

    // 2. 屬性相剋倍率
    const typeMulti = getTypeMultiplier(attacker.attribute, defender.attribute);
    if (typeMulti > 1) {
        logs.push(makeLog('info', `⚡ 屬性相剋！傷害 ×${typeMulti}`, { color: 'orange' }));
    } else if (typeMulti < 1) {
        logs.push(makeLog('info', `🛡 屬性劣勢，傷害 ×${typeMulti.toFixed(2)}`, { color: 'gray' }));
    }

    if (result === 'draw') {
        logs.push(makeLog('duel', '⚖️ 平手！雙方無傷害'));
        return { newBoard, logs, result: 'draw' };
    }

    // 3. 決定攻守方
    const [winner, loser, loserIdx, winnerIdx] = result === 'att_win'
        ? [attacker, defender, defenderIdx, attackerIdx]
        : [defender, attacker, attackerIdx, defenderIdx];

    // 4. 基礎傷害
    let baseDmg = Math.round(winner.attack * typeMulti);
    if (defenderHalved) baseDmg = Math.floor(baseDmg * 0.5);

    // 5. 被動：減傷（loser 的 passive）
    if (loser.passive?.effect === 'damage_reduce_pct') {
        const dr = loser.passive.value;
        const reduced = Math.round(baseDmg * dr);
        baseDmg = baseDmg - reduced;
        logs.push(makeLog('skill',
            `✨ 【${loser.passive.name}】${loser.name} 減傷 ${reduced}（-${Math.round(dr * 100)}%）`,
            { color: 'cyan' }
        ));
    }

    // 6. 扣血
    loser.hp -= baseDmg;
    logs.push(makeLog('damage',
        `💥 ${winner.name} 造成 ${baseDmg} 傷害 → ${loser.name} 剩 ${Math.max(0, loser.hp)} HP`,
        { color: 'red' }
    ));

    // 7. 被動：反傷（loser 的 passive）
    if (loser.passive?.effect === 'thorns') {
        const thorns = loser.passive.value;
        winner.hp -= thorns;
        logs.push(makeLog('skill',
            `🌵 【${loser.passive.name}】${loser.name} 反傷 ${thorns} 給 ${winner.name}（剩 ${Math.max(0, winner.hp)} HP）`,
            { color: 'orange' }
        ));
    }

    // 8. 主動技：追加傷害（winner 的 active）
    if (result === 'att_win' && attacker.active?.effect === 'extra_damage') {
        const extra = attacker.active.value;
        loser.hp -= extra;
        logs.push(makeLog('skill',
            `⚔️ 【${attacker.active.name}】額外造成 ${extra} 傷害 → ${loser.name} 剩 ${Math.max(0, loser.hp)} HP`,
            { color: 'yellow' }
        ));
    } else if (result === 'def_win' && defender.active?.effect === 'extra_damage') {
        const extra = defender.active.value;
        loser.hp -= extra;
        logs.push(makeLog('skill',
            `⚔️ 【${defender.active.name}】額外造成 ${extra} 傷害 → ${loser.name} 剩 ${Math.max(0, loser.hp)} HP`,
            { color: 'yellow' }
        ));
    }

    // 9. 主動技：吸血
    if (result === 'att_win' && attacker.active?.effect === 'lifesteal') {
        const steal = attacker.active.value;
        loser.hp  -= steal;
        const healed = Math.min(steal, attacker.max_hp - attacker.hp);
        attacker.hp = Math.min(attacker.max_hp, attacker.hp + steal);
        logs.push(makeLog('skill',
            `🩸 【${attacker.active.name}】吸取 ${steal} HP（${attacker.name} 回復 ${healed}）`,
            { color: 'green' }
        ));
    } else if (result === 'def_win' && defender.active?.effect === 'lifesteal') {
        const steal = defender.active.value;
        loser.hp  -= steal;
        const healed = Math.min(steal, defender.max_hp - defender.hp);
        defender.hp = Math.min(defender.max_hp, defender.hp + steal);
        logs.push(makeLog('skill',
            `🩸 【${defender.active.name}】吸取 ${steal} HP（${defender.name} 回復 ${healed}）`,
            { color: 'green' }
        ));
    }

    // 10. 主動技：猜拳敗反傷（loser 的 active on_lose_duel）
    if (loser.active?.effect === 'thorns' && loser.active?.trigger === 'on_lose_duel') {
        const val = loser.active.value;
        winner.hp -= val;
        logs.push(makeLog('skill',
            `💢 【${loser.active.name}】${loser.name} 落敗反傷 ${val} 給 ${winner.name}（剩 ${Math.max(0, winner.hp)} HP）`,
            { color: 'orange' }
        ));
    }

    // 11. 主動技：獻祭（winner 消耗自身HP換高傷害）
    if (result === 'att_win' && attacker.active?.effect === 'sacrifice_extra_damage') {
        const cost = attacker.active.self_cost;
        const extra = attacker.active.value;
        attacker.hp -= cost;
        loser.hp    -= extra;
        logs.push(makeLog('skill',
            `💀 【${attacker.active.name}】${attacker.name} 消耗 ${cost} HP，額外造成 ${extra} 傷害`,
            { color: 'purple' }
        ));
        logs.push(makeLog('damage',
            `→ ${loser.name} 剩 ${Math.max(0, loser.hp)} HP`,
            { color: 'red' }
        ));
    }

    // 12. 被動：ATK 疊加（winner 的 passive on_win_duel）
    if (winner.passive?.effect === 'stack_atk' && winner.passive?.trigger === 'on_win_duel') {
        winner.attack += winner.passive.value;
        logs.push(makeLog('skill',
            `📈 【${winner.passive.name}】${winner.name} ATK +${winner.passive.value}（現在 ${winner.attack}）`,
            { color: 'cyan' }
        ));
    }

    // 13. 被動：ATK 疊加（loser 的 passive on_defend）
    if (loser.passive?.effect === 'stack_atk' && loser.passive?.trigger === 'on_defend') {
        loser.attack += loser.passive.value;
        logs.push(makeLog('skill',
            `📈 【${loser.passive.name}】${loser.name} 被攻擊，ATK +${loser.passive.value}（現在 ${loser.attack}）`,
            { color: 'cyan' }
        ));
    }

    // 14. HP 下限為 0
    loser.hp   = Math.max(0, loser.hp);
    winner.hp  = Math.max(0, winner.hp);

    // 15. 死亡觸發：death_splash
    if (loser.hp <= 0 && loser.passive?.effect === 'death_splash') {
        const splash = loser.passive.value;
        winner.hp = Math.max(0, winner.hp - splash);
        logs.push(makeLog('skill',
            `💥 【${loser.passive.name}】${loser.name} 死亡爆炸！對 ${winner.name} 造成 ${splash} 傷害（剩 ${winner.hp} HP）`,
            { color: 'orange' }
        ));
    }

    // 16. 死亡：移除棋子
    if (loser.hp <= 0) {
        logs.push(makeLog('death', `💀 ${loser.name} 陣亡`, { color: 'red' }));
        newBoard[loserIdx] = null;
    }
    if (winner.hp <= 0) {
        logs.push(makeLog('death', `💀 ${winner.name} 因反傷陣亡`, { color: 'red' }));
        newBoard[winnerIdx] = null;
    }

    return { newBoard, logs, result, winnerIdx, loserIdx };
}

// ==========================================
// 回合開始：被動觸發（heal_self、stack_atk on_turn_start）
// ==========================================
export function resolveTurnStart({ board, myUid }) {
    const logs = [];
    const newBoard = JSON.parse(JSON.stringify(board));

    newBoard.forEach((cell, idx) => {
        if (!cell) return;
        const isMe = cell.owner === myUid;

        // 被動：回合開始回血
        if (cell.passive?.trigger === 'on_turn_start' && cell.passive?.effect === 'heal_self') {
            const val = cell.passive.value;
            const before = cell.hp;
            cell.hp = Math.min(cell.max_hp, cell.hp + val);
            const actual = cell.hp - before;
            if (actual > 0) {
                logs.push(makeLog('heal',
                    `💚 【${cell.passive.name}】${cell.name} 回復 ${actual} HP（${cell.hp}/${cell.max_hp}）`,
                    { color: 'green', owner: cell.owner }
                ));
            }
        }
    });

    return { newBoard, logs };
}

// ==========================================
// 移動後：被動觸發（heal_self on_move）
// ==========================================
export function resolveOnMove({ board, moverIdx, myUid }) {
    const logs = [];
    const newBoard = JSON.parse(JSON.stringify(board));
    const mover = newBoard[moverIdx];
    if (!mover) return { newBoard, logs };

    if (mover.passive?.trigger === 'on_move' && mover.passive?.effect === 'heal_self') {
        const val = mover.passive.value;
        const before = mover.hp;
        mover.hp = Math.min(mover.max_hp, mover.hp + val);
        const actual = mover.hp - before;
        if (actual > 0) {
            logs.push(makeLog('heal',
                `💚 【${mover.passive.name}】${mover.name} 移動回復 ${actual} HP（${mover.hp}/${mover.max_hp}）`,
                { color: 'green' }
            ));
        }
    }

    return { newBoard, logs };
}

// ==========================================
// 隊長技
// ==========================================

// 開局套用（立即生效型）— 修改棋盤數值
export function applyLeaderSkills({ board, myLeader, enemyLeader, myUid }) {
    const logs = [];
    const newBoard = JSON.parse(JSON.stringify(board));

    const apply = (leader, ownerUid) => {
        if (!leader) return;
        if (leader.effect === 'team_atk_pct') {
            const pct = leader.value;
            newBoard.forEach(cell => {
                if (!cell || cell.owner !== ownerUid) return;
                const base = cell.attack;
                cell.attack = Math.round(base * (1 + pct));
                cell._baseAtk = base; // 記住原始值（用於顏色標示）
            });
            logs.push(makeLog('skill', `👑 【${leader.name}】全隊 ATK +${Math.round(pct*100)}%`, { color: 'yellow' }));
        }
        // 其他「開局型」隊長技在這裡擴充
    };

    apply(myLeader, myUid);
    const enemyUid = newBoard.find(c => c && c.owner !== myUid)?.owner;
    if (enemyUid) apply(enemyLeader, enemyUid);

    return { newBoard, logs };
}

// 隊長技：回合開始觸發
export function resolveLeaderTurnStart({ board, leader, ownerUid }) {
    if (!leader) return { newBoard: board, logs: [] };
    const logs = [];
    const newBoard = JSON.parse(JSON.stringify(board));

    if (leader.effect === 'team_atk_stack_per_turn') {
        newBoard.forEach(cell => {
            if (!cell || cell.owner !== ownerUid) return;
            cell.attack += leader.value;
        });
        logs.push(makeLog('skill', `👑 【${leader.name}】全隊 ATK +${leader.value}`, { color: 'cyan' }));
    }

    return { newBoard, logs };
}

// 隊長技：猜拳勝後全隊回血
export function resolveLeaderOnWin({ board, leader, ownerUid }) {
    if (!leader || leader.effect !== 'team_heal_on_win') return { newBoard: board, logs: [] };
    const logs = [];
    const newBoard = JSON.parse(JSON.stringify(board));

    newBoard.forEach(cell => {
        if (!cell || cell.owner !== ownerUid) return;
        const before = cell.hp;
        cell.hp = Math.min(cell.max_hp, cell.hp + leader.value);
        const actual = cell.hp - before;
        if (actual > 0) {
            logs.push(makeLog('heal', `👑 【${leader.name}】${cell.name} +${actual} HP`, { color: 'green' }));
        }
    });

    return { newBoard, logs };
}

// 隊長技：移動後全隊回血
export function resolveLeaderOnMove({ board, leader, ownerUid }) {
    if (!leader || leader.effect !== 'team_heal_on_move') return { newBoard: board, logs: [] };
    const logs = [];
    const newBoard = JSON.parse(JSON.stringify(board));

    newBoard.forEach(cell => {
        if (!cell || cell.owner !== ownerUid) return;
        const before = cell.hp;
        cell.hp = Math.min(cell.max_hp, cell.hp + leader.value);
        const actual = cell.hp - before;
        if (actual > 0) {
            logs.push(makeLog('heal', `👑 【${leader.name}】${cell.name} +${actual} HP`, { color: 'green' }));
        }
    });

    return { newBoard, logs };
}

// 隊長技：死亡時對隨機敵人造成傷害
export function resolveLeaderOnDeath({ board, leader, ownerUid, deadIdx }) {
    if (!leader || leader.effect !== 'team_death_random_damage') return { newBoard: board, logs: [] };
    const logs = [];
    const newBoard = JSON.parse(JSON.stringify(board));

    // 找敵方活著的棋子
    const enemies = newBoard.map((c, i) => ({ c, i })).filter(x => x.c && x.c.owner !== ownerUid);
    if (enemies.length === 0) return { newBoard, logs };

    const target = enemies[Math.floor(Math.random() * enemies.length)];
    target.c.hp -= leader.value;
    logs.push(makeLog('skill',
        `👑 【${leader.name}】對 ${target.c.name} 造成 ${leader.value} 傷害（剩 ${Math.max(0, target.c.hp)} HP）`,
        { color: 'orange' }
    ));

    if (target.c.hp <= 0) {
        logs.push(makeLog('death', `💀 ${target.c.name} 因隊長技陣亡`, { color: 'red' }));
        newBoard[target.i] = null;
    }

    return { newBoard, logs };
}
