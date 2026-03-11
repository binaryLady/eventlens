// @TheTechMargin 2026
import { NextResponse } from "next/server";
import { getMatchStats } from "@/lib/supabase";

export const revalidate = 60;

export async function GET() {
  try {
    const stats = await getMatchStats();
    return NextResponse.json(stats);
  } catch {
    return NextResponse.json(
      { recentActivity: [], hotPhotoIds: [], operativesCount: 0, totalSessions: 0 },
    );
  }
}
