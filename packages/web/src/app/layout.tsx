import type { Metadata } from 'next';
import Link from 'next/link';
import './globals.css';

export const metadata: Metadata = {
  title: 'DevAudit — AI Security Auditor',
  description: 'Autonomous AI-powered security audits for GitHub repositories',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-screen bg-terminal-bg text-terminal-text">
        <nav className="border-b border-terminal-border px-6 py-4 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <Link href="/" className="flex items-center gap-2">
              <span className="text-terminal-green font-bold text-lg tracking-tight">DevAudit</span>
            </Link>
            <Link href="/audits" className="text-terminal-muted text-sm hover:text-terminal-text transition-colors">
              Audits
            </Link>
          </div>
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-terminal-green animate-pulse" />
            <span className="text-terminal-muted text-xs">live</span>
          </div>
        </nav>
        <main>{children}</main>
      </body>
    </html>
  );
}
