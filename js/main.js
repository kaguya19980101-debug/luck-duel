// js/main.js
import { auth } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import * as AuthUser from "./auth.js"; // 引入所有 Auth 功能
import * as UI from "./ui.js";         // 引入所有 UI 功能
import * as Matchmaking from "./matchmaking.js";


// 1. 綁定按鈕事件
document.getElementById('google-login-btn').addEventListener('click', async () => {
    UI.showLoading(true);
    try {
        await AuthUser.loginWithGoogle();
        // 登入成功後，onAuthStateChanged 會自動處理畫面，所以這裡不用寫跳轉
    } catch (error) {
        UI.showLoginError("登入失敗: " + error.message);
    }
});

document.getElementById('logout-btn').addEventListener('click', () => {
    AuthUser.logoutUser();
});

let isSearching = false;
// 2. 監聽系統狀態 (這是程式的核心心跳)
onAuthStateChanged(auth,async (user) => {
    if (user) {
        console.log("系統: 使用者已連線", user.uid);
        
        
        // 儲存資料... (保留您之前的 saveUserProfile)
        // UI.showAppInterface(user); (保留)
        UI.showAppInterface(user);
        await initUserData(user);
        // ★ 當介面顯示後，綁定「開始配對」按鈕
        const findMatchBtn = document.getElementById('find-match-btn');
        const matchStatus = document.getElementById('match-status');

        if (findMatchBtn) {
            // 每次重新登入都重置按鈕
            findMatchBtn.onclick = async () => {
                if (!isSearching) {
                    // === 狀態：開始尋找 ===
                    isSearching = true;
                    
                    // 1. 改變按鈕外觀 -> 變成紅色取消鍵
                    findMatchBtn.innerText = "CANCEL SEARCH";
                    findMatchBtn.style.background = "#ff4444"; // 紅色
                    findMatchBtn.style.boxShadow = "none";
                    matchStatus.innerText = "正在尋找對手...";
                    matchStatus.style.color = "#4facfe";

                    // 2. 執行配對
                    await Matchmaking.findMatch(user);

                } else {
                    // === 狀態：取消尋找 ===
                    isSearching = false;

                    // 1. 恢復按鈕外觀
                    findMatchBtn.innerText = "START BATTLE";
                    findMatchBtn.style.background = "linear-gradient(45deg, #ff00cc, #3333ff)";
                    findMatchBtn.style.boxShadow = "0 0 20px rgba(255, 0, 204, 0.4)";
                    matchStatus.innerText = "已取消配對";
                    matchStatus.style.color = "#888";

                    // 2. 執行取消邏輯
                    await Matchmaking.cancelMatch(user);
                }
            };
        }

    } else {
        // ... (登出邏輯保持不變) ...
        UI.showLoginScreen();
    }
    UI.showLoading(false);
});
import { db } from "./firebase-config.js";
import { ref, get, update, push, set } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { CHARACTERS } from "./data.js";
// ===================================
// 💰 用戶資料初始化 (金幣系統)
// ===================================
async function initUserData(user) {
    const userRef = ref(db, `users/${user.uid}`);
    const snapshot = await get(userRef);
    const data = snapshot.val() || {};

    // 1. 如果沒有金幣，預設給 10000
    if (data.coins === undefined) {
        console.log("新用戶！發放初始資金 10000 G");
        await update(userRef, { coins: 10000 });
        updateCoinDisplay(10000);
    } else {
        updateCoinDisplay(data.coins);
    }
}

// 更新畫面上顯示的金幣
function updateCoinDisplay(amount) {
    const el = document.getElementById('user-coins');
    if(el) el.innerText = amount;
}

// ===================================
// ✨ 抽卡核心邏輯
// ===================================
window.handleSummon = async function(count) {
    const user = firebase.auth().currentUser; // 假設你有全域 firebase 或 import auth
    if (!user) return alert("請先登入");

    // 1. 計算費用
    const cost = count === 1 ? 100 : 1000;
    
    // 2. 檢查錢夠不夠
    const userRef = ref(db, `users/${user.uid}`);
    const snapshot = await get(userRef);
    let currentCoins = snapshot.val()?.coins || 0;

    if (currentCoins < cost) {
        alert(`金幣不足！需要 ${cost} G，你只有 ${currentCoins} G`);
        return;
    }

    // 3. 開始抽卡 (扣款 + 隨機)
    const newCoins = currentCoins - cost;
    let results = [];

    for(let i=0; i<count; i++) {
        // 簡單抽卡邏輯 (之後可以加權重)
        const randomChar = CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)];
        // 標記獲得時間
        const charData = { ...randomChar, obtainedAt: Date.now(), isNew: true };
        results.push(charData);
    }

    // 4. 寫入資料庫 (原子操作：同時更新錢和背包)
    const updates = {};
    updates[`users/${user.uid}/coins`] = newCoins;
    
    // 產生每一張卡片的 ID 並存入
    const inventoryRef = ref(db, `users/${user.uid}/inventory`);
    results.forEach(char => {
        const newKey = push(inventoryRef).key; // 產生 ID
        updates[`users/${user.uid}/inventory/${newKey}`] = char;
    });

    try {
        await update(ref(db), updates); // 一次寫入所有變更
        
        // 5. 更新畫面
        updateCoinDisplay(newCoins);
        showSummonResults(results); // 顯示結果
        
    } catch (err) {
        console.error("抽卡失敗", err);
        alert("系統連線錯誤，請稍後再試");
    }
}

// 顯示抽卡結果動畫
function showSummonResults(cards) {
    const overlay = document.getElementById('gacha-result-overlay');
    const grid = document.getElementById('result-grid');
    grid.innerHTML = '';
    
    overlay.style.display = 'flex'; // 顯示遮罩

    cards.forEach((card, index) => {
        const el = document.createElement('div');
        el.className = `result-card border-${card.rarity}`;
        // 讓卡片一張一張跳出來 (延遲動畫)
        el.style.animationDelay = `${index * 0.1}s`; 
        
        const icon = card.attribute === 'fire' ? '🔥' : (card.attribute === 'water' ? '💧' : '🌿');
        
        el.innerHTML = `
            <div style="font-size:2rem; margin-bottom:5px;">${icon}</div>
            <div style="font-weight:bold; color:white;">${card.name}</div>
            <div style="font-size:0.8rem; color:${card.rarity === 'SSR'?'gold':'#aaa'}">${card.rarity}</div>
        `;
        grid.appendChild(el);
    });
}

window.closeGachaResult = function() {
    document.getElementById('gacha-result-overlay').style.display = 'none';
}