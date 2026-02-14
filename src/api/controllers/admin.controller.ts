import { Context } from 'koa';
import { userRepository } from '../../database/repositories/user.repository';
// import { projectRepository } from '../../database/repositories/project.repository';
import { AuditLog } from '../../database/models/audit-log.model';
import { UsageRecord } from '../../database/models/usage.model';
import { rateLimiter } from '../../interceptors/request/rate-limiter';
// import { quotaChecker } from '../../interceptors/request/quota-checker';
import { responseCache } from '../../interceptors/response/response-cache';
import { dbConnection } from '../../database/connection';
import { logger } from '../../utils/logger';
import { ProxyError, ProxyErrorType } from '../../types/proxy';

export class AdminController {
  /**
   * Get system health metrics
   * GET /_api/admin/system/health
   */
  static async getSystemHealth(ctx: Context): Promise<void> {
    try {
      const health = {
        status: 'healthy',
        timestamp: new Date().toISOString(),
        database: {
          connected: dbConnection.isConnectionActive(),
        },
        cache: responseCache.getStats(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
      };

      ctx.body = health;
    } catch (error) {
      logger.error('Failed to get system health:', error);
      throw new ProxyError(ProxyErrorType.UPSTREAM_ERROR, 500, 'Failed to retrieve system health');
    }
  }

  /**
   * List all users (paginated)
   * GET /_api/admin/users
   */
  static async listUsers(ctx: Context): Promise<void> {
    try {
      const page = parseInt(ctx.query.page as string) || 1;
      const limit = parseInt(ctx.query.limit as string) || 20;
      const status = ctx.query.status as string;

      const filters: any = {};
      if (status) {
        filters.status = status;
      }

      const { users, total } = await userRepository.findActiveUsers(filters, { page, limit });

      ctx.body = {
        users: users.map(user => ({
          id: user._id,
          email: user.email,
          name: user.name,
          role: user.role,
          status: user.status,
          createdAt: user.createdAt,
          lastLoginAt: user.lastLoginAt,
        })),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      logger.error('Failed to list users:', error);
      throw error;
    }
  }

  /**
   * Update user status
   * PUT /_api/admin/users/:id
   */
  static async updateUser(ctx: Context): Promise<void> {
    try {
      const userId = ctx.params.id;
      const { status } = ctx.request.body as any;
      const { role } = ctx.request.body as any;

      if (!status || !['active', 'suspended', 'deleted'].includes(status)) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 400, 'Valid status is required');
      }
      if (!role || !['admin', 'member'].includes(role)) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 400, 'Valid role is required');
      }

      const updatedUser = await userRepository.updateUser(userId, { status,role });
      
      if (!updatedUser) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 404, 'User not found');
      }

      ctx.body = {
        id: updatedUser._id,
        email: updatedUser.email,
        role: updatedUser.role,
        name: updatedUser.name,
        status: updatedUser.status,
        updatedAt: updatedUser.updatedAt,
      };
    } catch (error) {
      logger.error('Failed to update user:', error);
      throw error;
    }
  }

  /**
   * Get audit logs
   * GET /_api/admin/audit
   */
  static async getAuditLogs(ctx: Context): Promise<void> {
    try {
      const page = parseInt(ctx.query.page as string) || 1;
      const limit = Math.min(parseInt(ctx.query.limit as string) || 50, 100);
      const userId = ctx.query.userId as string;
      const action = ctx.query.action as string;

      const query: any = {};
      if (userId) query.userId = userId;
      if (action) query.action = action;

      const skip = (page - 1) * limit;
      
      const [logs, total] = await Promise.all([
        AuditLog.find(query)
          .sort({ timestamp: -1 })
          .skip(skip)
          .limit(limit)
          .populate('userId', 'email name')
          .exec(),
        AuditLog.countDocuments(query).exec(),
      ]);

      ctx.body = {
        logs: logs.map(log => ({
          id: log._id,
          userId: log.userId,
          action: log.action,
          resource: log.resource,
          resourceId: log.resourceId,
          details: log.details,
          ipAddress: log.ipAddress,
          userAgent: log.userAgent,
          status: log.status,
          errorMessage: log.errorMessage,
          timestamp: log.timestamp,
        })),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit),
        },
      };
    } catch (error) {
      logger.error('Failed to get audit logs:', error);
      throw error;
    }
  }

  /**
   * Clear cache
   * POST /_api/admin/cache/clear
   */
  static async clearCache(ctx: Context): Promise<void> {
    try {
      const { pattern } = ctx.request.body as any;
      const clearedCount = responseCache.clearCache(pattern);

      ctx.body = {
        message: 'Cache cleared',
        pattern: pattern || 'all',
        clearedKeys: clearedCount,
      };
    } catch (error) {
      logger.error('Failed to clear cache:', error);
      throw error;
    }
  }

  /**
   * Reset user rate limits
   * POST /_api/admin/users/:id/reset-limits
   */
  static async resetUserLimits(ctx: Context): Promise<void> {
    try {
      const userId = ctx.params.id;
      
      // Reset rate limits
      await rateLimiter.resetLimit(`ratelimit:user:${userId}`);

      ctx.body = {
        message: 'User limits reset',
        userId,
        resetAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Failed to reset user limits:', error);
      throw error;
    }
  }

  /**
   * Get usage analytics
   * GET /_api/admin/analytics/usage
   */
  static async getUsageAnalytics(ctx: Context): Promise<void> {
    try {
      const { startDate, endDate } = ctx.query;
      const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
      const end = endDate ? new Date(endDate as string) : new Date();

      const analytics = await UsageRecord.aggregate([
        {
          $match: {
            timestamp: { $gte: start, $lte: end },
          },
        },
        {
          $group: {
            _id: {
              date: { $dateToString: { format: '%Y-%m-%d', date: '$timestamp' } },
              provider: '$provider',
            },
            requests: { $sum: 1 },
            totalTokens: { $sum: '$totalTokens' },
            totalCost: { $sum: '$cost' },
          },
        },
        {
          $sort: { '_id.date': 1 },
        },
      ]);

      ctx.body = {
        period: { start, end },
        analytics,
        summary: {
          totalRequests: analytics.reduce((sum, item) => sum + item.requests, 0),
          totalTokens: analytics.reduce((sum, item) => sum + (item.totalTokens || 0), 0),
          totalCost: analytics.reduce((sum, item) => sum + (item.totalCost || 0), 0),
        },
      };
    } catch (error) {
      logger.error('Failed to get usage analytics:', error);
      throw error;
    }
  }
}

export default AdminController;