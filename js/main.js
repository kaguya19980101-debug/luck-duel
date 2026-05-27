// js/main.js [最終乾淨版：無勾勾、無叉叉、功能完整]

// ==========================================
// 1. 統一引入區
// ==========================================
import { auth, db } from "./firebase-config.js";
import { onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { ref, get, update, push, set, onValue, remove, off, onDisconnect } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";
import { CHARACTERS } from "./data.js";
import * as AuthUser from "./auth.js";
import * as UI from "./ui.js";
import * as Matchmaking from "./matchmaking.js";
import { initCpuGame } from "./cpu.js";

console.log("系統: main.js 載入中...");

// ==========================================
// MOBILE 3-TAB BAR LOGIC (置於最前，確保一定掛載)
// ==========================================
window._currentPanel = null;

window.togglePanel = function (name) {
    const tabbar = document.getElementById('mobile-tabbar');
    if (!tabbar) return;
    const allPanels = document.querySelectorAll('.panel-section');
    const target = document.getElementById('panel-' + name);
    const allTabs = document.querySelectorAll('.tab-btn');

    if (window._currentPanel === name) {
        allPanels.forEach(p => p.classList.remove('active'));
        tabbar.classList.remove('panel-open');
        allTabs.forEach(t => t.classList.remove('tab-active'));
        window._currentPanel = null;
        return;
    }

    allPanels.forEach(p => p.classList.remove('active'));
    if (target) target.classList.add('active');
    tabbar.classList.add('panel-open');
    allTabs.forEach(t => t.classList.remove('tab-active'));
    const tabEl = document.getElementById('tab-' + name);
    if (tabEl) tabEl.classList.add('tab-active');
    window._currentPanel = name;
};

window.closeTabPanel = function () {
    const tabbar = document.getElementById('mobile-tabbar');
    if (!tabbar) return;
    document.querySelectorAll('.panel-section').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.tab-btn').forEach(t => t.classList.remove('tab-active'));
    tabbar.classList.remove('panel-open');
    window._currentPanel = null;
};

window.tabNav = function (viewId, btnId) {
    window.closeTabPanel();
    if (window.switchView) window.switchView(viewId);
    document.querySelectorAll('.menu-items button').forEach(b => b.classList.remove('active'));
    const desktopBtn = document.getElementById(btnId);
    if (desktopBtn) desktopBtn.classList.add('active');
    const duelTab = document.getElementById('tab-duel');
    if (duelTab) {
        if (viewId === 'lobby-view') duelTab.classList.add('tab-active');
        else duelTab.classList.remove('tab-active');
    }
};

window.doLogout = function () {
    window.closeTabPanel();
    AuthUser.logoutUser();
};

// ==========================================
// 2. 全域變數與設定
// ==========================================
window.currentTeam = [null, null, null, null, null];
window.myInventoryData = {};
window.currentSortMode = 'id';

// 屬性設定
window.ATTR_CONFIG = {
    'fire': { icon: '🔥', color: '#ff5555', label: '火' },
    'water': { icon: '💧', color: '#3b82f6', label: '水' },
    'grass': { icon: '🌿', color: '#22c55e', label: '草' },
    'light': { icon: '✨', color: '#fbbf24', label: '光' },
    'dark': { icon: '🟣', color: '#a855f7', label: '暗' },
    'wood': { icon: '🌿', color: '#22c55e', label: '草' }
};

function getAttrStyle(attr) {
    const key = (attr || '').toLowerCase();
    return ATTR_CONFIG[key] || { icon: '❓', color: '#999', label: '?' };
}

window.getCharImage = function (id) {
    if (!id) return 'img/characters/default.png';
    return `img/characters/${id}.webp`;
}
// 🛠️ 視窗切換工具 (標準寫法)
// 這會自動隱藏其他視窗，並顯示指定的視窗
window.switchView = function (viewId) {
    const views = ['lobby-view', 'char-view', 'summon-view', 'glossary-view', 'history-view'];

    views.forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;

        if (id === viewId) {
            // ★ 核心技巧：設為空字串 ''，代表「移除 JS 加上的 style」。
            // 這樣元素就會自動採用 CSS 裡寫好的 display: flex，
            // 既能保留排版，又不會跟 CSS 打架。
            el.style.display = '';
        } else {
            // 隱藏時明確設為 none
            el.style.display = 'none';
        }
    });
}
// ==========================================
// 3. 系統初始化與登入監聽
// ==========================================
onAuthStateChanged(auth, async (user) => {
    if (user) {
        console.log("系統: 使用者已登入", user.uid);
        UI.showAppInterface(user);

        //document.getElementById('lobby-view').style.display = 'block';
        //document.getElementById('char-view').style.display = 'none';
        //document.getElementById('summon-view').style.display = 'none';
        // 現在：
        window.switchView('lobby-view');
        await initUserData(user);
        loadMyInventory(user);

        const battleBtn = document.getElementById('find-match-btn');
        if (battleBtn) battleBtn.onclick = () => window.handleFindMatch();

    } else {
        UI.showLoginScreen();
    }
    UI.showLoading(false);
});

async function initUserData(user) {
    const userRef = ref(db, `users/${user.uid}`);
    const s = await get(userRef);
    if (!s.exists() || s.val().coins === undefined) {
        await update(userRef, { coins: 10000 });
    }
    updateCoinDisplay(s.val()?.coins || 0);
}

function updateCoinDisplay(amount) {
    const el = document.getElementById('user-coins');
    if (el) el.innerText = amount;
}

function loadMyInventory(user) {
    const inventoryRef = ref(db, `users/${user.uid}/inventory`);
    const teamRef = ref(db, `users/${user.uid}/team`);

    // A. 讀取背包
    onValue(inventoryRef, (invSnap) => {
        window.myInventoryData = invSnap.val() || {};

        // B. 讀取隊伍
        onValue(teamRef, (teamSnap) => {
            const rawData = teamSnap.val();

            // ★★★ 核心修正：強制重建 5 格陣列 (填補 Firebase 的破洞) ★★★
            const safeTeam = [null, null, null, null, null];

            if (rawData) {
                // 不管是陣列還是物件，都用索引位置硬塞回去
                Object.keys(rawData).forEach(key => {
                    const idx = Number(key);
                    if (idx >= 0 && idx < 5) {
                        safeTeam[idx] = rawData[key];
                    }
                });
            }

            window.currentTeam = safeTeam;
            console.log("隊伍已修復:", window.currentTeam);

            // C. 渲染畫面
            window.renderTeamDisplay();
            renderInventoryGrid();
            if (window.checkTeamStatus) window.checkTeamStatus();
        });
    });
}

// ==========================================
// 4. 核心互動：隊伍與卡片 (無勾勾版)
// ==========================================

// 處理卡片點擊 (加入/移除)
window.handleCardClick = function (id) {
    const targetId = String(id);

    if (!window.currentTeam) window.currentTeam = [null, null, null, null, null];

    const existingIndex = window.currentTeam.findIndex(m => String(m) === targetId);

    if (existingIndex !== -1) {
        // 移除 (變回 null)
        window.currentTeam[existingIndex] = null;
    } else {
        // 加入 (找第一個 null)
        const emptyIndex = window.currentTeam.findIndex(m => m === null);
        if (emptyIndex === -1) {
            alert("隊伍已滿！請先移除一名隊員。");
            return;
        }
        window.currentTeam[emptyIndex] = targetId;
    }

    // 存檔
    const user = auth.currentUser;
    if (user) {
        update(ref(db, `users/${user.uid}`), { team: window.currentTeam })
            .catch(console.error);
    }

    // 更新畫面
    window.renderTeamDisplay();
    window.updateCardVisual(targetId);
    if (window.checkTeamStatus) window.checkTeamStatus();
}

// ==========================================
// 快速編隊
// ==========================================
let quickTeamSelectedSlot = -1; // 目前選中的槽位 index

window.openQuickTeam = function () {
    const panel    = document.getElementById('quick-team-panel');
    const teamSection = document.querySelector('.team-section');
    const invContainer = document.querySelector('.inventory-container');
    if (!panel) return;
    panel.style.display = 'flex';
    if (teamSection)    teamSection.style.display = 'none';
    if (invContainer)   invContainer.style.display = 'none';
    quickTeamSelectedSlot = -1;
    _renderQuickSlots();
    _renderQuickGrid();
};

window.closeQuickTeam = function () {
    const panel    = document.getElementById('quick-team-panel');
    const teamSection = document.querySelector('.team-section');
    const invContainer = document.querySelector('.inventory-container');
    if (panel)          panel.style.display = 'none';
    if (teamSection)    teamSection.style.display = '';
    if (invContainer)   invContainer.style.display = '';
    quickTeamSelectedSlot = -1;
    window.renderTeamDisplay();
};

function _renderQuickSlots() {
    const container = document.getElementById('quick-team-slots');
    if (!container) return;
    container.innerHTML = '';

    for (let i = 0; i < 5; i++) {
        const charId   = window.currentTeam[i];
        const charData = charId ? window.myInventoryData[String(charId)] : null;
        const isLeader = (i === 2);
        const isSelected = (i === quickTeamSelectedSlot);

        const slot = document.createElement('div');
        slot.style.cssText = `
            width:58px; height:72px; border-radius:8px; position:relative;
            display:flex; flex-direction:column; align-items:center; justify-content:center;
            cursor:pointer; transition:0.15s; box-sizing:border-box;
            ${isSelected
                ? 'border:2px solid #22d3ee; box-shadow:0 0 14px rgba(34,211,238,0.8);'
                : charData
                    ? `border:2px solid ${charData.rarity==='SSR'?'#ffd700':charData.rarity==='SR'?'#a855f7':'#64748b'};`
                    : 'border:2px dashed #334155; background:rgba(255,255,255,0.02);'}
        `;

        if (isLeader) {
            const crown = document.createElement('div');
            crown.textContent = '👑';
            crown.style.cssText = 'position:absolute;top:-10px;left:50%;transform:translateX(-50%);font-size:0.8rem;';
            slot.appendChild(crown);
        }

        if (charData) {
            const img = document.createElement('img');
            img.src = window.getCharImage(String(charId));
            img.onerror = () => img.src = 'img/characters/default.png';
            img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:6px;';
            slot.appendChild(img);

            // 移除小 X
            const del = document.createElement('div');
            del.textContent = '✕';
            del.style.cssText = `
                position:absolute; top:2px; right:3px;
                font-size:0.6rem; color:rgba(255,255,255,0.7);
                background:rgba(0,0,0,0.5); border-radius:50%;
                width:14px; height:14px; display:flex; align-items:center; justify-content:center;
                cursor:pointer;
            `;
            del.onclick = (e) => {
                e.stopPropagation();
                window.currentTeam[i] = null;
                _saveTeam();
                quickTeamSelectedSlot = -1;
                _renderQuickSlots();
                _renderQuickGrid();
            };
            slot.appendChild(del);
        } else {
            const plus = document.createElement('span');
            plus.textContent = isSelected ? '▼' : '+';
            plus.style.cssText = `color:${isSelected?'#22d3ee':'#475569'};font-size:1.2rem;`;
            slot.appendChild(plus);
        }

        slot.onclick = () => {
            quickTeamSelectedSlot = (quickTeamSelectedSlot === i) ? -1 : i;
            _renderQuickSlots();
        };
        container.appendChild(slot);
    }
}

function _renderQuickGrid() {
    const grid = document.getElementById('quick-team-grid');
    if (!grid) return;
    grid.innerHTML = '';

    const inventory = window.myInventoryData || {};
    const keys      = Object.keys(inventory);

    keys.forEach(key => {
        const char = inventory[key];
        if (!char) return;

        const inTeamIdx = window.currentTeam.findIndex(m => String(m) === String(key));
        const inTeam    = inTeamIdx !== -1;

        const rarityColor = char.rarity === 'SSR' ? '#ffd700' : char.rarity === 'SR' ? '#a855f7' : '#64748b';

        const card = document.createElement('div');
        card.style.cssText = `
            position:relative; border-radius:8px; overflow:hidden; cursor:pointer;
            aspect-ratio:2/3; border:2px solid ${inTeam ? rarityColor : '#1e293b'};
            opacity:${inTeam ? '0.5' : '1'};
            transition:0.15s; background:#0f172a;
            box-shadow:${inTeam ? `0 0 8px ${rarityColor}66` : 'none'};
        `;

        const img = document.createElement('img');
        img.src = window.getCharImage(String(key));
        img.onerror = () => img.src = 'img/characters/default.png';
        img.style.cssText = 'width:100%;height:100%;object-fit:cover;';
        card.appendChild(img);

        // 在隊標記
        if (inTeam) {
            const badge = document.createElement('div');
            badge.textContent = `槽${inTeamIdx + 1}`;
            badge.style.cssText = `
                position:absolute; bottom:0; left:0; right:0;
                background:rgba(0,0,0,0.75); color:${rarityColor};
                font-size:0.6rem; text-align:center; padding:2px 0; font-weight:bold;
            `;
            card.appendChild(badge);
        }

        card.onclick = () => {
            if (inTeam) {
                // 已在隊，點擊移除
                window.currentTeam[inTeamIdx] = null;
                _saveTeam();
                quickTeamSelectedSlot = -1;
                _renderQuickSlots();
                _renderQuickGrid();
                return;
            }

            // 有選中槽位 → 填入
            if (quickTeamSelectedSlot !== -1) {
                const oldId = window.currentTeam[quickTeamSelectedSlot];
                // 如果這張卡在其他槽，先移除
                const existIdx = window.currentTeam.findIndex(m => String(m) === String(key));
                if (existIdx !== -1) window.currentTeam[existIdx] = null;
                window.currentTeam[quickTeamSelectedSlot] = String(key);
                quickTeamSelectedSlot = -1;
            } else {
                // 沒選槽位 → 填入第一個空槽
                const emptyIdx = window.currentTeam.findIndex(m => m === null);
                if (emptyIdx === -1) { return; } // 滿了
                window.currentTeam[emptyIdx] = String(key);
            }

            _saveTeam();
            _renderQuickSlots();
            _renderQuickGrid();
        };

        grid.appendChild(card);
    });
}

function _saveTeam() {
    const user = auth.currentUser;
    if (user) {
        update(ref(db, `users/${user.uid}`), { team: window.currentTeam }).catch(console.error);
    }
}

// 渲染上方隊伍格子（含隊長槽、隊長技欄）
window.renderTeamDisplay = function () {
    const container = document.getElementById('team-row');
    const leaderSkillBar = document.getElementById('leader-skill-bar');
    if (!container) return;
    container.innerHTML = '';

    for (let i = 0; i < 5; i++) {
        const charId = window.currentTeam[i];
        const isLeaderSlot = (i === 2); // ★ 隊長槽改為第 3 格（中間）
        const slot = document.createElement('div');
        slot.className = 'team-slot' + (isLeaderSlot ? ' captain-slot' : '');

        // 隊長槽：右上角皇冠標記 + tooltip
        if (isLeaderSlot) {
            const crown = document.createElement('div');
            crown.className = 'captain-crown';
            crown.innerHTML = '👑';
            crown.title = '第一格為隊長，SSR 卡可發動隊長技';
            slot.appendChild(crown);
        }

        if (charId !== null) {
            slot.classList.add('filled');
            const idStr = String(charId);
            const imgPath = window.getCharImage(idStr);
            const charData = window.myInventoryData[idStr];

            let rarityColor = '#cccccc';
            let glowColor = 'rgba(255,255,255,0.3)';
            if (charData) {
                if (charData.rarity === 'SR')  { rarityColor = '#a855f7'; glowColor = 'rgba(168,85,247,0.6)'; }
                if (charData.rarity === 'SSR') { rarityColor = '#ffd700'; glowColor = 'rgba(255,215,0,0.6)'; }
            }

            // 隊長槽 SSR 額外金色邊框加強
            if (isLeaderSlot && charData?.rarity === 'SSR') {
                slot.style.border = '2px solid #ffd700';
                slot.style.boxShadow = '0 0 20px rgba(255,215,0,0.8), inset 0 0 8px rgba(255,215,0,0.2)';
            } else {
                slot.style.border = `2px solid ${rarityColor}`;
                slot.style.boxShadow = `0 0 15px ${glowColor}`;
            }

            const img = document.createElement('img');
            img.src = imgPath;
            img.onerror = () => img.src = 'img/characters/default.png';
            img.style.cssText = 'width:100%;height:100%;object-fit:cover;border-radius:6px;cursor:pointer;';
            slot.appendChild(img);
            slot.onclick = () => window.handleCardClick(idStr);
        } else {
            slot.style.border = isLeaderSlot ? '2px dashed #ffd70066' : '2px dashed #555';
            slot.style.boxShadow = 'none';
            const plus = document.createElement('span');
            plus.style.cssText = 'font-size:2rem; color:' + (isLeaderSlot ? '#ffd70066' : '#555') + ';';
            plus.textContent = isLeaderSlot ? '👑' : '+';
            slot.appendChild(plus);
        }

        container.appendChild(slot);
    }

    // ── 隊長技欄（讀取第 3 格，index 2）──
    if (leaderSkillBar) {
        const captainId   = window.currentTeam[2];
        const captainData = captainId ? window.myInventoryData[String(captainId)] : null;
        const leader = captainData?.leader;

        if (leader) {
            const attrConfig = window.ATTR_CONFIG || {};
            const attrData = attrConfig[(captainData.attribute||'').toLowerCase()] || { icon:'❓', color:'#aaa' };
            leaderSkillBar.innerHTML = `
                <div class="leader-bar-inner">
                    <span class="leader-bar-icon" style="color:${attrData.color}">${attrData.icon}</span>
                    <span class="leader-bar-label">隊長技</span>
                    <span class="leader-bar-name">${leader.name}</span>
                    <span class="leader-bar-desc">${leader.desc.replace('【隊長技】','')}</span>
                </div>`;
            leaderSkillBar.style.display = 'flex';
        } else {
            leaderSkillBar.innerHTML = `
                <div class="leader-bar-inner leader-bar-empty">
                    <span>👑</span>
                    <span>將 SSR 卡放在第一格即可發動隊長技</span>
                </div>`;
            leaderSkillBar.style.display = 'flex';
        }
    }
};
// 相容舊命名
window.renderTeamSlots = window.renderTeamDisplay;

// 更新單張卡片視覺 (只變色，不加勾勾)
window.updateCardVisual = function (id) {
    const cardEl = document.querySelector(`.char-card[data-id="${id}"]`);
    if (!cardEl) return;

    const isInTeam = window.currentTeam.some(m => String(m) === String(id));

    // ★ 移除所有關於 .team-check-mark 的操作
    // 只保留 class 切換，讓您可以透過 CSS 控制外框變色 (如果需要的話)
    if (isInTeam) {
        cardEl.classList.add('in-team');
    } else {
        cardEl.classList.remove('in-team');
    }
}

// 渲染背包網格 (修正變數未定義錯誤)
window.renderInventoryGrid = function () {
    const grid = document.getElementById('inventory-grid');
    const container = document.querySelector('.inventory-container');
    if (!grid || !container) return;

    grid.innerHTML = '';

    // 無資料處理
    if (!window.myInventoryData || Object.keys(window.myInventoryData).length === 0) {
        container.style.background = 'transparent';
        grid.style.display = 'flex';
        grid.innerHTML = `<div style="
                            font-size:1rem;
                            color:#fd2b2b;
                            font-weight:900;
                            letter-spacing:2px;
                        ">無卡片<br>
                        </div>`;
        return;
    }

    container.style.background = 'rgba(255, 255, 255, 0.03)';
    grid.style.display = 'grid';

    // 排序邏輯
    const cards = Object.entries(window.myInventoryData);
    const rarityOrder = { 'SSR': 3, 'SR': 2, 'R': 1 };

    cards.sort((a, b) => {
        const [idA, charA] = a;
        const [idB, charB] = b;
        if (window.currentSortMode === 'id') return idA.localeCompare(idB);
        const wA = rarityOrder[charA.rarity] || 0;
        const wB = rarityOrder[charB.rarity] || 0;
        if (wA !== wB) return wB - wA;
        return idA.localeCompare(idB);
    });

    // 產生卡片
    cards.forEach(([key, char]) => {
        if (!char) return;

        const cardEl = document.createElement('div');
        cardEl.dataset.id = key;
        cardEl.className = 'char-card';

        if (char.rarity === 'SR') cardEl.classList.add('sr-card');
        if (char.rarity === 'SSR') cardEl.classList.add('ssr-card');

        if (window.currentTeam.some(m => String(m) === String(key))) {
            cardEl.classList.add('in-team');
        }

        cardEl.onclick = () => window.openCardModal(key);

        const imgPath = window.getCharImage(key);

        // 1. 取得設定檔 (確保 window.ATTR_CONFIG 存在)
        const config = window.ATTR_CONFIG || {};

        // 2. 轉小寫並處理空值
        const attrKey = (char.attribute || '').toLowerCase();

        // 3. 查表取得完整資料
        const attrData = config[attrKey] || { icon: '❓', color: '#999' };

        // ★★★ 關鍵修正：定義變數，防止 attrIcon is not defined 錯誤 ★★★
        const attrIcon = attrData.icon;
        const attrColor = attrData.color || '#fff'; // 順便把顏色也抓出來

        const hp = char.hp || 100;
        const atk = char.attack || 50;

        // HTML 結構
        cardEl.innerHTML = `
            <div class="card-img-wrapper">
                <img src="${imgPath}" onerror="this.src='img/characters/default.png'">
                <div class="card-attr-badge" style="color:${attrColor}; text-shadow:0 0 3px black;">${attrIcon}</div>
                <div class="card-rarity-badge">${char.rarity}</div>
            </div>
            
            <div class="card-info">
                <div class="card-name">${char.name}</div>
                <div class="card-stats">
                    <span>⚔️ ${atk}</span>
                    <span>❤️ ${hp}</span>
                </div>
            </div>
        `;

        grid.appendChild(cardEl);
    });
}

window.toggleSort = function () {
    // 1. 切換排序模式 (針對 window 全域變數)
    if (!window.currentSortMode) window.currentSortMode = 'id'; // 防呆
    window.currentSortMode = (window.currentSortMode === 'id') ? 'rare' : 'id';

    // 2. 更新按鈕文字
    const btnText = document.getElementById('sort-btn-text');
    if (btnText) {
        btnText.innerText = (window.currentSortMode === 'id') ? "排序:代號" : "排序:稀有度";
    }

    console.log("🔄 排序切換中... 目前模式:", window.currentSortMode);

    // 3. ★★★ 關鍵：強制呼叫重畫函式 ★★★
    if (typeof window.renderInventoryGrid === 'function') {
        window.renderInventoryGrid();
    } else {
        console.error("❌ 找不到 renderInventoryGrid 函式！請確認它已經定義。");
    }
}

// ==========================================
// 5. 抽卡系統 (Gacha System)
// ==========================================
window.handleSummon = async function (count) {
    const user = auth.currentUser;
    if (!user) return alert("請先登入");

    const cost = count === 1 ? 100 : 1000;

    try {
        const userRef = ref(db, `users/${user.uid}`);
        const snap = await get(userRef);
        const currentCoins = snap.val()?.coins || 0;

        if (currentCoins < cost) return alert("金幣不足！");

        const displayCards = [];
        const updates = {};
        const newCoins = currentCoins - cost;
        updates[`users/${user.uid}/coins`] = newCoins;

        for (let i = 0; i < count; i++) {
            const rand = Math.random() * 100;
            let targetRarity = 'R';
            if (rand >= 95) targetRarity = 'SSR';
            else if (rand >= 70) targetRarity = 'SR';

            const pool = CHARACTERS.filter(c => c.rarity === targetRarity);
            const finalPool = pool.length > 0 ? pool : CHARACTERS;
            const card = finalPool[Math.floor(Math.random() * finalPool.length)];

            const isNew = !window.myInventoryData[card.id];

            const invPath = `users/${user.uid}/inventory/${card.id}`;
            const existingCount = window.myInventoryData[card.id]?.count || 0;

            if (existingCount === 0) {
                updates[invPath] = { ...card, count: 1, obtainedAt: Date.now() };
            } else {
                updates[`${invPath}/count`] = existingCount + 1;
            }

            displayCards.push({ ...card, isNew });
        }

        await update(ref(db), updates);
        updateCoinDisplay(newCoins);
        showSummonResults(displayCards);

    } catch (e) {
        console.error("抽卡錯誤:", e);
    }
}

function showSummonResults(cards) {
    const overlay = document.getElementById('gacha-result-overlay');
    const grid = document.getElementById('result-grid');
    if (!overlay || !grid) return; // 防呆

    document.body.style.overflow = 'hidden'; // 鎖住背景捲動
    grid.innerHTML = '';
    overlay.style.display = 'flex'; // 顯示遮罩

    // 根據數量切換 CSS class (單抽置中)
    if (cards.length === 1) {
        grid.className = 'result-grid single-pull';
    } else {
        grid.className = 'result-grid';
    }

    // 產生卡片
    cards.forEach((char, index) => {
        const cardEl = document.createElement('div');

        // ★ 1. 套用跟背包一模一樣的基礎 Class
        cardEl.className = 'char-card';

        // 保留抽卡的彈出動畫
        cardEl.style.opacity = '0';
        cardEl.style.animation = `popIn 0.4s forwards ${index * 0.1}s`;

        // ★ 2. 套用稀有度 class (讓 CSS 控制邊框顏色與發光)
        if (char.rarity === 'SR') cardEl.classList.add('sr-card');
        if (char.rarity === 'SSR') cardEl.classList.add('ssr-card');

        // ★ 3. 取得圖片、屬性與數值 (跟背包邏輯完全相同)
        const imgPath = window.getCharImage(char.id);
        const config = window.ATTR_CONFIG || {};
        const attrKey = (char.attribute || '').toLowerCase();
        const attrData = config[attrKey] || { icon: '❓', color: '#999' };

        const attrIcon = attrData.icon;
        const attrColor = attrData.color || '#fff';

        const hp = char.hp || 100;
        const atk = char.attack || 50;

        // ★ 4. NEW 標籤的專屬樣式 (如果有抽到新角色)
        // (把 top 往下移一點點，避免擋到左上角的屬性圖示)
        const newBadgeHTML = char.isNew
            ? `<div style="position:absolute; top:35px; left:-8px; background:#ff4444; color:white; padding:2px 10px; font-size:0.8rem; font-weight:bold; transform:rotate(-15deg); border:1.5px solid white; border-radius:3px; z-index:10; box-shadow: 0 2px 5px rgba(0,0,0,0.5);">NEW</div>`
            : '';

        // ★ 5. 替換成背包的 HTML 結構，並塞入 NEW 標籤
        cardEl.innerHTML = `
            <div class="card-img-wrapper">
                <img src="${imgPath}" onerror="this.src='img/characters/default.png'">
                <div class="card-attr-badge" style="color:${attrColor}; text-shadow:0 0 3px black;">${attrIcon}</div>
                <div class="card-rarity-badge">${char.rarity}</div>
                ${newBadgeHTML}
            </div>
            
            <div class="card-info">
                <div class="card-name">${char.name}</div>
                <div class="card-stats">
                    <span>⚔️ ${atk}</span>
                    <span>❤️ ${hp}</span>
                </div>
            </div>
        `;

        grid.appendChild(cardEl);
    });

    // ★ 6. 加入確認按鈕 (不然會卡在遮罩畫面關不掉)
    let closeBtn = overlay.querySelector('.close-btn');
    if (!closeBtn) {
        closeBtn = document.createElement('button');
        closeBtn.className = 'close-btn';
        closeBtn.innerText = '確 認';
        closeBtn.onclick = window.closeGachaResult;
        overlay.appendChild(closeBtn);
    }
}
window.closeGachaResult = function () {
    document.getElementById('gacha-result-overlay').style.display = 'none';
    document.body.style.overflow = 'auto';
}

// ==========================================
// 6. 戰鬥與配對 (Matchmaking)
// ==========================================
window.checkTeamStatus = function () {
    const statusText = document.getElementById('match-status');
    const battleBtn = document.getElementById('find-match-btn');
    if (!statusText || !battleBtn) return;

    const count = window.currentTeam.filter(id => id !== null).length;
    if (count < 5) {
        statusText.innerHTML = `<span style="color:#ff4444">隊伍不完整 (${count}/5)</span>`;
        battleBtn.disabled = true;
        battleBtn.style.opacity = "0.5";
    } else {
        statusText.innerHTML = `<span style="color:#44ff44">隊伍已就緒</span>`;
        battleBtn.disabled = false;
        battleBtn.style.opacity = "1";
    }
}

let isSearching = false;
window.handleFindMatch = async function () {
    const user = auth.currentUser;
    if (!user) return alert("請先登入");
    const btn = document.getElementById('find-match-btn');

    if (!isSearching) {
        const myTeamData = currentTeam.map(id => {
            if (!id) return null;
            const char = myInventoryData[id];
            return char ? { ...char, max_hp: char.hp || 100 } : null;
        }).filter(t => t !== null);

        if (myTeamData.length < 5) return alert("請先配置 5 人隊伍！");

        isSearching = true;
        btn.innerText = "CANCEL";
        btn.style.background = "red";
        await Matchmaking.findMatch(user, myTeamData);
    } else {
        isSearching = false;
        btn.innerText = "START BATTLE";
        btn.style.background = "linear-gradient(45deg, #ff00cc, #3333ff)";
        await Matchmaking.cancelMatch(user);
    }
};

// ==========================================
// 7. 測試工具 (DevTools)
// ==========================================
window.test_addCoins = async function (amount) {
    const user = auth.currentUser;
    if (user) {
        const refUser = ref(db, `users/${user.uid}/coins`);
        const snap = await get(refUser);
        await set(refUser, (snap.val() || 0) + amount);
        console.log(`已增加 ${amount} 金幣`);
    }
}

window.test_clearCards = async function () {
    const user = auth.currentUser;
    if (user && confirm("確定清空？")) {
        await remove(ref(db, `users/${user.uid}/inventory`));
        await remove(ref(db, `users/${user.uid}/team`));
        console.log("資料已重置");
    }
};


// ==========================================
// CARD DETAIL MODAL (遊戲王格式)
// ==========================================
(function injectCardModalStyle() {
    const style = document.createElement('style');
    style.textContent = `
    #card-detail-modal {
        display: none;
        position: fixed;
        top: 0; left: 0; right: 0; bottom: 0;
        width: 100%; height: 100%;
        background: rgba(0,0,0,0.85);
        -webkit-backdrop-filter: blur(4px);
        backdrop-filter: blur(4px);
        z-index: 9999999;
        justify-content: center;
        align-items: center;
        padding: 20px;
        box-sizing: border-box;
    }
    #card-detail-modal.open {
        display: flex;
    }
    .cdm-sheet {
        background: linear-gradient(160deg, #16161e, #0a0a0d);
        border: 1px solid #333;
        border-radius: 20px;
        width: 100%;
        max-width: 560px;
        padding: 26px 26px 30px;
        box-sizing: border-box;
        animation: cdmPop 0.28s cubic-bezier(0.34,1.3,0.64,1);
        position: relative;
        max-height: 92vh;
        overflow-y: auto;
        box-shadow: 0 24px 70px rgba(0,0,0,0.7);
    }
    @keyframes cdmPop {
        from { transform: scale(0.92) translateY(20px); opacity: 0; }
        to   { transform: scale(1) translateY(0);       opacity: 1; }
    }
    .cdm-close {
        position: absolute;
        top: 16px; right: 18px;
        background: rgba(255,255,255,0.06);
        border: none;
        width: 32px; height: 32px;
        border-radius: 50%;
        color: #aaa; font-size: 1.1rem;
        cursor: pointer; line-height: 1;
        display: flex; align-items: center; justify-content: center;
        transition: background 0.2s;
        z-index: 2;
    }
    .cdm-close:hover { background: rgba(255,255,255,0.15); color: #fff; }
    .cdm-top {
        display: flex;
        gap: 20px;
        margin-bottom: 20px;
    }
    .cdm-img {
        width: 150px;
        height: 200px;
        object-fit: cover;
        object-position: top center;
        border-radius: 12px;
        border: 2px solid #333;
        flex-shrink: 0;
        box-shadow: 0 6px 20px rgba(0,0,0,0.5);
    }
    .cdm-meta {
        flex: 1;
        display: flex;
        flex-direction: column;
        gap: 8px;
        min-width: 0;
    }
    .cdm-name {
        font-family: 'Orbitron', sans-serif;
        font-size: 1.4rem;
        color: #fff;
        font-weight: 700;
        letter-spacing: 1px;
        word-break: break-word;
    }
    .cdm-rarity-line {
        display: flex;
        align-items: center;
        gap: 10px;
        flex-wrap: wrap;
    }
    .cdm-rarity-badge {
        font-size: 0.8rem;
        font-weight: bold;
        padding: 3px 12px;
        border-radius: 5px;
        border: 1px solid;
    }
    .cdm-rarity-R   { color: #60a5fa; border-color: #60a5fa; }
    .cdm-rarity-SR  { color: #a855f7; border-color: #a855f7; }
    .cdm-rarity-SSR { color: #ffd700; border-color: #ffd700;
                      background: rgba(255,215,0,0.08); }
    .cdm-attr {
        font-size: 1.1rem;
    }
    .cdm-stats {
        display: flex;
        gap: 10px;
        margin-top: auto;
    }
    .cdm-stat-box {
        background: #1a1a22;
        border: 1px solid #333;
        border-radius: 8px;
        padding: 8px 10px;
        text-align: center;
        flex: 1;
    }
    .cdm-stat-label {
        font-size: 0.6rem;
        color: #777;
        letter-spacing: 1px;
        text-transform: uppercase;
        margin-bottom: 2px;
    }
    .cdm-stat-value {
        font-size: 1.2rem;
        font-weight: bold;
        color: #eee;
    }
    .cdm-divider {
        border: none;
        border-top: 1px solid #2a2a35;
        margin: 16px 0;
    }
    .cdm-section-title {
        font-size: 0.7rem;
        letter-spacing: 2px;
        color: #555;
        text-transform: uppercase;
        margin-bottom: 10px;
    }
    .cdm-skill-box {
        background: #111118;
        border: 1px solid #2a2a3a;
        border-radius: 12px;
        padding: 14px 16px;
        margin-bottom: 12px;
    }
    .cdm-skill-header {
        display: flex;
        align-items: center;
        gap: 10px;
        margin-bottom: 7px;
    }
    .cdm-skill-type {
        font-size: 0.65rem;
        padding: 3px 9px;
        border-radius: 4px;
        font-weight: bold;
        letter-spacing: 1px;
        flex-shrink: 0;
    }
    .cdm-skill-type.active  { background: #7c3aed; color: #e9d5ff; }
    .cdm-skill-type.passive { background: #1e4d2b; color: #6ee7b7; }
    .cdm-skill-name {
        font-size: 1.05rem;
        color: #e2d9f3;
        font-weight: 600;
    }
    .cdm-skill-trigger {
        font-size: 0.78rem;
        color: #665c7a;
        margin-bottom: 8px;
    }
    .cdm-skill-desc {
        font-size: 0.88rem;
        color: #aaa;
        line-height: 1.65;
        border-top: 1px solid #222;
        padding-top: 10px;
        margin-top: 2px;
    }
    .cdm-no-skill {
        color: #444;
        font-size: 0.85rem;
        text-align: center;
        padding: 20px 0;
    }
    .cdm-team-btn {
        width: 100%;
        margin-top: 18px;
        padding: 16px;
        border: none;
        border-radius: 14px;
        font-size: 1.05rem;
        font-weight: bold;
        cursor: pointer;
        font-family: 'Orbitron', sans-serif;
        letter-spacing: 1px;
        transition: 0.2s;
    }
    .cdm-team-btn.add    { background: linear-gradient(135deg,#7c3aed,#4f46e5); color:#fff; }
    .cdm-team-btn.remove { background: linear-gradient(135deg,#b91c1c,#991b1b); color:#fff; }
    .cdm-team-btn:active { transform: scale(0.97); }

    /* 手機版：底部彈出 + 卡圖更大 */
    @media (max-width: 768px) {
        #card-detail-modal {
            align-items: flex-end;
            padding: 0;
        }
        .cdm-sheet {
            max-width: 100%;
            border-radius: 20px 20px 0 0;
            border-left: none; border-right: none; border-bottom: none;
            padding: 22px 18px 34px;
            animation: cdmSlideUp 0.28s ease;
            max-height: 90vh;
        }
        @keyframes cdmSlideUp {
            from { transform: translateY(100%); }
            to   { transform: translateY(0); }
        }
        .cdm-top {
            flex-direction: column;
            align-items: center;
            text-align: center;
            gap: 14px;
        }
        .cdm-img {
            width: 180px;
            height: 240px;
        }
        .cdm-meta { align-items: center; width: 100%; }
        .cdm-name { font-size: 1.5rem; }
        .cdm-stats { width: 100%; margin-top: 6px; }
        .cdm-skill-header { flex-wrap: wrap; }
    }
    `;
    document.head.appendChild(style);

    // Inject modal HTML
    const modal = document.createElement('div');
    modal.id = 'card-detail-modal';
    modal.innerHTML = `<div class="cdm-sheet"><button class="cdm-close" onclick="window.closeCardModal()">✕</button><div id="cdm-content"></div></div>`;
    document.body.appendChild(modal);
    modal.addEventListener('click', function(e){ if(e.target===modal) window.closeCardModal(); });
})();

const TRIGGER_LABELS = {
    'on_win_duel':    '猜拳獲勝時發動',
    'on_lose_duel':   '猜拳落敗時發動',
    'on_move':        '移動時自動觸發',
    'on_defend':      '被攻擊時自動觸發',
    'on_death':       '死亡時自動觸發',
    'on_turn_start':  '每回合開始時觸發',
    'on_attack':      '攻擊時發動',
};

window.openCardModal = function(id) {
    const char = window.myInventoryData[id];
    if (!char) return;

    const config = window.ATTR_CONFIG || {};
    const attrData = config[(char.attribute||'').toLowerCase()] || { icon:'❓', color:'#999', label:'?' };
    const imgPath = window.getCharImage(id);
    const isInTeam = window.currentTeam && window.currentTeam.some(m => String(m) === String(id));
    const count = char.count || 1;

    // Build skill HTML
    function buildSkill(skill, type) {
        if (!skill) return '';
        const label = type === 'active' ? '主動技' : '被動技';
        const trigLabel = TRIGGER_LABELS[skill.trigger] || skill.trigger || '';
        return `
        <div class="cdm-skill-box">
            <div class="cdm-skill-header">
                <span class="cdm-skill-type ${type}">${label}</span>
                <span class="cdm-skill-name">${skill.name || '未命名'}</span>
            </div>
            ${trigLabel ? `<div class="cdm-skill-trigger">◆ ${trigLabel}</div>` : ''}
            <div class="cdm-skill-desc">${skill.desc || '（說明尚未填寫）'}</div>
        </div>`;
    }

    function buildLeader(leader) {
        if (!leader) return '';
        return `
        <div class="cdm-skill-box cdm-leader-box">
            <div class="cdm-skill-header">
                <span class="cdm-skill-type leader">隊長技</span>
                <span class="cdm-skill-name">${leader.name}</span>
            </div>
            <div class="cdm-skill-desc">${leader.desc.replace('【隊長技】','')}</div>
        </div>`;
    }

    const activeHTML  = buildSkill(char.active,  'active');
    const passiveHTML = buildSkill(char.passive, 'passive');
    const leaderHTML  = char.rarity === 'SSR' ? buildLeader(char.leader) : '';

    const hasSkill = char.active || char.passive || (char.rarity === 'SSR' && char.leader);
    const noSkill  = !hasSkill ? `<div class="cdm-no-skill">此卡尚無技能資料</div>` : '';

    document.getElementById('cdm-content').innerHTML = `
        <div class="cdm-top">
            <img class="cdm-img" src="${imgPath}" onerror="this.src='img/characters/default.png'">
            <div class="cdm-meta">
                <div class="cdm-name">${char.name}</div>
                <div class="cdm-rarity-line">
                    <span class="cdm-rarity-badge cdm-rarity-${char.rarity}">${char.rarity}</span>
                    <span class="cdm-attr" style="color:${attrData.color}">${attrData.icon} ${attrData.label}</span>
                </div>
                <div class="cdm-stats">
                    <div class="cdm-stat-box">
                        <div class="cdm-stat-label">ATK</div>
                        <div class="cdm-stat-value" style="color:#ff6b6b">${char.attack||0}</div>
                    </div>
                    <div class="cdm-stat-box">
                        <div class="cdm-stat-label">HP</div>
                        <div class="cdm-stat-value" style="color:#6bff9e">${char.hp||0}</div>
                    </div>
                    <div class="cdm-stat-box">
                        <div class="cdm-stat-label">持有</div>
                        <div class="cdm-stat-value" style="color:#ffd700">×${count}</div>
                    </div>
                </div>
            </div>
        </div>
        <hr class="cdm-divider">
        <div class="cdm-section-title">技能</div>
        ${activeHTML}${passiveHTML}${leaderHTML}${noSkill}
        <button class="cdm-team-btn ${isInTeam ? 'remove' : 'add'}"
            onclick="window.handleCardClick('${id}'); window.closeCardModal();">
            ${isInTeam ? '⊖ 從隊伍移除' : '⊕ 加入隊伍'}
        </button>
    `;

    document.getElementById('card-detail-modal').classList.add('open');
};

window.closeCardModal = function() {
    document.getElementById('card-detail-modal').classList.remove('open');
};


// ==========================================
// 8. 導航按鈕綁定 (事件委派 - 相容所有瀏覽器)
// ==========================================

const NAV_MAP = {
    'nav-lobby':    'lobby-view',
    'nav-char':     'char-view',
    'nav-summon':   'summon-view',
    'nav-glossary': 'glossary-view',
    'nav-history':  'history-view',
};

// 事件委派：綁在 document 上，不管按鈕何時生成、module 何時載入都有效
document.addEventListener('click', function (e) {
    // 遮罩點擊關閉 (div，需單獨判斷)
    if (e.target && e.target.id === 'tab-overlay') {
        window.closeTabPanel();
        return;
    }

    const el = e.target.closest('button, [data-action], [data-nav]');
    if (!el) return;
    const id = el.id;

    // --- 桌面側欄導航 ---
    if (NAV_MAP[id]) {
        if (window.switchView) window.switchView(NAV_MAP[id]);
        document.querySelectorAll('.menu-items button').forEach(b => b.classList.remove('active'));
        el.classList.add('active');
        return;
    }

    if (id === 'quick-team-btn')   { window.openQuickTeam();  return; }
    if (id === 'quick-team-close') { window.closeQuickTeam(); return; }

    // --- 手機 tab bar ---
    if (id === 'tab-feature')  { window.togglePanel('feature');  return; }
    if (id === 'tab-settings') { window.togglePanel('settings'); return; }
    if (id === 'tab-duel')     { window.tabNav('lobby-view', 'tab-duel'); return; }

    // --- 手機面板內按鈕 (用 data-attr) ---
    const navTo = el.getAttribute('data-nav');
    if (navTo) {
        const btnRef = el.getAttribute('data-ref') || '';
        window.tabNav(navTo, btnRef);
        return;
    }
    if (el.getAttribute('data-action') === 'logout') {
        window.doLogout();
        return;
    }

    // --- 排序 / 召喚 / 關閉抽卡結果 ---
    const action = el.getAttribute('data-action');
    if (action === 'sort')        { if (window.toggleSort) window.toggleSort(); return; }
    if (action === 'summon')      { const n = parseInt(el.getAttribute('data-count'), 10) || 1; if (window.handleSummon) window.handleSummon(n); return; }
    if (action === 'close-gacha') { if (window.closeGachaResult) window.closeGachaResult(); return; }

    // --- 登入 / 登出 ---
    if (id === 'find-match-btn') {
        // already handled below by existing code
    }
    if (id === 'vs-cpu-btn') {
        const team = (window.currentTeam || []).filter(Boolean).map(id => window.myInventoryData?.[String(id)]).filter(Boolean);
        if (team.length === 0) { alert('請先在「我的角色」配置至少1張卡！'); return; }
        initCpuGame(team);
        return;
    }
    if (id === 'google-login-btn') { AuthUser.loginWithGoogle(); return; }
    if (id === 'logout-btn')       { AuthUser.logoutUser();      return; }

    // --- 遮罩關閉面板 ---
    if (id === 'tab-overlay') { window.closeTabPanel(); return; }
});

// 初始化預設高亮狀態 (不依賴 DOMContentLoaded)
function initNavState() {
    const defaultBtn = document.getElementById('nav-lobby');
    if (defaultBtn) defaultBtn.classList.add('active');
    const duelTab = document.getElementById('tab-duel');
    if (duelTab) duelTab.classList.add('tab-active');
}
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initNavState);
} else {
    initNavState();
}

console.log("✅ 事件綁定完成，main.js 執行到底");
