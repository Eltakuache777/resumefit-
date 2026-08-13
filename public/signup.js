const $ = (sel) => document.querySelector(sel);

let pendingEmail = '';

function showStep(step) {
  $('#stepEmail').style.display = step === 'email' ? 'block' : 'none';
  $('#stepCode').style.display = step === 'code' ? 'block' : 'none';
  $('#stepPassword').style.display = step === 'password' ? 'block' : 'none';
}

function showError(id, msg) {
  const box = $(id);
  box.textContent = msg;
  box.style.display = 'block';
}
function hideError(id) {
  $(id).style.display = 'none';
}

$('#sendCodeBtn').addEventListener('click', async () => {
  hideError('#emailError');
  const email = $('#email').value.trim();
  if (!email) return showError('#emailError', 'Please enter your email.');

  const btn = $('#sendCodeBtn');
  btn.disabled = true;
  btn.textContent = 'Sending...';
  try {
    await apiPost('/api/auth/signup', { email });
    pendingEmail = email;
    $('#codeEmailLabel').textContent = email;
    showStep('code');
  } catch (e) {
    showError('#emailError', e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Send verification code →';
  }
});

$('#verifyCodeBtn').addEventListener('click', async () => {
  hideError('#codeError');
  const code = $('#code').value.trim();
  if (!code) return showError('#codeError', 'Please enter the code.');

  const btn = $('#verifyCodeBtn');
  btn.disabled = true;
  btn.textContent = 'Verifying...';
  try {
    await apiPost('/api/auth/verify-code', { email: pendingEmail, code });
    showStep('password');
  } catch (e) {
    showError('#codeError', e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Verify code →';
  }
});

$('#setPasswordBtn').addEventListener('click', async () => {
  hideError('#passwordError');
  const password = $('#password').value;
  if (password.length < 8) return showError('#passwordError', 'Password must be at least 8 characters.');

  const btn = $('#setPasswordBtn');
  btn.disabled = true;
  btn.textContent = 'Creating account...';
  try {
    await apiPost('/api/auth/set-password', { email: pendingEmail, password });
    window.location.href = '/';
  } catch (e) {
    showError('#passwordError', e.message);
    btn.disabled = false;
    btn.textContent = 'Create account →';
  }
});

requireLoggedOutRedirect();
