import Link from "next/link";
import type { ButtonHTMLAttributes, ReactNode } from "react";

const VERDICT: Record<string, string> = {
  GO: "bg-[var(--pill-positive-bg)] text-[var(--pill-positive-ink)]",
  NO_GO: "bg-[var(--pill-negative-bg)] text-[var(--pill-negative-ink)]",
  HOLD: "bg-[var(--pill-warning-bg)] text-[var(--pill-warning-ink)]",
  RESEARCH_MORE: "bg-[var(--pill-accent-bg)] text-[var(--pill-accent-ink)]",
};

export function VerdictBadge({ verdict }: { verdict: string | null }) {
  const c = VERDICT[verdict ?? ""] ?? "bg-[var(--pill-neutral-bg)] text-[var(--pill-neutral-ink)]";
  return (
    <span className={`inline-flex shrink-0 items-center rounded px-2 py-0.5 text-xs font-medium ${c}`}>
      {verdict ?? "—"}
    </span>
  );
}

export function Flag({ children }: { children: ReactNode }) {
  return (
    <span className="inline-flex shrink-0 items-center whitespace-nowrap rounded bg-[var(--pill-warning-bg)] px-1.5 py-0.5 text-[11px] font-medium text-[var(--pill-warning-ink)]">
      {children}
    </span>
  );
}

export function Card({ children, className = "" }: { children: ReactNode; className?: string }) {
  return <div className={`rounded-card border border-border bg-surface glass card-hover p-4 ${className}`}>{children}</div>;
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="px-4 py-3.5">
      <div className="text-sm font-medium text-muted">{label}</div>
      <div className="mt-1.5 text-[30px] font-semibold leading-none tracking-tight tabular-nums gradient-text">{value}</div>
      {sub ? <div className="mt-1.5 text-xs text-muted">{sub}</div> : null}
    </div>
  );
}

const BTN: Record<string, string> = {
  primary: "btn-glow text-white",
  accent: "btn-glow text-white",
  secondary: "border border-control/70 bg-surface text-text hover:bg-raised",
  ghost: "text-muted hover:bg-raised hover:text-text",
};

export function Button({
  children,
  variant = "secondary",
  className = "",
  ...rest
}: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: keyof typeof BTN }) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-1.5 rounded-control px-3 py-1.5 text-sm font-medium transition-colors disabled:pointer-events-none disabled:opacity-50 ${BTN[variant]} ${className}`}
      {...rest}
    >
      {children}
    </button>
  );
}

export function LinkButton({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-flex items-center rounded-control border border-control/70 bg-surface px-3 py-1.5 text-sm font-medium text-text transition-colors hover:bg-raised"
    >
      {children}
    </Link>
  );
}
