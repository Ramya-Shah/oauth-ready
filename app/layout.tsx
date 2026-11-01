import type { Metadata } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "OAuth Ready",
  description: "How long until your users can connect? Evidence-labelled OAuth app setup and approval guides.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>
        <header className="top">
          <div className="wrap">
            <Link href="/" className="brand"><span className="brand-mark">⚿</span>OAuth Ready</Link>
            <nav className="nav">
              <Link href="/">Library</Link>
              <Link href="/generate">Generate</Link>
              <Link href="/verification">Verification</Link>
              <Link href="/about">How it works</Link>
            </nav>
          </div>
        </header>
        <main className="wrap">{children}</main>
      </body>
    </html>
  );
}
