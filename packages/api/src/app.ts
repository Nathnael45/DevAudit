import express from 'express';
import cors from 'cors';
import rateLimit from 'express-rate-limit';
import { auditRouter } from './routes/audit';
import { reportsRouter } from './routes/reports';
import { authRouter } from './routes/auth';
import { internalRouter } from './routes/internal';

const app = express();

// Behind Cloudflare Tunnel every request reaches us over cloudflared's
// connection, so without this req.ip is the tunnel's address — every visitor
// shares one rate-limit bucket. TRUST_PROXY is the number of proxy hops to
// trust in X-Forwarded-For (1 for Cloudflare Tunnel). Left off by default:
// with no proxy in front, trusting X-Forwarded-For would let any client pick
// its own IP (including 127.0.0.1, which skips the limiter entirely).
const trustProxyHops = Number(process.env.TRUST_PROXY);
if (Number.isInteger(trustProxyHops) && trustProxyHops > 0) {
  app.set('trust proxy', trustProxyHops);
}

// Restrict to the actual frontend origin rather than '*' — audits can carry an
// Authorization bearer token, and a wildcard origin means any site's JS could
// read authenticated responses if a token ever ended up somewhere a browser
// would send it automatically. WEB_URL must match wherever the web app is
// actually served (see docker-compose.yml / .env.example).
app.use(cors({ origin: process.env.WEB_URL || 'http://localhost:3000' }));
app.use(express.json());

const isLocalhost = (req: express.Request) =>
  req.ip === '127.0.0.1' || req.ip === '::1' || req.ip === '::ffff:127.0.0.1';

// Max 10 audit submissions per IP per hour. This is the fairness limit: it has
// to sit well below the site-wide DAILY_AUDIT_CAP (50/24h, routes/audit.ts),
// or one visitor could use up the whole day's budget and lock everyone else
// out. The daily cap is the spend backstop for clients spread across many IPs.
const auditLimiter = rateLimit({
  windowMs: 60 * 60 * 1000,
  max: 10,
  message: { error: 'Too many audits from this IP, please try again later.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: isLocalhost,
});

// Login and registration: 10 attempts per IP per 15 minutes. Without a limit,
// passwords can be guessed as fast as requests can be sent, and accounts can be
// created in bulk. Counts every attempt (not just failures) so it also caps
// sign-up spam; a real person rarely needs more than a few tries.
const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message: { error: 'Too many sign-in attempts. Please try again in 15 minutes.' },
  standardHeaders: true,
  legacyHeaders: false,
  skip: isLocalhost,
});

app.get('/health', (_req, res) => res.json({ status: 'ok' }));
app.use('/api/auth', authLimiter, authRouter);
app.post('/api/audits', auditLimiter);
app.use('/api/audits', auditRouter);
app.use('/api/reports', reportsRouter);
app.use('/internal', internalRouter);

export default app;
