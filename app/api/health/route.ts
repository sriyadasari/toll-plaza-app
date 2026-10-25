import { pool } from "@/lib/mysql";
import { runCypher } from "@/lib/neo4j";

export async function GET() {
  const result: Record<string, unknown> = {};

  try {
    const [rows] = await pool.query("SHOW TABLES");
    result.mysql = { ok: true, tables: rows };
  } catch (e: any) {
    result.mysql = { ok: false, error: e.message };
  }

  try {
    const rows = await runCypher("MATCH (n) RETURN labels(n) AS label, count(*) AS total");
    result.neo4j = { ok: true, data: rows };
  } catch (e: any) {
    result.neo4j = { ok: false, error: e.message };
  }

  return Response.json(result);
}