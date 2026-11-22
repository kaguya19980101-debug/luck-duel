// js/cpu.js
// ==========================================
// 電腦對戰模式 — 所有 CPU 邏輯集中在此
// ==========================================

import { auth } from './firebase-config.js';
import { ref, get, update } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js';
import { db } from './firebase-config.js';
import { gameState, CPU_UID, getBattleAttr } from './state.js';
import { buildGameUI, renderBoard, updateTimer, setBoardCallbacks, closeCardInfo, showDuelAnimation } from './board.js';
import { revealDuelChoices } from './game.js';
import { resolveDuelDamage, resolveTurnStart, resolveOnMove, makeLog, applyLeaderSkills, resolveLeaderTurnStart, resolveLeaderOnWin, resolveLeaderOnMove, resolveLeaderOnDeath } from './skill-engine.js';
import { addBattleLog, addTurnHeader, buildBattleLogPanel, showFloatingText, clearBattleLog } from './board.js';

// ── 決鬥選項 ──
const CHOICES = ['attack', 'magic', 'trap', 'defend'];
const BEATS   = { attack: 'magic', magic: 'trap', trap: 'attack' };


// 隊長技記錄
let _myLeader = null;
let _enemyLeader = null;

// ==========================================
// 初始化電腦對戰
// ==========================================
export function initCpuGame(myTeam) {
    gameState.resetAll();
    gameState.isCpuMode = true;
    gameState.myUid     = auth.currentUser.uid;
    gameState.role      = 'cpu';

    const cpuTeam = Array.from({ length: 5 }, (_, i) => ({
        id: `cpu_${i}`, name: `CPU ${i + 1}`,
        attribute: 'dark', rarity: 'R',
        hp: 100, max_hp: 100, attack: 50, range: 1,
        img: null, isCpu: true,
        owner: CPU_UID, team: 'red'
    }));

    let board = new Array(30).fill(null);
    cpuTeam.forEach((c, i) => { board[i] = c; });
    myTeam.forEach((c, i) => {
        if (c) board[25 + i] = { ...c, owner: gameState.myUid, team: 'blue' };
    });

    // 找隊長（index 2）
    const myCaptain  = board[27]; // 玩家隊伍 index 2 = board[25+2]
    const cpuCaptain = board[2];  // CPU 隊伍 index 2
    _myLeader    = (myCaptain?.rarity === 'SSR' && myCaptain?.leader) ? myCaptain.leader : null;
    _enemyLeader = (cpuCaptain?.rarity === 'SSR' && cpuCaptain?.leader) ? cpuCaptain.leader : null;

    // 開局套用隊長技（立即型）
    const { newBoard, logs: leaderLogs } = applyLeaderSkills({
        board, myLeader: _myLeader, enemyLeader: _enemyLeader, myUid: gameState.myUid
    });
    board = newBoard;
    gameState.board = board;

    setBoardCallbacks({
        onMove:         handlePlayerMove,
        onDuel:         handlePlayerDuel,
        onSkill:        handlePlayerSkill,
        onTurnTimeout:  handleTurnTimeout,
    });

    // 建立 UI
    const gameArea = document.querySelector('.game-frame');
    if (gameArea) {
        buildGameUI(gameArea);
        buildBattleLogPanel();
        clearBattleLog();
    }

    // 開局展示隊長
    _showCaptainReveal(myCaptain, cpuCaptain, () => {
        if (leaderLogs.length > 0) addBattleLog(leaderLogs);
        const gameData = _makeGameData(CPU_UID);
        _render(gameData);
    });
}

// 開局展示隊長卡
function _showCaptainReveal(myCaptain, cpuCaptain, onDone) {
    const overlay = document.createElement('div');
    overlay.id = 'captain-reveal';
    overlay.style.cssText = `position:fixed;inset:0;background:rgba(0,0,0,0.92);z-index:99998;display:flex;align-items:center;justify-content:center;flex-direction:column;gap:24px;padding:20px;box-sizing:border-box;`;

    const makeCard = (cap, label, color) => {
        if (!cap) return `<div style="text-align:center;"><div style="font-size:0.9rem;color:${color};font-weight:bold;">${label}</div><div style="color:#475569;font-size:0.85rem;margin-top:6px;">無隊長</div></div>`;
        const isCpu = cap.isCpu || String(cap.id).startsWith('cpu_');
        const imgHTML = isCpu
            ? `<div style="width:100px;height:130px;display:flex;align-items:center;justify-content:center;font-size:3rem;background:#1a1a2e;border-radius:10px;">🤖</div>`
            : `<img src="img/characters/${cap.id}.webp" onerror="this.src='img/characters/default.png'" style="width:100px;height:130px;object-fit:cover;object-position:top;border-radius:10px;">`;
        const leaderDesc = cap.leader?.desc || '';
        return `<div style="text-align:center;">
            <div style="font-size:0.9rem;color:${color};font-weight:bold;letter-spacing:2px;margin-bottom:8px;">${label}</div>
            <div style="border:2px solid ${color};border-radius:12px;overflow:hidden;display:inline-block;box-shadow:0 0 20px ${color}44;">${imgHTML}</div>
            <div style="margin-top:8px;font-size:1rem;font-weight:700;color:#f1f5f9;">${cap.name || '???'}</div>
            <div style="margin-top:6px;font-size:0.72rem;color:#94a3b8;max-width:220px;line-height:1.5;">
                ${leaderDesc ? '👑 ' + leaderDesc : '無隊長技'}
            </div>
        </div>`;
    };

    overlay.innerHTML = `
        <div style="font-size:1.2rem;color:#ffd700;font-family:'Orbitron';letter-spacing:3px;text-shadow:0 0 10px rgba(255,215,0,0.5);">⚔️ CAPTAIN REVEAL ⚔️</div>
        <div style="display:flex;gap:40px;align-items:flex-start;justify-content:center;flex-wrap:wrap;">
            ${makeCard(myCaptain, 'YOUR CAPTAIN', '#4facfe')}
            <div style="color:#475569;font-size:1.4rem;font-weight:bold;align-self:center;">VS</div>
            ${makeCard(cpuCaptain, 'ENEMY CAPTAIN', '#ff4444')}
        </div>
    `;

    document.body.appendChild(overlay);
    setTimeout(() => {
        overlay.style.transition = 'opacity 0.4s';
        overlay.style.opacity = '0';
        setTimeout(() => { overlay.remove(); onDone(); }, 400);
    }, 3500);
}


// ==========================================
// 棋盤狀態物件（本地快照）
// ==========================================
function _makeGameData(turn) {
    return {
        player1: CPU_UID,
        player2: gameState.myUid,
        status: 'playing',
        board: gameState.board,
        turn,
        turn_start_time: Date.now(),
        duel: null
    };
}

// ==========================================
// 渲染（CPU 模式入口）
// ==========================================
function _render(gameData) {
    gameState.board = gameData.board;

    const gameArea = document.querySelector('.game-frame');
    if (!gameArea) return;

    if (!document.getElementById('chess-board')) {
        buildGameUI(gameArea);
        buildBattleLogPanel();
        clearBattleLog();
    }

    renderBoard(gameData);
    updateTimer(gameData);

    // turn-text 由 board.js 統一處理，這裡不再覆寫

    // 回合開始：觸發被動（回血等）
    const { newBoard: boardAfterTurn, logs: turnLogs } = resolveTurnStart({
        board: gameData.board,
        myUid: gameState.myUid,
    });
    if (turnLogs.length > 0) {
        gameState.board = boardAfterTurn;
        gameData = { ...gameData, board: boardAfterTurn };
        addBattleLog(turnLogs);
    }

    // 隊長技：回合開始（潮汐積累 ATK+5）
    const currentTurnOwner = gameData.turn;
    const currentLeader = (currentTurnOwner === gameState.myUid) ? _myLeader : _enemyLeader;
    if (currentLeader?.trigger === 'on_turn_start') {
        const { newBoard: b2, logs: l2 } = resolveLeaderTurnStart({
            board: gameData.board, leader: currentLeader, ownerUid: currentTurnOwner
        });
        if (l2.length > 0) {
            gameState.board = b2;
            gameData = { ...gameData, board: b2 };
            addBattleLog(l2);
        }
    }

    if (gameData.turn === CPU_UID) {
        setTimeout(() => _cpuTakeTurn(gameData), 1200);
    }
}

// ==========================================
// 玩家行動回呼
// ==========================================
async function handlePlayerMove(from, to, newBoard, gameData) {
    // 移動後觸發被動（移動回血）
    const { newBoard: boardAfterMove, logs: moveLogs } = resolveOnMove({
        board: newBoard,
        moverIdx: to,
        myUid: gameState.myUid,
    });
    if (moveLogs.length > 0) {
        addBattleLog(moveLogs);
        moveLogs.forEach(l => showFloatingText(to, '+' + (l.text.match(/\d+/) || [''])[0], '#4ade80'));
    }
    gameState.board = boardAfterMove;
    addBattleLog([makeLog('info', `→ ${boardAfterMove[to]?.name || '棋子'} 移動`)]);

    // 隊長技：移動後全隊回血（聖光庇護）
    let finalBoard = boardAfterMove;
    if (_myLeader?.trigger === 'on_move') {
        const { newBoard: b, logs: l } = resolveLeaderOnMove({
            board: finalBoard, leader: _myLeader, ownerUid: gameState.myUid
        });
        if (l.length > 0) { finalBoard = b; addBattleLog(l); }
    }
    gameState.board = finalBoard;

    const nextGame  = _makeGameData(CPU_UID);
    nextGame.board  = finalBoard;
    gameState.actionUsed = false;
    _render(nextGame);
}

async function handlePlayerDuel(fromIdx, toIdx, gameData) {
    _startDuel(fromIdx, toIdx, gameData, false); // false = 玩家是攻擊方
}

function handleTurnTimeout(gameData) {
    // 時間到：跳過自己回合，換 CPU
    addBattleLog([makeLog('info', '⏰ 時間到！自動跳過回合', { color: 'gray' })]);
    gameState.actionUsed = false;
    const next = _makeGameData(CPU_UID);
    next.board = gameState.board;
    _render(next);
}
function handlePlayerSkill(index, cell, gameData) {
    // 技能邏輯待實作
    alert(`【${cell.active.name}】\n${cell.active.desc}`);
}

// ==========================================
// CPU 行動
// ==========================================
function _cpuTakeTurn(gameData) {
    const board    = [...gameData.board];
    const cpuUnits = board.map((c, i) => ({ c, i })).filter(x => x.c && x.c.owner === CPU_UID);
    if (cpuUnits.length === 0) return;

    const unit = cpuUnits[Math.floor(Math.random() * cpuUnits.length)];
    const from = unit.i;
    const row  = Math.floor(from / 5);
    const col  = from % 5;

    const candidates = [];
    if (row > 0) candidates.push(from - 5);
    if (row < 5) candidates.push(from + 5);
    if (col > 0) candidates.push(from - 1);
    if (col < 4) candidates.push(from + 1);

    const valid = candidates.filter(to => {
        const cell = board[to];
        return !cell || cell.owner === gameState.myUid;
    });

    if (valid.length === 0) {
        _render(_makeGameData(gameState.myUid));
        return;
    }

    const to     = valid[Math.floor(Math.random() * valid.length)];
    const target = board[to];

    if (!target) {
        board[to]   = board[from];
        board[from] = null;
        const movedName = board[to]?.name || 'CPU';
        addBattleLog([makeLog('info', `🤖 ${movedName} 移動`, { color: 'gray' })]);
        gameState.board = board;
        const next = _makeGameData(gameState.myUid);
        next.board = board;
        _render(next);
    } else {
        _startDuel(from, to, { ...gameData, board }, true); // true = CPU 是攻擊方
    }
}

// ==========================================
// 決鬥流程
// ==========================================
function _startDuel(attIdx, defIdx, gameData, cpuIsAttacker) {
    const cpuChoice = CHOICES[Math.floor(Math.random() * CHOICES.length)];
    gameState.board = gameData.board;

    const modal = document.getElementById('duel-modal');
    if (modal) modal.style.display = 'flex';

    const duelData = {
        attackerIndex: attIdx,
        defenderIndex: defIdx,
        cpu_choice: cpuChoice,
        cpuIsAttacker,
        p1_choice: null,
        p2_choice: null,
    };

    _showDuelUI(duelData, gameData);
}

function _showDuelUI(duelData, gameData) {
    // 清除殘留計時
    if (gameState.duelCountdownInterval) {
        clearInterval(gameState.duelCountdownInterval);
        gameState.duelCountdownInterval = null;
    }

    // ★ 重建決鬥 modal 內容（in-flow 格式，不 fixed）
    const modal = document.getElementById('duel-modal');
    if (modal) {
        modal.innerHTML = `
            <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;justify-content:center;">
                <span style="color:#ff00cc;font-family:'Orbitron';font-size:0.9rem;">⚔️ DUEL</span>
                <span id="duel-timer" style="font-size:1.4rem;color:#ffeb3b;font-weight:bold;text-shadow:0 0 10px #ffeb3b;min-width:26px;text-align:center;">10</span>
                <span id="duel-status" style="color:#94a3b8;font-size:0.8rem;">選擇命運</span>
            </div>
            <div id="rps-buttons" style="display:flex;gap:6px;width:100%;">
                <button class="rps-btn duel-btn-attack" data-choice="attack" onclick="submitDuelChoice('attack')">⚔️<span>攻擊</span><small>剋魔法</small></button>
                <button class="rps-btn duel-btn-magic"  data-choice="magic"  onclick="submitDuelChoice('magic')">✨<span>魔法</span><small>剋陷阱</small></button>
                <button class="rps-btn duel-btn-trap"   data-choice="trap"   onclick="submitDuelChoice('trap')">🪤<span>陷阱</span><small>剋攻擊</small></button>
                <button class="rps-btn duel-btn-defend" data-choice="defend" onclick="submitDuelChoice('defend')">🛡️<span>防禦</span><small>減傷</small></button>
            </div>
        `;
        modal.style.display = 'flex';
    }

    const btnsEl = document.getElementById('rps-buttons');
    if (btnsEl) { btnsEl.style.pointerEvents = 'auto'; btnsEl.style.opacity = '1'; }

    const statusEl = document.getElementById('duel-status');
    const timerEl  = document.getElementById('duel-timer');
    if (statusEl) statusEl.innerText = '選擇命運';

    let timeLeft = 10;
    let answered = false;
    if (timerEl) { timerEl.style.display = 'block'; timerEl.innerText = timeLeft; }

    gameState.duelCountdownInterval = setInterval(() => {
        timeLeft--;
        const el = document.getElementById('duel-timer');
        if (el) el.innerText = timeLeft;
        if (timeLeft <= 0) {
            clearInterval(gameState.duelCountdownInterval);
            gameState.duelCountdownInterval = null;
            if (!answered) {
                answered = true;
                _submitPlayerChoice(CHOICES[Math.floor(Math.random() * 4)], duelData, gameData);
            }
        }
    }, 1000);

    // 覆寫全域 submitDuelChoice
    window.submitDuelChoice = (choice) => {
        if (answered) return;
        answered = true;
        clearInterval(gameState.duelCountdownInterval);
        gameState.duelCountdownInterval = null;
        _submitPlayerChoice(choice, duelData, gameData);
    };
}

function _submitPlayerChoice(playerChoice, duelData, gameData) {
    // 視覺回饋
    document.querySelectorAll('.rps-btn').forEach(b => {
        if (b.dataset.choice === playerChoice) {
            b.style.border = '4px solid #00ff00';
            b.style.boxShadow = '0 0 20px #00ff00';
            b.style.transform = 'scale(1.1)';
        } else {
            b.style.opacity = '0.3';
            b.style.filter = 'grayscale(100%)';
        }
    });
    const btnsEl = document.getElementById('rps-buttons');
    if (btnsEl) btnsEl.style.pointerEvents = 'none';
    const timerEl = document.getElementById('duel-timer');
    if (timerEl) timerEl.innerText = '已確認';

    // 組合雙方選擇
    // CPU 模式：cpu 固定是 p1，玩家固定是 p2
    const fullDuel = {
        ...duelData,
        p1_choice: duelData.cpu_choice,
        p2_choice: playerChoice,
    };
    const fullGame = { ...gameData, duel: fullDuel };

    setTimeout(() => {
        revealDuelChoices(fullGame);
        setTimeout(() => _resolveDuel(fullGame), 4000);
    }, 300);
}

function _resolveDuel(gameData) {
    const p1Choice = gameData.duel.p1_choice; // CPU
    const p2Choice = gameData.duel.p2_choice; // 玩家
    const attIdx   = gameData.duel.attackerIndex;
    const defIdx   = gameData.duel.defenderIndex;

    const board = JSON.parse(JSON.stringify(gameState.board));
    const atk   = board[attIdx];
    const def   = board[defIdx];
    if (!atk || !def) { _render(_makeGameData(gameState.myUid)); return; }

    // 攻擊方是誰（attIdx 棋子的 owner）
    const attackerIsPlayer = atk.owner === gameState.myUid;
    // CPU是p1出p1Choice，玩家是p2出p2Choice
    // attIdx棋子若是玩家，他出p2Choice；若是CPU，他出p1Choice
    const attackerChoice = attackerIsPlayer ? p2Choice : p1Choice;
    const defenderChoice = attackerIsPlayer ? p1Choice : p2Choice;

    // 用 skill-engine 計算（取所有回傳）
    const { newBoard, logs, result, winnerIdx, loserIdx } = resolveDuelDamage({
        board,
        attackerIdx: attIdx,
        defenderIdx: defIdx,
        attackerChoice,
        defenderChoice,
        myUid: gameState.myUid,
    });

    // 加入戰鬥日誌 + 浮字
    addBattleLog(logs);
    logs.forEach(log => {
        const idx = log.type === 'damage' || log.type === 'death' ? defIdx : attIdx;
        const color = { damage:'#f87171', heal:'#4ade80', skill:'#facc15', death:'#f87171' }[log.type];
        if (color && log.type !== 'turn' && log.type !== 'info') {
            showFloatingText(idx, log.text.split(' ')[0], color);
        }
    });

    // 決鬥動畫（用 skill-engine 給的 winnerIdx/loserIdx）
    if (result !== 'draw' && winnerIdx !== undefined && loserIdx !== undefined) {
        const winnerChoice = winnerIdx === attIdx ? attackerChoice : defenderChoice;
        const loserChoice  = loserIdx  === attIdx ? attackerChoice : defenderChoice;
        showDuelAnimation(winnerIdx, loserIdx, winnerChoice, loserChoice);
    }

    // 關閉 modal
    const modal = document.getElementById('duel-modal');
    if (modal) modal.style.display = 'none';

    const attackerOwner = atk.owner;
    const nextTurn      = (attackerOwner === gameState.myUid) ? CPU_UID : gameState.myUid;

    // ── 動畫流程 ──
    // 先用「未死亡」的棋盤渲染（讓動畫有目標），播放完再用 newBoard 重新渲染
    const boardBeforeDeath = JSON.parse(JSON.stringify(newBoard));
    // 暫時把死亡棋子放回去顯示動畫
    if (newBoard[winnerIdx] === null && board[winnerIdx]) boardBeforeDeath[winnerIdx] = { ...board[winnerIdx], hp: 0 };
    if (newBoard[loserIdx]  === null && board[loserIdx])  boardBeforeDeath[loserIdx]  = { ...board[loserIdx],  hp: 0 };

    gameState.board = boardBeforeDeath;
    const animGame  = _makeGameData(nextTurn);
    animGame.board  = boardBeforeDeath;
    renderBoard(animGame);

    // 播動畫
    if (result !== 'draw' && winnerIdx !== undefined && loserIdx !== undefined) {
        const winnerChoice2 = winnerIdx === attIdx ? attackerChoice : defenderChoice;
        const loserChoice2  = loserIdx  === attIdx ? attackerChoice : defenderChoice;
        showDuelAnimation(winnerIdx, loserIdx, winnerChoice2, loserChoice2);
    }

    gameState.board      = newBoard;
    gameState.actionUsed = false;

    // 隊長技：猜拳勝後全隊回血（自然恩賜）
    if (result !== 'draw') {
        const winnerOwner = newBoard[winnerIdx]?.owner || (result === 'att_win' ? atk.owner : def.owner);
        const wLeader = (winnerOwner === gameState.myUid) ? _myLeader : _enemyLeader;
        if (wLeader?.trigger === 'on_win_duel') {
            const { newBoard: bw, logs: lw } = resolveLeaderOnWin({
                board: newBoard, leader: wLeader, ownerUid: winnerOwner
            });
            if (lw.length > 0) { gameState.board = bw; Object.assign(newBoard, bw); addBattleLog(lw); }
        }
    }

    // 隊長技：死亡時對隨機敵人造成傷害（獻祭爆炎）
    const deadOwner = board[loserIdx]?.owner;
    if (deadOwner && newBoard[loserIdx] === null) {
        const dLeader = (deadOwner === gameState.myUid) ? _myLeader : _enemyLeader;
        if (dLeader?.trigger === 'on_death') {
            const { newBoard: bd, logs: ld } = resolveLeaderOnDeath({
                board: newBoard, leader: dLeader, ownerUid: deadOwner, deadIdx: loserIdx
            });
            if (ld.length > 0) { gameState.board = bd; Object.assign(newBoard, bd); addBattleLog(ld); }
        }
    }

    const cpuAlive = newBoard.some(c => c && c.owner === CPU_UID);
    const myAlive  = newBoard.some(c => c && c.owner === gameState.myUid);
    if (!cpuAlive) { setTimeout(() => _handleGameEnd(gameState.myUid), 1800); return; }
    if (!myAlive)  { setTimeout(() => _handleGameEnd(CPU_UID),         1300); return; }

    // 等動畫跑完再正式 render（移除死掉的棋子）
    setTimeout(() => {
        const next = _makeGameData(nextTurn);
        next.board = newBoard;
        _render(next);
    }, 1800);
}

// ==========================================
// 遊戲結束
// ==========================================
async function _handleGameEnd(winnerUid) {
    if (document.getElementById('game-over-modal')) return;
    const isWin  = winnerUid === gameState.myUid;
    const reward = isWin ? 100 : 50;

    const modal = document.createElement('div');
    modal.id = 'game-over-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:99999;';
    modal.innerHTML = `
        <div class="result-title ${isWin ? 'victory' : 'defeat'}">${isWin ? 'VICTORY' : 'DEFEAT'}</div>
        <div class="reward-box">
            <div style="color:#aaa;font-size:0.9rem;margin-bottom:5px;">BATTLE REWARDS</div>
            <div class="reward-coins"><span>💰</span><span>+${reward}</span></div>
        </div>
        <button class="home-btn" onclick="location.reload()">RETURN TO LOBBY</button>
    `;
    document.body.appendChild(modal);

    try {
        const userRef  = ref(db, `users/${gameState.myUid}`);
        const snap     = await get(userRef);
        const coins    = snap.val()?.coins || 0;
        await update(userRef, { coins: coins + reward });
    } catch (e) {
        console.error('獎勵發放失敗:', e);
    }

    // 清除意外寫入的 cpu_local 資料（防止積累佔用連線數）
    try {
        const { remove, ref: dbRef } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js');
        const { db: database } = await import('./firebase-config.js');
        const gamesSnap = await get(dbRef(database, 'games'));
        if (gamesSnap.exists()) {
            const games = gamesSnap.val();
            const delPromises = Object.keys(games)
                .filter(k => k.startsWith('cpu_local_'))
                .map(k => remove(dbRef(database, `games/${k}`)));
            await Promise.all(delPromises);
            if (delPromises.length > 0) console.log(`[CPU] 清理 ${delPromises.length} 筆 cpu_local 資料`);
        }
    } catch(e) { /* 清理失敗不影響遊戲 */ }
}
