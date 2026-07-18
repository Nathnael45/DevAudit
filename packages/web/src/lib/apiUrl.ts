// NEXT_PUBLIC_API_URL/NEXT_PUBLIC_WS_URL are inlined at build time (see
// Dockerfile), so when unset they fall back to same-host-different-port —
// which only works when api and web share a hostname (e.g. one EC2 box).
// Deploying api/web to separate hosts requires setting these explicitly.
export function getApiUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  if (typeof window === 'undefined') return 'http://localhost:3001';
  return `${window.location.protocol}//${window.location.hostname}:3001`;
}

export function getWsUrl(): string {
  if (process.env.NEXT_PUBLIC_WS_URL) return process.env.NEXT_PUBLIC_WS_URL;
  if (typeof window === 'undefined') return 'ws://localhost:3001';
  return `ws://${window.location.hostname}:3001`;
}
