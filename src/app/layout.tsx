import type { Metadata } from "next";
import "./globals.css";

const BASE_URL = "https://avivo.dev/delta-swing";

export const metadata: Metadata = {
  metadataBase: new URL(BASE_URL),
  title: "Delta Swing — Stock Pattern Finder",
  description:
    "Scans 2,300+ NYSE stocks daily for ZigZag swing patterns. Surfaces buy signals when a stock bounces off recent support. Powered by a Raspberry Pi.",
  keywords: [
    "stock scanner",
    "NYSE",
    "ZigZag pattern",
    "swing trading",
    "buy signal",
    "technical analysis",
    "stock screener",
  ],
  authors: [{ name: "Aviv Oron", url: "https://avivo.dev" }],
  creator: "Aviv Oron",
  openGraph: {
    type: "website",
    url: BASE_URL,
    title: "Delta Swing — Stock Pattern Finder",
    description:
      "Scans 2,300+ NYSE stocks daily for ZigZag swing patterns. Surfaces buy signals when a stock bounces off recent support.",
    siteName: "Delta Swing",
  },
  twitter: {
    card: "summary_large_image",
    title: "Delta Swing — Stock Pattern Finder",
    description:
      "Scans 2,300+ NYSE stocks daily for ZigZag swing patterns. Surfaces buy signals when a stock bounces off recent support.",
    creator: "@avivOron",
  },
  robots: {
    index: true,
    follow: true,
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className="min-h-screen bg-slate-950 text-slate-100 antialiased">
        {children}
      </body>
    </html>
  );
}
