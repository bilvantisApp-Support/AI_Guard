import { Context, Next } from 'koa';
import { IProject } from '../../database/models/project.model';
import { projectRepository } from '../../database/repositories/project.repository';
import { logger } from '../../utils/logger';
import { ProxyError, ProxyErrorType } from '../../types/proxy';

export interface QuotaLimits {
  monthlyLimit: number;
  dailyLimit: number;
}

export interface QuotaStatus {
  monthlyUsage: number;
  monthlyLimit: number;
  dailyUsage: number;
  dailyLimit: number;
  monthlyRemaining: number;
  dailyRemaining: number;
}

export class QuotaChecker {
  private defaultQuotas = {
    free: { monthlyLimit: 1000, dailyLimit: 100 },
    pro: { monthlyLimit: 50000, dailyLimit: 5000 },
    enterprise: { monthlyLimit: 1000000, dailyLimit: 50000 },
  };

  public getDefaults(): Record<'free' | 'pro' | 'enterprise', QuotaLimits> {
    return this.defaultQuotas;
  }


  /**
   * Create quota checking middleware
   */
  public createMiddleware() {
    return async (ctx: Context, next: Next) => {
      const auth = ctx.state.auth;
      const project = auth?.project as IProject | undefined;

      if (!project) {
        // No project context, skip quota check
        await next();
        return;
      }

      const quotaStatus = await this.checkQuota(project);
      
      // Set quota headers
      ctx.set('X-Quota-Monthly-Limit', String(quotaStatus.monthlyLimit));
      ctx.set('X-Quota-Monthly-Used', String(quotaStatus.monthlyUsage));
      ctx.set('X-Quota-Monthly-Remaining', String(quotaStatus.monthlyRemaining));
      ctx.set('X-Quota-Daily-Limit', String(quotaStatus.dailyLimit));
      ctx.set('X-Quota-Daily-Used', String(quotaStatus.dailyUsage));
      ctx.set('X-Quota-Daily-Remaining', String(quotaStatus.dailyRemaining));

      // Check if quota is exceeded
      if (quotaStatus.monthlyRemaining <= 0) {
        throw new ProxyError(
          ProxyErrorType.INVALID_REQUEST,
          429,
          'Monthly quota exceeded',
          {
            quotaType: 'monthly',
            limit: quotaStatus.monthlyLimit,
            used: quotaStatus.monthlyUsage,
          }
        );
      }

      if (quotaStatus.dailyRemaining <= 0) {
        throw new ProxyError(
          ProxyErrorType.INVALID_REQUEST,
          429,
          'Daily quota exceeded',
          {
            quotaType: 'daily',
            limit: quotaStatus.dailyLimit,
            used: quotaStatus.dailyUsage,
          }
        );
      }

      // Check if approaching limits (warn at 90%)
      const monthlyWarningThreshold = quotaStatus.monthlyLimit * 0.9;
      const dailyWarningThreshold = quotaStatus.dailyLimit * 0.9;

      if (quotaStatus.monthlyUsage >= monthlyWarningThreshold) {
        ctx.set('X-Quota-Warning', 'monthly-approaching-limit');
      }

      if (quotaStatus.dailyUsage >= dailyWarningThreshold) {
        ctx.set('X-Quota-Warning', 'daily-approaching-limit');
      }

      await next();
    };
  }

  /**
   * Check current quota status for a project
   */
  public async checkQuota(project: IProject): Promise<QuotaStatus> {
    const quotaLimits = this.getQuotaLimits(project);
    
    return {
      monthlyUsage: project.usage.currentMonth.requests,
      monthlyLimit: quotaLimits.monthlyLimit,
      dailyUsage: project.usage.currentDay.requests,
      dailyLimit: quotaLimits.dailyLimit,
      monthlyRemaining: Math.max(0, quotaLimits.monthlyLimit - project.usage.currentMonth.requests),
      dailyRemaining: Math.max(0, quotaLimits.dailyLimit - project.usage.currentDay.requests),
    };
  }

  /**
   * Get quota limits for a project
   */
  private getQuotaLimits(project: IProject): QuotaLimits {
    // Check for project-specific quota override
    if (project.settings.quotaOverride) {
      return project.settings.quotaOverride;
    }

    // Determine tier based on project membership
    const tier = this.determineProjectTier(project);
    return this.defaultQuotas[tier];
  }

  /**
   * Determine project tier for quota limits
   */
  private determineProjectTier(project: IProject): 'free' | 'pro' | 'enterprise' {
    // This is a simplified implementation
    // In production, you might check subscription status, payment history, etc.
    
    const memberCount = project.members.length;
    
    if (memberCount > 10) {
      return 'enterprise';
    } else if (memberCount > 2) {
      return 'pro';
    }
    
    return 'free';
  }

  /**
   * Update usage after a successful request
   */
  public async updateUsage(
    projectId: string,
    tokens: number = 1,
    cost: number = 0
  ): Promise<void> {
    try {
      await projectRepository.updateUsage(projectId, {
        requests: 1,
        tokens,
        cost,
      });
    } catch (error) {
      logger.error('Failed to update project usage:', error);
      // Don't throw error here as it shouldn't block the request
    }
  }

  /**
   * Get quota status for multiple projects
   */
  public async getQuotaStatusForProjects(projectIds: string[]): Promise<Record<string, QuotaStatus>> {
    const result: Record<string, QuotaStatus> = {};

    for (const projectId of projectIds) {
      try {
        const project = await projectRepository.findById(projectId);
        if (project) {
          result[projectId] = await this.checkQuota(project);
        }
      } catch (error) {
        logger.error(`Failed to get quota status for project ${projectId}:`, error);
      }
    }

    return result;
  }

  /**
   * Reset quotas (useful for testing or admin operations)
   */
  public async resetQuota(
    projectId: string,
    type: 'monthly' | 'daily' | 'both' = 'both'
  ): Promise<void> {
    try {
      const updates: any = {};
      
      if (type === 'monthly' || type === 'both') {
        updates['usage.currentMonth.requests'] = 0;
        updates['usage.currentMonth.tokens'] = 0;
        updates['usage.currentMonth.cost'] = 0;
      }
      
      if (type === 'daily' || type === 'both') {
        updates['usage.currentDay.requests'] = 0;
        updates['usage.currentDay.tokens'] = 0;
        updates['usage.currentDay.cost'] = 0;
      }

      await projectRepository.updateProject(projectId, { usage: updates } as any);
      
      logger.info('Quota reset', { projectId, type });
    } catch (error) {
      logger.error('Failed to reset quota:', error);
      throw error;
    }
  }

  /**
   * Set custom quota limits for a project
   */
  public async setCustomQuota(
    projectId: string,
    quotaLimits: Partial<QuotaLimits>
  ): Promise<void> {
    try {
      const project = await projectRepository.findById(projectId);
      if (!project) {
        throw new Error('Project not found');
      }

      const currentLimits = this.getQuotaLimits(project);
      const newLimits = { ...currentLimits, ...quotaLimits };

      await projectRepository.updateProject(projectId, {
        settings: {
          ...project.settings,
          quotaOverride: newLimits,
        },
      });

      logger.info('Custom quota set', { projectId, quotaLimits: newLimits });
    } catch (error) {
      logger.error('Failed to set custom quota:', error);
      throw error;
    }
  }
}

export const quotaChecker = new QuotaChecker();