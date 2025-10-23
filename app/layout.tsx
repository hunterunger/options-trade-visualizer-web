import type { Metadata } from "next";
import { GeistSans } from "geist/font/sans";
import { GeistMono } from "geist/font/mono";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "Option Blueprint | Trade Visualizer",
  description:
    "Research-backed options strategy builder with payoff diagrams, Greeks, and real-time Yahoo Finance data.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${GeistSans.variable} ${GeistMono.variable} dark`}>
      <body className="font-sans antialiased">
        <header className="sticky top-0 z-20 w-full border-b border-border/40 bg-background/80 backdrop-blur supports-[backdrop-filter]:bg-background/60">
          <nav className="mx-auto flex max-w-6xl items-center justify-between px-6 py-3 sm:px-8">
            <div className="flex items-center gap-3">
              <Link href="/" className="text-sm font-semibold tracking-tight">
                Option Blueprint
              </Link>
              <span className="hidden text-muted-foreground sm:inline">|</span>
              <div className="hidden items-center gap-4 sm:flex">
                <Link href="/" className="text-sm text-muted-foreground hover:text-foreground">
                  Home
                </Link>
                <Link href="/crypto-stats" className="text-sm text-muted-foreground hover:text-foreground">
                  Crypto Stats
                </Link>
              </div>
            </div>
            <div className="flex items-center gap-3">
              {/* placeholder for future controls (theme, auth) */}
            </div>
          </nav>
        </header>
        {children}
      </body>
    </html>
  );
}
