// js/ui.js

// DOM 元素快取
const elements = {
    loginScreen: document.getElementById('login-screen'),
    appInterface: document.getElementById('app-interface'),
    loginMsg: document.getElementById('login-msg'),
    userName: document.getElementById('user-name'),
    userAvatar: document.getElementById('user-avatar'),
    loadingOverlay: document.getElementById('loading-overlay') // 預留給讀取畫面
};

// 切換到「已登入狀態」
export function showAppInterface(user) {
    elements.loginScreen.classList.add('hide');
    elements.appInterface.classList.remove('hide');
    
    // 更新使用者資訊
    elements.userName.innerText = user.displayName;
    elements.userAvatar.src = user.photoURL;
}

// 切換到「登入畫面」
export function showLoginScreen() {
    elements.loginScreen.classList.remove('hide');
    elements.appInterface.classList.add('hide');
}

// 顯示錯誤訊息
export function showLoginError(message) {
    elements.loginMsg.innerText = message;
    elements.loginMsg.style.color = "red";
}

// 顯示讀取中
export function showLoading(isLoading) {
    if(isLoading) {
        elements.loginMsg.innerText = "系統連線中...";
    } else {
        elements.loginMsg.innerText = "";
    }
}