import type { Metadata } from "next";
import Link from "next/link";
import { Archivo, Public_Sans, JetBrains_Mono } from "next/font/google";
import "./globals.css";

const sans = Public_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });
// Drafting lettering for headings, labels and the nav strip.
const draft = Archivo({ subsets: ["latin"], axes: ["wdth"], variable: "--font-draft", display: "swap" });

export const metadata: Metadata = {
  title: "OAuth Ready",
  description: "How long until your users can connect? Evidence-labelled OAuth app setup and approval guides.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable} ${draft.variable}`}>
      <body>
        <header className="top">
          <div className="wrap">
            <Link href="/" className="brand"><span className="brand-mark" aria-hidden />OAuth Ready</Link>
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
