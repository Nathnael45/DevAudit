const API_URL = process.env.API_URL || 'http://localhost:3001';
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || '';

// Fire-and-forget: callers don't await this. The promise is returned only so
// tests can wait for it; it never rejects.
export function emit(auditId: string, type: string, payload: object): Promise<void> {
  return fetch(`${API_URL}/internal/broadcast`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': INTERNAL_SECRET },
    body: JSON.stringify({ auditId, type, ...payload }),
  })
    .then((res) => {
      // fetch resolves on 4xx/5xx, so a rejected broadcast (wrong INTERNAL_SECRET,
      // a rate limit) would otherwise leave the live stream empty with no log line.
      if (!res.ok) console.warn(`[broadcaster] ${type} rejected: HTTP ${res.status}`);
    })
    .catch((err) => console.warn('[broadcaster] failed to emit:', err.message));
}
