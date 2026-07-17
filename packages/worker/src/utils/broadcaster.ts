const API_URL = process.env.API_URL || 'http://localhost:3001';
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || '';

export function emit(auditId: string, type: string, payload: object) {
  fetch(`${API_URL}/internal/broadcast`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Internal-Secret': INTERNAL_SECRET },
    body: JSON.stringify({ auditId, type, ...payload }),
  }).catch((err) => console.warn('[broadcaster] failed to emit:', err.message));
}
