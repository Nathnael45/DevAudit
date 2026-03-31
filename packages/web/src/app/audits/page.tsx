import Link from 'next/link';

async function getRecentAudits() {
  const apiUrl = process.env.INTERNAL_API_URL || 'http://api:3001';
  try {
    const res = await fetch(`${apiUrl}/api/audits/recent`, { cache: 'no-store' });
    if (!res.ok) return [];
    const data = await res.json();
    return data.audits ?? [];
  } catch {
    return [];
  }
}

const STATUS_STYLES: Record<string, string> = {
  done: 'text-green-400 bg-green-400/10 border-green-400/20',
  running: 'text-blue-400 bg-blue-400/10 border-blue-400/20',
  queued: 'text-yellow-400 bg-yellow-400/10 border-yellow-400/20',
  failed: 'text-red-400 bg-red-400/10 border-red-400/20',
};

export default async function AuditsPage() {
  const audits = await getRecentAudits();

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
        {audits.map((audit: any) => (
          <Link
            key={audit.id}
            href={audit.status === 'done' ? `/report/${audit.public_slug}` : `/audit/${audit.id}`}
            className="block bg-terminal-surface border border-terminal-border rounded-lg px-5 py-4
                       hover:border-terminal-green transition-colors group"
          >
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="text-terminal-text font-mono text-sm truncate group-hover:text-terminal-green transition-colors">
                  {audit.repo_url}
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
        ))}
      </div>
    </div>
  );
}
