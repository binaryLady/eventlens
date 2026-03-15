// @TheTechMargin 2026
export default function Footer() {
  return (
    <footer className="w-full py-6 border-t border-[var(--el-primary-22)] bg-[rgba(26,26,26,0.5)]">
      <div className="mx-auto max-w-5xl px-4 flex items-center justify-center">
        <a
          href="https://www.thetechmargin.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-center hover:opacity-80 transition-opacity"
        >
          <span className="text-sm">
            <span className="text-gray-400">made with </span>
            <span className="text-red-500">❤️</span>
            <span className="text-gray-400"> by </span>
            <span className="text-white text-base rainbow-text" style={{ fontFamily: "var(--font-pacifico)" }}>thetechmargin</span>
          </span>
        </a>
      </div>
      <div className="mx-auto max-w-5xl px-4 flex flex-col md:flex-row items-center justify-center mt-2 gap-0.5 md:gap-0">
        <a
          href="https://mask.thetechmargin.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-[10px] md:text-xs text-gray-500 hover:text-gray-300 transition-colors"
        >
          mask.thetechmargin.com
        </a>
        <span className="text-[10px] md:text-xs text-gray-500">
          <span className="hidden md:inline">&nbsp;•&nbsp;</span>Questions/Ideas/Collaborations: <a href="mailto:sonia@thetechmargin.com" className="hover:text-gray-300 transition-colors">sonia@thetechmargin.com</a>
        </span>
      </div>
      <div className="mx-auto max-w-5xl px-4 flex items-center justify-center mt-3 group/pii relative">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="#ff00ff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-60 cursor-help">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="16" x2="12" y2="12" />
          <line x1="12" y1="8" x2="12.01" y2="8" />
        </svg>
        <span className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 whitespace-nowrap px-3 py-1.5 text-[10px] tracking-wider border border-[var(--el-accent)] bg-[var(--el-bg)] opacity-0 pointer-events-none group-hover/pii:opacity-100 transition-opacity" style={{ color: "var(--el-accent-cc)" }}>
          No PII is retained, photo face matching data is not persisted.
        </span>
      </div>
    </footer>
  );
}
