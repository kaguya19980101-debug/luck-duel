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

// 初始化
export function initGameBoard(gameId, role) {
    currentGameId = gameId;
    currentRole = role; // 記住我是房主還是加入者
    myUid = auth.currentUser.uid;
    isResolving = false;

    const gameArea = document.querySelector('.game-frame');
    
    // 1. UI 結構 (修復比例問題)
    gameArea.innerHTML = `
        <div id="game-info" style="margin-bottom:10px; display:flex; justify-content:space-between; color:white; font-family:'Orbitron', sans-serif;">
            <span id="turn-text" style="font-weight:bold;">等待同步...</span>
            <span id="timer-text" style="color:#ff4444; font-weight:bold; font-size:1.2rem;">30s</span>
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
            <h1 style="color:#ff00cc; font-family:'Orbitron'; margin-bottom:10px;">⚔️ DUEL ⚔️</h1>
            <div id="duel-status" style="color:#aaa; margin-bottom:30px;">選擇你的命運</div>
            
            <div id="rps-buttons" style="display:flex; gap:20px;">
                <button class="rps-btn" data-choice="rock" style="font-size:3rem; padding:20px; background:#333; border:2px solid #555; border-radius:50%; cursor:pointer;">✊</button>
                <button class="rps-btn" data-choice="paper" style="font-size:3rem; padding:20px; background:#333; border:2px solid #555; border-radius:50%; cursor:pointer;">✋</button>
                <button class="rps-btn" data-choice="scissors" style="font-size:3rem; padding:20px; background:#333; border:2px solid #555; border-radius:50%; cursor:pointer;">✌️</button>
            </div>
            <div id="duel-result" style="margin-top:20px; font-size:1.5rem; color:#ffd700; height:30px;"></div>
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
    if(turnText) {
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
                        <div style="background:${isMine ? '#00ff00' : '#ff0000'}; height:100%; width:${(cell.hp/cell.max_hp)*100}%"></div>
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
    const isSameRow = Math.floor(fromIndex/5) === Math.floor(toIndex/5);
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
    // 簡單換人邏輯
    const nextTurn = gameData.player1 === myUid ? gameData.player2 : gameData.player1;
    
    await update(ref(db, `games/${currentGameId}`), {
        board: newBoard,
        turn: nextTurn,
        turn_start_time: Date.now()
    });
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

function checkDuelState(gameData) {
    const modal = document.getElementById('duel-modal');
    if (!gameData.duel) {
        modal.style.display = "none";
        isResolving = false;
        return;
    }

    // 顯示視窗
    modal.style.display = "flex";
    const statusText = document.getElementById('duel-status');
    
    // 狀態顯示更新
    if (gameData.duel.p1_choice && gameData.duel.p2_choice) {
        statusText.innerText = "雙方已出拳！計算中...";
        // ★ 關鍵：只有房主 (Host) 負責計算結果，避免打架
        if (currentRole === "host" && !isResolving) {
            isResolving = true;
            setTimeout(() => resolveDuel(gameData), 1000); // 延遲1秒讓玩家看到結果
        }
    } else {
        // 檢查自己出拳沒
        const myChoiceKey = (currentRole === "host") ? "p1_choice" : "p2_choice";
        const myChoice = gameData.duel[myChoiceKey];
        if (myChoice) {
            statusText.innerText = "等待對手出拳...";
            document.getElementById('rps-buttons').style.pointerEvents = "none"; // 鎖定按鈕
            document.getElementById('rps-buttons').style.opacity = "0.5";
        } else {
            statusText.innerText = "請出拳！";
            document.getElementById('rps-buttons').style.pointerEvents = "auto";
            document.getElementById('rps-buttons').style.opacity = "1";
        }
    }
}

async function submitDuelChoice(choice) {
    const choiceKey = (currentRole === "host") ? "p1_choice" : "p2_choice";
    const updatePayload = {};
    updatePayload[`duel/${choiceKey}`] = choice;
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

        // 執行扣血
        const damage = 300; // 固定傷害，之後可讀取 attack 數值
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