export type CappedMessageBatch<T extends { id: string }> = {
  batch: T[];
  truncated: boolean;
  totalCount: number;
  droppedCount: number;
};

export function capMessageBatch<T extends { id: string }>(
  messages: T[],
  max: number,
): CappedMessageBatch<T> {
  if (max < 1) {
    throw new Error("max batch size must be at least 1");
  }

  const batch = messages.slice(0, max);

  return {
    batch,
    truncated: messages.length > max,
    totalCount: messages.length,
    droppedCount: Math.max(0, messages.length - max),
  };
}
