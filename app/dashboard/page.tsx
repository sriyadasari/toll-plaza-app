"use client";
import { useEffect, useState } from "react";
import {
  BarChart, Bar, XAxis, YAxis, Tooltip, CartesianGrid, ResponsiveContainer,
  PieChart, Pie, Cell, LineChart, Line,
} from "recharts";

const COLORS = ["#16a34a", "#dc2626", "#f59e0b", "#2563eb", "#7c3aed"];
const STATUS_COLOR: Record<string, string> = {
  Success: "#16a34a", Failed: "#dc2626", Insufficient_Balance: "#f59e0b",
};

function Card({ title, value, tone = "text-slate-800" }: { title: string; value: string | number; tone?: string }) {
  return (
    <div className="bg-white rounded-xl shadow p-4">
      <p className="text-sm text-slate-500">{title}</p>
      <p className={`text-2xl font-bold ${tone}`}>{value}</p>
    </div>
  );
}

function Panel({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white rounded-xl shadow p-4">
      <h2 className="font-semibold text-slate-700 mb-3">{title}</h2>
      <div style={{ width: "100%", height: 260 }}>{children}</div>
    </div>
  );
}

export default function Dashboard() {
  const [d, setD] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/dashboard")
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error || "Failed to load");
        setD(j);
      })
      .catch((e) => setError(e.message));
  }, []);

  async function logout() {
    await fetch("/api/auth/logout", { method: "POST" });
    window.location.href = "/login";
  }

  if (error) return <main className="p-8 text-red-600">Error: {error}</main>;
  if (!d) return <main className="p-8 text-slate-500">Loading dashboard...</main>;

  const failRate = d.kpi.total ? ((d.kpi.failed / d.kpi.total) * 100).toFixed(1) : "0";

  return (
    <main className="min-h-screen bg-slate-100 p-6 space-y-6 text-slate-800">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Toll Plaza Dashboard</h1>
          <p className="text-sm text-slate-500">
            Signed in as {d.user.username} ({d.user.role})
          </p>
        </div>
        <button onClick={logout} className="bg-slate-800 text-white rounded px-4 py-2 text-sm">
          Log out
        </button>
      </header>

      <section className="grid grid-cols-2 lg:grid-cols-5 gap-4">
        <Card title="Total revenue" value={`₹${d.kpi.revenue.toLocaleString("en-IN")}`} tone="text-green-700" />
        <Card title="Transactions" value={d.kpi.total} />
        <Card title="Successful" value={d.kpi.success} tone="text-green-700" />
        <Card title="Failure rate" value={`${failRate}%`} tone="text-red-600" />
        <Card title="Low-balance tags" value={d.kpi.lowBalanceTags} tone="text-amber-600" />
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Panel title="Revenue per plaza (₹)">
          <ResponsiveContainer>
            <BarChart data={d.byPlaza}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" interval={0} tick={{ fontSize: 10 }} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="revenue" fill="#2563eb" />
            </BarChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Transaction status">
          <ResponsiveContainer>
            <PieChart>
              <Pie data={d.byStatus} dataKey="value" nameKey="name" outerRadius={90} label>
                {d.byStatus.map((s: any, i: number) => (
                  <Cell key={s.name} fill={STATUS_COLOR[s.name] || COLORS[i % COLORS.length]} />
                ))}
              </Pie>
              <Tooltip />
            </PieChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Traffic per day">
          <ResponsiveContainer>
            <LineChart data={d.byDay}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="day" tick={{ fontSize: 11 }} />
              <YAxis allowDecimals={false} />
              <Tooltip />
              <Line type="monotone" dataKey="txns" stroke="#7c3aed" strokeWidth={2} />
            </LineChart>
          </ResponsiveContainer>
        </Panel>

        <Panel title="Revenue by vehicle class (₹)">
          <ResponsiveContainer>
            <BarChart data={d.byClass}>
              <CartesianGrid strokeDasharray="3 3" />
              <XAxis dataKey="name" tick={{ fontSize: 11 }} />
              <YAxis />
              <Tooltip />
              <Bar dataKey="revenue" fill="#f59e0b" />
            </BarChart>
          </ResponsiveContainer>
        </Panel>
      </section>

      <section className="bg-white rounded-xl shadow p-4 overflow-x-auto">
        <h2 className="font-semibold text-slate-700 mb-3">Latest transactions</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b">
              <th className="py-2">ID</th><th>Time</th><th>Vehicle</th><th>Tag</th>
              <th>Plaza</th><th>Amount</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {d.recent.map((r: any) => (
              <tr key={r.id} className="border-b last:border-0">
                <td className="py-2">{r.id}</td>
                <td>{new Date(r.ts).toLocaleString()}</td>
                <td>{r.reg}</td>
                <td>{r.tag}</td>
                <td>{r.plaza}</td>
                <td>₹{r.amount}</td>
                <td style={{ color: STATUS_COLOR[r.status] }}>{r.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}