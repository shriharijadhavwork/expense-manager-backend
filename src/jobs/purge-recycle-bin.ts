import { getRecycleBinCutoffDate } from "../config/thread.constants.js";
import { Thread } from "../models/thread.model.js";

/**
 * Permanently removes soft-deleted threads older than the recycle retention window.
 * Wire this to a cron / scheduled worker in production (not auto-run on boot).
 */
export async function purgeExpiredRecycleBinThreads(
  now = new Date(),
): Promise<number> {
  const cutoff = getRecycleBinCutoffDate(now);

  const result = await Thread.deleteMany({
    deletedAt: { $ne: null, $lt: cutoff },
  }).exec();

  return result.deletedCount ?? 0;
}
