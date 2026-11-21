import { NextRequest, NextResponse } from "next/server";

// No session cookie -> no dashboard. Login is NFC-tap only (no username/password anywhere).
export function middleware(req: NextRequest) {
  if (!req.cookies.get("vk_session")) {
    return NextResponse.redirect(new URL("/", req.url));
  }
  return NextResponse.next();
}
export const config = { matcher: ["/shop/:path*"] };