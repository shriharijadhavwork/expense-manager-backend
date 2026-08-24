export const RECYCLE_BIN_RETENTION_DAYS = 7;

export function getRecycleBinCutoffDate(now = new Date()): Date {
  const cutoff = new Date(now);
  cutoff.setDate(cutoff.getDate() - RECYCLE_BIN_RETENTION_DAYS);
  return cutoff;
}
