/**
 * 妮妮訂單查詢系統 - 前端邏輯
 */

document.addEventListener('DOMContentLoaded', () => {
    console.log("JS 啟動成功！目前的頁面是：", window.location.pathname);
// --- 1. 側邊選單通用邏輯 (每一頁都有用) ---
    const menuToggle = document.getElementById('menu-toggle'); // 三條線按鈕
    console.log("漢堡鈕物件狀態：", menuToggle); // 如果顯示 null，就是 HTML ID 寫錯了
    const menuClose = document.getElementById('menu-close');   // 側邊欄內的叉叉
    const sideMenu = document.getElementById('side-menu');     // 選單容器
    const overlay = document.getElementById('overlay');       // 霧面背景

    // 打開選單
    if (menuToggle && sideMenu && overlay) {
        menuToggle.addEventListener('click', () => {
            sideMenu.classList.add('active');
            overlay.classList.add('active');
        });
    }

   // 關閉選單 (寫成一個 function 讓叉叉和霧面背景都能用)
    const closeMenu = () => {
        if (sideMenu) sideMenu.classList.remove('active');
        if (overlay) overlay.classList.remove('active');
    };

    if (menuClose) menuClose.addEventListener('click', closeMenu);
    if (overlay) overlay.addEventListener('click', closeMenu);


    // --- 2. 只有特定頁面才跑的邏輯 (用 if 防呆) ---
    
    // 只有首頁有公告
    if (document.getElementById('notice-list')) {
        loadNotices();
    }

// --- 初始化輪播圖 (加入防呆) ---
    // 💡 只有當畫面上存在 .swiper 這個元素時，才執行 Swiper 初始化
    const swiperElement = document.querySelector('.swiper');
    if (swiperElement) {
        const swiper = new Swiper('.swiper', {
            loop: true,
            autoplay: { delay: 3000, disableOnInteraction: false },
            pagination: { el: '.swiper-pagination', clickable: true },
        });
    }
    
    // --- 2. 查詢按鈕處理 ---
    const submitBtn = document.getElementById('submit-query');
    if (submitBtn) {
        submitBtn.addEventListener('click', () => {
            const community = document.getElementById('community-name').value.trim();
            const phone = document.getElementById('phone-number').value.trim();

            if (!community || !phone) {
                alert('妮妮提醒：資訊要填完整喔！');
                return;
            }

            window.location.href = `query.html?community=${encodeURIComponent(community)}&phone=${encodeURIComponent(phone)}`;
        });
    }
    
    // 💡 加分題：如果是從首頁跳過來的，自動幫他查一次
    autoQueryOnLoad();
    // 在原本的選單邏輯下方加入這段 布告欄談窗開關
    const confirmBtn = document.getElementById('modal-confirm');
    const modal = document.getElementById('notice-modal');

    if (confirmBtn) confirmBtn.onclick = closeNoticeModal;
    
    // 點擊彈窗以外的區域（背景遮罩）也要能關閉
    window.onclick = (event) => {
        if (event.target == modal) {
            closeNoticeModal();
        }
    };
});

// 自動查詢功能
function autoQueryOnLoad() {
    const params = new URLSearchParams(window.location.search);
    const comm = params.get('community');
    const phone = params.get('phone');
    
    if (comm && phone && document.getElementById('cards-container')) {
        // 把網址帶過來的參數填入輸入框
        document.getElementById('community-name').value = comm;
        document.getElementById('phone-number').value = phone;
        // 直接啟動查詢
        fetchDataFromGAS(comm, phone);
    }
}
/**
 * 通用查詢函式
 */
function fetchDataFromGAS(community, phone) {
    const scriptURL = 'https://script.google.com/macros/s/AKfycbzsi7XRN0ZlzP5KX-_5D01Uleb8zBaux1hyAdnTI8yVh6q9NGN6LAx2uHNioVWVIgMe/exec';
    
    const container = document.getElementById('cards-container'); 
    const resultSection = document.getElementById('result-section');
    const btn = document.getElementById('submit-query');

    // 💡 1. 開始查詢：按鈕變灰並禁用 (loading 樣式)
    if (btn) {
        btn.classList.add('loading'); // 加上我們剛剛定義的灰色樣式
        btn.disabled = true;          // 實體禁用，防止重複連點
        btn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> 尋找中...'; 
    }

    fetch(`${scriptURL}?community=${encodeURIComponent(community)}&phone=${encodeURIComponent(phone)}`)
        .then(response => response.json())
        .then(data => {
            console.log("收到資料:", data);
            
            // 💡 檢查容器是否存在 (防呆)
            if (!container) return;

            if (data.status === 'success' && data.orders && data.orders.length > 0) {
                const sorted = data.orders.sort((a, b) => b.dateValue - a.dateValue);
                container.innerHTML = sorted.map(order => {
                    const statusMap = {
                        '已完成': 'status-done',
                        '已出貨': 'status-shipped',
                        '已抵台': 'status-arrived',
                        '運回中': 'status-transit',
                        '已購入': 'status-bought',
                        '待採買': 'status-pending',
                        '已取消': 'status-cancelled',
                    };
                    const statusClass = statusMap[order.status] || 'status-pending';
                    const balanceAmount = parseFloat(order.balance) || 0;
                    const hasBalance = balanceAmount > 0;

                    return `
                        <div class="order-card">
                            <div class="card-header">
                                <span class="type-tag">${order.type || '一般'}</span>
                                <span class="order-date">${order.date}</span>
                                <span class="status-badge ${statusClass}">${order.status}</span>
                            </div>
                            <div class="item-name">${order.item}</div> 
                            <div class="price-info">
                                <div class="price-item">
                                    <i class="fas fa-coins"></i><span>價格</span>
                                    <strong>$${order.price}</strong>
                                </div>
                                <div class="price-item">
                                    <i class="fas fa-check-circle"></i><span>已付</span>
                                    <strong>$${order.paid}</strong>
                                </div>
                                <div class="price-item ${hasBalance ? 'has-balance-item' : ''}">
                                    <i class="fas fa-wallet"></i><span>剩餘</span>
                                    <strong>$${order.balance}</strong>
                                </div>
                            </div>
                        </div>
                    `;
                }).join('');
                if (resultSection) resultSection.style.display = 'block';
            } else {
                container.innerHTML = '<p style="text-align:center; padding:20px;">找不到您的訂單，請檢查輸入資訊喔！</p>';
                if (resultSection) resultSection.style.display = 'block';
            }
        })
        .catch(error => {
            console.error('發生錯誤:', error);
            if (container) container.innerHTML = '<p style="text-align:center; color:red;">連線失敗，請檢查網路。</p>';
        })
        .finally(() => {
            // 💡 2. 結束查詢：恢復按鈕原本樣式
            if (btn) {
                btn.classList.remove('loading');
                btn.disabled = false;
                btn.innerHTML = '<i class="fas fa-magic"></i> 開始查詢';
            }
        });
}

let allNotices = [];
let currentPage = 1;
const rowsPerPage = 7;

// 載入公告資料公告資料公告資料公告資料公告資料公告資料
function loadNotices() {
    // 💡 先檢查有沒有公告欄，沒有的話就直接收工
    if (!document.getElementById('notice-list')) return;
    
    fetch('notices.json')
        .then(res => res.json())
        .then(data => {
            allNotices = data.sort((a, b) => b.id - a.id); // 按 ID 倒序排列
            displayNotices(currentPage);
        })
        .catch(err => console.error("公告讀取失敗:", err));
}

function displayNotices(page) {
    const listElement = document.getElementById('notice-list');
    const paginationElement = document.getElementById('pagination');
    listElement.innerHTML = "";
    
    // 計算分頁範圍
    const start = (page - 1) * rowsPerPage;
    const end = start + rowsPerPage;
    const paginatedItems = allNotices.slice(start, end);

    // 渲染公告 (只顯示標題)[cite: 4]
    paginatedItems.forEach(item => {
        const div = document.createElement('div');
        div.className = 'notice-item';
        div.innerHTML = `
            <div class="notice-tag">${item.tag}</div>
            <div class="notice-body">
                <span class="date">${item.date}</span>
                <p><strong>${item.title}</strong></p>
            </div>
        `;
        // 點擊可以 alert 顯示內容 (或展開)
       div.onclick = () => openNoticeModal(item); 
        listElement.appendChild(div);
    });
    // 渲染分頁按鈕
    renderPagination(allNotices.length, page);
}

function renderPagination(totalItems, page) {
    const paginationElement = document.getElementById('pagination');
    const pageCount = Math.ceil(totalItems / rowsPerPage);
    paginationElement.innerHTML = "";

    for (let i = 1; i <= pageCount; i++) {
        const btn = document.createElement('button');
        btn.innerText = i;
        btn.className = (i === page) ? 'page-btn active' : 'page-btn';
        btn.onclick = () => {
            currentPage = i;
            displayNotices(currentPage);
        };
        paginationElement.appendChild(btn);
    }
}


/**
 * 彈窗控制功能[cite: 2, 4]
 */

// 顯示彈窗：把 JSON 裡的資料塞進 HTML 標籤裡
function openNoticeModal(item) {
    const modal = document.getElementById('notice-modal');
    document.getElementById('modal-title').innerText = item.title;
    document.getElementById('modal-date').innerText = item.date;
    document.getElementById('modal-text').innerText = item.content;
    
    modal.style.display = 'flex'; // 讓隱藏的彈窗顯示出來
}

// 關閉彈窗
function closeNoticeModal() {
    document.getElementById('notice-modal').style.display = 'none';
}