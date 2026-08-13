require('dotenv').config();
const express = require('express');
const path = require('path');
const cookieParser = require('cookie-parser');
const Anthropic = require('@anthropic-ai/sdk');
const Stripe = require('stripe');
const store = require('./lib/store');
const db = require('./lib/db');
const auth = require('./lib/auth');
const { sendVerificationCode } = require('./lib/email');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

function sanitizeKey(value) {
  // Keep only characters that are actually valid in Anthropic/Stripe API keys, stripping
  // anything else (whitespace, control characters, stray Unicode) that could otherwise make
  // the key an illegal HTTP header value and crash the request.
  return (value || '').replace(/[^A-Za-z0-9_-]/g, '');
}

const cleanAnthropicKey = sanitizeKey(process.env.ANTHROPIC_API_KEY);
const cleanStripeKey = sanitizeKey(process.env.STRIPE_SECRET_KEY);
console.log(
  `ANTHROPIC_API_KEY: raw length ${(process.env.ANTHROPIC_API_KEY || '').length}, sanitized length ${cleanAnthropicKey.length} (expect ~108 for a real key)`
);
console.log(
  `STRIPE_SECRET_KEY: raw length ${(process.env.STRIPE_SECRET_KEY || '').length}, sanitized length ${cleanStripeKey.length}`
);

const anthropic = new Anthropic({ apiKey: cleanAnthropicKey || 'missing' });
const stripe = new Stripe(cleanStripeKey || 'sk_test_missing', { apiVersion: '2024-06-20' });

const FREE_DAILY = parseInt(process.env.FREE_DAILY_GENERATIONS || '2', 10);
const PACK_PRICE = parseInt(process.env.CREDIT_PACK_PRICE_USD || '9', 10);
const PACK_CREDITS = parseInt(process.env.CREDIT_PACK_CREDITS || '20', 10);
const PUBLIC_URL = (process.env.PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, '');
const ADMIN_EMAIL = (process.env.ADMIN_EMAIL || '').toLowerCase();
const CODE_TTL_MINUTES = 15;
const CODE_RESEND_COOLDOWN_MS = 60 * 1000;
const CODE_MAX_ATTEMPTS = 5;
const EMAIL_RE = /^[^\s@<>"]+@[^\s@<>"]+\.[^\s@<>"]+$/;

function isValidEmail(email) {
  return EMAIL_RE.test(email);
}

// ---------- auth routes ----------

app.post('/api/auth/signup', async (req, res) => {
  try {
    const email = (req.body?.email || '').trim().toLowerCase();
    if (!email || !isValidEmail(email)) {
      return res.status(400).json({ error: 'Please enter a valid email.' });
    }
    if (await store.getUserByEmail(email)) {
      return res.status(409).json({ error: 'An account with that email already exists. Please log in instead.' });
    }

    const existingPending = await store.getPendingSignup(email);
    if (existingPending && Date.now() - new Date(existingPending.last_sent_at).getTime() < CODE_RESEND_COOLDOWN_MS) {
      return res.status(429).json({ error: 'Please wait a bit before requesting another code.' });
    }

    const code = auth.generateCode();
    const codeHash = await auth.hashPassword(code);
    const expiresAt = new Date(Date.now() + CODE_TTL_MINUTES * 60 * 1000);
    await store.createPendingSignup(email, codeHash, expiresAt);
    await sendVerificationCode(email, code);

    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not send verification code. Please try again.' });
  }
});

app.post('/api/auth/verify-code', async (req, res) => {
  try {
    const email = (req.body?.email || '').trim().toLowerCase();
    const code = (req.body?.code || '').trim();
    const pending = await store.getPendingSignup(email);
    if (!pending) return res.status(400).json({ error: 'No signup found for that email. Please start over.' });
    if (new Date(pending.expires_at) < new Date()) {
      return res.status(400).json({ error: 'That code expired. Please request a new one.' });
    }
    if (pending.attempts >= CODE_MAX_ATTEMPTS) {
      await store.deletePendingSignup(email);
      return res.status(429).json({ error: 'Too many incorrect attempts. Please start signup again.' });
    }
    const ok = await auth.verifyPassword(code, pending.code_hash);
    if (!ok) {
      await store.incrementPendingSignupAttempts(email);
      return res.status(400).json({ error: 'That code is incorrect.' });
    }

    await store.markPendingSignupVerified(email);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not verify code. Please try again.' });
  }
});

app.post('/api/auth/set-password', async (req, res) => {
  try {
    const email = (req.body?.email || '').trim().toLowerCase();
    const password = req.body?.password || '';
    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters.' });
    }
    const pending = await store.getPendingSignup(email);
    if (!pending || !pending.verified) {
      return res.status(400).json({ error: 'Please verify your email code first.' });
    }

    const passwordHash = await auth.hashPassword(password);
    const isAdmin = ADMIN_EMAIL && email === ADMIN_EMAIL;
    const user = await store.createUser(email, passwordHash, Boolean(isAdmin));
    await store.deletePendingSignup(email);

    auth.issueSession(res, user.id);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not create your account. Please try again.' });
  }
});

app.post('/api/auth/login', async (req, res) => {
  try {
    const email = (req.body?.email || '').trim().toLowerCase();
    const password = req.body?.password || '';
    const user = await store.getUserByEmail(email);
    if (!user) return res.status(401).json({ error: 'Incorrect email or password.' });
    const ok = await auth.verifyPassword(password, user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Incorrect email or password.' });

    auth.issueSession(res, user.id);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not log in. Please try again.' });
  }
});

app.post('/api/auth/logout', (req, res) => {
  auth.clearSession(res);
  res.json({ ok: true });
});

app.get('/api/auth/me', async (req, res) => {
  try {
    const uid = auth.readSessionUserId(req);
    if (!uid) return res.json({ loggedIn: false });
    const user = await store.getUserById(uid);
    if (!user) return res.json({ loggedIn: false });
    res.json({
      loggedIn: true,
      email: user.email,
      isAdmin: user.is_admin,
      freeAccess: user.free_access,
      credits: user.credits
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ loggedIn: false, error: 'Could not check login status.' });
  }
});

app.post('/api/auth/change-password', auth.requireAuth, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body || {};
    if (!newPassword || newPassword.length < 8) {
      return res.status(400).json({ error: 'New password must be at least 8 characters.' });
    }
    const user = await store.getUserById(req.userId);
    const ok = await auth.verifyPassword(currentPassword || '', user.password_hash);
    if (!ok) return res.status(401).json({ error: 'Current password is incorrect.' });

    const newHash = await auth.hashPassword(newPassword);
    await store.updateUserPassword(req.userId, newHash);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not change password.' });
  }
});

app.post('/api/auth/change-email', auth.requireAuth, async (req, res) => {
  try {
    const newEmail = (req.body?.newEmail || '').trim().toLowerCase();
    if (!newEmail || !isValidEmail(newEmail)) {
      return res.status(400).json({ error: 'Please enter a valid email.' });
    }
    if (await store.getUserByEmail(newEmail)) {
      return res.status(409).json({ error: 'That email is already in use.' });
    }
    await store.updateUserEmail(req.userId, newEmail);
    res.json({ ok: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not change email.' });
  }
});

// ---------- admin routes ----------

app.get('/api/admin/users', auth.requireAuth, async (req, res) => {
  try {
    const me = await store.getUserById(req.userId);
    if (!me || !me.is_admin) return res.status(403).json({ error: 'Admins only.' });
    res.json({ users: await store.listUsers() });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not load users.' });
  }
});

app.post('/api/admin/free-access', auth.requireAuth, async (req, res) => {
  try {
    const me = await store.getUserById(req.userId);
    if (!me || !me.is_admin) return res.status(403).json({ error: 'Admins only.' });
    const email = (req.body?.email || '').trim().toLowerCase();
    if (!email) return res.status(400).json({ error: 'Missing email.' });
    const updated = await store.setFreeAccess(email, Boolean(req.body?.freeAccess));
    if (!updated) return res.status(404).json({ error: 'No user with that email.' });
    res.json({ ok: true, user: { email: updated.email, freeAccess: updated.free_access } });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not update free access.' });
  }
});

// ---------- app routes ----------

app.get('/api/config', (req, res) => {
  res.json({ freeDaily: FREE_DAILY, packPrice: PACK_PRICE, packCredits: PACK_CREDITS });
});

app.post('/api/generate', auth.requireAuth, async (req, res) => {
  let reserved = null; // 'credit' | 'free' | null - tracks what was atomically reserved, for rollback on failure
  try {
    const { resume, jobPosting } = req.body || {};
    if (!resume || !jobPosting) {
      return res.status(400).json({ error: 'Please paste both your resume and the job posting.' });
    }
    if (resume.length > 20000 || jobPosting.length > 20000) {
      return res.status(400).json({ error: 'That text is too long. Please trim it down.' });
    }
    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'Server is not configured with an ANTHROPIC_API_KEY yet.' });
    }

    const user = await store.getUserById(req.userId);
    if (!user) return res.status(401).json({ error: 'NOT_LOGGED_IN', message: 'Please sign in to continue.' });

    const freeAccess = user.free_access;
    let usedCredit = false;

    if (!freeAccess) {
      // Atomically reserve a credit or a free use BEFORE calling the (slow, paid) Anthropic API,
      // so two concurrent requests can't both pass a stale check and both get a free generation.
      usedCredit = await store.useCredit(req.userId);
      if (usedCredit) {
        reserved = 'credit';
      } else {
        const gotFreeUse = await store.tryRecordFreeUse(req.userId, FREE_DAILY);
        if (!gotFreeUse) {
          return res.status(402).json({
            error: 'PAYMENT_REQUIRED',
            message: "You've used today's free tailorings. Buy a credit pack to keep going."
          });
        }
        reserved = 'free';
      }
    }

    const systemPrompt = `You are an expert resume writer and career coach who specializes in tailoring resumes to beat Applicant Tracking Systems (ATS) and land interviews. Given a candidate's existing resume and a specific job posting, you rewrite the resume to:
- Mirror the exact keywords and phrasing from the job posting where truthfully applicable
- Reorder and re-emphasize existing bullet points to foreground the most relevant experience
- Keep every fact truthful - never invent employers, titles, dates, or accomplishments the candidate didn't provide
- Use strong action verbs and quantify impact where the original resume gives you numbers to work with
- Keep formatting simple and ATS-friendly (no tables, no columns, plain section headers)

You also write a concise, specific, non-generic cover letter (under 300 words) for the same job, referencing 2-3 concrete things from the job posting and the candidate's background.

Output strictly in this format with these exact headers and nothing else before or after:
===RESUME===
(the tailored resume, plain text)
===COVER LETTER===
(the cover letter, plain text)`;

    const userPrompt = `CANDIDATE'S CURRENT RESUME:\n${resume}\n\nJOB POSTING:\n${jobPosting}`;
    const model = process.env.ANTHROPIC_MODEL || 'claude-sonnet-4-5-20250929';

    const msg = await anthropic.messages.create({
      model,
      max_tokens: 3000,
      system: systemPrompt,
      messages: [{ role: 'user', content: userPrompt }]
    });

    const text = msg.content.map((b) => b.text || '').join('\n');
    const parts = text.split('===COVER LETTER===');
    const tailoredResume = (parts[0] || '').replace('===RESUME===', '').trim();
    const coverLetter = (parts[1] || '').trim();

    res.json({ resume: tailoredResume || text, coverLetter, usedCredit, freeAccess });
  } catch (err) {
    console.error(err);
    // Refund whatever was reserved, since the generation never actually succeeded.
    if (reserved === 'credit') {
      await store.addCredits(req.userId, 1).catch((e) => console.error('Failed to refund credit:', e));
    } else if (reserved === 'free') {
      await store.undoFreeUse(req.userId).catch((e) => console.error('Failed to refund free use:', e));
    }
    res.status(500).json({ error: 'Something went wrong generating your resume. Please try again in a moment.' });
  }
});

app.post('/api/checkout', auth.requireAuth, async (req, res) => {
  try {
    if (!process.env.STRIPE_SECRET_KEY) {
      return res.status(500).json({ error: 'Stripe is not configured yet.' });
    }
    const session = await stripe.checkout.sessions.create({
      mode: 'payment',
      line_items: [
        {
          price_data: {
            currency: 'usd',
            product_data: { name: `ResumeFit - ${PACK_CREDITS} credit pack` },
            unit_amount: PACK_PRICE * 100
          },
          quantity: 1
        }
      ],
      metadata: { userId: req.userId },
      success_url: `${PUBLIC_URL}/?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${PUBLIC_URL}/`
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not start checkout. Double check your Stripe secret key.' });
  }
});

app.get('/api/verify-session', auth.requireAuth, async (req, res) => {
  try {
    const { session_id } = req.query;
    if (!session_id) return res.status(400).json({ error: 'Missing session_id' });
    const session = await stripe.checkout.sessions.retrieve(session_id);
    if (session.payment_status !== 'paid') {
      return res.json({ paid: false });
    }
    const payerId = session.metadata?.userId;
    if (!payerId) {
      return res.json({ paid: false });
    }
    // Always credit whoever actually paid, even if a different account is
    // currently logged in on this browser (session cookie changed since checkout).
    const granted = await store.grantCreditsForSession(session_id, payerId, PACK_CREDITS);
    if (payerId !== req.userId) {
      return res.json({ paid: true, forDifferentAccount: true });
    }
    const credits = await store.getCredits(req.userId);
    return res.json({ paid: true, granted, credits });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not verify payment.' });
  }
});

app.get('/healthz', (req, res) => res.send('ok'));

app.use(express.static(path.join(__dirname, 'public')));

const PORT = process.env.PORT || 3000;
db.init()
  .then(() => {
    app.listen(PORT, () => console.log(`ResumeFit running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('Failed to initialize database:', err);
    process.exit(1);
  });
