import { db } from './utils/db';

const RETENTION_DAYS = 30;

export async function runCleanup() {
  const result = await db.query(
    `DELETE FROM audits
     WHERE created_at < NOW() - INTERVAL '${RETENTION_DAYS} days'
     RETURNING id`
  );
  if (result.rowCount && result.rowCount > 0) {
    console.log(`[cleanup] deleted ${result.rowCount} audits older than ${RETENTION_DAYS} days`);
  }
}
