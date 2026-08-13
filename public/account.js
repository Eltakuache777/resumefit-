const $ = (sel) => document.querySelector(sel);

(async () => {
  const me = await requireLoggedIn();
  if (!me) return;
  const bits = [];
  if (me.freeAccess) bits.push('You have free unlimited access.');
  else bits.push(`You have ${me.credits} paid credit(s).`);
  $('#accountSummary').textContent = `Logged in as ${me.email}. ${bits.join(' ')}`;
  if (me.isAdmin) {
    const link = $('#adminLink');
    link.style.display = 'inline';
    link.href = '/admin.html';
  }
})();

$('#logoutBtn').addEventListener('click', async () => {
  await apiPost('/api/auth/logout');
  window.location.href = '/login.html';
});

$('#changeEmailBtn').addEventListener('click', async () => {
  const errorBox = $('#emailError');
  const successBox = $('#emailSuccess');
  errorBox.style.display = 'none';
  successBox.style.display = 'none';

  const newEmail = $('#newEmail').value.trim();
  if (!newEmail) {
    errorBox.textContent = 'Please enter a new email.';
    errorBox.style.display = 'block';
    return;
  }
  const btn = $('#changeEmailBtn');
  btn.disabled = true;
  try {
    await apiPost('/api/auth/change-email', { newEmail });
    successBox.textContent = 'Email updated.';
    successBox.style.display = 'block';
    $('#newEmail').value = '';
  } catch (e) {
    errorBox.textContent = e.message;
    errorBox.style.display = 'block';
  } finally {
    btn.disabled = false;
  }
});

$('#changePasswordBtn').addEventListener('click', async () => {
  const errorBox = $('#passwordError');
  const successBox = $('#passwordSuccess');
  errorBox.style.display = 'none';
  successBox.style.display = 'none';

  const currentPassword = $('#currentPassword').value;
  const newPassword = $('#newPassword').value;
  if (!currentPassword || !newPassword) {
    errorBox.textContent = 'Please fill in both fields.';
    errorBox.style.display = 'block';
    return;
  }
  const btn = $('#changePasswordBtn');
  btn.disabled = true;
  try {
    await apiPost('/api/auth/change-password', { currentPassword, newPassword });
    successBox.textContent = 'Password updated.';
    successBox.style.display = 'block';
    $('#currentPassword').value = '';
    $('#newPassword').value = '';
  } catch (e) {
    errorBox.textContent = e.message;
    errorBox.style.display = 'block';
  } finally {
    btn.disabled = false;
  }
});
