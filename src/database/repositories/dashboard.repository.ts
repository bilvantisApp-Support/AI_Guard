import { UsageRecord } from '../models/usage.model';
import { Project } from '../models/project.model';

export interface DashboardStats {
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  activeProjects: number;
  period: { start: string; end: string };
}

export interface ActivityItem {
  id: string;
  type: string;
  title: string;
  description: string;
  timestamp: Date;
  projectName?: string;
  severity: string;
}

export interface UsageTrend {
  date: string;
  requests: number;
  tokens: number;
  cost: number;
}

export interface ProviderStats {
  provider: string;
  requests: number;
  cost: number;
  percentage: number;
}

export class DashboardRepository {
  async getStats(): Promise<DashboardStats> {
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - 30);
    const agg = await UsageRecord.aggregate([
      { $match: { timestamp: { $gte: start } } },
      {
        $group: {
          _id: null,
          totalRequests: { $sum: 1 },
          totalTokens: { $sum: { $ifNull: ['$totalTokens', 0] } },
          totalCost: {
            $sum: {
              $cond: [
                { $and: [ { $ne: ['$cost', null] }, { $isNumber: '$cost' } ] },
                '$cost',
                0
              ]
            }
          },
          projects: { $addToSet: '$projectId' },
        },
      },
      {
        $project: {
          _id: 0,
          totalRequests: 1,
          totalTokens: 1,
          totalCost: 1,
          projects: 1,
        },
      },
    ]).exec();
    let activeProjects = 0;
    let result: DashboardStats = {
      totalRequests: 0,
      totalTokens: 0,
      totalCost: 0,
      activeProjects: 0,
      period: { start: start.toISOString(), end: now.toISOString() },
    };
    if (agg && agg[0]) {
      const projectIds = agg[0].projects || [];
      if (projectIds.length > 0) {
        const existing = await Project.find({ _id: { $in: projectIds } }).select('_id').lean();
        activeProjects = existing.length;
      }
      result = {
        totalRequests: agg[0].totalRequests,
        totalTokens: agg[0].totalTokens,
        totalCost: agg[0].totalCost,
        activeProjects,
        period: { start: start.toISOString(), end: now.toISOString() },
      };
    }
    return result;
  }

  async getRecentActivity(limit = 10): Promise<ActivityItem[]> {
    const records = await UsageRecord.find({})
      .sort({ timestamp: -1 })
      .limit(limit)
      .populate('projectId', 'name')
      .lean();
    return records.map(r => ({
      id: r._id.toString(),
      type: 'api_call',
      title: r.modelName || r.endpoint,
      description: r.endpoint,
      timestamp: r.timestamp,
      projectName: typeof r.projectId === 'object' && r.projectId && 'name' in r.projectId ? (r.projectId as any).name : undefined,
      severity: r.statusCode >= 400 ? 'warning' : 'success',
    }));
  }

  async getUsageTrend(days = 7): Promise<UsageTrend[]> {
    const now = new Date();
    const start = new Date(now);
    start.setDate(start.getDate() - days);
    const trend = await UsageRecord.aggregate([
      { $match: { timestamp: { $gte: start } } },
      {
        $group: {
          _id: {
            $dateToString: { format: '%Y-%m-%d', date: '$timestamp' },
          },
          requests: { $sum: 1 },
          tokens: { $sum: { $ifNull: ['$totalTokens', 0] } },
          cost: { $sum: { $ifNull: ['$cost', 0] } },
        },
      },
      { $sort: { '_id': 1 } },
    ]).exec();
    return trend.map(t => ({
      date: t._id,
      requests: t.requests,
      tokens: t.tokens,
      cost: t.cost,
    }));
  }

  async getProviderStats(): Promise<ProviderStats[]> {
    const agg = await UsageRecord.aggregate([
      {
        $group: {
          _id: '$provider',
          requests: { $sum: 1 },
          cost: { $sum: { $ifNull: ['$cost', 0] } },
        },
      },
    ]).exec();
    const totalRequests = agg.reduce((sum, p) => sum + p.requests, 0) || 1;
    return agg.map(p => ({
      provider: p._id,
      requests: p.requests,
      cost: p.cost,
      percentage: +(p.requests * 100 / totalRequests).toFixed(1),
    }));
  }
}

export const dashboardRepository = new DashboardRepository();
