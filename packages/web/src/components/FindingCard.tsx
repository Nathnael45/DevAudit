'use client';

import { useState } from 'react';
import { Finding } from '@/hooks/useAuditStream';

const SEVERITY_STYLES: Record<string, string> = {
  critical: 'border-red-500 bg-red-500/10',
  high: 'border-orange-500 bg-orange-500/10',
  medium: 'border-yellow-500 bg-yellow-500/10',
  low: 'border-blue-500 bg-blue-500/10',
  info: 'border-gray-500 bg-gray-500/10',
};

const SEVERITY_BADGE: Record<string, string> = {
  critical: 'bg-red-500 text-white',
  high: 'bg-orange-500 text-white',
  medium: 'bg-yellow-500 text-black',
  low: 'bg-blue-500 text-white',
  info: 'bg-gray-500 text-white',
};

export default function FindingCard({ finding }: { finding: Finding }) {
  const [expanded, setExpanded] = useState(false);

  return (
    <div
      className={`border rounded-lg p-4 cursor-pointer transition-all ${SEVERITY_STYLES[finding.severity] ?? SEVERITY_STYLES.info}`}
      onClick={() => setExpanded(!expanded)}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-2 min-w-0">
          <span className={`text-xs px-2 py-0.5 rounded font-bold uppercase shrink-0 ${SEVERITY_BADGE[finding.severity]}`}>
            {finding.severity}
          </span>
          <span className="text-terminal-text font-medium truncate">{finding.title}</span>
        </div>
        <span className="text-terminal-muted text-xs shrink-0">{expanded ? '▲' : '▼'}</span>
      </div>

      {finding.filePath && (
        <p className="text-terminal-muted text-xs mt-1 font-mono">
          {finding.filePath}{finding.lineStart ? `:${finding.lineStart}` : ''}
        </p>
      )}

      {expanded && (
        <div className="mt-4 space-y-3 text-sm">
          <div>
            <p className="text-terminal-muted text-xs uppercase tracking-wide mb-1">Description</p>
            <p className="text-terminal-text">{finding.description}</p>
          </div>
          <div>
            <p className="text-terminal-muted text-xs uppercase tracking-wide mb-1">Recommendation</p>
            <p className="text-terminal-green">{finding.recommendation}</p>
          </div>
          <div>
            <span className="text-xs text-terminal-muted bg-terminal-surface px-2 py-1 rounded">
              {finding.category}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
