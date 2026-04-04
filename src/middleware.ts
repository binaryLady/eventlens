// @TheTechMargin 2026
// App retired - redirect all traffic to the retired notice page
import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Allow access to the login page (now retired notice) and static assets
  if (pathname === "/login" || pathname.startsWith("/_next") || pathname.startsWith("/favicon")) {
    const response = NextResponse.next();
    response.headers.set("Content-Security-Policy", "frame-ancestors 'self'");
    return response;
  }

  // Redirect all other routes to the retired notice
  return NextResponse.redirect(new URL("/login", request.url));
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
