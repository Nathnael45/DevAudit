import { describe, it, expect } from 'vitest';
import { repoRelativePath, githubLineUrl, formatDuration, totalAlerts, scanErrors, overallRisk } from './report';

describe('repoRelativePath', () => {
  it('strips the worker clone directory from older findings', () => {
    expect(repoRelativePath('/tmp/devaudit-repos/91dc1ded-b9f3/app/db.py')).toBe('app/db.py');
  });

  it('leaves repo-relative paths alone, minus a leading ./', () => {
    expect(repoRelativePath('bad/db.py')).toBe('bad/db.py');
    expect(repoRelativePath('./bad/db.py')).toBe('bad/db.py');
  });
});

describe('githubLineUrl', () => {
  const repo = 'https://github.com/fportantier/vulpy';

  it('links a single line', () => {
    expect(githubLineUrl(repo, 'bad/db.py', 19, 19)).toBe('https://github.com/fportantier/vulpy/blob/HEAD/bad/db.py#L19');
  });

  it('links a line range', () => {
    expect(githubLineUrl(repo, 'bad/libuser.py', 12, 53)).toBe('https://github.com/fportantier/vulpy/blob/HEAD/bad/libuser.py#L12-L53');
  });

  it('links the file when there is no line number', () => {
    expect(githubLineUrl(repo, 'bad/db.py')).toBe('https://github.com/fportantier/vulpy/blob/HEAD/bad/db.py');
  });

  it('handles .git suffixes, trailing paths, and characters that need encoding', () => {
    expect(githubLineUrl('https://github.com/a/b.git', 'x.py', 1)).toBe('https://github.com/a/b/blob/HEAD/x.py#L1');
    expect(githubLineUrl('https://github.com/a/b/tree/main', 'my file#1.py', 2)).toBe('https://github.com/a/b/blob/HEAD/my%20file%231.py#L2');
  });

  it('returns null when it cannot build a trustworthy link', () => {
    expect(githubLineUrl('https://gitlab.com/a/b', 'x.py', 1)).toBeNull();
    expect(githubLineUrl('https://github.com/a/b', '/etc/passwd', 1)).toBeNull();
  });
});

describe('formatDuration', () => {
  it('formats seconds and minutes', () => {
    expect(formatDuration(38_400)).toBe('38s');
    expect(formatDuration(130_000)).toBe('2m 10s');
    expect(formatDuration(120_000)).toBe('2m');
  });
});

describe('scan stats', () => {
  const stats = {
    tools: [
      { tool: 'Semgrep', alerts: 45, error: null },
      { tool: 'Bandit', alerts: 0, error: 'timed out after 120s' },
      { tool: 'Gitleaks', alerts: 1, error: null },
    ],
    confirmed: 32,
  };

  it('totals raw alerts across tools', () => {
    expect(totalAlerts(stats)).toBe(46);
  });

  it('lists tools that did not finish', () => {
    expect(scanErrors(stats)).toEqual(['Bandit timed out after 120s']);
    expect(scanErrors(null)).toEqual([]);
  });
});

describe('overallRisk', () => {
  it('is the most severe finding present', () => {
    expect(overallRisk([{ severity: 'low' }, { severity: 'high' }, { severity: 'medium' }])).toBe('high');
    expect(overallRisk([{ severity: 'info' }])).toBe('info');
  });

  it('is null when there are no findings', () => {
    expect(overallRisk([])).toBeNull();
  });
});
