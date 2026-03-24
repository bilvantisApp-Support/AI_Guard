import mongoose from 'mongoose';
import { UsageRecord } from '../models/usage.model';
import { Project } from '../models/project.model';

export interface AnalyticsData {
  period: string;
  projectId?: string;
  requests: number;
  tokens: number;
  cost: number;
  latency: number;
  errors: number;
}

export interface ProviderData {
  provider: string;
  requests: number;
  cost: number;
  color: string;
}

export interface ModelData {
  model: string;
  requests: number;
  tokens: number;
  cost: number;
  avgLatency: number;
}

export class AnalyticsRepository {
  async getAnalytics({
    timeRange,
    project
  }: {
    timeRange: string;
    project: string;
  }): Promise<{
    analytics: AnalyticsData[];
    providers: (ProviderData & { percentage: number })[];
    models: ModelData[];
    projects: { id: string; name: string }[];
  }> {

    const rangeToDays: Record<string, number> = {
      '1d': 1,
      '7d': 7,
      '30d': 30,
      '90d': 90
    };
    const days = rangeToDays[timeRange] ?? 7;

    const start = new Date();
    start.setDate(start.getDate() - days);

    const match: any = { timestamp: { $gte: start } };

    if (project && project !== 'all') {
      match.projectId = new mongoose.Types.ObjectId(project);
    }
    const groupId = {
      period: {
        $dateToString: { format: '%Y-%m-%d', date: '$timestamp' }
      },
      projectId: '$projectId'
    };

    const analyticsRaw = await UsageRecord.aggregate([
      { $match: match },
      {
        $group: {
          _id: groupId,
          requests: { $sum: 1 },
          tokens: { $sum: { $ifNull: ['$totalTokens', 0] } },
          cost: { $sum: { $ifNull: ['$cost', 0] } },
          latency: { $avg: '$responseTime' },
          errors: {
            $sum: { $cond: [{ $gte: ['$statusCode', 400] }, 1, 0] }
          }
        }
      },
      { $sort: { '_id.period': 1 } }
    ]);

    const analytics: AnalyticsData[] = analyticsRaw.map(a => ({
      period: a._id.period,
      projectId: a._id.projectId?.toString(),
      requests: a.requests,
      tokens: a.tokens,
      cost: a.cost,
      latency: a.latency,
      errors: a.errors
    }));

    const providerColors: Record<string, string> = {
      openai: '#00A67E',
      anthropic: '#d97757',
      gemini: '#4285F4'
    };

    const providerMatch: any = {};
    if (project && project !== 'all') {
      providerMatch.projectId = new mongoose.Types.ObjectId(project);
    }

    const providersRaw = await UsageRecord.aggregate([
      { $match: providerMatch },
      {
        $group: {
          _id: '$provider',
          requests: { $sum: 1 },
          cost: { $sum: { $ifNull: ['$cost', 0] } }
        }
      }
    ]);

    const totalProviderRequests =
      providersRaw.reduce((sum, p) => sum + p.requests, 0) || 1;

    const providers = providersRaw.map(p => ({
      provider: p._id,
      requests: p.requests,
      cost: p.cost,
      color: providerColors[p._id] || '#888',
      percentage: +(p.requests * 100 / totalProviderRequests).toFixed(1)
    }));

    const modelsRaw = await UsageRecord.aggregate([
      { $match: match },
      {
        $group: {
          _id: '$modelName',
          requests: { $sum: 1 },
          tokens: { $sum: { $ifNull: ['$totalTokens', 0] } },
          cost: { $sum: { $ifNull: ['$cost', 0] } },
          avgLatency: { $avg: '$responseTime' }
        }
      },
      { $sort: { requests: -1 } }
    ]);

    const models: ModelData[] = modelsRaw.map(m => ({
      model: m._id || 'Unknown',
      requests: m.requests,
      tokens: m.tokens,
      cost: m.cost,
      avgLatency: m.avgLatency ? +(m.avgLatency / 1000).toFixed(2) : 0
    }));

    const projectsRaw = await UsageRecord.aggregate([
      { $match: match },
      { $group: { _id: '$projectId' } }
    ]);

    let projects: { id: string; name: string }[] = [];

    if (projectsRaw.length) {
      const ids = projectsRaw.map(p => p._id).filter(Boolean);

      const projectDocs = await Project.find(
        { _id: { $in: ids } },
        { _id: 1, name: 1 }
      ).lean();

      const idToName = Object.fromEntries(
        projectDocs.map(p => [p._id.toString(), p.name])
      );

      projects = projectsRaw.map(p => ({
        id: p._id.toString(),
        name: idToName[p._id.toString()] || p._id.toString()
      }));
    }

    return { analytics, providers, models, projects };
  }
}

export const analyticsRepository = new AnalyticsRepository();
