import { runCypher } from "@/lib/neo4j";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const rows = await runCypher(`
      MATCH (v:Vehicle)-[a:PASSED]->(p1:Plaza), (v)-[b:PASSED]->(p2:Plaza)
      WHERE a.timestamp < b.timestamp AND p1 <> p2
        AND a.status = 'Success' AND b.status = 'Success'
        AND NOT EXISTS {
          MATCH (v)-[c:PASSED]->(:Plaza)
          WHERE c.status = 'Success'
            AND c.timestamp > a.timestamp AND c.timestamp < b.timestamp
        }
      MATCH path = (p1)-[:CONNECTED_TO*1..5]-(p2)
      WITH v, a, b, p1, p2,
           min(reduce(t = 0, r IN relationships(path) | t + r.avgTimeMin)) AS minTravelMin
      WITH v, a, b, p1, p2, minTravelMin,
           duration.inSeconds(a.timestamp, b.timestamp).seconds / 60.0 AS actualMin
      WHERE actualMin < minTravelMin
      RETURN v.regNumber AS vehicle,
             p1.name AS fromPlaza, p2.name AS toPlaza,
             toString(a.timestamp) AS fromTime, toString(b.timestamp) AS toTime,
             round(actualMin * 10) / 10.0 AS actualMin,
             minTravelMin
      ORDER BY b.timestamp DESC
    `);
    return Response.json({ anomalies: rows });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}