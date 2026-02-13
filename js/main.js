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
// 在 let myInventoryData = {}; 下面加入：
let currentSortMode = 'id'; // 預設依時間排序 ('rare' 或 'id')
// 定義屬性外觀 (圖示與顏色)
const ATTR_CONFIG = {
    'fire': { icon: '🔥', color: '#ff5555', label: '火' },
    'water': { icon: '💧', color: '#3b82f6', label: '水' },
    'grass': { icon: '🌿', color: '#22c55e', label: '草' }, // 注意：資料庫請用 'grass'
    'light': { icon: '✨', color: '#fbbf24', label: '光' },
    'dark': { icon: '🟣', color: '#a855f7', label: '暗' },
    // 相容舊資料 (如果您舊資料是用 wood)
    'wood': { icon: '🌿', color: '#22c55e', label: '草' }
};
// 輔助函式：取得屬性樣式
function getAttrStyle(attr) {
    const key = (attr || '').toLowerCase();
    return ATTR_CONFIG[key] || { icon: '❓', color: '#999', label: '?' };
}
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
        const battleBtn = document.getElementById('find-match-btn');
        if (battleBtn) {
            battleBtn.onclick = () => window.handleFindMatch();
        }
    } else {
        UI.showLoginScreen();
    }
    UI.showLoading(false);
});

// 綁定登入/登出按鈕
const loginBtn = document.getElementById('google-login-btn');
if (loginBtn) loginBtn.addEventListener('click', AuthUser.loginWithGoogle);

const logoutBtn = document.getElementById('logout-btn');
if (logoutBtn) logoutBtn.addEventListener('click', AuthUser.logoutUser);


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
            while (currentTeam.length < 5) currentTeam.push(null);

            console.log("系統: 隊伍資料更新", currentTeam);

            // C. 兩個都有了，開始畫畫面
            renderTeamDisplay();
            renderInventoryGrid();

            // 讓大廳按鈕與紅字即時更新
            if (window.checkTeamStatus) {
                window.checkTeamStatus();
            }
        });
    });
}

function renderTeamDisplay() {
    // 遍歷 5 個隊伍格子
    for (let i = 0; i < 5; i++) {
        const slotEl = document.getElementById(`team-slot-${i}`);
        const charId = currentTeam[i]; // 取得該位置的角色 ID

        if (charId && myInventoryData[charId]) {
            // 如果有角色，讀取資料
            const char = myInventoryData[charId];
            const attrStyle = getAttrStyle(char.attribute);

            // 設定稀有度顏色
            let borderColor = '#666';
            let glow = '';
            if (char.rarity === 'SR') borderColor = '#a855f7';
            if (char.rarity === 'SSR') {
                borderColor = '#ffd700';
                glow = 'box-shadow: 0 0 10px rgba(255, 215, 0, 0.3);';
            }

            // 渲染格子內容 (圖示 + 名字)
            slotEl.innerHTML = `
                <div style="font-size:1.5rem; filter: drop-shadow(0 0 5px ${attrStyle.color});">
                    ${attrStyle.icon}
                </div>
                <div style="font-size:0.7rem; color:#fff; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; width:100%;">
                    ${char.name}
                </div>
                <div style="font-size:0.6rem; color:${borderColor}; position:absolute; top:2px; right:4px;">
                    ${char.rarity}
                </div>
            `;

            // 設定邊框與背景
            slotEl.style.borderColor = borderColor;
            slotEl.style.background = 'rgba(0,0,0,0.5)';
            if (glow) slotEl.style.cssText += glow;

        } else {
            // 如果是空格
            slotEl.innerHTML = '<span style="color:#444; font-size:1.5rem;">+</span>';
            slotEl.style.borderColor = '#333';
            slotEl.style.background = 'transparent';
            slotEl.style.boxShadow = 'none';
        }
    }
}


function renderInventoryGrid() {
    const grid = document.getElementById('inventory-grid');
    // 獲取包裹格子的外層容器，用來處理灰底問題
    const container = document.querySelector('.inventory-container');

    if (!grid || !container) return;

    grid.innerHTML = '';

    // --- 情況 A：背包是空的 ---
    if (!myInventoryData || Object.keys(myInventoryData).length === 0) {
        // 1. 強制把外層容器的背景變透明，消除「灰底」感
        container.style.background = 'transparent';
        container.style.boxShadow = 'none';
        container.style.border = 'none';

        // 2. 讓 Grid 變成置中模式
        grid.style.display = 'flex';
        grid.style.flexDirection = 'column';
        grid.style.justifyContent = 'center';
        grid.style.alignItems = 'center';
        grid.style.minHeight = '200px';

        grid.innerHTML = `
            <div style="color: rgb(250, 191, 27); font-size: 1rem; margin-top: 5px; white-space: nowrap;">去「角色召喚」尋找你的第一位夥伴吧！</div>
        `;
        return;
    }

    // --- 情況 B：背包有卡片 ---
    // 1. 恢復容器原本該有的設計感樣式（這裡依照你 CSS 的設定）
    container.style.background = 'rgba(255, 255, 255, 0.03)';
    container.style.boxShadow = ''; // 恢復 CSS 預設

    // 2. 恢復 Grid 的排列模式
    grid.style.display = 'grid';
    grid.style.minHeight = 'auto';

    const cards = Object.entries(myInventoryData);
    // 1. 定義稀有度權重
    const rarityOrder = { 'SSR': 3, 'SR': 2, 'R': 1 };
    // 排序邏輯保持不變
    cards.sort((a, b) => {
        const idA = a[0]; // 例如 "0001"
        const idB = b[0];
        const charA = a[1];
        const charB = b[1];

        // 判斷目前的排序模式
        if (typeof currentSortMode !== 'undefined' && currentSortMode === 'id') {
            // --- 模式 A: 依代號 上到下 (0001 -> 0015) ---
            return idA.localeCompare(idB);
        } else {
            // --- 模式 B: 依稀有度 上到下 (SSR -> SR -> R) ---
            const weightA = rarityOrder[charA.rarity] || 0;
            const weightB = rarityOrder[charB.rarity] || 0;

            if (weightA !== weightB) {
                return weightB - weightA; // 權重大的排前面
            }
            // 若稀有度相同，預設用代號排序
            return idA.localeCompare(idB);
        }
    });

    // 渲染卡片
    cards.forEach(([key, char]) => {
        if (!char || !char.name) return;

        const cardEl = document.createElement('div');
        cardEl.className = 'char-card';

        if (typeof currentTeam !== 'undefined' && currentTeam.includes(key)) {
            cardEl.classList.add('in-team');
        }

        cardEl.onclick = function () {
            if (window.addToTeam) window.addToTeam(key);
        };

        const attrKey = (char.attribute || '').toLowerCase();
        const attrData = ATTR_CONFIG[attrKey] || { icon: '❓', color: '#999', label: '?' };

        let rarityColor = '#ccc';
        let borderColor = '#444';
        if (char.rarity === 'SR') { rarityColor = '#a855f7'; borderColor = '#a855f7'; }
        if (char.rarity === 'SSR') { rarityColor = '#ffd700'; borderColor = '#ffd700'; }

        //if (attrKey === 'light') borderColor = '#fbbf24';
        //if (attrKey === 'dark') borderColor = '#a855f7';

        cardEl.style.border = `1px solid ${borderColor}`;
        if (char.rarity === 'SSR') {
            cardEl.style.boxShadow = `0 0 8px ${borderColor}40`;
        }

        const hp = char.hp || 100;
        const atk = char.attack || char.atk || 50;

        cardEl.innerHTML = `
            <div class="card-top">
                <span class="card-attr" style="text-shadow: 0 0 5px ${attrData.color}">${attrData.icon}</span>
                <span class="card-rarity" style="color:${rarityColor}; border:1px solid ${rarityColor}">${char.rarity || 'N'}</span>
            </div>
            <div class="card-center">
                <div class="card-main-icon" style="filter: drop-shadow(0 0 5px ${attrData.color}80);">${attrData.icon}</div>
                <div class="card-name">${char.name}</div>
            </div>
            <div class="card-stats">
                <div class="stat-box atk-val">
                    <span>⚔️</span> <span>${atk}</span>
                </div>
                <div class="stat-box hp-val">
                    <span>❤️</span> <span>${hp}</span>
                </div>
            </div>
        `;

        grid.appendChild(cardEl);
    });
}
// 切換排序模式
window.toggleSort = function () {
    if (currentSortMode === 'id') {
        currentSortMode = 'rare';
        document.getElementById('sort-btn-text').innerText = "排序:稀有度";
    } else {
        currentSortMode = 'id';
        document.getElementById('sort-btn-text').innerText = "排序:代號";
    }
    // 切換完馬上重新渲染
    renderInventoryGrid();
}
// ==========================================
// 5. 互動功能 (掛載到 Window 確保 HTML 點得到)
// ==========================================

// 動作 A: 加入隊伍
window.addToTeam = async function (cardId) {
    const user = auth.currentUser;
    if (!user) return alert("請先登入");

    console.log("處理隊伍變更:", cardId);

    // 1. 檢查這張卡是否已經在隊伍裡？
    const existingIndex = currentTeam.indexOf(cardId);

    if (existingIndex !== -1) {
        // ★★★ 情況 A: 已經在隊伍裡 -> 移除並替補 (Remove & Shift) ★★★

        // 邏輯：留下「不是 null」且「不是這張卡」的隊員
        let newTeam = currentTeam.filter(id => id !== null && id !== cardId);

        // 補滿 5 個位置 (補 null)
        while (newTeam.length < 5) {
            newTeam.push(null);
        }

        currentTeam = newTeam;
        console.log("已移除成員，隊伍重組:", currentTeam);

    } else {
        // ★★★ 情況 B: 不在隊伍裡 -> 加入 (Add) ★★★

        // 找第一個空格
        const emptyIndex = currentTeam.indexOf(null);

        if (emptyIndex === -1) {
            return alert("隊伍已滿！請先移除成員。");
        }

        // 填入空格
        currentTeam[emptyIndex] = cardId;
        console.log("已加入成員:", currentTeam);
    }

    // 2. 存檔到 Firebase
    try {
        await update(ref(db, `users/${user.uid}`), { team: currentTeam });
        // 畫面會因為 onValue 自動更新，不需要手動呼叫 render
    } catch (e) {
        console.error("存檔失敗:", e);
    }
}

// 動作 B: 移除隊伍
window.handleTeamSlotClick = async function (index) {
    // 1. 取得這個位置目前的卡片 ID
    const cardId = currentTeam[index];

    // 2. 如果這個位置有卡片，就直接呼叫 addToTeam
    // 因為我們剛剛已經把 addToTeam 改成「如果在隊伍裡就移除」，所以這裡直接用它就行！
    if (cardId) {
        console.log(`點擊隊伍槽 ${index}，移除卡片 ${cardId}`);
        window.addToTeam(cardId);
    } else {
        // 如果是空的，提示玩家
        // alert("請從下方背包點選卡片加入");
        console.log("點擊了空位");
    }
}

// 動作 C: 抽卡 (完整版)
window.handleSummon = async function (count) {
    const user = auth.currentUser;
    if (!user) return alert("請先登入");

    // 費用設定
    const cost = count === 1 ? 100 : 1000;

    try {
        // 1. 檢查金幣
        const userRef = ref(db, `users/${user.uid}`);
        const snapshot = await get(userRef);
        const userData = snapshot.val() || {};
        const currentCoins = userData.coins || 0;

        if (currentCoins < cost) {
            return alert(`金幣不足！需要 ${cost} G`);
        }

        // 2. 抽卡邏輯 (機率控制核心)
        const displayCards = [];
        const storageMap = {};
        const seenInThisSession = new Set();

        for (let i = 0; i < count; i++) {
            // --- 機率判定開始 ---
            const rand = Math.random() * 100; // 產生 0 ~ 100 的隨機數
            let targetRarity = 'R';

            if (rand < 70) {
                targetRarity = 'R';    // 0~69.99 (70%)
            } else if (rand < 95) {
                targetRarity = 'SR';   // 70~94.99 (25%)
            } else {
                targetRarity = 'SSR';  // 95~100 (5%)
            }

            // 從全角色列表中，篩選出符合該稀有度的角色
            const pool = CHARACTERS.filter(c => c.rarity === targetRarity);

            // 防呆：如果該稀有度沒卡片 (例如資料庫填錯)，就從全部隨機抽
            const finalPool = pool.length > 0 ? pool : CHARACTERS;

            // 從池子裡隨機挑一張
            const randomChar = finalPool[Math.floor(Math.random() * finalPool.length)];
            const cardId = randomChar.id;
            // --- 機率判定結束 ---

            // A. 處理顯示資料
            const isNewInBag = !myInventoryData[cardId];
            const isFirstTimeSeen = !seenInThisSession.has(cardId);
            const showNewTag = isNewInBag && isFirstTimeSeen;

            displayCards.push({
                ...randomChar,
                isNew: showNewTag
            });

            seenInThisSession.add(cardId);

            // B. 處理存檔數據
            if (!storageMap[cardId]) {
                storageMap[cardId] = { data: randomChar, count: 0 };
            }
            storageMap[cardId].count++;
        }

        // 3. 寫入資料庫
        const newCoins = currentCoins - cost;
        const updates = {};
        updates[`users/${user.uid}/coins`] = newCoins;

        for (const [cardId, info] of Object.entries(storageMap)) {
            const existingCard = myInventoryData[cardId];
            const pullCount = info.count;

            if (existingCard) {
                const finalCount = (existingCard.count || 1) + pullCount;
                updates[`users/${user.uid}/inventory/${cardId}/count`] = finalCount;
            } else {
                const newCardData = {
                    ...info.data,
                    count: pullCount,
                    obtainedAt: Date.now()
                };
                updates[`users/${user.uid}/inventory/${cardId}`] = newCardData;
            }
        }

        await update(ref(db), updates);

        // 4. 更新畫面
        updateCoinDisplay(newCoins);
        showSummonResults(displayCards);

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
    if (el && s.exists()) el.innerText = s.val().coins || 0;
}


// 1. 更新金幣顯示
function updateCoinDisplay(amount) {
    const el = document.getElementById('user-coins');
    if (el) el.innerText = amount;
}

// 2. 顯示抽卡結果視窗 (Overlay)
window.showSummonResults = function (cards) {
    // 1. 使用您原本 HTML 裡的 ID
    const overlay = document.getElementById('gacha-result-overlay');
    const grid = document.getElementById('result-grid');

    // 防呆
    if (!overlay || !grid) {
        let msg = "獲得角色:\n";
        cards.forEach(c => msg += `- ${c.name}\n`);
        return alert(msg);
    }

    // 手機版優化：確保開啟時 body 不會捲動，按鈕才不會跑位
    document.body.style.overflow = 'hidden';
    grid.innerHTML = ''; // 清空舊的
    overlay.style.display = 'flex'; // 顯示遮罩

    // 2. 一張一張產生卡片
    cards.forEach((char, index) => {
        const cardEl = document.createElement('div');

        // ★ 重點：使用 'char-card' 類別，這樣才會跟背包長得一模一樣
        cardEl.className = 'char-card';

        // 加入動畫效果 (預設隱藏，透過動畫顯示)
        cardEl.style.opacity = '0';
        cardEl.style.animation = `popIn 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275) forwards`;
        cardEl.style.animationDelay = `${index * 0.1}s`; // 您的延遲邏輯

        // --- 以下是跟背包一樣的視覺邏輯 ---

        // A. 取得屬性樣式 (支援光、暗、草等)
        const attrStyle = getAttrStyle(char.attribute);

        // B. 設定顏色與邊框
        let rarityColor = '#ccc';
        let borderColor = '#444';

        if (char.rarity === 'SR') { rarityColor = '#a855f7'; borderColor = '#a855f7'; }
        if (char.rarity === 'SSR') { rarityColor = '#ffd700'; borderColor = '#ffd700'; }

        // 光暗屬性特殊邊框
        //if (char.attribute === 'light') borderColor = '#fbbf24';
        //if (char.attribute === 'dark') borderColor = '#a855f7';

        // C. NEW 標籤 (如果是新卡)
        const newTag = char.isNew ?
            `<div style="position:absolute; top:35%; left:-10px; background:#ff4757; color:white; font-size:0.6rem; padding:2px 8px; transform:rotate(-15deg); z-index:10; font-weight:bold; box-shadow:0 2px 5px rgba(0,0,0,0.5); border:1px solid white;">NEW</div>` : '';

        // D. 設定樣式
        cardEl.style.border = `1px solid ${borderColor}`;
        if (char.rarity === 'SSR') {
            cardEl.style.boxShadow = `0 0 15px ${borderColor}60`;
        }

        // E. 數據欄位 (相容您 data.js 的 attack 寫法)
        const hp = char.hp || char.max_hp || 100;
        const atk = char.attack || char.atk || 50;

        // F. 組裝 HTML (四角佈局)
        cardEl.innerHTML = `
            ${newTag}
            
            <div class="card-top">
                <span class="card-attr" style="text-shadow: 0 0 5px ${attrStyle.color}">${attrStyle.icon}</span>
                <span class="card-rarity" style="color:${rarityColor}; border:1px solid ${rarityColor}">${char.rarity}</span>
            </div>

            <div class="card-center">
                <div class="card-main-icon" style="filter: drop-shadow(0 0 8px ${attrStyle.color}80);">${attrStyle.icon}</div>
                <div class="card-name">${char.name}</div>
            </div>

            <div class="card-stats">
                <div class="stat-box atk-val"><span>⚔️</span><span>${atk}</span></div>
                <div class="stat-box hp-val"><span>❤️</span><span>${hp}</span></div>
            </div>
        `;

        grid.appendChild(cardEl);
    });
}

// 3. 關閉結果視窗 (綁定給按鈕用)
window.closeGachaResult = function () {
    const overlay = document.getElementById('gacha-result-overlay');
    if (overlay) overlay.style.display = 'none';
    document.body.style.overflow = 'auto'; // 還原捲動
}
// ==========================================
// 🛠️ 開發者測試工具 (Dev Tools)
// 這些功能是給你測試用的，上線前可以刪除
// ==========================================

// 1. 給自己加錢
// 用法: 在 Console 輸入 test_addCoins(50000)
window.test_addCoins = async function (amount) {
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
window.test_clearCards = async function () {
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
window.test_deleteCard = async function (cardId) {
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
// js/main.js - 屬性相剋邏輯

/**
 * 定義攻擊倍率表 (Attacker -> Defender)
 * 根據您的設定：只有特定剋制是 1.5 倍，其餘預設 1.0
 */
const TYPE_CHART = {
    'water': { 'fire': 1.5 },
    'fire': { 'grass': 1.5 },
    'grass': { 'water': 1.5 },
    'dark': { 'light': 1.5 },
    'light': { 'dark': 1.5 }
};

/**
 * 計算傷害倍率函式
 * @param {string} atkAttr - 攻擊者的屬性 (例如 'water')
 * @param {string} defAttr - 防禦者的屬性 (例如 'fire')
 * @returns {number} 倍率 (1.5 或 1.0)
 */
window.getDamageMultiplier = function (atkAttr, defAttr) {
    if (!atkAttr || !defAttr) return 1.0;

    // 轉小寫避免大小寫錯誤
    const a = atkAttr.toLowerCase();
    const d = defAttr.toLowerCase();

    // 查表
    if (TYPE_CHART[a] && TYPE_CHART[a][d]) {
        return TYPE_CHART[a][d];
    }

    // 如果表中沒定義，預設為 1.0 (無加成)
    // 註：通常RPG中被剋制會變 0.5 (例如火打水)，如果您需要這個設定我們可以之後加上
    return 1.0;
}

// === 測試工具 ===
// 您可以在 Console 輸入 test_damage('water', 'fire') 來測試
window.test_damage = function (a, d) {
    const multi = window.getDamageMultiplier(a, d);
    console.log(`[傷害測試] ${a} 攻擊 ${d} -> 倍率: x${multi}`);
    if (multi > 1) console.log("✨ 效果絕佳 (Super Effective)!");
}
let isSearching = false; // 在函式外面定義狀態

window.handleFindMatch = async function () {
    const user = auth.currentUser;
    if (!user) return alert("請先登入");
    const btn = document.getElementById('find-match-btn');

    if (!isSearching) {
        // --- A. 開始排隊邏輯 ---
        const myTeamData = currentTeam.map(id => {
            if (!id) return null;
            const char = myInventoryData[id];
            return char ? { ...char, max_hp: char.hp || 100 } : null;
        }).filter(t => t !== null);

        if (myTeamData.length < 5) return alert("請先配置 5 人隊伍！");

        isSearching = true;
        btn.innerText = "CANCEL";
        btn.style.background = "red";

        console.log("帶著隊伍出發:", myTeamData);
        await Matchmaking.findMatch(user, myTeamData);
    } else {
        // --- B. 取消排隊邏輯 ---
        isSearching = false;
        btn.innerText = "START BATTLE";
        btn.style.background = "linear-gradient(45deg, #ff00cc, #3333ff)";
        await Matchmaking.cancelMatch(user);
    }
};
// js/main.js

window.checkTeamStatus = function () {
    const statusText = document.getElementById('match-status');
    const battleBtn = document.getElementById('find-match-btn');
    if (!statusText || !battleBtn) return;

    // 計算隊伍中有幾個人 (非 null 的數量)
    const memberCount = currentTeam.filter(id => id !== null).length;

    if (memberCount < 5) {
        // 情況 A：人數不足 5 人
        statusText.innerHTML = `<i class="fas fa-exclamation-triangle"></i> 您的隊伍目前不完整 (${memberCount}/5)`;
        statusText.style.color = "#ff4444"; // 顯示紅字

        // 讓按鈕變灰且無法點擊
        battleBtn.style.opacity = "0.5";
        battleBtn.style.filter = "grayscale(1)";
        battleBtn.style.cursor = "not-allowed";
        battleBtn.disabled = true;
    } else {
        // 情況 B：隊伍已滿
        statusText.innerHTML = `<i class="fas fa-check-circle"></i> 隊伍已就緒，準備出戰！`;
        statusText.style.color = "#44ff44"; // 顯示綠字

        // 恢復按鈕樣式
        battleBtn.style.opacity = "1";
        battleBtn.style.filter = "none";
        battleBtn.style.cursor = "pointer";
        battleBtn.disabled = false;
    }
}
// 加入這一行：同步更新大廳狀態
if (window.checkTeamStatus) window.checkTeamStatus();