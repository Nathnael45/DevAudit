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
    const card = screen.getByText('Unsanitized SQL query').closest('div[class*="border"]')!;

    fireEvent.click(card);
    expect(screen.getByText(finding.description)).toBeTruthy();
    expect(screen.getByText(finding.recommendation)).toBeTruthy();
    expect(screen.getByText('sql-injection')).toBeTruthy();

    fireEvent.click(card);
    expect(screen.queryByText(finding.description)).toBeNull();
  });

  it('omits the file location line when the finding has no filePath', () => {
    const { filePath, lineStart, ...rest } = finding;
    render(<FindingCard finding={rest as Finding} />);

    expect(screen.queryByText(/src\/db\/query\.ts/)).toBeNull();
  });
});
