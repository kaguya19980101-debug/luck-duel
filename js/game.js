// js/game.js
// ==========================================
// 線上對戰模式（PvP via Firebase）
// CPU 模式請見 cpu.js
// 棋盤渲染/UI 請見 board.js
// 狀態管理請見 state.js
// ==========================================

import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { ref, get, update, set, onValue, remove, off, onDisconnect } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { gameState, getBattleAttr, CPU_UID } from "./state.js";
import { buildGameUI, renderBoard, updateTimer, showActionMenu, closeActionMenu, closeCardInfo, setBoardCallbacks, showDuelAnimation } from "./board.js";

// ==========================================
// 線上模式：board.js 回呼注入
// ==========================================
function _initBoardCallbacks() {
    setBoardCallbacks({
        onMove: async (from, to, newBoard, gameData) => {
            await commitMove(newBoard, gameData);
        },
        onDuel: async (fromIdx, toIdx, gameData) => {
            await triggerDuel(fromIdx, toIdx);
        },
        onSkill: (index, cell, gameData) => {
            alert(`【${cell.active.name}】\n${cell.active.desc}`);
        },
        onTurnTimeout: async (gameData) => {
            // 時間到：自動跳過，寫入 Firebase 換回合
            if (gameState.isCpuMode) return;
            const nextTurn = gameData.player1 === gameState.myUid ? gameData.player2 : gameData.player1;
            const { ref: dbRef, update: dbUpdate } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js');
            await dbUpdate(dbRef(db, `games/${gameState.gameId}`), {
                turn: nextTurn,
                turn_start_time: Date.now()
            });
        },
    });
}

export function initGameBoard(gameId, role) {
    gameState.gameId = gameId;
    gameState.role = role;
    gameState.myUid = auth.currentUser.uid;
    gameState.isResolving = false;
    _initBoardCallbacks();

    const gameArea = document.querySelector('.game-frame');
    buildGameUI(gameArea); // ★ 統一用 board.js 的 buildGameUI，不重複寫 HTML

    // 監聽 Firebase
    const gameRef = ref(db, `games/${gameId}`);

    // ★ 斷線自動刪除 game（onDisconnect）
    onDisconnect(gameRef).remove();
    onValue(gameRef, (snapshot) => {
        const gameData = snapshot.val();
        if (!gameData) return;

        // 對手斷線：game 節點被刪除
        if (!snapshot.exists()) {
            _showDisconnectNotice('對手已離線，對局取消');
            return;
        }

        // --- ★ 新增這段：檢查遊戲是否結束 ★ ---
        if (gameData.status === "finished" && gameData.winner) {
            handleGameEnd(gameData.winner);
            return; // 結束後就不再渲染棋盤了
        }
        // 資料格式轉換 (防止 forEach error)
        if (gameData.board && !Array.isArray(gameData.board)) {
            gameState.board = new Array(30).fill(null);
            Object.keys(gameData.board).forEach(key => {
                gameState.board[key] = gameData.board[key];
            });
        } else {
            gameState.board = gameData.board || new Array(30).fill(null);
        }

        renderBoard(gameData);
        updateTimer(gameData);
        checkDuelState(gameData);
    });
}

// 渲染棋盤
// 渲染棋盤
async function commitMove(newBoard, gameData) {
    const nextTurn = gameData.player1 === gameState.myUid ? gameData.player2 : gameData.player1;
    gameState.actionUsed = false; // 換回合重置

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

    // 3. 寫入 Firebase（CPU 模式不寫入）
    if (gameState.isCpuMode) return;
    await update(ref(db, `games/${gameState.gameId}`), updates);
}

// 計時器修正
async function triggerDuel(attackerIdx, defenderIdx) {
    if (gameState.isCpuMode) return; // CPU 模式不寫入 Firebase
    await update(ref(db, `games/${gameState.gameId}`), {
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
export function revealDuelChoices(gameData) {
    const modal = document.getElementById('duel-modal');
    const p1Choice = gameData.duel.p1_choice;
    const p2Choice = gameData.duel.p2_choice;
    const icons = { 'attack': '⚔️', 'magic': '✨', 'trap': '🪤', 'defend': '🛡️' };

    // 線上模式：host 是 p1。CPU 模式：玩家固定是 p2（CPU 是 p1）
    const amIP1 = gameState.isCpuMode ? false : (gameState.role === 'host');
    const myMove = amIP1 ? p1Choice : p2Choice;
    const oppMove = amIP1 ? p2Choice : p1Choice;

    // --- 計算勝負與文字 ---
    const attIdx = gameData.duel.attackerIndex;
    const defIdx = gameData.duel.defenderIndex;
    const attackerChar = gameState.board[attIdx] || {};
    const defenderChar = gameState.board[defIdx] || {};
    
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
        
        // 找出我的角色 (看 owner 是不是 gameState.myUid)
        const myChar = (attackerChar.owner === gameState.myUid) ? attackerChar : defenderChar;
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
    // 播放動畫
    const _attIdx = gameData.duel?.attackerIndex;
    const _defIdx = gameData.duel?.defenderIndex;
    if (_attIdx !== undefined && _defIdx !== undefined) {
        const _isAttWin = (result === 'p1_win' && amIP1) || (result === 'p2_win' && !amIP1);
        showDuelAnimation(
            _isAttWin ? _attIdx : _defIdx,
            _isAttWin ? _defIdx : _attIdx
        );
    }

    modal.innerHTML = `
        <style>
            @keyframes fadeIn { from{opacity:0;transform:translateY(10px)} to{opacity:1;transform:translateY(0)} }
            @keyframes attackPulse { 0%{transform:scale(1)} 30%{transform:scale(1.2)} 60%{transform:scale(0.95)} 100%{transform:scale(1)} }
        </style>
        <div style="display:flex;flex-direction:column;align-items:center;width:100%;text-align:center;max-width:400px;margin:0 auto;gap:8px;">
            <h1 style="color:#ff00cc;font-family:'Orbitron';text-shadow:0 0 10px #ff00cc;font-size:clamp(1.1rem,4vw,1.6rem);margin:0 0 6px;">⚔️ 決鬥揭曉 ⚔️</h1>

            <!-- YOU -->
            <div style="display:flex;align-items:center;justify-content:space-between;width:100%;background:rgba(79,172,254,0.08);border:1px solid rgba(79,172,254,0.3);border-radius:14px;padding:10px 16px;">
                <div style="font-size:clamp(0.9rem,3vw,1.1rem);color:#4facfe;font-weight:bold;min-width:60px;text-align:left;">YOU</div>
                <div style="font-size:clamp(2.5rem,10vw,4rem);line-height:1;filter:drop-shadow(0 0 12px #4facfe);animation:attackPulse 0.5s ease 0.3s both;">
                    ${icons[myMove]}
                </div>
                <div style="font-size:0.75rem;color:#4facfe;min-width:60px;text-align:right;opacity:0.7;">${myMove === 'attack' ? '剋魔法' : myMove === 'magic' ? '剋陷阱' : myMove === 'trap' ? '剋攻擊' : '減傷50%'}</div>
            </div>

            <!-- VS -->
            <div style="font-size:1rem;color:#475569;font-weight:bold;letter-spacing:4px;">VS</div>

            <!-- ENEMY -->
            <div style="display:flex;align-items:center;justify-content:space-between;width:100%;background:rgba(255,68,68,0.08);border:1px solid rgba(255,68,68,0.3);border-radius:14px;padding:10px 16px;">
                <div style="font-size:clamp(0.9rem,3vw,1.1rem);color:#ff4444;font-weight:bold;min-width:60px;text-align:left;">ENEMY</div>
                <div style="font-size:clamp(2.5rem,10vw,4rem);line-height:1;filter:drop-shadow(0 0 12px #ff4444);animation:attackPulse 0.5s ease 0.5s both;">
                    ${icons[oppMove]}
                </div>
                <div style="font-size:0.75rem;color:#ff4444;min-width:60px;text-align:right;opacity:0.7;">${oppMove === 'attack' ? '剋魔法' : oppMove === 'magic' ? '剋陷阱' : oppMove === 'trap' ? '剋攻擊' : '減傷50%'}</div>
            </div>

            <!-- 結果 -->
            <div style="width:100%;background:rgba(0,0,0,0.4);padding:14px 16px;border-radius:12px;border:1px solid #334155;animation:fadeIn 0.4s ease 0.8s both;opacity:0;">
                ${narrativeHTML}
            </div>
        </div>
    `;

    // 揭曉時用 fixed overlay 覆蓋全螢幕，不影響 in-flow 的 duel-modal
    let revealOverlay = document.getElementById('duel-reveal-overlay');
    if (!revealOverlay) {
        revealOverlay = document.createElement('div');
        revealOverlay.id = 'duel-reveal-overlay';
        revealOverlay.style.cssText = `
            position:fixed;inset:0;background:rgba(0,0,0,0.92);
            z-index:99998;display:flex;align-items:center;justify-content:center;
            padding:20px;box-sizing:border-box;
        `;
        document.body.appendChild(revealOverlay);
    }
    revealOverlay.innerHTML = modal.innerHTML;
    revealOverlay.style.display = 'flex';
    modal.style.display = 'none'; // 隱藏 in-flow modal，改用 overlay

    // 3.5 秒後關閉揭曉 overlay
    setTimeout(() => {
        const el = document.getElementById('duel-reveal-overlay');
        if (el) el.style.display = 'none';
    }, 3500);
}
// ==========================================
// 2. 決鬥狀態控制 (修改按鈕標籤與結算延遲)
// ==========================================
function checkDuelState(gameData) {
    const modal = document.getElementById('duel-modal');
    
    if (!gameData.duel) {
        modal.style.display = "none";
        if (gameState.duelCountdownInterval) {
            clearInterval(gameState.duelCountdownInterval);
            gameState.duelCountdownInterval = null;
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
        gameState.isResolving = false;
        return;
    }

    modal.style.display = "flex";
    const statusText = document.getElementById('duel-status');
    const buttons = document.getElementById('rps-buttons');
    const timerEl = document.getElementById('duel-timer');

    if (gameData.duel.p1_choice && gameData.duel.p2_choice) {
        if (gameState.duelCountdownInterval) { clearInterval(gameState.duelCountdownInterval); gameState.duelCountdownInterval = null; }
        if (timerEl) timerEl.style.display = 'none';

        revealDuelChoices(gameData);

        if (gameState.role === "host" && !gameState.isResolving) {
            gameState.isResolving = true;
            // ★ 將延遲時間從 2000 改為 4000 (讓玩家有 3 秒鐘可以看傷害文字)
            setTimeout(() => {
                resolveDuel(gameData);
            }, 4000); 
        }
    } else {
        if (statusText && buttons) {
            const myChoiceKey = (gameState.role === "host") ? "p1_choice" : "p2_choice";
            const myChoice = gameData.duel[myChoiceKey];

            if (myChoice) {
                statusText.innerText = "等待對手出拳...";
                buttons.style.pointerEvents = "none";
                buttons.style.opacity = "0.5";
                if (gameState.duelCountdownInterval) { clearInterval(gameState.duelCountdownInterval); gameState.duelCountdownInterval = null; }
                if (timerEl) timerEl.innerText = "確認";
            } else {
                statusText.innerText = "請出拳！";
                buttons.style.pointerEvents = "auto";
                buttons.style.opacity = "1";

                if (!gameState.duelCountdownInterval) {
                    let timeLeft = 10;
                    if (timerEl) { timerEl.style.display = 'block'; timerEl.innerText = timeLeft; }

                    gameState.duelCountdownInterval = setInterval(() => {
                        timeLeft--;
                        const tEl = document.getElementById('duel-timer');
                        if (tEl) tEl.innerText = timeLeft;

                        if (timeLeft <= 0) {
                            clearInterval(gameState.duelCountdownInterval);
                            gameState.duelCountdownInterval = null;
                            const choices = ['attack', 'magic', 'trap', 'defend'];
                            window.submitDuelChoice(choices[Math.floor(Math.random() * 4)]);
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
// ==========================================
// 1. 提交出拳 (線上模式)
// ==========================================
window.submitDuelChoice = async function (choice) {
    if (gameState.duelCountdownInterval) {
        clearInterval(gameState.duelCountdownInterval);
        gameState.duelCountdownInterval = null;
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

    const choiceKey = (gameState.role === "host") ? "p1_choice" : "p2_choice";
    const updatePayload = {};
    updatePayload[`duel/${choiceKey}`] = choice;
    
    // 鎖定按鈕避免連點
    const rpsContainer = document.getElementById('rps-buttons');
    if (rpsContainer) rpsContainer.style.pointerEvents = 'none';
    
    const timerEl = document.getElementById('duel-timer');
    if (timerEl) timerEl.innerText = "已確認";

    if (gameState.isCpuMode) return;
    await update(ref(db, `games/${gameState.gameId}`), updatePayload);
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
        let newBoard = JSON.parse(JSON.stringify(gameState.board));

        const attackerChar = newBoard[attIdx];
        const defenderChar = newBoard[defIdx];

        // ★ 關鍵修正 2：防呆檢查
        // 如果找不到棋子 (可能已經被殺掉了或資料不同步)，直接強制解除決鬥，避免卡死
        if (!attackerChar || !defenderChar) {
            console.error("❌ 錯誤：找不到決鬥棋子，強制重置狀態");
            if (gameState.isCpuMode) return;
            await update(ref(db, `games/${gameState.gameId}`), { duel: null });
            gameState.isResolving = false;
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

        if (gameState.isCpuMode) return;
        await update(ref(db, `games/${gameState.gameId}`), updates);
        console.log("✅ 決鬥結算完畢");

    } catch (e) {
        console.error("❌ 決鬥結算發生嚴重錯誤:", e);
        // ★ 救命機制：發生錯誤時，強制把 duel 設為 null，不然會永遠卡住
        if (gameState.isCpuMode) return;
        await update(ref(db, `games/${gameState.gameId}`), { duel: null });
    } finally {
        gameState.isResolving = false; // 解除鎖定
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


// 斷線提示
function _showDisconnectNotice(msg) {
    if (document.getElementById('disconnect-modal')) return;
    off(ref(db, `games/${gameState.gameId}`)); // 停止監聽
    const modal = document.createElement('div');
    modal.id = 'disconnect-modal';
    modal.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.92);display:flex;flex-direction:column;align-items:center;justify-content:center;z-index:99999;gap:20px;';
    modal.innerHTML = `
        <div style="font-size:3rem;">📡</div>
        <div style="color:#f87171;font-size:1.3rem;font-weight:bold;font-family:'Orbitron';">連線中斷</div>
        <div style="color:#94a3b8;font-size:1rem;">${msg}</div>
        <button onclick="location.reload()" style="margin-top:10px;padding:12px 32px;background:linear-gradient(135deg,#1e293b,#334155);color:#fff;border:1px solid #475569;border-radius:12px;font-size:1rem;cursor:pointer;">返回大廳</button>
    `;
    document.body.appendChild(modal);
}

// 顯示結算畫面並發獎勵
async function handleGameEnd(winnerUid) {
    // 防止重複執行 (如果畫面已經出來了就跳過)
    if (document.getElementById('game-over-modal')) return;
    try { onDisconnect(ref(db, `games/${gameState.gameId}`)).cancel(); } catch(e) {}

    const isWinner = (gameState.myUid === winnerUid);
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
        const userRef = ref(db, `users/${gameState.myUid}`);
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
