// js/firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-app.js";
import { getAuth, GoogleAuthProvider } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-auth.js";
import { getDatabase } from "https://www.gstatic.com/firebasejs/10.7.1/firebase-database.js";

// ★★★ 請在此填入您的 Key ★★★
const firebaseConfig = {
  apiKey: "AIzaSyDCZ__HNE5qurMz5mQFws6Q0CaGurIO388",
  authDomain: "game-demo-565a5.firebaseapp.com",
  databaseURL: "https://game-demo-565a5-default-rtdb.firebaseio.com",
  projectId: "game-demo-565a5",
  storageBucket: "game-demo-565a5.firebasestorage.app",
  messagingSenderId: "487510632373",
  appId: "1:487510632373:web:0a89a3d3d24a544295dbfc",
  measurementId: "G-38LXFBSMX7"
};

// 初始化 App
const app = initializeApp(firebaseConfig);

// 匯出功能給其他模組使用
export const auth = getAuth(app);
export const db = getDatabase(app);
export const googleProvider = new GoogleAuthProvider();