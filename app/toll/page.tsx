"use client";
import { useEffect, useState } from "react";

const RESULT_STYLE: Record<string, string> = {
  Success: "bg-green-100 text-green-800",
  Failed: "bg-red-100 text-red-800",
  Insufficient_Balance: "bg-amber-100 text-amber-800",
  Tag_Not_Found: "bg-red-100 text-red-800",
  Error: "bg-red-100 text-red-800",
};
const TAG_COLOR: Record<string, string> = {
  Active: "text-green-700", Blocked: "text-red-600", Expired: "text-slate-500",
};

export default function TollPage() {
  const [tags, setTags] = useState<any[]>([]);
  const [lanes, setLanes] = useState<any[]>([]);
  const [classes, setClasses] = useState<any[]>([]);
  const [role, setRole] = useState("");
  const [tag, setTag] = useState("");
  const [lane, setLane] = useState("");
  const [rTag, setRTag] = useState("");
  const [amount, setAmount] = useState("");
  const [tollMsg, setTollMsg] = useState<{ text: string; cls: string } | null>(null);
  const [rechargeMsg, setRechargeMsg] = useState<{ text: string; cls: string } | null>(null);

  async function load() {
    const r = await fetch("/api/toll");
    if (r.status === 401) { window.location.href = "/login"; return; }
    const j = await r.json();
    setTags(j.tags || []);
    setLanes(j.lanes || []);
    setClasses(j.classes || []);
  }

  useEffect(() => {
    load();
    fetch("/api/me")
      .then((r) => (r.ok ? r.json() : null))
      .then((u) => setRole(u?.role || ""));
  }, []);

  async function processToll() {
    setTollMsg(null);
    const r = await fetch("/api/toll", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag, lane }),
    });
    const j = await r.json();
    if (!r.ok) setTollMsg({ text: j.error, cls: RESULT_STYLE.Error });
    else setTollMsg({
      text: `${j.result}${j.synced ? " (graph updated)" : ""}`,
      cls: RESULT_STYLE[j.result] || RESULT_STYLE.Error,
    });
    load();
  }

  async function recharge() {
    setRechargeMsg(null);
    const r = await fetch("/api/recharge", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ tag: rTag, amount }),
    });
    const j = await r.json();
    if (!r.ok) setRechargeMsg({ text: j.error, cls: RESULT_STYLE.Error });
    else { setRechargeMsg({ text: "Recharge successful", cls: RESULT_STYLE.Success }); setAmount(""); }
    load();
  }

  const input = "w-full border rounded px-3 py-2 text-slate-800 bg-white";

  return (
    <main className="min-h-screen bg-slate-100 p-6 space-y-6 text-slate-800">
      <header>
        <h1 className="text-2xl font-bold">Toll Processing</h1>
        <p className="text-sm text-slate-500">
          Calls the process_toll stored procedure
          {role === "Admin" ? " and the recharge_tag stored procedure." : "."}
        </p>
      </header>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="bg-white rounded-xl shadow p-4 space-y-3">
          <h2 className="font-semibold">Vehicle passes through lane</h2>
          <select className={input} value={tag} onChange={(e) => setTag(e.target.value)}>
            <option value="">Select tag</option>
            {tags.map((t) => (
              <option key={t.tag} value={t.tag}>{t.tag} · {t.reg} · ₹{t.balance}</option>
            ))}
          </select>
          <select className={input} value={lane} onChange={(e) => setLane(e.target.value)}>
            <option value="">Select lane</option>
            {lanes.map((l) => (
              <option key={l.id} value={l.id}>{l.plaza} · Lane {l.laneNo} ({l.type})</option>
            ))}
          </select>
          <button
            onClick={processToll}
            disabled={!tag || !lane}
            className="w-full bg-blue-600 text-white rounded py-2 font-medium disabled:opacity-50"
          >
            Process toll
          </button>
          {tollMsg && <p className={`rounded px-3 py-2 text-sm font-medium ${tollMsg.cls}`}>{tollMsg.text}</p>}
        </div>

        {role === "Admin" && (
          <div className="bg-white rounded-xl shadow p-4 space-y-3">
            <h2 className="font-semibold">Recharge a tag (Admin)</h2>
            <select className={input} value={rTag} onChange={(e) => setRTag(e.target.value)}>
              <option value="">Select tag</option>
              {tags.map((t) => (
                <option key={t.tag} value={t.tag}>{t.tag} · {t.reg} · {t.status}</option>
              ))}
            </select>
            <input
              className={input} type="number" placeholder="Amount (₹)"
              value={amount} onChange={(e) => setAmount(e.target.value)}
            />
            <button
              onClick={recharge}
              disabled={!rTag || !amount}
              className="w-full bg-green-600 text-white rounded py-2 font-medium disabled:opacity-50"
            >
              Recharge
            </button>
            {rechargeMsg && <p className={`rounded px-3 py-2 text-sm font-medium ${rechargeMsg.cls}`}>{rechargeMsg.text}</p>}
          </div>
        )}
      </section>

      {classes.length > 0 && (
        <section className="bg-white rounded-xl shadow p-4">
          <h2 className="font-semibold mb-1">Toll rate card</h2>
          <p className="text-xs text-slate-500 mb-3">
            Rates depend on vehicle class and are the same in every lane.
          </p>
          <div className="flex flex-wrap gap-3">
            {classes.map((c) => (
              <div key={c.name} className="border rounded-lg px-4 py-2">
                <p className="text-sm text-slate-500">{c.name}</p>
                <p className="text-lg font-bold">₹{c.rate}</p>
              </div>
            ))}
          </div>
        </section>
      )}

      <section className="bg-white rounded-xl shadow p-4 overflow-x-auto">
        <h2 className="font-semibold mb-3">Live tag balances</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b">
              <th className="py-2">Tag</th><th>Vehicle</th><th>Owner</th><th>Class</th>
              <th>Toll</th><th>Balance</th><th>Status</th>
            </tr>
          </thead>
          <tbody>
            {tags.map((t) => (
              <tr key={t.tag} className="border-b last:border-0">
                <td className="py-2">{t.tag}</td><td>{t.reg}</td><td>{t.owner}</td>
                <td>{t.class}</td><td>₹{t.rate}</td><td>₹{t.balance}</td>
                <td className={TAG_COLOR[t.status]}>{t.status}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}