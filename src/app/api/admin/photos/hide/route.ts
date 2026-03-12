// @TheTechMargin 2026
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";

export async function POST(request: NextRequest) {
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { ids?: string[]; hidden?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const ids = body.ids;
  if (!ids || !Array.isArray(ids) || ids.length === 0) {
    return NextResponse.json(
      { error: "ids must be a non-empty array of photo IDs" },
      { status: 400 },
    );
  }

  const hidden = body.hidden !== false; // default to true

  try {
    const supabase = createServerClient();
    const { error } = await supabase
      .from("photos")
      .update({ hidden })
      .in("id", ids);

    if (error) {
      return NextResponse.json(
        { error: `Update failed: ${error.message}` },
        { status: 500 },
      );
    }

    return NextResponse.json({
      success: true,
      updated: ids.length,
      hidden,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to update photos",
      },
      { status: 500 },
    );
  }
}
