const $ = (sel) => document.querySelector(sel);

$('#loginBtn').addEventListener('click', async () => {
  const errorBox = $('#loginError');
  errorBox.style.display = 'none';

  const email = $('#email').value.trim();
  const password = $('#password').value;
  if (!email || !password) {
    errorBox.textContent = 'Please enter your email and password.';
    errorBox.style.display = 'block';
    return;
  }

  const btn = $('#loginBtn');
  btn.disabled = true;
  btn.textContent = 'Logging in...';
  try {
    await apiPost('/api/auth/login', { email, password });
    window.location.href = '/';
  } catch (e) {
    errorBox.textContent = e.message;
    errorBox.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Log in →';
  }
});

$('#password').addEventListener('keydown', (e) => {
  if (e.key === 'Enter') $('#loginBtn').click();
});

requireLoggedOutRedirect();
