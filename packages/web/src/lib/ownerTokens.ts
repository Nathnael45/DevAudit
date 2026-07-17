// Tracks which audits this browser created, so it can cancel/delete them later
// without requiring an account. Server only accepts the token that matched at
// creation time (see POST /api/audits) — this is just where we stash our copy.

function key(auditId: string) {
  return `devaudit_owner_${auditId}`;
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
