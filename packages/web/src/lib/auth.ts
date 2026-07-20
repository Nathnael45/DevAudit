// Client-side session state. The JWT is the only thing the server actually
// trusts (sent as a Bearer token); the email is cached here purely for
// display — the server never returns it, so we capture it from the login/
// register form at the moment it's typed.

import { getAllOwnedAudits } from './ownerTokens';
import { getApiUrl } from './apiUrl';

const TOKEN_KEY = 'devaudit_jwt';
const EMAIL_KEY = 'devaudit_email';

export function saveAuth(token: string, email: string) {
  try {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(EMAIL_KEY, email);
  } catch { /* localStorage unavailable (private mode, etc.) — session is simply lost */ }
}

export function getToken(): string | null {
  try {
    return localStorage.getItem(TOKEN_KEY);
  } catch {
    return null;
  }
}

export function getEmail(): string | null {
  try {
    return localStorage.getItem(EMAIL_KEY);
  } catch {
    return null;
  }
}

export function isLoggedIn(): boolean {
  return getToken() !== null;
}

export function clearAuth() {
  try {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EMAIL_KEY);
  } catch { /* ignore */ }
}

// Spread into a fetch() headers object — empty when logged out, so callers
// don't need an if/else at every call site.
export function authHeaders(): Record<string, string> {
  const token = getToken();
  return token ? { Authorization: `Bearer ${token}` } : {};
}

// Call right after login/register succeeds: attaches every audit this browser
// holds an owner token for to the new session. Best-effort — a failure here
// shouldn't block the login itself, it just means those audits stay anonymous.
export async function claimAnonymousAudits(token: string): Promise<void> {
  const owned = getAllOwnedAudits();
  if (owned.length === 0) return;

  try {
    await fetch(`${getApiUrl()}/api/audits/claim`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
      body: JSON.stringify({
        audits: owned.map(({ auditId, token: ownerToken }) => ({ auditId, ownerToken })),
      }),
    });
  } catch { /* best-effort */ }
}
