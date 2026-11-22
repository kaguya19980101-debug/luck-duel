// js/skill-engine.js
// ==========================================
// 技能計算引擎 — 不負責 UI，回傳 { newBoard, logs }
// ==========================================

import { getTypeMultiplier, getAdjacentIndices } from './data.js';
import { gameState, CPU_UID } from './state.js';

// ==========================================
// Log 工具
// ==========================================
export function makeLog(type, text, extra = {}) {
    return { type, text, time: Date.now(), ...extra };
}

// ==========================================
// 主要：決鬥結算
// ==========================================
export function resolveDuelDamage({ board, attackerIdx, defenderIdx, attackerChoice, defenderChoice, myUid }) {
    const logs = [];
    let newBoard = JSON.parse(JSON.stringify(board));

    const attacker = newBoard[attackerIdx];
    const defender = newBoard[defenderIdx];
    if (!attacker || !defender) return { newBoard, logs };

    // ── 1. 勝負判定 ──
    const BEATS = { attack: 'magic', magic: 'trap', trap: 'attack' };
    let result = 'draw', defenderHalved = false;
    if (attackerChoice === defenderChoice) result = 'draw';
    else if (attackerChoice === 'defend' && defenderChoice === 'defend') result = 'draw';
    else if (attackerChoice === 'defend') { result = 'def_win'; defenderHalved = true; }
    else if (defenderChoice === 'defend') { result = 'att_win'; defenderHalved = true; }
    else if (BEATS[attackerChoice] === defenderChoice) result = 'att_win';
    else result = 'def_win';

    // ── 2. 屬性倍率 ──
    const typeMulti = getTypeMultiplier(attacker.attribute, defender.attribute);
    if (typeMulti > 1)      logs.push(makeLog('info', `⚡ 屬性相剋！傷害 ×${typeMulti}`, { color: 'orange' }));
    else if (typeMulti < 1) logs.push(makeLog('info', `🛡 屬性劣勢，傷害 ×${typeMulti.toFixed(2)}`, { color: 'gray' }));

    if (result === 'draw') {
        logs.push(makeLog('duel', '⚖️ 平手！雙方無傷害'));
        return { newBoard, logs, result: 'draw' };
    }

    // ── 3. 攻守方 ──
    const [winner, loser, loserIdx, winnerIdx] = result === 'att_win'
        ? [attacker, defender, defenderIdx, attackerIdx]
        : [defender, attacker, attackerIdx, defenderIdx];

    // ── 4. 基礎 ATK（含常駐 buff 計算）──
    let effectiveAtk = winner.attack;

    // 背水（low_hp_atk_boost）：HP < threshold 時加攻
    if (winner.passive?.effect === 'low_hp_atk_boost') {
        const threshold = winner.passive.threshold || 0.30;
        if (winner.hp / winner.max_hp < threshold) {
            const boost = Math.round(effectiveAtk * winner.passive.value);
            effectiveAtk += boost;
            logs.push(makeLog('skill', `🔥 【${winner.passive.name}】${winner.name} 背水一戰！ATK +${boost}`, { color: 'orange' }));
        }
    }

    // 孤軍（last_stand）：場上只剩自己時加攻
    if (winner.passive?.effect === 'last_stand') {
        const allyCount = newBoard.filter(c => c && c.owner === winner.owner && c !== winner).length;
        if (allyCount === 0) {
            const boost = Math.round(effectiveAtk * winner.passive.atk_boost);
            effectiveAtk += boost;
            logs.push(makeLog('skill', `👤 【${winner.passive.name}】${winner.name} 孤軍奮戰！ATK +${boost}`, { color: 'purple' }));
        }
    }

    // 復仇標記（revenge_mark）：被標記的敵人受到額外傷害
    if (loser._revengeMarked) {
        const bonus = Math.round(effectiveAtk * loser._revengeMarked);
        effectiveAtk += bonus;
        logs.push(makeLog('skill', `🎯 復仇標記生效！對 ${loser.name} 額外 +${bonus} 傷害`, { color: 'yellow' }));
    }

    // 暗刺（execute_bonus）：目標低血量時追加傷害
    if (winner.passive?.effect === 'execute_bonus') {
        const threshold = winner.passive.threshold || 0.30;
        if (loser.hp / loser.max_hp < threshold) {
            logs.push(makeLog('skill', `🗡️ 【${winner.passive.name}】${winner.name} 暗刺！目標殘血，追加 +${winner.passive.value}`, { color: 'red' }));
            effectiveAtk += winner.passive.value;
        }
    }

    // ── 5. 基礎傷害 ──
    let baseDmg = Math.round(effectiveAtk * typeMulti);
    if (defenderHalved) baseDmg = Math.floor(baseDmg * 0.5);

    // ── 6. 減傷（loser 被動）──
    let totalDR = 0;
    if (loser.passive?.effect === 'damage_reduce_pct') {
        totalDR += loser.passive.value;
        logs.push(makeLog('skill', `✨ 【${loser.passive.name}】${loser.name} 減傷 ${Math.round(loser.passive.value * 100)}%`, { color: 'cyan' }));
    }

    // 孤軍減傷
    if (loser.passive?.effect === 'last_stand') {
        const allyCount = newBoard.filter(c => c && c.owner === loser.owner && c !== loser).length;
        if (allyCount === 0) {
            totalDR += loser.passive.dr;
            logs.push(makeLog('skill', `👤 【${loser.passive.name}】${loser.name} 孤軍減傷 ${Math.round(loser.passive.dr * 100)}%`, { color: 'purple' }));
        }
    }

    // 相鄰友軍潮汐守護（adjacent_ally_dr）
    const adjIndices = getAdjacentIndices(loserIdx);
    adjIndices.forEach(ai => {
        const ally = newBoard[ai];
        if (ally && ally.owner === loser.owner && ally.passive?.effect === 'adjacent_ally_dr') {
            totalDR += ally.passive.value;
            logs.push(makeLog('skill', `🌊 【${ally.passive.name}】${ally.name} 守護相鄰友軍，減傷 ${Math.round(ally.passive.value * 100)}%`, { color: 'cyan' }));
        }
    });

    if (totalDR > 0) {
        const reduced = Math.round(baseDmg * Math.min(totalDR, 0.70)); // 減傷上限 70%
        baseDmg -= reduced;
    }

    // ── 7. 扣血 ──
    loser.hp -= baseDmg;
    logs.push(makeLog('damage', `💥 ${winner.name} 造成 ${baseDmg} 傷害 → ${loser.name} 剩 ${Math.max(0, loser.hp)} HP`, { color: 'red' }));

    // 記錄本次傷害（給延燒用）
    const mainDamage = baseDmg;

    // ── 8. 反傷（loser 被動）──
    if (loser.passive?.effect === 'thorns' && loser.passive?.trigger === 'on_defend') {
        const thorns = loser.passive.value;
        winner.hp -= thorns;
        logs.push(makeLog('skill', `🌵 【${loser.passive.name}】${loser.name} 反傷 ${thorns} → ${winner.name} 剩 ${Math.max(0, winner.hp)} HP`, { color: 'orange' }));
    }

    // ── 9. 主動技：追加傷害 ──
    const winnerActive = winner.active;
    if (winnerActive?.effect === 'extra_damage' && winnerActive?.trigger === 'on_win_duel') {
        loser.hp -= winnerActive.value;
        logs.push(makeLog('skill', `⚔️ 【${winnerActive.name}】追加 ${winnerActive.value} 傷害 → ${loser.name} 剩 ${Math.max(0, loser.hp)} HP`, { color: 'yellow' }));
    }

    // ── 10. 主動技：吸血 ──
    if (winnerActive?.effect === 'lifesteal' && winnerActive?.trigger === 'on_win_duel') {
        const steal = winnerActive.value;
        loser.hp -= steal;
        const healed = Math.min(steal, winner.max_hp - winner.hp);
        winner.hp = Math.min(winner.max_hp, winner.hp + steal);
        logs.push(makeLog('skill', `🩸 【${winnerActive.name}】吸取 ${steal} HP（${winner.name} 回復 ${healed}）`, { color: 'green' }));
    }

    // ── 11. 主動技：猜拳敗反傷 ──
    if (loser.active?.effect === 'thorns' && loser.active?.trigger === 'on_lose_duel') {
        const val = loser.active.value;
        winner.hp -= val;
        logs.push(makeLog('skill', `💢 【${loser.active.name}】${loser.name} 反傷 ${val} → ${winner.name} 剩 ${Math.max(0, winner.hp)} HP`, { color: 'orange' }));
    }

    // ── 12. 主動技：獻祭 ──
    if (winnerActive?.effect === 'sacrifice_extra_damage' && winnerActive?.trigger === 'on_win_duel') {
        winner.hp -= winnerActive.self_cost;
        loser.hp -= winnerActive.value;
        logs.push(makeLog('skill', `💀 【${winnerActive.name}】${winner.name} 消耗 ${winnerActive.self_cost} HP，追加 ${winnerActive.value} 傷害`, { color: 'purple' }));
    }

    // ── 13. 被動：猜拳勝追加傷害 ──
    if (winner.passive?.effect === 'extra_damage' && winner.passive?.trigger === 'on_win_duel') {
        loser.hp -= winner.passive.value;
        logs.push(makeLog('skill', `🔥 【${winner.passive.name}】追加 ${winner.passive.value} 傷害 → ${loser.name} 剩 ${Math.max(0, loser.hp)} HP`, { color: 'yellow' }));
    }

    // ── 14. 被動：ATK 疊加（勝方 on_win_duel）──
    if (winner.passive?.effect === 'stack_atk' && winner.passive?.trigger === 'on_win_duel') {
        winner.attack += winner.passive.value;
        logs.push(makeLog('skill', `📈 【${winner.passive.name}】${winner.name} ATK +${winner.passive.value}（現在 ${winner.attack}）`, { color: 'cyan' }));
    }

    // ── 15. 被動：ATK 疊加（敗方 on_defend）──
    if (loser.passive?.effect === 'stack_atk' && loser.passive?.trigger === 'on_defend') {
        loser.attack += loser.passive.value;
        logs.push(makeLog('skill', `📈 【${loser.passive.name}】${loser.name} 被攻擊，ATK +${loser.passive.value}（現在 ${loser.attack}）`, { color: 'cyan' }));
    }

    // ── 16. 被動：延燒（splash_damage）──
    if (winner.passive?.effect === 'splash_damage' && winner.passive?.trigger === 'on_win_duel') {
        const splashDmg = Math.round(mainDamage * winner.passive.value);
        const adjTargets = getAdjacentIndices(loserIdx);
        adjTargets.forEach(ai => {
            const adj = newBoard[ai];
            if (adj && adj.owner !== winner.owner) {
                adj.hp -= splashDmg;
                logs.push(makeLog('skill', `🔥 【${winner.passive.name}】延燒！${adj.name} 受到 ${splashDmg} 濺射傷害（剩 ${Math.max(0, adj.hp)} HP）`, { color: 'orange' }));
                if (adj.hp <= 0) {
                    logs.push(makeLog('death', `💀 ${adj.name} 因延燒陣亡`, { color: 'red' }));
                    newBoard[ai] = null;
                }
            }
        });
    }

    // ── 17. HP 下限 ──
    loser.hp  = Math.max(0, loser.hp);
    winner.hp = Math.max(0, winner.hp);

    // ── 18. 死亡觸發 ──
    if (loser.hp <= 0) {
        // 死亡反傷
        if (loser.passive?.effect === 'death_splash') {
            const splash = loser.passive.value;
            winner.hp = Math.max(0, winner.hp - splash);
            logs.push(makeLog('skill', `💥 【${loser.passive.name}】${loser.name} 死亡爆炸！對 ${winner.name} 造成 ${splash}（剩 ${winner.hp} HP）`, { color: 'orange' }));
        }
        // 死亡全隊回血
        if (loser.passive?.effect === 'death_team_heal') {
            newBoard.forEach(c => {
                if (!c || c.owner !== loser.owner) return;
                const before = c.hp;
                c.hp = Math.min(c.max_hp, c.hp + loser.passive.value);
                if (c.hp > before) logs.push(makeLog('heal', `🌿 【${loser.passive.name}】${c.name} +${c.hp - before} HP`, { color: 'green' }));
            });
        }
        // 死亡給友軍加攻
        if (loser.passive?.effect === 'death_team_atk') {
            const allies = newBoard.filter(c => c && c.owner === loser.owner && c !== loser);
            if (allies.length > 0) {
                const target = allies[Math.floor(Math.random() * allies.length)];
                target.attack += loser.passive.value;
                logs.push(makeLog('skill', `👻 【${loser.passive.name}】${target.name} 繼承意志，ATK +${loser.passive.value}（現在 ${target.attack}）`, { color: 'purple' }));
            }
        }
        // 復仇標記
        if (loser.passive?.effect === 'revenge_mark') {
            winner._revengeMarked = loser.passive.value;
            logs.push(makeLog('skill', `🎯 【${loser.passive.name}】${winner.name} 被標記！全隊對其傷害 +${Math.round(loser.passive.value * 100)}%`, { color: 'yellow' }));
        }

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
// 回合開始：被動觸發
// ==========================================
export function resolveTurnStart({ board, myUid }) {
    const logs = [];
    const newBoard = JSON.parse(JSON.stringify(board));

    // 清除上回合的臨時 buff
    newBoard.forEach(cell => {
        if (!cell) return;
        if (cell._tempAtkBuff) {
            cell.attack -= cell._tempAtkBuff;
            cell._tempAtkBuff = 0;
        }
    });

    newBoard.forEach((cell, idx) => {
        if (!cell) return;

        // 回合開始回血
        if (cell.passive?.trigger === 'on_turn_start' && cell.passive?.effect === 'heal_self') {
            const before = cell.hp;
            cell.hp = Math.min(cell.max_hp, cell.hp + cell.passive.value);
            const actual = cell.hp - before;
            if (actual > 0) logs.push(makeLog('heal', `💚 【${cell.passive.name}】${cell.name} +${actual} HP（${cell.hp}/${cell.max_hp}）`, { color: 'green', owner: cell.owner }));
        }

        // 鼓舞（adjacent_buff）：相鄰友軍 ATK +N（僅當回合）
        if (cell.passive?.trigger === 'on_turn_start' && cell.passive?.effect === 'adjacent_buff') {
            const adjIndices = getAdjacentIndices(idx);
            adjIndices.forEach(ai => {
                const ally = newBoard[ai];
                if (ally && ally.owner === cell.owner && ally !== cell) {
                    const buff = cell.passive.value;
                    ally.attack += buff;
                    ally._tempAtkBuff = (ally._tempAtkBuff || 0) + buff;
                    logs.push(makeLog('skill', `📣 【${cell.passive.name}】${cell.name} 鼓舞 ${ally.name}，ATK +${buff}（本回合）`, { color: 'cyan' }));
                }
            });
        }
    });

    return { newBoard, logs };
}

// ==========================================
// 移動後：被動觸發
// ==========================================
export function resolveOnMove({ board, moverIdx, myUid }) {
    const logs = [];
    const newBoard = JSON.parse(JSON.stringify(board));
    const mover = newBoard[moverIdx];
    if (!mover) return { newBoard, logs };

    if (mover.passive?.trigger === 'on_move' && mover.passive?.effect === 'heal_self') {
        const before = mover.hp;
        mover.hp = Math.min(mover.max_hp, mover.hp + mover.passive.value);
        const actual = mover.hp - before;
        if (actual > 0) logs.push(makeLog('heal', `💚 【${mover.passive.name}】${mover.name} 移動回復 ${actual} HP`, { color: 'green' }));
    }

    return { newBoard, logs };
}

// ==========================================
// 隊長技
// ==========================================

// 開局套用（立即生效型）
export function applyLeaderSkills({ board, myLeader, enemyLeader, myUid }) {
    const logs = [];
    const newBoard = JSON.parse(JSON.stringify(board));
    const apply = (leader, ownerUid) => {
        if (!leader) return;
        if (leader.effect === 'team_atk_pct') {
            const pct = leader.value;
            newBoard.forEach(cell => {
                if (!cell || cell.owner !== ownerUid) return;
                cell._baseAtk = cell.attack;
                cell.attack = Math.round(cell.attack * (1 + pct));
            });
            logs.push(makeLog('skill', `👑 【${leader.name}】全隊 ATK +${Math.round(pct * 100)}%`, { color: 'yellow' }));
        }
    };
    apply(myLeader, myUid);
    const enemyUid = newBoard.find(c => c && c.owner !== myUid)?.owner;
    if (enemyUid) apply(enemyLeader, enemyUid);
    return { newBoard, logs };
}

// 回合開始
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

// 猜拳勝後
export function resolveLeaderOnWin({ board, leader, ownerUid }) {
    if (!leader || leader.effect !== 'team_heal_on_win') return { newBoard: board, logs: [] };
    const logs = [];
    const newBoard = JSON.parse(JSON.stringify(board));
    newBoard.forEach(cell => {
        if (!cell || cell.owner !== ownerUid) return;
        const before = cell.hp;
        cell.hp = Math.min(cell.max_hp, cell.hp + leader.value);
        if (cell.hp > before) logs.push(makeLog('heal', `👑 【${leader.name}】${cell.name} +${cell.hp - before} HP`, { color: 'green' }));
    });
    return { newBoard, logs };
}

// 移動後
export function resolveLeaderOnMove({ board, leader, ownerUid }) {
    if (!leader || leader.effect !== 'team_heal_on_move') return { newBoard: board, logs: [] };
    const logs = [];
    const newBoard = JSON.parse(JSON.stringify(board));
    newBoard.forEach(cell => {
        if (!cell || cell.owner !== ownerUid) return;
        const before = cell.hp;
        cell.hp = Math.min(cell.max_hp, cell.hp + leader.value);
        if (cell.hp > before) logs.push(makeLog('heal', `👑 【${leader.name}】${cell.name} +${cell.hp - before} HP`, { color: 'green' }));
    });
    return { newBoard, logs };
}

// 死亡時
export function resolveLeaderOnDeath({ board, leader, ownerUid, deadIdx }) {
    if (!leader || leader.effect !== 'team_death_random_damage') return { newBoard: board, logs: [] };
    const logs = [];
    const newBoard = JSON.parse(JSON.stringify(board));
    const enemies = newBoard.map((c, i) => ({ c, i })).filter(x => x.c && x.c.owner !== ownerUid);
    if (enemies.length === 0) return { newBoard, logs };
    const target = enemies[Math.floor(Math.random() * enemies.length)];
    target.c.hp -= leader.value;
    logs.push(makeLog('skill', `👑 【${leader.name}】對 ${target.c.name} 造成 ${leader.value} 傷害（剩 ${Math.max(0, target.c.hp)} HP）`, { color: 'orange' }));
    if (target.c.hp <= 0) {
        logs.push(makeLog('death', `💀 ${target.c.name} 因隊長技陣亡`, { color: 'red' }));
        newBoard[target.i] = null;
    }
    return { newBoard, logs };
}
