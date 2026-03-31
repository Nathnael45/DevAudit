import { notFound } from 'next/navigation';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import FindingCard from '@/components/FindingCard';

async function getReport(slug: string) {
  const apiUrl = process.env.INTERNAL_API_URL || 'http://api:3001';
  const res = await fetch(`${apiUrl}/api/reports/${slug}`, { cache: 'no-store' });
  if (!res.ok) return null;
  return res.json();
}

const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info'];

const SEVERITY_COLOR: Record<string, string> = {
  critical: 'text-red-400',
  high: 'text-orange-400',
  medium: 'text-yellow-400',
  low: 'text-blue-400',
  info: 'text-gray-400',
};

export default async function ReportPage({ params }: { params: { slug: string } }) {
  const { slug } = params;
  const data = await getReport(slug);
  if (!data) notFound();

  const { audit, findings, summary } = data;

  const counts = SEVERITY_ORDER.reduce((acc, s) => {
    acc[s] = findings.filter((f: any) => f.severity === s).length;
    return acc;
  }, {} as Record<string, number>);

  const repoName = audit.repo_url.replace('https://github.com/', '');

  return (
    <div className="max-w-4xl mx-auto px-6 py-12 space-y-10">
      {/* Header */}
      <div className="space-y-1">
        <div className="flex items-center gap-2 text-terminal-muted text-xs mb-4">
          <Link href="/" className="hover:text-terminal-text transition-colors">Home</Link>
          <span>/</span>
          <span>Report</span>
          <span>/</span>
          <span className="text-terminal-text">{slug}</span>
        </div>
        <h1 className="text-3xl font-bold">{repoName}</h1>
        <p className="text-terminal-muted text-sm font-mono">{audit.repo_url}</p>
        <p className="text-terminal-muted text-xs pt-1">
          Audited {new Date(audit.completed_at ?? audit.created_at).toLocaleString()}
        </p>
      </div>

      {/* Severity breakdown — clicking jumps to that section */}
      <div className="grid grid-cols-5 gap-3">
        {SEVERITY_ORDER.map((sev) => (
          counts[sev] > 0 ? (
            <a key={sev} href={`#${sev}`}
              className="bg-terminal-surface border border-terminal-border rounded-lg p-4 text-center
                         hover:border-terminal-green transition-colors cursor-pointer">
              <div className={`text-3xl font-bold ${SEVERITY_COLOR[sev]}`}>{counts[sev]}</div>
              <div className="text-terminal-muted text-xs mt-1 capitalize">{sev}</div>
            </a>
          ) : (
            <div key={sev} className="bg-terminal-surface border border-terminal-border rounded-lg p-4 text-center opacity-40">
              <div className={`text-3xl font-bold ${SEVERITY_COLOR[sev]}`}>0</div>
              <div className="text-terminal-muted text-xs mt-1 capitalize">{sev}</div>
            </div>
          )
        ))}
      </div>

      {/* AI Summary */}
      {summary && (
        <div className="bg-terminal-surface border border-terminal-border rounded-lg p-6 space-y-3">
          <div className="flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-terminal-green" />
            <h2 className="text-xs uppercase tracking-widest text-terminal-muted">AI Analysis Summary</h2>
          </div>
          <div className="prose prose-sm prose-invert max-w-none
            prose-headings:text-terminal-text prose-headings:font-bold prose-headings:mt-4 prose-headings:mb-2
            prose-p:text-terminal-text prose-p:leading-relaxed
            prose-strong:text-terminal-green
            prose-code:text-terminal-green prose-code:bg-terminal-bg prose-code:px-1 prose-code:rounded
            prose-li:text-terminal-text prose-ul:my-2 prose-ol:my-2
            prose-a:text-terminal-blue">
            <ReactMarkdown>{summary}</ReactMarkdown>
          </div>
        </div>
      )}

      {/* Findings grouped by severity */}
      {findings.length === 0 ? (
        <div className="text-center py-16">
          <div className="text-4xl text-terminal-green mb-3">✓</div>
          <p className="text-terminal-green text-lg font-medium">No vulnerabilities found</p>
          <p className="text-terminal-muted text-sm mt-1">This repository passed all security checks.</p>
        </div>
      ) : (
        <div className="space-y-8">
          {SEVERITY_ORDER.filter(s => counts[s] > 0).map(sev => (
            <div key={sev} id={sev} className="space-y-3 scroll-mt-6">
              <h2 className={`text-sm font-bold uppercase tracking-widest ${SEVERITY_COLOR[sev]}`}>
                {sev} · {counts[sev]}
              </h2>
              {findings
                .filter((f: any) => f.severity === sev)
                .map((f: any, i: number) => (
                  <FindingCard key={i} finding={{
                    filePath: f.file_path,
                    lineStart: f.line_start,
                    lineEnd: f.line_end,
                    severity: f.severity,
                    category: f.category,
                    title: f.title,
                    description: f.description,
                    recommendation: f.recommendation,
                  }} />
                ))}
            </div>
          ))}
        </div>
      )}

      {/* Footer */}
      <div className="border-t border-terminal-border pt-6 flex items-center justify-between text-xs text-terminal-muted">
        <span>Report ID: {slug}</span>
        <Link href="/" className="text-terminal-green hover:underline">Run another audit →</Link>
      </div>
    </div>
  );
}
