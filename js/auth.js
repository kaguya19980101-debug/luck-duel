// js/auth.js
import { signInWithPopup, signOut } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { auth, googleProvider } from "./firebase-config.js";

// 執行 Google 登入
export async function loginWithGoogle() {
    try {
        const result = await signInWithPopup(auth, googleProvider);
        return result.user; // 回傳使用者資料
    } catch (error) {
        console.error("登入錯誤:", error);
        throw error; // 把錯誤丟出去讓 UI 處理
    }
}

// 執行登出
export async function logoutUser() {
    try {
        await signOut(auth);
        window.location.reload(); // 強制重整頁面
    } catch (error) {
        console.error("登出錯誤:", error);
    }
}