import { describe, it, expect } from 'vitest';
import { extractFindings, isOverloadedError } from './runner';

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
