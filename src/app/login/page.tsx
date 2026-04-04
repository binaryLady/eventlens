// @TheTechMargin 2026
import Link from "next/link";

export default function RetiredPage() {
  return (
    <div className="w-full min-h-screen bg-[var(--el-bg)] text-zinc-100 font-mono flex items-center justify-center p-4 scan-line-bg">
      <div className="w-full max-w-md">
        <div className="border border-[var(--el-primary-d9)] bg-[rgba(26,26,26,0.8)] p-6 backdrop-blur">
          <div className="flex items-center gap-2 border-b border-[var(--el-primary-99)] pb-3 mb-6">
            <div className="h-2 w-2 rounded-full bg-[var(--el-primary)]" />
            <div className="h-2 w-2 rounded-full bg-[var(--el-primary-d9)]" />
            <div className="h-2 w-2 rounded-full bg-[var(--el-primary-d9)]" />
            <span className="ml-2 text-[10px] uppercase tracking-widest text-[var(--el-primary-d9)]">
              eventlens://notice
            </span>
          </div>

          <div className="space-y-6">
            <div>
              <h1 className="text-lg font-bold text-[var(--el-primary)] uppercase tracking-wider mb-2">
                EVENT CONCLUDED
              </h1>
              <p className="text-sm text-zinc-300 leading-relaxed">
                The HardMode EventLens has concluded. Reach out to me for access to photos or with questions about the app.
              </p>
            </div>

            <div className="space-y-3 border-t border-[var(--el-primary-d9)] pt-4">
              <div>
                <span className="block text-[10px] uppercase tracking-wider text-[var(--el-primary-d9)] mb-1">
                  Website
                </span>
                <Link
                  href="https://www.thetechmargin.com"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-sm text-[var(--el-primary)] hover:text-[var(--el-accent)] transition-colors underline underline-offset-2"
                >
                  www.thetechmargin.com
                </Link>
              </div>
              <div>
                <span className="block text-[10px] uppercase tracking-wider text-[var(--el-primary-d9)] mb-1">
                  Email
                </span>
                <Link
                  href="mailto:sonia@thetechmargin.com"
                  className="text-sm text-[var(--el-primary)] hover:text-[var(--el-accent)] transition-colors underline underline-offset-2"
                >
                  sonia@thetechmargin.com
                </Link>
              </div>
            </div>

            <div className="text-center pt-2">
              <span className="text-[10px] uppercase tracking-widest text-[var(--el-primary-d9)]">
                Thank you for participating
              </span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
