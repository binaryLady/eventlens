// @TheTechMargin 2026
import { NextRequest, NextResponse } from "next/server";
import { verifyAuth } from "@/lib/auth";
import { spawn } from "child_process";
import { existsSync } from "fs";
import path from "path";

export const maxDuration = 300;

const VALID_PHASES = [
  "scan",
  "describe",
  "embeddings",
  "face-embed",
  "phash",
  "full",
] as const;

type Phase = (typeof VALID_PHASES)[number];

function phaseToArgs(phase: Phase, options?: { retryErrors?: boolean; folder?: string }): string[] {
  const args = ["scripts/process_photos.py"];

  switch (phase) {
    case "scan":
      args.push("--only-scan");
      break;
    case "describe":
      args.push("--only-describe");
      break;
    case "embeddings":
      args.push("--only-embeddings");
      break;
    case "face-embed":
      args.push("--only-face-embed");
      break;
    case "phash":
      args.push("--only-phash");
      break;
    case "full":
      args.push("--skip-rename", "--skip-face-embed");
      break;
  }

  if (options?.retryErrors) args.push("--retry-errors");
  if (options?.folder) args.push("--folder", options.folder);
  args.push("--verbose");

  return args;
}

export async function POST(request: NextRequest) {
  if (!verifyAuth(request)) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  let body: { phase?: string; retryErrors?: boolean; folder?: string };
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

  const projectRoot = process.cwd();
  const venvPython = path.join(projectRoot, "scripts", ".venv", "bin", "python");

  if (!existsSync(venvPython)) {
    return NextResponse.json(
      {
        error: "Pipeline not available in this environment",
        hint: "The Python pipeline requires a local server with the venv set up. Run: python3 -m venv scripts/.venv && scripts/.venv/bin/pip install -r scripts/requirements.txt",
      },
      { status: 501 },
    );
  }

  const args = phaseToArgs(phase, { retryErrors: body.retryErrors, folder: body.folder });

  return new Promise<NextResponse>((resolve) => {
    const output: string[] = [];
    const errors: string[] = [];

    const proc = spawn(venvPython, args, {
      cwd: projectRoot,
      env: { ...process.env },
      timeout: 290_000,
    });

    proc.stdout.on("data", (data: Buffer) => {
      output.push(data.toString());
    });

    proc.stderr.on("data", (data: Buffer) => {
      errors.push(data.toString());
    });

    proc.on("close", (code) => {
      const stdout = output.join("");
      const stderr = errors.join("");

      if (code === 0) {
        resolve(
          NextResponse.json({
            success: true,
            phase,
            output: stdout.slice(-2000),
            warnings: stderr ? stderr.slice(-1000) : undefined,
          }),
        );
      } else {
        resolve(
          NextResponse.json(
            {
              error: `Pipeline ${phase} failed (exit code ${code})`,
              output: stdout.slice(-2000),
              stderr: stderr.slice(-1000),
            },
            { status: 500 },
          ),
        );
      }
    });

    proc.on("error", (err) => {
      resolve(
        NextResponse.json(
          {
            error: `Failed to start pipeline: ${err.message}`,
            hint: "Ensure Python venv is set up: python3 -m venv scripts/.venv && scripts/.venv/bin/pip install -r scripts/requirements.txt",
          },
          { status: 500 },
        ),
      );
    });
  });
}
