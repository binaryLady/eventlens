// @TheTechMargin 2026
import { NextResponse } from "next/server";

export async function POST() {
  const response = NextResponse.json({ success: true });
  response.cookies.delete("auth");
  return response;
}
