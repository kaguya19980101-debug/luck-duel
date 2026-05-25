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
        `;

        // 顯示選取框 (黃色)
        if (realIndex === selectedIndex) {
            div.style.border = '2px solid #ffff00';
            div.style.boxShadow = '0 0 15px rgba(255, 255, 0, 0.6)';
            div.style.zIndex = '5'; // 選取時浮上來一點
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
            const borderColor = isMine ? '#4facfe' : '#ff4444'; // 我方藍，敵方紅
            const hpColor = isMine ? '#00ff00' : '#ff0000';     // 我方綠血，敵方紅血

            // 設定這格子的外框，用來區分敵我
            if (realIndex !== selectedIndex) { // 如果沒有被選取，就顯示敵我外框
                div.style.border = `2px solid ${borderColor}`;
            }

            // 塞入 HTML 結構 (套用 CSS 寫好的 .battle-card 樣式)
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
async function handleSquareClick(index, cell, gameData) {
    if (gameData.duel) return; // 決鬥中鎖定
    if (gameData.turn !== myUid) return; // 非回合鎖定

    // 1. 選取邏輯
    if (selectedIndex === -1) {
        if (cell && cell.owner === myUid) {
            selectedIndex = index;
            renderBoard(gameData);
        }
        return;
    }

    // 2. 移動邏輯
    const fromIndex = selectedIndex;
    const toIndex = index;

    // 取消選取
    if (fromIndex === toIndex) {
        selectedIndex = -1;
        renderBoard(gameData);
        return;
    }

    // 距離檢查 (這裡簡化，只要不是太遠都行，您可以自己加嚴格判斷)
    const diff = Math.abs(fromIndex - toIndex);
    // 檢查是否是上下左右 (差1且同列，或差5)
    // 簡單防呆：不能跨行瞬移 (例如從第4格跳到第5格)
    const isSameRow = Math.floor(fromIndex / 5) === Math.floor(toIndex / 5);
    const validMove = (diff === 1 && isSameRow) || diff === 5;

    if (!validMove) {
        selectedIndex = -1; // 點錯位置就取消選取
        renderBoard(gameData);
        return;
    }

    const newBoard = [...currentBoard];
    const attacker = newBoard[fromIndex];
    const defender = newBoard[toIndex];

    if (!defender) {
        // A. 移動到空格
        newBoard[toIndex] = attacker;
        newBoard[fromIndex] = null;
        await commitMove(newBoard, gameData);
        selectedIndex = -1;
    } else if (defender.owner !== myUid) {
        // B. 碰到敵人 -> 觸發決鬥 (只有點擊敵人才會觸發，相鄰不會自動觸發)
        await triggerDuel(fromIndex, toIndex);
        selectedIndex = -1;
    }
}

// 寫入移動
async function commitMove(newBoard, gameData) {
    const nextTurn = gameData.player1 === myUid ? gameData.player2 : gameData.player1;

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
    const icons = { 'rock': '✊', 'paper': '✋', 'scissors': '✌️' };

    const amIP1 = (currentRole === 'host');
    const myMove = amIP1 ? p1Choice : p2Choice;
    const oppMove = amIP1 ? p2Choice : p1Choice;

    // --- 計算勝負與文字 ---
    const attIdx = gameData.duel.attackerIndex;
    const defIdx = gameData.duel.defenderIndex;
    const attackerChar = currentBoard[attIdx] || {};
    const defenderChar = currentBoard[defIdx] || {};
    
    // 1. 判斷誰贏了猜拳
    let result = "draw";
    if (p1Choice === p2Choice) result = "draw";
    else if (
        (p1Choice === "rock" && p2Choice === "scissors") ||
        (p1Choice === "paper" && p2Choice === "rock") ||
        (p1Choice === "scissors" && p2Choice === "paper")
    ) {
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
            
            <div id="rps-buttons" style="display:flex; justify-content:center; gap:clamp(16px,5vw,30px); width:100%; flex-wrap:wrap;">
                <button class="rps-btn" data-choice="rock" onclick="submitDuelChoice('rock')" style="width:clamp(90px,22vw,110px); height:clamp(90px,22vw,110px); font-size:clamp(3rem,9vw,4rem); display:flex; justify-content:center; align-items:center; background:#333; border:3px solid #555; border-radius:50%; cursor:pointer; padding:0; box-shadow: 0 5px 15px rgba(0,0,0,0.5); transition:all 0.2s;">✊</button>
                <button class="rps-btn" data-choice="paper" onclick="submitDuelChoice('paper')" style="width:clamp(90px,22vw,110px); height:clamp(90px,22vw,110px); font-size:clamp(3rem,9vw,4rem); display:flex; justify-content:center; align-items:center; background:#333; border:3px solid #555; border-radius:50%; cursor:pointer; padding:0; box-shadow: 0 5px 15px rgba(0,0,0,0.5); transition:all 0.2s;">✋</button>
                <button class="rps-btn" data-choice="scissors" onclick="submitDuelChoice('scissors')" style="width:clamp(90px,22vw,110px); height:clamp(90px,22vw,110px); font-size:clamp(3rem,9vw,4rem); display:flex; justify-content:center; align-items:center; background:#333; border:3px solid #555; border-radius:50%; cursor:pointer; padding:0; box-shadow: 0 5px 15px rgba(0,0,0,0.5); transition:all 0.2s;">✌️</button>
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
                            const choices = ['rock', 'paper', 'scissors'];
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

        // 1. 判斷勝負 (p1 是 Host, p2 是 Joiner)
        let result = "draw";
        if (p1 === p2) result = "draw";
        else if (
            (p1 === "rock" && p2 === "scissors") ||
            (p1 === "paper" && p2 === "rock") ||
            (p1 === "scissors" && p2 === "paper")
        ) {
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

            // 執行扣血 (讀取攻擊力，如果沒有就預設 50)
            // ★ 屬性相剋可以在這裡加 (目前先做基礎傷害)
            const damage = winner.attack || 50;
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
