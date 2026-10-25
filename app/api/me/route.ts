import { getSession } from "@/lib/auth";

export async function GET() {
  const s = await getSession();
  if (!s) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return Response.json({ username: s.username, role: s.role });
}