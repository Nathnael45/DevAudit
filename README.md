# DevAudit

**Autonomous AI security auditing agent for GitHub repositories.**

Drop a GitHub URL and watch the AI clone the repo, run static analysis, and reason through vulnerabilities in real time — streaming every thought to your browser as it works.

🔗 **Live demo:** [http://34.239.164.89:3000](http://34.239.164.89:3000)

### Sample reports

| Repository | Report |
|------------|--------|
| [mitmproxy/mitmproxy](https://github.com/mitmproxy/mitmproxy) | [View report](http://34.239.164.89:3000/report/26b9a3ba) |
| [sherlock-project/sherlock](https://github.com/sherlock-project/sherlock) | [View report](http://34.239.164.89:3000/report/b8f2d882) |
| [OWASP/WebGoat](https://github.com/WebGoat/WebGoat) | [View report](http://34.239.164.89:3000/report/6a1f4bad) |

---

## What it does

1. **Clones** the target repo (shallow clone, latest commit only)
2. **Scans** with three static analysis tools in parallel:
   - [Semgrep](https://semgrep.dev) — language-agnostic vulnerability patterns (SQL injection, XSS, insecure APIs)
   - [Bandit](https://bandit.readthedocs.io) — Python-specific security linter
   - [Gitleaks](https://gitleaks.io) — secrets and credential scanner
3. **Reasons** with Claude (claude-opus-4-6 with adaptive thinking) — evaluates each finding, filters false positives, assigns severity, writes fix recommendations
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
| Agent worker | Node.js, Anthropic SDK (claude-opus-4-6) |
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
# Fill in ANTHROPIC_API_KEY and JWT_SECRET in .env
docker-compose up --build
```

Open [http://localhost:3000](http://localhost:3000).

**Generate a JWT secret:**
```bash
openssl rand -base64 32
```

---

## Environment variables

| Variable | Description |
|----------|-------------|
| `ANTHROPIC_API_KEY` | Anthropic API key |
| `JWT_SECRET` | Random secret for JWT signing |
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
