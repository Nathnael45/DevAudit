import { Router } from 'express';
import { broadcast } from '../ws/hub';

export const internalRouter = Router();

// Worker calls this to push events to browser clients
// Only accessible within the docker network (no auth needed — not exposed externally)
internalRouter.post('/broadcast', (req, res) => {
  const { auditId, ...event } = req.body;
  if (!auditId) { res.status(400).json({ error: 'Missing auditId' }); return; }
  broadcast(auditId, event);
  res.status(204).end();
});
