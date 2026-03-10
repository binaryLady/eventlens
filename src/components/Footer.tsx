// @TheTechMargin 2026
export default function Footer() {
  return (
    <footer className="w-full py-6 border-t border-[var(--el-green-22)] bg-[var(--el-bg)]/50">
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
            <span className="text-[var(--el-green)] font-semibold">thetechmargin</span>
          </span>
        </a>
      </div>
    </footer>
  );
}
