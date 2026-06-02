// js/board.js
// ==========================================
// 棋盤渲染、點擊處理、行動選單、卡片資訊框
// 不包含任何對局邏輯，只負責 UI 呈現與輸入
// ==========================================

import { gameState, getBattleAttr, CPU_UID } from './state.js';

// 由 game.js / cpu.js 注入的回呼，board.js 本身不知道決鬥/移動細節
let _onMove = null;
let _onDuel = null;
let _onSkill = null;
let _onTurnTimeout = null;

export function setBoardCallbacks({ onMove, onDuel, onSkill, onTurnTimeout }) {
    _onMove         = onMove;
    _onDuel         = onDuel;
    _onSkill        = onSkill;
    _onTurnTimeout  = onTurnTimeout || null;
}

// ==========================================
// 棋盤渲染
// ==========================================
export function renderBoard(gameData) {
    window._lastGameData = gameData; // 供 closeCardInfo 重建選單用
    const boardEl = document.getElementById('chess-board');
    if (!boardEl) return;
    boardEl.innerHTML = '';

    const amIHost  = gameData.player1 === gameState.myUid;
    const shouldFlip = amIHost;
    const isMyTurn   = gameData.turn === gameState.myUid;

    // 回合提示
    const turnText = document.getElementById('turn-text');
    if (turnText) {
        turnText.innerHTML = isMyTurn
            ? `<span style="color:#4facfe">🟢 你的回合</span>`
            : `<span style="color:#ff4444">🔴 對手回合</span>`;
    }

    // 換到對手回合時清除行動狀態（保留檢視選取）
    if (!isMyTurn) {
        gameState.selectedIndex     = -1;
        gameState.pendingActionIndex = -1;
        gameState.moveMode          = false;
        closeActionMenu();
    } else {
        // ★ 換到自己回合時，重置 actionUsed（保險措施）
        gameState.actionUsed = false;
    }

    for (let visualIndex = 0; visualIndex < 30; visualIndex++) {
        const realIndex = shouldFlip ? (29 - visualIndex) : visualIndex;
        const cell = gameState.board[realIndex];
        const div  = document.createElement('div');

        div.style.cssText = `
            width:100%; border-radius:8px; position:relative;
            display:flex; justify-content:center; align-items:center;
            cursor:pointer; box-shadow:inset 0 0 5px rgba(0,0,0,0.5);
            background:#262626; border:1px solid #333; overflow:hidden;
            transition:border 0.1s, box-shadow 0.1s;
        `;

        // 行動選取（黃色）
        if (realIndex === gameState.selectedIndex) {
            div.style.border    = '2px solid #ffff00';
            div.style.boxShadow = '0 0 18px rgba(255,255,0,0.8), inset 0 0 8px rgba(255,255,0,0.2)';
            div.style.zIndex    = '5';
            if (gameState.moveMode) {
                div.style.animation = 'selectedPulse 0.8s ease-in-out infinite alternate';
            }
        }
        // 檢視選取（青色）
        else if (realIndex === gameState.infoSelectedIndex) {
            div.style.border    = '2px solid #22d3ee';
            div.style.boxShadow = '0 0 18px rgba(34,211,238,0.8), inset 0 0 8px rgba(34,211,238,0.2)';
            div.style.zIndex    = '5';
        }

        if (cell) {
            const isMine     = cell.owner === gameState.myUid;
            const attrData   = getBattleAttr(cell.attribute);
            const atk        = cell.attack || 50;
            const currentHp  = cell.hp !== undefined ? cell.hp : 100;
            const maxHp      = cell.max_hp || currentHp || 100;
            const hpPercent  = Math.max(0, Math.min(100, (currentHp / maxHp) * 100));
            const borderColor = isMine ? '#4facfe' : '#ff4444';
            const hpColor     = isMine ? '#00ff00' : '#ff0000';

            if (realIndex !== gameState.selectedIndex && realIndex !== gameState.infoSelectedIndex) {
                div.style.border = `2px solid ${borderColor}`;
            }

            const idStr       = String(cell.id);
            const battleImg   = `img/characters/${idStr}battle.webp`;
            const fallbackImg = 'img/characters/default.png';

            div.innerHTML = `
                <div class="battle-card" style="width:100%;height:100%;border:none;border-radius:0;">
                    <div class="battle-img-area">
                        <img src="${battleImg}" onerror="this.src='${fallbackImg}'">
                        <div class="battle-attr" style="color:${attrData.color};">${attrData.icon}</div>
                        <div class="battle-atk">${atk}</div>
                    </div>
                    <div class="battle-hp-container">
                        <div class="battle-hp-text">${currentHp}</div>
                        <div class="battle-hp-bar-bg">
                            <div class="battle-hp-bar-fill" style="width:${hpPercent}%;background:${hpColor};"></div>
                        </div>
                    </div>
                </div>
            `;
        }

        div.onclick = () => handleSquareClick(realIndex, cell, gameData);
        boardEl.appendChild(div);
    }
}

// ==========================================
// 點擊處理
// ==========================================
async function handleSquareClick(index, cell, gameData) {
    if (gameData.duel) return;

    const canAct = (gameData.turn === gameState.myUid) && !gameState.actionUsed;

    // ★ 診斷 log
    console.log('[CLICK]', {
        index,
        cellOwner: cell?.owner,
        myUid: gameState.myUid,
        turn: gameData.turn,
        isMyTurn: gameData.turn === gameState.myUid,
        actionUsed: gameState.actionUsed,
        canAct,
    });

    // ── 無法行動：只能查看 ──
    if (!canAct) {
        if (!cell) {
            gameState.infoSelectedIndex = -1;
            closeActionMenu();
            closeCardInfo();
            renderBoard(gameData);
            return;
        }
        gameState.infoSelectedIndex = index;
        closeActionMenu();
        renderBoard(gameData);
        showInfoOnlyBtn(index, cell);
        return;
    }

    // ── 移動模式 ──
    if (gameState.moveMode) {
        // 改選另一隻自己的棋子
        if (cell && cell.owner === gameState.myUid && index !== gameState.selectedIndex) {
            gameState.moveMode          = false;
            gameState.selectedIndex     = index;
            gameState.pendingActionIndex = index;
            gameState.infoSelectedIndex  = index;
            closeActionMenu();
            renderBoard(gameData);
            showActionMenu(index, cell, gameData);
            return;
        }

        const from = gameState.selectedIndex;
        const to   = index;

        if (from === to) {
            gameState.moveMode          = false;
            gameState.selectedIndex     = -1;
            gameState.pendingActionIndex = -1;
            closeActionMenu();
            renderBoard(gameData);
            return;
        }

        const diff       = Math.abs(from - to);
        const isSameRow  = Math.floor(from / 5) === Math.floor(to / 5);
        const validMove  = (diff === 1 && isSameRow) || diff === 5;

        if (!validMove) {
            gameState.moveMode          = false;
            gameState.selectedIndex     = -1;
            gameState.pendingActionIndex = -1;
            renderBoard(gameData);
            return;
        }

        const board    = [...gameState.board];
        const attacker = board[from];
        const defender = board[to];

        gameState.moveMode          = false;
        gameState.selectedIndex     = -1;
        gameState.pendingActionIndex = -1;
        gameState.infoSelectedIndex  = -1;
        gameState.actionUsed        = true;
        closeCardInfo();

        if (!defender) {
            board[to]   = attacker;
            board[from] = null;
            if (_onMove) await _onMove(from, to, board, gameData);
        } else if (defender.owner !== gameState.myUid) {
            if (_onDuel) await _onDuel(from, to, gameData);
        }
        return;
    }

    // ── 點對方棋子：顯示資訊按鈕 ──
    if (cell && cell.owner !== gameState.myUid) {
        gameState.infoSelectedIndex  = index;
        gameState.selectedIndex      = -1;
        gameState.pendingActionIndex = -1;
        closeActionMenu();
        closeCardInfo();
        renderBoard(gameData);
        showInfoOnlyBtn(index, cell);
        return;
    }

    // ── 有選單開著：點其他地方 ──
    if (gameState.pendingActionIndex !== -1 && index !== gameState.pendingActionIndex) {
        closeActionMenu();
        if (cell && cell.owner === gameState.myUid) {
            gameState.selectedIndex      = index;
            gameState.pendingActionIndex = index;
            gameState.infoSelectedIndex  = index;
            renderBoard(gameData);
            showActionMenu(index, cell, gameData);
        } else {
            gameState.selectedIndex      = -1;
            gameState.pendingActionIndex = -1;
            gameState.infoSelectedIndex  = -1;
            closeCardInfo();
            renderBoard(gameData);
        }
        return;
    }

    // ── 第一次點自己的棋子 ──
    if (gameState.selectedIndex === -1 && cell && cell.owner === gameState.myUid) {
        gameState.selectedIndex      = index;
        gameState.pendingActionIndex = index;
        gameState.infoSelectedIndex  = index;
        renderBoard(gameData);
        showActionMenu(index, cell, gameData);
    }
}

// ==========================================
// 行動列（固定在棋盤下方一排）
// ==========================================
export function showActionMenu(index, cell, gameData) {
    closeActionMenu();
    const hasActive = !!(cell.active);

    const bar = _makeActionBar();

    // 移動
    const moveBtn = _makeBarBtn('action-move', '🚶', '移動');
    moveBtn.onclick = (e) => {
        e.stopPropagation(); e.preventDefault();
        closeActionMenu();
        gameState.moveMode           = true;
        gameState.pendingActionIndex = -1;
        renderBoard(gameData);
        showToast('選擇要移動到的格子');
    };

    // 技能
    const skillBtn = _makeBarBtn(
        'action-skill' + (hasActive ? '' : ' no-skill'),
        hasActive ? '✨' : '—',
        hasActive ? '技能' : '無技能'
    );
    skillBtn.onclick = (e) => {
        e.stopPropagation(); e.preventDefault();
        if (!hasActive) { showToast('此卡無主動技能'); return; }
        closeActionMenu();
        if (_onSkill) _onSkill(index, cell, gameData);
        gameState.selectedIndex      = -1;
        gameState.pendingActionIndex = -1;
        gameState.moveMode           = false;
        renderBoard(gameData);
    };

    // 資訊
    const infoBtn = _makeBarBtn('action-info', '📋', '資訊');
    infoBtn.onclick = (e) => {
        e.stopPropagation(); e.preventDefault();
        if (document.getElementById('card-info-box')) { closeCardInfo(); return; }
        showCardInfo(cell);
    };

    bar.appendChild(moveBtn);
    bar.appendChild(skillBtn);
    bar.appendChild(infoBtn);
    document.body.appendChild(bar);
}

function _makeActionBar() {
    const bar = document.createElement('div');
    bar.id = 'action-bar';
    bar.className = 'action-float';
    bar.style.cssText = `
        position:fixed; left:50%; transform:translateX(-50%);
        bottom:84px; display:flex; gap:10px; z-index:9000;
        background:rgba(10,10,18,0.92); padding:8px 12px;
        border-radius:16px; border:1px solid #1e293b;
        box-shadow:0 6px 24px rgba(0,0,0,0.6);
    `;
    return bar;
}

function _makeBarBtn(className, emoji, label) {
    const btn = document.createElement('button');
    btn.className = `action-btn ${className}`;
    btn.innerHTML = `${emoji}<span>${label}</span>`;
    btn.style.cssText = `width:64px; height:56px;`;
    return btn;
}


// ── Toast 提示 ──
export function showToast(msg, duration = 1800) {
    const existing = document.getElementById('game-toast');
    if (existing) existing.remove();
    const t = document.createElement('div');
    t.id = 'game-toast';
    t.textContent = msg;
    t.style.cssText = `
        position:fixed; left:50%; transform:translateX(-50%);
        bottom:160px; background:rgba(30,30,40,0.95);
        color:#e2e8f0; font-size:0.9rem; padding:10px 20px;
        border-radius:20px; border:1px solid #475569;
        z-index:99999; pointer-events:none;
        animation:toastIn 0.2s ease;
        box-shadow:0 4px 20px rgba(0,0,0,0.5);
        white-space:nowrap;
    `;
    document.body.appendChild(t);
    setTimeout(() => { if (t.parentNode) t.remove(); }, duration);
}
export function closeActionMenu() {
    document.querySelectorAll('.action-float').forEach(el => el.remove());
}

// 只有資訊按鈕（用於對方棋子或對方回合）
function showInfoOnlyBtn(index, cell) {
    closeActionMenu();
    const bar = _makeActionBar();
    const infoBtn = _makeBarBtn('action-info', '📋', '資訊');
    infoBtn.onclick = (e) => {
        e.stopPropagation(); e.preventDefault();
        if (document.getElementById('card-info-box')) { closeCardInfo(); return; }
        showCardInfo(cell);
    };
    bar.appendChild(infoBtn);
    document.body.appendChild(bar);
}

// ==========================================
// 卡片資訊框
// ==========================================
export function showCardInfo(cell) {
    closeCardInfo();
    closeActionMenu(); // 開資訊時收掉行動列，避免疊住
    if (!cell) return;

    const attrData = getBattleAttr(cell.attribute);
    const rarity   = cell.rarity || 'R';
    const rc = { R: '#94a3b8', SR: '#a855f7', SSR: '#ffd700' }[rarity] || '#94a3b8';
    const rg = { R: 'rgba(148,163,184,0.15)', SR: 'rgba(168,85,247,0.15)', SSR: 'rgba(255,215,0,0.15)' }[rarity] || 'transparent';

    const TRIGGER_LABELS = {
        on_win_duel: '猜拳勝後', on_lose_duel: '猜拳敗後',
        on_attack: '攻擊時', on_defend: '被攻擊時',
        on_move: '移動時', on_death: '死亡時', on_turn_start: '回合開始'
    };

    const buildSkill = (skill, type) => {
        if (!skill) return '';
        const cfg = {
            active:  { label:'主動技', bg:'#4c1d95', border:'#7c3aed', dot:'#a78bfa' },
            passive: { label:'被動技', bg:'#14532d', border:'#15803d', dot:'#4ade80' },
            leader:  { label:'隊長技', bg:'#78350f', border:'#b45309', dot:'#fcd34d' },
        }[type] || {};
        const trig = TRIGGER_LABELS[skill.trigger] || '';
        return `
        <div style="border-radius:10px;border:1px solid ${cfg.border};background:${cfg.bg}22;padding:10px 12px;margin-bottom:8px;">
            <div style="display:flex;align-items:center;gap:7px;margin-bottom:5px;">
                <span style="font-size:0.58rem;font-weight:bold;padding:2px 7px;border-radius:4px;background:${cfg.bg};border:1px solid ${cfg.border};color:#fff;">${cfg.label}</span>
                <span style="font-size:0.88rem;font-weight:700;color:#e2e8f0;">${skill.name || ''}</span>
            </div>
            ${trig ? `<div style="font-size:0.65rem;color:${cfg.dot};margin-bottom:5px;">◆ ${trig}</div>` : ''}
            <div style="font-size:0.75rem;color:#94a3b8;line-height:1.6;">${(skill.desc||'').replace('【隊長技】','')}</div>
        </div>`;
    };

    const currentHp = cell.hp ?? cell.max_hp ?? 0;
    const maxHp     = cell.max_hp ?? currentHp;
    const hpPct     = maxHp > 0 ? Math.round((currentHp / maxHp) * 100) : 100;
    const hpColor   = hpPct > 60 ? '#4ade80' : hpPct > 30 ? '#facc15' : '#f87171';

    const skillsHTML = (cell.active || cell.passive || (rarity === 'SSR' && cell.leader))
        ? buildSkill(cell.active, 'active') + buildSkill(cell.passive, 'passive') + (rarity === 'SSR' ? buildSkill(cell.leader, 'leader') : '')
        : `<div style="color:#475569;font-size:0.78rem;text-align:center;padding:14px 0;">此卡尚無技能資料</div>`;

    const box = document.createElement('div');
    box.id = 'card-info-box';
    box.innerHTML = `
        <!-- 頂部列：左 屬性+稀有度，右 X -->
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:14px;">
            <div style="display:flex;align-items:center;gap:8px;">
                <span style="font-size:1.5rem;filter:drop-shadow(0 0 6px ${attrData.color});">${attrData.icon}</span>
                <span style="font-size:0.65rem;font-weight:bold;color:${rc};border:1px solid ${rc};border-radius:4px;padding:2px 8px;background:${rg};letter-spacing:1px;">${rarity}</span>
            </div>
            <button id="card-info-close" style="background:rgba(255,255,255,0.06);border:1px solid #334155;color:#94a3b8;width:30px;height:30px;border-radius:50%;cursor:pointer;font-size:1rem;display:flex;align-items:center;justify-content:center;flex-shrink:0;">✕</button>
        </div>

        <!-- 大角色圖 -->
        <div style="text-align:center;margin-bottom:10px;">
            <img src="img/characters/${String(cell.id)}.webp"
                 onerror="this.src='img/characters/default.png'"
                 style="width:140px;height:186px;object-fit:cover;object-position:top;
                        border-radius:12px;border:2px solid ${rc};
                        box-shadow:0 6px 20px rgba(0,0,0,0.6), 0 0 12px ${rg};">
        </div>

        <!-- 角色名字（圖下方置中）-->
        <div style="text-align:center;font-size:1.25rem;font-weight:700;color:#f1f5f9;font-family:'Orbitron',sans-serif;letter-spacing:2px;margin-bottom:14px;">
            ${cell.name || '???'}
        </div>

        <!-- ATK / HP 數據 -->
        <div style="display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:10px;">
            <div style="background:#0f172a;border:1px solid #1e293b;border-radius:8px;padding:8px;text-align:center;">
                <div style="font-size:0.55rem;letter-spacing:1px;color:#64748b;margin-bottom:2px;">ATK</div>
                <div style="font-size:1.1rem;font-weight:bold;color:#f87171;">${cell.attack || 0}</div>
            </div>
            <div style="background:#0f172a;border:1px solid #1e293b;border-radius:8px;padding:8px;text-align:center;">
                <div style="font-size:0.55rem;letter-spacing:1px;color:#64748b;margin-bottom:2px;">HP</div>
                <div style="font-size:1.1rem;font-weight:bold;color:${hpColor};">${currentHp}<span style="font-size:0.7rem;color:#64748b;">/${maxHp}</span></div>
            </div>
        </div>

        <!-- HP 條 -->
        <div style="background:#0f172a;border-radius:6px;overflow:hidden;margin-bottom:14px;height:6px;">
            <div style="width:${hpPct}%;height:100%;background:${hpColor};border-radius:6px;box-shadow:0 0 8px ${hpColor}66;"></div>
        </div>

        <!-- 技能 -->
        <div style="font-size:0.6rem;letter-spacing:2px;color:#475569;margin-bottom:8px;text-transform:uppercase;">技能</div>
        ${skillsHTML}
    `;
    box.style.cssText = `
        position:fixed; left:50%; top:50%; transform:translate(-50%, -50%);
        width:min(92vw, 520px); max-height:75vh;
        background:linear-gradient(160deg,#1e293b,#0f172a);
        border:1px solid #334155; border-radius:16px;
        padding:16px 18px; z-index:100000;
        box-shadow:0 20px 60px rgba(0,0,0,0.8),0 0 0 1px rgba(255,255,255,0.04);
        animation:cardInfoUp 0.22s cubic-bezier(0.34,1.3,0.64,1);
        overflow-y:auto; -webkit-overflow-scrolling:touch;
    `;
    // 半透明背景遮罩（點外面關閉）
    const backdrop = document.createElement('div');
    backdrop.id = 'card-info-backdrop';
    backdrop.style.cssText = `
        position:fixed; inset:0; z-index:99999;
        background:rgba(0,0,0,0.7);
    `;
    backdrop.onclick = () => closeCardInfo();
    document.body.appendChild(backdrop);

    document.body.appendChild(box);
    document.getElementById('card-info-close').onclick = (e) => {
        e.stopPropagation();
        closeCardInfo();
    };
}


// ==========================================
// 戰鬥日誌
// ==========================================
const _battleLog = [];

export function addBattleLog(logs) {
    if (!Array.isArray(logs)) logs = [logs];
    logs.forEach(l => _battleLog.push(l));
    // 上限 50 筆，超過就截掉最舊的
    if (_battleLog.length > 50) _battleLog.splice(0, _battleLog.length - 50);
    _renderBattleLog();
}

export function clearBattleLog() {
    _battleLog.length = 0;
    _renderBattleLog();
}

export function addTurnHeader(turnNum, isMe) {
    _battleLog.push({
        type: 'turn',
        text: `── 回合 ${turnNum}　${isMe ? '你的回合' : '對手回合'} ──`,
        color: isMe ? '#4facfe' : '#ff6b6b'
    });
    _renderBattleLog();
}

function _renderBattleLog() {
    const panel = document.getElementById('battle-log-list');
    if (!panel) return;

    const COLOR_MAP = {
        red:    '#f87171',
        green:  '#4ade80',
        yellow: '#facc15',
        orange: '#fb923c',
        cyan:   '#22d3ee',
        purple: '#c084fc',
        gray:   '#64748b',
        white:  '#e2e8f0',
    };

    panel.innerHTML = _battleLog.slice(-50).map(log => {
        const c = COLOR_MAP[log.color] || '#cbd5e1';
        const weight = log.type === 'turn' ? '600' : 'normal';
        const size   = log.type === 'turn' ? '0.72rem' : '0.7rem';
        const mt     = log.type === 'turn' ? 'margin-top:6px;' : '';
        return `<div style="color:${c};font-weight:${weight};font-size:${size};${mt}line-height:1.35;padding:0;">${log.text}</div>`;
    }).join('');

    // 自動捲到底
    panel.scrollTop = panel.scrollHeight;
    // 同步按鈕文字顯示最新一筆
    const btn = document.getElementById('battle-log-btn');
    if (btn && _battleLog.length > 0) {
        const last = _battleLog[_battleLog.length - 1];
        btn.textContent = `📋 ${last.text.slice(0, 20)}...`;
    }
}

export function buildBattleLogPanel() { /* 已整合進 buildGameUI */ }


// ==========================================
// 決鬥後攻擊動畫（純 CSS，1.2 秒）
// ==========================================
export function showDuelAnimation(winnerIdx, loserIdx) {
    const boardEl = document.getElementById('chess-board');
    if (!boardEl) return;
    const cells = boardEl.querySelectorAll(':scope > div');
    const wCell = cells[winnerIdx];
    const lCell = cells[loserIdx];

    if (wCell) {
        wCell.style.animation = 'none'; // 重置
        wCell.offsetHeight; // 強制 reflow
        wCell.style.animation = 'duelWin 1.2s ease-out';
        setTimeout(() => { if (wCell) wCell.style.animation = ''; }, 1300);
    }
    if (lCell) {
        lCell.style.animation = 'none';
        lCell.offsetHeight;
        lCell.style.animation = 'duelLose 1.2s ease-out';
        setTimeout(() => { if (lCell) lCell.style.animation = ''; }, 1300);
    }
}

// 浮字特效
export function showFloatingText(cellIndex, text, color = '#fff') {
    const boardEl = document.getElementById('chess-board');
    if (!boardEl) return;
    const cells = boardEl.querySelectorAll(':scope > div');
    const cell  = cells[cellIndex];
    if (!cell) return;

    const rect = cell.getBoundingClientRect();
    const el   = document.createElement('div');
    el.textContent = text;
    el.style.cssText = `
        position:fixed;
        left:${rect.left + rect.width / 2}px;
        top:${rect.top}px;
        transform:translateX(-50%);
        color:${color};
        font-size:0.9rem;
        font-weight:bold;
        pointer-events:none;
        z-index:99999;
        text-shadow:0 2px 6px rgba(0,0,0,0.8);
        animation:floatUp 1s ease forwards;
    `;
    document.body.appendChild(el);
    setTimeout(() => el.remove(), 1000);
}

export function closeCardInfo() {
    const box = document.getElementById('card-info-box');
    if (box) box.remove();
    const backdrop = document.getElementById('card-info-backdrop');
    if (backdrop) backdrop.remove();

    // 如果有選中的自己棋子，重新顯示行動列
    if (gameState.selectedIndex !== -1 && !gameState.moveMode) {
        const cell = gameState.board[gameState.selectedIndex];
        if (cell && cell.owner === gameState.myUid) {
            // 需要 gameData 才能重建選單，用最後一次的 gameData
            if (window._lastGameData) {
                showActionMenu(gameState.selectedIndex, cell, window._lastGameData);
            }
        }
    }
}

// ==========================================
// 計時器
// ==========================================
export function updateTimer(gameData) {
    if (gameState.timerInterval) {
        clearInterval(gameState.timerInterval);
        gameState.timerInterval = null;
    }
    const timerText = document.getElementById('timer-text');
    if (!timerText) return;
    const turnStart = gameData.turn_start_time;
    if (!turnStart) return;

    const TURN_LIMIT = 30;
    gameState.timerInterval = setInterval(() => {
        const elapsed  = Math.floor((Date.now() - turnStart) / 1000);
        const timeLeft = Math.max(0, TURN_LIMIT - elapsed);
        const el = document.getElementById('timer-text');
        if (el) {
            el.innerText = timeLeft + 's';
            el.style.color = timeLeft <= 10 ? '#ff4444' : '#00ff00';
        }
        if (timeLeft <= 0) {
            clearInterval(gameState.timerInterval);
            gameState.timerInterval = null;
            // 時間到：若是自己回合，自動跳過（換對方）
            if (gameData.turn === gameState.myUid && _onTurnTimeout) {
                _onTurnTimeout(gameData);
            }
        }
    }, 500);
}

// ==========================================
// 建立遊戲 UI（棋盤容器、HUD、決鬥 modal）
// ==========================================
export function buildGameUI(gameArea) {
    gameArea.innerHTML = `
        <div id="game-container" style="display:flex;flex-direction:column;align-items:center;width:100%;max-width:540px;margin:0 auto;">

            <!-- HUD -->
            <div id="game-hud" style="display:flex;align-items:center;justify-content:space-between;width:100%;padding:6px 4px 10px;flex-shrink:0;">
                <div id="timer-box" style="background:rgba(0,0,0,0.85);border:2px solid #666;border-radius:12px;padding:4px 16px;text-align:center;box-shadow:0 4px 12px rgba(0,0,0,0.6);">
                    <span id="timer-text" style="color:#ff4444;font-weight:bold;font-size:1.4rem;font-family:monospace;letter-spacing:1px;">30s</span>
                </div>
                <div id="turn-text" style="font-size:1rem;font-weight:bold;color:white;background:rgba(255,255,255,0.1);padding:4px 14px;border-radius:20px;">等待開始...</div>
            </div>

            <!-- 棋盤 -->
            <div style="width:100%;display:flex;justify-content:center;flex-shrink:0;">
                <div id="chess-board" style="display:grid;grid-template-columns:repeat(5,1fr);grid-template-rows:repeat(6,1fr);gap:4px;width:100%;max-width:480px;aspect-ratio:5/7.2;background:#2b2b2b;padding:6px;border-radius:12px;box-shadow:0 8px 24px rgba(0,0,0,0.5);"></div>
            </div>

            <!-- 決鬥選項（棋盤正下方，in-flow，不 fixed）-->
            <div id="duel-modal" style="display:none;position:static;flex-direction:column;align-items:center;width:100%;max-width:480px;padding:10px 8px 8px;margin-top:8px;background:linear-gradient(0deg,rgba(8,8,14,0.99),rgba(8,8,14,0.92));border:1px solid #1e293b;border-radius:12px;flex-shrink:0;">
                <div style="display:flex;align-items:center;gap:10px;margin-bottom:8px;justify-content:center;">
                    <span style="color:#ff00cc;font-family:'Orbitron';font-size:0.9rem;">⚔️ DUEL</span>
                    <span id="duel-timer" style="font-size:1.4rem;color:#ffeb3b;font-weight:bold;text-shadow:0 0 10px #ffeb3b;min-width:26px;text-align:center;">10</span>
                    <span id="duel-status" style="color:#94a3b8;font-size:0.8rem;">選擇命運</span>
                </div>
                <div id="rps-buttons" style="display:flex;gap:6px;width:100%;">
                    <button class="rps-btn duel-btn-attack" data-choice="attack" onclick="submitDuelChoice('attack')">⚔️<span>攻擊</span><small>剋魔法</small></button>
                    <button class="rps-btn duel-btn-magic"  data-choice="magic"  onclick="submitDuelChoice('magic')">✨<span>魔法</span><small>剋陷阱</small></button>
                    <button class="rps-btn duel-btn-trap"   data-choice="trap"   onclick="submitDuelChoice('trap')">🪤<span>陷阱</span><small>剋攻擊</small></button>
                    <button class="rps-btn duel-btn-defend" data-choice="defend" onclick="submitDuelChoice('defend')">🛡️<span>防禦</span><small>減傷</small></button>
                </div>
            </div>

            <!-- 戰鬥日誌按鈕（點開全螢幕）-->
            <div style="width:100%;max-width:480px;margin-top:8px;display:flex;justify-content:center;">
                <button id="battle-log-btn" style="
                    background:rgba(10,10,18,0.85);border:1px solid #1e293b;
                    border-radius:10px;padding:7px 20px;color:#475569;
                    font-size:0.72rem;letter-spacing:2px;cursor:pointer;
                    font-weight:bold;width:100%;
                ">📋 BATTLE LOG</button>
            </div>

        </div>

        <!-- 戰鬥日誌 overlay（彈窗形式，不滿版）-->
        <div id="battle-log-overlay" style="display:none;position:fixed;inset:0;background:rgba(0,0,0,0.7);z-index:99999;align-items:center;justify-content:center;padding:20px;box-sizing:border-box;" onclick="if(event.target===this)this.style.display='none'">
            <div style="background:#0f172a;border:1px solid #334155;border-radius:14px;width:100%;max-width:520px;max-height:75vh;display:flex;flex-direction:column;box-shadow:0 20px 60px rgba(0,0,0,0.8);" onclick="event.stopPropagation()">
                <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 16px;border-bottom:1px solid #1e293b;flex-shrink:0;">
                    <span style="font-size:0.75rem;font-weight:bold;color:#64748b;letter-spacing:2px;">📋 BATTLE LOG</span>
                    <button id="battle-log-close" style="background:rgba(255,255,255,0.06);border:1px solid #334155;color:#94a3b8;width:28px;height:28px;border-radius:50%;cursor:pointer;font-size:0.9rem;">✕</button>
                </div>
                <div id="battle-log-list" style="flex:1;overflow-y:auto;padding:10px 14px;-webkit-overflow-scrolling:touch;"></div>
            </div>
        </div>
    `;

    // 日誌按鈕開關
    const btn   = document.getElementById('battle-log-btn');
    const overlay = document.getElementById('battle-log-overlay');
    const closeBtn = document.getElementById('battle-log-close');
    if (btn && overlay) {
        btn.onclick = () => { overlay.style.display = 'flex'; };
        closeBtn.onclick = () => { overlay.style.display = 'none'; };
    }
}
