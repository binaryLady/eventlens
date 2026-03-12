// @TheTechMargin 2026
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";

interface DuplicateRow {
  group_id: number;
  photo_id: string;
  drive_file_id: string;
  filename: string;
  folder: string;
  phash: number;
  hamming_distance: number;
  hidden: boolean;
}

interface DuplicateCluster {
  groupId: number;
  photos: Array<{
    id: string;
    driveFileId: string;
    filename: string;
    folder: string;
    phash: number;
    hammingDistance: number;
    hidden: boolean;
    thumbnailUrl: string;
  }>;
}

export async function GET(request: NextRequest) {
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const supabase = createServerClient();
    const threshold = parseInt(
      request.nextUrl.searchParams.get("threshold") || "10",
      10,
    );

    const { data, error } = await supabase.rpc("find_duplicate_clusters", {
      hamming_threshold: Math.min(Math.max(threshold, 0), 32),
    });

    if (error) {
      return NextResponse.json(
        { error: `RPC error: ${error.message}` },
        { status: 500 },
      );
    }

    const rows = (data as DuplicateRow[]) || [];

    // Group by group_id, deduplicate photo_ids within each group
    const groupMap = new Map<number, DuplicateCluster>();
    const seenPhotos = new Map<number, Set<string>>();

    for (const row of rows) {
      if (!groupMap.has(row.group_id)) {
        groupMap.set(row.group_id, { groupId: row.group_id, photos: [] });
        seenPhotos.set(row.group_id, new Set());
      }
      const seen = seenPhotos.get(row.group_id)!;
      if (!seen.has(row.photo_id)) {
        seen.add(row.photo_id);
        groupMap.get(row.group_id)!.photos.push({
          id: row.photo_id,
          driveFileId: row.drive_file_id,
          filename: row.filename,
          folder: row.folder,
          phash: row.phash,
          hammingDistance: row.hamming_distance,
          hidden: row.hidden,
          thumbnailUrl: `https://lh3.googleusercontent.com/d/${row.drive_file_id}=w250`,
        });
      }
    }

    const clusters = Array.from(groupMap.values());

    return NextResponse.json({
      clusters,
      totalClusters: clusters.length,
      totalDuplicates: clusters.reduce((sum, c) => sum + c.photos.length, 0),
      threshold,
    });
  } catch (error) {
    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Failed to find duplicates",
      },
      { status: 500 },
    );
  }
}
