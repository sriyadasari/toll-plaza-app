"use client";
import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/toll", label: "Toll processing" },
  { href: "/transactions", label: "Transactions" },
  { href: "/anomalies", label: "Anomalies" },
  { href: "/admin", label: "Admin", adminOnly: true },
];

export default function Nav() {
  const pathname = usePathname();
  const [user, setUser] = useState<{ username: string; role: string } | null>(null);

  useEffect(() => {
    if (pathname === "/login") { setUser(null); return; }
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then(setUser)
      .catch(() => setUser(null));
  }, [pathname]);

  if (pathname === "/login" || !user) return null;

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  return (
    <nav className="bg-slate-900 text-white px-6 py-3 flex flex-wrap items-center gap-2">
      <span className="font-bold mr-4">Toll Plaza Ledger</span>
      {LINKS.filter((l) => !l.adminOnly || user.role === "Admin").map((l) => (
        <a
          key={l.href}
          href={l.href}
          className={`rounded px-3 py-1.5 text-sm ${
            pathname.startsWith(l.href) ? "bg-blue-600" : "hover:bg-slate-700"
          }`}
        >
          {l.label}
        </a>
      ))}
      <span className="ml-auto text-sm text-slate-300">
        {user.username} ({user.role})
      </span>
      <button onClick={logout} className="bg-slate-700 hover:bg-slate-600 rounded px-3 py-1.5 text-sm">
        Log out
      </button>
    </nav>
  );
}