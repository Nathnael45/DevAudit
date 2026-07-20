import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { saveAuth, getToken, getEmail, isLoggedIn, clearAuth, authHeaders, claimAnonymousAudits } from './auth';
import { saveOwnerToken } from './ownerTokens';

beforeEach(() => {
  localStorage.clear();
});

describe('saveAuth / getToken / getEmail', () => {
  it('round-trips a token and email', () => {
    saveAuth('secret-jwt', 'user@example.com');
    expect(getToken()).toBe('secret-jwt');
    expect(getEmail()).toBe('user@example.com');
  });

  it('returns null for both when nothing has been saved', () => {
    expect(getToken()).toBeNull();
    expect(getEmail()).toBeNull();
  });

  it('overwrites a previous session on a new login', () => {
    saveAuth('old-jwt', 'old@example.com');
    saveAuth('new-jwt', 'new@example.com');
    expect(getToken()).toBe('new-jwt');
    expect(getEmail()).toBe('new@example.com');
  });
});

describe('isLoggedIn', () => {
  it('is false with nothing saved', () => {
    expect(isLoggedIn()).toBe(false);
  });

  it('is true once a token is saved', () => {
    saveAuth('secret-jwt', 'user@example.com');
    expect(isLoggedIn()).toBe(true);
  });
});

describe('clearAuth', () => {
  it('removes both the token and the email', () => {
    saveAuth('secret-jwt', 'user@example.com');
    clearAuth();
    expect(getToken()).toBeNull();
    expect(getEmail()).toBeNull();
    expect(isLoggedIn()).toBe(false);
  });
});

describe('authHeaders', () => {
  it('is empty when logged out', () => {
    expect(authHeaders()).toEqual({});
  });

  it('carries a Bearer token when logged in', () => {
    saveAuth('secret-jwt', 'user@example.com');
    expect(authHeaders()).toEqual({ Authorization: 'Bearer secret-jwt' });
  });
});

describe('claimAnonymousAudits', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('does nothing (no network call) when there are no locally-owned audits', async () => {
    const fetchSpy = vi.spyOn(global, 'fetch');
    await claimAnonymousAudits('new-jwt');
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('posts every locally-owned audit to the claim endpoint with the new token', async () => {
    saveOwnerToken('audit-1', 'owner-token-1');
    saveOwnerToken('audit-2', 'owner-token-2');
    const fetchSpy = vi.spyOn(global, 'fetch').mockResolvedValue(new Response('{}', { status: 200 }));

    await claimAnonymousAudits('new-jwt');

    expect(fetchSpy).toHaveBeenCalledTimes(1);
    const [url, options] = fetchSpy.mock.calls[0];
    expect(String(url)).toContain('/api/audits/claim');
    expect(options?.headers).toMatchObject({ Authorization: 'Bearer new-jwt' });
    const body = JSON.parse(options?.body as string);
    expect(body.audits).toEqual(
      expect.arrayContaining([
        { auditId: 'audit-1', ownerToken: 'owner-token-1' },
        { auditId: 'audit-2', ownerToken: 'owner-token-2' },
      ])
    );
  });

  it('does not throw if the claim request fails (best-effort)', async () => {
    saveOwnerToken('audit-1', 'owner-token-1');
    vi.spyOn(global, 'fetch').mockRejectedValue(new Error('network down'));

    await expect(claimAnonymousAudits('new-jwt')).resolves.toBeUndefined();
  });
});

describe('graceful failure when localStorage is unavailable', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('saveAuth does not throw if localStorage.setItem throws', () => {
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => {
      throw new Error('QuotaExceededError');
    });
    expect(() => saveAuth('secret-jwt', 'user@example.com')).not.toThrow();
  });

  it('getToken/getEmail return null (not a throw) if localStorage.getItem throws', () => {
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(getToken()).toBeNull();
    expect(getEmail()).toBeNull();
  });

  it('clearAuth does not throw if localStorage.removeItem throws', () => {
    vi.spyOn(Storage.prototype, 'removeItem').mockImplementation(() => {
      throw new Error('SecurityError');
    });
    expect(() => clearAuth()).not.toThrow();
  });
});
