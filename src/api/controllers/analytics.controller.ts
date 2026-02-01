import { Context } from 'koa';
import { analyticsRepository } from '../../database/repositories/analytics.repository';


export class AnalyticsController {
  async getAnalytics(ctx: Context) {
    let { timeRange = '7d', project = 'all' } = ctx.query;

    if (Array.isArray(timeRange)) timeRange = timeRange[0];
    if (Array.isArray(project)) project = project[0];

    const allowedRanges = ['1d', '7d', '30d', '90d'];
    if (typeof timeRange !== 'string' || !allowedRanges.includes(timeRange)) {
      ctx.status = 400;
      ctx.body = { error: 'Invalid timeRange parameter (allowed: 1d, 7d, 30d, 90d)' };
      return;
    }
    if (project && typeof project !== 'string') {
      ctx.status = 400;
      ctx.body = { error: 'Invalid project parameter' };
      return;
    }

    const data = await analyticsRepository.getAnalytics({ timeRange, project });
    ctx.body = data;
  }
}

export const analyticsController = new AnalyticsController();
