import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Delta Swing — Stock Pattern Finder",
  description: "NYSE ZigZag swing pattern scanner powered by Raspberry Pi",
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
