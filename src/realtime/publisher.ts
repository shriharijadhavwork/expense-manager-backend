import type { RealtimeAdapter, RealtimeEvent } from "./types.js";

const adapters = new Set<RealtimeAdapter>();

export const realtimePublisher = {
  register(adapter: RealtimeAdapter): void {
    adapters.add(adapter);
  },

  unregister(adapter: RealtimeAdapter): void {
    adapters.delete(adapter);
  },

  clear(): void {
    adapters.clear();
  },

  async publish(event: RealtimeEvent): Promise<void> {
    const tasks: Promise<void>[] = [];

    for (const adapter of adapters) {
      try {
        const result = adapter.publish(event);
        if (result !== undefined) {
          tasks.push(
            Promise.resolve(result).catch((error: unknown) => {
              console.error(
                `[realtime] adapter=${adapter.name} failed to publish ${event.type}`,
                error,
              );
            }),
          );
        }
      } catch (error) {
        console.error(
          `[realtime] adapter=${adapter.name} failed to publish ${event.type}`,
          error,
        );
      }
    }

    if (tasks.length > 0) {
      await Promise.all(tasks);
    }
  },
};

/** Test / default adapter that records events and does not require Socket.IO. */
export function createNoopRealtimeAdapter(options?: {
  onPublish?: (event: RealtimeEvent) => void;
}): RealtimeAdapter {
  return {
    name: "noop",
    publish(event) {
      options?.onPublish?.(event);
    },
  };
}
