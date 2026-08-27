import { Thread } from "../models/thread.model.js";
import { getDayKey } from "../utils/thread-title.js";

type LegacyThreadLean = {
  _id: { toString(): string };
  userId?: { toString(): string } | null;
  createdBy?: { toString(): string } | null;
  type?: string;
  dayKey?: string;
  sequence?: number;
  createdAt: Date;
};

/**
 * Idempotent backfill for Batch 4 thread fields on legacy personal threads.
 * Assigns type/createdBy/groupId, then dayKey (UTC from createdAt) + sequence
 * per (userId, dayKey) ordered by createdAt.
 */
export async function backfillThreadModelBatch4(): Promise<number> {
  const legacy = await Thread.find({
    $or: [
      { type: { $exists: false } },
      { createdBy: { $exists: false } },
      { dayKey: { $exists: false } },
      { sequence: { $exists: false } },
      { type: null },
      { createdBy: null },
      { dayKey: null },
      { sequence: null },
    ],
  })
    .sort({ userId: 1, createdAt: 1, _id: 1 })
    .lean<LegacyThreadLean[]>()
    .exec();

  if (legacy.length === 0) {
    return 0;
  }

  const sequenceCounters = new Map<string, number>();
  let updated = 0;

  for (const thread of legacy) {
    if (!thread.userId) {
      continue;
    }

    const userId = thread.userId.toString();
    const dayKey =
      thread.dayKey && /^\d{4}-\d{2}-\d{2}$/.test(thread.dayKey)
        ? thread.dayKey
        : getDayKey(thread.createdAt, "UTC");

    const counterKey = `${userId}:${dayKey}`;
    const nextSequence =
      typeof thread.sequence === "number" && thread.sequence >= 1
        ? thread.sequence
        : (sequenceCounters.get(counterKey) ?? 0) + 1;

    sequenceCounters.set(
      counterKey,
      Math.max(sequenceCounters.get(counterKey) ?? 0, nextSequence),
    );

    await Thread.updateOne(
      { _id: thread._id },
      {
        $set: {
          type: "personal",
          groupId: null,
          createdBy: thread.createdBy ?? thread.userId,
          dayKey,
          sequence: nextSequence,
        },
      },
    ).exec();

    updated += 1;
  }

  return updated;
}
