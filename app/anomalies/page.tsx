"use client";
import { useEffect, useState } from "react";

export default function AnomaliesPage() {
  const [anomalies, setAnomalies] = useState<any[] | null>(null);
  const [links, setLinks] = useState<any[]>([]);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/anomalies")
      .then(async (r) => {
        const j = await r.json();
        if (!r.ok) throw new Error(j.error);
        setAnomalies(j.anomalies);
      })
      .catch((e) => setError(e.message));
    fetch("/api/network")
      .then((r) => r.json())
      .then((j) => setLinks(j.links || []));
  }, []);

  return (
    <main className="min-h-screen bg-slate-100 p-6 space-y-6 text-slate-800">
      <header className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Cloned Tag Detection</h1>
          <p className="text-sm text-slate-500">
            Neo4j graph query: flags vehicles that appear at two plazas faster than the
            fastest possible route allows.
          </p>
        </div>
        <a href="/dashboard" className="bg-slate-800 text-white rounded px-4 py-2 text-sm">
          Back to dashboard
        </a>
      </header>

      {error && <p className="text-red-600">Error: {error}</p>}
      {!anomalies && !error && <p className="text-slate-500">Analysing journeys...</p>}

      {anomalies && (
        <section className="bg-white rounded-xl shadow p-4 overflow-x-auto">
          <h2 className="font-semibold mb-3">
            Impossible journeys ({anomalies.length})
          </h2>
          {anomalies.length === 0 ? (
            <p className="text-slate-500">No anomalies found.</p>
          ) : (
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-slate-500 border-b">
                  <th className="py-2">Vehicle</th><th>From</th><th>To</th>
                  <th>Time between</th><th>Fastest possible</th>
                </tr>
              </thead>
              <tbody>
                {anomalies.map((a, i) => (
                  <tr key={i} className="border-b last:border-0">
                    <td className="py-2 font-semibold text-red-600">{a.vehicle}</td>
                    <td>{a.fromPlaza}</td>
                    <td>{a.toPlaza}</td>
                    <td>{a.actualMin} min</td>
                    <td>{a.minTravelMin} min</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </section>
      )}

      <section className="bg-white rounded-xl shadow p-4 overflow-x-auto">
        <h2 className="font-semibold mb-3">Highway network</h2>
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-slate-500 border-b">
              <th className="py-2">From</th><th>To</th><th>Distance</th><th>Avg time</th>
            </tr>
          </thead>
          <tbody>
            {links.map((l, i) => (
              <tr key={i} className="border-b last:border-0">
                <td className="py-2">{l.fromPlaza}</td>
                <td>{l.toPlaza}</td>
                <td>{l.km} km</td>
                <td>{l.mins} min</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </main>
  );
}