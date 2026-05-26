// js/game.js (修復版)
import { db, auth } from "./firebase-config.js";
import { ref, update, onValue, get } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

let currentGameId = null;
let currentRole = null; // "host" or "joiner"
let currentBoard = [];
let myUid = null;
let selectedIndex = -1;
let timerInterval = null;
let isResolving = false; // 防止重複結算
let duelCountdownInterval = null; // 決鬥倒數計時器
// 定義屬性圖示與顏色 (與 main.js 保持一致)
const BATTLE_ATTR_CONFIG = {
    'fire': { icon: '🔥', color: '#ff5555' },
    'water': { icon: '💧', color: '#3b82f6' },
    'grass': { icon: '🌿', color: '#22c55e' },
    'wood': { icon: '🌿', color: '#22c55e' }, // 相容舊資料
    'light': { icon: '✨', color: '#fbbf24' },
    'dark': { icon: '🟣', color: '#a855f7' }
};
// 輔助函式：安全取得屬性設定
function getBattleAttr(attr) {
    const key = (attr || '').toLowerCase();
    return BATTLE_ATTR_CONFIG[key] || { icon: '❓', color: '#999' };
}

// ==========================================
// 電腦模式 (CPU AI)
// ==========================================
let isCpuMode = false;
const CPU_UID = 'cpu_opponent';

export function initCpuGame(myTeam) {
    isCpuMode = true;
    currentGameId = 'cpu_local_' + Date.now();
    currentRole = 'host';
    myUid = auth.currentUser.uid;
    isResolving = false;

    // 建立電腦隊伍（5張 100HP 50ATK 的預設卡）
    const cpuTeam = Array.from({ length: 5 }, (_, i) => ({
        id: `cpu_${i}`, name: `電腦 ${i + 1}`,
        attribute: 'dark', rarity: 'R',
        hp: 100, max_hp: 100, attack: 50, range: 1,
        img: 'img/characters/0001.webp',
        owner: CPU_UID, team: 'red'
    }));

    // 建立初始棋盤
    const board = new Array(30).fill(null);
    cpuTeam.forEach((c, i) => { board[i] = c; });
    myTeam.forEach((c, i) => {
        if (c) board[25 + i] = { ...c, owner: myUid, team: 'blue' };
    });

    const gameData = {
        player1: CPU_UID,
        player2: myUid,
        status: 'playing',
        board,
        turn: CPU_UID, // CPU 先手
        turn_start_time: Date.now(),
        duel: null
    };

    // 直接在本地 render
    renderCpuGame(gameData);
}

function renderCpuGame(gameData) {
    currentBoard = gameData.board;

    const gameArea = document.querySelector('.game-frame');
    if (!gameArea) return;

    // 第一次進來才建 UI
    if (!document.getElementById('chess-board')) {
        buildGameUI(gameArea);
    }

    renderBoard(gameData);
    updateTimer(gameData);

    const turnText = document.getElementById('turn-text');
    if (turnText) {
        turnText.innerText = gameData.turn === myUid ? '⚔️ 你的回合' : '🤖 電腦回合';
    }

    if (gameData.turn === CPU_UID) {
        setTimeout(() => cpuTakeTurn(gameData), 1200);
    }
}

function buildGameUI(gameArea) {
    gameArea.innerHTML = `
        <div id="game-hud" style="display:flex;flex-direction:column;align-items:center;justify-content:center;width:100%;margin-bottom:20px;position:relative;">
            <div id="timer-box" style="background:rgba(0,0,0,0.8);border:2px solid #555;border-radius:12px;padding:2px 0;width:80px;text-align:center;margin-bottom:8px;box-shadow:0 4px 10px rgba(0,0,0,0.5);z-index:10;">
                <span id="timer-text" style="color:#ff4444;font-weight:bold;font-size:1.2rem;font-family:monospace;letter-spacing:1px;">30s</span>
            </div>
            <div id="turn-text" style="font-family:sans-serif;font-size:1.1rem;font-weight:bold;color:white;text-shadow:0 2px 4px rgba(0,0,0,0.8);background:rgba(255,255,255,0.1);padding:4px 15px;border-radius:20px;">等待開始...</div>
        </div>
        <div style="width:100%;display:flex;justify-content:center;">
            <div id="chess-board" style="display:grid;grid-template-columns:repeat(5,1fr);grid-template-rows:repeat(6,1fr);gap:5px;width:100%;max-width:520px;aspect-ratio:5/6;background:#2b2b2b;padding:7px;border-radius:14px;box-shadow:0 10px 30px rgba(0,0,0,0.5);"></div>
        </div>
        <div id="duel-modal" style="display:none;position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.92);z-index:9999;flex-direction:column;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;">
            <h1 style="color:#ff00cc;font-family:'Orbitron';margin-bottom:8px;font-size:clamp(1.5rem,5vw,2.2rem);">⚔️ DUEL ⚔️</h1>
            <div id="duel-timer" style="font-size:3rem;color:#ffeb3b;font-weight:bold;margin-bottom:8px;text-shadow:0 0 10px #ffeb3b;">5</div>
            <div id="duel-status" style="color:#aaa;margin-bottom:28px;font-size:1.1rem;">選擇你的命運</div>
            <div id="rps-buttons" style="display:grid;grid-template-columns:1fr 1fr;gap:clamp(10px,3vw,18px);width:100%;max-width:380px;margin:0 auto;">
                <button class="rps-btn duel-btn-attack" data-choice="attack" onclick="submitDuelChoice('attack')">⚔️<span>攻擊</span><small>剋魔法</small></button>
                <button class="rps-btn duel-btn-magic"  data-choice="magic"  onclick="submitDuelChoice('magic')">✨<span>魔法</span><small>剋陷阱</small></button>
                <button class="rps-btn duel-btn-trap"   data-choice="trap"   onclick="submitDuelChoice('trap')">🪤<span>陷阱</span><small>剋攻擊</small></button>
                <button class="rps-btn duel-btn-defend" data-choice="defend" onclick="submitDuelChoice('defend')">🛡️<span>防禦</span><small>減傷50%</small></button>
            </div>
        </div>
    `;
}

// CPU 行動
function cpuTakeTurn(gameData) {
    const board = [...gameData.board];
    const cpuUnits = board.map((c, i) => ({ c, i })).filter(x => x.c && x.c.owner === CPU_UID);
    if (cpuUnits.length === 0) return;

    // 隨機選一隻棋子
    const unit = cpuUnits[Math.floor(Math.random() * cpuUnits.length)];
    const from = unit.i;
    const row = Math.floor(from / 5), col = from % 5;

    // 可移動的格子（上下左右）
    const moves = [];
    if (row > 0) moves.push(from - 5);
    if (row < 5) moves.push(from + 5);
    if (col > 0) moves.push(from - 1);
    if (col < 4) moves.push(from + 1);

    // 過濾：只能移動到空格或敵方格
    const valid = moves.filter(to => {
        const cell = board[to];
        return !cell || cell.owner === myUid;
    });

    if (valid.length === 0) {
        // 無路可走，直接換回合
        passTurn(gameData);
        return;
    }

    const to = valid[Math.floor(Math.random() * valid.length)];
    const target = board[to];

    if (!target) {
        // 移動到空格
        board[to] = board[from];
        board[from] = null;
        const newGame = { ...gameData, board, turn: myUid, turn_start_time: Date.now() };
        renderCpuGame(newGame);
    } else {
        // 碰到玩家棋子 → 觸發決鬥
        cpuDuel(from, to, gameData);
    }
}

function passTurn(gameData) {
    const newGame = { ...gameData, turn: myUid, turn_start_time: Date.now() };
    renderCpuGame(newGame);
}

// CPU 決鬥
function cpuDuel(attIdx, defIdx, gameData) {
    const choices = ['attack', 'magic', 'trap', 'defend'];
    const cpuChoice = choices[Math.floor(Math.random() * choices.length)];

    currentBoard = gameData.board;
    const modal = document.getElementById('duel-modal');
    if (modal) modal.style.display = 'flex';

    // 設定 duel state
    const duelState = {
        attackerIndex: attIdx,
        defenderIndex: defIdx,
        state: 'waiting',
        p1_choice: null,   // CPU (p1)
        p2_choice: null,   // 玩家 (p2)
        cpu_choice: cpuChoice // 先存起來，玩家出拳後一起揭曉
    };
    const fakeGame = { ...gameData, duel: duelState };
    checkDuelStateCpu(fakeGame);
}

function checkDuelStateCpu(gameData) {
    const modal = document.getElementById('duel-modal');
    if (!modal) return;
    modal.style.display = 'flex';

    const statusEl = document.getElementById('duel-status');
    const timerEl  = document.getElementById('duel-timer');
    const btnsEl   = document.getElementById('rps-buttons');

    if (statusEl) statusEl.innerText = '選擇你的命運！';
    if (btnsEl) {
        btnsEl.style.pointerEvents = 'auto';
        btnsEl.style.opacity = '1';
    }

    // 倒數
    if (duelCountdownInterval) clearInterval(duelCountdownInterval);
    let timeLeft = 5;
    if (timerEl) { timerEl.style.display = 'block'; timerEl.innerText = timeLeft; }

    duelCountdownInterval = setInterval(() => {
        timeLeft--;
        const tEl = document.getElementById('duel-timer');
        if (tEl) tEl.innerText = timeLeft;
        if (timeLeft <= 0) {
            clearInterval(duelCountdownInterval);
            duelCountdownInterval = null;
            const fallback = ['attack','magic','trap','defend'];
            submitDuelChoiceCpu(fallback[Math.floor(Math.random()*4)], gameData);
        }
    }, 1000);

    // 覆寫 submitDuelChoice 為 CPU 版
    window._cpuCurrentGame = gameData;
    window.submitDuelChoice = (choice) => submitDuelChoiceCpu(choice, window._cpuCurrentGame);
}

function submitDuelChoiceCpu(playerChoice, gameData) {
    if (duelCountdownInterval) { clearInterval(duelCountdownInterval); duelCountdownInterval = null; }

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

    const cpuChoice = gameData.duel.cpu_choice;
    // 玩家是 p2，CPU 是 p1
    const fullDuel = { ...gameData.duel, p1_choice: cpuChoice, p2_choice: playerChoice };
    const fullGame = { ...gameData, duel: fullDuel };

    setTimeout(() => {
        revealDuelChoices(fullGame);
        setTimeout(() => resolveDuelCpu(fullGame), 4000);
    }, 300);
}

async function resolveDuelCpu(gameData) {
    const p1 = gameData.duel.p1_choice; // CPU
    const p2 = gameData.duel.p2_choice; // 玩家
    const attIdx = gameData.duel.attackerIndex;
    const defIdx = gameData.duel.defenderIndex;

    let board = JSON.parse(JSON.stringify(currentBoard));
    const attackerChar = board[attIdx];
    const defenderChar = board[defIdx];
    if (!attackerChar || !defenderChar) { passTurn(gameData); return; }

    const BEATS = { attack: 'magic', magic: 'trap', trap: 'attack' };
    let result = 'draw', defenderHalved = false;

    if (p1 === p2) { result = 'draw'; }
    else if (p1 === 'defend' && p2 === 'defend') { result = 'draw'; }
    else if (p1 === 'defend') { result = 'p2_win'; defenderHalved = true; }
    else if (p2 === 'defend') { result = 'p1_win'; defenderHalved = true; }
    else if (BEATS[p1] === p2) { result = 'p1_win'; }
    else { result = 'p2_win'; }

    if (result !== 'draw') {
        const winnerId = result === 'p1_win' ? CPU_UID : myUid;
        let winner, loser, loserIdx;
        if (attackerChar.owner === winnerId) {
            winner = attackerChar; loser = defenderChar; loserIdx = defIdx;
        } else {
            winner = defenderChar; loser = attackerChar; loserIdx = attIdx;
        }
        let damage = winner.attack || 50;
        if (defenderHalved) damage = Math.floor(damage * 0.5);
        loser.hp -= damage;
        if (loser.hp <= 0) board[loserIdx] = null;
    }

    // 關閉 modal
    const modal = document.getElementById('duel-modal');
    if (modal) modal.style.display = 'none';

    // 恢復正常 submitDuelChoice
    window.submitDuelChoice = window._originalSubmitDuelChoice;

    // 決鬥結束後，回合換給「攻擊方的對手」
    // 攻擊方是玩家 → 換 CPU；攻擊方是 CPU → 換玩家
    const attackerOwner = attackerChar.owner;
    const nextTurn = (attackerOwner === myUid) ? CPU_UID : myUid;

    // 檢查遊戲結束
    const cpuUnits = board.filter(c => c && c.owner === CPU_UID);
    const myUnits  = board.filter(c => c && c.owner === myUid);

    const newGame = { ...gameData, board, duel: null, turn: nextTurn, turn_start_time: Date.now() };
    currentBoard = board;
    actionUsed = false;

    if (cpuUnits.length === 0) { handleGameEndLocal(myUid); return; }
    if (myUnits.length  === 0) { handleGameEndLocal(CPU_UID); return; }

    renderCpuGame(newGame);
}

async function handleGameEndLocal(winnerUid) {
    if (document.getElementById('game-over-modal')) return;
    const isWinner = (winnerUid === myUid);
    const reward = isWinner ? 100 : 50;
    const modal = document.createElement('div');
    modal.id = 'game-over-modal';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="result-title ${isWinner ? 'victory' : 'defeat'}">${isWinner ? 'VICTORY' : 'DEFEAT'}</div>
        <div class="reward-box">
            <div style="color:#aaa;font-size:0.9rem;margin-bottom:5px;">BATTLE REWARDS</div>
            <div class="reward-coins"><span>💰</span><span>+${reward}</span></div>
        </div>
        <button class="home-btn" onclick="location.reload()">RETURN TO LOBBY</button>
    `;
    document.body.appendChild(modal);
    try {
        const userRef = ref(db, `users/${myUid}`);
        const snap = await get(userRef);
        const coins = snap.val()?.coins || 0;
        await update(userRef, { coins: coins + reward });
    } catch(e) { console.error('獎勵發放失敗:', e); }
}

// 初始化遊戲棋盤 (強制置中版)
export function initGameBoard(gameId, role) {
    currentGameId = gameId;
    currentRole = role;
    myUid = auth.currentUser.uid;
    isResolving = false;

    const gameArea = document.querySelector('.game-frame');

    // ★★★ 介面重繪區 ★★★
    gameArea.innerHTML = `
        <div id="game-hud" style="
            display: flex;
            flex-direction: column;      /* 關鍵：讓東西由上往下排 */
            align-items: center;         /* 關鍵：讓東西左右置中 */
            justify-content: center;
            width: 100%;
            margin-bottom: 20px;
            position: relative;
        ">
            <div id="timer-box" style="
                background: rgba(0, 0, 0, 0.8);
                border: 2px solid #555;
                border-radius: 12px;
                padding: 2px 0;          /* 減少內距，讓盒子變矮 */
                width: 80px;             /* ★ 寬度縮小：原本 120px -> 改為 80px */
                text-align: center;
                margin-bottom: 8px;      /* 下方間距微調 */
                box-shadow: 0 4px 10px rgba(0,0,0,0.5);
                z-index: 10;
            ">
                <span id="timer-text" style="
                    color: #ff4444; 
                    font-weight: bold; 
                    font-size: 1.2rem;   /* ★ 字體縮小：原本 1.8rem -> 改為 1.2rem */
                    font-family: monospace; 
                    letter-spacing: 1px; /* 字距微調 */
                ">30s</span>
            </div>

            <div id="turn-text" style="
                font-family: sans-serif;
                font-size: 1.1rem;
                font-weight: bold;
                color: white;
                text-shadow: 0 2px 4px rgba(0,0,0,0.8);
                background: rgba(255,255,255,0.1);
                padding: 4px 15px;
                border-radius: 20px;
            ">
                等待同步...
            </div>
        </div>
        
        <div style="width:100%; display:flex; justify-content:center;">
            <div id="chess-board" style="
                display: grid; grid-template-columns: repeat(5, 1fr); grid-template-rows: repeat(6, 1fr);
                gap: 5px; width: 100%; max-width: 520px; aspect-ratio: 5 / 6;
                background: #2b2b2b; padding: 7px; border-radius: 14px;
                box-shadow: 0 10px 30px rgba(0,0,0,0.5);
            "></div>
        </div>
        
        <div id="duel-modal" style="display:none; position:absolute; top:0; left:0; width:100%; height:100%; background:rgba(0,0,0,0.95); z-index:999; flex-direction:column; justify-content:center; align-items:center; color:white;">
            </div>
    `;

    // 綁定決鬥按鈕
    document.querySelectorAll('.rps-btn').forEach(btn => {
        btn.onclick = () => submitDuelChoice(btn.dataset.choice);
    });

    // 監聽 Firebase
    const gameRef = ref(db, `games/${gameId}`);
    onValue(gameRef, (snapshot) => {
        const gameData = snapshot.val();
        if (!gameData) return;

        // --- ★ 新增這段：檢查遊戲是否結束 ★ ---
        if (gameData.status === "finished" && gameData.winner) {
            handleGameEnd(gameData.winner);
            return; // 結束後就不再渲染棋盤了
        }
        // 資料格式轉換 (防止 forEach error)
        if (gameData.board && !Array.isArray(gameData.board)) {
            currentBoard = new Array(30).fill(null);
            Object.keys(gameData.board).forEach(key => {
                currentBoard[key] = gameData.board[key];
            });
        } else {
            currentBoard = gameData.board || new Array(30).fill(null);
        }

        renderBoard(gameData);
        updateTimer(gameData);
        checkDuelState(gameData);
    });
}

// 渲染棋盤
// 渲染棋盤
function renderBoard(gameData) {
    const boardEl = document.getElementById('chess-board');
    boardEl.innerHTML = '';

    const amIHost = gameData.player1 === myUid;
    const shouldFlip = amIHost;

    // 更新上方資訊列
    const isMyTurn = gameData.turn === myUid;
    const turnText = document.getElementById('turn-text');
    if (turnText) {
        turnText.innerHTML = isMyTurn ?
            `<span style="color:#4facfe">🟢 你的回合</span>` :
            `<span style="color:#ff4444">🔴 對手回合</span>`;
    }

    // 換到自己回合時重置行動狀態
    if (isMyTurn && actionUsed === undefined) actionUsed = false;
    if (!isMyTurn) {
        // 對手回合，清除選取視覺
        selectedIndex = -1;
        pendingActionIndex = -1;
        moveMode = false;
        closeActionMenu();
    }

    for (let visualIndex = 0; visualIndex < 30; visualIndex++) {
        const realIndex = shouldFlip ? (29 - visualIndex) : visualIndex;
        const cell = currentBoard[realIndex];
        const div = document.createElement('div');

        // 基礎格子設定
        div.style.cssText = `
            width: 100%;
            border-radius: 8px; 
            position: relative;
            display: flex; justify-content: center; align-items: center; 
            cursor: pointer;
            box-shadow: inset 0 0 5px rgba(0,0,0,0.5);
            background: #262626;
            border: 1px solid #333;
            overflow: hidden;
            transition: border 0.1s, box-shadow 0.1s;
        `;

        // 選取高亮
        if (realIndex === selectedIndex) {
            div.style.border = '2px solid #ffff00';
            div.style.boxShadow = '0 0 18px rgba(255,255,0,0.8), inset 0 0 8px rgba(255,255,0,0.2)';
            div.style.zIndex = '5';
            // 移動模式下額外脈衝動畫
            if (moveMode) {
                div.style.animation = 'selectedPulse 0.8s ease-in-out infinite alternate';
            }
        }

        // ★★★ 4. 如果這格有棋子，畫出戰鬥卡片 ★★★
        if (cell) {
            const isMine = cell.owner === myUid;
            const attrData = getBattleAttr(cell.attribute);

            // 計算血量與攻擊力
            const atk = cell.attack || 50;
            const currentHp = cell.hp !== undefined ? cell.hp : 100;
            const maxHp = cell.max_hp || currentHp || 100;
            let hpPercent = (currentHp / maxHp) * 100;
            hpPercent = Math.max(0, Math.min(100, hpPercent));

            // 取得戰鬥專用圖片 (例如: img/characters/0001battle.webp)
            const idStr = String(cell.id);
            const battleImgPath = `img/characters/${idStr}battle.webp`;
            const fallbackImg = 'img/characters/default.png';

            // 敵我顏色區別 (外框與血條顏色)
            const borderColor = isMine ? '#4facfe' : '#ff4444';
            const hpColor = isMine ? '#00ff00' : '#ff0000';

            if (realIndex !== selectedIndex) {
                div.style.border = `2px solid ${borderColor}`;
            }

            div.innerHTML = `
                <div class="battle-card" style="width: 100%; height: 100%; border: none; border-radius: 0;">
                    <div class="battle-img-area">
                        <img src="${battleImgPath}" onerror="this.src='${fallbackImg}'">
                        <div class="battle-attr" style="color:${attrData.color};">${attrData.icon}</div>
                        <div class="battle-atk">${atk}</div>
                    </div>
                    <div class="battle-hp-container">
                        <div class="battle-hp-text">${currentHp}</div>
                        <div class="battle-hp-bar-bg">
                            <div class="battle-hp-bar-fill" style="width: ${hpPercent}%; background: ${hpColor};"></div>
                        </div>
                    </div>
                </div>
            `;
        }

        // 5. 點擊事件
        div.onclick = () => handleSquareClick(realIndex, cell, gameData);

        boardEl.appendChild(div);
    }
}

// 點擊事件
let pendingActionIndex = -1;
let moveMode = false;
let actionUsed = false; // 每回合只能行動一次

async function handleSquareClick(index, cell, gameData) {
    if (gameData.duel) return;
    if (gameData.turn !== myUid) return;
    if (actionUsed) return; // 本回合已行動

    // ── 移動模式 ──
    if (moveMode) {
        // 點到自己另一隻棋子 → 改選，重新顯示選單
        if (cell && cell.owner === myUid && index !== selectedIndex) {
            moveMode = false;
            selectedIndex = index;
            pendingActionIndex = index;
            closeActionMenu();
            renderBoard(gameData);
            showActionMenu(index, cell, gameData);
            return;
        }

        const fromIndex = selectedIndex;
        const toIndex = index;

        // 點同一格取消
        if (fromIndex === toIndex) {
            moveMode = false;
            selectedIndex = -1;
            pendingActionIndex = -1;
            closeActionMenu();
            renderBoard(gameData);
            return;
        }

        const diff = Math.abs(fromIndex - toIndex);
        const isSameRow = Math.floor(fromIndex / 5) === Math.floor(toIndex / 5);
        const validMove = (diff === 1 && isSameRow) || diff === 5;

        if (!validMove) {
            // 點了無效格 → 取消選取
            moveMode = false;
            selectedIndex = -1;
            pendingActionIndex = -1;
            renderBoard(gameData);
            return;
        }

        const newBoard = [...currentBoard];
        const attacker = newBoard[fromIndex];
        const defender = newBoard[toIndex];

        moveMode = false;
        selectedIndex = -1;
        pendingActionIndex = -1;
        actionUsed = true;

        if (!defender) {
            newBoard[toIndex] = attacker;
            newBoard[fromIndex] = null;
            if (isCpuMode) {
                // CPU 模式：本地處理，換 CPU 回合
                const newGame = { ...gameData, board: newBoard, turn: CPU_UID, turn_start_time: Date.now() };
                actionUsed = false;
                renderCpuGame(newGame);
            } else {
                await commitMove(newBoard, gameData);
            }
        } else if (defender.owner !== myUid) {
            if (isCpuMode) {
                cpuDuel(fromIndex, toIndex, gameData);
            } else {
                await triggerDuel(fromIndex, toIndex);
            }
        }
        return;
    }

    // ── 有選單開著：點其他地方取消 ──
    if (pendingActionIndex !== -1 && index !== pendingActionIndex) {
        closeActionMenu();
        // 如果點的是另一隻自己的棋子，直接換選
        if (cell && cell.owner === myUid) {
            selectedIndex = index;
            pendingActionIndex = index;
            renderBoard(gameData);
            showActionMenu(index, cell, gameData);
        } else {
            selectedIndex = -1;
            pendingActionIndex = -1;
            renderBoard(gameData);
        }
        return;
    }

    // ── 第一次點自己的棋子 ──
    if (selectedIndex === -1 && cell && cell.owner === myUid) {
        selectedIndex = index;
        pendingActionIndex = index;
        renderBoard(gameData);
        showActionMenu(index, cell, gameData);
    }
}

// 顯示動作選單（移動在左，技能在右）
function showActionMenu(index, cell, gameData) {
    closeActionMenu();

    const boardEl = document.getElementById('chess-board');
    if (!boardEl) return;

    const cellEls = boardEl.querySelectorAll(':scope > div');
    const targetEl = cellEls[index];
    if (!targetEl) return;

    const hasActive = !!(cell.active);

    // 用 viewport 座標 + fixed 定位，避免被 board 的 overflow:hidden 裁切
    const rect = targetEl.getBoundingClientRect();
    const cellCenterY = rect.top + rect.height / 2;

    // 移動按鈕（左側）— 與格子同高
    const cellH = rect.height;
    const moveBtn = document.createElement('button');
    moveBtn.className = 'action-btn action-move action-float';
    moveBtn.innerHTML = '🚶<span>移動</span>';
    moveBtn.style.position = 'fixed';
    moveBtn.style.left = (rect.left - cellH - 6) + 'px';
    moveBtn.style.top  = rect.top + 'px';
    moveBtn.style.width = cellH + 'px';
    moveBtn.style.height = cellH + 'px';
    moveBtn.onclick = (e) => {
        e.stopPropagation();
        e.preventDefault();
        closeActionMenu();
        moveMode = true;
        pendingActionIndex = -1;
        renderBoard(gameData); // 進入移動模式，高亮脈衝
    };

    // 技能按鈕（右側）— 與格子同高
    const skillBtn = document.createElement('button');
    skillBtn.className = 'action-btn action-skill action-float' + (hasActive ? '' : ' no-skill');
    skillBtn.innerHTML = '✨<span>技能</span>';
    skillBtn.style.position = 'fixed';
    skillBtn.style.left = (rect.right + 6) + 'px';
    skillBtn.style.top  = rect.top + 'px';
    skillBtn.style.width = cellH + 'px';
    skillBtn.style.height = cellH + 'px';
    if (!hasActive) {
        skillBtn.disabled = true;
    } else {
        skillBtn.onclick = (e) => {
            e.stopPropagation();
            e.preventDefault();
            closeActionMenu();
            alert(`【${cell.active.name}】\n${cell.active.desc}`);
            selectedIndex = -1;
            pendingActionIndex = -1;
            moveMode = false;
            renderBoard(gameData);
        };
    }

    // append 到 body（fixed 定位，不受 board overflow 影響）
    document.body.appendChild(moveBtn);
    document.body.appendChild(skillBtn);
}

function closeActionMenu() {
    document.querySelectorAll('.action-float').forEach(el => el.remove());
}

// 寫入移動
async function commitMove(newBoard, gameData) {
    const nextTurn = gameData.player1 === myUid ? gameData.player2 : gameData.player1;
    actionUsed = false; // 換回合重置

    // 1. 準備更新資料
    const updates = {
        board: newBoard,
        turn: nextTurn,
        turn_start_time: Date.now()
    };

    // 2. ★ 檢查是否結束 ★
    const winner = checkGameOver(newBoard, gameData);
    if (winner) {
        updates.status = "finished";
        updates.winner = winner;
        updates.duel = null; // 清除決鬥狀態
    }

    // 3. 寫入 Firebase
    await update(ref(db, `games/${currentGameId}`), updates);
}

// 計時器修正
function updateTimer(gameData) {
    if (timerInterval) clearInterval(timerInterval);
    const turnTime = 30;

    timerInterval = setInterval(() => {
        const elapsed = Math.floor((Date.now() - gameData.turn_start_time) / 1000);

        let remain = Math.max(0, 30 - elapsed);

        // ★ 修正：倒數不顯示負數
        if (remain < 0) remain = 0;

        const timerText = document.getElementById('timer-text');
        if (timerText) timerText.innerText = `${remain}s`;

        // 超時處理 (只由當前回合者觸發，避免雙重寫入)
        if (remain === 0 && gameData.turn === myUid) {
            clearInterval(timerInterval);
            // 這裡可以加隨機移動，或直接換人
            console.log("超時！強制換人");
            const newBoard = [...currentBoard]; // 暫時不移動，直接換人
            commitMove(newBoard, gameData);
        }
    }, 1000);
}

// --- 決鬥系統 ---

async function triggerDuel(attackerIdx, defenderIdx) {
    await update(ref(db, `games/${currentGameId}`), {
        duel: {
            attackerIndex: attackerIdx,
            defenderIndex: defenderIdx,
            state: "waiting",
            p1_choice: null,
            p2_choice: null
        }
    });
}
// ==========================================
// 3. 揭曉結果 (加入陳述文字)
// ==========================================
function revealDuelChoices(gameData) {
    const modal = document.getElementById('duel-modal');
    const p1Choice = gameData.duel.p1_choice;
    const p2Choice = gameData.duel.p2_choice;
    const icons = { 'attack': '⚔️', 'magic': '✨', 'trap': '🪤', 'defend': '🛡️' };

    const amIP1 = (currentRole === 'host');
    const myMove = amIP1 ? p1Choice : p2Choice;
    const oppMove = amIP1 ? p2Choice : p1Choice;

    // --- 計算勝負與文字 ---
    const attIdx = gameData.duel.attackerIndex;
    const defIdx = gameData.duel.defenderIndex;
    const attackerChar = currentBoard[attIdx] || {};
    const defenderChar = currentBoard[defIdx] || {};
    
    // 1. 判斷誰贏了（攻擊>魔法>陷阱>攻擊，防禦不參與三角）
    let result = "draw";
    const BEATS = { attack: 'magic', magic: 'trap', trap: 'attack' };
    if (p1Choice === p2Choice) {
        result = "draw";
    } else if (p1Choice === 'defend' && p2Choice === 'defend') {
        result = "draw";
    } else if (p1Choice === 'defend' || p2Choice === 'defend') {
        // 有人防禦：防禦方減傷 50%，攻擊方仍算「贏」（傷害打出去但被減半）
        if (p1Choice === 'defend') result = "p2_win_half"; // p2攻但被擋一半
        else result = "p1_win_half";
    } else if (BEATS[p1Choice] === p2Choice) {
        result = "p1_win";
    } else {
        result = "p2_win";
    }

    let narrativeHTML = "";
    
    // 2. 準備動態 CSS (為了讓文字晚一秒鐘出現，營造打擊感)
    const fadeAnimation = `animation: fadeIn 0.5s ease 1s forwards; opacity: 0;`;

    if (result === "draw") {
        narrativeHTML = `<div style="color:#ffd700; font-size:1.3rem; font-weight:bold; ${fadeAnimation}">平手！雙方無傷退開。</div>`;
    } else {
        const isP1Winner = (result === "p1_win");
        const amIWinner = amIP1 ? isP1Winner : !isP1Winner; // 我是不是贏家
        
        // 找出我的角色 (看 owner 是不是 myUid)
        const myChar = (attackerChar.owner === myUid) ? attackerChar : defenderChar;
        const myCharName = myChar.name || "未知角色";
        
        // 找出造成傷害的贏家角色 (用來抓攻擊力)
        const winnerChar = isP1Winner ? 
            (attackerChar.owner === gameData.player1 ? attackerChar : defenderChar) : 
            (attackerChar.owner === gameData.player2 ? attackerChar : defenderChar);
        
        const damage = winnerChar.attack || 50;

        // 根據勝負產生文字
        if (amIWinner) {
            narrativeHTML = `
                <div style="color:#00ff00; font-size:1.3rem; font-weight:bold; text-shadow: 0 0 5px black; ${fadeAnimation}">
                    🎉 我方勝利！<br>
                    <span style="color:white; font-size:1.1rem; display:inline-block; margin-top:10px;">
                        【${myCharName}】造成了 <span style="color:#ff4444; font-size:1.6rem; margin:0 5px;">${damage}</span> 點傷害！
                    </span>
                </div>`;
        } else {
            narrativeHTML = `
                <div style="color:#ff4444; font-size:1.3rem; font-weight:bold; text-shadow: 0 0 5px black; ${fadeAnimation}">
                    💀 對方勝利...<br>
                    <span style="color:white; font-size:1.1rem; display:inline-block; margin-top:10px;">
                        【${myCharName}】受到了 <span style="color:#ff4444; font-size:1.6rem; margin:0 5px;">${damage}</span> 點傷害！
                    </span>
                </div>`;
        }
    }

    // --- 繪製畫面 ---
    modal.innerHTML = `
        <style>@keyframes fadeIn { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }</style>
        
        <div style="display:flex; flex-direction:column; align-items:center; width:100%; text-align:center; max-width:600px; margin:0 auto;">
            <h1 style="color:#ff00cc; font-family:'Orbitron'; margin-bottom:30px; text-shadow:0 0 10px #ff00cc; font-size:clamp(1.4rem, 5vw, 2.2rem);">⚔️ 決鬥揭曉 ⚔️</h1>
            
            <div style="display:flex; justify-content:space-around; width:100%; align-items:center;">
                <div style="text-align:center;">
                    <div style="font-size:clamp(1rem,3vw,1.4rem); color:#4facfe; margin-bottom:12px;">YOU</div>
                    <div style="font-size:clamp(4.5rem,16vw,8rem); filter:drop-shadow(0 0 20px #4facfe); line-height:1;">
                        ${icons[myMove]}
                    </div>
                </div>

                <div style="font-size:clamp(1.5rem,5vw,2.5rem); color:white; font-weight:bold; font-style:italic;">VS</div>

                <div style="text-align:center;">
                    <div style="font-size:clamp(1rem,3vw,1.4rem); color:#ff4444; margin-bottom:12px;">ENEMY</div>
                    <div style="font-size:clamp(4.5rem,16vw,8rem); filter:drop-shadow(0 0 20px #ff4444); line-height:1;">
                        ${icons[oppMove]}
                    </div>
                </div>
            </div>
            
            <div style="margin-top:40px; min-height: 80px; background: rgba(0,0,0,0.5); padding: 18px 30px; border-radius: 12px; border: 1px solid #555; width:90%;">
                ${narrativeHTML}
            </div>
        </div>
    `;
}
// ==========================================
// 2. 決鬥狀態控制 (修改按鈕標籤與結算延遲)
// ==========================================
function checkDuelState(gameData) {
    const modal = document.getElementById('duel-modal');
    
    if (!gameData.duel) {
        modal.style.display = "none";
        if (duelCountdownInterval) {
            clearInterval(duelCountdownInterval);
            duelCountdownInterval = null;
        }

        // ★ 注意這裡的按鈕加入了 data-choice 屬性
        modal.innerHTML = `
            <h1 style="color:#ff00cc; font-family:'Orbitron'; margin-bottom:8px; font-size:clamp(1.5rem,5vw,2.2rem);">⚔️ DUEL ⚔️</h1>
            <div id="duel-timer" style="font-size: 3rem; color: #ffeb3b; font-weight: bold; margin-bottom: 8px; text-shadow: 0 0 10px #ffeb3b;">5</div>
            <div id="duel-status" style="color:#aaa; margin-bottom:28px; font-size:1.1rem;">選擇你的命運</div>
            
            <div id="rps-buttons" style="display:grid; grid-template-columns:1fr 1fr; gap:clamp(10px,3vw,18px); width:100%; max-width:380px; margin:0 auto;">
                <button class="rps-btn duel-btn-attack" data-choice="attack" onclick="submitDuelChoice('attack')">⚔️<span>攻擊</span><small>剋魔法</small></button>
                <button class="rps-btn duel-btn-magic"  data-choice="magic"  onclick="submitDuelChoice('magic')">✨<span>魔法</span><small>剋陷阱</small></button>
                <button class="rps-btn duel-btn-trap"   data-choice="trap"   onclick="submitDuelChoice('trap')">🪤<span>陷阱</span><small>剋攻擊</small></button>
                <button class="rps-btn duel-btn-defend" data-choice="defend" onclick="submitDuelChoice('defend')">🛡️<span>防禦</span><small>減傷50%</small></button>
            </div>
        `;
        isResolving = false;
        return;
    }

    modal.style.display = "flex";
    const statusText = document.getElementById('duel-status');
    const buttons = document.getElementById('rps-buttons');
    const timerEl = document.getElementById('duel-timer');

    if (gameData.duel.p1_choice && gameData.duel.p2_choice) {
        if (duelCountdownInterval) { clearInterval(duelCountdownInterval); duelCountdownInterval = null; }
        if (timerEl) timerEl.style.display = 'none';

        revealDuelChoices(gameData);

        if (currentRole === "host" && !isResolving) {
            isResolving = true;
            // ★ 將延遲時間從 2000 改為 4000 (讓玩家有 3 秒鐘可以看傷害文字)
            setTimeout(() => {
                resolveDuel(gameData);
            }, 4000); 
        }
    } else {
        if (statusText && buttons) {
            const myChoiceKey = (currentRole === "host") ? "p1_choice" : "p2_choice";
            const myChoice = gameData.duel[myChoiceKey];

            if (myChoice) {
                statusText.innerText = "等待對手出拳...";
                buttons.style.pointerEvents = "none";
                buttons.style.opacity = "0.5";
                if (duelCountdownInterval) { clearInterval(duelCountdownInterval); duelCountdownInterval = null; }
                if (timerEl) timerEl.innerText = "確認";
            } else {
                statusText.innerText = "請出拳！";
                buttons.style.pointerEvents = "auto";
                buttons.style.opacity = "1";

                if (!duelCountdownInterval) {
                    let timeLeft = 5;
                    if (timerEl) { timerEl.style.display = 'block'; timerEl.innerText = timeLeft; }

                    duelCountdownInterval = setInterval(() => {
                        timeLeft--;
                        const tEl = document.getElementById('duel-timer');
                        if (tEl) tEl.innerText = timeLeft;

                        if (timeLeft <= 0) {
                            clearInterval(duelCountdownInterval);
                            duelCountdownInterval = null;
                            const choices = ['attack', 'magic', 'trap', 'defend'];
                            window.submitDuelChoice(choices[Math.floor(Math.random() * 3)]);
                        }
                    }, 1000);
                }
            }
        }
    }
}

// ==========================================
// 1. 提交出拳 (新增視覺回饋)
// ==========================================
window._originalSubmitDuelChoice = window.submitDuelChoice;
window.submitDuelChoice = async function (choice) {
    if (duelCountdownInterval) {
        clearInterval(duelCountdownInterval);
        duelCountdownInterval = null;
    }

    // ★ 視覺回饋：讓玩家知道自己選了什麼
    const btns = document.querySelectorAll('.rps-btn');
    btns.forEach(b => {
        if (b.dataset.choice === choice) {
            // 選中的按鈕：變大、亮綠框、發光
            b.style.border = '4px solid #00ff00';
            b.style.boxShadow = '0 0 20px #00ff00';
            b.style.transform = 'scale(1.1)';
            b.style.background = '#222';
        } else {
            // 沒選中的：變暗、變灰
            b.style.opacity = '0.3';
            b.style.filter = 'grayscale(100%)';
        }
    });

    const choiceKey = (currentRole === "host") ? "p1_choice" : "p2_choice";
    const updatePayload = {};
    updatePayload[`duel/${choiceKey}`] = choice;
    
    // 鎖定按鈕避免連點
    const rpsContainer = document.getElementById('rps-buttons');
    if (rpsContainer) rpsContainer.style.pointerEvents = 'none';
    
    const timerEl = document.getElementById('duel-timer');
    if (timerEl) timerEl.innerText = "已確認";

    await update(ref(db, `games/${currentGameId}`), updatePayload);
}

// js/game.js - 請替換掉原本的 resolveDuel

async function resolveDuel(gameData) {
    console.log("開始結算決鬥...");

    try {
        const p1 = gameData.duel.p1_choice;
        const p2 = gameData.duel.p2_choice;
        const attIdx = gameData.duel.attackerIndex;
        const defIdx = gameData.duel.defenderIndex;

        // ★ 關鍵修正 1：重新複製一份最新的棋盤，確保資料是對的
        // (必須深層複製，避免修改到一半出錯影響畫面)
        let newBoard = JSON.parse(JSON.stringify(currentBoard));

        const attackerChar = newBoard[attIdx];
        const defenderChar = newBoard[defIdx];

        // ★ 關鍵修正 2：防呆檢查
        // 如果找不到棋子 (可能已經被殺掉了或資料不同步)，直接強制解除決鬥，避免卡死
        if (!attackerChar || !defenderChar) {
            console.error("❌ 錯誤：找不到決鬥棋子，強制重置狀態");
            await update(ref(db, `games/${currentGameId}`), { duel: null });
            isResolving = false;
            return;
        }

        // 1. 判斷勝負（攻擊>魔法>陷阱>攻擊，防禦減傷50%）
        const BEATS = { attack: 'magic', magic: 'trap', trap: 'attack' };
        let result = "draw";
        let defenderHalved = false;
        if (p1 === p2) {
            result = "draw";
        } else if (p1 === 'defend' && p2 === 'defend') {
            result = "draw";
        } else if (p1 === 'defend') {
            result = "p2_win"; defenderHalved = true; // p1防禦，p2打出去但傷害減半
        } else if (p2 === 'defend') {
            result = "p1_win"; defenderHalved = true;
        } else if (BEATS[p1] === p2) {
            result = "p1_win";
        } else {
            result = "p2_win";
        }

        console.log(`決鬥判定: ${result} (P1:${p1} vs P2:${p2})`);

        // 2. 處理傷害
        if (result === "draw") {
            // 平手：這裡設定雙方都沒事，或各扣一點血
            console.log("平手，無人受傷");
        } else {
            // 找出贏家與輸家
            let winner = null;
            let loser = null;
            let loserIdx = -1;
            let winnerIdx = -1;

            // 邏輯：先看是 P1 贏還是 P2 贏，再看誰是攻擊者/防守者
            const isP1Winner = (result === "p1_win");
            const winnerId = isP1Winner ? gameData.player1 : gameData.player2;

            if (attackerChar.owner === winnerId) {
                winner = attackerChar; winnerIdx = attIdx;
                loser = defenderChar; loserIdx = defIdx;
            } else {
                winner = defenderChar; winnerIdx = defIdx;
                loser = attackerChar; loserIdx = attIdx;
            }

            // 執行扣血（防禦者減傷 50%）
            let damage = winner.attack || 50;
            if (defenderHalved) damage = Math.floor(damage * 0.5);
            loser.hp -= damage;
            console.log(`造成傷害: ${damage}, 剩餘血量: ${loser.hp}`);

            // 死亡判定
            if (loser.hp <= 0) {
                newBoard[loserIdx] = null; // 移除屍體

                // 進階規則：如果攻擊方贏了，且是用近戰攻擊 (距離1)，可以佔領格子
                // 這裡先簡單做：不佔領，只移除
            }
        }

        // 3. 準備寫入資料庫
        const nextTurn = gameData.player1 === gameData.turn ? gameData.player2 : gameData.player1;
        const updates = {
            board: newBoard,
            duel: null, // ★ 解除決鬥狀態 (這行最重要，這行執行了畫面才會動)
            turn: nextTurn,
            turn_start_time: Date.now()
        };

        // 4. 順便檢查遊戲是否結束
        const gameWinner = checkGameOver(newBoard, gameData);
        if (gameWinner) {
            updates.status = "finished";
            updates.winner = gameWinner;
        }

        await update(ref(db, `games/${currentGameId}`), updates);
        console.log("✅ 決鬥結算完畢");

    } catch (e) {
        console.error("❌ 決鬥結算發生嚴重錯誤:", e);
        // ★ 救命機制：發生錯誤時，強制把 duel 設為 null，不然會永遠卡住
        await update(ref(db, `games/${currentGameId}`), { duel: null });
    } finally {
        isResolving = false; // 解除鎖定
    }
}
// 檢查是否有一方死光了
function checkGameOver(board, gameData) {
    // 計算雙方存活棋子數
    const p1Units = board.filter(c => c && c.owner === gameData.player1);
    const p2Units = board.filter(c => c && c.owner === gameData.player2);

    if (p1Units.length === 0) return gameData.player2; // P1 全滅 -> P2 贏
    if (p2Units.length === 0) return gameData.player1; // P2 全滅 -> P1 贏

    return null; // 還沒結束
}

// 顯示結算畫面並發獎勵
async function handleGameEnd(winnerUid) {
    // 防止重複執行 (如果畫面已經出來了就跳過)
    if (document.getElementById('game-over-modal')) return;

    const myUid = auth.currentUser.uid;
    const isWinner = (myUid === winnerUid);
    const reward = isWinner ? 100 : 50;

    // 1. 建立結算畫面 HTML
    const modal = document.createElement('div');
    modal.id = 'game-over-modal';
    modal.style.display = 'flex';
    modal.innerHTML = `
        <div class="result-title ${isWinner ? 'victory' : 'defeat'}">
            ${isWinner ? 'VICTORY' : 'DEFEAT'}
        </div>
        
        <div class="reward-box">
            <div style="color:#aaa; font-size:0.9rem; margin-bottom:5px;">BATTLE REWARDS</div>
            <div class="reward-coins">
                <span>💰</span> <span>+${reward}</span>
            </div>
        </div>

        <button class="home-btn" onclick="location.reload()">RETURN TO LOBBY</button>
    `;
    document.body.appendChild(modal);

    // 2. 發放獎勵 (寫入資料庫)
    // 每個玩家只負責領自己的錢，避免權限問題
    try {
        const userRef = ref(db, `users/${myUid}`);
        const snapshot = await get(userRef);
        const currentCoins = snapshot.val()?.coins || 0;

        await update(userRef, {
            coins: currentCoins + reward
        });
        console.log(`結算完畢：獲得 ${reward} 金幣`);
    } catch (e) {
        console.error("獎勵發放失敗:", e);
    }

}
