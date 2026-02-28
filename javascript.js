let currentUser = null; 
let cart = []; 
let masterBooks = []; 
let currentScanner = null; 
let gpsPromise = null;
let currentLoanCount = 0;
window.CONFIG = window.CONFIG || {};

/**
 * @brief 画面操作のロック（二重送信防止）
 * @details 
 * 通信中にユーザーがボタンを連打して、二重に貸出処理が走るのを防ぐ。
 * ページ全体のクリック・タップイベントを一時的に無効化。
 */
function lockScreen() { 
    document.body.style.pointerEvents = 'none'; 
}

/**
 * @brief 画面操作のロック解除および読み込み表示の非表示
 * @details 
 * サーバーからのレスポンスが返ってきた際、操作権限をユーザーに戻し、
 * ローディング画面（スピナー）を隠す。
 */
function unlockScreen() { 
  document.getElementById('loading').style.display = 'none';
  document.body.style.pointerEvents = 'auto'; 
}

/**
 * @brief ユーザーへの簡易通知（トースト）を表示する
 * @details 
 * 画面下部（または上部）に一定時間だけメッセージを表示。
 * - 警告フラグ (`isWarning`): true の場合、背景を赤色（dangerカラー）、
 * 　視認性を高めると同時に表示時間を長く（5秒）設定。
 * - 透過度 (`opacity`): CSSの transition と組み合わせて、フェードイン・アウトを実現。
 * * @param {string} msg - 表示するメッセージ
 * @param {boolean} isWarning - 警告表示（赤背景）にするかどうか
 */
let toastTimer = null;
function showToast(msg, isWarning = false) {
    const t = document.getElementById('toast');
    if (!t) return;

    // すでに動いているタイマーがあれば、一旦キャンセル（リセット）する
    if (toastTimer) {
        clearTimeout(toastTimer);
    }

    t.innerText = String(msg).trim();
    t.style.background = isWarning ? "rgba(220, 38, 38, 0.95)" : "rgba(15, 23, 42, 0.95)";
    
    // 表示を開始
    t.style.opacity = '1';

    // 指定時間後に消す（タイマーを新しくセット）
    const duration = isWarning ? 5000 : (CONFIG.TIMEOUT.TOAST_DISPLAY || 3000);
    
    toastTimer = setTimeout(() => {
        t.style.opacity = '0';
        toastTimer = null; // タイマー終了後に管理変数を空にする
    }, duration);
}

/**
 * @brief ローディング画面のテキストを動的に書き換える
 * @details 
 * 「認証中...」「GPS取得中...」など、現在バックグラウンドで何が行われているかを
 * ユーザーに伝えるために使用。
 * @param {string} main - メインの進捗メッセージ
 * @param {string} sub - 補足説明（任意）
 */
function setLoadingMessage(main, sub = "") {
  const t = document.getElementById('loadingText');
  const s = document.getElementById('loadingSubText');
  if (t) t.innerText = main;
  if (s) s.innerText = sub;
}

/**
 * @brief 初回登録（パスワード設定）ページへ遷移する
 * @details 
 * google.script.run を介してサーバーからWebアプリのベースURLを取得し、
 * クエリパラメータ `?page=sign_up` を付与してリダイレクトする。
 */
function goToSignup() {
  google.script.run.withSuccessHandler(function(url) {
    window.top.location.href = url + "?page=sign_up";
  }).getAppUrl();
}

async function callGasApi(payload) {
    const GAS_URL = "https://script.google.com/macros/s/AKfycbyolxvaK5ZRUZ5RxXjWcoLAGJgcVuN1ZQsxXxJfFxxHghtmdmhA1jFaNZWldvcPsb_L/exec";
  
  // URLパラメータにactionを付与してGETで送る（GASの制約上、GETの方が結果を受け取りやすいため）
  const queryParams = new URLSearchParams(payload);
  const response = await fetch(`${GAS_URL}?${queryParams.toString()}`, {
    method: 'GET'
  });
  return await response.json();
}
/**
 * @brief ログイン処理を実行し、UIをメイン画面に切り替える
 * @details 
 * 1. 入力バリデーション（空チェック）。
 * 2. サーバーの `checkAuth` を呼び出し。
 * 3. 成功時：ユーザー名、パスワード（セッション用）、蔵書データをメモリに保持しメイン画面を表示。
 * 4. 初回登録が必要な場合：サーバーから返された `targetUrl` を使って登録画面へ誘導。
 */
async function login() {
  const email = document.getElementById('email').value.trim();
  const pass = document.getElementById('pass').value.trim();
  if (!email || !pass) return showToast(CONFIG.MSG.LOGIN_REQUIRED);
  setLoadingMessage(CONFIG.MSG.AUTH_LOADING);
  document.getElementById('loading').style.display = 'flex';

  try {
  const res = await callGasApi({
      action: 'checkAuth',
      email: email,
      pass: pass
    });
    document.getElementById('loading').style.display = 'none';
    if (res && res.success) {
      // --- 修正ポイント：トークンをブラウザに保存 ---
      sessionStorage.setItem(CONFIG.STORAGE_KEY.TOKEN, res.token);
      sessionStorage.setItem(CONFIG.STORAGE_KEY.EMAIL, email);

      currentUser = res.userName;
      masterBooks = res.allBooks || [];
      currentLoanCount = res.currentLoanCount || 0;

      document.getElementById('loginSection').style.display = 'none';
      document.getElementById('mainSection').style.display = 'block';
      document.getElementById('userDisp').innerText = currentUser;

      switchTab(CONFIG.TABS.MY_PAGE);        
      renderMyLoans(); 
      updateCartUI();
    } else if (res.needsRegistration) {
      openNoticeModal(
        CONFIG.MSG.WELCOME_MSG,
        CONFIG.MSG.FIRST_LOGIN,
        () => {
          if (res.targetUrl) {
            window.top.location.href = res.targetUrl + "?page=sign_up";
          }
        });
    } else { 
      showToast(res.message || CONFIG.MSG.AUTH_FAILED, true); 
    }
  } catch (e) {
    document.getElementById('loading').style.display = 'none'; 
    showToast(CONFIG.MSG.SERVER_ERROR, true);
    console.error(e);
  }
}

/**
 * @brief ログアウト処理を行い、状態をリセットする
 * @details 
 * トークン削除、カメラを停止し、ユーザー情報やカートを初期化してログイン画面に戻す。
 */
function logout() {
  stopAllScanners().then(() => {
    sessionStorage.removeItem(CONFIG.STORAGE_KEY.TOKEN);
    sessionStorage.removeItem(CONFIG.STORAGE_KEY.EMAIL);
    currentUser = null; cart = []; gpsPromise = null;
    showLoginSection();
    document.getElementById('searchInput').value = "";
    updateCartUI(); 
    switchTab(CONFIG.TABS.MY_PAGE);
    unlockScreen();
  });
}



/**
 * @brief パスワードリセット用モーダルを表示
 */
function openResetModal() {
  const overlay = document.getElementById('customModalOverlay');
  if (!overlay) return;

  document.getElementById('modalTitle').innerText = CONFIG.MSG.RESET_PASS_TITLE;
  document.getElementById('modalMessage').innerText = CONFIG.MSG.RESET_PASS_SUB;
  
  document.getElementById('modalInputArea').style.display = 'block';
  document.getElementById('modalCancelBtn').style.display = 'block';
  
  // ★通信を待機するため async を追加
  document.getElementById('modalOkBtn').onclick = async () => {
    const email = document.getElementById('modalEmailInput').value.trim();
    if (!email) return showToast(CONFIG.MSG.RESET_PASS_ERR, true);
    
    closeCustomModal();
    setLoadingMessage(CONFIG.MSG.SENDING, CONFIG.MSG.RESET_PASS_REQ);
    document.getElementById('loading').style.display = 'flex';
    
    // --- google.script.run を callGasApi に書き換え ---
    try {
      const res = await callGasApi({
        action: 'requestPasswordReset',
        email: email
      });

      // --- SuccessHandler の中身ここから ---
      if (res === false) {
        handleAuthError();
        return;
      }
      document.getElementById('loading').style.display = 'none';
      if (res.success) {
        showToast(CONFIG.MSG.RESET_PASS_SENT);
      } else {
        showToast(res.message, true);
      }
      // --- SuccessHandler の中身ここまで ---

    } catch (e) {
      // --- FailureHandler の代わり ---
      document.getElementById('loading').style.display = 'none';
      showToast(CONFIG.MSG.SERVER_ERROR, true);
      console.error(e);
    }
  };
  overlay.style.display = 'flex';
}
  async function stopAllScanners() {
    if (currentScanner) { try { await currentScanner.stop(); currentScanner = null; } catch (e) {} }
    const bReader = document.getElementById('bookReader');
    const aReader = document.getElementById('adminQrReader');
    if (bReader) bReader.innerHTML = ""; 
    if (aReader) aReader.innerHTML = "";
  }

  function switchTab(idx) {
    stopAllScanners(); 
    document.querySelectorAll('.tab-content').forEach((el, i) => { el.style.display = (i === idx) ? 'block' : 'none'; });
    document.querySelectorAll('.nav-item').forEach((el, i) => { el.classList.toggle('active', i === idx); });
    const scanArea = document.getElementById('scanBtnArea');
    if (scanArea) scanArea.style.display = CONFIG.USE_SCANNER ? "block" : "none";
    document.getElementById('bookReaderContainer').style.display = "none";
    if (idx === 0) renderMyLoans();
    if (idx === 1) renderComplexLists();
  }

/**
 * @brief ログイン中ユーザーが現在借りている本のリストを表示する
 * @details 
 * `masterBooks`（全データ）から、自分の名前と「貸出中」ステータスでフィルタリングする。
 * - 借りている本がない場合は、プレースホルダー（本のアイコン）を表示。
 * - リスト内の本をタップすると `addToCart` が走り、返却準備（返却カートへの追加）。
 * - すでにカートに入っている本は背景色を変え、チェックマークを表示。
 */
function renderMyLoans() {
  const list = document.getElementById('myLoanList');
  if (!list) return;
  
  const myBooks = masterBooks.filter(b => b.status === CONFIG.STATUS.ON_LOAN && String(b.user).trim() === String(currentUser).trim());
  
  if (myBooks.length === 0) {
    list.innerHTML = `<div style="text-align:center; padding:30px; color:#94a3b8; font-size:14px;">
                        <span class="material-icons" style="font-size:48px; display:block; margin-bottom:10px; opacity:0.3;">menu_book</span>
                        ${CONFIG.MSG.NO_LOAN_DATA}
                      </div>`;
    return;
  }

  const now = new Date();
  now.setHours(0, 0, 0, 0);

  list.innerHTML = myBooks.map((b, index) => {
    const isInCart = cart.includes(b.title);
    const escTitle = b.title.replace(/'/g, "\\'");
    const bgColor = isInCart ? "background:#e0f2fe;" : "background:#fff;";
    const icon = isInCart ? "done_all" : "add_task";

    // --- 返却期限の計算と色判定 ---
    let dateDisplay = b.dueDate || '-';
    let dateStyle = "color: #64748b;"; 

    if (b.dueDate) {
      const parts = b.dueDate.split('/');
      if (parts.length === 2) {
        const due = new Date(now.getFullYear(), parseInt(parts[0]) - 1, parseInt(parts[1]));
        const diffDays = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
        if (diffDays <= window.CONFIG.LIMIT_DAYS) {
          dateStyle = "color: #ef4444; font-weight: bold;"; 
        } else if (diffDays <= window.CONFIG.ALERT_DAYS) {
          dateStyle = "color: #f59e0b; font-weight: bold;"; 
        }
      }
    }

    // --- 【追加】本棚情報の作成 ---
    const shelfInfo = b.bookshelf 
      ? `<div style="display:inline-flex; align-items:center; gap:3px; font-size:10px; color:#64748b; background:#f1f5f9; padding:1px 6px; border-radius:4px; margin-top:4px;">
           <span class="material-icons" style="font-size:12px;">grid_view</span>${b.bookshelf}
         </div>` 
      : "";

    return `
      <div id="myloan-row-${index}" class="list-row" style="display:flex; align-items:center; border-bottom:1px solid #f1f5f9; ${bgColor} transition:0.2s; min-height:70px;">
        <div style="flex:1; padding:12px; overflow:hidden;">
          <div class="col-title" style="font-weight:bold; white-space:nowrap; overflow:hidden; text-overflow:ellipsis; font-size:14px;">${b.title}</div>
          <div style="font-size:11px; color:#94a3b8; margin-top:2px;">${b.author || ''}</div>
          ${shelfInfo} 
        </div>
        <div style="display:flex; align-items:center; flex-shrink:0;">
          <div style="text-align:right; margin-right:4px;">
            <div style="font-size:9px; color:#94a3b8; margin-bottom:-2px;">${CONFIG.LABEL.DUE_DATE_SHORT}</div>
            <div style="font-size:13px; ${dateStyle}">${dateDisplay}</div>
          </div>
          <div id="myloan-btn-${index}" style="width:54px; height:64px; display:flex; align-items:center; justify-content:center; cursor:pointer;" onclick="addToCart('${escTitle}', 'myloan', ${index})">
            <span class="material-icons" style="color:#2563eb; font-size:28px;">${icon}</span>
          </div>
        </div>
      </div>`;
  }).join('');
}

/**
 * @brief 蔵書検索リストをフィルタリングして表示する
 * @details 
 * 検索キーワード（前方一致）または「すべて表示」トグルに基づいてリストを生成する。
 * - **自分:** 「あなたが借用中」バッジを表示。
 * - **他人:** 貸出中なら操作不可にし、半透明（opacity 0.7）にして視覚的に区別。
 * - **在庫:** 「在庫あり」を表示し、カート追加ボタンを有効化。
 * * @param {boolean} isAll - 強制的に全件表示するかどうかのフラグ
 */
function renderComplexLists() {
  const now = new Date(); 
  const threeDaysAgo = new Date(); threeDaysAgo.setDate(now.getDate() - 3); threeDaysAgo.setHours(0, 0, 0, 0);
  const rented = masterBooks.filter(b => b.status === CONFIG.STATUS.ON_LOAN);
  document.getElementById('content-rented').innerHTML = rented.map(b => 
  `<div class="list-row" style="align-items: center;">
    <div style="flex:1; overflow:hidden;">
      <div class="col-title" style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${b.title}</div>
      <div style="font-size:11px; color:#64748b;">
        ${'著: '+b.author || ''} 
        <span style="margin-left:8px; color:var(--primary); font-weight:bold;">${b.user ? '(' + b.user + 'さんが利用中)' : ''}</span>
      </div>
    </div>
    <span class="col-date" style="flex-shrink:0;">${b.dueDate || '-'}${CONFIG.LABEL.UNTIL}</span>
  </div>`
).join('') || `<div class="list-row">${CONFIG.MSG.NO_DATA}</div>`;
  const returned = masterBooks.filter(b => {
  if (b.status !== CONFIG.STATUS.IN_STOCK || !b.lastReturnDate) return false;
  const parts = b.lastReturnDate.split('/'); if (parts.length !== 2) return false;
  const returnDate = new Date(now.getFullYear(), parseInt(parts[0]) - 1, parseInt(parts[1])); return returnDate >= threeDaysAgo;
  });
  document.getElementById('content-returned').innerHTML = returned.map(b => 
    `<div class="list-row">
      <div style="flex:1;">
        <div class="col-title">${b.title}</div>
        <div style="font-size:11px; color:#64748b;">${b.author || ''}</div>
      </div>
      <span class="col-date" style="color:var(--success); font-weight:bold;">${b.lastReturnDate}${CONFIG.LABEL.RETURNED}</span>
    </div>`
  ).join('') || `<div class="list-row">${CONFIG.MSG.NO_DATA}</div>`;
  renderSearchList(false);
}

/**
 * @brief 蔵書検索リストをフィルタリングして表示する
 * @details 
 * 検索キーワード（前方一致）または「すべて表示」トグルに基づいてリストを生成する。
 * - **自分:** 「あなたが借用中」バッジを表示。
 * - **他人:** 貸出中なら操作不可にし、半透明（opacity 0.7）にして視覚的に区別。
 * - **在庫:** 「在庫あり」を表示し、カート追加ボタンを有効化。
 * * @param {boolean} isAll - 強制的に全件表示するかどうかのフラグ
 */
function renderSearchList(isAll = false) {
  const q = document.getElementById('searchInput').value.toLowerCase().trim();
  const listArea = document.getElementById('listSearch');
  const toggle = document.getElementById('showAllToggle');
  if (!listArea) return;

  const showAll = isAll || (toggle && toggle.checked);
  if (!q && !showAll) { listArea.innerHTML = ""; return; }

  const filtered = masterBooks.filter(b => {
    if (showAll) return true;
    if (!q) return false;
    return b.title.toLowerCase().indexOf(q) === 0;
  });

  listArea.innerHTML = filtered.map((b, index) => {
    const cleanStatus = String(b.status).trim();
    const isMine = (String(b.user).trim() === String(currentUser).trim() && cleanStatus === CONFIG.STATUS.ON_LOAN);
    const isOthers = (cleanStatus === CONFIG.STATUS.ON_LOAN && !isMine);
    const isInCart = cart.includes(b.title);
    const escTitle = b.title.replace(/'/g, "\\'");
    const bgColor = isInCart ? "background:#e0f2fe;" : (isOthers ? "background:#f8fafc; opacity:0.7;" : "background:#fff;");
    const icon = isInCart ? "done_all" : "add_circle";
    const iconColor = isInCart ? "var(--success)" : "var(--primary)";
    // --- 本棚情報の作成 ---
    const shelfInfo = b.bookshelf 
      ? `<div style="display:inline-flex; align-items:center; gap:3px; font-size:10px; color:#64748b; background:#f1f5f9; padding:1px 6px; border-radius:4px; margin-top:4px;">
           <span class="material-icons" style="font-size:12px;">grid_view</span>${b.bookshelf}
         </div>` 
      : "";

return `
      <div id="search-row-${index}" class="book-item" style="display:flex; align-items:stretch; border-bottom:1px solid #eee; ${bgColor} transition:0.2s;">
        <div style="flex:1; padding:12px;">
          <div style="font-size:14px; font-weight:500; color:var(--primary); text-decoration:underline; cursor:pointer;" onclick="openPreview('${escTitle}')">${b.title}</div>
          <div style="font-size:11px; color:#64748b; margin-top:2px; margin-bottom:4px;">${'著: '+b.author || ''}</div>
          <div style="display:flex; align-items:center; flex-wrap:wrap;">
            ${isMine ? `<span class="badge-mine">${CONFIG.MSG.BADGE_MINE}</span>` : (isOthers ? `<span class="badge-others">${CONFIG.MSG.BADGE_OTHERS}</span>` : `<span style="font-size:11px; color:var(--success); font-weight:bold;">${CONFIG.STATUS.IN_STOCK}</span>`)}
            ${shelfInfo} </div>
        </div>
        <div id="search-btn-${index}" style="width:60px; display:flex; align-items:center; justify-content:center; cursor:pointer;" onclick="addToCart('${escTitle}', 'search', ${index})">
          ${isOthers ? "" : `<span class="material-icons" style="color:${iconColor}; font-size:28px;">${icon}</span>`}
        </div>
      </div>`;
  }).join('');
}

  function handleSearchInput() {
    const q = document.getElementById('searchInput').value;
    const toggle = document.getElementById('showAllToggle');
    if (q.trim().length > 0 && toggle && toggle.checked) toggle.checked = false;
    renderSearchList(false);
  }

  function handleToggleAll(isChecked) {
    if (isChecked) document.getElementById('searchInput').value = "";
    renderSearchList(isChecked);
  }

  function toggleAccordion(type) {
    const content = document.getElementById('content-' + type); const icon = document.getElementById('icon-' + type);
    if (!content || !icon) return; const isActive = content.classList.contains('active');
    content.classList.toggle('active'); icon.innerText = isActive ? 'expand_more' : 'expand_less';
  }

/**
 * @brief 書籍をカートに追加し、バリデーションを行う
 * @details 
 * * 【バリデーション項目】
 * - 蔵書マスタに存在するか。
 * - すでにカートに入っていないか。
 * - 他人が借用中ではないか。
 * - **最大貸出冊数 (`MAX_LOAN_LIMIT`) を超えていないか。**
 * * @param {string} title - 書籍タイトル
 * @param {string} source - 呼び出し元（'myloan' または 'search'）
 * @param {number} index - リスト上の行番号（UI更新用）
 */
function addToCart(title, source = null, index = -1) {
  
  const b = masterBooks.find(x => String(x.title).trim() === String(title).trim());
  if (!b) return showToast(CONFIG.MSG.MASTER_NOTFOUND, true);
  if (cart.includes(title)) return showToast(CONFIG.MSG.ALREADY_ADDED, true);

  const isMine = (String(b.user).trim() === String(currentUser).trim() && String(b.status).trim() === CONFIG.STATUS.ON_LOAN);
  const isNewLoan = (String(b.status).trim() === CONFIG.STATUS.IN_STOCK);

  if (String(b.status).trim() === CONFIG.STATUS.ON_LOAN && !isMine) return showToast(CONFIG.MSG.CURRENTLY_ON_LOAN, true);

  if (isNewLoan) {
    // 保持している数値をそのまま使う
    const baseCount = currentLoanCount;

    // カートに入っている「返却予定（自分の本）」の数をカウント
    const returnCountInCart = cart.filter(t => {
    const target = masterBooks.find(x => String(x.title).trim() === String(t).trim());
    return target && String(target.user).trim() === String(currentUser).trim() && String(target.status).trim() === CONFIG.STATUS.ON_LOAN;
  }).length;

  // カートに入っている「新規貸出予定」の数をカウント
    const borrowCountInCart = cart.filter(t => {
    const target = masterBooks.find(x => String(x.title).trim() === String(t).trim());
    return target && String(target.status).trim() === CONFIG.STATUS.IN_STOCK;
  }).length;

  // シミュレーション計算：(今の冊数 - 返却分 + 貸出分) + 今回追加する1冊
    const simulatedTotal = baseCount - returnCountInCart + borrowCountInCart + 1;

  if (simulatedTotal > window.CONFIG.MAX_LOAN_LIMIT) {
    return showToast(CONFIG.MSG.LIMIT_OVER(window.CONFIG.MAX_LOAN_LIMIT), true);
  }
}

  cart.push(title);
  showToast(isMine ? CONFIG.MSG.RETURN_CART_ADDED : CONFIG.MSG.LOAN_CART_ADDED);
  updateCartUI();

  if (source && index !== -1) {
    const row = document.getElementById(`${source}-row-${index}`);
    const btn = document.getElementById(`${source}-btn-${index}`);
    if (row) row.style.background = "#e0f2fe";
    if (btn) btn.innerHTML = `<span class="material-icons" style="color:var(--success); font-size:28px;">done_all</span>`;
  }
}

/**
 * @brief カートの表示内容を更新する
 * @details 
 * カート内を「返却するもの」と「貸出するもの」に自動で仕分けしてHTMLを生成。
 */
  function updateCartUI() {
    const badge = document.getElementById('cartCountBadge');
    if (badge) { badge.innerText = cart.length; badge.style.display = cart.length > 0 ? 'flex' : 'none'; }
    document.getElementById('cartCountLabel').innerText = cart.length;
    const area = document.getElementById('cartArea');
    if (cart.length === 0) { area.innerHTML = `<p style="text-align:center; padding:20px; color:#94a3b8;">${CONFIG.MSG.CART_EMPTY}</p>`; return; }
    const rets = [], bors = [];
    cart.forEach((t, i) => {
      const b = masterBooks.find(x => String(x.title).trim() === String(t).trim());
      const isRet = (b && String(b.user).trim() === String(currentUser).trim() && String(b.status).trim() === CONFIG.STATUS.ON_LOAN);
      const html = `<div class="book-item" style="display:flex; justify-content:space-between; align-items:center; padding:10px; border-bottom:1px solid #eee;"><span style="font-size:14px; flex:1;">${t}</span><span class="material-icons" style="color:var(--danger); cursor:pointer;" onclick="removeFromCart(${i})">remove_circle</span></div>`;
      if (isRet) rets.push(html); else bors.push(html);
    });
    area.innerHTML = (rets.length ? `<div class="cart-header-ret">${CONFIG.LABEL.DUE_DATE_SHORT}</div>${rets.join('')}` : "") + (bors.length ? `<div class="cart-header-loan">${CONFIG.MSG.CART_HEADER_LOAN}</div>${bors.join('')}` : "");
  }

  function removeFromCart(index) {
    cart.splice(index, 1);
    updateCartUI();
    renderMyLoans();
    renderSearchList();
    if (cart.length === 0 && document.getElementById('adminQrContainer').style.display === "block") { 
      showToast(CONFIG.MSG.CART_CLEARED_STOP, true); stopAdminScan(); 
    }
  }

  function triggerAdminScan() { if (cart.length === 0) return showToast(CONFIG.MSG.CART_EMPTY, true); startAdminScan(); }




/**
 * @brief GPS取得を開始し、非同期でQRスキャナーを起動する
 * @details 
 * 非同期処理を駆使して、ユーザーの待ち時間を最小限に抑える工夫。
 * 1. `gpsPromise`: 位置情報の取得をバックグラウンドで開始。
 * 2. UI切り替え: カート一覧を隠し、スキャン用の全画面コンテナを表示。
 * 3. スキャナー起動: 背面カメラを使用し、QR検出時に `executeSubmit` を呼び出す。
 */
async function startAdminScan() {
  await stopAllScanners();

  // 1. 位置情報取得の準備 (非同期処理を開始)
  gpsPromise = new Promise((resolve) => {
    if (!navigator.geolocation) { resolve({lat: -99, lng: -99, acc: -99}); } else {
      const timer = setTimeout(() => resolve({lat: -2, lng: -2, acc: -2}), CONFIG.TIMEOUT.GPS_TIMEOUT);
      navigator.geolocation.getCurrentPosition(
        (pos) => { clearTimeout(timer); resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude, acc: pos.coords.accuracy }); },
        (err) => { clearTimeout(timer); resolve({lat: -1, lng: -1, acc: -1}); },
        { enableHighAccuracy: false, timeout: CONFIG.TIMEOUT.GPS_TIMEOUT, maximumAge: CONFIG.TIMEOUT.GPS_CASH }
      );
    }
  });

  // 2. UI切り替え
  document.getElementById('cartTitleArea').style.display = "none";
  document.getElementById('cartArea').style.display = "none";
  document.getElementById('submitButtonsArea').style.display = "none";
  document.getElementById('adminQrContainer').style.display = "block";
  window.scrollTo({ top: 0, behavior: 'smooth' });

  // 3. スキャナーの起動を少し遅らせて実行
  setTimeout(async () => {
    try {
      currentScanner = new Html5Qrcode("adminQrReader");
      const qrboxSize = Math.min(window.innerWidth, window.innerHeight) * 0.7;

      // ★権限チェックをスキップして、ダイレクトにカメラ起動を試みる★
      await currentScanner.start(
        { facingMode: "environment" },
        { fps: 10, qrbox: qrboxSize },
        (decodedText) => { executeSubmit(decodedText); }
      );
    } catch (err) {
      console.error("Camera Init Error:", err);
      // セキュリティポリシーにより許可されていない場合、ここでエラーになります
      showToast("カメラにアクセスできませんでした。ブラウザの設定で許可されているか確認してください。", true);
      stopAdminScan();
    }
  }, 500); // 起動遅延を少し増やす
}


  async function stopAdminScan() { 
    await stopAllScanners(); 
    document.getElementById('cartTitleArea').style.display = "block";
    document.getElementById('cartArea').style.display = "block";
    document.getElementById('submitButtonsArea').style.display = "flex";
    document.getElementById('adminQrContainer').style.display = "none";
  }

async function requestPermissions() {
  try {
    // カメラの許可をポップアップで強制的に出す
    const stream = await navigator.mediaDevices.getUserMedia({ video: true });
    // すぐにストリームを止める
    stream.getTracks().forEach(track => track.stop());
    
    // 位置情報の許可も出す
    await new Promise((resolve, reject) => {
      navigator.geolocation.getCurrentPosition(resolve, reject);
    });

    return true;
  } catch (err) {
    console.error("Permission error:", err);
    showToast("カメラと位置情報の権限を「許可」してください。", true);
    return false;
  }
}

/**
 * @brief カートの内容を最終確定させ、サーバーへ送信する
 * @details 
 * 【処理フロー】
 * 1. **仕分け**: カート内の各書籍が「自分の借用中（＝返却）」か「それ以外（＝貸出）」かを判別。
 * 2. **非同期待機**: カメラ停止と同時に `gpsPromise`（位置情報）取得。タイムアウト付き。
 * 3. **サーバー通信**: `processUnifiedEntry` を実行。
 * 4. **部分一致更新**: サーバー側で処理が成功したタイトル（`res.processedTitles`）のみを
 * ローカルの `cart` から削除し、`masterBooks` のステータスを即座に書き換え。
 * 5. **完了処理**: 全件成功時は2秒後に自動ログアウトし、一部エラー時は警告を表示して画面を維持。
 * @param {string} qrCode - スキャンした管理者用QRコード（場所・権限の証明）
 */
async function executeSubmit(qrCode) {
  // すでに処理中の場合は何もしない（二重送信防止）
  if (document.getElementById('loading').style.display === 'flex') return;

  // ※ sessionStorageを使用（login関数と合わせた方が安全です）
  const email = sessionStorage.getItem(CONFIG.STORAGE_KEY.EMAIL) || localStorage.getItem(CONFIG.STORAGE_KEY.EMAIL);
  const token = sessionStorage.getItem(CONFIG.STORAGE_KEY.TOKEN) || localStorage.getItem(CONFIG.STORAGE_KEY.TOKEN);

  const toReturn = [], toBorrow = [];
  cart.forEach(t => {
    const b = masterBooks.find(x => String(x.title).trim() === String(t).trim());
    if (b && String(b.user).trim() === String(currentUser).trim() && String(b.status).trim() === CONFIG.STATUS.ON_LOAN) {
      toReturn.push(t);
    } else {
      toBorrow.push(t);
    }
  });

  setLoadingMessage(CONFIG.MSG.PROCESSING, CONFIG.MSG.TX_LOCATION_DATA);
  document.getElementById('loading').style.display = 'flex';
  document.getElementById('adminQrContainer').style.display = 'none';
  lockScreen();

  try {
    // 1. カメラ停止
    await stopAdminScan();

    // 2. GPS取得待ち
    if (!gpsPromise) { unlockScreen(); return; }
    const gps = await gpsPromise;

    // 3. サーバー通信 (google.script.run を callGasApi に書き換え)
    const res = await callGasApi({
      action: 'processUnifiedEntry',
      email: email,
      token: token,
      toReturn: JSON.stringify(toReturn), // 配列は文字列に変換
      toBorrow: JSON.stringify(toBorrow), // 配列は文字列に変換
      qrCode: qrCode,
      lat: gps.lat,
      lng: gps.lng,
      acc: gps.acc
    });

    // --- ここからは元の成功時（withSuccessHandler）のロジック ---
    if (res === false) {
      handleAuthError();
      return;
    }

    if (res && res.success) {
      // サーバーで実際に処理された本だけをUIに反映
      (res.processedTitles || []).forEach(title => {
        cart = cart.filter(t => t !== title);
        const idx = masterBooks.findIndex(b => b.title === title);
        if (idx !== -1) {
          const isRet = toReturn.includes(title);
          if (isRet) {
            currentLoanCount--;
          } else {
            currentLoanCount++;
          }
          masterBooks[idx].status = isRet ? CONFIG.STATUS.IN_STOCK : CONFIG.STATUS.ON_LOAN;
          masterBooks[idx].user = isRet ? "" : currentUser;
          if (isRet) {
            const now = new Date();
            masterBooks[idx].lastReturnDate = (now.getMonth() + 1) + "/" + now.getDate();
          }
        }
      });

      updateCartUI(); renderMyLoans(); renderComplexLists(); renderSearchList();

      if (res.partialError) {
        unlockScreen();
        showToast(res.message, true);
      } else {
        showToast(res.message || CONFIG.MSG.EXECUTED);
        setTimeout(() => { if (currentUser) logout(); else unlockScreen(); }, 2000);
      }
    } else {
      unlockScreen();
      showToast(CONFIG.MSG.SUBMIT_ERROR + (res ? res.message : CONFIG.MSG.UNKNOWN_ERROR), true);
    }

  } catch (err) {
    // --- 元の FailureHandler および GPSエラー時のロジック ---
    unlockScreen();
    showToast(CONFIG.MSG.SERVER_ERROR || "通信エラーが発生しました", true);
    console.error("Submit Error:", err);
  }
}

/**
 * @brief 書籍の表紙画像を全画面でプレビュー表示する
 * @details 
 * 1. **事前準備**: `preview-loading` クラスを付与し、画像要素の透明度を 0 (`opacity:0`) に設定。
 * 2. **遅延ロード**: `img.src` にURLを代入し、ブラウザの画像読み込みを開始。
 * 3. **読み込み完了 (`onload`)**: 読み込みが終わった瞬間にローディング表示を消し、画像をフェードイン (`opacity:1`)。
 * 4. **エラーハンドリング (`onerror`)**: 画像が壊れている、またはURLが無効な場合にトーストで通知。
 * * @param {string} title - 表示したい書籍のタイトル（masterBooksからURLを検索）
 */
  function openPreview(title) {
    const b = masterBooks.find(x => String(x.title).trim() === String(title).trim());
    if (!b || !b.imageUrl) return showToast(CONFIG.MSG.NO_IMAGE, true);
    const overlay = document.getElementById('imagePreviewOverlay');
    const img = document.getElementById('previewImage');
    overlay.classList.add('preview-loading');
    img.style.opacity = "0";
    overlay.style.display = 'flex';
    img.src = b.imageUrl;
    img.onload = function() { overlay.classList.remove('preview-loading'); img.style.opacity = "1"; };
    img.onerror = function() { if (img.getAttribute('src') === "") return; overlay.style.display = 'none'; showToast(CONFIG.MSG.READ_IMAGE_ERROR, true); };
  }

/**
 * @brief 通知専用（OKボタンのみ）のモーダルを表示
 */
function openNoticeModal(title, message, onOk) {
  const overlay = document.getElementById('customModalOverlay');
  if (!overlay) return;

  document.getElementById('modalTitle').innerText = title;
  document.getElementById('modalMessage').innerText = message;
  
  // 入力欄とキャンセルボタンを隠して「通知専用」にする
  document.getElementById('modalInputArea').style.display = 'none';
  document.getElementById('modalCancelBtn').style.display = 'none';
  
  document.getElementById('modalOkBtn').onclick = () => {
    closeCustomModal();
    if (onOk) onOk();
  };
  overlay.style.display = 'flex';
}
/**
 * 
 * @brief カスタムモーダルを閉じて入力をクリア
 */
function closeCustomModal() {
  const overlay = document.getElementById('customModalOverlay');
  if (overlay) overlay.style.display = 'none';
  const input = document.getElementById('modalEmailInput');
  if (input) input.value = "";
}

/**
 * @brief プレビュー画面を閉じる
 * @details 
 * メモリ節約と次回表示時のチラつき防止のため、画像ソース (`src`) を空にしてから閉じる。
 * @param {Event} event - クリックイベント（バブリング停止用）
 */
function closePreview(event) {
  if (event) event.stopPropagation();
  const overlay = document.getElementById('imagePreviewOverlay');
  const img = document.getElementById('previewImage');
  img.src = ""; 
  overlay.style.display = 'none';
}

/**
 * どの状態からでも強制的にログイン画面を表示させる関数
 */
function showLoginSection() {
  const loading = document.getElementById('loading');
  const main = document.getElementById('mainSection');
  const login = document.getElementById('loginSection');

  if (loading) loading.style.display = 'none';
  if (main) main.style.display = 'none';
  if (login) login.style.display = 'flex';
}

/**
 * ページ読み込み時に自動実行される初期化処理
 */
window.onload = async function() {
    try {
        const configRes = await callGasApi({ action: 'getConfigValues' });
    
    　// グローバルな CONFIG オブジェクトを最新の値で更新する
    window.CONFIG = Object.assign({}, window.CONFIG, {
      MAX_LOAN_LIMIT: configRes.MAX_LOAN_LIMIT,
      ALERT_DAYS: configRes.ALERT_DAYS,
      LIMIT_DAYS: configRes.LIMIT_DAYS
    });
    
    
    console.log("Updated CONFIG:", window.CONFIG); // デバッグログ
  } catch (e) {
    console.error("Config load error", e);
    // 取得失敗時のデフォルト値
    window.GAS_MAX_LOAN_LIMIT = 5; 
  }
  const email = sessionStorage.getItem(CONFIG.STORAGE_KEY.EMAIL);
  const token = sessionStorage.getItem(CONFIG.STORAGE_KEY.TOKEN);

  // そもそもログイン情報がブラウザにない場合は、ログイン画面のまま
  if (!email || !token) {
    showLoginSection();
    return;
  }

  // F5 ログイン情報がある場合、それが「x時間以内」かサーバーに確認する
  setLoadingMessage(CONFIG.MSG.SESSION);
  document.getElementById('loading').style.display = 'flex';

  try {
    // --- 通信部分の書き換え ---
    // callGasApiの結果が返ってくるまで、ここで一時停止(await)します
    const res = await callGasApi({
      action: 'checkSession',
      email: email,
      token: token
    });

    // --- ここから下は元の SuccessHandler と同じロジック ---
    document.getElementById('loading').style.display = 'none';
    
    if (res && res.success) {
      // 取得したデータをメモリに格納
      currentUser = res.userName;
      masterBooks = res.allBooks || [];
      currentLoanCount = res.currentLoanCount || 0;
      loginSuccessByToken(res.userName); // email ではなく userName を渡す
    } else {
      // 1時間過ぎていたら追い出す
      handleAuthError();
    }
    
  } catch (err) {
    // --- FailureHandler と同じロジック ---
    document.getElementById('loading').style.display = 'none';
    showToast(CONFIG.MSG.SERVER_ERROR, true);
    console.error("Session Check Error:", err);
  }
};
/**
 * トークン認証成功時に画面を切り替える補助関数
 */
function loginSuccessByToken(email) {
  // すでに持っている情報でUIを組み立てる
  document.getElementById('loginSection').style.display = 'none';
  document.getElementById('mainSection').style.display = 'block';
  // ユーザー名などは前回のセッションから復元するか、再取得する
  // 今回は簡易的にメールアドレスを表示
  document.getElementById('userDisp').innerText = email; 
  
  // UIの初期化
  switchTab(CONFIG.TABS.MY_PAGE); 
  renderMyLoans(); 
  updateCartUI();
}

/**
 * セッション切れなどの認証エラー時に、ユーザーを安全にログイン画面へ戻す
 */
function handleAuthError() {
  // 画面をリロードしてログイン画面へ（localStorageを掃除）
  sessionStorage.removeItem(CONFIG.STORAGE_KEY.EMAIL);
  sessionStorage.removeItem(CONFIG.STORAGE_KEY.TOKEN);
  localStorage.removeItem(CONFIG.STORAGE_KEY.EMAIL);
  localStorage.removeItem(CONFIG.STORAGE_KEY.TOKEN);
//  localStorage.clear();
  showLoginSection();
  showToast("セッションの期限が切れました。再度ログインしてください。", true);
}







