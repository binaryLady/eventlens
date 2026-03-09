import type { Metadata } from "next";
import { Barlow_Condensed, DM_Sans } from "next/font/google";
import "./globals.css";

const barlowCondensed = Barlow_Condensed({
  subsets: ["latin"],
  weight: ["600", "700", "800"],
  variable: "--font-heading",
  display: "swap",
});

const dmSans = DM_Sans({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-body",
  display: "swap",
});

const eventName = process.env.NEXT_PUBLIC_EVENT_NAME || "Event Photos";

export const metadata: Metadata = {
  title: `${eventName} — Find Your Photos`,
  description: "Search through event photos by text, people, or scenes",
  openGraph: {
    title: `${eventName} — Find Your Photos`,
    description: "Search through event photos by text, people, or scenes",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const primaryColor = process.env.NEXT_PUBLIC_PRIMARY_COLOR || "#3b82f6";
  const accentColor = process.env.NEXT_PUBLIC_ACCENT_COLOR || "#f59e0b";

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
        className={`${barlowCondensed.variable} ${dmSans.variable} font-body antialiased bg-zinc-950 text-zinc-100`}
      >
        {children}
      </body>
    </html>
  );
}
