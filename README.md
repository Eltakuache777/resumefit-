# ResumeFit

Paste a resume + a job posting → get back an ATS-tailored resume and a real cover letter. Free tier (2/day), then a paid credit pack via Stripe.

## 1. Get your API keys (10 minutes)

1. **Anthropic API key** — go to https://console.anthropic.com, sign up, add a small amount of credit (even $5 is enough to start), then create an API key under Settings → API Keys. Copy it.
2. **Stripe secret key** — go to https://dashboard.stripe.com, finish account setup (you'll need to add your bank details to actually receive payouts — do this now, not later, since verification can take a day or two), then go to Developers → API Keys and copy the **Secret key** (starts with `sk_live_...` once you're out of test mode, `sk_test_...` while testing).

## 2. Run it locally first (5 minutes)

```
cd resume-tailor
cp .env.example .env
# open .env and paste in your real ANTHROPIC_API_KEY and STRIPE_SECRET_KEY
npm install
npm start
```

Open http://localhost:3000 and try tailoring a resume. Leave Stripe in test mode (`sk_test_...` key) while you're testing so you don't get charged real money — use Stripe's test card `4242 4242 4242 4242`, any future expiry, any CVC.

## 3. Deploy it for free (15 minutes)

The easiest free option is **Render**:

1. Push this folder to a new GitHub repo (create one at github.com/new, then `git init`, `git add .`, `git commit -m "launch"`, `git remote add origin <your repo url>`, `git push -u origin main`).
2. Go to https://render.com, sign up, click **New → Web Service**, connect your GitHub repo.
3. Settings: Build command `npm install`, Start command `npm start`, Instance type: Free.
4. Under **Environment**, add these variables (same names as in `.env.example`): `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL`, `STRIPE_SECRET_KEY`, `CREDIT_PACK_PRICE_USD`, `CREDIT_PACK_CREDITS`, `FREE_DAILY_GENERATIONS`, `PUBLIC_URL` (set this to the `https://your-app-name.onrender.com` URL Render gives you — you can update it after the first deploy).
5. Deploy. Once it's live, switch `STRIPE_SECRET_KEY` to your real `sk_live_...` key so you can actually get paid, and redeploy.

Render's free tier spins the app down after 15 minutes of no traffic and takes ~30-60 seconds to wake back up on the next visit. That's fine for launch; if it becomes annoying once you have real traffic, upgrade to Render's $7/mo plan — you'll be well past $350 by then.

## 4. (Optional) Custom domain

Buy a cheap domain (Namecheap, Porkbun — around $10-15/year, `.com` if available, otherwise a short `.app` or `.co`), then in Render go to your service → Settings → Custom Domain and follow the DNS instructions. Not required to launch — your `onrender.com` URL works fine for the first posts.

## Known limitations (read this before you launch)

- **Credits/usage are stored in a JSON file, not a real database.** On Render's free tier this file can reset when the service redeploys or occasionally when it wakes from sleep. This will NOT lose anyone's money (Stripe already has the real payment record), but a customer could rarely lose already-granted credits. If that happens, you can look up their payment in the Stripe dashboard and manually re-issue a license key. Once you're getting consistent sales, ask Claude to help you swap this for a real free-tier database (Supabase Postgres is a good option) — it's a small change.
- **No email delivery of license keys yet.** The credit code is shown on-screen and saved to the browser's local storage. If you want to email it too, Stripe Checkout can collect an email and you can wire up a simple email send later.
- This is a real, working MVP — not a toy — but it's a first version. Expect to fix small things in the first week based on what real users hit.
