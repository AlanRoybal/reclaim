"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { EqMark } from "./ui";

const LINKS = [
  { href: "/app", label: "Speak" },
  { href: "/onboarding", label: "My voice" },
  { href: "/settings", label: "Settings" },
];

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  return (
    <div className="min-h-screen">
      <nav className="sticky top-0 z-10 border-b border-stone-800 bg-stone-950/80 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-3">
          <Link href="/app" className="flex items-center gap-2 text-lg font-bold tracking-tight">
            <EqMark className="h-4" />
            Reclaim
          </Link>
          <div className="flex items-center gap-1 text-sm">
            {LINKS.map((l) => (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-lg px-3 py-1.5 transition ${
                  pathname === l.href
                    ? "bg-stone-800 text-stone-50"
                    : "text-stone-400 hover:bg-stone-900 hover:text-stone-100"
                }`}
              >
                {l.label}
              </Link>
            ))}
          </div>
        </div>
      </nav>
      {children}
    </div>
  );
}
