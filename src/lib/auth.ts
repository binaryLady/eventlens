// @TheTechMargin 2026
import { NextRequest } from "next/server";
import { config } from "./config";

export function verifyAuth(request: NextRequest): boolean {
  const { adminSecret } = config;
  if (!adminSecret) return false;
  const auth = request.headers.get("authorization");
  if (!auth) return false;
  return auth.replace(/^Bearer\s+/i, "") === adminSecret;
}
