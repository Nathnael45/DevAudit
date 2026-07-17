import { Router } from 'express';
import crypto from 'crypto';
import { broadcast } from '../ws/hub';

export const internalRouter = Router();

// The API's HTTP port is reachable from outside the docker network (the browser
// needs it too), so this route can't rely on network placement alone — anyone who
// could reach it would otherwise be able to inject fake findings/events into a
// live audit stream. Require a secret shared with the worker instead.
const INTERNAL_SECRET = process.env.INTERNAL_SECRET;

internalRouter.post('/broadcast', (req, res) => {
  const provided = Buffer.from(req.header('X-Internal-Secret') ?? '');
  const expected = Buffer.from(INTERNAL_SECRET ?? '');
  if (!INTERNAL_SECRET || provided.length !== expected.length || !crypto.timingSafeEqual(provided, expected)) {
    res.status(401).json({ error: 'Unauthorized' });
    return;
  }

  const { auditId, ...event } = req.body;
  if (!auditId) { res.status(400).json({ error: 'Missing auditId' }); return; }
  broadcast(auditId, event);
  res.status(204).end();
});
