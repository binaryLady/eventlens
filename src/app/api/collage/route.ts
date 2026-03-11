// @TheTechMargin 2026
import { NextRequest, NextResponse } from "next/server";
import sharp from "sharp";
import { config } from "@/lib/config";
import { pickHeroImage } from "@/lib/gemini";

export const maxDuration = 60;

interface FileEntry {
  fileId: string;
  filename?: string;
}

interface GridCell {
  x: number;
  y: number;
  w: number;
  h: number;
}

const GAP = 4;

function calculateGrid(
  count: number,
  canvasWidth: number,
  heroIndex?: number,
): { cols: number; rows: number; canvasHeight: number; positions: GridCell[] } {
  let cols: number;
  let rows: number;

  if (count === 1) {
    cols = 1;
    rows = 1;
  } else if (count === 2) {
    cols = 2;
    rows = 1;
  } else if (count === 3) {
    cols = 2;
    rows = 2;
  } else if (count === 4) {
    cols = 2;
    rows = 2;
  } else if (count <= 6) {
    cols = 3;
    rows = 2;
  } else if (count <= 9) {
    cols = 3;
    rows = 3;
  } else if (count <= 12) {
    cols = 4;
    rows = 3;
  } else if (count <= 16) {
    cols = 4;
    rows = 4;
  } else {
    cols = 5;
    rows = 4;
  }

  const cellWidth = Math.floor((canvasWidth - GAP * (cols - 1)) / cols);
  const cellHeight = cellWidth; // square cells
  const canvasHeight = rows * cellHeight + GAP * (rows - 1);

  // If hero mode and we have room for a 2x2 hero cell
  if (heroIndex !== undefined && count > 4 && cols >= 3 && rows >= 2) {
    const positions: GridCell[] = [];
    const heroW = cellWidth * 2 + GAP;
    const heroH = cellHeight * 2 + GAP;
    positions.push({ x: 0, y: 0, w: heroW, h: heroH });

    // Fill remaining cells around the hero
    let placed = 1;
    for (let r = 0; r < rows && placed < count; r++) {
      for (let c = 0; c < cols && placed < count; c++) {
        const x = c * (cellWidth + GAP);
        const y = r * (cellHeight + GAP);
        // Skip cells occupied by the hero (top-left 2x2)
        if (r < 2 && c < 2) continue;
        positions.push({ x, y, w: cellWidth, h: cellHeight });
        placed++;
      }
    }

    // If we couldn't place all images, add extra rows
    while (placed < count) {
      const extraRow = rows + Math.floor((placed - positions.length + 1) / cols);
      for (let c = 0; c < cols && placed < count; c++) {
        positions.push({
          x: c * (cellWidth + GAP),
          y: extraRow * (cellHeight + GAP),
          w: cellWidth,
          h: cellHeight,
        });
        placed++;
      }
    }

    const maxY = Math.max(...positions.map((p) => p.y + p.h));
    return { cols, rows, canvasHeight: maxY, positions };
  }

  // Standard grid layout
  const positions: GridCell[] = [];

  if (count === 3) {
    // Special: 1 top full-width + 2 bottom
    const topWidth = canvasWidth;
    positions.push({ x: 0, y: 0, w: topWidth, h: cellHeight });
    for (let c = 0; c < 2; c++) {
      positions.push({
        x: c * (cellWidth + GAP),
        y: cellHeight + GAP,
        w: cellWidth,
        h: cellHeight,
      });
    }
    return { cols: 2, rows: 2, canvasHeight: cellHeight * 2 + GAP, positions };
  }

  for (let i = 0; i < count; i++) {
    const r = Math.floor(i / cols);
    const c = i % cols;
    positions.push({
      x: c * (cellWidth + GAP),
      y: r * (cellHeight + GAP),
      w: cellWidth,
      h: cellHeight,
    });
  }

  const usedRows = Math.ceil(count / cols);
  const actualHeight = usedRows * cellHeight + GAP * (usedRows - 1);

  return { cols, rows: usedRows, canvasHeight: actualHeight, positions };
}

async function fetchImage(fileId: string): Promise<Buffer | null> {
  try {
    const VALID_FILE_ID = /^[a-zA-Z0-9_-]+$/;
    if (!VALID_FILE_ID.test(fileId)) return null;

    const url = config.googleApiKey
      ? `https://www.googleapis.com/drive/v3/files/${fileId}?alt=media&key=${config.googleApiKey}`
      : `https://lh3.googleusercontent.com/d/${fileId}=w1600`;

    const res = await fetch(url);
    if (!res.ok) return null;

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.startsWith("image/")) return null;

    const arrayBuffer = await res.arrayBuffer();
    return Buffer.from(arrayBuffer);
  } catch {
    return null;
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const {
      files,
      width = 2400,
      format = "jpeg",
      heroIndex,
      hero = false,
    } = body as {
      files: FileEntry[];
      width?: number;
      format?: "jpeg" | "png";
      heroIndex?: number;
      hero?: boolean;
    };

    if (!Array.isArray(files) || files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    if (files.length > 20) {
      return NextResponse.json(
        { error: "Maximum 20 photos per collage" },
        { status: 400 },
      );
    }

    const canvasWidth = Math.min(Math.max(width, 800), 4000);

    // Fetch all images concurrently in batches of 10
    const CONCURRENCY = 10;
    const imageBuffers: (Buffer | null)[] = [];

    for (let i = 0; i < files.length; i += CONCURRENCY) {
      const batch = files.slice(i, i + CONCURRENCY);
      const results = await Promise.all(
        batch.map((entry) => fetchImage(entry.fileId)),
      );
      imageBuffers.push(...results);
    }

    // Filter out failed fetches, keeping track of valid indices
    const validImages: { buffer: Buffer; originalIndex: number }[] = [];
    for (let i = 0; i < imageBuffers.length; i++) {
      if (imageBuffers[i]) {
        validImages.push({ buffer: imageBuffers[i]!, originalIndex: i });
      }
    }

    if (validImages.length === 0) {
      return NextResponse.json(
        { error: "Failed to fetch any images" },
        { status: 500 },
      );
    }

    // Determine hero image
    let mappedHeroIndex: number | undefined;
    let resolvedHeroIndex = heroIndex;

    // Use Gemini to pick hero if requested and >4 images
    if (hero && resolvedHeroIndex === undefined && validImages.length > 4 && config.geminiApiKey) {
      try {
        const thumbnails = await Promise.all(
          validImages.map(async ({ buffer }) => {
            const thumb = await sharp(buffer)
              .resize(256, 256, { fit: "cover" })
              .jpeg({ quality: 60 })
              .toBuffer();
            return { base64: thumb.toString("base64"), mimeType: "image/jpeg" };
          }),
        );
        resolvedHeroIndex = await pickHeroImage(thumbnails);
      } catch {
        // Gemini failed — skip hero mode silently
      }
    }

    if (resolvedHeroIndex !== undefined && validImages.length > 4) {
      const idx = Math.min(resolvedHeroIndex, validImages.length - 1);
      // Move hero image to position 0
      const [heroImg] = validImages.splice(idx, 1);
      validImages.unshift(heroImg);
      mappedHeroIndex = 0;
    }

    const grid = calculateGrid(
      validImages.length,
      canvasWidth,
      mappedHeroIndex,
    );

    // Resize each image to fit its grid cell
    const compositeInputs = await Promise.all(
      validImages.map(async ({ buffer }, i) => {
        const pos = grid.positions[i];
        const resized = await sharp(buffer)
          .resize(pos.w, pos.h, { fit: "cover", position: "centre" })
          .toBuffer();
        return { input: resized, left: pos.x, top: pos.y };
      }),
    );

    // Create canvas and composite
    const canvas = sharp({
      create: {
        width: canvasWidth,
        height: grid.canvasHeight,
        channels: 4,
        background: { r: 26, g: 26, b: 26, alpha: 1 }, // --el-bg #1a1a1a
      },
    });

    let output: Buffer;
    if (format === "png") {
      output = await canvas.composite(compositeInputs).png().toBuffer();
    } else {
      output = await canvas
        .composite(compositeInputs)
        .jpeg({ quality: 90 })
        .toBuffer();
    }

    const ext = format === "png" ? "png" : "jpg";
    const mimeType = format === "png" ? "image/png" : "image/jpeg";

    return new NextResponse(new Uint8Array(output), {
      status: 200,
      headers: {
        "Content-Type": mimeType,
        "Content-Disposition": `attachment; filename="eventlens-collage.${ext}"`,
        "Content-Length": String(output.length),
      },
    });
  } catch (err) {
    console.error("Collage generation error:", err);
    return NextResponse.json(
      { error: "Failed to create collage" },
      { status: 500 },
    );
  }
}
