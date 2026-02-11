// js/main.js [終極修正版]

// 1. 統一引入區 (絕對不要改動這裡)
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { ref, get, update, push, set, onValue, remove, off, onDisconnect } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { CHARACTERS } from "./data.js";
import * as AuthUser from "./auth.js";
import * as UI from "./ui.js";
import * as Matchmaking from "./matchmaking.js";

// 2. 全域變數 (用來存隊伍和背包)
let currentTeam = [null, null, null, null, null];
let myInventoryData = {};

console.log("系統: main.js 已載入");

// ==========================================
// 3. 系統核心監聽
// ==========================================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        console.log("系統: 使用者已連線", user.uid);
        UI.showAppInterface(user);
        document.getElementById('lobby-view').style.display = 'block';
        document.getElementById('char-view').style.display = 'none';
        document.getElementById('summon-view').style.display = 'none';        
        // 登入後，馬上啟動這兩個功能
        await initUserData(user);  // 1. 初始化金幣
        loadMyInventory(user);     // 2. 讀取背包與隊伍

        // 綁定配對按鈕 (原本的功能)
        setupMatchButton(user);
        const btnSingle = document.querySelector('.btn-single');
        const btnMulti = document.querySelector('.btn-multi');

        if (btnSingle) {
            btnSingle.onclick = () => window.handleSummon(1);
        }
        if (btnMulti) {
            btnMulti.onclick = () => window.handleSummon(10);
        }
    } else {
        UI.showLoginScreen();
    }
    UI.showLoading(false);
});

// 綁定登入/登出按鈕
const loginBtn = document.getElementById('google-login-btn');
if(loginBtn) loginBtn.addEventListener('click', AuthUser.loginWithGoogle);

const logoutBtn = document.getElementById('logout-btn');
if(logoutBtn) logoutBtn.addEventListener('click', AuthUser.logoutUser);


// ==========================================
// 4. 讀取與渲染 (背包 & 隊伍)
// ==========================================
function loadMyInventory(user) {
    console.log("系統: 開始讀取背包...");
    const inventoryRef = ref(db, `users/${user.uid}/inventory`);
    const teamRef = ref(db, `users/${user.uid}/team`);

    // A. 監聽背包
    onValue(inventoryRef, (invSnap) => {
        myInventoryData = invSnap.val() || {};
        console.log("系統: 背包資料更新", Object.keys(myInventoryData).length + " 張卡");

        // B. 監聽隊伍 (等背包讀完再讀隊伍)
        onValue(teamRef, (teamSnap) => {
            currentTeam = teamSnap.val() || [null, null, null, null, null];
            // 防呆: 確保一定是5格
            if (!Array.isArray(currentTeam)) currentTeam = [null, null, null, null, null];
            while(currentTeam.length < 5) currentTeam.push(null);
            
            console.log("系統: 隊伍資料更新", currentTeam);

            // C. 兩個都有了，開始畫畫面
            renderTeamDisplay();
            renderInventoryGrid();
        });
    });
}

function renderTeamDisplay() {
    const slots = document.querySelectorAll('.team-slot');
    slots.forEach((slot, index) => {
        const cardId = currentTeam[index];
        slot.innerHTML = ''; 
        slot.className = 'team-slot'; // 重置

        if (cardId && myInventoryData[cardId]) {
            const char = myInventoryData[cardId];
            slot.classList.add('filled');
            const icon = char.attribute === 'fire' ? '🔥' : (char.attribute === 'water' ? '💧' : '🌿');
            slot.innerHTML = `
                <div style="font-size:1.5rem;">${icon}</div>
                <div style="font-size:0.7rem; font-weight:bold;">${char.name}</div>
            `;
        } else {
            slot.innerHTML = `<span style="opacity:0.3; font-size:2rem;">+</span>`;
        }
    });
}

function renderInventoryGrid() {
    const grid = document.getElementById('inventory-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const cards = Object.entries(myInventoryData);
    // 排序: 新的在前
    cards.sort((a, b) => b[1].obtainedAt - a[1].obtainedAt);

    cards.forEach(([key, char]) => {
        const cardEl = document.createElement('div');
        cardEl.className = 'char-card';
        
        // 檢查是否在隊伍中
        if (currentTeam.includes(key)) {
            cardEl.classList.add('in-team');
        }

        // ★★★ 關鍵修正：點擊事件 ★★★
        cardEl.onclick = function() {
            console.log("使用者點擊了卡片:", key);
            window.addToTeam(key); // 呼叫全域函式
        };

        const icon = char.attribute === 'fire' ? '🔥' : (char.attribute === 'water' ? '💧' : '🌿');
        let border = char.rarity === 'SSR' ? '2px solid gold' : '1px solid #555';

        cardEl.style.cssText = `border:${border}; background:#222; padding:10px; border-radius:8px; text-align:center; cursor:pointer;`;
        cardEl.innerHTML = `
            <div style="font-size:2rem;">${icon}</div>
            <div style="color:white; font-size:0.8rem;">${char.name}</div>
        `;

        grid.appendChild(cardEl);
    });
}


// ==========================================
// 5. 互動功能 (掛載到 Window 確保 HTML 點得到)
// ==========================================

// 動作 A: 加入隊伍
window.addToTeam = async function(cardId) {
    const user = auth.currentUser;
    if (!user) return alert("請先登入");

    console.log("嘗試加入隊伍:", cardId);

    // 檢查重複
    if (currentTeam.includes(cardId)) {
        return alert("這張卡已經在隊伍裡了！");
    }

    // 找空格
    const emptyIndex = currentTeam.indexOf(null);
    if (emptyIndex === -1) {
        return alert("隊伍已滿！請先點擊上方格子移除成員。");
    }

    // 更新
    currentTeam[emptyIndex] = cardId;
    
    // 存檔
    try {
        await update(ref(db, `users/${user.uid}`), { team: currentTeam });
        console.log("存檔成功！");
    } catch(e) {
        console.error("存檔失敗:", e);
    }
}

// 動作 B: 移除隊伍
window.handleTeamSlotClick = async function(index) {
    const user = auth.currentUser;
    if (!user) return;

    if (currentTeam[index] === null) return; // 點空格沒反應

    console.log("移除隊伍成員:", index);
    currentTeam[index] = null;

    await update(ref(db, `users/${user.uid}`), { team: currentTeam });
}

// 動作 C: 抽卡 (完整版)
window.handleSummon = async function(count) {
    const user = auth.currentUser;
    if (!user) return alert("請先登入");

    // 1. 設定費用
    const cost = count === 1 ? 100 : 1000;

    // 2. 檢查錢夠不夠
    const userRef = ref(db, `users/${user.uid}`);
    const snapshot = await get(userRef);
    const userData = snapshot.val() || {};
    const currentCoins = userData.coins || 0;

    if (currentCoins < cost) {
        return alert(`金幣不足！需要 ${cost} G，你只有 ${currentCoins} G`);
    }

    // 3. 執行抽卡
    const newCoins = currentCoins - cost;
    const newCards = [];

    for (let i = 0; i < count; i++) {
        const randomChar = CHARACTERS[Math.floor(Math.random() * CHARACTERS.length)];
        newCards.push({
            ...randomChar,
            obtainedAt: Date.now(),
            isNew: true
        });
    }

    // 4. 寫入資料庫
    const updates = {};
    updates[`users/${user.uid}/coins`] = newCoins;

    const inventoryRef = ref(db, `users/${user.uid}/inventory`);
    newCards.forEach(card => {
        const newKey = push(inventoryRef).key;
        updates[`users/${user.uid}/inventory/${newKey}`] = card;
    });

    try {
        await update(ref(db), updates);
        
        // 更新畫面上的錢
        updateCoinDisplay(newCoins);

        // ★★★ 關鍵：顯示抽卡結果視窗 ★★★
        showSummonResults(newCards);

    } catch (e) {
        console.error("抽卡失敗:", e);
        alert("系統忙碌中，請稍後再試");
    }
}

// ==========================================
// 6. 輔助函式 (金幣與配對)
// ==========================================
async function initUserData(user) {
    const userRef = ref(db, `users/${user.uid}`);
    const s = await get(userRef);
    if (!s.exists() || s.val().coins === undefined) {
        await update(userRef, { coins: 10000 });
    }
    // 顯示金幣
    const el = document.getElementById('user-coins');
    if(el && s.exists()) el.innerText = s.val().coins || 0;
}

function setupMatchButton(user) {
    const btn = document.getElementById('find-match-btn');
    let isSearching = false;
    if(!btn) return;
    
    btn.onclick = async () => {
        if(!isSearching) {
            isSearching = true;
            btn.innerText = "CANCEL";
            btn.style.background = "red";
            await Matchmaking.findMatch(user);
        } else {
            isSearching = false;
            btn.innerText = "START BATTLE";
            btn.style.background = "blue";
            await Matchmaking.cancelMatch(user);
        }
    }
}
// js/main.js - 請貼在檔案最下方

// 1. 更新金幣顯示
function updateCoinDisplay(amount) {
    const el = document.getElementById('user-coins');
    if(el) el.innerText = amount;
}

// 2. 顯示抽卡結果視窗 (Overlay)
function showSummonResults(cards) {
    const overlay = document.getElementById('gacha-result-overlay');
    const grid = document.getElementById('result-grid');
    
    // 如果 HTML 裡找不到這些元素，就只跳 alert (防呆)
    if(!overlay || !grid) {
        let msg = "獲得角色:\n";
        cards.forEach(c => msg += `- ${c.name}\n`);
        return alert(msg);
    }

    grid.innerHTML = ''; // 清空舊的
    overlay.style.display = 'flex'; // 顯示遮罩

    // 一張一張產生卡片
    cards.forEach((card, index) => {
        const el = document.createElement('div');
        // 設定邊框顏色
        let borderClass = 'border-R';
        if(card.rarity === 'SR') borderClass = 'border-SR';
        if(card.rarity === 'SSR') borderClass = 'border-SSR';

        el.className = `result-card ${borderClass}`;
        el.style.animationDelay = `${index * 0.1}s`; // 延遲動畫
        
        const icon = card.attribute === 'fire' ? '🔥' : (card.attribute === 'water' ? '💧' : '🌿');
        
        el.innerHTML = `
            <div style="font-size:2rem; margin-bottom:5px;">${icon}</div>
            <div style="font-weight:bold; color:white;">${card.name}</div>
            <div style="font-size:0.8rem; color:${card.rarity === 'SSR'?'gold':'#aaa'}">${card.rarity}</div>
        `;
        grid.appendChild(el);
    });
}

// 3. 關閉結果視窗 (綁定給按鈕用)
window.closeGachaResult = function() {
    const overlay = document.getElementById('gacha-result-overlay');
    if(overlay) overlay.style.display = 'none';
}
// ==========================================
// 🛠️ 開發者測試工具 (Dev Tools)
// 這些功能是給你測試用的，上線前可以刪除
// ==========================================

// 1. 給自己加錢
// 用法: 在 Console 輸入 test_addCoins(50000)
window.test_addCoins = async function(amount) {
    const user = auth.currentUser;
    if (!user) return console.error("❌ 請先登入！");

    const userRef = ref(db, `users/${user.uid}`);
    
    // 先讀取現在有多少錢
    const snapshot = await get(userRef);
    const currentCoins = snapshot.val()?.coins || 0;
    const newAmount = currentCoins + amount;

    await update(userRef, { coins: newAmount });
    console.log(`✅ 成功！金幣已更新：${currentCoins} -> ${newAmount}`);
}

// 2. 清空我的所有卡片 (重置背包)
// 用法: 在 Console 輸入 test_clearCards()
window.test_clearCards = async function() {
    const user = auth.currentUser;
    if (!user) return console.error("❌ 請先登入！");

    // 確認一下，避免手殘
    if (!confirm("⚠️ 警告：確定要刪除所有卡片嗎？這動作無法復原！")) return;

    // 直接移除 inventory 節點
    await remove(ref(db, `users/${user.uid}/inventory`));
    
    // 也要順便清空隊伍，不然會出錯
    await remove(ref(db, `users/${user.uid}/team`));

    console.log("🗑️ 背包與隊伍已清空！");
}

// 3. 刪除「特定一張」卡片
// 用法: test_deleteCard("-Nzb123...")  <-- 括號裡放卡片的 ID
window.test_deleteCard = async function(cardId) {
    const user = auth.currentUser;
    if (!user) return console.error("❌ 請先登入！");

    if (!cardId) return console.error("❌ 請輸入卡片 ID，例如: test_deleteCard('-Nz...')");

    // 1. 從背包移除
    await remove(ref(db, `users/${user.uid}/inventory/${cardId}`));

    // 2. 檢查隊伍裡有沒有這張卡，有的話也要拿掉
    // (這裡簡單做：直接讀取隊伍，如果有就設為 null)
    const teamRef = ref(db, `users/${user.uid}/team`);
    const teamSnap = await get(teamRef);
    let currentTeam = teamSnap.val();
    
    if (Array.isArray(currentTeam) && currentTeam.includes(cardId)) {
        // 把該位置變成 null
        currentTeam = currentTeam.map(id => id === cardId ? null : id);
        await update(ref(db, `users/${user.uid}`), { team: currentTeam });
        console.log("🔄 該卡片也從隊伍中移除了");
    }

    console.log(`🗑️ 卡片 ${cardId} 已刪除！`);
}

console.log("🛠️ 測試工具已載入：輸入 test_addCoins(1000) 來加錢");