/** Soft-deleted threads remain restorable for this many days, then may be purged. */
export const RECYCLE_BIN_RETENTION_DAYS = 7;

export function getRecycleBinCutoffDate(now = new Date()): Date {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - RECYCLE_BIN_RETENTION_DAYS);
  return cutoff;
}

/**
 * Purge is not scheduled in-process. Call `purgeExpiredRecycleBinThreads`
 * from `src/jobs/purge-recycle-bin.ts` via cron when ready.
 */
