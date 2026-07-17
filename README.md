# DevAudit

[![CI](https://github.com/Nathnael45/DevAudit/actions/workflows/ci.yml/badge.svg)](https://github.com/Nathnael45/DevAudit/actions/workflows/ci.yml)

**Autonomous AI security auditing agent for GitHub repositories.**

Drop a GitHub URL and watch the AI clone the repo, run static analysis, and reason through vulnerabilities in real time — streaming every thought to your browser as it works.

🔗 **Live demo:** [http://3.238.180.25:3000](http://3.238.180.25:3000)

### Sample reports

| Repository | Report | Notes |
|------------|--------|-------|
| [mitmproxy/mitmproxy](https://github.com/mitmproxy/mitmproxy) | [View report](http://3.238.180.25:3000/report/2268138a) | 9 confirmed findings |
| [sherlock-project/sherlock](https://github.com/sherlock-project/sherlock) | [View report](http://3.238.180.25:3000/report/c5f0333e) | 56 raw scanner hits triaged down to 0 real findings |
| [OWASP/WebGoat](https://github.com/WebGoat/WebGoat) | [View report](http://3.238.180.25:3000/report/a86360c1) | 17 Gitleaks hits correctly identified as test fixtures/minified JS, not real leaks |

---

## What it does

1. **Clones** the target repo (shallow clone, latest commit only)
2. **Scans** with three static analysis tools in parallel:
   - [Semgrep](https://semgrep.dev) — language-agnostic vulnerability patterns (SQL injection, XSS, insecure APIs)
   - [Bandit](https://bandit.readthedocs.io) — Python-specific security linter
   - [Gitleaks](https://gitleaks.io) — secrets and credential scanner
3. **Reasons** with Claude (claude-sonnet-5 with adaptive thinking) — evaluates each finding, filters false positives, assigns severity, writes fix recommendations
4. **Streams** every token of AI reasoning live to the browser over WebSocket
5. **Generates** a shareable public report URL with full findings grouped by severity

---

## Architecture

```
Browser
  │
  ├── Next.js (port 3000)
  │     └── WebSocket client → live thought log + findings panel
  │
  └── Express API (port 3001)
        ├── POST /api/audits     → enqueue job
        ├── GET  /api/audits/:id → poll status + events
        ├── GET  /api/reports/:slug → shareable report
        └── WebSocket /ws        → push events to browser
              ↑
        BullMQ + Redis (job queue)
              ↓
        Worker Process
              ├── git clone
              ├── Semgrep + Bandit + Gitleaks (parallel)
              ├── Claude API (streaming)
              └── PostgreSQL (persist events + findings)
```

---

## Tech stack

| Layer | Tech |
|-------|------|
| Frontend | Next.js 14, Tailwind CSS, WebSocket |
| API | Express, BullMQ, WebSocket (ws) |
| Agent worker | Node.js, Anthropic SDK (claude-sonnet-5) |
| Static analysis | Semgrep, Bandit, Gitleaks |
| Queue | BullMQ + Redis |
| Database | PostgreSQL |
| Deployment | Docker Compose, AWS EC2 |

---

## Running locally

**Prerequisites:** Docker + Docker Compose

```bash
git clone https://github.com/Nathnael45/DevAudit.git
cd DevAudit
cp .env.example .env
# Fill in ANTHROPIC_API_KEY, JWT_SECRET, INTERNAL_SECRET, and POSTGRES_PASSWORD in .env
docker-compose up --build
```

Open [http://localhost:3000](http://localhost:3000).

**Generate a secret** (for `JWT_SECRET` and `INTERNAL_SECRET`):
```bash
openssl rand -base64 32
```

Postgres and Redis are not published to the host — only `api`/`worker` need to reach
them, over the docker network. If you run `api`/`worker`/`web` natively via the root
`npm run dev` script instead of the full compose stack, add a git-ignored
`docker-compose.override.yml` that republishes `5432`/`6379` for your machine.

**Upgrading an existing deployment** (verified against a real local volume that
predated these changes — both steps were needed, not just the first one people
usually remember):

1. The `audits` table gained an `owner_token_hash` column (used to authorize audit
   cancel/delete without requiring an account). `docker-entrypoint-initdb.d` only
   runs on a fresh volume, so it won't apply automatically:
   ```bash
   docker compose exec postgres psql -U devaudit -d devaudit \
     -c "ALTER TABLE audits ADD COLUMN IF NOT EXISTS owner_token_hash TEXT;"
   ```
   It also gained a `timings` column (per-phase clone/scan/AI durations, used to
   back up the performance numbers below with real measurements instead of
   config constants):
   ```bash
   docker compose exec postgres psql -U devaudit -d devaudit \
     -c "ALTER TABLE audits ADD COLUMN IF NOT EXISTS timings JSONB;"
   ```
2. If your volume predates `POSTGRES_PASSWORD` being required (i.e. it was
   initialized with the old hardcoded `devaudit`/`devaudit` credential), Postgres
   keeps that password on disk — setting a new `POSTGRES_PASSWORD` in `.env` alone
   won't rotate it, and `api`/`worker` will fail to connect. Update it to match:
   ```bash
   docker compose exec -e PGPASSWORD=devaudit postgres psql -U devaudit -d devaudit \
     -c "ALTER USER devaudit WITH PASSWORD '<value of POSTGRES_PASSWORD in .env>';"
   docker compose restart api worker
   ```

---

## Environment variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `JWT_SECRET` | Random secret for JWT signing |
| `INTERNAL_SECRET` | Random secret shared by api/worker, required on `POST /internal/broadcast` |
| `POSTGRES_PASSWORD` | Postgres password (also used to build `DATABASE_URL`) |
| `DATABASE_URL` | PostgreSQL connection string |
| `REDIS_URL` | Redis connection string |
| `NEXT_PUBLIC_API_URL` | API base URL (browser-facing) |
| `NEXT_PUBLIC_WS_URL` | WebSocket base URL (browser-facing) |
| `INTERNAL_API_URL` | API base URL (server-side, uses Docker hostname) |

---

## Key design decisions

**Observable agent loop** — the core differentiator. Rather than returning a finished report, every step of the AI's reasoning streams live to the browser. Users watch the agent think ("Semgrep found 3 issues → analyzing for false positives → confirmed SQL injection at line 47").

**HTTP broadcast over persistent WebSocket** — the worker pushes events to the API via HTTP POST (`/internal/broadcast`) rather than maintaining a persistent WebSocket connection, which proved unreliable across Docker networks. The API then fans out to browser clients.

**Batched streaming** — Claude token deltas are buffered (300ms or 200 chars) before broadcasting to avoid flooding the HTTP broadcast endpoint with hundreds of tiny requests per second.

**Shallow clone** — `git clone --depth 1` keeps clone times under 10 seconds for most repos and avoids storing full git history on disk.

**Ownership without accounts** — most audits are started anonymously, but people still need to cancel or delete the ones they kicked off. Each audit gets a random owner token at creation time (returned once, held client-side); cancel/delete require that token or a matching authenticated `user_id`. `GET /api/audits/recent` and shareable reports stay public, but only the creator can mutate their own audit.

**Shared secret on the internal broadcast route** — the worker pushes events to the browser via `POST /internal/broadcast` on the API, but the API's port is reachable from outside the docker network too (the browser talks to it directly). That route requires an `INTERNAL_SECRET` header rather than trusting network placement alone.

**Per-phase timing, not just config constants** — each audit records clone/scan/AI durations (`audits.timings`), with each of the three scanners timed individually even though they run concurrently. That's what makes it possible to state an honest parallelism payoff (parallel wall-clock vs. the sum of the three durations run serially) instead of just describing the setting (`concurrency: 3`) and assuming it helped.
