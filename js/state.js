// js/state.js
// ==========================================
// 統一遊戲狀態管理
// 所有模組透過此物件讀寫狀態，避免散變數互相干擾
// ==========================================

export const gameState = {
    // ── 對局資訊 ──
    gameId: null,
    role: null,          // 'host' | 'joiner' | 'cpu'
    myUid: null,
    board: [],
    isCpuMode: false,

    // ── 決鬥狀態 ──
    isResolving: false,
    duelCountdownInterval: null,

    // ── 計時器 ──
    timerInterval: null,

    // ── 棋盤選取狀態 ──
    selectedIndex: -1,       // 行動選取（黃框）
    infoSelectedIndex: -1,   // 檢視選取（青框）
    pendingActionIndex: -1,
    moveMode: false,
    actionUsed: false,

    // ── 重置行動狀態（換回合時呼叫） ──
    resetActionState() {
        this.selectedIndex = -1;
        this.infoSelectedIndex = -1;
        this.pendingActionIndex = -1;
        this.moveMode = false;
        this.actionUsed = false;
    },

    // ── 重置整局狀態（新遊戲開始時呼叫） ──
    resetAll() {
        this.gameId = null;
        this.role = null;
        this.myUid = null;
        this.board = [];
        this.isCpuMode = false;
        this.isResolving = false;
        if (this.duelCountdownInterval) {
            clearInterval(this.duelCountdownInterval);
            this.duelCountdownInterval = null;
        }
        if (this.timerInterval) {
            clearInterval(this.timerInterval);
            this.timerInterval = null;
        }
        this.resetActionState();
    }
};

// ── 屬性設定（共用常數） ──
export const BATTLE_ATTR_CONFIG = {
    fire:  { icon: '🔥', color: '#ff6b35', label: '火' },
    water: { icon: '💧', color: '#4facfe', label: '水' },
    grass: { icon: '🌿', color: '#52c41a', label: '草' },
    light: { icon: '✨', color: '#ffd700', label: '光' },
    dark:  { icon: '🌑', color: '#a855f7', label: '暗' },
};

export function getBattleAttr(attr) {
    return BATTLE_ATTR_CONFIG[(attr || '').toLowerCase()] || { icon: '❓', color: '#aaa', label: '?' };
}

export const CPU_UID = 'cpu_opponent';
