// Tracks which audits this browser created, so it can cancel/delete them later
// without requiring an account. Server only accepts the token that matched at
// creation time (see POST /api/audits) — this is just where we stash our copy.
//
// There's no separate "history" store — the set of owner-token keys already
// present in localStorage *is* the local history (every audit this browser
// has ever created and hasn't deleted). getAllOwnedAudits() below is what
// both the anonymous "My Audits" view and the post-login claim flow read.

const PREFIX = 'devaudit_owner_';

function key(auditId: string) {
  return `${PREFIX}${auditId}`;
}

export function saveOwnerToken(auditId: string, token: string) {
  try {
    localStorage.setItem(key(auditId), token);
  } catch { /* localStorage unavailable (private mode, etc.) — token is simply lost */ }
}

export function getOwnerToken(auditId: string): string | null {
  try {
    return localStorage.getItem(key(auditId));
  } catch {
    return null;
  }
}

export function clearOwnerToken(auditId: string) {
  try {
    localStorage.removeItem(key(auditId));
  } catch { /* ignore */ }
}

export function getAllOwnedAudits(): { auditId: string; token: string }[] {
  const owned: { auditId: string; token: string }[] = [];
  try {
    for (let i = 0; i < localStorage.length; i++) {
      const storageKey = localStorage.key(i);
      if (!storageKey?.startsWith(PREFIX)) continue;
      const token = localStorage.getItem(storageKey);
      if (token) owned.push({ auditId: storageKey.slice(PREFIX.length), token });
    }
  } catch { /* localStorage unavailable — no local history to report */ }
  return owned;
}
