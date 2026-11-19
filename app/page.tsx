import Link from "next/link";

const STEPS = [
  { n: "01", t: "Discover", d: "Paste domains, upload a CSV, or pull companies that just raised from live news." },
  { n: "02", t: "Qualify", d: "A deterministic 7-criterion ICP score. Every point is backed by a verbatim quote and a source URL." },
  { n: "03", t: "Find the person", d: "Decision-maker lookup, ranked by persona and verified before anything is drafted." },
  { n: "04", t: "Rank the pains", d: "Two role-specific pains chosen from a fixed library, never invented." },
  { n: "05", t: "Draft", d: "A personalised email where every fact traces to evidence or an approved Sprinto claim." },
  { n: "06", t: "Review & send", d: "A human gate. Edit, approve or reject with a reason. Nothing leaves without you." },
];

const FEATURES = [
  { k: "Evidence-first", d: "No fact reaches an email without a quote and a link. A validator (V1–V9) and a critic score every draft.", g: "from-violet-500/30" },
  { k: "Deterministic scoring", d: "The LLM never decides a verdict, a score or a recipient. Versioned ICP config, fully diffable.", g: "from-cyan-400/25" },
  { k: "Resumable pipeline", d: "A Postgres state machine with row-level locking. Crash anywhere, resume exactly where you stopped.", g: "from-fuchsia-500/25" },
  { k: "Full “Why?” trace", d: "Open any company and see why it qualified, why this contact, why these pains and why this email.", g: "from-blue-500/30" },
  { k: "Human in the loop", d: "Live edit-ratio tracking and structured reject reasons turn the review gate into measurement.", g: "from-emerald-400/25" },
  { k: "Safe by construction", d: "Every send is asserted to a single demo inbox in code. LIVE_SEND is off by design.", g: "from-amber-400/25" },
];

const STATS = [
  { v: "15–20 min", l: "manual research per company" },
  { v: "< 60 s", l: "engine, domain to draft" },
  { v: "100%", l: "claims traced to a source" },
  { v: "0", l: "emails sent without approval" },
];

function Mock() {
  const rows = [
    { d: "ledgerly.io", v: "GO", s: 95, p: "PP3 + PP1", c: "text-emerald-300 bg-emerald-400/10" },
    { d: "trustvault.com", v: "GO", s: 78, p: "PP5 + PP4", c: "text-emerald-300 bg-emerald-400/10" },
    { d: "orbitfleet.co", v: "HOLD", s: 53, p: "—", c: "text-amber-300 bg-amber-400/10" },
    { d: "megacorp.com", v: "NO_GO", s: 0, p: "—", c: "text-rose-300 bg-rose-400/10" },
  ];
  return (
    <div className="relative">
      <div className="absolute -inset-6 rounded-[32px] bg-gradient-to-tr from-violet-600/40 via-blue-500/20 to-cyan-400/30 blur-3xl" />
      <div className="glass relative overflow-hidden rounded-2xl border border-white/10 bg-[#0b0d18]/85 shadow-2xl">
        <div className="flex items-center gap-1.5 border-b border-white/5 px-4 py-3">
          <span className="h-2.5 w-2.5 rounded-full bg-rose-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400/70" />
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-400/70" />
          <span className="mono ml-3 text-[11px] text-faint">run · review mode · 4 companies</span>
          <span className="ml-auto flex items-center gap-1.5 text-[11px] text-emerald-300"><span className="live-dot" /> live</span>
        </div>
        <div className="p-4">
          <div className="mono grid grid-cols-[1.4fr_.7fr_.5fr_1fr] gap-2 px-2 pb-2 text-[10px] uppercase tracking-widest text-faint">
            <span>Company</span><span>Verdict</span><span>Score</span><span>Pains</span>
          </div>
          {rows.map((r) => (
            <div key={r.d} className="mono grid grid-cols-[1.4fr_.7fr_.5fr_1fr] items-center gap-2 rounded-lg px-2 py-2 text-xs hover:bg-white/5">
              <span className="text-text">{r.d}</span>
              <span className={`w-fit rounded px-1.5 py-0.5 text-[11px] font-medium ${r.c}`}>{r.v}</span>
              <span className="tnum text-muted">{r.s || "–"}</span>
              <span className="text-muted">{r.p}</span>
            </div>
          ))}
          <div className="mt-3 rounded-xl border border-white/10 bg-white/[0.03] p-3.5">
            <div className="mono text-[10px] uppercase tracking-widest text-accent-ink">Draft · ledgerly.io</div>
            <div className="mt-2 text-sm font-medium">Quick thought on SOC 2 before your next enterprise deal</div>
            <div className="mt-1.5 text-xs leading-relaxed text-muted">
              Congrats on the Series A. With <span className="rounded bg-violet-500/25 px-1 text-violet-200">two security hires open</span> on your careers page, it looks like compliance is about to land on engineering&apos;s plate…
            </div>
            <div className="mt-3 flex gap-2 text-[11px]">
              <span className="rounded-full bg-emerald-400/10 px-2 py-0.5 text-emerald-300">V1–V9 passed</span>
              <span className="rounded-full bg-white/5 px-2 py-0.5 text-muted">edit ratio 0.08</span>
              <span className="rounded-full bg-white/5 px-2 py-0.5 text-muted">→ demo inbox</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Home() {
  return (
    <div className="relative min-h-screen overflow-x-hidden">
      {/* top bar */}
      <header className="glass sticky top-0 z-30 border-b border-white/5 bg-[#05060b]/60">
        <div className="mx-auto flex max-w-[1200px] items-center justify-between px-5 py-3.5">
          <Link href="/" className="flex items-center gap-2.5">
            <svg width="28" height="28" viewBox="0 0 26 26" fill="none" aria-hidden="true">
              <defs><linearGradient id="lg" x1="0" y1="0" x2="26" y2="26"><stop stopColor="#7c5cff" /><stop offset="1" stopColor="#22d3ee" /></linearGradient></defs>
              <rect width="26" height="26" rx="8" fill="url(#lg)" />
              <path d="M5.5 13.2 19.5 6.5 14.8 20 11.6 14.4Z" fill="#fff" />
            </svg>
            <span className="text-[15px] font-bold">Sprinto <span className="gradient-text">Outreach</span></span>
          </Link>
          <nav className="hidden items-center gap-7 text-sm text-muted md:flex">
            <a href="#how" className="hover:text-text">How it works</a>
            <a href="#why" className="hover:text-text">Why it&apos;s different</a>
            <a href="#safe" className="hover:text-text">Guardrails</a>
          </nav>
          <Link href="/runs/new" className="btn-glow rounded-control px-4 py-2 text-sm font-semibold text-white transition">Open the app →</Link>
        </div>
      </header>

      {/* hero */}
      <section className="mx-auto grid max-w-[1200px] items-center gap-14 px-5 pb-20 pt-16 md:grid-cols-[1.05fr_1fr] md:pt-24">
        <div>
          <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1 text-xs text-muted">
            <span className="live-dot" /> MESA PGP · AI Case 2 — Cold Outreach, at Scale
          </div>
          <h1 className="gradient-text mt-6 text-[44px] font-bold leading-[1.02] md:text-[72px]">
            Outbound that can defend every sentence.
          </h1>
          <p className="mt-6 max-w-xl text-base leading-relaxed text-muted md:text-lg">
            Give the engine a list of domains. It qualifies each company against Sprinto&apos;s ICP, finds the
            decision-maker, ranks their two likeliest pains and drafts a personalised first email, with every fact
            traced to a source and a human approving every send.
          </p>
          <div className="mt-9 flex flex-wrap gap-3">
            <Link href="/runs/new" className="btn-glow rounded-control px-6 py-3 text-sm font-semibold text-white transition">Launch a run →</Link>
            <Link href="/review" className="rounded-control border border-white/15 bg-white/5 px-6 py-3 text-sm font-medium transition hover:bg-white/10">Open review gate</Link>
          </div>
          <div className="mono mt-8 flex flex-wrap gap-x-6 gap-y-1 text-[11px] uppercase tracking-widest text-faint">
            <span>Next.js 15</span><span>Neon Postgres</span><span>Gemini</span><span>Hunter</span><span>Resend</span>
          </div>
        </div>
        <Mock />
      </section>

      {/* stats */}
      <section className="mx-auto max-w-[1200px] px-5">
        <div className="glass grid grid-cols-2 overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] md:grid-cols-4">
          {STATS.map((s, i) => (
            <div key={s.l} className={`p-6 ${i ? "md:border-l md:border-white/10" : ""}`}>
              <div className="gradient-text text-3xl font-bold tnum md:text-4xl">{s.v}</div>
              <div className="mt-1.5 text-sm text-muted">{s.l}</div>
            </div>
          ))}
        </div>
      </section>

      {/* how */}
      <section id="how" className="mx-auto max-w-[1200px] scroll-mt-20 px-5 py-24">
        <div className="mono text-xs uppercase tracking-widest text-accent-ink">The pipeline</div>
        <h2 className="mt-3 max-w-2xl text-3xl font-bold md:text-5xl">Six steps from a bare domain to an approved draft.</h2>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {STEPS.map((s) => (
            <div key={s.n} className="glass card-hover group relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <div className="mono text-sm text-accent-ink">{s.n}</div>
              <div className="mt-6 text-xl font-semibold">{s.t}</div>
              <p className="mt-2 text-sm leading-relaxed text-muted">{s.d}</p>
              <div className="pointer-events-none absolute -bottom-10 -right-10 h-28 w-28 rounded-full bg-violet-500/20 blur-2xl transition group-hover:bg-cyan-400/25" />
            </div>
          ))}
        </div>
      </section>

      {/* why */}
      <section id="why" className="mx-auto max-w-[1200px] scroll-mt-20 px-5 pb-24">
        <div className="mono text-xs uppercase tracking-widest text-accent-ink">Why it&apos;s different</div>
        <h2 className="mt-3 max-w-2xl text-3xl font-bold md:text-5xl">Built so a Growth Lead can trust it, not just use it.</h2>
        <div className="mt-12 grid gap-4 md:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.k} className="glass card-hover relative overflow-hidden rounded-2xl border border-white/10 bg-white/[0.03] p-6">
              <div className={`absolute inset-x-0 top-0 h-24 bg-gradient-to-b ${f.g} to-transparent`} />
              <div className="relative text-lg font-semibold">{f.k}</div>
              <p className="relative mt-2 text-sm leading-relaxed text-muted">{f.d}</p>
            </div>
          ))}
        </div>
      </section>

      {/* safety */}
      <section id="safe" className="mx-auto max-w-[1200px] scroll-mt-20 px-5 pb-24">
        <div className="glass relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-violet-600/20 via-transparent to-cyan-400/15 p-8 md:p-14">
          <div className="mono text-xs uppercase tracking-widest text-accent-ink">Guardrails</div>
          <h2 className="mt-3 max-w-3xl text-3xl font-bold md:text-4xl">Hard boundaries, enforced in code, not in a prompt.</h2>
          <ul className="mono mt-8 grid gap-3 text-sm text-muted md:grid-cols-2">
            {[
              "Every send is asserted to the single demo recipient before dispatch",
              "The LLM never decides a score, verdict, PoC or recipient",
              "No fact without a verbatim quote and source URL",
              "No LinkedIn scraping; robots.txt respected",
              "Contact lookup only for GO companies, quota-checked first",
              "ICP changes only by a new, noted, explicitly activated version",
            ].map((x) => (
              <li key={x} className="flex gap-3"><span className="text-emerald-300">✓</span>{x}</li>
            ))}
          </ul>
        </div>
      </section>

      {/* cta */}
      <section className="mx-auto max-w-[1200px] px-5 pb-24 text-center">
        <h2 className="gradient-text mx-auto max-w-3xl text-4xl font-bold md:text-6xl">Run your first batch in under a minute.</h2>
        <div className="mt-9 flex justify-center gap-3">
          <Link href="/runs/new" className="btn-glow rounded-control px-7 py-3.5 text-sm font-semibold text-white transition">Launch a run →</Link>
          <Link href="/runs" className="rounded-control border border-white/15 bg-white/5 px-7 py-3.5 text-sm font-medium transition hover:bg-white/10">See metrics</Link>
        </div>
      </section>

      <footer className="border-t border-white/5 py-8 text-center text-xs text-faint">
        Sprinto Outreach Engine · MESA PGP Term 2 · every send goes to our own inbox
      </footer>
    </div>
  );
}
