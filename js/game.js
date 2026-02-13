// js/game.js (修復版)
import { db, auth } from "./firebase-config.js";
import { ref, update, onValue } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

let currentGameId = null;
let currentRole = null; // "host" or "joiner"
let currentBoard = [];
let myUid = null;
let selectedIndex = -1;
let timerInterval = null;
let isResolving = false; // 防止重複結算

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
                gap: 4px; width: 100%; max-width: 450px; aspect-ratio: 5/6;
                background: #2b2b2b; padding: 6px; border-radius: 12px;
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
function renderBoard(gameData) {
    const boardEl = document.getElementById('chess-board');
    boardEl.innerHTML = '';

    // 1. 判斷是否需要翻轉視角
    // 規則：如果我是房主(P1)，因為我的棋子在 Array 的 0-4 (上面)，
    // 為了讓我在下面，我要把畫面倒過來畫。
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

    // 2. 開始畫 30 個格子
    // visualIndex 是「螢幕上」的順序：0(左上) -> 29(右下)
    for (let visualIndex = 0; visualIndex < 30; visualIndex++) {

        // 3. 算出「真實資料」是第幾格
        // 如果翻轉：螢幕第 0 格 (左上) = 資料第 29 格
        // 如果不翻：螢幕第 0 格 (左上) = 資料第 0 格
        const realIndex = shouldFlip ? (29 - visualIndex) : visualIndex;

        const cell = currentBoard[realIndex];
        const div = document.createElement('div');

        // 保持格子正方形與美觀
        div.style.cssText = `
            width: 100%;
            aspect-ratio: 1 / 1;
            border-radius: 8px; 
            position: relative;
            display: flex; justify-content: center; align-items: center; 
            cursor: pointer;
            box-shadow: inset 0 0 5px rgba(0,0,0,0.5);
            background: #262626; /* 空格子的顏色 */
            border: 1px solid #333;
        `;

        // 顯示選取框 (黃色)
        if (realIndex === selectedIndex) {
            div.style.border = '2px solid #ffff00';
            div.style.boxShadow = '0 0 15px rgba(255, 255, 0, 0.6)';
        }

        // 4. 如果這格有棋子，畫出來
        if (cell) {
            const isMine = cell.owner === myUid;

            // ★ 顏色設定：自己永遠是藍底，敵人永遠是紅底
            // 這樣最直覺，不用管 P1 P2
            div.style.background = isMine ?
                "linear-gradient(135deg, #1cb5e0, #000046)" : // 我: 藍色系
                "linear-gradient(135deg, #ee0979, #ff6a00)"; // 敵: 紅色系

            div.innerHTML = `
                <div style="text-align:center; width:100%; pointer-events:none;">
                    <div style="font-size:1.5rem; text-shadow: 0 2px 5px rgba(0,0,0,0.8);">
                        ${cell.attribute === 'fire' ? '🔥' : cell.attribute === 'water' ? '💧' : '🌿'}
                    </div>
                    
                    <div style="background:rgba(0,0,0,0.6); height:6px; width:80%; margin: 2px auto; border-radius:3px; overflow:hidden; border:1px solid rgba(255,255,255,0.2);">
                        <div style="background:${isMine ? '#00ff00' : '#ff0000'}; height:100%; width:${(cell.hp / cell.max_hp) * 100}%"></div>
                    </div>
                    
                    <div style="font-size:0.7rem; color:white; font-weight:bold; text-shadow:0 0 2px black;">${cell.hp}</div>
                </div>
            `;
        }

        // ★ 5. 點擊事件：一定要傳入 realIndex，不能傳 visualIndex
        // 這樣點擊下方棋子時，程式才知道你點的是陣列裡的哪一個
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
// 1. 新增揭曉函式 (負責動畫)
function revealDuelChoices(gameData) {
    const modal = document.getElementById('duel-modal');
    // 取得雙方出的拳
    const p1Choice = gameData.duel.p1_choice;
    const p2Choice = gameData.duel.p2_choice;

    // 定義圖示
    const icons = { 'rock': '✊', 'paper': '✋', 'scissors': '✌️' };

    // 判斷我是 P1 還是 P2，來決定顯示位置 (左邊是我，右邊是對手)
    const amIP1 = (currentRole === 'host');
    const myMove = amIP1 ? p1Choice : p2Choice;
    const oppMove = amIP1 ? p2Choice : p1Choice;

    // 修改 Modal 內容為揭曉畫面
    modal.innerHTML = `
        <div style="display:flex; flex-direction:column; align-items:center; width:100%;">
            <h1 style="color:#ff00cc; font-family:'Orbitron'; margin-bottom:20px; text-shadow:0 0 10px #ff00cc;">⚔️ 決鬥揭曉 ⚔️</h1>
            
            <div style="display:flex; justify-content:space-around; width:100%; align-items:center;">
                <div style="text-align:center;">
                    <div style="font-size:1.2rem; color:#4facfe; margin-bottom:10px;">YOU</div>
                    <div class="move-icon bounce-in" style="font-size:5rem; filter:drop-shadow(0 0 15px #4facfe);">
                        ${icons[myMove]}
                    </div>
                </div>

                <div style="font-size:2rem; color:white; font-weight:bold; font-style:italic;">VS</div>

                <div style="text-align:center;">
                    <div style="font-size:1.2rem; color:#ff4444; margin-bottom:10px;">ENEMY</div>
                    <div class="move-icon bounce-in" style="font-size:5rem; filter:drop-shadow(0 0 15px #ff4444); animation-delay:0.3s;">
                        ${icons[oppMove]}
                    </div>
                </div>
            </div>
            
            <div style="margin-top:30px; color:#ffd700; font-size:1.2rem; letter-spacing:2px;">
                計算傷害中...
            </div>
        </div>
    `;
}
function checkDuelState(gameData) {
    const modal = document.getElementById('duel-modal');
    if (!gameData.duel) {
        modal.style.display = "none";
        // ★ 重置內容，下次打開才會有按鈕
        modal.innerHTML = `
            <h1 style="color:#ff00cc; font-family:'Orbitron'; margin-bottom:10px;">⚔️ DUEL ⚔️</h1>
            <div id="duel-status" style="color:#aaa; margin-bottom:30px;">選擇你的命運</div>
            <div id="rps-buttons" style="display:flex; gap:20px;">
                <button class="rps-btn" onclick="submitDuelChoice('rock')" style="font-size:3rem; padding:20px; background:#333; border:2px solid #555; border-radius:50%; cursor:pointer;">✊</button>
                <button class="rps-btn" onclick="submitDuelChoice('paper')" style="font-size:3rem; padding:20px; background:#333; border:2px solid #555; border-radius:50%; cursor:pointer;">✋</button>
                <button class="rps-btn" onclick="submitDuelChoice('scissors')" style="font-size:3rem; padding:20px; background:#333; border:2px solid #555; border-radius:50%; cursor:pointer;">✌️</button>
            </div>
        `;
        isResolving = false;
        return;
    }

    // 顯示視窗
    modal.style.display = "flex";
    const statusText = document.getElementById('duel-status');

    // 如果雙方都出拳了
    if (gameData.duel.p1_choice && gameData.duel.p2_choice) {
        // ★ 呼叫揭曉動畫
        revealDuelChoices(gameData);

        // ★ Host 負責結算 (延遲 2 秒讓動畫跑完)
        if (currentRole === "host" && !isResolving) {
            isResolving = true;
            setTimeout(() => {
                resolveDuel(gameData); // 這裡接您原本提供的 resolveDuel 函式
            }, 2000);
        }
    } else {
        // 1. 先抓取文字標籤
        const statusText = document.getElementById('duel-status');
        const buttons = document.getElementById('rps-buttons');

        // 2. ★ 第一層檢查：確保網頁上有這個標籤 (我的防呆)
        if (statusText && buttons) {

            // 3. ★ 第二層檢查：您的邏輯 (檢查出拳了沒)
            const myChoiceKey = (currentRole === "host") ? "p1_choice" : "p2_choice";
            const myChoice = gameData.duel[myChoiceKey];

            if (myChoice) {
                // A. 已經出拳了 -> 顯示等待中，並鎖定按鈕
                statusText.innerText = "等待對手出拳...";
                buttons.style.pointerEvents = "none";
                buttons.style.opacity = "0.5";
            } else {
                // B. 還沒出拳 -> 提示請出拳，並解鎖按鈕
                statusText.innerText = "請出拳！";
                buttons.style.pointerEvents = "auto";
                buttons.style.opacity = "1";
            }
        }
    }
}

// 3. 確保 submitDuelChoice 是全域可呼叫 (因為用了 onclick字串)
window.submitDuelChoice = async function (choice) {
    const choiceKey = (currentRole === "host") ? "p1_choice" : "p2_choice";
    const updatePayload = {};
    updatePayload[`duel/${choiceKey}`] = choice;
    // 鎖定按鈕避免連點
    const btns = document.getElementById('rps-buttons');
    if (btns) btns.style.pointerEvents = 'none';

    await update(ref(db, `games/${currentGameId}`), updatePayload);
}

// ★★★ 決鬥結算邏輯 (解決卡住問題) ★★★
async function resolveDuel(gameData) {
    const p1 = gameData.duel.p1_choice;
    const p2 = gameData.duel.p2_choice;

    // 判斷勝負 (Host角度)
    // p1 是 Host, p2 是 Joiner
    // win: 1贏, lose: 2贏, draw: 平手
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

    // 處理傷害
    let newBoard = [...currentBoard]; // 複製棋盤
    // 注意：Firebase 傳回來的 board 已經被我們轉成 Array 了，但這裡是計算邏輯，要確保用的是最新的
    // 最安全的做法是直接操作傳進來的 gameData.board (如果是物件要轉陣列)
    // 這裡為了簡化，直接操作全域 currentBoard

    const attIdx = gameData.duel.attackerIndex;
    const defIdx = gameData.duel.defenderIndex;

    // 誰是攻擊者？根據 turn 判斷 (如果是 Host 回合，那 Host 就是攻擊者)
    // 簡單起見，我們直接看棋盤上的 owner
    const attackerChar = newBoard[attIdx];
    const defenderChar = newBoard[defIdx];

    let winner = null;
    let loser = null;
    let loserIdx = -1;

    // 判定誰贏誰輸
    if (result === "draw") {
        // 平手：扣雙方血 (或沒事)
        // 這裡設定：平手兩邊都沒事，直接結束決鬥
    } else {
        // 找出誰贏了
        const hostIsP1 = true; // 這裡假設 p1 是 host
        if (result === "p1_win") {
            // P1 贏了
            // 檢查 P1 是攻擊者還是防守者?
            if (attackerChar.owner === gameData.player1) {
                // P1 是攻擊者且贏了 -> P2 扣血
                winner = attackerChar;
                loser = defenderChar;
                loserIdx = defIdx;
            } else {
                // P1 是防守者且贏了 -> P2 (攻擊者) 扣血
                winner = defenderChar;
                loser = attackerChar;
                loserIdx = attIdx;
            }
        } else {
            // P2 贏了
            if (attackerChar.owner === gameData.player2) {
                winner = attackerChar;
                loser = defenderChar;
                loserIdx = defIdx;
            } else {
                winner = defenderChar;
                loser = attackerChar;
                loserIdx = attIdx;
            }
        }

        // 確保 attack 有值，沒有就用 50
        const damage = (winner === attackerChar) ? (attackerChar.attack || 50) : (defenderChar.attack || 50);
        loser.hp -= damage;

        console.log(`決鬥結果: 贏家造成 ${damage} 傷害`);

        // 死亡判定
        if (loser.hp <= 0) {
            newBoard[loserIdx] = null; // 移除棋子
            // 如果贏家是攻擊者，可以佔領格子
            if (winner === attackerChar) {
                newBoard[defIdx] = attackerChar;
                newBoard[attIdx] = null;
            }
        }
        const nextTurn = gameData.player1 === gameData.turn ? gameData.player2 : gameData.player1;

        // 1. 準備更新資料
        const updates = {
            board: newBoard,
            duel: null, // 解除決鬥
            turn: nextTurn,
            turn_start_time: Date.now()
        };

        // 2. ★ 檢查決鬥後是否有人死光了 ★
        const winner = checkGameOver(newBoard, gameData);
        if (winner) {
            updates.status = "finished";
            updates.winner = winner;
        }

        // 3. 寫入 Firebase
        await update(ref(db, `games/${currentGameId}`), updates);
    }

    // 寫入資料庫，並解除決鬥狀態 (null)
    const nextTurn = gameData.player1 === gameData.turn ? gameData.player2 : gameData.player1;

    await update(ref(db, `games/${currentGameId}`), {
        board: newBoard,
        duel: null, // ★ 解除決鬥視窗
        turn: nextTurn, // 換人
        turn_start_time: Date.now()
    });
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