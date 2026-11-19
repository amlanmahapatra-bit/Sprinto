"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

export interface NavItem {
  href: string;
  label: string;
  count?: number;
}

export function NavLinks({ items }: { items: NavItem[] }) {
  const path = usePathname();
  return (
    <nav className="flex gap-1 overflow-x-auto md:flex-col md:gap-0.5">
      {items.map((it) => {
        const longer = items.some((o) => o.href !== it.href && o.href.startsWith(it.href + "/") && path.startsWith(o.href));
        const active = !longer && (path === it.href || path.startsWith(it.href + "/"));
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={active ? "page" : undefined}
            className={`flex items-center justify-between gap-2 whitespace-nowrap rounded-control px-3 py-2 text-sm transition-colors ${
              active ? "bg-active font-medium text-text" : "text-muted hover:bg-active/60 hover:text-text"
            }`}
          >
            <span>{it.label}</span>
            {it.count ? (
              <span className="rounded-full bg-accent-tint px-1.5 py-0.5 text-xs font-medium leading-none text-accent-ink">
                {it.count}
              </span>
            ) : null}
          </Link>
        );
      })}
    </nav>
  );
}
