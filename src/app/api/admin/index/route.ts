// @TheTechMargin 2026
import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { verifyAuth } from "@/lib/auth";
import { createServerClient } from "@/lib/supabase";
import { analyzeEventPhoto } from "@/lib/gemini";
import { fetchDriveImage } from "@/lib/drive";

export const maxDuration = 60;

const DEFAULT_BATCH_SIZE = 5;
const STALE_PROCESSING_MINUTES = 5;

export async function POST(request: NextRequest) {
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let batchSize = DEFAULT_BATCH_SIZE;
  let retryErrors = false;
  let shouldContinue = false;

  try {
    const body = await request.json().catch(() => ({}));
    if (body.batchSize) batchSize = Math.min(body.batchSize, 10);
    if (body.retryErrors) retryErrors = true;
    if (body.continue) shouldContinue = true;
  } catch { /* defaults */ }

  return processBatch(batchSize, retryErrors, shouldContinue);
}

export async function GET(request: NextRequest) {
  const cronSecret = request.headers.get("x-vercel-cron-secret");
  const isVercelCron = cronSecret && cronSecret === process.env.CRON_SECRET;
  if (!isVercelCron && !verifyAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }
  return processBatch(DEFAULT_BATCH_SIZE, false, false);
}

async function processBatch(
  batchSize: number,
  retryErrors: boolean,
  shouldContinue: boolean,
) {
  const { googleApiKey } = config;
  if (!googleApiKey) {
    return NextResponse.json({ error: "Missing GOOGLE_API_KEY" }, { status: 500 });
  }

  try {
    const supabase = createServerClient();

    await supabase
      .from("photos")
      .update({ status: "pending" })
      .eq("status", "processing")
      .lt("created_at", new Date(Date.now() - STALE_PROCESSING_MINUTES * 60 * 1000).toISOString());

    const { count: activeCount } = await supabase
      .from("photos")
      .select("*", { count: "exact", head: true })
      .eq("status", "processing");

    if (activeCount && activeCount > 0) {
      return NextResponse.json({ message: "Another indexing worker is active", processed: 0, remaining: 0 });
    }

    const statusFilter = retryErrors ? ["pending", "error"] : ["pending"];
    const { data: pending, error: fetchError } = await supabase
      .from("photos")
      .select("*")
      .in("status", statusFilter)
      .order("created_at", { ascending: true })
      .limit(batchSize);

    if (fetchError) throw new Error(`Failed to fetch pending photos: ${fetchError.message}`);
    if (!pending || pending.length === 0) {
      return NextResponse.json({ message: "No pending photos to process", processed: 0, remaining: 0 });
    }

    const batchIds = pending.map((p) => p.id);
    await supabase.from("photos").update({ status: "processing" }).in("id", batchIds);

    const processed: string[] = [];
    const errors: Array<{ filename: string; error: string }> = [];

    for (const photo of pending) {
      try {
        const image = await fetchDriveImage(photo.drive_file_id, googleApiKey);
        if (!image) throw new Error("Failed to download image from Drive");

        const analysis = await analyzeEventPhoto(image.base64, image.mimeType);

        await supabase
          .from("photos")
          .update({
            visible_text: analysis.visible_text,
            people_descriptions: analysis.people_descriptions,
            scene_description: analysis.scene_description,
            face_count: analysis.face_count,
            status: "completed",
            processed_at: new Date().toISOString(),
            error_message: null,
          })
          .eq("id", photo.id);

        processed.push(photo.filename);

        if (pending.indexOf(photo) < pending.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      } catch (error) {
        const errorMsg = error instanceof Error ? error.message : "Unknown error";
        await supabase.from("photos").update({ status: "error", error_message: errorMsg }).eq("id", photo.id);
        errors.push({ filename: photo.filename, error: errorMsg });
      }
    }

    const { count: remaining } = await supabase
      .from("photos")
      .select("*", { count: "exact", head: true })
      .in("status", ["pending"]);

    if (shouldContinue && remaining && remaining > 0) {
      const baseUrl = process.env.VERCEL_URL
        ? `https://${process.env.VERCEL_URL}`
        : "http://localhost:3000";

      fetch(`${baseUrl}/api/admin/index`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.adminSecret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ continue: true, batchSize }),
      }).catch(() => {});
    }

    return NextResponse.json({ processed: processed.length, errors, remaining: remaining || 0 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Failed to index photos" },
      { status: 500 },
    );
  }
}
