// Helpers for the public report page, kept out of the component so they can be
// unit-tested without rendering.

export interface ScanStats {
  tools: { tool: string; alerts: number; error: string | null }[];
  confirmed: number;
}

// New audits store repo-relative paths; older ones can carry the worker's clone
// directory (/tmp/devaudit-repos/<audit id>/...), which means nothing to a reader.
export function repoRelativePath(filePath: string): string {
  return filePath.replace(/^\/tmp\/devaudit-repos\/[^/]+\//, '').replace(/^\.\//, '');
}

// Links a finding to the exact lines on GitHub, so a reader can check it in one
// click. HEAD is the repo's default branch now — close enough for a report, but
// it can drift from the audited commit if the file changes later.
export function githubLineUrl(
  repoUrl: string,
  filePath: string,
  lineStart?: number | null,
  lineEnd?: number | null,
): string | null {
  const repo = repoUrl.match(/^https?:\/\/(?:www\.)?github\.com\/([^/]+)\/([^/#?]+)/);
  if (!repo) return null;
  const path = repoRelativePath(filePath);
  if (!path || path.startsWith('/')) return null;

  const name = repo[2].replace(/\.git$/, '');
  const encoded = path.split('/').map(encodeURIComponent).join('/');
  const anchor = !lineStart ? '' : lineEnd && lineEnd > lineStart ? `#L${lineStart}-L${lineEnd}` : `#L${lineStart}`;
  return `https://github.com/${repo[1]}/${name}/blob/HEAD/${encoded}${anchor}`;
}

export function formatDuration(ms: number): string {
  const seconds = Math.round(ms / 1000);
  if (seconds < 60) return `${seconds}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = seconds % 60;
  return rest ? `${minutes}m ${rest}s` : `${minutes}m`;
}

export function totalAlerts(stats: ScanStats): number {
  return stats.tools.reduce((sum, t) => sum + t.alerts, 0);
}

export function scanErrors(stats: ScanStats | null): string[] {
  return (stats?.tools ?? []).filter(t => t.error).map(t => `${t.tool} ${t.error}`);
}

export const SEVERITY_ORDER = ['critical', 'high', 'medium', 'low', 'info'] as const;

// Overall risk is the most severe confirmed finding — derived from the data, not
// from Claude's wording, so the badge always agrees with the findings list.
export function overallRisk(findings: { severity: string }[]): (typeof SEVERITY_ORDER)[number] | null {
  for (const sev of SEVERITY_ORDER) {
    if (findings.some(f => f.severity === sev)) return sev;
  }
  return null;
}
