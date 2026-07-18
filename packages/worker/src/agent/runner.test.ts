import { describe, it, expect } from 'vitest';
import {
  extractFindings,
  isOverloadedError,
  sortBySeverityRank,
  foundMessage,
  SEMGREP_SEVERITY_RANK,
  BANDIT_SEVERITY_RANK,
} from './runner';

describe('extractFindings', () => {
  it('parses a well-formed findings block', () => {
    const text = `Some narrated analysis.\n\n<findings>[{"title":"SQL injection","severity":"high"}]</findings>`;

    expect(extractFindings(text)).toEqual({
      findings: [{ title: 'SQL injection', severity: 'high' }],
      parseFailed: false,
    });
  });

  it('returns no findings and no failure when the tags are absent entirely', () => {
    expect(extractFindings('Just narration, no structured output.')).toEqual({
      findings: [],
      parseFailed: false,
    });
  });

  it('flags a parse failure when the block contains invalid JSON', () => {
    const text = `<findings>this is not valid json</findings>`;

    expect(extractFindings(text)).toEqual({ findings: [], parseFailed: true });
  });

  it('tolerates surrounding whitespace inside the tags', () => {
    const text = `<findings>\n  [{"title":"x"}]\n</findings>`;

    expect(extractFindings(text)).toEqual({ findings: [{ title: 'x' }], parseFailed: false });
  });

  it('matches non-greedily when somehow given multiple findings blocks', () => {
    const text = `<findings>[{"title":"first"}]</findings> stray text <findings>[{"title":"second"}]</findings>`;

    expect(extractFindings(text).findings).toEqual([{ title: 'first' }]);
  });
});

describe('isOverloadedError', () => {
  it('detects the structured Anthropic overloaded_error shape', () => {
    expect(isOverloadedError({ error: { error: { type: 'overloaded_error' } } })).toBe(true);
  });

  it('detects overloaded via a plain error message', () => {
    expect(isOverloadedError({ message: 'the API is overloaded right now' })).toBe(true);
  });

  it('returns false for an unrelated error shape', () => {
    expect(isOverloadedError({ error: { error: { type: 'invalid_request_error' } }, message: 'bad request' })).toBe(false);
  });

  it('returns false rather than throwing on null/undefined input', () => {
    expect(isOverloadedError(null)).toBe(false);
    expect(isOverloadedError(undefined)).toBe(false);
  });

  it('returns false for an error with no message and no structured type', () => {
    expect(isOverloadedError({})).toBe(false);
  });
});

describe('sortBySeverityRank', () => {
  it('sorts highest severity first, regardless of input order', () => {
    const findings = [{ sev: 'INFO' }, { sev: 'ERROR' }, { sev: 'WARNING' }];
    const sorted = sortBySeverityRank(findings, f => f.sev, SEMGREP_SEVERITY_RANK);
    expect(sorted.map(f => f.sev)).toEqual(['ERROR', 'WARNING', 'INFO']);
  });

  it('works for Bandit severity levels too', () => {
    const findings = [{ sev: 'LOW' }, { sev: 'HIGH' }, { sev: 'MEDIUM' }];
    const sorted = sortBySeverityRank(findings, f => f.sev, BANDIT_SEVERITY_RANK);
    expect(sorted.map(f => f.sev)).toEqual(['HIGH', 'MEDIUM', 'LOW']);
  });

  it('pushes an unrecognized severity value to the end rather than crashing', () => {
    const findings = [{ sev: 'WHO_KNOWS' }, { sev: 'ERROR' }];
    const sorted = sortBySeverityRank(findings, f => f.sev, SEMGREP_SEVERITY_RANK);
    expect(sorted.map(f => f.sev)).toEqual(['ERROR', 'WHO_KNOWS']);
  });

  it('does not mutate the input array', () => {
    const findings = [{ sev: 'INFO' }, { sev: 'ERROR' }];
    const original = [...findings];
    sortBySeverityRank(findings, f => f.sev, SEMGREP_SEVERITY_RANK);
    expect(findings).toEqual(original);
  });
});

describe('foundMessage', () => {
  it('reports a plain count when under the limit', () => {
    expect(foundMessage('Semgrep', 5, 30, 'issues')).toBe('Semgrep found 5 potential issues.');
  });

  it('flags truncation when over the limit', () => {
    expect(foundMessage('Bandit', 4826, 30, 'issues')).toBe(
      'Bandit found 4826 potential issues — reviewing the 30 highest-severity for deep analysis.'
    );
  });

  it('treats exactly-at-the-limit as not truncated', () => {
    expect(foundMessage('Gitleaks', 20, 20, 'secrets')).toBe('Gitleaks found 20 potential secrets.');
  });
});
