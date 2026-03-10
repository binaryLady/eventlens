// @TheTechMargin 2026
export default function Footer() {
  return (
    <footer className="w-full py-6 border-t border-[var(--el-green-22)] bg-[rgba(26,26,26,0.5)]">
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
      <div className="mx-auto max-w-5xl px-4 flex items-center justify-center mt-2">
        <div className="text-center">
          <a
            href="https://mask.thetechmargin.com"
            target="_blank"
            rel="noopener noreferrer"
            className="text-xs text-gray-500 hover:text-gray-300 transition-colors"
          >
            mask.thetechmargin.com
          </a>
          <br />
          <span className="text-xs text-gray-500">
            • Questions/Ideas/Collaborations: <a href="mailto:sonia@thetechmargin.com" className="hover:text-gray-300">sonia@thetechmargin.com</a>
          </span>
        </div>
      </div>
