# Deployment notes

Operational reference for running/upgrading a DevAudit deployment. Not needed to evaluate
the project — see the main [README](README.md) for that.

## Upgrading an existing deployment

Verified against a real local volume that predated these changes — all four steps were
needed, not just the first one people usually remember.

1. The `audits` table gained an `owner_token_hash` column (used to authorize audit
   cancel/delete without requiring an account). `docker-entrypoint-initdb.d` only
   runs on a fresh volume, so it won't apply automatically:
   ```bash
   docker compose exec postgres psql -U devaudit -d devaudit \
     -c "ALTER TABLE audits ADD COLUMN IF NOT EXISTS owner_token_hash TEXT;"
   ```
   It also gained a `timings` column (per-phase clone/scan/AI durations, used to
   back up the performance numbers in the README with real measurements instead of
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
3. **CORS is now restricted to `WEB_URL` instead of allowing any origin.** If
   `.env` doesn't set `WEB_URL` to wherever the web app is actually reachable
   (e.g. `https://your-domain.com`), it defaults to `http://localhost:3000`
   — meaning the real frontend will suddenly get CORS errors calling the API
   until you set it correctly and run `docker compose up -d api`.
4. **The frontend no longer hardcodes `${hostname}:3001`** — it now reads
   `NEXT_PUBLIC_API_URL`/`NEXT_PUBLIC_WS_URL`, baked in at *build* time (not
   read at container runtime, so `docker compose up -d` alone won't pick up a
   change — needs `--build`). **Check `.env` on the server before
   redeploying**: if either var is set to something stale (e.g. a leftover
   `YOUR_EC2_IP` placeholder), that broken value gets permanently baked into
   the bundle. Leaving both blank is almost always what you want — it
   preserves the automatic same-host detection that lets the demo survive an
   IP change without a rebuild.

## Cloudflare Tunnel notes

The production deployment terminates HTTPS via a Cloudflare Tunnel rather than exposing
ports directly — see the README's "Known limitations" and "Key design decisions" for
the reasoning. One gotcha specific to DNS setup: Cloudflare's free Universal SSL
certificate only covers the bare domain plus one level of wildcard, so any hostname
must stay one level deep (`foo.yourdomain.com`, not `foo.bar.yourdomain.com`) or the
TLS handshake fails before the tunnel ever sees the request.
