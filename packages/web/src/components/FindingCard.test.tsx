import { describe, it, expect } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import FindingCard from './FindingCard';
import { Finding } from '@/hooks/useAuditStream';

const finding: Finding = {
  filePath: 'src/db/query.ts',
  lineStart: 42,
  severity: 'critical',
  category: 'sql-injection',
  title: 'Unsanitized SQL query',
  description: 'User input is concatenated directly into the query string.',
  recommendation: 'Use parameterized queries.',
};

describe('FindingCard', () => {
  it('shows the severity badge, title, and file location while collapsed', () => {
    render(<FindingCard finding={finding} />);

    expect(screen.getByText('critical')).toBeTruthy();
    expect(screen.getByText('Unsanitized SQL query')).toBeTruthy();
    expect(screen.getByText('src/db/query.ts:42')).toBeTruthy();
    expect(screen.queryByText(finding.description)).toBeNull();
  });

  it('reveals description, recommendation, and category on click, and hides them again on a second click', () => {
    render(<FindingCard finding={finding} />);
    const toggle = screen.getByRole('button', { name: /Unsanitized SQL query/ });
    expect(toggle.getAttribute('aria-expanded')).toBe('false');

    fireEvent.click(toggle);
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText(finding.description)).toBeTruthy();
    expect(screen.getByText(finding.recommendation)).toBeTruthy();
    expect(screen.getByText('sql-injection')).toBeTruthy();

    fireEvent.click(toggle);
    expect(screen.queryByText(finding.description)).toBeNull();
  });

  it('omits the file location line when the finding has no filePath', () => {
    const { filePath, lineStart, ...rest } = finding;
    render(<FindingCard finding={rest as Finding} />);

    expect(screen.queryByText(/src\/db\/query\.ts/)).toBeNull();
  });

  it('starts expanded when defaultExpanded is set', () => {
    render(<FindingCard finding={finding} defaultExpanded />);
    expect(screen.getByRole('button', { name: /Unsanitized SQL query/ }).getAttribute('aria-expanded')).toBe('true');
    expect(screen.getByText(finding.description)).toBeTruthy();
  });

  it('links the file location to GitHub when the repo URL is known', () => {
    render(<FindingCard finding={{ ...finding, lineEnd: 45 }} repoUrl="https://github.com/acme/app" />);
    const link = screen.getByRole('link', { name: /src\/db\/query\.ts:42/ });
    expect(link.getAttribute('href')).toBe('https://github.com/acme/app/blob/HEAD/src/db/query.ts#L42-L45');
    expect(link.getAttribute('target')).toBe('_blank');
    expect(link.getAttribute('rel')).toContain('noopener');
  });

  it('shows the location as plain text without a repo URL (live audit view)', () => {
    render(<FindingCard finding={finding} />);
    expect(screen.queryByRole('link')).toBeNull();
  });
});
