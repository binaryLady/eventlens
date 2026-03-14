// @TheTechMargin 2026
// Pipeline orchestrator: accepts phase, dispatches native TypeScript work.
// Replaces the previous child_process.spawn Python approach.

import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { phaseSync } from "@/lib/pipeline/phases/sync";
import { phaseScan } from "@/lib/pipeline/phases/scan";
import { phaseDescribe } from "@/lib/pipeline/phases/describe";
import { phaseEmbed } from "@/lib/pipeline/phases/embed";
import { phaseFaceEmbed } from "@/lib/pipeline/phases/face-embed";
import { phasePhash } from "@/lib/pipeline/phases/phash";
import type { PhaseResult } from "@/lib/pipeline/types";

export const maxDuration = 300;

const VALID_PHASES = [
  "sync",
  "scan",
  "describe",
  "embeddings",
  "face-embed",
  "phash",
  "full",
] as const;

type Phase = (typeof VALID_PHASES)[number];

function getEnvOrThrow(name: string): string {
  const val = process.env[name];
  if (!val) throw new Error(`Missing env var: ${name}`);
  return val;
}

async function runPhase(phase: Phase, retryErrors = false): Promise<PhaseResult> {
  const apiKey = getEnvOrThrow("GOOGLE_API_KEY");
  const driveFolderId = getEnvOrThrow("GOOGLE_DRIVE_FOLDER_ID");

  switch (phase) {
    case "sync":
      return phaseSync(apiKey, driveFolderId);

    case "scan":
      return phaseScan(apiKey, driveFolderId);

    case "describe": {
      const geminiKey = process.env.GEMINI_API_KEY || apiKey;
      return phaseDescribe(apiKey, geminiKey, retryErrors);
    }

    case "embeddings": {
      const geminiKey = process.env.GEMINI_API_KEY || apiKey;
      return phaseEmbed(geminiKey);
    }

    case "face-embed": {
      const faceApiUrl = getEnvOrThrow("FACE_API_URL");
      const faceApiSecret = process.env.FACE_API_SECRET || "";
      return phaseFaceEmbed(apiKey, faceApiUrl, faceApiSecret);
    }

    case "phash":
      return phasePhash(apiKey);

    case "full": {
      // Run phases in sequence, stopping at the first incomplete one
      const geminiKey = process.env.GEMINI_API_KEY || apiKey;
      const phases: Array<() => Promise<PhaseResult>> = [
        () => phaseSync(apiKey, driveFolderId),
        () => phaseScan(apiKey, driveFolderId),
        () => phaseDescribe(apiKey, geminiKey, retryErrors),
        () => phaseEmbed(geminiKey),
        () => phasePhash(apiKey),
      ];

      // Add face-embed if configured
      if (process.env.FACE_API_URL) {
        const faceUrl = process.env.FACE_API_URL;
        const faceApiSecret = process.env.FACE_API_SECRET || "";
        phases.push(() => phaseFaceEmbed(apiKey, faceUrl, faceApiSecret));
      }

      let lastResult: PhaseResult = {
        phase: "full",
        processed: 0,
        remaining: 0,
        done: true,
        errors: [],
      };

      for (const phaseFn of phases) {
        const result = await phaseFn();
        lastResult = {
          phase: result.phase,
          processed: lastResult.processed + result.processed,
          remaining: result.remaining,
          done: result.done,
          errors: [...lastResult.errors, ...result.errors],
        };

        // If this phase isn't done, stop here and let the client re-call
        if (!result.done) {
          lastResult.phase = `full (paused at ${result.phase})`;
          break;
        }
      }

      return lastResult;
    }

    default:
      throw new Error(`Unknown phase: ${phase}`);
  }
}

export async function POST(request: NextRequest) {
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { phase?: string; retryErrors?: boolean };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const phase = body.phase as Phase;
  if (!phase || !VALID_PHASES.includes(phase)) {
    return NextResponse.json(
      { error: `Invalid phase. Must be one of: ${VALID_PHASES.join(", ")}` },
      { status: 400 },
    );
  }

  try {
    const result = await runPhase(phase, body.retryErrors);
    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[pipeline] Phase ${phase} failed:`, message);
    return NextResponse.json(
      { error: `Pipeline ${phase} failed: ${message}` },
      { status: 500 },
    );
  }
}
