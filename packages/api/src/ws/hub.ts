import { WebSocketServer, WebSocket } from 'ws';
import http from 'http';

// Map of auditId -> set of connected browser clients
const rooms = new Map<string, Set<WebSocket>>();

export function setupWebSocket(server: http.Server) {
  // Browser clients subscribe here: /ws?auditId=xxx
  const clientWss = new WebSocketServer({
    server,
    path: '/ws',
    // Allow all origins — WS doesn't use CORS the same way HTTP does
    handleProtocols: () => false,
    verifyClient: () => true,
  });

  clientWss.on('connection', (ws, req) => {
    const auditId = new URL(req.url!, `http://localhost`).searchParams.get('auditId');
    if (!auditId) { ws.close(1008, 'Missing auditId'); return; }

    if (!rooms.has(auditId)) rooms.set(auditId, new Set());
    rooms.get(auditId)!.add(ws);

    console.log(`[hub] browser connected for audit ${auditId}`);

    ws.on('close', () => {
      rooms.get(auditId)?.delete(ws);
      if (rooms.get(auditId)?.size === 0) rooms.delete(auditId);
    });
  });

  console.log('WebSocket hub ready at /ws');
}

export function broadcast(auditId: string, event: object) {
  const clients = rooms.get(auditId);
  if (!clients) return;
  const payload = JSON.stringify(event);
  for (const ws of clients) {
    if (ws.readyState === WebSocket.OPEN) ws.send(payload);
  }
}
