import type { Metadata } from "next";
import "./globals.css";

const BASE_URL = "https://avivo.dev/delta-swing";
const OG_IMAGE = "https://avivo.dev/delta-swing/opengraph-image";
const TITLE = "Delta Swing — Free US Stock Pattern Finder & Scanner";
const DESCRIPTION =
  "Scans 5,000+ NYSE & NASDAQ stocks daily for ZigZag swing patterns. Surfaces buy signals when a stock bounces off recent support. Free, updated every morning by a Raspberry Pi.";

export const metadata: Metadata = {
  metadataBase: new URL("https://avivo.dev"),
  title: TITLE,
  description: DESCRIPTION,
  keywords: [
    "stock scanner",
    "NYSE",
    "NASDAQ",
    "ZigZag pattern",
    "swing trading",
    "buy signal",
    "technical analysis",
    "stock screener",
    "free stock screener",
  ],
  authors: [{ name: "Aviv Oron", url: "https://avivo.dev" }],
  creator: "Aviv Oron",
  openGraph: {
    type: "website",
    url: BASE_URL,
    title: TITLE,
    description: DESCRIPTION,
    siteName: "Delta Swing",
    images: [{ url: OG_IMAGE, width: 1200, height: 630, alt: "Delta Swing — US Stock ZigZag Pattern Finder" }],
  },
  twitter: {
    card: "summary_large_image",
    title: TITLE,
    description: DESCRIPTION,
    images: [OG_IMAGE],
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
