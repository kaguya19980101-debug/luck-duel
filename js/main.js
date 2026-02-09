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
onAuthStateChanged(auth, (user) => {
    if (user) {
        console.log("系統: 使用者已連線", user.uid);
        
        
        // 儲存資料... (保留您之前的 saveUserProfile)
        // UI.showAppInterface(user); (保留)
        UI.showAppInterface(user);
        
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