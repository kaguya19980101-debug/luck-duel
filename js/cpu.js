// js/cpu.js
// ==========================================
// 電腦對戰模式 — 所有 CPU 邏輯集中在此
// ==========================================

import { auth } from './firebase-config.js';
import { ref, get, update } from 'https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js';
import { db } from './firebase-config.js';
import { gameState, CPU_UID, getBattleAttr } from './state.js';
import { buildGameUI, renderBoard, updateTimer, setBoardCallbacks, closeCardInfo } from './board.js';
import { revealDuelChoices } from './game.js';

// ── 決鬥選項 ──
const CHOICES = ['attack', 'magic', 'trap', 'defend'];
const BEATS   = { attack: 'magic', magic: 'trap', trap: 'attack' };

// ==========================================
// 初始化電腦對戰
// ==========================================
export function initCpuGame(myTeam) {
    gameState.resetAll();
    gameState.isCpuMode = true;
    gameState.myUid     = auth.currentUser.uid;
    gameState.role      = 'cpu';

    // 電腦隊伍：5 張 100HP 50ATK 預設卡
    const cpuTeam = Array.from({ length: 5 }, (_, i) => ({
        id: `cpu_${i}`, name: `CPU ${i + 1}`,
        attribute: 'dark', rarity: 'R',
        hp: 100, max_hp: 100, attack: 50, range: 1,
        img: 'img/characters/0001.webp',
        owner: CPU_UID, team: 'red'
    }));

    const board = new Array(30).fill(null);
    cpuTeam.forEach((c, i) => { board[i] = c; });
    myTeam.forEach((c, i) => {
        if (c) board[25 + i] = { ...c, owner: gameState.myUid, team: 'blue' };
    });
    gameState.board = board;

    // 注入棋盤回呼
    setBoardCallbacks({
        onMove:  handlePlayerMove,
        onDuel:  handlePlayerDuel,
        onSkill: handlePlayerSkill,
    });

    const gameData = _makeGameData(CPU_UID);
    _render(gameData);
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
    }

    renderBoard(gameData);
    updateTimer(gameData);

    const turnText = document.getElementById('turn-text');
    if (turnText) {
        turnText.innerText = gameData.turn === gameState.myUid ? '⚔️ 你的回合' : '🤖 電腦回合';
    }

    if (gameData.turn === CPU_UID) {
        setTimeout(() => _cpuTakeTurn(gameData), 1200);
    }
}

// ==========================================
// 玩家行動回呼
// ==========================================
async function handlePlayerMove(from, to, newBoard, gameData) {
    gameState.board = newBoard;
    const nextGame  = _makeGameData(CPU_UID);
    nextGame.board  = newBoard;
    gameState.actionUsed = false;
    _render(nextGame);
}

async function handlePlayerDuel(fromIdx, toIdx, gameData) {
    _startDuel(fromIdx, toIdx, gameData, false); // false = 玩家是攻擊方
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

    // 重置按鈕樣式
    document.querySelectorAll('.rps-btn').forEach(b => {
        b.style.border = b.style.boxShadow = b.style.transform = b.style.opacity = b.style.filter = '';
        b.style.pointerEvents = 'auto';
    });
    const btnsEl = document.getElementById('rps-buttons');
    if (btnsEl) { btnsEl.style.pointerEvents = 'auto'; btnsEl.style.opacity = '1'; }

    const statusEl = document.getElementById('duel-status');
    const timerEl  = document.getElementById('duel-timer');
    if (statusEl) statusEl.innerText = '選擇你的命運！';

    let timeLeft = 5;
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
                console.log('[CPU DUEL] Timeout — auto selecting');
                _submitPlayerChoice(CHOICES[Math.floor(Math.random() * 4)], duelData, gameData);
            }
        }
    }, 1000);

    // 覆寫全域 submitDuelChoice
    window.submitDuelChoice = (choice) => {
        console.log('[CPU DUEL] Player chose:', choice, '| answered:', answered);
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
    const p1 = gameData.duel.p1_choice; // CPU
    const p2 = gameData.duel.p2_choice; // 玩家
    const attIdx = gameData.duel.attackerIndex;
    const defIdx = gameData.duel.defenderIndex;

    const board = JSON.parse(JSON.stringify(gameState.board));
    const atk   = board[attIdx];
    const def   = board[defIdx];
    if (!atk || !def) { _render(_makeGameData(gameState.myUid)); return; }

    // 勝負判斷
    let result = 'draw', defenderHalved = false;
    if (p1 === p2) { result = 'draw'; }
    else if (p1 === 'defend' && p2 === 'defend') { result = 'draw'; }
    else if (p1 === 'defend') { result = 'p2_win'; defenderHalved = true; }
    else if (p2 === 'defend') { result = 'p1_win'; defenderHalved = true; }
    else if (BEATS[p1] === p2) { result = 'p1_win'; }
    else { result = 'p2_win'; }

    if (result !== 'draw') {
        const winnerId = result === 'p1_win' ? CPU_UID : gameState.myUid;
        const [winner, loser, loserIdx] = atk.owner === winnerId
            ? [atk, def, defIdx]
            : [def, atk, attIdx];
        let dmg = winner.attack || 50;
        if (defenderHalved) dmg = Math.floor(dmg * 0.5);
        loser.hp -= dmg;
        if (loser.hp <= 0) board[loserIdx] = null;
    }

    // 關閉決鬥 modal
    const modal = document.getElementById('duel-modal');
    if (modal) modal.style.display = 'none';

    // 回合切換：攻擊方行動完畢，換對方
    const attackerOwner  = atk.owner;
    const nextTurn       = (attackerOwner === gameState.myUid) ? CPU_UID : gameState.myUid;

    gameState.board      = board;
    gameState.actionUsed = false;

    // 檢查遊戲結束
    const cpuAlive = board.some(c => c && c.owner === CPU_UID);
    const myAlive  = board.some(c => c && c.owner === gameState.myUid);
    if (!cpuAlive) { _handleGameEnd(gameState.myUid); return; }
    if (!myAlive)  { _handleGameEnd(CPU_UID);         return; }

    const next = _makeGameData(nextTurn);
    next.board = board;
    _render(next);
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
}
