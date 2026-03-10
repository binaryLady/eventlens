// @TheTechMargin 2026
export default function Footer() {
  return (
    <footer className="w-full py-6 border-t border-[#00ff4122] bg-black/50">
      <div className="mx-auto max-w-5xl px-4 flex items-center justify-center">
        <a
          href="https://www.thetechmargin.com"
          target="_blank"
          rel="noopener noreferrer"
          className="text-center hover:opacity-80 transition-opacity"
        >
          <div
            className="text-sm font-pacifico bg-gradient-to-r from-red-500 via-yellow-500 via-green-500 via-blue-500 to-purple-500 bg-clip-text text-transparent"
            style={{
              backgroundSize: "200% auto",
              animation: "gradient-shift 3s ease infinite",
            }}
          >
            made with ❤ by theTechMargin
          </div>
        </a>
      </div>
    </footer>
  );
}
