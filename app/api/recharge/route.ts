import { jwtVerify } from "jose";
import { cookies } from "next/headers";

export type Session = { id: number; username: string; role: "Admin" | "Staff" };

export async function getSession(): Promise<Session | null> {
  const token = (await cookies()).get("token")?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(
      token,
      new TextEncoder().encode(process.env.JWT_SECRET)
    );
    return payload as unknown as Session;
  } catch {
    return null;
  }
}

// Returns an error Response if the caller is not a logged-in Admin, otherwise null
export async function adminGuard(): Promise<Response | null> {
  const s = await getSession();
  if (!s) return Response.json({ error: "Unauthorized" }, { status: 401 });
  if (s.role !== "Admin")
    return Response.json({ error: "Admins only" }, { status: 403 });
  return null;
}