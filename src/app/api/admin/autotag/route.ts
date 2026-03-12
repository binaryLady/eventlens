// @TheTechMargin 2026
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";

export async function GET(request: NextRequest) {
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServerClient();
    const { data, error } = await supabase
      .from("photos")
      .select("auto_tag")
      .eq("status", "completed")
      .neq("hidden", true)
      .not("auto_tag", "is", null);

    if (error) {
      return NextResponse.json(
        { error: `Query error: ${error.message}` },
        { status: 500 },
      );
    }

    const counts: Record<string, number> = {};
    for (const row of data || []) {
      const tag = row.auto_tag as string;
      counts[tag] = (counts[tag] || 0) + 1;
    }

    const distribution = Object.entries(counts)
      .map(([tag, count]) => ({ tag, count }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({
      distribution,
      totalTagged: distribution.reduce((sum, d) => sum + d.count, 0),
      uniqueTags: distribution.length,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to fetch auto-tag stats",
      },
      { status: 500 },
    );
  }
}
