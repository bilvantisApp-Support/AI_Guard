import mongoose from 'mongoose';
import { Team, ITeam, ITeamMember, ITeamUsageMetrics } from '../models/team.model';
import { Project } from '../models/project.model';

export interface CreateTeamDto {
  name: string;
  description?: string;
  ownerId: mongoose.Types.ObjectId;
}

export interface ITeamDto extends ITeam {
  projectCount: number;
}


export interface UpdateTeamDto {
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

export interface AddTeamMemberDto {
  userId: mongoose.Types.ObjectId;
  role: 'admin' | 'member';
}

export class TeamRepository {
  async createTeam(teamData: CreateTeamDto): Promise<ITeam> {
    const team = new Team({
      ...teamData,
      members: [
        {
          userId: teamData.ownerId,
          role: 'owner',
          addedAt: new Date(),
        },
      ],
    });
    return await team.save();
  }

  async findById(teamId: string | mongoose.Types.ObjectId): Promise<ITeam | null> {
    return await Team.findById(teamId).exec();
  }

  async findByIdWithMembers(teamId: string | mongoose.Types.ObjectId): Promise<ITeam | null> {
    return await Team.findById(teamId)
      .populate({
        path: 'members.userId',
        select: 'name email',
      })
      .exec();
  }

  async findByMember(userId: string | mongoose.Types.ObjectId, pagination: { page?: number; limit?: number }): Promise<{ teams: ITeamDto[]; total: number }> {
    const page = pagination.page || 1;
    const limit = pagination.limit || 10;
    const skip = (page - 1) * limit;

    const userObjectId = { 'members.userId': new mongoose.Types.ObjectId(userId) }
    const teams = await Team.aggregate([
      {
        $match: userObjectId
      },
      {
        $lookup: {
          from: 'projects',
          localField: '_id',
          foreignField: 'teamIds',
          as: 'projects'
        }
      },
      {
        $addFields: {
          projectCount: { $size: '$projects' }
        }
      },
      { $skip: skip },
      { $limit: limit },
    ]);

    const total = await Team.countDocuments(userObjectId);

    return { teams, total };
  }


  async updateTeam(
    teamId: string | mongoose.Types.ObjectId,
    updateData: UpdateTeamDto
  ): Promise<ITeam | null> {
    return await Team.findByIdAndUpdate(
      teamId,
      { $set: updateData },
      { new: true }
    ).exec();
  }

  async deleteTeam(teamId: string | mongoose.Types.ObjectId): Promise<ITeam | null> {
    return await Team.findByIdAndDelete(teamId).exec();
  }

  async addMember(
    teamId: string | mongoose.Types.ObjectId,
    memberData: AddTeamMemberDto
  ): Promise<ITeam | null> {
    const member: ITeamMember = {
      ...memberData,
      addedAt: new Date(),
    };

    return await Team.findByIdAndUpdate(
      teamId,
      { $push: { members: member } },
      { new: true }
    ).exec();
  }

  async removeMember(
    teamId: string | mongoose.Types.ObjectId,
    userId: string | mongoose.Types.ObjectId
  ): Promise<ITeam | null> {
    return await Team.findByIdAndUpdate(
      teamId,
      { $pull: { members: { userId } } },
      { new: true }
    ).exec();
  }

  async updateMemberRole(
    teamId: string | mongoose.Types.ObjectId,
    userId: string | mongoose.Types.ObjectId,
    role: 'admin' | 'member'
  ): Promise<ITeam | null> {
    return await Team.findOneAndUpdate(
      { _id: teamId, 'members.userId': userId },
      { $set: { 'members.$.role': role } },
      { new: true }
    ).exec();
  }

  async isMember(
    teamId: string | mongoose.Types.ObjectId,
    userId: string | mongoose.Types.ObjectId
  ): Promise<boolean> {
    const team = await Team.findOne({
      _id: teamId,
      'members.userId': userId,
    }).exec();

    return !!team;
  }

  async getMemberRole(
    teamId: string | mongoose.Types.ObjectId,
    userId: string | mongoose.Types.ObjectId
  ): Promise<string | null> {
    const team = await Team.findOne({
      _id: teamId,
      'members.userId': userId,
    }).exec();

    if (!team) {
      return null;
    }

    const member = team.members.find(
      (m) => m.userId.toString() === userId.toString()
    );

    return member?.role || null;
  }

  async assignProject(
    teamId: string | mongoose.Types.ObjectId,
    projectId: string | mongoose.Types.ObjectId
  ): Promise<void> {
    await Project.findByIdAndUpdate(projectId, { $addToSet: { teamIds: teamId } }).exec();
  }

  async removeProject(
    teamId: string | mongoose.Types.ObjectId,
    projectId: string | mongoose.Types.ObjectId
  ): Promise<void> {
    await Project.findByIdAndUpdate(
      projectId,
      { $pull: { teamIds: teamId } }
    ).exec();
  }


  async listProjects(
    teamId: string | mongoose.Types.ObjectId
  ): Promise<{ id: string; name: string; ownerId: mongoose.Types.ObjectId }[]> {
    const projects = await Project.find({ teamIds: teamId })
      .select({ _id: 1, name: 1, ownerId: 1 })
      .exec();
    return projects.map((p) => ({
      id: p._id.toString(),
      name: p.name,
      ownerId: p.ownerId,
    }));
  }

  async updateUsage(
    teamId: string | mongoose.Types.ObjectId,
    usage: {
      requests?: number;
      tokens?: number;
      cost?: number;
    }
  ): Promise<void> {
    const team = await Team.findById(teamId);

    if (!team) return;
    const now = new Date();
    const today = now.toISOString().split('T')[0];
    const currentMonth = today.slice(0, 7);

    const sets: any = {
      'usage.lastUpdated': now
    };

    if (!team.usage.currentDay?.date || team.usage.currentDay?.date.toISOString().split('T')[0] !== today) {
      sets['usage.currentDay'] = {
        date: now,
        requests: 0,
        tokens: 0,
        cost: 0
      };
    }

    if (!team.usage.currentMonth?.month || team.usage.currentMonth.month !== currentMonth) {
      sets['usage.currentMonth'] = {
        month: currentMonth,
        requests: 0,
        tokens: 0,
        cost: 0
      };
    }

    const increments: any = {};

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

    const updateQuery: any = { $set: sets };
    if (Object.keys(increments).length > 0) {
      updateQuery.$inc = increments;
    }

    await Team.findByIdAndUpdate(teamId, updateQuery).exec();
  }

  async resetDailyUsage(): Promise<void> {
    await Team.updateMany(
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
    await Team.updateMany(
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

  async getTeamUsage(teamId: string | mongoose.Types.ObjectId): Promise<ITeamUsageMetrics | null> {
    const team = await Team.findById(teamId, { usage: 1 }).exec();
    return team?.usage || null;
  }
}

export const teamRepository = new TeamRepository();
