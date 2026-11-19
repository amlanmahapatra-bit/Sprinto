import Link from "next/link";
import { getSession } from "@/lib/auth/session";
import { serviceClient, hasServiceDb } from "@/lib/db/service";
import { NavLinks, type NavItem } from "@/components/NavLinks";

async function reviewCount(): Promise<number | undefined> {
  if (!hasServiceDb()) return undefined;
  try {
    const { count } = await serviceClient()
      .from("companies")
      .select("id", { count: "exact", head: true })
      .eq("stage", "awaiting_review");
    return count ?? undefined;
  } catch {
    return undefined;
  }
}

function Mark() {
  // A send glyph in the accent — the outreach engine's own mark, not a lettered square.
  return (
    <svg width="26" height="26" viewBox="0 0 26 26" fill="none" aria-hidden="true">
      <defs><linearGradient id="g" x1="0" y1="0" x2="26" y2="26"><stop stopColor="#7c5cff"/><stop offset="1" stopColor="#22d3ee"/></linearGradient></defs><rect width="26" height="26" rx="8" fill="url(#g)" />
      <path d="M5.5 13.2 19.5 6.5 14.8 20 11.6 14.4Z" fill="#ffffff" />
      <path d="M11.6 14.4 19.5 6.5" stroke="#4f8bff" strokeWidth="1.1" />
    </svg>
  );
}

export async function Nav() {
  const s = await getSession();
  const needs = await reviewCount();
  const items: NavItem[] = [
    { href: "/runs/new", label: "New run" },
    { href: "/review", label: "Review gate", count: needs || undefined },
    { href: "/runs", label: "Runs & metrics" },
    { href: "/icp", label: "ICP settings" },
  ];

  return (
    <aside className="flex shrink-0 flex-col gap-4 bg-ground px-3 py-4 md:sticky md:top-0 md:h-screen md:w-[var(--sidebar-width)]">
      <Link href="/" title="Home" className="flex items-center gap-2.5 px-2">
        <Mark />
        <span className="flex flex-col leading-tight">
          <span className="text-[15px] font-bold text-text">Sprinto <span className="gradient-text">Outreach</span></span>
          <span className="flex items-center gap-1.5 text-xs text-muted"><span className="live-dot" /> Engine online</span>
        </span>
      </Link>

      <NavLinks items={items} />

      <div className="mt-auto hidden items-center gap-2.5 px-2 pt-3 md:flex">
        <div className="flex h-7 w-7 items-center justify-center rounded-full bg-accent-tint text-xs font-semibold text-accent-ink">
          {(s.email || "G").slice(0, 1).toUpperCase()}
        </div>
        <div className="flex min-w-0 flex-col leading-tight">
          <span className="truncate text-xs font-medium text-text">{s.email}</span>
          <span className="text-xs capitalize text-muted">{s.role}</span>
        </div>
      </div>
    </aside>
  );
}
