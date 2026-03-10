// @TheTechMargin 2026
import { NextRequest } from "next/server";
import { timingSafeEqual } from "crypto";
import { config } from "./config";

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  return timingSafeEqual(Buffer.from(a), Buffer.from(b));
}

export function verifyAuth(request: NextRequest): boolean {
  const { adminSecret } = config;
  if (!adminSecret) return false;
  const auth = request.headers.get("authorization");
  if (!auth) return false;
  return safeEqual(auth.replace(/^Bearer\s+/i, ""), adminSecret);
}
