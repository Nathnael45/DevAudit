import 'dotenv/config';
import { Worker } from 'bullmq';
import IORedis from 'ioredis';
import { runAudit } from './agent/runner';
import { runCleanup } from './cleanup';

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

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
    lockDuration: 10 * 60 * 1000, // 10 min max per job
  }
);

worker.on('completed', (job) => console.log(`[worker] job ${job.id} completed`));
worker.on('failed', (job, err) => console.error(`[worker] job ${job?.id} failed:`, err));

console.log('[worker] listening for audit jobs...');

// Run cleanup on startup then every 24 hours
runCleanup();
setInterval(runCleanup, 24 * 60 * 60 * 1000);
