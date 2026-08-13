const $ = (sel) => document.querySelector(sel);

function pill(text, on) {
  const span = document.createElement('span');
  span.className = 'pill ' + (on ? 'on' : 'off');
  span.textContent = text;
  return span;
}

function cell(content) {
  const td = document.createElement('td');
  if (content instanceof Node) td.appendChild(content);
  else td.textContent = content;
  return td;
}

function row(user) {
  const tr = document.createElement('tr');
  const joined = new Date(user.created_at).toLocaleDateString();

  const toggleBtn = document.createElement('button');
  toggleBtn.className = 'btn ghost toggle-btn';
  toggleBtn.dataset.email = user.email;
  toggleBtn.dataset.current = user.free_access;
  toggleBtn.textContent = (user.free_access ? 'Revoke' : 'Grant') + ' free access';

  tr.appendChild(cell(user.email));
  tr.appendChild(cell(pill(user.is_admin ? 'yes' : 'no', user.is_admin)));
  tr.appendChild(cell(pill(user.free_access ? 'on' : 'off', user.free_access)));
  tr.appendChild(cell(String(user.credits)));
  tr.appendChild(cell(joined));
  tr.appendChild(cell(toggleBtn));
  return tr;
}

async function loadUsers() {
  const errorBox = $('#adminError');
  errorBox.style.display = 'none';
  try {
    const res = await fetch('/api/admin/users');
    const data = await res.json();
    if (!res.ok) throw new Error(data.error || 'Could not load users.');

    const tbody = $('#usersBody');
    tbody.innerHTML = '';
    data.users.forEach((u) => tbody.appendChild(row(u)));

    tbody.querySelectorAll('.toggle-btn').forEach((btn) => {
      btn.addEventListener('click', async () => {
        const email = btn.dataset.email;
        const current = btn.dataset.current === 'true';
        btn.disabled = true;
        try {
          await apiPost('/api/admin/free-access', { email, freeAccess: !current });
          await loadUsers();
        } catch (e) {
          errorBox.textContent = e.message;
          errorBox.style.display = 'block';
          btn.disabled = false;
        }
      });
    });
  } catch (e) {
    errorBox.textContent = e.message;
    errorBox.style.display = 'block';
  }
}

$('#logoutBtn').addEventListener('click', async () => {
  await apiPost('/api/auth/logout');
  window.location.href = '/login.html';
});

(async () => {
  const me = await requireLoggedIn();
  if (!me) return;
  if (!me.isAdmin) {
    window.location.href = '/';
    return;
  }
  loadUsers();
})();
