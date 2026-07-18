'use client';

import { useState, useEffect } from 'react';
import Link from 'next/link';
import { getOwnerToken } from '@/lib/ownerTokens';
import { getApiUrl } from '@/lib/apiUrl';

const STATUS_STYLES: Record<string, string> = {
  done: 'text-green-400 bg-green-400/10 border-green-400/20',
  running: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  queued: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  failed: 'text-red-400 bg-red-400/10 border-red-400/20',
};

export default function AuditsPage() {
  const [audits, setAudits] = useState<any[]>([]);
  const [deleting, setDeleting] = useState<string | null>(null);
  const [ownerTokens, setOwnerTokens] = useState<Record<string, string>>({});

  useEffect(() => {
    fetch(`${getApiUrl()}/api/audits/recent`)
      .then(r => r.json())
      .then(d => {
        const audits = d.audits ?? [];
        setAudits(audits);
        // Only audits this browser created (and still has the token for) are deletable.
        const tokens: Record<string, string> = {};
        for (const audit of audits) {
          const token = getOwnerToken(audit.id);
          if (token) tokens[audit.id] = token;
        }
        setOwnerTokens(tokens);
      })
      .catch(() => {});
  }, []);

  async function handleDelete(e: React.MouseEvent, auditId: string) {
    e.preventDefault();
    e.stopPropagation();
    if (!confirm('Delete this audit?')) return;
    setDeleting(auditId);
    await fetch(`${getApiUrl()}/api/audits/${auditId}`, {
      method: 'DELETE',
      headers: { 'X-Owner-Token': ownerTokens[auditId] },
    });
    setAudits(prev => prev.filter(a => a.id !== auditId));
    setDeleting(null);
  }

  return (
    <div className="max-w-4xl mx-auto px-6 py-12">
      <div className="flex items-center justify-between mb-8">
        <h1 className="text-2xl font-bold">Recent Audits</h1>
        <Link href="/" className="text-sm text-terminal-green hover:underline">+ New Audit</Link>
      </div>

      {audits.length === 0 && (
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
            {ownerTokens[audit.id] && (
              <button
                onClick={(e) => handleDelete(e, audit.id)}
                disabled={deleting === audit.id}
                className="shrink-0 p-3 text-terminal-muted hover:text-terminal-red transition-colors disabled:opacity-50"
                title="Delete audit"
              >
                {deleting === audit.id ? '...' : '✕'}
              </button>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
