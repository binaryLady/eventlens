import type { Metadata } from "next";
import { JetBrains_Mono, Space_Mono } from "next/font/google";
import "./globals.css";

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
  const primaryColor = process.env.NEXT_PUBLIC_PRIMARY_COLOR || "#00ff41";
  const accentColor = process.env.NEXT_PUBLIC_ACCENT_COLOR || "#00ff41";

  return (
    <html lang="en" className="dark">
      <head>
        <style
          dangerouslySetInnerHTML={{
            __html: `:root { --color-primary: ${primaryColor}; --color-accent: ${accentColor}; }`,
          }}
        />
      </head>
      <body
        className={`${jetbrainsMono.variable} ${spaceMono.variable} font-mono antialiased bg-black text-zinc-100 scan-lines`}
      >
        {children}
      </body>
    </html>
  );
}
