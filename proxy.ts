import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

export async function proxy(req: NextRequest) {
  const token = req.cookies.get("token")?.value;
  try {
    const { payload } = await jwtVerify(
      token ?? "",
      new TextEncoder().encode(process.env.JWT_SECRET)
    );
    // Admin-only pages
    if (req.nextUrl.pathname.startsWith("/admin") && payload.role !== "Admin")
      return NextResponse.redirect(new URL("/dashboard", req.url));
    return NextResponse.next();
  } catch {
    return NextResponse.redirect(new URL("/login", req.url));
  }
}

export const config = {
  matcher: [
    "/dashboard/:path*",
    "/transactions/:path*",
    "/tags/:path*",
    "/vehicles/:path*",
    "/anomalies/:path*",
    "/admin/:path*",
  ],
};