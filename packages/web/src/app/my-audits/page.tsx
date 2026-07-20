'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getOwnerToken, getAllOwnedAudits } from '@/lib/ownerTokens';
import { getApiUrl } from '@/lib/apiUrl';
import { isLoggedIn, authHeaders } from '@/lib/auth';
import { STATUS_STYLES } from '@/lib/statusStyles';

export default function MyAuditsPage() {
  const [audits, setAudits] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [loggedIn, setLoggedIn] = useState(false);

  useEffect(() => {
    const loggedInNow = isLoggedIn();
    setLoggedIn(loggedInNow);

    if (loggedInNow) {
      fetch(`${getApiUrl()}/api/audits`, { headers: authHeaders() })
        .then(r => r.json())
        .then(d => setAudits(d.audits ?? []))
        .catch(() => {})
        .finally(() => setLoading(false));
      return;
    }

    const owned = getAllOwnedAudits();
    if (owned.length === 0) { setLoading(false); return; }

    Promise.all(
      owned.map(({ auditId }) =>
        fetch(`${getApiUrl()}/api/audits/${auditId}`)
          .then(r => (r.ok ? r.json() : null))
          .then(d => d?.audit ?? null)
          .catch(() => null)
      )
    ).then(results => {
      const found = results.filter((a): a is NonNullable<typeof a> => a !== null);
      found.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
      setAudits(found);
      setLoading(false);
    });
  }, []);

  async function handleDelete(e: React.MouseEvent, auditId: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Delete this audit?')) return;
    setDeleting(auditId);

    const headers: Record<string, string> = loggedIn ? authHeaders() : {};
    if (!loggedIn) {
      const ownerToken = getOwnerToken(auditId);
      if (ownerToken) headers['X-Owner-Token'] = ownerToken;
    }

    await fetch(`${getApiUrl()}/api/audits/${auditId}`, { method: 'DELETE', headers });
    setAudits(prev => prev.filter(a => a.id !== auditId));
    setDeleting(null);
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold">My Audits</h1>
          <p className="text-terminal-muted text-sm mt-1">
            {loggedIn ? 'Tied to your account.' : 'From this browser only.'}
          </p>
        </div>
        <Link href="/" className="text-sm text-terminal-green hover:underline">+ New Audit</Link>
      </div>

      {!loggedIn && !loading && audits.length > 0 && (
        <div className="mb-6 px-4 py-3 bg-terminal-surface border border-terminal-border rounded-lg text-sm text-terminal-muted">
          These audits only exist in this browser.{' '}
          <Link href="/register" className="text-terminal-green hover:underline">Create an account</Link> to keep them if you clear your browser data or switch devices.
        </div>
      )}

      {!loading && audits.length === 0 && (
        <div className="text-center py-20 text-terminal-muted">
          <p className="text-lg">No audits yet.</p>
          <Link href="/" className="text-terminal-green hover:underline mt-2 inline-block">Run your first audit →</Link>
        </div>
      )}

      <div className="space-y-3">
        {audits.map((audit) => (
          <div key={audit.id} className="flex items-center gap-2">
            <Link
              href={audit.status === 'done' ? `/report/${audit.public_slug}` : `/audit/${audit.id}`}
              className="flex-1 bg-terminal-surface border border-terminal-border rounded-lg px-5 py-4
                         hover:border-terminal-green transition-colors group"
            >
              <div className="flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <p className="text-terminal-text font-mono text-sm truncate group-hover:text-terminal-green transition-colors">
                    {audit.repo_url.replace('https://github.com/', '')}
                  </p>
                  <p className="text-terminal-muted text-xs mt-1">
                    {new Date(audit.created_at).toLocaleString()}
                  </p>
                </div>
                <div className="flex items-center gap-3 shrink-0">
                  <span className={`text-xs px-2 py-0.5 rounded border font-mono uppercase ${STATUS_STYLES[audit.status] ?? STATUS_STYLES.queued}`}>
                    {audit.status === 'running' && <span className="inline-block w-1.5 h-1.5 bg-current rounded-full mr-1 animate-pulse" />}
                    {audit.status}
                  </span>
                  <span className="text-terminal-muted text-xs">→</span>
                </div>
              </div>
            </Link>
            <button
              onClick={(e) => handleDelete(e, audit.id)}
              disabled={deleting === audit.id}
              className="shrink-0 p-3 text-terminal-muted hover:text-terminal-red transition-colors disabled:opacity-50"
              title="Delete audit"
            >
              {deleting === audit.id ? '...' : '✕'}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
