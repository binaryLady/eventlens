import { NextRequest, NextResponse } from "next/server";
import { config } from "@/lib/config";
import { createServerClient } from "@/lib/supabase";
import { analyzeEventPhoto } from "@/lib/gemini";

export const maxDuration = 60;

const DEFAULT_BATCH_SIZE = 5;
const STALE_PROCESSING_MINUTES = 5;

/**
 * POST /api/admin/index
 * Process pending photos: download from Drive, analyze with Gemini, store in Supabase.
 * Processes up to BATCH_SIZE photos per invocation (default 5).
 *
 * Body (optional): { batchSize?: number, retryErrors?: boolean, continue?: boolean }
 * Protected by ADMIN_API_SECRET bearer token.
 *
 * GET /api/admin/index
 * Same endpoint for Vercel Cron invocations.
 * Protected by x-vercel-cron-secret or ADMIN_API_SECRET.
 */
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
  } catch {
    // Use defaults
  }

  return processBatch(batchSize, retryErrors, shouldContinue);
}

export async function GET(request: NextRequest) {
  // Vercel Cron sends this header automatically
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
    return NextResponse.json(
      { error: "Missing GOOGLE_API_KEY" },
      { status: 500 },
    );
  }

  try {
    const supabase = createServerClient();

    // Reset stale "processing" rows (worker likely timed out)
    await supabase
      .from("photos")
      .update({ status: "pending" })
      .eq("status", "processing")
      .lt(
        "created_at",
        new Date(
          Date.now() - STALE_PROCESSING_MINUTES * 60 * 1000,
        ).toISOString(),
      );

    // Check if another worker is active
    const { count: activeCount } = await supabase
      .from("photos")
      .select("*", { count: "exact", head: true })
      .eq("status", "processing");

    if (activeCount && activeCount > 0) {
      return NextResponse.json({
        message: "Another indexing worker is active",
        processed: 0,
        remaining: 0,
      });
    }

    // Fetch pending photos
    const statusFilter = retryErrors
      ? ["pending", "error"]
      : ["pending"];

    const { data: pending, error: fetchError } = await supabase
      .from("photos")
      .select("*")
      .in("status", statusFilter)
      .order("created_at", { ascending: true })
      .limit(batchSize);

    if (fetchError) {
      throw new Error(`Failed to fetch pending photos: ${fetchError.message}`);
    }

    if (!pending || pending.length === 0) {
      return NextResponse.json({
        message: "No pending photos to process",
        processed: 0,
        remaining: 0,
      });
    }

    // Mark batch as processing
    const batchIds = pending.map((p) => p.id);
    await supabase
      .from("photos")
      .update({ status: "processing" })
      .in("id", batchIds);

    const processed: string[] = [];
    const errors: Array<{ filename: string; error: string }> = [];

    for (const photo of pending) {
      try {
        // Download image from Drive
        const image = await fetchDriveImage(photo.drive_file_id, googleApiKey);
        if (!image) {
          throw new Error("Failed to download image from Drive");
        }

        // Analyze with Gemini
        const analysis = await analyzeEventPhoto(image.base64, image.mimeType);

        // Update row with results
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

        // Small delay between Gemini calls (rate limiting)
        if (pending.indexOf(photo) < pending.length - 1) {
          await new Promise((resolve) => setTimeout(resolve, 1000));
        }
      } catch (error) {
        const errorMsg =
          error instanceof Error ? error.message : "Unknown error";
        console.error(`Index error for ${photo.filename}:`, errorMsg);

        await supabase
          .from("photos")
          .update({
            status: "error",
            error_message: errorMsg,
          })
          .eq("id", photo.id);

        errors.push({ filename: photo.filename, error: errorMsg });
      }
    }

    // Count remaining
    const { count: remaining } = await supabase
      .from("photos")
      .select("*", { count: "exact", head: true })
      .in("status", ["pending"]);

    // Fire-and-forget continuation if requested
    if (shouldContinue && remaining && remaining > 0) {
      const baseUrl =
        process.env.VERCEL_URL
          ? `https://${process.env.VERCEL_URL}`
          : "http://localhost:3000";

      fetch(`${baseUrl}/api/admin/index`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.adminSecret}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ continue: true, batchSize }),
      }).catch(() => {}); // fire-and-forget
    }

    return NextResponse.json({
      processed: processed.length,
      errors,
      remaining: remaining || 0,
    });
  } catch (error) {
    console.error("Index error:", error);
    return NextResponse.json(
      {
        error:
          error instanceof Error ? error.message : "Failed to index photos",
      },
      { status: 500 },
    );
  }
}

// ── Helpers ──────────────────────────────────────────────────────────────

function verifyAuth(request: NextRequest): boolean {
  const { adminSecret } = config;
  if (!adminSecret) return false;

  const auth = request.headers.get("authorization");
  if (!auth) return false;

  const token = auth.replace(/^Bearer\s+/i, "");
  return token === adminSecret;
}

async function fetchDriveImage(
  fileId: string,
  apiKey: string,
): Promise<{ base64: string; mimeType: string } | null> {
  try {
    // Try the Google thumbnail CDN first (faster, handles format conversion)
    const thumbUrl = `https://lh3.googleusercontent.com/d/${fileId}=w1200`;
    const thumbRes = await fetch(thumbUrl);

    if (thumbRes.ok) {
      const contentType = thumbRes.headers.get("content-type") || "";
      if (contentType.startsWith("image/")) {
        const buffer = await thumbRes.arrayBuffer();
        return {
          base64: Buffer.from(buffer).toString("base64"),
          mimeType: contentType,
        };
      }
    }

    // Fallback: Drive API direct download
    const url = `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${apiKey}`;
    const res = await fetch(url);
    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) return null;

    const buffer = await res.arrayBuffer();
    return {
      base64: Buffer.from(buffer).toString("base64"),
      mimeType: contentType,
    };
  } catch {
    return null;
  }
}
