
import { Context } from 'koa';
import { dashboardRepository } from '../../database/repositories/dashboard.repository';
import { logger } from '../../utils/logger';

export class DashboardController {

    /**
     * List requests, tokens, costs
     * GET /_api/dashboard/stats
     */
    static async getStats(ctx: Context): Promise<void> {
        try {
            const result = await dashboardRepository.getStats();
            ctx.body = result;
        } catch (error) {
            logger.error('Failed to compute dashboard stats:', error);
            throw error;
        }
    }

    /**
     * List last activites limit 10
     * GET /_api/dashboard/activity?limit = 10
     */
    static async getRecentActivity(ctx: Context): Promise<void> {
        try {
            let limit = 10;
            if (ctx.query.limit !== undefined) {
                limit = parseInt(ctx.query.limit as string, 10);
                if (isNaN(limit) || limit < 1 || limit > 100) {
                    ctx.status = 400;
                    ctx.body = { error: 'Invalid limit parameter' };
                    return;
                }
            }
            const result = await dashboardRepository.getRecentActivity(limit);
            ctx.body = result;
        } catch (error) {
            logger.error('Failed to get dashboard activity:', error);
            throw error;
        }
    }

    /**
     * Fetch API usage data for the past 7 days
     * GET /_api/dashboard/usage-trend?days=7
     */
    static async getUsageTrend(ctx: Context): Promise<void> {
        try {
            let days = 7;
            if (ctx.query.days !== undefined) {
                days = parseInt(ctx.query.days as string, 10);
                if (isNaN(days) || days < 1 || days > 90) {
                    ctx.status = 400;
                    ctx.body = { error: 'Invalid days parameter' };
                    return;
                }
            }
            const result = await dashboardRepository.getUsageTrend(days);
            ctx.body = result;
        } catch (error) {
            logger.error('Failed to get dashboard usage trend:', error);
            throw error;
        }
    }

    /**
     * Calculate usage requests 
     * GET /_api/dashboard/provider-stats
     */
    static async getProviderStats(ctx: Context): Promise<void> {
        try {
            const result = await dashboardRepository.getProviderStats();
            ctx.body = result;
        } catch (error) {
            logger.error('Failed to get dashboard provider stats:', error);
            throw error;
        }
    }
}
