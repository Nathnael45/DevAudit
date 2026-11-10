import type { Metadata } from 'next';
import { IBM_Plex_Sans, JetBrains_Mono } from 'next/font/google';
import Link from 'next/link';
import AuthNav from '@/components/AuthNav';
import './globals.css';

// Plex Sans for anything people read; JetBrains Mono for code, paths, repo names and the agent log.
const sans = IBM_Plex_Sans({ subsets: ['latin'], weight: ['400', '500', '600', '700'], variable: '--font-sans' });
const mono = JetBrains_Mono({ subsets: ['latin'], weight: ['400', '500', '700'], variable: '--font-mono' });

export const metadata: Metadata = {
  title: 'DevAudit — AI Security Auditor',
  description: 'Autonomous AI-powered security audits for GitHub repositories',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sans.variable} ${mono.variable}`}>
      <body className="min-h-screen bg-terminal-bg text-terminal-text font-sans antialiased">
        <nav className="border-b border-terminal-border px-4 sm:px-6 py-4 flex items-center justify-between gap-4 whitespace-nowrap">
          <div className="flex items-center gap-4 sm:gap-6">
            <Link href="/" className="flex items-center gap-2">
              <span className="text-terminal-green font-mono font-bold text-lg tracking-tight">DevAudit</span>
            </Link>
            <Link href="/audits" className="text-terminal-muted text-sm hover:text-terminal-text transition-colors">
              Audits
            </Link>
          </div>
          <div className="flex items-center gap-6">
            <AuthNav />
            <div className="hidden sm:flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-terminal-green animate-pulse" />
              <span className="text-terminal-muted text-xs">live</span>
            </div>
          </div>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
