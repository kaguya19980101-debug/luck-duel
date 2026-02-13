import { db } from "./firebase-config.js";
import { ref, set, get, remove, onValue, off, onDisconnect } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import * as Game from "./game.js";
import { getRandomTeam } from "./data.js";

// 狀態旗標：用來標記「現在是否正在排隊」，防止重複執行或誤判
let isSearching = false;

// 接收 myTeam 參數
export async function findMatch(user, myTeam) {
    if (isSearching) return;
    isSearching = true;

    const queueRef = ref(db, 'matchQueue');
    const snapshot = await get(queueRef);

    if (snapshot.exists()) {
        const queueData = snapshot.val();
        const opponentId = Object.keys(queueData).find(id => id !== user.uid);

        if (!opponentId) {
            await joinQueue(user, myTeam); // 傳入隊伍
            return;
        }

        // --- 【配對成功：我是 Joiner】 ---
        const opponentData = queueData[opponentId]; // 取得對手的資料
        const opponentTeam = opponentData.team;    // 取得對手的真實隊伍

        console.log(`配對成功！對手是: ${opponentId}`);

        await remove(ref(db, `matchQueue/${opponentId}`));
        await remove(ref(db, `matchQueue/${user.uid}`));

        const newGameId = `game_${Date.now()}`;
        const gameRef = ref(db, `games/${newGameId}`);

        let initialBoard = new Array(30).fill(null);

        // ★ 關鍵：不再用 getRandomTeam，改用雙方的真實隊伍 ★
        const team1 = opponentTeam; // 對手原本就存放在 Queue 裡的隊伍
        const team2 = myTeam;       // 我剛剛傳進來的隊伍

        // 放置棋子 (邏輯不變，但資料來源變了)
        team1.forEach((char, index) => {
            initialBoard[index] = { ...char, owner: opponentId, team: "red" };
        });
        team2.forEach((char, index) => {
            initialBoard[25 + index] = { ...char, owner: user.uid, team: "blue" };
        });

        await set(gameRef, {
            player1: opponentId,
            player2: user.uid,
            status: "playing",
            board: initialBoard,
            turn: opponentId,
            // ★★★ 補上這一行：開局時就要寫入開始時間！ ★★★
            turn_start_time: Date.now(),

            board: initialBoard,
            duel: null
        });

        // 通知對方進入
        await set(ref(db, `matches/${opponentId}`), { gameId: newGameId, role: "host" });
        enterGame(newGameId, "joiner");

    } else {
        await joinQueue(user, myTeam); // 傳入隊伍
    }
}

// 2. 修改 joinQueue 也要接收並儲存隊伍
async function joinQueue(user, myTeam) {
    // 如果傳進來的隊伍是空的或未定義，給一個空物件或報錯

    if (!myTeam || myTeam.length === 0) {
        console.error("嘗試加入排隊但隊伍資料為空");
        return;
    }

    const myQueueRef = ref(db, `matchQueue/${user.uid}`);

    await set(myQueueRef, {
        username: user.displayName || "Unknown Warrior",
        team: myTeam, // 現在確保這裡一定是有效的陣列
        timestamp: Date.now()
    });

    onDisconnect(myQueueRef).remove();

    // 監聽有沒有人配對到我
    const myMatchRef = ref(db, `matches/${user.uid}`);
    onValue(myMatchRef, (snapshot) => {
        // 防呆：如果我已經手動按了取消 (isSearching 為 false)，但資料庫延遲傳來配對成功，要擋掉
        if (!isSearching) return;

        const data = snapshot.val();
        if (data && data.gameId) {
            console.log("有人加入！遊戲開始！");

            // 清理監聽與資料
            off(myMatchRef);
            remove(myMatchRef);

            enterGame(data.gameId, "host");
        }
    });
}

// 3. 取消排隊
export async function cancelMatch(user) {
    if (!isSearching) return;

    console.log("取消排隊...");
    isSearching = false; // 標記為停止搜尋

    // 1. 移除排隊資料
    await remove(ref(db, `matchQueue/${user.uid}`));

    // 2. 取消斷線自動移除的設定 (因為我們已經手動移除了，不需要伺服器幫忙了)
    onDisconnect(ref(db, `matchQueue/${user.uid}`)).cancel();

    // 3. 停止監聽配對結果
    off(ref(db, `matches/${user.uid}`));

    console.log("已停止尋找對手");
}

// 進入遊戲
function enterGame(gameId, role) {
    // 重置狀態以便下次配對
    isSearching = false;

    // 呼叫 game.js 初始化棋盤
    Game.initGameBoard(gameId, role);
}