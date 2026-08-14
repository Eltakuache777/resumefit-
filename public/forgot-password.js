const $ = (sel) => document.querySelector(sel);

let pendingEmail = '';

function showStep(step) {
  $('#stepEmail').style.display = step === 'email' ? 'block' : 'none';
  $('#stepReset').style.display = step === 'reset' ? 'block' : 'none';
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
    await apiPost('/api/auth/forgot-password', { email });
    pendingEmail = email;
    $('#codeEmailLabel').textContent = email;
    showStep('reset');
  } catch (e) {
    showError('#emailError', e.message);
  } finally {
    btn.disabled = false;
    btn.textContent = 'Send reset code →';
  }
});

$('#resetBtn').addEventListener('click', async () => {
  hideError('#resetError');
  const code = $('#code').value.trim();
  const newPassword = $('#newPassword').value;
  if (!code) return showError('#resetError', 'Please enter the code.');
  if (newPassword.length < 8) return showError('#resetError', 'Password must be at least 8 characters.');

  const btn = $('#resetBtn');
  btn.disabled = true;
  btn.textContent = 'Resetting...';
  try {
    await apiPost('/api/auth/reset-password', { email: pendingEmail, code, newPassword });
    window.location.href = '/';
  } catch (e) {
    showError('#resetError', e.message);
    btn.disabled = false;
    btn.textContent = 'Reset password →';
  }
});

requireLoggedOutRedirect();
