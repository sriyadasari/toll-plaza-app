import { pool } from "@/lib/mysql";
import { getSession } from "@/lib/auth";

async function q(sql: string) {
  const [rows] = await pool.query(sql);
  return rows as any[];
}

export async function GET() {
  const session = await getSession();
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const [kpi, lowTags, byPlaza, byStatus, byDay, byClass, recent] = await Promise.all([
      q(`SELECT COUNT(*) AS total,
                COALESCE(SUM(Status='Success'),0) AS success,
                COALESCE(SUM(Status<>'Success'),0) AS failed,
                COALESCE(SUM(CASE WHEN Status='Success' THEN Amount END),0) AS revenue
         FROM \`transaction\``),
      q(`SELECT COUNT(*) AS c FROM rfid_tag WHERE Status='Active' AND Balance < 100`),
      q(`SELECT p.Plaza_Name AS name,
                COALESCE(SUM(CASE WHEN t.Status='Success' THEN t.Amount END),0) AS revenue,
                COUNT(t.Transaction_ID) AS txns
         FROM tollplaza p
         LEFT JOIN tolllane l ON l.Plaza_ID = p.Plaza_ID
         LEFT JOIN \`transaction\` t ON t.Lane_ID = l.Lane_ID
         GROUP BY p.Plaza_ID, p.Plaza_Name
         ORDER BY revenue DESC`),
      q(`SELECT Status AS name, COUNT(*) AS value FROM \`transaction\` GROUP BY Status`),
      q(`SELECT DATE_FORMAT(MIN(Timestamp), '%d %b') AS day, COUNT(*) AS txns
         FROM \`transaction\`
         GROUP BY DATE(Timestamp)
         ORDER BY MIN(Timestamp)`),
      q(`SELECT vc.Class_Name AS name, SUM(t.Amount) AS revenue
         FROM \`transaction\` t
         JOIN rfid_tag r ON r.Tag_ID = t.Tag_ID
         JOIN vehicle v ON v.Vehicle_ID = r.Vehicle_ID
         JOIN vehicleclass vc ON vc.Class_ID = v.Class_ID
         WHERE t.Status='Success'
         GROUP BY vc.Class_ID, vc.Class_Name
         HAVING SUM(t.Amount) > 0
         ORDER BY revenue DESC`),
      q(`SELECT t.Transaction_ID AS id, t.Timestamp AS ts, t.Amount AS amount, t.Status AS status,
                r.Tag_Number AS tag, v.Reg_Number AS reg, p.Plaza_Name AS plaza
         FROM \`transaction\` t
         JOIN rfid_tag r ON r.Tag_ID = t.Tag_ID
         JOIN vehicle v ON v.Vehicle_ID = r.Vehicle_ID
         JOIN tolllane l ON l.Lane_ID = t.Lane_ID
         JOIN tollplaza p ON p.Plaza_ID = l.Plaza_ID
         ORDER BY t.Timestamp DESC LIMIT 10`),
    ]);

    const k = kpi[0];
    return Response.json({
      user: { username: session.username, role: session.role },
      kpi: {
        total: Number(k.total),
        success: Number(k.success),
        failed: Number(k.failed),
        revenue: Number(k.revenue),
        lowBalanceTags: Number(lowTags[0].c),
      },
      byPlaza: byPlaza.map((r) => ({ ...r, revenue: Number(r.revenue), txns: Number(r.txns) })),
      byStatus: byStatus.map((r) => ({ ...r, value: Number(r.value) })),
      byDay: byDay.map((r) => ({ day: r.day, txns: Number(r.txns) })),
      byClass: byClass.map((r) => ({ ...r, revenue: Number(r.revenue) })),
      recent: recent.map((r) => ({ ...r, amount: Number(r.amount) })),
    });
  } catch (e: any) {
    return Response.json({ error: e.message }, { status: 500 });
  }
}