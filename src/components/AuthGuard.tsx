"use client";

// POC MODE: no login — this is just the app chrome/nav now.
import Link from "next/link";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen">
      <nav className="flex items-center justify-between border-b border-zinc-800 px-6 py-3">
        <Link href="/app" className="text-lg font-bold tracking-tight">
          Reclaim<span className="text-teal-400">.</span>
        </Link>
        <div className="flex items-center gap-4 text-sm text-zinc-300">
          <Link href="/app" className="hover:text-white">Speak</Link>
          <Link href="/onboarding" className="hover:text-white">Training</Link>
          <Link href="/settings" className="hover:text-white">Settings</Link>
        </div>
      </nav>
      {children}
    </div>
  );
}
