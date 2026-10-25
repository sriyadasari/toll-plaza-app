"use client";
import { useEffect, useState } from "react";

export default function AdminPage() {
  const [d, setD] = useState<any>(null);
  const [msg, setMsg] = useState<{ text: string; ok: boolean } | null>(null);
  const [pName, setPName] = useState("");
  const [pLoc, setPLoc] = useState("");
  const [lPlaza, setLPlaza] = useState("");
  const [lNo, setLNo] = useState("");
  const [lType, setLType] = useState("FASTag");
  const [rates, setRates] = useState<Record<number, string>>({});

  async function load() {
    const r = await fetch("/api/admin");
    if (r.status === 401) { window.location.href = "/login"; return; }
    if (r.status === 403) { window.location.href = "/dashboard"; return; }
    setD(await r.json());
  }
  useEffect(() => { load(); }, []);

  async function call(method: string, url: string, body?: any, okText = "Done") {
    const r = await fetch(url, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
    });
    const j = await r.json();
    setMsg({ text: r.ok ? okText : j.error, ok: r.ok });
    if (r.ok) load();
    return r.ok;
  }

  async function addPlaza() {
    if (await call("POST", "/api/admin", { action: "addPlaza", name: pName, location: pLoc }, "Plaza added")) {
      setPName(""); setPLoc("");
    }
  }
  async function addLane() {
    if (await call("POST", "/api/admin",
      { action: "addLane", plazaId: lPlaza, laneNo: lNo, laneType: lType }, "Lane added")) setLNo("");
  }
  function del(type: string, id: number, label: string) {
    if (confirm(`Delete ${label}?`)) call("DELETE", `/api/admin?type=${type}&id=${id}`, undefined, "Deleted");
  }

  const input = "border rounded px-3 py-2 text-slate-800 bg-white text-sm";
  const card = "bg-white rounded-xl shadow p-4 space-y-3";

  if (!d) return <main className="p-8 text-slate-500">Loading...</main>;

  return (
    <main className="min-h-screen bg-slate-100 p-6 space-y-6 text-slate-800">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Admin</h1>
          <p className="text-sm text-slate-500">Manage plazas, lanes and toll rates (Admin only).</p>
        </div>
        <a href="/dashboard" className="bg-slate-800 text-white rounded px-4 py-2 text-sm">
          Back to dashboard
        </a>
      </header>

      {msg && (
        <p className={`rounded px-3 py-2 text-sm font-medium ${msg.ok ? "bg-green-100 text-green-800" : "bg-red-100 text-red-800"}`}>
          {msg.text}
        </p>
      )}

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={card}>
          <h2 className="font-semibold">Add plaza</h2>
          <input className={input + " w-full"} placeholder="Plaza name" value={pName} onChange={(e) => setPName(e.target.value)} />
          <input className={input + " w-full"} placeholder="Location" value={pLoc} onChange={(e) => setPLoc(e.target.value)} />
          <button onClick={addPlaza} disabled={!pName || !pLoc}
                  className="bg-blue-600 text-white rounded px-4 py-2 text-sm disabled:opacity-50">Add plaza</button>
        </div>

        <div className={card}>
          <h2 className="font-semibold">Add lane</h2>
          <select className={input + " w-full"} value={lPlaza} onChange={(e) => setLPlaza(e.target.value)}>
            <option value="">Select plaza</option>
            {d.plazas.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
          <input className={input + " w-full"} type="number" placeholder="Lane number" value={lNo} onChange={(e) => setLNo(e.target.value)} />
          <select className={input + " w-full"} value={lType} onChange={(e) => setLType(e.target.value)}>
            <option>FASTag</option><option>Manual</option><option>Express</option>
          </select>
          <button onClick={addLane} disabled={!lPlaza || !lNo}
                  className="bg-blue-600 text-white rounded px-4 py-2 text-sm disabled:opacity-50">Add lane</button>
        </div>
      </section>

      <section className={card + " overflow-x-auto"}>
        <h2 className="font-semibold">Toll rates</h2>
        <table className="w-full text-sm">
          <thead><tr className="text-left text-slate-500 border-b">
            <th className="py-2">Class</th><th>Current rate</th><th>New rate (₹)</th><th></th>
          </tr></thead>
          <tbody>
            {d.classes.map((c: any) => (
              <tr key={c.id} className="border-b last:border-0">
                <td className="py-2">{c.name}</td>
                <td>₹{c.rate}</td>
                <td>
                  <input className={input + " w-28"} type="number" value={rates[c.id] ?? ""}
                         onChange={(e) => setRates({ ...rates, [c.id]: e.target.value })} />
                </td>
                <td>
                  <button disabled={!rates[c.id]}
                          onClick={() => call("PUT", "/api/admin", { classId: c.id, rate: rates[c.id] }, "Rate updated")}
                          className="bg-green-600 text-white rounded px-3 py-1 text-sm disabled:opacity-50">Update</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>

      <section className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className={card + " overflow-x-auto"}>
          <h2 className="font-semibold">Plazas</h2>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-slate-500 border-b">
              <th className="py-2">Name</th><th>Location</th><th>Lanes</th><th></th>
            </tr></thead>
            <tbody>
              {d.plazas.map((p: any) => (
                <tr key={p.id} className="border-b last:border-0">
                  <td className="py-2">{p.name}</td><td>{p.location}</td><td>{p.lanes}</td>
                  <td><button onClick={() => del("plaza", p.id, p.name)} className="text-red-600 text-sm">Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className={card + " overflow-x-auto"}>
          <h2 className="font-semibold">Lanes</h2>
          <table className="w-full text-sm">
            <thead><tr className="text-left text-slate-500 border-b">
              <th className="py-2">Plaza</th><th>Lane</th><th>Type</th><th></th>
            </tr></thead>
            <tbody>
              {d.lanes.map((l: any) => (
                <tr key={l.id} className="border-b last:border-0">
                  <td className="py-2">{l.plaza}</td><td>{l.laneNo}</td><td>{l.type}</td>
                  <td><button onClick={() => del("lane", l.id, `${l.plaza} lane ${l.laneNo}`)} className="text-red-600 text-sm">Delete</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}