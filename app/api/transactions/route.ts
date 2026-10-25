import { pool } from "@/lib/mysql";
import { getSession } from "@/lib/auth";

const STATUSES = ["Success", "Failed", "Insufficient_Balance"];
const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(req: Request) {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  const sp = new URL(req.url).searchParams;
  const q = sp.get("q")?.trim();
  const plaza = Number(sp.get("plaza"));
  const status = sp.get("status") || "";
  const from = sp.get("from") || "";
  const to = sp.get("to") || "";

  const where: string[] = [];
  const params: any[] = [];
  if (q) {
    where.push("(v.Reg_Number LIKE ? OR r.Tag_Number LIKE ?)");
    params.push(`%${q}%`, `%${q}%`);
  }
  if (Number.isInteger(plaza) && plaza > 0) {
    where.push("p.Plaza_ID = ?");
    params.push(plaza);
  }
  if (STATUSES.includes(status)) {
    where.push("t.Status = ?");
    params.push(status);
  }
  if (DATE.test(from)) {
    where.push("t.Timestamp >= ?");
    params.push(`${from} 00:00:00`);
  }
  if (DATE.test(to)) {
    where.push("t.Timestamp < DATE_ADD(?, INTERVAL 1 DAY)");
    params.push(to);
  }
  const W = where.length ? "WHERE " + where.join(" AND ") : "";

  const FROM = `
    FROM \`transaction\` t
    JOIN rfid_tag r ON r.Tag_ID = t.Tag_ID
    JOIN vehicle v ON v.Vehicle_ID = r.Vehicle_ID
    JOIN tolllane l ON l.Lane_ID = t.Lane_ID
    JOIN tollplaza p ON p.Plaza_ID = l.Plaza_ID`;

  try {
    const [rows]: any = await pool.query(
      `SELECT t.Transaction_ID AS id, t.Timestamp AS ts, t.Amount AS amount, t.Status AS status,
              r.Tag_Number AS tag, v.Reg_Number AS reg, p.Plaza_Name AS plaza, l.Lane_No AS lane
       ${FROM} ${W}
       ORDER BY t.Timestamp DESC, t.Transaction_ID DESC LIMIT 200`,
      params
    );
    const [sum]: any = await pool.query(
      `SELECT COUNT(*) AS total,
              COALESCE(SUM(CASE WHEN t.Status='Success' THEN t.Amount END),0) AS revenue
       ${FROM} ${W}`,
      params
    );
    const [plazas]: any = await pool.query(
      "SELECT Plaza_ID AS id, Plaza_Name AS name FROM tollplaza ORDER BY Plaza_ID"
    );
    // Subquery + HAVING: vehicles whose total spend is above the average per tag
    const [top]: any = await pool.query(
      `SELECT v.Reg_Number AS reg, o.Name AS owner, SUM(t.Amount) AS spent, COUNT(*) AS trips
       FROM \`transaction\` t
       JOIN rfid_tag r ON r.Tag_ID = t.Tag_ID
       JOIN vehicle v ON v.Vehicle_ID = r.Vehicle_ID
       JOIN owner o ON o.Owner_ID = v.Owner_ID
       WHERE t.Status = 'Success'
       GROUP BY v.Vehicle_ID, v.Reg_Number, o.Name
       HAVING SUM(t.Amount) > (
         SELECT AVG(s.total) FROM (
           SELECT SUM(t2.Amount) AS total FROM \`transaction\` t2
           WHERE t2.Status = 'Success' GROUP BY t2.Tag_ID
         ) s
       )
       ORDER BY spent DESC`
    );

    return Response.json({
      rows: rows.map((r: any) => ({ ...r, amount: Number(r.amount) })),
      summary: { total: Number(sum[0].total), revenue: Number(sum[0].revenue) },
      plazas,
      topSpenders: top.map((r: any) => ({ ...r, spent: Number(r.spent), trips: Number(r.trips) })),
    });
  } catch (e: any) {
    return Response.json({ error: e.sqlMessage || e.message }, { status: 500 });
  }
}