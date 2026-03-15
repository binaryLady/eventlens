// @TheTechMargin 2026
"use client";

import { useEffect, useState, useMemo } from "react";

export default function TerminalLoader() {
  const [lines, setLines] = useState<string[]>([]);
  const [showCursor, setShowCursor] = useState(true);

  const bootSequence = useMemo(
    () => [
      "> INITIALIZING EVENTLENS v2.0 ...",
      "> CONNECTING TO PHOTO DATABASE ...",
      "> LOADING DRIVE ASSETS ...",
      "> INDEXING VISUAL DATA ...",
      "> ACTIVATING FACE RECOGNITION MODULE ...",
      "> RENDERING GRID INTERFACE ...",
    ],
    [],
  );

  useEffect(() => {
    let i = 0;
    const interval = setInterval(() => {
      if (i < bootSequence.length) {
        setLines((prev) => [...prev, bootSequence[i]]);
        i++;
      } else {
        clearInterval(interval);
      }
    }, 350);
    return () => clearInterval(interval);
  }, [bootSequence]);

  useEffect(() => {
    const blink = setInterval(() => setShowCursor((c) => !c), 530);
    return () => clearInterval(blink);
  }, []);

  return (
    <div className="min-h-screen bg-[var(--el-bg)] grid-bg flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="border border-[var(--el-primary-d9)] bg-[rgba(26,26,26,0.8)] p-6">
          <div className="flex items-center gap-2 border-b border-[var(--el-primary-99)] pb-3 mb-4">
            <div className="h-2 w-2 rounded-full bg-[var(--el-primary)]" />
            <div className="h-2 w-2 rounded-full bg-[var(--el-primary-d9)]" />
            <div className="h-2 w-2 rounded-full bg-[var(--el-primary-d9)]" />
            <span className="ml-2 text-[10px] uppercase tracking-widest text-[var(--el-primary-d9)]">
              eventlens://boot
            </span>
          </div>

          <div className="font-mono text-sm space-y-1">
            {lines.map((line, i) => (
              <div
                key={i}
                className="animate-boot-line text-[var(--el-primary)] opacity-0"
                style={{ '--delay': `${i * 0.1}s` } as React.CSSProperties}
              >
                {line}
                {i < 2 && (
                  <span className="ml-2 text-[var(--el-primary-d9)]">[OK]</span>
                )}
              </div>
            ))}
            {showCursor && (
              <span className="inline-block w-2 h-4 bg-[var(--el-primary)] ml-1" />
            )}
          </div>

          <div className="mt-6 h-1 w-full overflow-hidden bg-[var(--el-primary-11)]">
            <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-[var(--el-primary)] to-transparent animate-[skeleton-scan_1.5s_linear_infinite]" />
          </div>
        </div>

        <div className="mt-4 flex items-center justify-center gap-2 text-[10px] text-[var(--el-primary-99)] uppercase tracking-widest">
          <span>&#x2500;&#x2500;&#x253c;&#x2500;&#x2500;</span>
          <span>LOADING</span>
          <span>&#x2500;&#x2500;&#x253c;&#x2500;&#x2500;</span>
        </div>
      </div>
    </div>
  );
}
