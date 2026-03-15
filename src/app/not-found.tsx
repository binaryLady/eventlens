// @TheTechMargin 2026
import Link from "next/link";

export default function NotFound() {
  return (
    <div className="min-h-screen bg-[var(--el-bg)] grid-bg flex items-center justify-center p-4">
      <div className="w-full max-w-lg">
        <div className="border border-[var(--el-primary-d9)] bg-[rgba(26,26,26,0.8)] p-6">
          <div className="flex items-center gap-2 border-b border-[var(--el-primary-99)] pb-3 mb-4">
            <div className="h-2 w-2 rounded-full bg-[var(--el-red)]" />
            <div className="h-2 w-2 rounded-full bg-[var(--el-amber)]" />
            <div className="h-2 w-2 rounded-full bg-[var(--el-primary-d9)]" />
            <span className="ml-2 text-[10px] uppercase tracking-widest text-[var(--el-primary-d9)]">
              eventlens://error
            </span>
          </div>

          <div className="font-mono space-y-2">
            <div className="text-[var(--el-red)]">
              &gt; ERROR 404: ROUTE NOT FOUND
            </div>
            <div className="text-[var(--el-primary-d9)]">
              &gt; REQUESTED PATH DOES NOT EXIST IN SYSTEM
            </div>
            <div className="text-[var(--el-primary-d9)]">
              &gt; SCAN ABORTED — NO MATCHING ENDPOINT
            </div>

            <div className="pt-4 text-6xl font-bold text-[var(--el-primary)] glow-text text-center">
              404
            </div>

            <div className="pt-4 text-[var(--el-primary-77)] text-sm">
              &gt; RECOMMENDED ACTION: RETURN TO BASE
            </div>
          </div>

          <div className="mt-6 h-1 w-full overflow-hidden bg-[var(--el-primary-11)]">
            <div className="h-full w-1/3 bg-gradient-to-r from-transparent via-[var(--el-red)] to-transparent animate-[skeleton-scan_1.5s_linear_infinite]" />
          </div>
        </div>

        <div className="mt-6 flex justify-center">
          <Link
            href="/"
            className="inline-flex items-center gap-2 border border-[var(--el-primary-99)] bg-[rgba(26,26,26,0.6)] px-5 py-2.5 text-xs font-mono uppercase tracking-wider text-[var(--el-primary-99)] transition-all hover:border-[var(--el-accent)] hover:text-[var(--el-accent)] hover:shadow-[0_0_10px_var(--el-glow-accent-25)]"
          >
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <polyline points="15 18 9 12 15 6" />
            </svg>
            RETURN TO BASE
          </Link>
        </div>

        <div className="mt-4 flex items-center justify-center gap-2 text-[10px] text-[var(--el-primary-99)] uppercase tracking-widest">
          <span>&#x2500;&#x2500;&#x253c;&#x2500;&#x2500;</span>
          <span>END TRANSMISSION</span>
          <span>&#x2500;&#x2500;&#x253c;&#x2500;&#x2500;</span>
        </div>
      </div>
    </div>
  );
}
