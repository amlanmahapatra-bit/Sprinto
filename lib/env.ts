// Central env accessor. Server-only secrets must never be imported into client components.
// Values are read lazily (getters) so a CLI that loads .env.local at runtime still sees them.

function s(key: string, dflt = ""): string {
  return process.env[key] ?? dflt;
}

export const env = {
  get DATABASE_URL() { return s("DATABASE_URL"); },
  get SUPABASE_URL() { return s("NEXT_PUBLIC_SUPABASE_URL"); },
  get SUPABASE_ANON_KEY() { return s("NEXT_PUBLIC_SUPABASE_ANON_KEY"); },
  get SUPABASE_SERVICE_ROLE_KEY() { return s("SUPABASE_SERVICE_ROLE_KEY"); },

  get GEMINI_API_KEY() { return s("GEMINI_API_KEY"); },
  get GEMINI_MODEL_FAST() { return s("GEMINI_MODEL_FAST", "gemini-2.5-flash"); },
  get GEMINI_MODEL_WRITER() { return s("GEMINI_MODEL_WRITER", "gemini-2.5-flash"); },

  // OpenRouter (OpenAI-compatible). When OPENROUTER_API_KEY is set the LLM layer routes
  // through OpenRouter instead of Google — Gemini model ids are prefixed with "google/".
  // Google Search grounding is unavailable via OpenRouter, so the research agent relies
  // on scraped evidence only.
  get OPENROUTER_API_KEY() { return s("OPENROUTER_API_KEY"); },
  get OPENROUTER_BASE_URL() { return s("OPENROUTER_BASE_URL", "https://openrouter.ai/api/v1"); },
  get LLM_PROVIDER(): "openrouter" | "google" {
    const p = s("LLM_PROVIDER").toLowerCase();
    if (p === "openrouter" || p === "google") return p;
    return s("OPENROUTER_API_KEY") ? "openrouter" : "google";
  },

  get HUNTER_API_KEY() { return s("HUNTER_API_KEY"); },
  get HUNTER_MONTHLY_LIMIT() { return Number(s("HUNTER_MONTHLY_LIMIT", "25")); },

  get JINA_API_KEY() { return s("JINA_API_KEY"); },
  get FIRECRAWL_API_KEY() { return s("FIRECRAWL_API_KEY"); },

  get GMAIL_CLIENT_ID() { return s("GMAIL_CLIENT_ID"); },
  get GMAIL_CLIENT_SECRET() { return s("GMAIL_CLIENT_SECRET"); },
  get GMAIL_REFRESH_TOKEN() { return s("GMAIL_REFRESH_TOKEN"); },
  get GMAIL_SENDER() { return s("GMAIL_SENDER"); },
  // App Password (SMTP) alternative to OAuth — simpler to set up. When present, the mailer
  // sends via Gmail SMTP instead of the Gmail API.
  get GMAIL_APP_PASSWORD() { return s("GMAIL_APP_PASSWORD"); },

  // Resend (HTTP API). When RESEND_API_KEY is set it is the preferred transport. RESEND_FROM
  // must be a Resend-verified domain; left blank it falls back to onboarding@resend.dev, which
  // only delivers to the account owner's own verified email (i.e. DEMO_RECIPIENT).
  get RESEND_API_KEY() { return s("RESEND_API_KEY"); },
  get RESEND_FROM() { return s("RESEND_FROM"); },

  get DEMO_RECIPIENT() { return s("DEMO_RECIPIENT"); },
  get LIVE_SEND() { return s("LIVE_SEND", "false").toLowerCase() === "true"; },
  get SEND_MODE() { return (s("SEND_MODE", "review") as "review" | "auto"); },
  get MAX_SENDS_PER_DAY() { return Number(s("MAX_SENDS_PER_DAY", "20")); },
  get SENDER_NAME() { return s("SENDER_NAME", "Growth Lead"); },
  get SENDER_TITLE() { return s("SENDER_TITLE", "Growth Lead"); },

  get APP_BASE_URL() { return s("APP_BASE_URL", "http://localhost:3000"); },
  get WORKER_SECRET() { return s("WORKER_SECRET"); },

  get MOCK_EXTERNAL() { return process.env.MOCK_EXTERNAL === "1"; },
};

export function assertDemoRecipient(to: string): void {
  // Hard boundary (CLAUDE.md): never send to anyone except DEMO_RECIPIENT.
  const demo = env.DEMO_RECIPIENT.trim().toLowerCase();
  if (!demo) throw new Error("DEMO_RECIPIENT is not set; refusing to send.");
  if (to.trim().toLowerCase() !== demo) {
    throw new Error(`Refusing to send: to=${to} is not DEMO_RECIPIENT.`);
  }
  if (env.LIVE_SEND) {
    throw new Error("LIVE_SEND must stay false in this build.");
  }
}
