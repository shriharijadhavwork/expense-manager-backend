const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_PER_WINDOW = 40;

type JoinThrottleOptions = {
  windowMs?: number;
  maxPerWindow?: number;
  enabled?: boolean;
};

type Bucket = {
  windowStart: number;
  count: number;
};

export class JoinThrottle {
  private readonly windowMs: number;
  private readonly maxPerWindow: number;
  private readonly enabled: boolean;
  private readonly buckets = new Map<string, Bucket>();

  constructor(options: JoinThrottleOptions = {}) {
    this.windowMs = options.windowMs ?? DEFAULT_WINDOW_MS;
    this.maxPerWindow = options.maxPerWindow ?? DEFAULT_MAX_PER_WINDOW;
    this.enabled = options.enabled ?? process.env["NODE_ENV"] !== "test";
  }

  tryConsume(socketId: string): boolean {
    if (!this.enabled) {
      return true;
    }

    const now = Date.now();
    const bucket = this.buckets.get(socketId);

    if (!bucket || now - bucket.windowStart >= this.windowMs) {
      this.buckets.set(socketId, { windowStart: now, count: 1 });
      return true;
    }

    if (bucket.count >= this.maxPerWindow) {
      return false;
    }

    bucket.count += 1;
    return true;
  }

  clear(socketId: string): void {
    this.buckets.delete(socketId);
  }
}
