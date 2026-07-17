import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { saveOwnerToken, getOwnerToken, clearOwnerToken } from './ownerTokens';

beforeEach(() => {
  localStorage.clear();
});

describe('saveOwnerToken / getOwnerToken', () => {
  it('round-trips a token for a given audit id', () => {
    saveOwnerToken('audit-1', 'secret-token');
    expect(getOwnerToken('audit-1')).toBe('secret-token');
  });

  it('returns null when nothing has been saved for that id', () => {
    expect(getOwnerToken('never-saved')).toBeNull();
  });

  it('keeps tokens for different audit ids from colliding', () => {
    saveOwnerToken('audit-1', 'token-1');
    saveOwnerToken('audit-2', 'token-2');

    expect(getOwnerToken('audit-1')).toBe('token-1');
    expect(getOwnerToken('audit-2')).toBe('token-2');
  });

  it('overwrites a previous token for the same audit id', () => {
    saveOwnerToken('audit-1', 'old-token');
    saveOwnerToken('audit-1', 'new-token');
    expect(getOwnerToken('audit-1')).toBe('new-token');
  });
});

describe('clearOwnerToken', () => {
  it('removes a stored token', () => {
    saveOwnerToken('audit-1', 'secret-token');
    clearOwnerToken('audit-1');
    expect(getOwnerToken('audit-1')).toBeNull();
  });

  it('does nothing (and does not throw) when there was nothing to clear', () => {
    expect(() => clearOwnerToken('never-saved')).not.toThrow();
  });
});

describe('graceful failure when localStorage is unavailable', () => {
  // Private browsing mode, storage quota exceeded, etc. can make these throw —
  // the module is written to swallow that rather than crash the page.
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('saveOwnerToken does not throw if localStorage.setItem throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });

    expect(() => saveOwnerToken('audit-1', 'secret-token')).not.toThrow();
  });

  it('getOwnerToken returns null (not a throw) if localStorage.getItem throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });

    expect(getOwnerToken('audit-1')).toBeNull();
  });

  it('clearOwnerToken does not throw if localStorage.removeItem throws', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });

    expect(() => clearOwnerToken('audit-1')).not.toThrow();
  });
});
