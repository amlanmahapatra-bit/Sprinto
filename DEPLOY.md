# Deploy to Vercel (2 minutes)

```bash
npm i -g vercel
vercel --prod        # accept defaults; framework = Next.js
```
Then set env vars (Vercel → Project → Settings → Environment Variables), values as in your `.env.local`:
DATABASE_URL, OPENROUTER_API_KEY, LLM_PROVIDER=openrouter, GEMINI_MODEL_FAST/WRITER=google/gemini-3.7-flash,
HUNTER_API_KEY, RESEND_API_KEY, DEMO_RECIPIENT, LIVE_SEND=false, WORKER_SECRET, APP_BASE_URL. Redeploy.
The Neon schema is already applied (neon/schema.sql).
