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

// Max 50 audits per IP per hour
const auditLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 50,
  message: { error: 'Too many audits from this IP, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: isLocalhost,
});

// Max 300 general requests per IP per minute
const generalLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 300,
  standardHeaders: true,
  legacyHeaders: false,
  skip: isLocalhost,
});

app.use(generalLimiter);
app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', authRouter);
app.use('/api/audits', auditLimiter, auditRouter);
app.use('/api/reports', reportsRouter);
app.use('/internal', internalRouter);

export default app;