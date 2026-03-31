'use client';

import { useEffect, useRef } from 'react';
import ReactMarkdown from 'react-markdown';
import { StreamEvent } from '@/hooks/useAuditStream';

const TYPE_STYLES: Record<string, string> = {
  thought: 'text-terminal-green',
  finding: 'text-terminal-red',
  summary: 'text-terminal-blue',
  error: 'text-terminal-red font-bold',
};

const TYPE_PREFIX: Record<string, string> = {
  thought: '▸',
  finding: '⚠',
  summary: '■',
  error: '✗',
};

interface Props {
  events: StreamEvent[];
  thinkingText: string;
  analysisText: string;
  status: string;
}

export default function ThoughtLog({ events, thinkingText, analysisText, status }: Props) {
  const bottomRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [events, analysisText]);

  return (
    <div className="flex flex-col h-full bg-terminal-bg rounded-lg border border-terminal-border overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b border-terminal-border bg-terminal-surface">
        <span className="text-xs text-terminal-muted uppercase tracking-widest">Agent Log</span>
        <StatusBadge status={status} />
      </div>

      <div className="flex-1 overflow-y-auto scrollbar-thin p-4 space-y-1 font-mono text-sm">
        {/* Thought events */}
        {events.map((ev, i) => (
          <div key={i} className="flex gap-2 leading-relaxed">
            <span className={`shrink-0 ${TYPE_STYLES[ev.type] ?? 'text-terminal-muted'}`}>
              {TYPE_PREFIX[ev.type] ?? '·'}
            </span>
            <span className={`${TYPE_STYLES[ev.type] ?? 'text-terminal-text'} break-words min-w-0`}>
              {ev.type === 'finding' && ev.finding
                ? `[${ev.finding.severity.toUpperCase()}] ${ev.finding.title} — ${ev.finding.filePath ?? 'unknown file'}`
                : ev.content}
            </span>
          </div>
        ))}

        {/* Live streaming AI analysis with markdown rendering — strip raw <findings> block */}
        {analysisText && (
          <div className="mt-3 border-t border-terminal-border pt-3">
            <div className="prose prose-sm prose-invert max-w-none
              prose-headings:text-terminal-text prose-headings:font-bold prose-headings:mt-3 prose-headings:mb-1 prose-headings:font-mono
              prose-p:text-terminal-muted prose-p:leading-relaxed prose-p:my-1
              prose-strong:text-terminal-text
              prose-em:text-terminal-muted
              prose-code:text-terminal-green prose-code:bg-terminal-surface prose-code:px-1 prose-code:rounded prose-code:text-xs
              prose-pre:bg-terminal-surface prose-pre:border prose-pre:border-terminal-border prose-pre:rounded
              prose-li:text-terminal-muted prose-li:my-0.5
              prose-ul:my-1 prose-ol:my-1
              prose-blockquote:border-terminal-green prose-blockquote:text-terminal-muted">
              <ReactMarkdown>
                {analysisText
                  .replace(/<findings>[\s\S]*?<\/findings>/g, '')  // strip complete block
                  .replace(/<findings>[\s\S]*/g, '\n\n_Summarizing findings..._')  // replace partial block while streaming
                  .trim()}
              </ReactMarkdown>
            </div>
            {status === 'running' && (
              <span className="text-terminal-green animate-pulse text-sm">▌</span>
            )}
          </div>
        )}

        <div ref={bottomRef} />
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    connecting: 'bg-terminal-yellow text-terminal-bg',
    queued: 'bg-terminal-yellow text-terminal-bg',
    running: 'bg-terminal-blue text-terminal-bg',
    done: 'bg-terminal-green text-terminal-bg',
    failed: 'bg-terminal-red text-white',
    disconnected: 'bg-terminal-muted text-terminal-bg',
  };

  return (
    <span className={`text-xs px-2 py-0.5 rounded font-bold uppercase ${styles[status] ?? 'bg-terminal-muted'}`}>
      {status === 'running' && <span className="inline-block w-1.5 h-1.5 bg-current rounded-full mr-1 animate-pulse" />}
      {status}
    </span>
  );
}
