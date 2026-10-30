"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AppHeader() {
  const pathname = usePathname();
  if (pathname === "/login") return null;
  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }
  return (
    <header className="no-print border-b border-slate-200 bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3 sm:px-6">
        <Link href="/" className="flex items-center gap-2 text-lg font-bold text-slate-900">
          <span className="grid h-8 w-8 place-items-center rounded-lg bg-indigo-700 text-sm text-white">✓</span>
          בודק מבחנים AI
        </Link>
        <nav className="flex items-center gap-4 text-sm">
          <Link href="/" className="text-slate-600 hover:text-slate-900">
            המבחנים שלי
          </Link>
          <Link href="/sessions/new" className="text-slate-600 hover:text-slate-900">
            מבחן חדש
          </Link>
          <button onClick={logout} className="text-slate-500 hover:text-slate-900">
            יציאה
          </button>
        </nav>
      </div>
    </header>
  );
}
