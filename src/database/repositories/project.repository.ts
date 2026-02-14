import mongoose from 'mongoose';
import { Project, IProject, IProviderApiKey, IProjectMember, IUsageMetrics } from '../models/project.model';

export interface CreateProjectDto {
  name: string;
  description?: string;
  ownerId: mongoose.Types.ObjectId;
}

export interface UpdateProjectDto {
  name?: string;
  settings?: {
    rateLimitOverride?: {
      windowMs: number;
      maxRequests: number;
    };
    quotaOverride?: {
      monthlyLimit: number;
      dailyLimit: number;
    };
    allowedProviders?: string[];
    webhookUrl?: string;
  };
}

export interface AddApiKeyDto {
  provider: 'openai' | 'anthropic' | 'gemini';
  encryptedKey: string;
  keyId: string;
  addedBy: mongoose.Types.ObjectId;
}

export interface AddMemberDto {
  userId: mongoose.Types.ObjectId;
  role: 'admin' | 'member';
}

export class ProjectRepository {
  async createProject(projectData: CreateProjectDto): Promise<IProject> {
    const project = new Project({
      ...projectData,
      members: [{
        userId: projectData.ownerId,
        role: 'owner',
        addedAt: new Date(),
      }],
    });
    return await project.save();
  }

  async findById(projectId: string | mongoose.Types.ObjectId): Promise<IProject | null> {
    return await Project.findById(projectId).exec();
  }
  
  async findByIdWithMembers(projectId: String | mongoose.Types.ObjectId): Promise<IProject | null> {
    return await Project.findById(projectId).populate({
      path: 'members.userId',
      select: 'name email'
    }).exec();
  }


  async findByOwner(ownerId: string | mongoose.Types.ObjectId): Promise<IProject[]> {
    return await Project.find({ ownerId }).exec();
  }

  async findByMember(userId: string | mongoose.Types.ObjectId): Promise<IProject[]> {
    return await Project.find({ 'members.userId': userId }).exec();
  }

  async findByTeam(teamId: string | mongoose.Types.ObjectId): Promise<IProject[]> {
    return await Project.find({ teamId }).exec();
  }

  async updateProject(
    projectId: string | mongoose.Types.ObjectId,
    updateData: UpdateProjectDto
  ): Promise<IProject | null> {
    return await Project.findByIdAndUpdate(
      projectId,
      { $set: updateData },
      { new: true }
    ).exec();
  }

  async addApiKey(
    projectId: string | mongoose.Types.ObjectId,
    apiKeyData: AddApiKeyDto
  ): Promise<IProject | null> {
    const apiKey: IProviderApiKey = {
      ...apiKeyData,
      isActive: true,
      addedAt: new Date(),
    };

    return await Project.findByIdAndUpdate(
      projectId,
      {
        $push: { apiKeys: apiKey },
        $addToSet: { 'settings.allowedProviders': apiKey.provider }
      },
      { new: true }
    ).exec();
  }

  async updateApiKey(
    projectId: string | mongoose.Types.ObjectId,
    keyId: string,
    updates: { isActive?: boolean; encryptedKey?: string }
  ): Promise<IProject | null> {
    const updateFields: any = {};
    if (updates.isActive !== undefined) {
      updateFields['apiKeys.$.isActive'] = updates.isActive;
    }
    if (updates.encryptedKey !== undefined) {
      updateFields['apiKeys.$.encryptedKey'] = updates.encryptedKey;
    }

    return await Project.findOneAndUpdate(
      { _id: projectId, 'apiKeys.keyId': keyId },
      { $set: updateFields },
      { new: true }
    ).exec();
  }

  async removeApiKey(
    projectId: string | mongoose.Types.ObjectId,
    keyId: string
  ): Promise<IProject | null> {
    return await Project.findByIdAndUpdate(
      projectId,
      { $pull: { apiKeys: { keyId } } },
      { new: true }
    ).exec();
  }

  async getActiveApiKey(
    projectId: string | mongoose.Types.ObjectId,
    provider: string
  ): Promise<IProviderApiKey | null> {
    const project = await Project.findOne(
      {
        _id: projectId,
        'apiKeys.provider': provider,
        'apiKeys.isActive': true,
      },
      { 'apiKeys.$': 1 }
    ).exec();

    return project?.apiKeys?.[0] || null;
  }

  async addMember(
    projectId: string | mongoose.Types.ObjectId,
    memberData: AddMemberDto
  ): Promise<IProject | null> {
    const member: IProjectMember = {
      ...memberData,
      addedAt: new Date(),
    };

    return await Project.findByIdAndUpdate(
      projectId,
      { $push: { members: member } },
      { new: true }
    ).exec();
  }

  async removeMember(
    projectId: string | mongoose.Types.ObjectId,
    userId: string | mongoose.Types.ObjectId
  ): Promise<IProject | null> {
    return await Project.findByIdAndUpdate(
      projectId,
      { $pull: { members: { userId } } },
      { new: true }
    ).exec();
  }

  async updateMemberRole(
    projectId: string | mongoose.Types.ObjectId,
    userId: string | mongoose.Types.ObjectId,
    role: 'admin' | 'member'
  ): Promise<IProject | null> {
    return await Project.findOneAndUpdate(
      { _id: projectId, 'members.userId': userId },
      { $set: { 'members.$.role': role } },
      { new: true }
    ).exec();
  }

  async isMember(
    projectId: string | mongoose.Types.ObjectId,
    userId: string | mongoose.Types.ObjectId
  ): Promise<boolean> {
    const project = await Project.findOne({
      _id: projectId,
      'members.userId': userId,
    }).exec();

    return !!project;
  }

  async getMemberRole(
    projectId: string | mongoose.Types.ObjectId,
    userId: string | mongoose.Types.ObjectId
  ): Promise<string | null> {
    const project = await Project.findOne({
      _id: projectId,
      'members.userId': userId,
    }).exec();

    if (!project) {
      return null;
    }

    const member = project.members.find(
      (m) => m.userId.toString() === userId.toString()
    );

    return member?.role || null;
  }

  async assignTeam(
    projectId: string | mongoose.Types.ObjectId,
    teamId: string | mongoose.Types.ObjectId
  ): Promise<IProject | null> {
    return await Project.findByIdAndUpdate(
      projectId,
      { $set: { teamId } },
      { new: true }
    ).exec();
  }

  async removeTeam(
    projectId: string | mongoose.Types.ObjectId
  ): Promise<IProject | null> {
    return await Project.findByIdAndUpdate(
      projectId,
      { $unset: { teamId: 1 } },
      { new: true }
    ).exec();
  }

  async updateUsage(
    projectId: string | mongoose.Types.ObjectId,
    usage: {
      requests?: number;
      tokens?: number;
      cost?: number;
    }
  ): Promise<void> {
    const increments: any = {};
    const sets: any = {
      'usage.lastUpdated': new Date(),
    };

    if (usage.requests !== undefined) {
      increments['usage.total.requests'] = usage.requests;
      increments['usage.currentMonth.requests'] = usage.requests;
      increments['usage.currentDay.requests'] = usage.requests;
    }

    if (usage.tokens !== undefined) {
      increments['usage.total.tokens'] = usage.tokens;
      increments['usage.currentMonth.tokens'] = usage.tokens;
      increments['usage.currentDay.tokens'] = usage.tokens;
    }

    if (usage.cost !== undefined) {
      increments['usage.total.cost'] = usage.cost;
      increments['usage.currentMonth.cost'] = usage.cost;
      increments['usage.currentDay.cost'] = usage.cost;
    }

    // Build update query with both $inc and $set
    const updateQuery: any = { $set: sets };
    if (Object.keys(increments).length > 0) {
      updateQuery.$inc = increments;
    }

    await Project.findByIdAndUpdate(projectId, updateQuery).exec();
  }

  async resetDailyUsage(): Promise<void> {
    await Project.updateMany(
      {},
      {
        $set: {
          'usage.currentDay.requests': 0,
          'usage.currentDay.tokens': 0,
          'usage.currentDay.cost': 0,
        },
      }
    ).exec();
  }

  async resetMonthlyUsage(): Promise<void> {
    await Project.updateMany(
      {},
      {
        $set: {
          'usage.currentMonth.requests': 0,
          'usage.currentMonth.tokens': 0,
          'usage.currentMonth.cost': 0,
        },
      }
    ).exec();
  }

  async getTotalUsage(): Promise<{
    requests: number;
    tokens: number;
    cost: number;
  }> {
    const result = await Project.aggregate([
      {
        $group: {
          _id: null,
          totalRequests: { $sum: '$usage.total.requests' },
          totalTokens: { $sum: '$usage.total.tokens' },
          totalCost: { $sum: '$usage.total.cost' },
        },
      },
    ]).exec();

    if (result.length === 0) {
      return { requests: 0, tokens: 0, cost: 0 };
    }

    return {
      requests: result[0].totalRequests || 0,
      tokens: result[0].totalTokens || 0,
      cost: result[0].totalCost || 0,
    };
  }

  async getProjectUsageStats(projectId: string | mongoose.Types.ObjectId): Promise<IUsageMetrics | null> {
    const project = await Project.findById(projectId, { usage: 1 }).exec();
    return project?.usage || null;
  }

  async deleteProject(projectId: string | mongoose.Types.ObjectId): Promise<IProject | null> {
    return await Project.findByIdAndDelete(projectId).exec();
  }
}

export const projectRepository = new ProjectRepository();
