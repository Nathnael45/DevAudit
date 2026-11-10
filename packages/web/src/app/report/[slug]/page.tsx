import { notFound } from 'next/navigation';
import Link from 'next/link';
import ReactMarkdown from 'react-markdown';
import FindingCard from '@/components/FindingCard';
import ReportNav, { NavItem } from '@/components/ReportNav';
import { ScanStats, SEVERITY_ORDER, formatDuration, overallRisk, scanErrors, totalAlerts } from '@/lib/report';

async function getReport(slug: string) {
  const apiUrl = process.env.INTERNAL_API_URL || 'http://api:3001';
  const res = await fetch(`${apiUrl}/api/reports/${slug}`, { cache: 'no-store' });
  if (!res.ok) return null;
  return res.json();
}

const SEVERITY_COLOR: Record<string, string> = {
  critical: 'text-red-400',
  high: 'text-orange-400',
  medium: 'text-yellow-400',
  low: 'text-blue-400',
  info: 'text-gray-400',
};

const SEVERITY_DOT: Record<string, string> = {
  critical: 'bg-red-500',
  high: 'bg-orange-500',
  medium: 'bg-yellow-500',
  low: 'bg-blue-500',
  info: 'bg-gray-500',
};

const RISK_BADGE: Record<string, string> = {
  critical: 'bg-red-500/15 text-red-400 border-red-500/50',
  high: 'bg-orange-500/15 text-orange-400 border-orange-500/50',
  medium: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/50',
  low: 'bg-blue-500/15 text-blue-400 border-blue-500/50',
  info: 'bg-gray-500/15 text-gray-300 border-gray-500/50',
};

// Long-form markdown (the full AI write-up).
const PROSE_LONG = `prose prose-sm prose-invert max-w-none
  prose-headings:text-terminal-text prose-headings:font-bold prose-headings:mt-4 prose-headings:mb-2
  prose-p:text-terminal-text prose-p:leading-relaxed
  prose-strong:text-terminal-green
  prose-code:before:content-none prose-code:after:content-none prose-code:text-terminal-green prose-code:bg-terminal-bg prose-code:px-1 prose-code:rounded
  prose-li:text-terminal-text prose-ul:my-2 prose-ol:my-2
  prose-a:text-terminal-blue`;

// The TL;DR: body text slightly softened so the bolded issue names stand out.
const PROSE_TLDR = `prose prose-invert max-w-none text-gray-300
  prose-p:text-gray-300 prose-p:leading-relaxed prose-p:my-2
  prose-strong:text-white prose-strong:font-semibold
  prose-ul:my-3 prose-ul:pl-5 prose-li:my-1.5 prose-li:text-gray-300 prose-li:marker:text-terminal-green
  prose-code:before:content-none prose-code:after:content-none prose-code:text-terminal-green prose-code:bg-terminal-bg prose-code:px-1 prose-code:rounded
  [&>p:first-child]:text-lg [&>p:first-child]:mt-0`;

// Sections sit below a sticky tab strip on phones, so anchors need headroom.
const SECTION = 'scroll-mt-16 lg:scroll-mt-8';

export default async function ReportPage({ params }: { params: { slug: string } }) {
  const { slug } = params;
  const data = await getReport(slug);
  if (!data) notFound();

  const { audit, findings, summary, tldr, scanStats } = data as {
    audit: any; findings: any[]; summary: string | null; tldr: string | null; scanStats: ScanStats | null;
  };
  // Reports from before the TL;DR existed keep the original layout, where the
  // full AI write-up is the only overview and so sits above the findings.
  const hasTldr = Boolean(tldr);
  const incomplete = scanErrors(scanStats);
  const timings = audit.timings ?? {};
  const risk = overallRisk(findings);

  const counts = SEVERITY_ORDER.reduce((acc, s) => {
    acc[s] = findings.filter((f: any) => f.severity === s).length;
    return acc;
  }, {} as Record<string, number>);
  const presentSeverities = SEVERITY_ORDER.filter(s => counts[s] > 0);

  const repoName = audit.repo_url.replace('https://github.com/', '');

  const navItems: NavItem[] = [
    ...(hasTldr ? [{ id: 'summary', label: 'Summary' }] : []),
    { id: 'overview', label: 'Overview' },
    ...(!hasTldr && summary ? [{ id: 'analysis', label: 'AI analysis' }] : []),
    { id: 'findings', label: 'Findings', count: findings.length },
    ...presentSeverities.map(sev => ({
      id: sev, label: sev[0].toUpperCase() + sev.slice(1), count: counts[sev], dotClass: SEVERITY_DOT[sev], indent: true,
    })),
    ...(hasTldr && summary ? [{ id: 'reasoning', label: 'Full AI reasoning' }] : []),
  ];

  return (
    <div className="max-w-6xl mx-auto px-4 sm:px-6 py-10 sm:py-12 lg:grid lg:grid-cols-[11rem_minmax(0,1fr)] lg:gap-12">
      <ReportNav items={navItems} variant="sidebar" />

      <div className="space-y-10 min-w-0 max-w-4xl">
        {/* Header */}
        <div className="space-y-1">
          <div className="flex items-center gap-2 text-terminal-muted text-xs mb-4">
            <Link href="/" className="hover:text-terminal-text transition-colors">Home</Link>
            <span>/</span>
            <span>Report</span>
            <span>/</span>
            <span className="text-terminal-text truncate">{slug}</span>
          </div>
          <h1 className="text-2xl sm:text-3xl font-mono font-bold break-words">{repoName}</h1>
          <p className="text-terminal-muted text-sm font-mono break-all">{audit.repo_url}</p>
          <p className="text-terminal-muted text-xs pt-1">
            Audited {new Date(audit.completed_at ?? audit.created_at).toLocaleString()}
          </p>
        </div>

        <ReportNav items={navItems} variant="bar" />

        {incomplete.length > 0 && (
          <div role="note" className="border border-yellow-500/60 bg-yellow-500/10 rounded-lg px-4 py-3 text-sm">
            <span className="font-semibold text-yellow-400">Incomplete scan:</span>{' '}
            <span className="text-terminal-text">
              {incomplete.join('; ')}. Findings from {incomplete.length === 1 ? 'that tool are' : 'those tools are'} missing from this report.
            </span>
          </div>
        )}

        {/* TL;DR — the verdict and key points, before any detail */}
        {hasTldr && (
          <section id="summary" className={`${SECTION} bg-terminal-surface border border-terminal-border rounded-lg p-4 sm:p-6 space-y-3`}>
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="flex items-center gap-2">
                <span className="w-2 h-2 rounded-full bg-terminal-green" />
                <h2 className="text-xs uppercase tracking-widest text-terminal-muted">Summary</h2>
              </div>
              {risk ? (
                <span className={`text-xs font-semibold uppercase tracking-wide border rounded-full px-3 py-1 ${RISK_BADGE[risk]}`}>
                  Overall risk: {risk}
                </span>
              ) : (
                <span className="text-xs font-semibold uppercase tracking-wide border rounded-full px-3 py-1 bg-terminal-green/10 text-terminal-green border-terminal-green/50">
                  No issues found
                </span>
              )}
            </div>
            <div className={PROSE_TLDR}>
              <ReactMarkdown>{tldr!}</ReactMarkdown>
            </div>
          </section>
        )}

        {/* Overview: severity breakdown (clicking jumps to that section) + scanner funnel */}
        <section id="overview" className={`${SECTION} space-y-3`}>
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-3">
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

          {scanStats && (
            <p className="text-xs text-terminal-muted flex flex-wrap gap-x-2 gap-y-1">
              <span>
                {scanStats.tools.map(t => `${t.tool} ${t.error ? '—' : t.alerts}`).join(' · ')}
              </span>
              <span>→</span>
              <span>
                <span className="text-terminal-text">{totalAlerts(scanStats)} scanner alerts</span> reviewed by AI,{' '}
                <span className="text-terminal-text">{scanStats.confirmed} confirmed</span>
              </span>
              {timings.scanWallMs != null && timings.aiMs != null && (
                <span>· scanned in {formatDuration(timings.scanWallMs)}, AI review {formatDuration(timings.aiMs)}</span>
              )}
            </p>
          )}
        </section>

        {/* Legacy reports: full AI write-up above the findings */}
        {!hasTldr && summary && (
          <section id="analysis" className={`${SECTION} bg-terminal-surface border border-terminal-border rounded-lg p-4 sm:p-6 space-y-3`}>
            <div className="flex items-center gap-2">
              <span className="w-2 h-2 rounded-full bg-terminal-green" />
              <h2 className="text-xs uppercase tracking-widest text-terminal-muted">AI Analysis Summary</h2>
            </div>
            <div className={PROSE_LONG}>
              <ReactMarkdown>{summary}</ReactMarkdown>
            </div>
          </section>
        )}

        {/* Findings grouped by severity */}
        <section id="findings" className={`${SECTION} space-y-8`}>
          <h2 className="text-xs uppercase tracking-widest text-terminal-muted">Findings · {findings.length}</h2>
          {findings.length === 0 ? (
            <div className="text-center py-16">
              <div className="text-4xl text-terminal-green mb-3">✓</div>
              <p className="text-terminal-green text-lg font-medium">No vulnerabilities found</p>
              <p className="text-terminal-muted text-sm mt-1">
                {incomplete.length > 0
                  ? 'Nothing was flagged by the scans that completed — see the warning above.'
                  : 'This repository passed all security checks.'}
              </p>
            </div>
          ) : (
            presentSeverities.map(sev => (
              <div key={sev} id={sev} className={`${SECTION} space-y-3`}>
                <h3 className={`text-sm font-bold uppercase tracking-widest ${SEVERITY_COLOR[sev]}`}>
                  {sev} · {counts[sev]}
                </h3>
                {findings
                  .filter((f: any) => f.severity === sev)
                  .map((f: any, i: number) => (
                    <FindingCard key={i} repoUrl={audit.repo_url}
                      defaultExpanded={sev === 'critical' || sev === 'high'} finding={{
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
            ))
          )}
        </section>

        {/* Full reasoning — the details behind the TL;DR, for anyone who wants them */}
        {hasTldr && summary && (
          <details id="reasoning" className={`${SECTION} group bg-terminal-surface border border-terminal-border rounded-lg`}>
            <summary className="cursor-pointer list-none px-4 sm:px-6 py-4 flex items-center justify-between gap-3
                                text-xs uppercase tracking-widest text-terminal-muted hover:text-terminal-text
                                focus:outline-none focus-visible:ring-2 focus-visible:ring-terminal-green rounded-lg">
              <span>Full AI reasoning</span>
              <span aria-hidden className="group-open:rotate-180 transition-transform">▼</span>
            </summary>
            <div className={`px-4 sm:px-6 pb-6 ${PROSE_LONG}`}>
              <ReactMarkdown>{summary}</ReactMarkdown>
            </div>
          </details>
        )}

        {/* Footer */}
        <div className="border-t border-terminal-border pt-6 flex flex-wrap items-center justify-between gap-3 text-xs text-terminal-muted">
          <span>Report ID: {slug}</span>
          <Link href="/" className="text-terminal-green hover:underline">Run another audit →</Link>
        </div>
      </div>
    </div>
  );
}
