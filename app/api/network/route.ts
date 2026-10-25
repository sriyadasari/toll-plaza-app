import { runCypher } from "@/lib/neo4j";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const links = await runCypher(`
      MATCH (a:Plaza)-[r:CONNECTED_TO]->(b:Plaza)
      RETURN a.name AS fromPlaza, b.name AS toPlaza,
             r.distanceKm AS km, r.avgTimeMin AS mins
      ORDER BY a.plazaId
    `);
    return Response.json({ links });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}