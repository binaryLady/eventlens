// @TheTechMargin 2026
import { NextRequest, NextResponse } from "next/server";

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const publicPaths = ["/login", "/api/auth/login"];
  const isPublicPath = publicPaths.some((path) => pathname.startsWith(path));

  const authCookie = request.cookies.get("auth");
  const isAuthenticated = authCookie?.value === "true";

  if (!isAuthenticated && !isPublicPath) {
    return NextResponse.redirect(new URL("/login", request.url));
  }

  if (isAuthenticated && pathname === "/login") {
    return NextResponse.redirect(new URL("/", request.url));
  }

  const response = NextResponse.next();

  // CSP: allow Google Drive iframe embeds for video playback
  response.headers.set(
    "Content-Security-Policy",
    "frame-src https://drive.google.com https://*.google.com; frame-ancestors 'self'"
  );

  return response;
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico).*)",
  ],
};
