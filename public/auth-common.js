async function apiPost(path, body) {
  const res = await fetch(path, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body || {})
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || 'Something went wrong.');
  return data;
}

async function requireLoggedOutRedirect() {
  const res = await fetch('/api/auth/me');
  const data = await res.json();
  if (data.loggedIn) window.location.href = '/';
}

async function requireLoggedIn() {
  const res = await fetch('/api/auth/me');
  const data = await res.json();
  if (!data.loggedIn) {
    window.location.href = '/login.html';
    return null;
  }
  return data;
}
