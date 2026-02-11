import { db } from "./firebase-config.js";
import { ref, set, get, remove, onValue, off, onDisconnect } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import * as Game from "./game.js";
import { getRandomTeam } from "./data.js"; 

// 狀態旗標：用來標記「現在是否正在排隊」，防止重複執行或誤判
let isSearching = false;

// 1. 尋找配對主函式
export async function findMatch(user) {
    // 如果已經在找了，就不要再執行，避免重複
    if (isSearching) return;
    isSearching = true;

    const queueRef = ref(db, 'matchQueue');
    const snapshot = await get(queueRef);

    if (snapshot.exists()) {
        // --- 【有別人】 -> 我是加入者 (Joiner) ---
        const queueData = snapshot.val();
        
        // ★ 找出對手 (排除自己)
        const opponentId = Object.keys(queueData).find(id => id !== user.uid);

        // 如果找不到別人 (代表只有自己在清單裡)，那就乖乖去排隊
        if (!opponentId) {
            await joinQueue(user);
            return;
        }

        console.log(`配對成功！對手是: ${opponentId}`);

        // 移除排隊單 (防止其他人又配到他)
        // 建議先把兩個人都從 Queue 移掉，避免第三個人撞進來
        await remove(ref(db, `matchQueue/${opponentId}`));
        await remove(ref(db, `matchQueue/${user.uid}`));

        // 建立房間 ID
        const newGameId = `game_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`;
        const gameRef = ref(db, `games/${newGameId}`);

        // --- 初始化棋盤與角色 ---
        // 1. 產生空白棋盤 (30格)
        let initialBoard = new Array(30).fill(null);

        // 2. 幫雙方抽卡 (每人 5 隻)
        const team1 = getRandomTeam(5); // 對手 (Host, P1)
        const team2 = getRandomTeam(5); // 我 (Joiner, P2)

        // 3. 放置棋子
        // Team1 (Host) 放在最上面一排 (0-4) - 紅隊
        team1.forEach((char, index) => {
            initialBoard[index] = { 
                ...char, 
                owner: opponentId, 
                max_hp: char.hp, // 確保有 max_hp 供血條計算
                team: "red" 
            };
        });

        // Team2 (Joiner) 放在最下面一排 (25-29) - 藍隊
        team2.forEach((char, index) => {
            initialBoard[25 + index] = { 
                ...char, 
                owner: user.uid, 
                max_hp: char.hp,
                team: "blue" 
            };
        });

        // 4. 寫入 Firebase
        await set(gameRef, {
            player1: opponentId, // Host
            player2: user.uid,   // Joiner
            status: "playing",
            turn: opponentId,    // 預設 Host 先攻
            turn_start_time: Date.now(),
            board: initialBoard, // 這裡寫入的是陣列
            duel: null
        });

        // 5. 通知對方 (Host)
        await set(ref(db, `matches/${opponentId}`), {
            gameId: newGameId,
            role: "host"
        });
        
        // 6. 自己進入遊戲 (Joiner)
        enterGame(newGameId, "joiner");

    } else {
        // --- 【沒人】 -> 我是開房者 (Host) ---
        await joinQueue(user);
    }
}

// 2. 排隊函式
async function joinQueue(user) {
    console.log("加入排隊清單...");
    
    const myQueueRef = ref(db, `matchQueue/${user.uid}`);
    
    // 寫入排隊資料
    await set(myQueueRef, {
        username: user.displayName || "Unknown Warrior",
        timestamp: Date.now()
    });

    // ★★★ 關鍵救命符：設定斷線自動刪除 ★★★
    // 這一行是告訴伺服器：只要這個人連線一斷，馬上刪除這筆資料！
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