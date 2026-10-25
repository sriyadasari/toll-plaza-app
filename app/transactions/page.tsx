"use client";
import { useEffect, useState } from "react";

const STATUS_COLOR: Record<string, string> = {
  Success: "#16a34a", Failed: "#dc2626", Insufficient_Balance: "#f59e0b",
};

export default function TransactionsPage() {
  const [q, setQ] = useState("");
  const [plaza, setPlaza] = useState("");
  const [status, setStatus] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");

  async function search() {
    const p = new URLSearchParams();
    if (q) p.set("q", q);
    if (plaza) p.set("plaza", plaza);
    if (status) p.set("status", status);
    if (from) p.set("from", from);
    if (to) p.set("to", to);
    const r = await fetch(`/api/transactions?${p.toString()}`);
    if (r.status === 401) { window.location.href = "/login"; return; }
    const j = await r.json();
    if (!r.ok) { setError(j.error); return; }
    setError("");
    setData(j);
  }
  useEffect(() => { search(); }, []);

  function reset() {
    setQ(""); setPlaza(""); setStatus(""); setFrom(""); setTo("");
    setTimeout(search, 0);
  }

  const input = "border rounded px-3 py-2 text-slate-800 bg-white text-sm";

  return (
    <main className="min-h-screen bg-slate-100 p-6 space-y-6 text-slate-800">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Transactions</h1>
          <p className="text-sm text-slate-500">Search and filter the ledger (latest 200 matches).</p>
        </div>
        <a href="/dashboard" className="bg-slate-800 text-white rounded px-4 py-2 text-sm">
          Back to dashboard
        </a>
      </header>

      <section className="bg-white rounded-xl shadow p-4 flex flex-wrap gap-3 items-end">
        <div>
          <label className="block text-xs text-slate-500 mb-1">Reg. number / tag</label>
          <input className={input} value={q} onChange={(e) => setQ(e.target.value)}
                 onKeyDown={(e) => e.key === "Enter" && search()} placeholder="KA01 or TAG1001" />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Plaza</label>
          <select className={input} value={plaza} onChange={(e) => setPlaza(e.target.value)}>
            <option value="">All plazas</option>
            {data?.plazas.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">Status</label>
          <select className={input} value={status} onChange={(e) => setStatus(e.target.value)}>
            <option value="">All</option>
            <option value="Success">Success</option>
            <option value="Failed">Failed</option>
            <option value="Insufficient_Balance">Insufficient_Balance</option>
          </select>
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">From</label>
          <input type="date" className={input} value={from} onChange={(e) => setFrom(e.target.value)} />
        </div>
        <div>
          <label className="block text-xs text-slate-500 mb-1">To</label>
          <input type="date" className={input} value={to} onChange={(e) => setTo(e.target.value)} />
        </div>
        <button onClick={search} className="bg-blue-600 text-white rounded px-4 py-2 text-sm">Search</button>
        <button onClick={reset} className="bg-slate-200 text-slate-800 rounded px-4 py-2 text-sm">Reset</button>
      </section>

      {error && <p className="text-red-600">Error: {error}</p>}

      {data && (
        <>
          <section className="grid grid-cols-2 gap-4 max-w-md">
            <div className="bg-white rounded-xl shadow p-4">
              <p className="text-sm text-slate-500">Matching transactions</p>
              <p className="text-2xl font-bold">{data.summary.total}</p>
            </div>
            <div className="bg-white rounded-xl shadow p-4">
              <p className="text-sm text-slate-500">Revenue (successful)</p>
              <p className="text-2xl font-bold text-green-700">
                ₹{data.summary.revenue.toLocaleString("en-IN")}
              </p>
            </div>
          </section>

          <section className="bg-white rounded-xl shadow p-4 overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b">
                  <th className="py-2">ID</th><th>Time</th><th>Vehicle</th><th>Tag</th>
                  <th>Plaza</th><th>Lane</th><th>Amount</th><th>Status</th>
                </tr>
              </thead>
              <tbody>
                {data.rows.map((r: any) => (
                  <tr key={r.id} className="border-b last:border-0">
                    <td className="py-2">{r.id}</td>
                    <td>{new Date(r.ts).toLocaleString()}</td>
                    <td>{r.reg}</td><td>{r.tag}</td><td>{r.plaza}</td><td>{r.lane}</td>
                    <td>₹{r.amount}</td>
                    <td style={{ color: STATUS_COLOR[r.status] }}>{r.status}</td>
                  </tr>
                ))}
                {data.rows.length === 0 && (
                  <tr><td colSpan={8} className="py-4 text-slate-500">No transactions match.</td></tr>
                )}
              </tbody>
            </table>
          </section>

          <section className="bg-white rounded-xl shadow p-4 overflow-x-auto">
            <h2 className="font-semibold mb-1">Above-average spenders</h2>
            <p className="text-xs text-slate-500 mb-3">
              Vehicles whose total successful toll spend exceeds the average per tag (subquery + HAVING).
            </p>
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b">
                  <th className="py-2">Vehicle</th><th>Owner</th><th>Trips</th><th>Total spent</th>
                </tr>
              </thead>
              <tbody>
                {data.topSpenders.map((t: any) => (
                  <tr key={t.reg} className="border-b last:border-0">
                    <td className="py-2">{t.reg}</td><td>{t.owner}</td><td>{t.trips}</td><td>₹{t.spent}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        </>
      )}
    </main>
  );
}