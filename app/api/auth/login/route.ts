import { pool } from "@/lib/mysql";
import bcrypt from "bcryptjs";
import { SignJWT } from "jose";
import { cookies } from "next/headers";

export async function POST(req: Request) {
  const { username, password } = await req.json();
  if (!username || !password)
    return Response.json({ error: "Missing credentials" }, { status: 400 });

  const [rows]: any = await pool.query(
    "SELECT User_ID, Username, Password_Hash, Role FROM appuser WHERE Username = ?",
    [username]
  );
  const u = rows[0];
  if (!u || !(await bcrypt.compare(password, u.Password_Hash)))
    return Response.json({ error: "Invalid username or password" }, { status: 401 });

  const token = await new SignJWT({ id: u.User_ID, username: u.Username, role: u.Role })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("8h")
    .sign(new TextEncoder().encode(process.env.JWT_SECRET));

  (await cookies()).set("token", token, {
    httpOnly: true,
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 8,
  });
  return Response.json({ role: u.Role });
}