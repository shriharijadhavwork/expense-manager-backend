/** Soft-deleted threads remain restorable for this many days, then may be purged. */
export const RECYCLE_BIN_RETENTION_DAYS = 7;

/** User messages are accepted only within this window from thread creation. */
export const THREAD_MESSAGE_WINDOW_HOURS = 24;

export const THREAD_MESSAGE_WINDOW_MS =
  THREAD_MESSAGE_WINDOW_HOURS * 60 * 60 * 1000;

/** Maximum user-authored messages per thread (assistant/system/tool excluded). */
export const THREAD_MAX_USER_MESSAGES = 100;

export function getRecycleBinCutoffDate(now = new Date()): Date {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - RECYCLE_BIN_RETENTION_DAYS);
  return cutoff;
}

export function computeMessageWindowEndsAt(
  threadCreatedAt: Date,
): Date {
  return new Date(threadCreatedAt.getTime() + THREAD_MESSAGE_WINDOW_MS);
}

/**
 * Purge is not scheduled in-process. Call `purgeExpiredRecycleBinThreads`
 * from `src/jobs/purge-recycle-bin.ts` via cron when ready.
 */
