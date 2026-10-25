import { pool } from "@/lib/mysql";
import { runCypher } from "@/lib/neo4j";
import { adminGuard } from "@/lib/auth";

const err = (e: any, status = 400) =>
  Response.json({ error: e.sqlMessage || e.message }, { status });

export async function GET() {
  const g = await adminGuard();
  if (g) return g;
  try {
    const [plazas]: any = await pool.query(
      `SELECT p.Plaza_ID AS id, p.Plaza_Name AS name, p.Location AS location,
              COUNT(l.Lane_ID) AS lanes
       FROM tollplaza p LEFT JOIN tolllane l ON l.Plaza_ID = p.Plaza_ID
       GROUP BY p.Plaza_ID, p.Plaza_Name, p.Location ORDER BY p.Plaza_ID`
    );
    const [lanes]: any = await pool.query(
      `SELECT l.Lane_ID AS id, l.Lane_No AS laneNo, l.Lane_Type AS type, p.Plaza_Name AS plaza
       FROM tolllane l JOIN tollplaza p ON p.Plaza_ID = l.Plaza_ID
       ORDER BY p.Plaza_ID, l.Lane_No`
    );
    const [classes]: any = await pool.query(
      "SELECT Class_ID AS id, Class_Name AS name, Toll_Rate AS rate FROM vehicleclass ORDER BY Class_ID"
    );
    return Response.json({
      plazas: plazas.map((p: any) => ({ ...p, lanes: Number(p.lanes) })),
      lanes,
      classes: classes.map((c: any) => ({ ...c, rate: Number(c.rate) })),
    });
  } catch (e: any) {
    return err(e, 500);
  }
}

// INSERT: add a plaza or a lane
export async function POST(req: Request) {
  const g = await adminGuard();
  if (g) return g;
  const b = await req.json();
  try {
    if (b.action === "addPlaza") {
      if (!b.name?.trim() || !b.location?.trim())
        return Response.json({ error: "Name and location are required" }, { status: 400 });
      const [res]: any = await pool.query(
        "INSERT INTO tollplaza (Plaza_Name, Location) VALUES (?, ?)",
        [b.name.trim(), b.location.trim()]
      );
      // Mirror the new plaza in the graph (best effort)
      try {
        await runCypher(
          "MERGE (p:Plaza {plazaId: $id}) SET p.name = $name, p.location = $loc",
          { id: res.insertId, name: b.name.trim(), loc: b.location.trim() }
        );
      } catch {}
      return Response.json({ ok: true });
    }
    if (b.action === "addLane") {
      await pool.query(
        "INSERT INTO tolllane (Lane_No, Lane_Type, Plaza_ID) VALUES (?, ?, ?)",
        [Number(b.laneNo), b.laneType, Number(b.plazaId)]
      );
      return Response.json({ ok: true });
    }
    return Response.json({ error: "Unknown action" }, { status: 400 });
  } catch (e: any) {
    return err(e);
  }
}

// UPDATE: change a toll rate
export async function PUT(req: Request) {
  const g = await adminGuard();
  if (g) return g;
  const b = await req.json();
  try {
    await pool.query("UPDATE vehicleclass SET Toll_Rate = ? WHERE Class_ID = ?", [
      Number(b.rate),
      Number(b.classId),
    ]);
    return Response.json({ ok: true });
  } catch (e: any) {
    return err(e);
  }
}

// DELETE: remove a plaza or lane, but only if it has no transaction history
export async function DELETE(req: Request) {
  const g = await adminGuard();
  if (g) return g;
  const sp = new URL(req.url).searchParams;
  const type = sp.get("type");
  const id = Number(sp.get("id"));
  if (!Number.isInteger(id)) return Response.json({ error: "Bad id" }, { status: 400 });

  try {
    if (type === "lane") {
      const [c]: any = await pool.query(
        "SELECT COUNT(*) AS n FROM `transaction` WHERE Lane_ID = ?", [id]);
      if (Number(c[0].n) > 0)
        return Response.json({ error: "Lane has transactions and cannot be deleted" }, { status: 409 });
      await pool.query("DELETE FROM tolllane WHERE Lane_ID = ?", [id]);
    } else if (type === "plaza") {
      const [c]: any = await pool.query(
        `SELECT COUNT(*) AS n FROM \`transaction\` t
         JOIN tolllane l ON l.Lane_ID = t.Lane_ID WHERE l.Plaza_ID = ?`, [id]);
      if (Number(c[0].n) > 0)
        return Response.json({ error: "Plaza has transactions and cannot be deleted" }, { status: 409 });
      await pool.query("DELETE FROM tollplaza WHERE Plaza_ID = ?", [id]);
    } else {
      return Response.json({ error: "Unknown type" }, { status: 400 });
    }
    return Response.json({ ok: true });
  } catch (e: any) {
    return err(e);
  }
}