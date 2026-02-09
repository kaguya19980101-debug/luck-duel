import { db } from "./firebase-config.js";
import { ref, set, get, remove, onValue, off } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import * as Game from "./game.js";
import { getRandomTeam } from "./data.js"; 

// 1. 尋找配對主函式
export async function findMatch(user) {
    const queueRef = ref(db, 'matchQueue');
    const snapshot = await get(queueRef);

    if (snapshot.exists()) {
        // --- 【有別人】 -> 我是加入者 (Joiner) ---
        const queueData = snapshot.val();
        
        // ★★★ 之前漏掉的關鍵一行：找出對手是誰 ★★★
        const opponentId = Object.keys(queueData).find(id => id !== user.uid);

        // 如果找不到別人 (代表只有自己在清單裡)，那就乖乖去排隊
        if (!opponentId) {
            await joinQueue(user);
            return;
        }

        console.log(`配對成功！對手是: ${opponentId}`);

        // 移除排隊單
        await remove(ref(db, `matchQueue/${opponentId}`));
        await remove(ref(db, `matchQueue/${user.uid}`));

        // 建立房間
        const newGameId = `game_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const gameRef = ref(db, `games/${newGameId}`);

        // --- 初始化棋盤與角色 ---
        let initialBoard = new Array(30).fill(null);
        const team1 = getRandomTeam(5); // 對手 (Host)
        const team2 = getRandomTeam(5); // 我 (Joiner)

        // Team1 放在最上面一排 (0-4)
        team1.forEach((char, index) => {
            initialBoard[index] = { ...char, owner: opponentId, team: "red" };
        });

        // Team2 放在最下面一排 (25-29)
        team2.forEach((char, index) => {
            initialBoard[25 + index] = { ...char, owner: user.uid, team: "blue" };
        });

        // 寫入 Firebase
        await set(gameRef, {
            player1: opponentId,
            player2: user.uid,
            status: "playing",
            turn: opponentId,
            turn_start_time: Date.now(),
            board: initialBoard,
            duel: null
        });

        // 通知對方
        await set(ref(db, `matches/${opponentId}`), {
            gameId: newGameId,
            role: "host"
        });
        
        enterGame(newGameId, "joiner");

    } else {
        // --- 【沒人】 -> 我是開房者 (Host) ---
        await joinQueue(user);
    }
}

// 2. 排隊函式
async function joinQueue(user) {
    console.log("加入排隊清單...");
    
    await set(ref(db, `matchQueue/${user.uid}`), {
        username: user.displayName,
        timestamp: Date.now()
    });

    // 監聽有沒有人配對到我
    const myMatchRef = ref(db, `matches/${user.uid}`);
    onValue(myMatchRef, (snapshot) => {
        // 防呆：如果按鈕已經按取消了，就不要進遊戲
        const btn = document.getElementById('find-match-btn');
        if (btn && btn.innerText !== "CANCEL SEARCH") return;

        const data = snapshot.val();
        if (data && data.gameId) {
            console.log("有人加入！遊戲開始！");
            off(myMatchRef); 
            remove(myMatchRef); 
            enterGame(data.gameId, "host");
        }
    });
}

// 3. 取消排隊
export async function cancelMatch(user) {
    console.log("取消排隊...");
    await remove(ref(db, `matchQueue/${user.uid}`));
    off(ref(db, `matches/${user.uid}`));
    console.log("已停止尋找對手");
}

// 進入遊戲
function enterGame(gameId, role) {
    Game.initGameBoard(gameId, role);
}