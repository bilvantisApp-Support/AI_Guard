import { Context, Next } from 'koa';
import Redis from 'ioredis';
import { logger } from '../../utils/logger';
import { IUser } from '../../database/models/user.model';
import { IProject } from '../../database/models/project.model';

export interface RateLimitConfig {
  windowMs: number;
  maxRequests: number;
  keyGenerator?: (ctx: Context) => string;
  skip?: (ctx: Context) => boolean;
  handler?: (ctx: Context) => void;
}

export interface TierRateLimits {
  free: RateLimitConfig;
  pro: RateLimitConfig;
  enterprise: RateLimitConfig;
}

export class RateLimiter {
  private redis: Redis | null = null;
  private inMemoryStore: Map<string, { count: number; resetAt: number }> = new Map();

  private defaultLimits: TierRateLimits = {
    free: { windowMs: 60000, maxRequests: 10 },
    pro: { windowMs: 60000, maxRequests: 100 },
    enterprise: { windowMs: 60000, maxRequests: 1000 },
  };

  public getDefaults():TierRateLimits {
    return this.defaultLimits;
  }

  constructor() {
    this.initializeRedis();
  }

  private initializeRedis(): void {
    try {
      const redisUrl = process.env.REDIS_URL;
      if (redisUrl) {
        this.redis = new Redis(redisUrl);
        this.redis.on('connect', () => {
          logger.info('Redis connected for rate limiting');
        });
        this.redis.on('error', (error) => {
          logger.error('Redis connection error:', error);
          this.redis = null; // Fall back to in-memory
        });
      } else {
        logger.info('Redis URL not configured, using in-memory rate limiting');
      }
    } catch (error) {
      logger.error('Failed to initialize Redis:', error);
      this.redis = null;
    }
  }

  /**
   * Create rate limiting middleware
   */
  public createMiddleware(defaultConfig?: RateLimitConfig) {
    return async (ctx: Context, next: Next) => {
      const config = this.getConfigForRequest(ctx, defaultConfig);
      
      if (config.skip && config.skip(ctx)) {
        await next();
        return;
      }

      const key = this.generateKey(ctx, config);
      const limit = await this.checkLimit(key, config);

      // Set rate limit headers
      ctx.set('X-RateLimit-Limit', String(config.maxRequests));
      ctx.set('X-RateLimit-Remaining', String(limit.remaining));
      ctx.set('X-RateLimit-Reset', String(limit.resetAt));

      if (limit.exceeded) {
        ctx.set('Retry-After', String(Math.ceil((limit.resetAt - Date.now()) / 1000)));
        
        if (config.handler) {
          config.handler(ctx);
        } else {
          ctx.status = 429;
          ctx.body = {
            error: {
              type: 'RATE_LIMIT_EXCEEDED',
              message: 'Too many requests, please try again later',
              retryAfter: Math.ceil((limit.resetAt - Date.now()) / 1000),
            },
          };
        }
        return;
      }

      await next();
    };
  }

  /**
   * Get rate limit configuration for the current request
   */
  private getConfigForRequest(ctx: Context, defaultConfig?: RateLimitConfig): RateLimitConfig {
    const auth = ctx.state.auth;
    const project = auth?.project as IProject | undefined;
    
    // Check for project-specific rate limit override
    if (project?.settings?.rateLimitOverride) {
      return {
        windowMs: project.settings.rateLimitOverride.windowMs,
        maxRequests: project.settings.rateLimitOverride.maxRequests,
      };
    }

    // Determine tier based on user/project
    const tier = this.determineUserTier(auth?.user, project);
    const tierConfig = this.defaultLimits[tier];

    return defaultConfig || tierConfig;
  }

  /**
   * Determine user tier for rate limiting
   */
  private determineUserTier(user?: IUser, project?: IProject): 'free' | 'pro' | 'enterprise' {
    // This is a simplified implementation
    // In production, you might check subscription status, payment history, etc.
    if (!user) {
      return 'free';
    }

    // Check project membership count as a proxy for tier
    if (project && project.members.length > 5) {
      return 'enterprise';
    } else if (project && project.members.length > 1) {
      return 'pro';
    }

    return 'free';
  }

  /**
   * Generate rate limit key
   */
  private generateKey(ctx: Context, config: RateLimitConfig): string {
    if (config.keyGenerator) {
      return config.keyGenerator(ctx);
    }

    const auth = ctx.state.auth;
    const baseKey = 'ratelimit:';

    if (auth?.user) {
      return `${baseKey}user:${auth.user._id}`;
    }

    // Fall back to IP-based rate limiting
    const ip = ctx.ip || 'unknown';
    return `${baseKey}ip:${ip}`;
  }

  /**
   * Check and update rate limit
   */
  private async checkLimit(
    key: string,
    config: RateLimitConfig
  ): Promise<{ exceeded: boolean; remaining: number; resetAt: number }> {
    if (this.redis) {
      return this.checkLimitRedis(key, config);
    } else {
      return this.checkLimitInMemory(key, config);
    }
  }

  /**
   * Check rate limit using Redis
   */
  private async checkLimitRedis(
    key: string,
    config: RateLimitConfig
  ): Promise<{ exceeded: boolean; remaining: number; resetAt: number }> {
    const now = Date.now();
    const window = config.windowMs;
    const max = config.maxRequests;

    try {
      const pipeline = this.redis!.pipeline();
      const resetAt = now + window;

      // Remove old entries
      pipeline.zremrangebyscore(key, '-inf', now - window);
      
      // Add current request
      pipeline.zadd(key, now, `${now}-${Math.random()}`);
      
      // Count requests in window
      pipeline.zcount(key, now - window, '+inf');
      
      // Set expiry
      pipeline.expire(key, Math.ceil(window / 1000));

      const results = await pipeline.exec();
      const count = results?.[2]?.[1] as number || 0;

      return {
        exceeded: count > max,
        remaining: Math.max(0, max - count),
        resetAt,
      };
    } catch (error) {
      logger.error('Redis rate limit check failed:', error);
      // Fall back to allowing the request
      return {
        exceeded: false,
        remaining: max,
        resetAt: now + window,
      };
    }
  }

  /**
   * Check rate limit using in-memory store
   */
  private checkLimitInMemory(
    key: string,
    config: RateLimitConfig
  ): { exceeded: boolean; remaining: number; resetAt: number } {
    const now = Date.now();
    const window = config.windowMs;
    const max = config.maxRequests;

    // Clean up expired entries periodically
    if (Math.random() < 0.01) {
      this.cleanupInMemoryStore();
    }

    const entry = this.inMemoryStore.get(key);
    
    if (!entry || entry.resetAt < now) {
      // New window
      const resetAt = now + window;
      this.inMemoryStore.set(key, { count: 1, resetAt });
      return {
        exceeded: false,
        remaining: max - 1,
        resetAt,
      };
    }

    // Existing window
    entry.count++;
    return {
      exceeded: entry.count > max,
      remaining: Math.max(0, max - entry.count),
      resetAt: entry.resetAt,
    };
  }

  /**
   * Clean up expired entries from in-memory store
   */
  private cleanupInMemoryStore(): void {
    const now = Date.now();
    for (const [key, entry] of this.inMemoryStore.entries()) {
      if (entry.resetAt < now) {
        this.inMemoryStore.delete(key);
      }
    }
  }

  /**
   * Create provider-specific rate limiter
   */
  public createProviderLimiter(provider: string): RateLimitConfig {
    // Provider-specific limits
    const providerLimits: Record<string, RateLimitConfig> = {
      openai: { windowMs: 60000, maxRequests: 60 },
      anthropic: { windowMs: 60000, maxRequests: 50 },
      gemini: { windowMs: 60000, maxRequests: 100 },
    };

    return providerLimits[provider.toLowerCase()] || this.defaultLimits.free;
  }

  /**
   * Reset rate limit for a key (useful for testing or admin operations)
   */
  public async resetLimit(key: string): Promise<void> {
    if (this.redis) {
      await this.redis.del(key);
    } else {
      this.inMemoryStore.delete(key);
    }
  }
}

export const rateLimiter = new RateLimiter();