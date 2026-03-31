import { Queue, Worker, QueueEvents } from 'bullmq';
import IORedis from 'ioredis';

const connection = new IORedis(process.env.REDIS_URL || 'redis://localhost:6379', {
  maxRetriesPerRequest: null,
});

export const auditQueue = new Queue('audits', { connection });
export const auditQueueEvents = new QueueEvents('audits', { connection });

export interface AuditJobData {
  auditId: string;
  repoUrl: string;
  userId?: string;
}

export async function enqueueAudit(data: AuditJobData) {
  const job = await auditQueue.add('run-audit', data, {
    attempts: 1,
    removeOnComplete: 100,
    removeOnFail: 50,
  });
  return job.id;
}
