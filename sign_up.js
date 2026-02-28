<!DOCTYPE html>
<html>
<head>
  <base target="_top">
  <link href="https://fonts.googleapis.com/icon?family=Material+Icons" rel="stylesheet">
  <style>
    :root { --primary: #2563eb; --error: #dc2626; --success: #10b981; --bg: #f8fafc; }
    body { font-family: sans-serif; background: var(--bg); margin: 0; display: flex; justify-content: center; align-items: center; min-height: 100vh; }
    .card { background: white; padding: 24px; border-radius: 12px; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.1); width: 90%; max-width: 400px; }
    h2 { color: var(--primary); margin: 0 0 20px 0; text-align: center; }
    .step { display: none; }
    .step.active { display: block; }
    .input-group { margin-bottom: 16px; }
    label { display: block; font-size: 14px; margin-bottom: 4px; color: #64748b; }
    input { width: 100%; padding: 12px; border: 1px solid #e2e8f0; border-radius: 6px; box-sizing: border-box; font-size: 16px; }
    button { width: 100%; padding: 14px; background: var(--primary); color: white; border: none; border-radius: 8px; font-weight: bold; cursor: pointer; margin-top: 10px; }
    button:disabled { background: #94a3b8; cursor: not-allowed; }
    .msg { font-size: 14px; text-align: center; margin-top: 10px; min-height: 20px; }
    
    /* 成功時のアニメーション */
    @keyframes pop { from { transform: scale(0); opacity: 0; } to { transform: scale(1); opacity: 1; } }
    .success-icon { font-size: 64px; color: var(--success); animation: pop 0.4s cubic-bezier(0.175, 0.885, 0.32, 1.275); }
  </style>
</head>
<body>

<div id="mainBox" class="card">
  <h2>アカウント登録</h2>

  <div id="step1" class="step active">
    <div class="input-group">
      <label>配布されたID</label>
      <input type="text" id="regId" placeholder="例: 1001">
    </div>
    <div class="input-group">
      <label>お名前（ひらがな）</label>
      <input type="text" id="regName" placeholder="例: やまだ たろう">
    </div>
    <button id="nextBtn" onclick="checkIdentity()">次へ</button>
    <p id="err1" class="msg" style="color:var(--error)"></p>
  </div>

  <div id="step2" class="step">
    <div class="input-group">
      <label>メールアドレス</label>
      <input type="email" id="regEmail" placeholder="example@mail.com">
    </div>
    <div class="input-group">
      <label>パスワード (8文字以上32文字以内)</label>
      <input type="password" id="regPass1" oninput="validatePass()">
    </div>
    <div class="input-group">
      <label>パスワード (再入力)</label>
      <input type="password" id="regPass2" oninput="validatePass()">
    </div>
    <button id="submitBtn" onclick="submitRegister()" disabled>登録を完了する</button>
    <p id="err2" class="msg" style="color:var(--error)"></p>
  </div>
</div>

<script>
  const LOGIN_URL = "<?= appUrl ?>";
  let verifiedId = "";

  function checkIdentity() {
    const id = document.getElementById('regId').value.trim();
    const name = document.getElementById('regName').value.trim();
    const res = await callGasApi({
        action: 'verifyInitialID',
        id: id,
        name: name
    });
      if(res.success) {
        verifiedId = id;
        document.getElementById('step1').classList.remove('active');
        document.getElementById('step2').classList.add('active');
      } else {
        document.getElementById('err1').innerText = res.message;
      }
  }

  function validatePass() {
    const p1 = document.getElementById('regPass1').value;
    const p2 = document.getElementById('regPass2').value;
    const btn = document.getElementById('submitBtn');
    btn.disabled = !(p1.length >= 8 && p1 === p2);
  }

  function submitRegister() {
    const email = document.getElementById('regEmail').value.trim();
    const pass = document.getElementById('regPass1').value;
    const btn = document.getElementById('submitBtn');
    const err = document.getElementById('err2');
    
    btn.disabled = true;
    err.style.color = "var(--primary)";
    err.innerText = "登録情報を送信中...";

    const res = await callGasApi({
        action: 'registerUser',
        verifiedId: verifiedId,
        email: email,
        pass: pass
    });
      if(res.success) {
        // --- 成功時の即時処理 ---
        const mainBox = document.getElementById('mainBox');
        mainBox.innerHTML = `
          <div style="text-align:center; padding:20px;">
            <i class="material-icons success-icon">check_circle</i>
            <h2 style="color:var(--success); margin-top:10px;">登録完了！</h2>
            <p style="color:#64748b;">ログイン画面へ移動します...</p>
            <div style="margin-top:20px;">
              <a href="${LOGIN_URL}" target="_top" style="display:inline-block; padding:12px 24px; background:var(--primary); color:white; border-radius:8px; text-decoration:none; font-weight:bold; font-size:14px;">戻らない場合はこちら</a>
            </div>
          </div>
        `;

        // ブラウザの「ボタン操作の熱量」が残っているうちに遷移
        setTimeout(() => {
          window.top.location.href = LOGIN_URL;
        }, 800);

      } else {
        btn.disabled = false;
        err.style.color = "var(--error)";
        err.innerText = res.message;
      }
    }
}
</script>
</body>

</html>
