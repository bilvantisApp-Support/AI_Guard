import { Context, Next } from 'koa';
import { UsageRecord } from '../../database/models/usage.model';
import { projectRepository } from '../../database/repositories/project.repository';
import { teamRepository } from '../../database/repositories/team.repository';
import { logger } from '../../utils/logger';
import mongoose from 'mongoose';
import Redis from 'ioredis';

export interface UsageData {
  provider: string;
  endpoint: string;
  method: string;
  model?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cost?: number;
  responseTime: number;
  statusCode: number;
  metadata?: Record<string, any>;
}

export class UsageTracker {

  private redis: Redis | null = null;

  constructor() {
    this.initializeRedis();
  }

  private initializeRedis(): void {
      try {
        const redisUrl = process.env.REDIS_URL;
        if (redisUrl) {
          this.redis = new Redis(redisUrl);
          this.redis.on('connect', () => {
            logger.info('Redis connected for usage tracker');
          });
          this.redis.on('error', (error) => {
            logger.error('Redis connection error:', error);
          });
        } else {
          logger.info('Redis URL not configured');
        }
      } catch (error) {
        logger.error('Failed to initialize Redis:', error);
      }
    }

  /**
   * Create usage tracking middleware
   */
  public createMiddleware() {
    return async (ctx: Context, next: Next) => {
      const startTime = Date.now();

      await next();

      // Track usage after response
      const responseTime = Date.now() - startTime;
      await this.trackUsage(ctx, responseTime);
    };
  }

  /**
   * Track API usage
   */
  private async trackUsage(ctx: Context, responseTime: number): Promise<void> {
    try {
      const auth = ctx.state.auth;
      const provider = ctx.headers['x-ai-guard-provider'] as string;

      if (!auth?.user || !provider) {
        return; // Skip tracking if no auth or provider
      }

      const usageData = this.extractUsageData(ctx, provider, responseTime);
      const projectId = (auth.token as any)?._doc?.projectId?.toString();
      const teamId = projectId
        ? await this.resolveTeamId(auth.user._id.toString(), projectId)
        : undefined;

      // Save detailed usage record
      await this.saveUsageRecord(
        auth.user._id.toString(),
        projectId,
        teamId,
        usageData
      );

      // Update project usage aggregates
      if ((auth.token as any)?._doc?.projectId) {
        await this.updateProjectUsage((auth.token as any)?._doc?.projectId, usageData);
      }

      // Update team usage aggregates
      if (teamId) {
        await this.updateTeamUsage(teamId, usageData);
      }

    } catch (error) {
      logger.error('Failed to track usage:', error);
      // Don't throw error as it shouldn't affect the response
    }
  }

  /**
   * Extract usage data from request/response
   */
  private extractUsageData(ctx: Context, provider: string, responseTime: number): UsageData {
    const body = (ctx.request as any).body;
    const responseBody = ctx.body;

    const usageData: UsageData = {
      provider: provider.toLowerCase(),
      endpoint: ctx.path,
      method: ctx.method,
      responseTime,
      statusCode: ctx.status,
      metadata: {
        userAgent: ctx.headers['user-agent'],
        contentType: ctx.headers['content-type'],
        keySource: (ctx as any).metadata?.keySource,
        keyId: (ctx as any).metadata?.keyId,
      },
    };

    // Extract model and token usage based on provider
    switch (provider.toLowerCase()) {
      case 'openai':
        usageData.model = body?.model;
        if (responseBody && typeof responseBody === 'object' && 'usage' in responseBody) {
          const usage = responseBody.usage as any;
          usageData.promptTokens = usage.prompt_tokens;
          usageData.completionTokens = usage.completion_tokens;
          usageData.totalTokens = usage.total_tokens;
          usageData.cost = this.calculateOpenAICost(usageData.model, usageData.totalTokens);
        }
        break;

      case 'anthropic':
        usageData.model = body?.model;
        if (responseBody && typeof responseBody === 'object' && 'usage' in responseBody) {
          const usage = responseBody.usage as any;
          usageData.promptTokens = usage.input_tokens;
          usageData.completionTokens = usage.output_tokens;
          usageData.totalTokens = (usage.input_tokens || 0) + (usage.output_tokens || 0);
          usageData.cost = this.calculateAnthropicCost(usageData.model, usage.input_tokens, usage.output_tokens);
        }
        break;

      case 'gemini':
        // Gemini model is in the path
        const modelMatch = ctx.path.match(/models\/([^\/]+)/);
        usageData.model = modelMatch ? modelMatch[1] : undefined;

        if (responseBody && typeof responseBody === 'object' && 'usageMetadata' in responseBody) {
          const usageMetadata = responseBody.usageMetadata as any;
          usageData.promptTokens = usageMetadata.promptTokenCount;
          usageData.completionTokens = usageMetadata.candidatesTokenCount;
          usageData.totalTokens = usageMetadata.totalTokenCount;
          usageData.cost = this.calculateGeminiCost(usageData.model, usageData.totalTokens);
        }
        break;
    }

    return usageData;
  }

  /**
   * Save detailed usage record to database
   */
  private async saveUsageRecord(
    userId: string,
    projectId: string | undefined,
    teamId: string | undefined,
    usageData: UsageData
  ): Promise<void> {
    try {
      const record = new UsageRecord({
        userId,
        projectId,
        teamId,
        provider: usageData.provider,
        endpoint: usageData.endpoint,
        method: usageData.method,
        modelName: usageData.model,
        promptTokens: usageData.promptTokens,
        completionTokens: usageData.completionTokens,
        totalTokens: usageData.totalTokens,
        cost: usageData.cost,
        responseTime: usageData.responseTime,
        statusCode: usageData.statusCode,
        metadata: usageData.metadata,
      });

      await record.save();
    } catch (error) {
      logger.error('Failed to save usage record:', error);
    }
  }

  /**
   * Update project usage aggregates
   */
  private async updateProjectUsage(projectId: string, usageData: UsageData): Promise<void> {
    try {
      await projectRepository.updateUsage(projectId, {
        requests: 1,
        tokens: usageData.totalTokens || 1,
        cost: usageData.cost || 0,
      });
    } catch (error) {
      logger.error('Failed to update project usage:', error);
    }
  }

  /**
   * Update team usage aggregates
   */
  private async updateTeamUsage(teamId: string, usageData: UsageData): Promise<void> {
    try {
      await teamRepository.updateUsage(teamId, {
        requests: 1,
        tokens: usageData.totalTokens || 1,
        cost: usageData.cost || 0,
      });
    } catch (error) {
      logger.error('Failed to update team usage:', error);
    }
  }

  /**
   * Resolve team for usage attribution
   * Only attribute to a team if:
   * - the project is assigned to a team, and
   * - the user is a member of that team
   */
  private async resolveTeamId(userId: string, projectId: string): Promise<string | undefined> {
    const cacheKey = `team:${userId}:${projectId}`;
    try {
      if (this.redis) {
        const cached = await this.redis.get(cacheKey);
        if (cached) {
          return cached === 'null' ? undefined : cached;
        }
      }
      const project = await projectRepository.findById(projectId);
      if (!project?.teamIds?.length) {
        if (this.redis) {
          await this.redis.set(cacheKey, 'null', 'EX', 900);
        }
        return undefined;
      }

      for (const teamId of project.teamIds) {
        const isMember = await teamRepository.isMember(teamId, userId);
        if (isMember) {
          const result = teamId.toString();
          if (this.redis) {
            await this.redis.set(cacheKey, result, 'EX', 900);
          }
          return result;
        }
      }
      if (this.redis) {
        await this.redis.set(cacheKey, 'null', 'EX', 900);
      }

      return undefined;

    } catch (error) {
      logger.error('Failed to resolve team for usage:', error);
      return undefined;
    }
  }

  /**
   * Calculate OpenAI API cost (simplified pricing)
   */
  private calculateOpenAICost(model?: string, tokens?: number): number | undefined {
    if (!model || !tokens) return undefined;

    // Simplified pricing (per 1K tokens)
    const pricing: Record<string, number> = {
      'gpt-4': 0.03,
      'gpt-4-32k': 0.06,
      'gpt-3.5-turbo': 0.002,
      'gpt-3.5-turbo-16k': 0.004,
    };

    const modelKey = Object.keys(pricing).find(key => model.includes(key));
    if (!modelKey) return undefined;

    return (tokens / 1000) * pricing[modelKey];
  }

  /**
   * Calculate Anthropic API cost (simplified pricing)
   */
  private calculateAnthropicCost(
    model?: string,
    inputTokens?: number,
    outputTokens?: number
  ): number | undefined {
    if (!model || (!inputTokens && !outputTokens)) return undefined;

    // Simplified pricing (per 1K tokens)
    const pricing: Record<string, { input: number; output: number }> = {
      'claude-3-opus': { input: 0.015, output: 0.075 },
      'claude-3-sonnet': { input: 0.003, output: 0.015 },
      'claude-3-haiku': { input: 0.00025, output: 0.00125 },
    };

    const modelKey = Object.keys(pricing).find(key => model.includes(key));
    if (!modelKey) return undefined;

    const inputCost = (inputTokens || 0) / 1000 * pricing[modelKey].input;
    const outputCost = (outputTokens || 0) / 1000 * pricing[modelKey].output;

    return inputCost + outputCost;
  }

  /**
   * Calculate Gemini API cost (simplified pricing)
   */
  private calculateGeminiCost(model?: string, tokens?: number): number | undefined {
    if (!model || !tokens) return undefined;

    // Simplified pricing (per 1K tokens)
    const pricing: Record<string, number> = {
      'gemini-pro': 0.0005,
      'gemini-pro-vision': 0.002,
    };

    const modelKey = Object.keys(pricing).find(key => model.includes(key));
    if (!modelKey) return undefined;

    return (tokens / 1000) * pricing[modelKey];
  }

  /**
   * Get usage statistics for a project
   */
  public async getProjectUsageStats(
    projectId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{
    totalRequests: number;
    totalTokens: number;
    totalCost: number;
    byProvider: Record<string, any>;
    byModel: Record<string, any>;
    byUser: Record<string, any>;
  }> {
    try {
      const records = await UsageRecord.aggregate([
        {
          $match: {
            projectId: new mongoose.Types.ObjectId(projectId),
            timestamp: { $gte: startDate, $lte: endDate },
          },
        },
        {
          $group: {
            _id: null,
            totalRequests: { $sum: 1 },
            totalTokens: { $sum: '$totalTokens' },
            totalCost: { $sum: '$cost' },
            byProvider: {
              $push: {
                provider: '$provider',
                tokens: '$totalTokens',
                cost: '$cost',
              },
            },
            byModel: {
              $push: {
                model: '$modelName',
                tokens: '$totalTokens',
                cost: '$cost',
              },
            },
            byUser: {
              $push: {
                userId: '$userId',
                tokens: '$totalTokens',
                cost: '$cost',
              },
            },
          },
        },
      ]);

      if (!records.length) {
        return {
          totalRequests: 0,
          totalTokens: 0,
          totalCost: 0,
          byProvider: {},
          byModel: {},
          byUser: {}
        };
      }

      const result = records[0];

      // Process provider and model breakdowns
      const byProvider = this.aggregateBy(result.byProvider, 'provider');
      const byModel = this.aggregateBy(result.byModel, 'model');
      const byUser = this.aggregateBy(result.byUser, 'userId');

      return {
        totalRequests: result.totalRequests,
        totalTokens: result.totalTokens || 0,
        totalCost: result.totalCost || 0,
        byProvider,
        byModel,
        byUser,
      };
    } catch (error) {
      logger.error('Failed to get project usage stats:', error);
      throw error;
    }
  }

  /**
   * Get usage statistics for a team
   * Includes only usage by team members on projects assigned to the team
   */
  public async getTeamUsageStats(
    teamId: string,
    startDate: Date,
    endDate: Date
  ): Promise<{
    totalRequests: number;
    totalTokens: number;
    totalCost: number;
    byProvider: Record<string, any>;
    byModel: Record<string, any>;
    byUser: Record<string, any>;
  }> {
    try {
      const team = await teamRepository.findById(teamId);
      if (!team) {
        return {
          totalRequests: 0,
          totalTokens: 0,
          totalCost: 0,
          byProvider: {},
          byModel: {},
          byUser: {},
        };
      }

      const memberIds = team.members.map((m) => m.userId);
      const projects = await projectRepository.findByTeam(teamId);
      const projectIds = projects.map((p) => p._id);

      if (memberIds.length === 0 || projectIds.length === 0) {
        return {
          totalRequests: 0,
          totalTokens: 0,
          totalCost: 0,
          byProvider: {},
          byModel: {},
          byUser: {},
        };
      }

      const records = await UsageRecord.aggregate([
        {
          $match: {
            projectId: { $in: projectIds },
            userId: { $in: memberIds },
            timestamp: { $gte: startDate, $lte: endDate },
          },
        },
        {
          $group: {
            _id: null,
            totalRequests: { $sum: 1 },
            totalTokens: { $sum: '$totalTokens' },
            totalCost: { $sum: '$cost' },
            byProvider: {
              $push: {
                provider: '$provider',
                tokens: '$totalTokens',
                cost: '$cost',
              },
            },
            byModel: {
              $push: {
                model: '$modelName',
                tokens: '$totalTokens',
                cost: '$cost',
              },
            },
            byUser: {
              $push: {
                userId: '$userId',
                tokens: '$totalTokens',
                cost: '$cost',
              },
            },
          },
        },
      ]);

      if (!records.length) {
        return {
          totalRequests: 0,
          totalTokens: 0,
          totalCost: 0,
          byProvider: {},
          byModel: {},
          byUser: {},
        };
      }

      const result = records[0];
      const byProvider = this.aggregateBy(result.byProvider, 'provider');
      const byModel = this.aggregateBy(result.byModel, 'model');
      const byUser = this.aggregateBy(result.byUser, 'userId');

      return {
        totalRequests: result.totalRequests,
        totalTokens: result.totalTokens || 0,
        totalCost: result.totalCost || 0,
        byProvider,
        byModel,
        byUser,
      };
    } catch (error) {
      logger.error('Failed to get team usage stats:', error);
      throw error;
    }
  }

  /**
   * Aggregate usage data by a specific field
   */
  private aggregateBy(items: any[], field: string): Record<string, any> {
    const result: Record<string, any> = {};

    for (const item of items) {
      const key = item[field] || 'unknown';
      if (!result[key]) {
        result[key] = { requests: 0, tokens: 0, cost: 0 };
      }

      result[key].requests++;
      result[key].tokens += item.tokens || 0;
      result[key].cost += item.cost || 0;
    }

    return result;
  }
}

export const usageTracker = new UsageTracker();
