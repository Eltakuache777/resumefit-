require('dotenv').config();
const express = require('express');
const path = require('path');
const Anthropic = require('@anthropic-ai/sdk');
const Stripe = require('stripe');
const store = require('./lib/store');

const app = express();
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function sanitizeKey(value) {
  return (value || '').replace(/\s+/g, '');
}

const anthropic = new Anthropic({ apiKey: sanitizeKey(process.env.ANTHROPIC_API_KEY) || 'missing' });
const stripe = new Stripe(sanitizeKey(process.env.STRIPE_SECRET_KEY) || 'sk_test_missing', { apiVersion: '2024-06-20' });

const FREE_DAILY = parseInt(process.env.FREE_DAILY_GENERATIONS || '2', 10);
const PACK_PRICE = parseInt(process.env.CREDIT_PACK_PRICE_USD || '9', 10);
const PACK_CREDITS = parseInt(process.env.CREDIT_PACK_CREDITS || '20', 10);
const PUBLIC_URL = (process.env.PUBLIC_URL || 'http://localhost:3000').replace(/\/$/, '');

function getClientIp(req) {
  return (req.headers['x-forwarded-for'] || req.socket.remoteAddress || 'unknown')
    .toString()
    .split(',')[0]
    .trim();
}

app.get('/api/config', (req, res) => {
  res.json({ freeDaily: FREE_DAILY, packPrice: PACK_PRICE, packCredits: PACK_CREDITS });
});

app.post('/api/generate', async (req, res) => {
  try {
    const { resume, jobPosting, licenseKey } = req.body || {};
    if (!resume || !jobPosting) {
      return res.status(400).json({ error: 'Please paste both your resume and the job posting.' });
    }
    if (resume.length > 20000 || jobPosting.length > 20000) {
      return res.status(400).json({ error: 'That text is too long. Please trim it down.' });
    }

    const ip = getClientIp(req);
    const usedCredit = Boolean(licenseKey && store.getCredits(licenseKey) > 0);
    if (!usedCredit) {
      const freeLeft = store.getFreeUsesLeft(ip, FREE_DAILY);
      if (freeLeft <= 0) {
        return res.status(402).json({
          error: 'PAYMENT_REQUIRED',
          message: "You've used today's free tailorings. Buy a credit pack to keep going."
        });
      }
    }

    if (!process.env.ANTHROPIC_API_KEY) {
      return res.status(500).json({ error: 'Server is not configured with an ANTHROPIC_API_KEY yet.' });
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

    if (usedCredit) {
      store.useCredit(licenseKey);
    } else {
      store.recordFreeUse(ip);
    }

    res.json({ resume: tailoredResume || text, coverLetter, usedCredit });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Something went wrong generating your resume. Please try again in a moment.' });
  }
});

app.post('/api/checkout', async (req, res) => {
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
      success_url: `${PUBLIC_URL}/?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${PUBLIC_URL}/`
    });
    res.json({ url: session.url });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not start checkout. Double check your Stripe secret key.' });
  }
});

app.get('/api/verify-session', async (req, res) => {
  try {
    const { session_id } = req.query;
    if (!session_id) return res.status(400).json({ error: 'Missing session_id' });
    const session = await stripe.checkout.sessions.retrieve(session_id);
    if (session.payment_status === 'paid') {
      const licenseKey = store.createLicenseForSession(session_id, PACK_CREDITS);
      return res.json({ paid: true, licenseKey, credits: store.getCredits(licenseKey) });
    }
    res.json({ paid: false });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'Could not verify payment.' });
  }
});

app.get('/healthz', (req, res) => res.send('ok'));

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`ResumeFit running on port ${PORT}`));
