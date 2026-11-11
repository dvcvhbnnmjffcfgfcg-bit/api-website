/**
 * Sliding-window rate limiter backed by Redis (ioredis).
 * Falls back to an in-memory sliding window when Redis is unreachable.
 *
 * Window: 24h. One logical window per user keyed by UTC date.
 * Implementation: Redis list `rl:{userId}` storing epoch-ms entries,
 * trimmed to the last 24h, count = LLEN.
 */
import { Redis } from 'ioredis';
import type { Plan } from '@api-website/shared';
import type { GatewayConfig } from '../config.js';

const WINDOW_MS = 24 * 60 * 60 * 1000;

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  limit: number;
  resetAt: Date;
}

export class RateLimiter {
  private redis: Redis | null = null;
  private readonly memoryStore = new Map<string, number[]>();
  private readonly limits: Record<Plan, number>;

  constructor(cfg: Pick<GatewayConfig, 'redisUrl' | 'limits'>) {
    this.limits = {
      free: cfg.limits.free,
      pro: cfg.limits.pro,
      enterprise: cfg.limits.enterprise,
    };
    if (cfg.redisUrl) {
      try {
        this.redis = new Redis(cfg.redisUrl, {
          maxRetriesPerRequest: 2,
          lazyConnect: true,
          enableOfflineQueue: false,
        });
        this.redis.connect().catch(() => {
          this.redis?.disconnect(true);
          this.redis = null;
        });
        this.redis.on('error', (e) => {
          console.warn('[ratelimit] redis error, using memory fallback:', e.message);
        });
      } catch (e) {
        console.warn('[ratelimit] redis init failed, using memory fallback:', (e as Error).message);
        this.redis = null;
      }
    }
  }

  get backend(): 'redis' | 'memory' {
    return this.redis ? 'redis' : 'memory';
  }

  limitFor(plan: Plan): number {
    return this.limits[plan];
  }

  /**
   * Record a request for a user and return whether it is allowed.
   * limit=0 (enterprise) means unlimited — no recording needed.
   */
  async record(userId: string, plan: Plan): Promise<RateLimitResult> {
    const limit = this.limits[plan];
    if (limit === 0) {
      return { allowed: true, remaining: -1, limit: 0, resetAt: new Date(Date.now() + WINDOW_MS) };
    }
    const now = Date.now();
    const cutoff = now - WINDOW_MS;

    if (this.redis) {
      try {
        const key = `rl:${userId}`;
        const pipe = this.redis.pipeline();
        pipe.lrem(key, 0, 0); // no-op keepalive to detect disconnect
        pipe.lrange(key, 0, -1);
        const res = await pipe.exec();
        if (res) {
          const entries = ((res[1]?.[1] as string[] | undefined) ?? []).map(Number).filter((n) => n > cutoff);
          if (entries.length >= limit) {
            return {
              allowed: false,
              remaining: 0,
              limit,
              resetAt: new Date((entries[0] ?? now) + WINDOW_MS),
            };
          }
          const pipe2 = this.redis.pipeline();
          pipe2.rpush(key, String(now));
          pipe2.ltrim(key, -limit, -1);
          pipe2.expire(key, 86400);
          await pipe2.exec();
          return {
            allowed: true,
            remaining: limit - entries.length - 1,
            limit,
            resetAt: new Date(now + WINDOW_MS),
          };
        }
        // pipeline failed — fall through to memory
      } catch {
        /* fall through to memory */
      }
    }

    // Memory fallback
    let entries = this.memoryStore.get(userId) ?? [];
    entries = entries.filter((t) => t > cutoff);
    if (entries.length >= limit) {
      this.memoryStore.set(userId, entries);
      return { allowed: false, remaining: 0, limit, resetAt: new Date((entries[0] ?? now) + WINDOW_MS) };
    }
    entries.push(now);
    this.memoryStore.set(userId, entries);
    return { allowed: true, remaining: limit - entries.length, limit, resetAt: new Date(now + WINDOW_MS) };
  }

  /** Async check without recording (for headers). */
  async peek(userId: string, plan: Plan): Promise<number> {
    const limit = this.limits[plan];
    if (limit === 0) return Infinity;
    const now = Date.now();
    const cutoff = now - WINDOW_MS;
    if (this.redis) {
      try {
        const entries = await this.redis.lrange(`rl:${userId}`, 0, -1);
        return entries.filter((e) => Number(e) > cutoff).length;
      } catch {
        /* ignore */
      }
    }
    const entries = (this.memoryStore.get(userId) ?? []).filter((t) => t > cutoff);
    return entries.length;
  }

  close(): void {
    this.redis?.disconnect();
  }
}