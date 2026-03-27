/**
 * GLOCAL AGENTS — アプリケーション JS
 * ローディング・スケーリング・画面ルーティング・ユーザー管理・Xシェア・学習回答収集
 *
 * TODO(backend): localStorage仮実装 → engame-core auth-svc / engage-svc API に差し替え
 */

(function () {
  'use strict';

  // === 学習型回答収集API ===
  // 仮サーバー（kamuiverse.com）→ 本番サーバー確定後にURL差し替え
  var STUDY_API_URL = 'https://kamuiverse.com/agents/agents/api/study-response.php';

  // === GAS Web App URL（v7） ===
  var GAS_URL = 'https://script.google.com/macros/s/AKfycby3YA43AB78UItEHw2vlBHXBKi6eafhotm3nVUUSkJ-GXXjeZfFOGvtQPqDmxGho2QD/exec';

  // === 画面定義 ===
  var screens = {
    home:           'screens/home.html?v=20260326k',
    societies:      'screens/societies.html?v=20260327a',
    missions:       'screens/missions.html',
    points:         'screens/points.html?v=20260326a',
    'agent-profile':'screens/agent-profile.html',
    register:       'screens/register.html'
  };

  var currentScreen = null;
  var screenCache = {};

  // =========================================================
  // ユーザー管理（localStorage仮実装）
  // TODO(backend): → auth-svc POST /api/v1/auth/register, POST /api/v1/auth/login
  // =========================================================
  var STORAGE_USER = 'glocal_user';
  var STORAGE_LOGS = 'glocal_share_logs';

  function getUser() {
    try {
      var raw = localStorage.getItem(STORAGE_USER);
      return raw ? JSON.parse(raw) : null;
    } catch (e) { return null; }
  }

  function saveUser(user) {
    localStorage.setItem(STORAGE_USER, JSON.stringify(user));
  }

  function generateUserId() {
    return 'agent_' + Math.random().toString(36).substr(2, 8);
  }

  function updateHeaderUI(user) {
    var nameEl = document.getElementById('agentName');
    var idEl = document.getElementById('agentId');
    var avatarEl = document.getElementById('agentAvatar');
    if (nameEl && user) nameEl.textContent = user.name;
    if (idEl && user) idEl.textContent = '#' + user.id.slice(-4) + ' · ' + user.society + '結社';
    if (avatarEl && user) avatarEl.textContent = user.icon || '🕵️';
  }

  // =========================================================
  // シェアログ（localStorage仮実装）
  // TODO(backend): → engage-svc POST /api/v1/missions/{id}/complete
  // =========================================================
  function getShareLogs() {
    try {
      var raw = localStorage.getItem(STORAGE_LOGS);
      return raw ? JSON.parse(raw) : [];
    } catch (e) { return []; }
  }

  function addShareLog(entry) {
    var logs = getShareLogs();
    logs.push(entry);
    localStorage.setItem(STORAGE_LOGS, JSON.stringify(logs));
  }

  // === ローディング画面 ===
  function hideLoader() {
    var loader = document.getElementById('appLoader');
    if (!loader) return;
    loader.classList.add('fade-out');
    setTimeout(function () {
      loader.style.display = 'none';
    }, 500);
  }

  // === 画面ルーティング ===
  function navigateTo(name) {
    if (currentScreen === name) return;
    var body = document.getElementById('appBody');
    if (!body) return;

    var scrollContainer = document.querySelector('.app-scroll');
    if (scrollContainer) scrollContainer.scrollTop = 0;

    // ミッション画面は特別処理（全画面ルーム型）
    if (name === 'missions') {
      var mHeader = document.querySelector('.app-header');
      var mTabs = document.querySelector('.society-tabs');
      var mScroll = document.querySelector('.app-scroll');
      var mBody = document.getElementById('appBody');
      if (mHeader) mHeader.style.display = 'none';
      if (mTabs) mTabs.style.display = 'none';
      if (mScroll) mScroll.style.background = '#1a1a2e';
      if (mBody) { mBody.style.padding = '0'; mBody.style.height = '100%'; }
      currentScreen = name;
      updateNav(name);
      loadMissions(body);
      return;
    }

    // ポイント画面も全画面ルーム型
    if (name === 'points') {
      var pHeader = document.querySelector('.app-header');
      var pTabs = document.querySelector('.society-tabs');
      var pScroll = document.querySelector('.app-scroll');
      var pBody = document.getElementById('appBody');
      if (pHeader) pHeader.style.display = 'none';
      if (pTabs) pTabs.style.display = 'none';
      if (pScroll) pScroll.style.background = '#1a1a2e';
      if (pBody) { pBody.style.padding = '0'; pBody.style.height = '100%'; }
      currentScreen = name;
      updateNav(name);
      loadPoints(body);
      return;
    }

    // 登録画面はキャッシュしない、ヘッダー・タブも隠す
    if (name === 'register') {
      var header = document.querySelector('.app-header');
      var tabs = document.querySelector('.society-tabs');
      if (header) header.style.display = 'none';
      if (tabs) tabs.style.display = 'none';
      fetch(screens[name])
        .then(function (res) { return res.text(); })
        .then(function (html) {
          body.innerHTML = html;
          currentScreen = name;
          bindRegisterEvents();
        });
      return;
    }

    // エージェントルーム: 別ページに遷移
    if (name === 'agent-profile') {
      window.location.href = 'samples/room-b1.html';
      return;
    }

    // ヘッダー・タブ表示切替 + ミッション後のリセット
    var header = document.querySelector('.app-header');
    var tabs = document.querySelector('.society-tabs');
    var scroll = document.querySelector('.app-scroll');
    if (header) header.style.display = '';
    if (scroll) scroll.style.background = '';
    // app-bodyのパディング・高さをリセット（ミッション画面から戻った時）
    body.style.padding = '';
    body.style.height = '';
    // ポイント・ミッション画面では結社タブを非表示
    if (tabs) tabs.style.display = (name === 'points' || name === 'missions') ? 'none' : '';

    // エージェントルーム・結社画面はキャッシュしない（動的読み込みのため）
    if (name !== 'agent-profile' && name !== 'societies' && name !== 'home' && screenCache[name]) {
      body.innerHTML = screenCache[name];
      currentScreen = name;
      updateNav(name);
      bindScreenEvents();
      return;
    }

    var url = screens[name];
    if (!url) return;

    fetch(url)
      .then(function (res) { return res.text(); })
      .then(function (html) {
        if (name !== 'agent-profile') screenCache[name] = html;
        body.innerHTML = html;
        // inline scriptを実行
        var scripts = body.querySelectorAll('script');
        scripts.forEach(function(s) {
          var ns = document.createElement('script');
          ns.textContent = s.textContent;
          s.parentNode.replaceChild(ns, s);
        });
        currentScreen = name;
        updateNav(name);
        bindScreenEvents();
      })
      .catch(function () {
        body.innerHTML = '<div class="screen-placeholder"><div class="ph-icon">⚠️</div><div class="ph-title">読み込みエラー</div></div>';
      });
  }

  // =========================================================
  // 登録画面イベント
  // =========================================================
  function bindRegisterEvents() {
    var selectedSociety = null;
    var selectedIcon = null;
    var nameInput = document.getElementById('regName');
    var submitBtn = document.getElementById('regSubmit');
    var errorEl = document.getElementById('regError');

    document.querySelectorAll('.reg-soc').forEach(function (el) {
      el.addEventListener('click', function () {
        document.querySelectorAll('.reg-soc').forEach(function (s) { s.classList.remove('selected'); });
        this.classList.add('selected');
        selectedSociety = this.getAttribute('data-key');
        selectedIcon = this.getAttribute('data-icon');
        checkValid();
      });
    });

    if (nameInput) {
      nameInput.addEventListener('input', checkValid);
    }

    function checkValid() {
      var valid = nameInput && nameInput.value.trim().length > 0 && selectedSociety;
      if (submitBtn) submitBtn.disabled = !valid;
    }

    if (submitBtn) {
      submitBtn.addEventListener('click', function () {
        var name = nameInput.value.trim();
        if (!name || !selectedSociety) return;

        var user = {
          id: generateUserId(),
          name: name,
          society: selectedSociety,
          icon: selectedIcon || '🕵️',
          created_at: new Date().toISOString()
        };
        saveUser(user);
        userSociety = user.society;
        updateHeaderUI(user);

        // ヘッダー・タブ・ナビを表示してホームへ
        var nav = document.getElementById('appNav');
        var header = document.querySelector('.app-header');
        var tabs = document.querySelector('.society-tabs');
        if (nav) nav.style.display = '';
        if (header) header.style.display = '';
        if (tabs) tabs.style.display = '';
        currentScreen = null; // forceリロード
        navigateTo('home');
      });
    }
  }

  // =========================================================
  // ログイン/新規登録画面
  // =========================================================
  function showAuthScreen() {
    var authModal = document.getElementById('authModal');
    var signupModal = document.getElementById('signupModal');
    var regModal = document.getElementById('regModal');
    if (!authModal) return;

    authModal.style.display = 'flex';

    // ログインボタン（仮: ID/PASSは無視して仮ログイン）
    document.getElementById('authLogin').addEventListener('click', function () {
      // TODO(backend): auth-svc POST /api/v1/auth/login に差し替え
      var emailVal = document.getElementById('authId').value.trim();
      var user = {
        id: generateUserId(),
        name: emailVal ? emailVal.split('@')[0] : 'ゲストユーザー',
        society: null, // 結社未選択状態
        icon: '🕵️',
        created_at: new Date().toISOString()
      };
      saveUser(user);
      updateHeaderUI(user);
      authModal.style.display = 'none';

      // 結社未登録なら結社選択モーダルへ
      if (!user.society) {
        if (regModal) {
          regModal.style.display = 'flex';
          bindRegisterModal();
        }
      } else {
        userSociety = user.society;
        currentScreen = null;
        navigateTo('home');
      }
    });

    // 「新規登録はこちら」→ 新規登録モーダルを表示
    document.getElementById('authRegister').addEventListener('click', function () {
      authModal.style.display = 'none';
      if (signupModal) signupModal.style.display = 'flex';
    });

    // 新規登録モーダル内の「登録する」
    var signupSubmit = document.getElementById('signupSubmit');
    if (signupSubmit) {
      signupSubmit.addEventListener('click', function () {
        var email = document.getElementById('signupEmail').value.trim();
        var pass = document.getElementById('signupPass').value;
        var passConfirm = document.getElementById('signupPassConfirm').value;
        var errorEl = document.getElementById('signupError');

        if (!email || !pass) {
          if (errorEl) errorEl.textContent = 'メールアドレスとパスワードを入力してください';
          return;
        }
        if (pass.length < 8) {
          if (errorEl) errorEl.textContent = 'パスワードは8文字以上です';
          return;
        }
        if (pass !== passConfirm) {
          if (errorEl) errorEl.textContent = 'パスワードが一致しません';
          return;
        }

        // TODO(backend): auth-svc POST /api/v1/auth/register に差し替え
        // 仮: アカウント作成成功として結社選択へ
        var user = {
          id: generateUserId(),
          name: email.split('@')[0],
          society: null,
          icon: '🕵️',
          created_at: new Date().toISOString()
        };
        saveUser(user);
        updateHeaderUI(user);
        signupModal.style.display = 'none';

        // 結社選択モーダルへ
        if (regModal) {
          regModal.style.display = 'flex';
          bindRegisterModal();
        }
      });
    }

    // 「← ログイン画面に戻る」
    var signupBack = document.getElementById('signupBack');
    if (signupBack) {
      signupBack.addEventListener('click', function () {
        signupModal.style.display = 'none';
        authModal.style.display = 'flex';
      });
    }
  }

  // =========================================================
  // 結社選択モーダル（トップページ上にオーバーレイ）
  // =========================================================
  function bindRegisterModal() {
    var modal = document.getElementById('regModal');
    var selectedSociety = null;
    var selectedIcon = null;
    var nameInput = document.getElementById('regName');
    var submitBtn = document.getElementById('regSubmit');

    modal.querySelectorAll('.reg-soc').forEach(function (el) {
      el.addEventListener('click', function () {
        modal.querySelectorAll('.reg-soc').forEach(function (s) { s.classList.remove('selected'); });
        this.classList.add('selected');
        selectedSociety = this.getAttribute('data-key');
        selectedIcon = this.getAttribute('data-icon');
        checkValid();
      });
    });

    if (nameInput) nameInput.addEventListener('input', checkValid);

    function checkValid() {
      var valid = nameInput && nameInput.value.trim().length > 0 && selectedSociety;
      if (submitBtn) submitBtn.disabled = !valid;
    }

    if (submitBtn) {
      submitBtn.addEventListener('click', function () {
        var name = nameInput.value.trim();
        if (!name || !selectedSociety) return;

        var user = {
          id: generateUserId(),
          name: name,
          society: selectedSociety,
          icon: selectedIcon || '🕵️',
          created_at: new Date().toISOString()
        };
        saveUser(user);
        userSociety = user.society;
        updateHeaderUI(user);

        // モーダルを閉じる
        modal.style.display = 'none';
        // ホームを再読み込み（結社データ反映）
        currentScreen = null;
        navigateTo('home');
      });
    }
  }

  // =========================================================
  // ミッション画面: JSONから動的生成
  // =========================================================
  var userSociety = 'hakodate';

  // =========================================================
  // ポイント画面（ルーム型）
  // =========================================================
  function loadPoints(body) {
    body.innerHTML = '<div class="mission-room" id="pointsRoom">'
      + '<img class="mission-room-bg" src="assets/img/room/05.png" alt="ポイントルーム">'
      // ポイント表示（左上）
      + '<div class="mission-pt-display"><div class="mission-pt-num">2,480</div><div class="mission-pt-label">pt</div><div class="mission-pt-today">+150</div></div>'
      // アバター
      + '<div class="mission-avatar" id="ptAvatar" style="left:55%;bottom:5%;width:28%;">'
      + '<img class="avatar-open" id="pAvatarOpen" src="assets/img/avatar/fox_open.png" alt="">'
      + '<img class="avatar-closed" id="pAvatarClosed" src="assets/img/avatar/fox_closed.png" alt="">'
      + '</div>'
      // クリックエリア: ボード左半分=履歴, ボード右半分=交換
      // ロゴ+テキスト（左上ポイント下）
      + '<div style="position:absolute;z-index:20;left:6px;top:63px;display:flex;align-items:center;gap:6px;pointer-events:none;"><img src="assets/img/rogo_icon.png" style="width:42px;height:auto;filter:drop-shadow(0 2px 4px rgba(0,0,0,0.4));"><span style="font-family:var(--font-h);font-size:15px;font-weight:800;color:white;text-shadow:0 2px 6px rgba(0,0,0,0.6);">ポイント交換 / 履歴</span></div>'
      + '<div class="mission-obj" id="pobjHistory" style="left:5%;top:16%;width:45%;height:28%;"><img class="mission-obj-icon" src="assets/img/rogo_icon.png" alt="" style="top:4px;left:51%;width:37px;height:auto;"><span class="mission-obj-tag" style="top:40px;left:50%;font-size:15px;">履歴</span></div>'
      + '<div class="mission-obj" id="pobjExchange" style="left:53%;top:16%;width:45%;height:28%;"><img class="mission-obj-icon" src="assets/img/rogo_icon.png" alt="" style="top:4px;left:45%;width:37px;height:auto;"><span class="mission-obj-tag" style="top:40px;left:45%;font-size:15px;">交換</span></div>'
      // ミニステータス帯
      + '<div class="mission-stats"><span>💎 ポイント管理</span></div>'
      + '</div>'
      // パネル
      + '<div class="mission-panel-overlay" id="ptPanelOverlay"><div class="mission-panel" id="ptPanelContent"></div></div>';

    // アバターまばたき
    var pOpen = document.getElementById('pAvatarOpen');
    var pClosed = document.getElementById('pAvatarClosed');
    if (pOpen && pClosed) {
      (function bloop() {
        setTimeout(function() {
          pOpen.style.opacity = '0'; pClosed.style.opacity = '1';
          setTimeout(function() { pOpen.style.opacity = '1'; pClosed.style.opacity = '0'; }, 150);
          bloop();
        }, 2000 + Math.random() * 3000);
      })();
    }

    // has-missionクラス追加（点滅）
    ['pobjHistory','pobjExchange'].forEach(function(id) {
      var el = document.getElementById(id);
      if (el) el.classList.add('has-mission');
    });

    // パネル内容
    var ptPanels = {
      history: '<button class="mp-close" onclick="this.parentElement.parentElement.style.display=\'none\'">✕</button>'
        + '<div style="font-family:var(--font-h);font-size:16px;font-weight:800;color:var(--navy);margin-bottom:12px;">📅 ポイント履歴</div>'
        + '<div style="font-size:12px;">'
        + '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);"><span style="font-size:18px;">🧩</span><div style="flex:1;"><div>函館クイズ完了</div><div style="font-size:10px;color:var(--muted);">3/26 21:00</div></div><div style="font-weight:700;color:#059669;">+30 pt</div></div>'
        + '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);"><span style="font-size:18px;">📢</span><div style="flex:1;"><div>SNS拡散ミッション</div><div style="font-size:10px;color:var(--muted);">3/25 18:30</div></div><div style="font-weight:700;color:#059669;">+50 pt</div></div>'
        + '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);"><span style="font-size:18px;">📖</span><div style="flex:1;"><div>学習ミッション完了</div><div style="font-size:10px;color:var(--muted);">3/24 12:15</div></div><div style="font-weight:700;color:#059669;">+20 pt</div></div>'
        + '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;border-bottom:1px solid var(--border);"><span style="font-size:18px;">🎁</span><div style="flex:1;"><div>Amazonギフト交換</div><div style="font-size:10px;color:var(--muted);">3/23 09:00</div></div><div style="font-weight:700;color:var(--red);">-500 pt</div></div>'
        + '<div style="display:flex;align-items:center;gap:10px;padding:8px 0;"><span style="font-size:18px;">🧩</span><div style="flex:1;"><div>函館クイズ完了</div><div style="font-size:10px;color:var(--muted);">3/22 20:45</div></div><div style="font-weight:700;color:#059669;">+30 pt</div></div>'
        + '</div>',

      exchange: '<button class="mp-close" onclick="this.parentElement.parentElement.style.display=\'none\'">✕</button>'
        + '<div style="font-family:var(--font-h);font-size:16px;font-weight:800;color:var(--navy);margin-bottom:12px;">🔄 ポイント交換</div>'
        + '<div style="display:flex;flex-direction:column;gap:8px;">'
        + '<div style="display:flex;align-items:center;gap:10px;padding:12px;background:var(--lavender);border-radius:10px;cursor:pointer;" onclick="alert(\'地域通貨への交換は準備中です\')"><span style="font-size:20px;">🏘️</span><div style="flex:1;"><div style="font-weight:700;font-size:13px;color:var(--navy);">地域通貨・クーポン</div><div style="font-size:10px;color:var(--muted);">所属結社の地域で使える</div></div><div style="font-size:11px;color:var(--muted);">100pt〜</div></div>'
        + '<div style="display:flex;align-items:center;gap:10px;padding:12px;background:#E8F5E9;border-radius:10px;cursor:pointer;" onclick="alert(\'PUCへの交換は準備中です\')"><span style="font-size:20px;">🌿</span><div style="flex:1;"><div style="font-weight:700;font-size:13px;color:var(--navy);">PUC 環境ポイント</div><div style="font-size:10px;color:var(--muted);">カーボンクレジット連携</div></div><div style="font-size:11px;color:var(--muted);">100pt〜</div></div>'
        + '<div style="display:flex;align-items:center;gap:10px;padding:12px;background:#E3F2FD;border-radius:10px;cursor:pointer;" onclick="alert(\'DEPへの交換は準備中です\')"><span style="font-size:20px;">💎</span><div style="flex:1;"><div style="font-weight:700;font-size:13px;color:var(--navy);">DEP（DEAPcoin）</div><div style="font-size:10px;color:var(--muted);">PlayMining接続</div></div><div style="font-size:11px;color:var(--muted);">500pt〜</div></div>'
        + '<div style="display:flex;align-items:center;gap:10px;padding:12px;background:#FFF3E0;border-radius:10px;cursor:pointer;" onclick="alert(\'Amazonギフトへの交換は準備中です\')"><span style="font-size:20px;">🎁</span><div style="flex:1;"><div style="font-weight:700;font-size:13px;color:var(--navy);">Amazonギフト券</div><div style="font-size:10px;color:var(--muted);">500円分から交換可能</div></div><div style="font-size:11px;color:var(--muted);">500pt〜</div></div>'
        + '</div>',

      donate: '<button class="mp-close" onclick="this.parentElement.parentElement.style.display=\'none\'">✕</button>'
        + '<div style="font-family:var(--font-h);font-size:16px;font-weight:800;color:var(--navy);margin-bottom:12px;">💝 地域に寄付する</div>'
        + '<p style="font-size:13px;color:var(--text);line-height:1.7;margin-bottom:12px;">応援したい地域にポイントで直接寄付できます。<br>1ptから可能です。</p>'
        + '<div style="display:flex;flex-direction:column;gap:6px;margin-bottom:14px;">'
        + '<div style="padding:10px 12px;background:var(--bg);border-radius:8px;font-size:12px;cursor:pointer;" onclick="alert(\'寄付機能は準備中です\')">🏫 教育（地域の学校支援）</div>'
        + '<div style="padding:10px 12px;background:var(--bg);border-radius:8px;font-size:12px;cursor:pointer;" onclick="alert(\'寄付機能は準備中です\')">🌳 環境（植樹・海岸清掃）</div>'
        + '<div style="padding:10px 12px;background:var(--bg);border-radius:8px;font-size:12px;cursor:pointer;" onclick="alert(\'寄付機能は準備中です\')">🎭 文化（祭り・伝統工芸保存）</div>'
        + '<div style="padding:10px 12px;background:var(--bg);border-radius:8px;font-size:12px;cursor:pointer;" onclick="alert(\'寄付機能は準備中です\')">🏗️ インフラ（観光地整備）</div>'
        + '</div>'
    };

    // クリックイベント
    setTimeout(function() {
      var overlay = document.getElementById('ptPanelOverlay');
      var panel = document.getElementById('ptPanelContent');

      document.getElementById('pobjHistory').addEventListener('click', function() {
        panel.innerHTML = ptPanels.history;
        overlay.style.display = 'flex';
      });
      document.getElementById('pobjExchange').addEventListener('click', function() {
        panel.innerHTML = ptPanels.exchange;
        overlay.style.display = 'flex';
      });
      overlay.addEventListener('click', function(e) {
        if (e.target === overlay) overlay.style.display = 'none';
      });
    }, 100);
  }

  // ミッションデータ保持（ルーム型UIから参照）
  var missionCache = { quiz: null, sns: null, study: null };

  function loadMissions(body) {
    // ルーム型UI: 背景+アバター+オブジェクトタップ
    var user = getUser();
    var bgKey = (user && user.missionBg) || 'western'; // western or japanese
    var bgSrc = bgKey === 'japanese' ? 'assets/img/room/04.png' : 'assets/img/room/03.png';

    body.innerHTML = '<div class="mission-room" id="missionRoom">'
      + '<img class="mission-room-bg" src="' + bgSrc + '" alt="ミッションルーム">'
      // ポイント表示（左上）
      + '<div class="mission-pt-display"><div class="mission-pt-num">2,480</div><div class="mission-pt-label">pt</div><div class="mission-pt-today">+150</div></div>'
      // アバター（まばたき）
      + '<div class="mission-avatar" id="missionAvatar">'
      + '<img class="avatar-open" id="mAvatarOpen" src="assets/img/avatar/fox_open.png" alt="">'
      + '<img class="avatar-closed" id="mAvatarClosed" src="assets/img/avatar/fox_closed.png" alt="">'
      + '</div>'
      // 背景切替ボタン
      + '<button class="mission-bg-toggle" id="missionBgToggle">🏠</button>'
      // タップ領域: ノート=クイズ, スマホ=SNS, PC=学習（Mission点滅テキスト付き）
      + '<div class="mission-obj mission-obj-quiz" id="mobjQuiz"><img class="mission-obj-icon" src="assets/img/rogo_icon.png" alt=""><span class="mission-obj-tag" id="mTagQuiz">Mission</span></div>'
      + '<div class="mission-obj mission-obj-sns" id="mobjSns"><img class="mission-obj-icon" src="assets/img/rogo_icon.png" alt=""><span class="mission-obj-tag" id="mTagSns">Mission</span></div>'
      + '<div class="mission-obj mission-obj-study" id="mobjStudy"><img class="mission-obj-icon" src="assets/img/rogo_icon.png" alt=""><span class="mission-obj-tag" id="mTagStudy">Mission</span></div>'
      // ミニステータス帯
      + '<div class="mission-stats"><span>🎯 今日のミッション</span><span id="missionThemeLabel"></span></div>'
      + '</div>'
      // パネルオーバーレイ
      + '<div class="mission-panel-overlay" id="missionPanelOverlay"><div class="mission-panel" id="missionPanelContent"></div></div>';

    // アバターまばたき
    var mOpen = document.getElementById('mAvatarOpen');
    var mClosed = document.getElementById('mAvatarClosed');
    if (mOpen && mClosed) {
      (function bloop() {
        setTimeout(function() {
          mOpen.style.opacity = '0'; mClosed.style.opacity = '1';
          setTimeout(function() { mOpen.style.opacity = '1'; mClosed.style.opacity = '0'; }, 150);
          bloop();
        }, 2000 + Math.random() * 3000);
      })();
    }

    // 背景切替
    var mBgIdx = bgKey === 'japanese' ? 1 : 0;
    var mBgs = ['assets/img/room/03.png', 'assets/img/room/04.png'];
    var mObjPos = [
      // 洋風
      { quiz: 'left:28%;top:60%;width:28%;height:8%', sns: 'left:63%;top:62%;width:10%;height:8%', study: 'left:0%;top:38%;width:16%;height:14%' },
      // 和風
      { quiz: 'left:25%;top:52%;width:28%;height:7%', sns: 'left:59%;top:56%;width:9%;height:7%', study: 'left:19%;top:34%;width:17%;height:7%' }
    ];
    var mAvatarPos = [
      { left: '6%', bottom: '5%', width: '30%' },   // 洋風
      { left: '61%', bottom: '48%', width: '32%' }   // 和風
    ];

    // タグ位置（背景別）
    var mTagPos = [
      // 洋風: デフォルト（CSSのまま）
      { quiz: {top:'-8px',left:'50%'}, sns: {top:'-8px',left:'50%'}, study: {top:'9px',left:'73%'} },
      // 和風
      { quiz: {top:'-8px',left:'50%'}, sns: {top:'-2px',left:'200%'}, study: {top:'-28px',left:'73%'} }
    ];

    function applyMissionPos(idx) {
      var p = mObjPos[idx];
      var q = document.getElementById('mobjQuiz');
      var s = document.getElementById('mobjSns');
      var t = document.getElementById('mobjStudy');
      if (q) q.style.cssText += p.quiz;
      if (s) s.style.cssText += p.sns;
      if (t) t.style.cssText += p.study;
      var av = document.getElementById('missionAvatar');
      var ap = mAvatarPos[idx];
      if (av) { av.style.left = ap.left; av.style.bottom = ap.bottom; av.style.width = ap.width; }
      // タグ位置
      var tp = mTagPos[idx];
      var tq = document.getElementById('mTagQuiz');
      var ts = document.getElementById('mTagSns');
      var tt = document.getElementById('mTagStudy');
      if (tq) { tq.style.top = tp.quiz.top; tq.style.left = tp.quiz.left; }
      if (ts) { ts.style.top = tp.sns.top; ts.style.left = tp.sns.left; }
      if (tt) { tt.style.top = tp.study.top; tt.style.left = tp.study.left; }
      // アイコン位置もタグに連動
      var icons = document.querySelectorAll('.mission-obj-icon');
      icons.forEach(function(ic) {
        var parent = ic.parentElement;
        var tag = parent.querySelector('.mission-obj-tag');
        if (tag) { ic.style.left = tag.style.left; }
      });
    }
    applyMissionPos(mBgIdx);

    var toggleBtn = document.getElementById('missionBgToggle');
    if (toggleBtn) {
      toggleBtn.addEventListener('click', function() {
        mBgIdx = (mBgIdx + 1) % 2;
        var bgImg = document.querySelector('.mission-room-bg');
        if (bgImg) bgImg.src = mBgs[mBgIdx];
        applyMissionPos(mBgIdx);
      });
    }

    // ミッションデータ読み込み
    fetch('data/config.json')
      .then(function(r) { return r.json(); })
      .then(function(config) {
        userSociety = (user && user.society) || config.user_society || userSociety;
        var season = config.active_season;
        return Promise.all([
          fetch('data/season' + season + '/quiz.json').then(function(r) { return r.json(); }).catch(function() { return null; }),
          fetch('data/season' + season + '/sns.json').then(function(r) { return r.json(); }).catch(function() { return null; }),
          fetch('data/season' + season + '/study.json').then(function(r) { return r.json(); }).catch(function() { return null; })
        ]);
      })
      .then(function(results) {
        var day = 1;
        results.forEach(function(data) {
          if (!data || !data.days) return;
          var dayData = data.days.find(function(d) { return d.day === day; });
          if (!dayData) return;
          var themeEl = document.getElementById('missionThemeLabel');
          if (themeEl && dayData.theme) themeEl.textContent = dayData.theme;
          var mission = dayData.missions.find(function(m) { return m.society === userSociety; });
          if (!mission) return;
          if (data.mission_type === 'quiz') missionCache.quiz = mission;
          else if (data.mission_type === 'sns') missionCache.sns = mission;
          else if (data.mission_type === 'study') missionCache.study = mission;
        });

        // オブジェクトにミッションがある場合、光らせる
        if (missionCache.quiz) document.getElementById('mobjQuiz').classList.add('has-mission');
        if (missionCache.sns) document.getElementById('mobjSns').classList.add('has-mission');
        if (missionCache.study) document.getElementById('mobjStudy').classList.add('has-mission');
      });

    // オブジェクトクリック → パネル表示
    setTimeout(function() {
      var overlay = document.getElementById('missionPanelOverlay');
      var panel = document.getElementById('missionPanelContent');

      function showMissionPanel(type) {
        var m = missionCache[type];
        if (!m) { panel.innerHTML = '<button class="mp-close" onclick="this.parentElement.parentElement.style.display=\'none\'">✕</button><p style="text-align:center;color:var(--muted);padding:20px;">ミッションがありません</p>'; overlay.style.display = 'flex'; return; }
        var html = '<button class="mp-close" onclick="this.parentElement.parentElement.style.display=\'none\'">✕</button>';
        if (type === 'quiz') html += renderQuiz(m);
        else if (type === 'sns') html += renderSNS(m);
        else if (type === 'study') html += renderStudy(m);
        panel.innerHTML = html;
        overlay.style.display = 'flex';
        bindQuizEvents();
        bindShareEvents();
        bindStudyEvents();
      }

      document.getElementById('mobjQuiz').addEventListener('click', function() { showMissionPanel('quiz'); });
      document.getElementById('mobjSns').addEventListener('click', function() { showMissionPanel('sns'); });
      document.getElementById('mobjStudy').addEventListener('click', function() { showMissionPanel('study'); });

      overlay.addEventListener('click', function(e) {
        if (e.target === overlay) overlay.style.display = 'none';
      });
    }, 100);
  }

  // ポイント吸収演出
  window.missionPtAnimate = function(pts, sourceEl) {
    var room = document.getElementById('missionRoom');
    var ptDisplay = document.querySelector('.mission-pt-num');
    if (!room || !ptDisplay) return;

    // ソース位置（ミッションパネル付近）
    var roomRect = room.getBoundingClientRect();
    var srcX = roomRect.width / 2;
    var srcY = roomRect.height / 2;

    // +Npt テキストを飛ばす
    var fly = document.createElement('div');
    fly.className = 'pt-fly';
    fly.textContent = '+' + pts + ' pt';
    fly.style.left = srcX + 'px';
    fly.style.top = srcY + 'px';
    room.appendChild(fly);

    // 1.2秒後に消す＋数値更新
    setTimeout(function() {
      fly.remove();
      // 数値更新
      var cur = parseInt(ptDisplay.textContent.replace(/,/g, '')) || 0;
      var newPt = cur + pts;
      ptDisplay.textContent = newPt.toLocaleString();
      ptDisplay.classList.add('pulse');
      setTimeout(function() { ptDisplay.classList.remove('pulse'); }, 400);

      // todayも更新
      var todayEl = document.querySelector('.mission-pt-today');
      if (todayEl) {
        var curToday = parseInt(todayEl.textContent.replace(/[^0-9]/g, '')) || 0;
        todayEl.textContent = '+' + (curToday + pts);
      }
    }, 800);

    // Missionタグを「Completed」に変更
    if (sourceEl) {
      var tag = sourceEl.querySelector('.mission-obj-tag');
      if (tag) {
        tag.textContent = 'Completed';
        tag.classList.add('completed');
      }
    }

    // パネルを閉じる
    setTimeout(function() {
      var ov = document.getElementById('missionPanelOverlay');
      if (ov) ov.style.display = 'none';
    }, 1500);
  };

  // =========================================================
  // 学習型回答POST（GAS回答収集）
  // 学習型回答収集API（サーバーAPI使用）
  // =========================================================
  var GAS_RESPONSE_URL = STUDY_API_URL;

  function bindStudyEvents() {
    var btns = document.querySelectorAll('.btn-post');
    btns.forEach(function(btn) {
      btn.addEventListener('click', function() {
        var card = this.closest('.mcard.study');
        if (!card) return;
        var textarea = card.querySelector('.study-input');
        var text = textarea ? textarea.value.trim() : '';
        if (!text) { textarea.focus(); return; }

        var missionId = card.getAttribute('data-id') || '';
        var user = getUser();

        // GASにPOST（URLが設定されている場合のみ）
        if (GAS_RESPONSE_URL) {
          var payload = {
            society_key: user ? user.society : userSociety,
            society_name: (user ? user.society : userSociety) + 'ひみつ結社',
            template: '', // TODO: 結社JSONから取得
            mission_id: missionId,
            theme: '', // TODO: ミッションデータから取得
            prompt: textarea.placeholder || '',
            response_text: text,
            user_id: user ? user.id : 'anonymous'
          };
          fetch(GAS_RESPONSE_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
          }).catch(function() {}); // サイレントに送信（エラーでもゲーム体験を妨げない）
        }

        // ポイント吸収演出
        var pts = parseInt(card.querySelector('.mpts').textContent.replace(/[^0-9]/g, '')) || 20;
        var studyObj = document.getElementById('mobjStudy');
        missionPtAnimate(pts, studyObj);

        // ボタンを無効化
        this.disabled = true;
        this.textContent = '✅ 投稿完了';
        this.style.background = '#059669';
      });
    });
  }

  function renderQuiz(m) {
    var html = m.choices.map(function(c, i) {
      var label = String.fromCharCode(65 + i);
      var attr = (c === m.answer) ? ' data-correct="true"' : '';
      return '<div class="choice" data-answer="' + c + '"' + attr + '><div class="clabel">' + label + '</div>' + c + '</div>';
    }).join('');
    return '<div class="mcard quiz" data-id="' + m.mission_id + '">' +
      '<div class="mcard-top"><div class="mtype">🧩 クイズ型</div><div class="mpts">+' + m.points + ' pt</div></div>' +
      '<div class="msociety">🌊 ' + userSociety + 'ひみつ結社</div>' +
      '<div class="mq">' + m.question + '</div>' +
      '<div class="choices">' + html + '</div>' +
      '<div class="quiz-result" style="display:none;margin-top:12px;padding:12px;border-radius:10px;font-size:13px;line-height:1.6;"></div></div>';
  }

  function renderSNS(m) {
    var tags = (m.hashtags || []).map(function(t) { return '#' + t; }).join(' ');
    var tweetText = (m.post_text || '') + '\n' + tags;
    return '<div class="mcard sns" data-id="' + m.mission_id + '">' +
      '<div class="mcard-top"><div class="mtype">📣 SNS拡散型</div><div class="mpts">+' + m.points + ' pt</div></div>' +
      '<div class="msociety">🌊 ' + userSociety + 'ひみつ結社</div>' +
      '<div class="sns-body">' + (m.post_text || '') + '<br><span class="sns-tags">' + tags + '</span></div>' +
      '<button class="btn-share" data-tweet="' + encodeURIComponent(tweetText) + '" data-mission="' + m.mission_id + '" data-points="' + m.points + '">🐦 Xでシェアする</button>' +
      '<div class="share-done" style="display:none;margin-top:8px;padding:10px;border-radius:10px;background:#D1FAE5;color:#065F46;font-size:13px;text-align:center;">✅ シェア済み +' + m.points + ' pt</div></div>';
  }

  function renderStudy(m) {
    return '<div class="mcard study" data-id="' + m.mission_id + '">' +
      '<div class="mcard-top"><div class="mtype">📖 学習型</div><div class="mpts">+' + m.points + ' pt</div></div>' +
      '<div class="msociety">🌊 ' + userSociety + 'ひみつ結社</div>' +
      '<div class="study-body">' + (m.content || '') + '</div>' +
      '<textarea class="study-input" rows="2" placeholder="' + (m.prompt || '感想を投稿しよう…') + '"></textarea>' +
      '<button class="btn-post">✦ 投稿してポイント獲得</button></div>';
  }

  // =========================================================
  // Xシェアイベント（Twitter Intent API）
  // TODO(backend): → engage-svc POST /api/v1/missions/{id}/complete で完了判定
  // =========================================================
  function bindShareEvents() {
    document.querySelectorAll('.btn-share').forEach(function (btn) {
      btn.addEventListener('click', function () {
        var tweetText = decodeURIComponent(this.getAttribute('data-tweet') || '');
        var missionId = this.getAttribute('data-mission') || '';
        var points = this.getAttribute('data-points') || '0';

        // Twitter Intent URLを開く
        var intentUrl = 'https://twitter.com/intent/tweet?text=' + encodeURIComponent(tweetText);
        window.open(intentUrl, '_blank', 'width=550,height=420');

        // シェアログを記録（intent URLも保存）
        var user = getUser();
        if (user) {
          addShareLog({
            user_id: user.id,
            user_name: user.name,
            user_society: user.society,
            mission_id: missionId,
            post_text: tweetText,
            points: parseInt(points, 10),
            intent_url: intentUrl,
            shared_at: new Date().toISOString()
          });
        }

        // ボタンを完了状態に
        this.style.display = 'none';
        var doneEl = this.nextElementSibling;
        if (doneEl && doneEl.classList.contains('share-done')) {
          doneEl.style.display = 'block';
        }
        // ポイント吸収演出
        if (window.missionPtAnimate) {
          window.missionPtAnimate(parseInt(points, 10), document.getElementById('mobjSns'));
        }
      });
    });
  }

  function bindQuizEvents() {
    document.querySelectorAll('.mcard.quiz .choice').forEach(function(c) {
      c.addEventListener('click', function() {
        var card = this.closest('.mcard');
        if (card.classList.contains('answered')) return;
        var choices = card.querySelectorAll('.choice');
        var resultEl = card.querySelector('.quiz-result');
        var isCorrect = this.getAttribute('data-correct') === 'true';
        choices.forEach(function(x) { x.style.opacity = '0.5'; });
        this.style.opacity = '1';
        if (isCorrect) {
          this.classList.add('correct');
          resultEl.style.background = '#D1FAE5';
          resultEl.style.color = '#065F46';
          var pts = parseInt(card.querySelector('.mpts').textContent.replace(/[^0-9]/g,'')) || 0;
          resultEl.innerHTML = '✅ 正解！ +' + pts + ' pt 獲得';
          // ポイント吸収演出
          if (window.missionPtAnimate) {
            setTimeout(function() { window.missionPtAnimate(pts, document.getElementById('mobjQuiz')); }, 800);
          }
        } else {
          this.style.background = '#FEE2E2';
          this.style.borderColor = '#FCA5A5';
          choices.forEach(function(x) { if (x.getAttribute('data-correct') === 'true') x.classList.add('correct'); });
          var correct = card.querySelector('.choice[data-correct="true"]');
          resultEl.style.background = '#FEF3C7';
          resultEl.style.color = '#92400E';
          resultEl.innerHTML = '❌ 不正解… 正解は「' + correct.textContent.trim() + '」';
        }
        resultEl.style.display = 'block';
        card.classList.add('answered');
      });
    });
  }

  // === ナビアクティブ状態の更新 ===
  function updateNav(name) {
    var navItems = document.querySelectorAll('.nav-item');
    var map = ['home', 'societies', 'missions', 'points', 'agent-profile'];
    navItems.forEach(function (item, i) {
      item.classList.toggle('active', map[i] === name);
      var dot = item.querySelector('.nav-dot');
      if (dot) dot.style.display = (map[i] === name) ? '' : 'none';
    });
  }

  // === ナビクリックイベント ===
  function initNav() {
    var navItems = document.querySelectorAll('.nav-item');
    var map = ['home', 'societies', 'missions', 'points', 'agent-profile'];
    navItems.forEach(function (item, i) {
      item.addEventListener('click', function () {
        navigateTo(map[i]);
      });
    });
  }

  // === 画面内イベントのバインド ===
  function bindScreenEvents() {
    document.querySelectorAll('.choice').forEach(function (c) {
      c.addEventListener('click', function () {
        var parent = this.closest('.choices');
        parent.querySelectorAll('.choice').forEach(function (x) {
          x.classList.remove('selected');
        });
        this.classList.add('selected');
      });
    });

    // 結社画面: データ駆動で描画
    if (currentScreen === 'societies') {
      loadSocieties();
    }
  }

  // =========================================================
  // 結社画面: societies.json からデータ読み込み・描画
  // =========================================================
  var societiesData = null;

  function loadSocieties() {
    if (societiesData) {
      renderSocieties(societiesData);
      return;
    }
    fetch('data/societies.json')
      .then(function(r) { return r.json(); })
      .then(function(data) {
        societiesData = data.societies;
        renderSocieties(societiesData);
      })
      .catch(function() {
        var grid = document.getElementById('socGrid');
        if (grid) grid.innerHTML = '<p style="color:var(--muted);text-align:center;padding:20px;">読み込みエラー</p>';
      });
  }

  function renderSocieties(societies) {
    // ランキングTOP3
    var rankEl = document.getElementById('socRanking');
    if (rankEl) {
      var sorted = societies.slice().sort(function(a,b) { return a.rank - b.rank; });
      var top3 = sorted.slice(0, 3);
      var rankColors = ['#E8A700', '#94A3B8', '#CD7F32'];
      var html = '';
      top3.forEach(function(s, i) {
        html += '<div style="display:flex;align-items:center;gap:10px;padding:10px 12px;background:white;border-radius:12px;margin-bottom:6px;box-shadow:0 1px 4px rgba(27,43,114,0.06);cursor:pointer;" data-key="' + s.key + '" class="soc-rank-click">'
          + '<span style="width:24px;height:24px;border-radius:50%;background:' + rankColors[i] + ';color:white;font-size:12px;font-weight:800;display:flex;align-items:center;justify-content:center;font-family:var(--font-h);">' + (i+1) + '</span>'
          + '<span style="font-size:16px;">' + s.icon + '</span>'
          + '<span style="flex:1;font-family:var(--font-h);font-size:13px;font-weight:700;color:var(--navy);">' + s.name + '</span>'
          + '<span style="font-family:var(--font-h);font-size:12px;font-weight:700;color:var(--muted);">' + s.totalPt.toLocaleString() + ' pt</span>'
          + '</div>';
      });
      rankEl.innerHTML = html;
      // ランキングカードクリック → 詳細
      rankEl.querySelectorAll('.soc-rank-click').forEach(function(el) {
        el.addEventListener('click', function() {
          var s = societies.find(function(x) { return x.key === el.getAttribute('data-key'); });
          if (s) showSocDetail(s);
        });
      });
    }

    // セレクトボックスに結社一覧を追加
    var selectEl = document.getElementById('socSelect');
    if (selectEl) {
      selectEl.innerHTML = '<option value="">結社を選択してください...</option>';
      societies.forEach(function(s) {
        selectEl.innerHTML += '<option value="' + s.key + '">' + s.icon + ' ' + s.name + '（' + s.prefecture + ' · ' + s.typeLabel + '）</option>';
      });
      selectEl.addEventListener('change', function() {
        if (!this.value) return;
        var s = societies.find(function(x) { return x.key === selectEl.value; });
        if (s) showSocDetail(s);
        this.value = ''; // リセット
      });
    }

    // あなたの所属結社
    var myListEl = document.getElementById('socMyList');
    if (myListEl) {
      var user = getUser();
      if (user && user.society) {
        var mySoc = societies.find(function(x) { return x.key === user.society; });
        if (mySoc) {
          myListEl.innerHTML = '<div style="display:flex;align-items:center;gap:12px;padding:12px;background:white;border-radius:12px;box-shadow:0 1px 4px rgba(27,43,114,0.06);cursor:pointer;" onclick="window._socDetailClick(\'' + mySoc.key + '\')">'
            + '<span style="font-size:28px;">' + mySoc.icon + '</span>'
            + '<div style="flex:1;">'
            + '<div style="font-family:var(--font-h);font-size:13px;font-weight:700;color:var(--navy);">' + mySoc.name + '</div>'
            + '<div style="font-size:10px;color:var(--muted);">' + mySoc.prefecture + ' · ' + mySoc.typeLabel + ' · 👥 ' + mySoc.members.toLocaleString() + '人</div>'
            + '</div>'
            + '<span style="font-size:10px;color:white;background:var(--navy);padding:4px 10px;border-radius:20px;font-family:var(--font-h);font-weight:700;">所属中</span>'
            + '</div>';
        }
      } else {
        myListEl.innerHTML = '<div style="text-align:center;padding:16px;color:var(--muted);font-size:12px;">まだ結社に所属していません</div>';
      }
    }

    // 詳細クリック用グローバル関数
    window._socDetailClick = function(key) {
      var s = societies.find(function(x) { return x.key === key; });
      if (s) showSocDetail(s);
    };
  }

  function showSocDetail(s) {
    var overlay = document.getElementById('socDetailOverlay');
    var modal = document.getElementById('socDetailModal');
    if (!overlay || !modal) return;

    var user = getUser();
    var isMember = user && (user.society === s.key);

    var html = '<button onclick="closeSocDetail()" style="position:absolute;top:10px;right:14px;background:none;border:none;font-size:20px;cursor:pointer;color:var(--muted);">✕</button>'
      + '<div style="text-align:center;margin-bottom:10px;">'
      + '<div style="font-size:40px;margin-bottom:4px;">' + s.icon + '</div>'
      + '<div style="font-family:var(--font-h);font-size:18px;font-weight:800;color:var(--navy);">' + s.name + '</div>'
      + '<div style="font-size:11px;color:var(--muted);">' + s.prefecture + ' · ' + s.typeLabel + ' · ' + s.members.toLocaleString() + '人</div>'
      + '</div>'
      + '<div style="font-size:12px;color:var(--text);line-height:1.7;margin-bottom:12px;">' + s.description + '</div>';

    // 加入ボタン or 所属中（説明文の直下）
    if (!isMember) {
      html += '<button onclick="joinSociety(\'' + s.key + '\')" style="width:100%;padding:12px;background:var(--navy);color:white;border:none;border-radius:12px;font-family:var(--font-h);font-size:14px;font-weight:700;cursor:pointer;margin-bottom:14px;">この結社に加入する</button>';
    } else {
      html += '<div style="text-align:center;font-size:12px;color:var(--navy);font-weight:700;padding:10px;background:var(--lavender);border-radius:12px;margin-bottom:14px;">✅ 所属中</div>';
    }

    html += '<div style="display:flex;gap:8px;margin-bottom:12px;">'
      + '<div style="flex:1;background:var(--bg);border-radius:10px;padding:10px;text-align:center;">'
      + '<div style="font-family:var(--font-h);font-size:18px;font-weight:800;color:var(--navy);">' + s.totalPt.toLocaleString() + '</div>'
      + '<div style="font-size:9px;color:var(--muted);">総ポイント</div></div>'
      + '<div style="flex:1;background:var(--bg);border-radius:10px;padding:10px;text-align:center;">'
      + '<div style="font-family:var(--font-h);font-size:18px;font-weight:800;color:var(--navy);">' + s.rank + '位</div>'
      + '<div style="font-size:9px;color:var(--muted);">全国ランキング</div></div>'
      + '</div>'

      + '<div style="font-family:var(--font-h);font-size:12px;font-weight:700;color:var(--navy);margin-bottom:6px;">👥 メンバー（' + s.members.toLocaleString() + '人）</div>'
      + '<div style="margin-bottom:12px;">' + s.topMembers.slice(0, 3).map(function(m, i) {
        return '<div style="font-size:11px;padding:4px 0;color:var(--text);border-bottom:1px solid var(--border);">' + (i+1) + '. ' + m + '</div>';
      }).join('') + '</div>'

      + '<div style="font-family:var(--font-h);font-size:12px;font-weight:700;color:var(--navy);margin-bottom:6px;">🎯 シーズンテーマ</div>'
      + '<div style="font-size:12px;color:var(--text);margin-bottom:12px;padding:8px 12px;background:var(--lavender);border-radius:8px;">' + s.season + '</div>'

      + '<div style="display:flex;flex-wrap:wrap;gap:4px;">' + s.landmarks.concat(s.cuisine).map(function(t) {
        return '<span style="font-size:10px;background:var(--bg);padding:3px 8px;border-radius:20px;color:var(--text);">' + t + '</span>';
      }).join('') + '</div>';

    modal.innerHTML = html;
    overlay.style.display = 'flex';
  }

  // グローバルに公開
  window.closeSocDetail = function() {
    var overlay = document.getElementById('socDetailOverlay');
    if (overlay) overlay.style.display = 'none';
  };

  window.joinSociety = function(key) {
    // TODO(backend): engage-svc POST /api/v1/societies/{key}/join
    alert(key + ' 結社への加入リクエストを送りました（仮実装）');
    closeSocDetail();
  };

  // === PC: ビューポート全高表示（スケーリング不要、390px固定幅で中央配置） ===
  function adjustScale() {
    if (window.innerWidth <= 430) return;
    var wrapper = document.getElementById('appWrapper');
    if (!wrapper) return;
    // PCでは390px幅・100vh高さでそのまま中央配置、transformなし
    wrapper.style.transform = 'none';
    wrapper.style.marginBottom = '0';
  }

  // === 現在時刻表示 ===
  function updateTime() {
    var now = new Date();
    var h = String(now.getHours()).padStart(2, '0');
    var m = String(now.getMinutes()).padStart(2, '0');
    var el = document.querySelector('.status-bar .time');
    if (el) el.textContent = h + ':' + m;
  }

  // === 初期化 ===
  function init() {
    updateTime();
    setInterval(updateTime, 10000);

    window.addEventListener('resize', adjustScale);
    adjustScale();

    initNav();

    // ユーザー確認
    var user = getUser();
    if (user) {
      // ログイン済み → そのままホーム
      userSociety = user.society;
      updateHeaderUI(user);
      navigateTo('home');
    } else {
      // 未ログイン → ログイン/新規登録画面を表示
      navigateTo('home'); // 背景としてホームを読み込み
      showAuthScreen();
    }

    setTimeout(hideLoader, 800);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
