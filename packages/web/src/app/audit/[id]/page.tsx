'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { useAuditStream } from '@/hooks/useAuditStream';
import ThoughtLog from '@/components/ThoughtLog';
import FindingCard from '@/components/FindingCard';
import ResizablePanel from '@/components/ResizablePanel';
import Link from 'next/link';
import { getOwnerToken } from '@/lib/ownerTokens';
import { getApiUrl } from '@/lib/apiUrl';

export default function AuditPage({ params }: { params: { id: string } }) {
  const { id } = params;
  const router = useRouter();
  const { events, findings, status, thinkingText, analysisText, repoUrl } = useAuditStream(id);
  const repoName = repoUrl.replace('https://github.com/', '');
  const [cancelling, setCancelling] = useState(false);

  const severityCounts = findings.reduce((acc, f) => {
    acc[f.severity] = (acc[f.severity] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);

  const severityOrder = ['critical', 'high', 'medium', 'low', 'info'];
  const isActive = status === 'queued' || status === 'running' || status === 'connecting';
  const [ownerToken, setOwnerToken] = useState<string | null>(null);
  useEffect(() => setOwnerToken(getOwnerToken(id)), [id]);

  async function handleCancel() {
    setCancelling(true);
    await fetch(`${getApiUrl()}/api/audits/${id}/cancel`, {
      method: 'POST',
      headers: ownerToken ? { 'X-Owner-Token': ownerToken } : undefined,
    });
    router.push('/');
  }

  return (
    <div className="flex flex-col h-[calc(100vh-57px)]">
      {/* Sub-header */}
      <div className="flex items-center justify-between px-6 py-2.5 border-b border-terminal-border bg-terminal-surface/50">
        <div className="flex items-center gap-4 min-w-0">
          <Link href="/" className="text-terminal-muted hover:text-terminal-text text-xs transition-colors shrink-0">← Home</Link>
          <span className="text-terminal-border">|</span>
          {repoName ? (
            <span className="text-terminal-text text-sm font-mono truncate">
              Auditing <span className="text-terminal-green">&quot;{repoName}&quot;</span>
            </span>
          ) : (
            <span className="text-terminal-muted text-xs font-mono truncate">{id}</span>
          )}
        </div>
        <div className="flex items-center gap-4 shrink-0">
          {severityOrder.filter(s => severityCounts[s]).map(sev => (
            <span key={sev} className="text-xs font-mono text-terminal-muted">
              <span className={`font-bold ${sev === 'critical' ? 'text-red-400' : sev === 'high' ? 'text-orange-400' : sev === 'medium' ? 'text-yellow-400' : 'text-blue-400'}`}>
                {severityCounts[sev]}
              </span> {sev}
            </span>
          ))}
          {status === 'done' && findings.length > 0 && (
            <Link
              href={`/report/${id.slice(0, 8)}`}
              className="text-xs bg-terminal-green text-terminal-bg font-bold px-3 py-1 rounded hover:opacity-90 transition-opacity"
            >
              View Report →
            </Link>
          )}
          {isActive && ownerToken && (
            <button
              onClick={handleCancel}
              disabled={cancelling}
              className="text-xs border border-terminal-red text-terminal-red px-3 py-1 rounded
                         hover:bg-terminal-red hover:text-terminal-bg transition-colors disabled:opacity-50"
            >
              {cancelling ? 'Cancelling...' : 'Cancel'}
            </button>
          )}
        </div>
      </div>

      {/* Main layout — resizable */}
      <ResizablePanel defaultRightWidth={420}>
        <div className="p-4 h-full overflow-hidden">
          <ThoughtLog
            events={events}
            thinkingText={thinkingText}
            analysisText={analysisText}
            status={status}
          />
        </div>

        <>
          <div className="px-4 py-2.5 border-b border-terminal-border bg-terminal-surface/50 flex items-center justify-between">
            <span className="text-xs text-terminal-muted uppercase tracking-widest">Findings</span>
            <span className="text-xs text-terminal-muted bg-terminal-surface px-2 py-0.5 rounded-full">
              {findings.length}
            </span>
          </div>
          <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-3">
            {findings.length === 0 && status === 'running' && (
              <div className="text-center py-12 space-y-2">
                <div className="text-2xl text-terminal-muted">◌</div>
                <p className="text-terminal-muted text-sm">Scanning...</p>
              </div>
            )}
            {findings.length === 0 && (status === 'queued' || status === 'connecting') && (
              <div className="text-center py-12 space-y-2">
                <div className="text-2xl text-terminal-muted">◷</div>
                <p className="text-terminal-muted text-sm">Waiting to start...</p>
              </div>
            )}
            {findings.length === 0 && status === 'done' && (
              <div className="text-center py-12 space-y-2">
                <div className="text-2xl text-terminal-green">✓</div>
                <p className="text-terminal-green text-sm">No vulnerabilities found</p>
              </div>
            )}
            {severityOrder.flatMap(sev =>
              findings
                .filter(f => f.severity === sev)
                .map((f, i) => <FindingCard key={`${sev}-${i}`} finding={f} />)
            )}
          </div>
        </>
      </ResizablePanel>
    </div>
  );
}
