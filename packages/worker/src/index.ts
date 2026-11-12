import 'dotenv/config';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { runAudit } from './agent/runner';
import { runCleanup } from './cleanup';
import { clearReposDir } from './scanner/gitClone';

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

async function start() {
  // Remove clones left behind by a crash or restart mid-audit — before taking
  // any job, so nothing in the directory can belong to a live audit.
  const removed = await clearReposDir();
  if (removed) console.log(`[worker] removed ${removed} leftover clone(s) from a previous run`);

  const worker = new Worker(
    'audits',
    async (job) => {
      const { auditId, repoUrl } = job.data;
      console.log(`[worker] starting audit ${auditId} for ${repoUrl}`);
      await runAudit({ auditId, repoUrl });
    },
    {
      connection,
      concurrency: 3,
      // Not a cap on job length: the worker renews the lock while it's alive.
      // It's how long a crashed worker's job sits before BullMQ re-queues it.
      lockDuration: 10 * 60 * 1000,
    }
  );

  worker.on('completed', (job) => console.log(`[worker] job ${job.id} completed`));
  worker.on('failed', (job, err) => console.error(`[worker] job ${job?.id} failed:`, err));

  console.log('[worker] listening for audit jobs...');
}

start().catch((err) => {
  console.error('[worker] failed to start:', err);
  process.exit(1);
});

// Run cleanup on startup then every 24 hours
runCleanup();
setInterval(runCleanup, 24 * 60 * 60 * 1000);
