const $ = (sel) => document.querySelector(sel);

let config = { freeDaily: 2, packPrice: 9, packCredits: 20 };

function getLicenseKey() {
  return localStorage.getItem('rf_license') || '';
}
function setLicenseKey(k) {
  localStorage.setItem('rf_license', k);
}
function todayCountKey() {
  return 'rf_used_' + new Date().toISOString().slice(0, 10);
}
function getLocalFreeUsedToday() {
  return parseInt(localStorage.getItem(todayCountKey()) || '0', 10);
}
function bumpLocalFreeUsedToday() {
  localStorage.setItem(todayCountKey(), String(getLocalFreeUsedToday() + 1));
}

async function loadConfig() {
  try {
    const r = await fetch('/api/config');
    config = await r.json();
    $('#packCredits').textContent = config.packCredits;
    $('#packPrice').textContent = '$' + config.packPrice;
    renderBanner();
  } catch (e) {
    // ignore, defaults are fine
  }
}

function renderBanner() {
  const used = getLocalFreeUsedToday();
  const left = Math.max(0, config.freeDaily - used);
  const banner = $('#freeBanner');
  if (getLicenseKey()) {
    banner.textContent = `You have paid credits available on this browser.`;
  } else {
    banner.textContent = `${left} of ${config.freeDaily} free tailorings left today.`;
  }
}

async function handleSuccessRedirect() {
  const params = new URLSearchParams(window.location.search);
  const sessionId = params.get('session_id');
  if (!sessionId) return;
  try {
    const r = await fetch('/api/verify-session?session_id=' + encodeURIComponent(sessionId));
    const data = await r.json();
    if (data.paid && data.licenseKey) {
      setLicenseKey(data.licenseKey);
      alert(`Payment received! ${data.credits} credits added to this browser. Save code ${data.licenseKey} in case you switch devices.`);
    }
  } catch (e) {
    console.error(e);
  }
  window.history.replaceState({}, '', window.location.pathname);
  renderBanner();
}

$('#generateBtn').addEventListener('click', async () => {
  const resume = $('#resume').value.trim();
  const jobPosting = $('#jobPosting').value.trim();
  const errorBox = $('#errorBox');
  errorBox.style.display = 'none';
  $('#payCard').style.display = 'none';

  if (!resume || !jobPosting) {
    errorBox.textContent = 'Please paste both your resume and the job posting.';
    errorBox.style.display = 'block';
    return;
  }

  const btn = $('#generateBtn');
  btn.disabled = true;
  btn.textContent = 'Tailoring...';

  try {
    const res = await fetch('/api/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ resume, jobPosting, licenseKey: getLicenseKey() })
    });
    const data = await res.json();

    if (res.status === 402) {
      $('#payCard').style.display = 'block';
      renderBanner();
      return;
    }
    if (!res.ok) {
      errorBox.textContent = data.error || 'Something went wrong.';
      errorBox.style.display = 'block';
      return;
    }

    if (!data.usedCredit) bumpLocalFreeUsedToday();
    $('#resumeOut').textContent = data.resume;
    $('#coverOut').textContent = data.coverLetter;
    $('#resultSection').style.display = 'block';
    $('#resultSection').scrollIntoView({ behavior: 'smooth' });
    renderBanner();
  } catch (e) {
    errorBox.textContent = 'Network error. Please try again.';
    errorBox.style.display = 'block';
  } finally {
    btn.disabled = false;
    btn.textContent = 'Tailor my resume →';
  }
});

document.querySelectorAll('.tab').forEach((tab) => {
  tab.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach((t) => t.classList.remove('active'));
    tab.classList.add('active');
    const which = tab.dataset.tab;
    $('#resumeOut').style.display = which === 'resume' ? 'block' : 'none';
    $('#coverOut').style.display = which === 'cover' ? 'block' : 'none';
  });
});

$('#copyBtn').addEventListener('click', () => {
  const visible = $('#resumeOut').style.display !== 'none' ? $('#resumeOut') : $('#coverOut');
  navigator.clipboard.writeText(visible.textContent);
  $('#copyBtn').textContent = 'Copied!';
  setTimeout(() => ($('#copyBtn').textContent = 'Copy text'), 1500);
});

$('#downloadBtn').addEventListener('click', () => {
  const visible = $('#resumeOut').style.display !== 'none' ? $('#resumeOut') : $('#coverOut');
  const name = $('#resumeOut').style.display !== 'none' ? 'tailored-resume.txt' : 'cover-letter.txt';
  const blob = new Blob([visible.textContent], { type: 'text/plain' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
});

$('#buyBtn').addEventListener('click', async () => {
  const btn = $('#buyBtn');
  btn.disabled = true;
  btn.textContent = 'Redirecting...';
  try {
    const r = await fetch('/api/checkout', { method: 'POST' });
    const data = await r.json();
    if (data.url) {
      window.location.href = data.url;
    } else {
      alert(data.error || 'Could not start checkout.');
      btn.disabled = false;
      btn.textContent = 'Buy credits →';
    }
  } catch (e) {
    alert('Network error starting checkout.');
    btn.disabled = false;
    btn.textContent = 'Buy credits →';
  }
});

loadConfig();
handleSuccessRedirect();
