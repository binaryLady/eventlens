// @TheTechMargin 2026
import type { Metadata } from "next";
import { JetBrains_Mono, Space_Mono, Pacifico } from "next/font/google";
import "./globals.css";
import Footer from "@/components/Footer";

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  variable: "--font-mono",
  display: "swap",
});

const spaceMono = Space_Mono({
  subsets: ["latin"],
  weight: ["400", "700"],
  variable: "--font-heading",
  display: "swap",
});

const pacifico = Pacifico({
  subsets: ["latin"],
  weight: ["400"],
  variable: "--font-pacifico",
  display: "swap",
});

const eventName = process.env.NEXT_PUBLIC_EVENT_NAME || "HARD MODE";

export const metadata: Metadata = {
  title: `${eventName} // PHOTO RECON`,
  description: "Visual reconnaissance system — find yourself in event photos",
  icons: {
    icon: "/favicon.svg",
  },
  openGraph: {
    title: `${eventName} // PHOTO RECON`,
    description: "Visual reconnaissance system — find yourself in event photos",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const hexColor = /^#[0-9A-Fa-f]{6}$/;
  const rawPrimary = process.env.NEXT_PUBLIC_PRIMARY_COLOR || "#00ff41";
  const rawAccent = process.env.NEXT_PUBLIC_ACCENT_COLOR || "#00ff41";
  const primaryColor = hexColor.test(rawPrimary) ? rawPrimary : "#00ff41";
  const accentColor = hexColor.test(rawAccent) ? rawAccent : "#00ff41";

  return (
    <html lang="en" className="dark">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
        <meta name="theme-color" content="#000000" />
        <meta name="mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
        <style
          dangerouslySetInnerHTML={{
            __html: `:root { --color-primary: ${primaryColor}; --color-accent: ${accentColor}; }`,
          }}
        />
      </head>
      <body
        className={`${jetbrainsMono.variable} ${spaceMono.variable} ${pacifico.variable} font-mono antialiased bg-[var(--el-bg)] text-zinc-100 scan-lines flex flex-col min-h-screen`}
      >
        <div className="flex-1">
          {children}
        </div>
        <Footer />
      </body>
    </html>
  );
}
