
  const LOGIN_URL = "<?= appUrl ?>";
  let verifiedId = "";

// 画面切り替え用関数
function goToSignup() {
    document.getElementById('loginSection').style.display = 'none';
    document.getElementById('signupSection').style.display = 'block';
}

function showLoginSection() {
    document.getElementById('signupSection').style.display = 'none';
    document.getElementById('loginSection').style.display = 'block';
}

  async function checkIdentity() {
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

  async function submitRegister() {
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
