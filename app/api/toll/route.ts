import { pool } from "@/lib/mysql";
import { runCypher } from "@/lib/neo4j";
import { getSession } from "@/lib/auth";

// Lists tags, lanes and toll rates for the toll page
export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  try {
    const [tags]: any = await pool.query(
      `SELECT t.Tag_Number AS tag, v.Reg_Number AS reg, o.Name AS owner,
              c.Class_Name AS class, c.Toll_Rate AS rate, t.Balance AS balance, t.Status AS status
       FROM rfid_tag t
       JOIN vehicle v ON v.Vehicle_ID = t.Vehicle_ID
       JOIN owner o ON o.Owner_ID = v.Owner_ID
       JOIN vehicleclass c ON c.Class_ID = v.Class_ID
       ORDER BY t.Tag_ID`
    );
    const [lanes]: any = await pool.query(
      `SELECT l.Lane_ID AS id, l.Lane_No AS laneNo, l.Lane_Type AS type, p.Plaza_Name AS plaza
       FROM tolllane l JOIN tollplaza p ON p.Plaza_ID = l.Plaza_ID
       ORDER BY p.Plaza_ID, l.Lane_No`
    );
    const [classes]: any = await pool.query(
      "SELECT Class_Name AS name, Toll_Rate AS rate FROM vehicleclass ORDER BY Class_ID"
    );
    return Response.json({
      tags: tags.map((t: any) => ({ ...t, balance: Number(t.balance), rate: Number(t.rate) })),
      lanes,
      classes: classes.map((c: any) => ({ ...c, rate: Number(c.rate) })),
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}

// Processes a toll through the stored procedure
export async function POST(req: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const { tag, lane } = await req.json();
  const laneId = Number(lane);
  if (!tag || !Number.isInteger(laneId))
    return Response.json({ error: "Tag and lane are required" }, { status: 400 });

  const conn = await pool.getConnection();
  let result = "Error";
  try {
    // The OUT parameter lives on one connection, so both statements use the same one
    await conn.query("CALL process_toll(?, ?, @r)", [tag, laneId]);
    const [r]: any = await conn.query("SELECT @r AS result");
    result = r[0].result;
  } catch (e: any) {
    return Response.json({ error: e.sqlMessage || e.message }, { status: 500 });
  } finally {
    conn.release();
  }

  // Sync the event to Neo4j (best effort, MySQL remains the source of truth)
  let synced = false;
  if (result !== "Tag_Not_Found" && result !== "Error") {
    try {
      const [rows]: any = await pool.query(
        `SELECT t.Transaction_ID AS txnId, t.Amount AS amount, t.Status AS status,
                v.Vehicle_ID AS vehicleId, v.Reg_Number AS reg, v.Vehicle_Type AS vtype,
                l.Plaza_ID AS plazaId, l.Lane_No AS laneNo
         FROM \`transaction\` t
         JOIN rfid_tag r ON r.Tag_ID = t.Tag_ID
         JOIN vehicle v ON v.Vehicle_ID = r.Vehicle_ID
         JOIN tolllane l ON l.Lane_ID = t.Lane_ID
         WHERE r.Tag_Number = ?
         ORDER BY t.Transaction_ID DESC LIMIT 1`,
        [tag]
      );
      const x = rows[0];
      if (x) {
        await runCypher(
          `MERGE (v:Vehicle {regNumber: $reg})
             ON CREATE SET v.vehicleId = $vehicleId, v.vehicleType = $vtype
           WITH v
           MATCH (p:Plaza {plazaId: $plazaId})
           MERGE (v)-[r:PASSED {txnId: $txnId}]->(p)
           SET r.timestamp = datetime(), r.amount = $amount,
               r.status = $status, r.lane = $laneNo`,
          {
            reg: x.reg, vehicleId: x.vehicleId, vtype: x.vtype,
            plazaId: x.plazaId, txnId: x.txnId,
            amount: Number(x.amount), status: x.status, laneNo: x.laneNo,
          }
        );
        synced = true;
      }
    } catch {
      synced = false;
    }
  }

  return Response.json({ result, synced });
}