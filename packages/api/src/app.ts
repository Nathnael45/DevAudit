import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { auditRouter } from './routes/audit';
import { reportsRouter } from './routes/reports';
import { authRouter } from './routes/auth';
import { internalRouter } from './routes/internal';

const app = express();

app.use(cors({ origin: '*' }));
app.use(express.json());

const isLocalhost = (req: express.Request) =>
  req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1';

// Max 100 audit submissions per IP per hour
const auditLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 100,
  message: { error: 'Too many audits from this IP, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: isLocalhost,
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', authRouter);
app.post('/api/audits', auditLimiter);
app.use('/api/audits', auditRouter);
app.use('/api/reports', reportsRouter);
app.use('/internal', internalRouter);

export default app;
