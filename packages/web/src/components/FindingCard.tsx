'use client';

import { useState } from 'react';
import { Finding } from '@/hooks/useAuditStream';
import { githubLineUrl, repoRelativePath } from '@/lib/report';

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

interface Props {
  finding: Finding;
  // Reports open critical/high findings by default so the important details
  // don't hide behind a click.
  defaultExpanded?: boolean;
  // When given, the file location links to those lines on GitHub.
  repoUrl?: string;
}

export default function FindingCard({ finding, defaultExpanded = false, repoUrl }: Props) {
  const [expanded, setExpanded] = useState(defaultExpanded);
  const location = finding.filePath
    ? `${repoRelativePath(finding.filePath)}${finding.lineStart ? `:${finding.lineStart}` : ''}`
    : null;
  const href = repoUrl && finding.filePath
    ? githubLineUrl(repoUrl, finding.filePath, finding.lineStart, finding.lineEnd)
    : null;

  return (
    <div className={`border rounded-lg ${SEVERITY_STYLES[finding.severity] ?? SEVERITY_STYLES.info}`}>
      <button
        type="button"
        onClick={() => setExpanded(!expanded)}
        aria-expanded={expanded}
        className={`w-full text-left px-4 pt-4 ${location ? 'pb-1' : 'pb-4'} rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-terminal-green`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-start gap-2 min-w-0">
            <span className={`text-xs px-2 py-0.5 mt-0.5 rounded font-bold uppercase shrink-0 ${SEVERITY_BADGE[finding.severity]}`}>
              {finding.severity}
            </span>
            <span className="text-terminal-text font-medium break-words min-w-0">{finding.title}</span>
          </div>
          <span className="text-terminal-muted text-xs shrink-0 mt-1" aria-hidden>{expanded ? '▲' : '▼'}</span>
        </div>
      </button>

      {/* Outside the button: a link can't be nested inside one. */}
      {location && (
        <p className="px-4 pb-3 text-xs font-mono break-all">
          {href ? (
            <a href={href} target="_blank" rel="noopener noreferrer"
               className="text-terminal-muted hover:text-terminal-green underline decoration-dotted underline-offset-2">
              {location} ↗
            </a>
          ) : (
            <span className="text-terminal-muted">{location}</span>
          )}
        </p>
      )}

      {expanded && (
        <div className="px-4 pb-4 pt-1 space-y-3 text-sm">
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
