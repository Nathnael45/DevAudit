'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

function getApiUrl() {
  return `${window.location.protocol}//${window.location.hostname}:3001`;
}

const STATUS_STYLES: Record<string, string> = {
  done: 'text-green-400 bg-green-400/10 border-green-400/20',
  running: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  queued: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  failed: 'text-red-400 bg-red-400/10 border-red-400/20',
};

export default function HomePage() {
  const router = useRouter();
  const [repoUrl, setRepoUrl] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [recentAudits, setRecentAudits] = useState<any[]>([]);

  useEffect(() => {
    fetch(`${getApiUrl()}/api/audits/recent`)
      .then(r => r.json())
      .then(d => setRecentAudits(d.audits ?? []))
      .catch(() => {});
  }, []);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      const res = await fetch(`${getApiUrl()}/api/audits`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ repoUrl }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data.error ?? 'Failed to start audit');
      }

      const { auditId } = await res.json();
      router.push(`/audit/${auditId}`);
    } catch (err: any) {
      setError(err.message);
      setLoading(false);
    }
  }

  return (
    <div className="max-w-3xl mx-auto px-6 py-16 space-y-16">
      {/* Hero */}
      <div className="space-y-8">
        <div className="space-y-3">
          <h1 className="text-5xl font-bold tracking-tight">
            Security Audit<span className="text-terminal-green">.</span>
          </h1>
          <p className="text-terminal-muted text-xl">
            Drop a GitHub repo. Watch AI hunt for vulnerabilities in real time.
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3">
          <div className="flex gap-2">
            <input
              type="url"
              value={repoUrl}
              onChange={(e) => setRepoUrl(e.target.value)}
              placeholder="https://github.com/owner/repo"
              required
              className="flex-1 bg-terminal-surface border border-terminal-border rounded-lg px-4 py-3
                         text-terminal-text placeholder-terminal-muted focus:outline-none
                         focus:border-terminal-green transition-colors font-mono text-sm"
            />
            <button
              type="submit"
              disabled={loading}
              className="px-6 py-3 bg-terminal-green text-terminal-bg font-bold rounded-lg
                         hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed
                         whitespace-nowrap"
            >
              {loading ? '...' : 'Run Audit'}
            </button>
          </div>
          {error && <p className="text-terminal-red text-sm font-mono">{error}</p>}
        </form>

        <div className="flex items-center gap-6 text-xs text-terminal-muted">
          {[
            { label: 'Semgrep + Bandit + Gitleaks' },
            { label: 'AI reasoning live' },
            { label: 'Shareable report URL' },
          ].map(({ label }, i) => (
            <span key={label} className="flex items-center gap-2">
              {i > 0 && <span className="text-terminal-border">·</span>}
              <span className="text-terminal-green">✓</span>
              {label}
            </span>
          ))}
        </div>
      </div>

      {/* Recent audits */}
      {recentAudits.length > 0 && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-sm uppercase tracking-widest text-terminal-muted">Recent Audits</h2>
            <Link href="/audits" className="text-xs text-terminal-green hover:underline">View all →</Link>
          </div>
          <div className="space-y-2">
            {recentAudits.slice(0, 5).map((audit) => (
              <Link
                key={audit.id}
                href={audit.status === 'done' ? `/report/${audit.public_slug}` : `/audit/${audit.id}`}
                className="flex items-center justify-between px-4 py-3 bg-terminal-surface border border-terminal-border
                           rounded-lg hover:border-terminal-green transition-colors group"
              >
                <span className="text-terminal-muted font-mono text-sm truncate group-hover:text-terminal-text transition-colors">
                  {audit.repo_url.replace('https://github.com/', '')}
                </span>
                <div className="flex items-center gap-3 shrink-0 ml-4">
                  <span className="text-terminal-muted text-xs">
                    {new Date(audit.created_at).toLocaleDateString()}
                  </span>
                  <span className={`text-xs px-2 py-0.5 rounded border font-mono ${STATUS_STYLES[audit.status] ?? STATUS_STYLES.queued}`}>
                    {audit.status}
                  </span>
                </div>
              </Link>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
