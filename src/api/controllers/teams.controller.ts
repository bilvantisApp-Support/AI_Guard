import { Context } from 'koa';
import mongoose from 'mongoose';
import { teamRepository } from '../../database/repositories/team.repository';
import { projectRepository } from '../../database/repositories/project.repository';
import { userRepository } from '../../database/repositories/user.repository';
import { usageTracker } from '../../interceptors/response/usage-tracker';
import { quotaChecker } from '../../interceptors/request/quota-checker';
import { rateLimiter } from '../../interceptors';
import { logger } from '../../utils/logger';
import { ProxyError, ProxyErrorType } from '../../types/proxy';
import { User } from '../../database/models/user.model';

export class TeamsController {
  /**
   * Create new team
   * POST /_api/teams
   */
  static async createTeam(ctx: Context): Promise<void> {
    try {
      const userId = ctx.state.auth!.user._id;
      const { name, description } = ctx.request.body as any;

      if (!name || !name.trim()) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 400, 'Team name is required');
      }
      if (name.length < 4) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 400, "Name must be at least 4 characters long");
      }
      if (!description || !description.trim()) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 400, 'Team description is required');
      }
      if (description.length > 200) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 400, "Description is too long");
      }

      try {
        const existingTeam = await teamRepository.findByName(name.trim());
        if (existingTeam) {
          throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 409, 'Team name already exists');
        }
      } catch (error) {
        logger.error('Team name already exists:', error);
        throw error;
      }

      const team = await teamRepository.createTeam({
        name: name.trim(),
        description,
        ownerId: userId,
      });

      ctx.body = {
        id: team._id,
        name: team.name,
        ownerId: team.ownerId,
        members: team.members,
        createdAt: team.createdAt,
      };
    } catch (error) {
      logger.error('Failed to create team:', error);
      throw error;
    }
  }

  /**
   * List user's teams
   * GET /_api/teams
   */
  static async listTeams(ctx: Context): Promise<void> {
    try {
      const userId = ctx.state.auth!.user._id;
      const page = parseInt(ctx.query.page as string) || 1;
      const limit = parseInt(ctx.query.limit as string) || 10;
      const { teams, total } = await teamRepository.findByMember(userId, { page, limit });

      const memberIds = teams.map(t => t.members).flat().map(member => member.userId.toString());
      const memberDocs = memberIds.length ? await User.find({ _id: { $in: memberIds } }).select({ _id: 1, name: 1, status: 1 }).lean() : [];
      const memberIdToData = new Map(memberDocs.map((u) => [u._id.toString(), { name: u.name, status: u.status }]));

      ctx.body = {
        teams: teams.map(team => ({
          id: team._id,
          name: team.name,
          description: team.description,
          ownerId: team.ownerId,
          memberCount: team.members.length,
          projectCount: team.projectCount,
          role: team.members.find((m) => m.userId.toString() === userId.toString())?.role,
          members: (team.members || []).map((member: any) => ({
            memberUserId: member.userId,
            name: memberIdToData.get(member.userId?.toString())?.name || undefined,
            status: memberIdToData.get(member.userId?.toString())?.status,
          })),
          createdAt: team.createdAt,
          updatedAt: team.updatedAt,
        })),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        },
      };
    } catch (error) {
      logger.error('Failed to list teams:', error);
      throw error;
    }
  }

  /**
   * Get team details
   * GET /_api/teams/:id
   */
  static async getTeam(ctx: Context): Promise<void> {
    try {
      const teamId = ctx.params.id;
      const userId = ctx.state.auth!.user._id;

      const team = await teamRepository.findByIdWithMembers(teamId);

      if (!team) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 404, 'Team not found');
      }

      const isMember = await teamRepository.isMember(teamId, userId);
      if (!isMember) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 403, 'Access denied');
      }

      const projects = await teamRepository.listProjects(teamId);

      ctx.body = {
        id: team._id,
        name: team.name,
        description: team.description,
        ownerId: team.ownerId,
        members: team.members.map((member) => {
          let memberUserId, name, email, status;
          if (
            typeof member.userId === 'object' &&
            member.userId !== null &&
            'name' in member.userId &&
            'email' in member.userId
          ) {
            memberUserId = member.userId._id as mongoose.Types.ObjectId;
            name = member.userId.name as string;
            email = member.userId.email as string;
            status = 'status' in member.userId ? member.userId.status : undefined;
          } else {
            memberUserId = member.userId;
            name = undefined;
            email = undefined;
            status = undefined;
          }

          return {
            memberUserId,
            name,
            email,
            status,
            role: member.role,
            addedAt: member.addedAt,
          };
        }),
        settings: team.settings,
        usage: team.usage,
        projects,
        createdAt: team.createdAt,
        updatedAt: team.updatedAt,
      };
    } catch (error) {
      logger.error('Failed to get team:', error);
      throw error;
    }
  }

  /**
   * Update team
   * PUT /_api/teams/:id
   */
  static async updateTeam(ctx: Context): Promise<void> {
    try {
      const teamId = ctx.params.id;

      const existingTeam = await teamRepository.findById(teamId);
      if (!existingTeam) {
        throw new ProxyError(ProxyErrorType.NOT_FOUND_ERROR, 404, 'Team not found');
      }
      const userId = ctx.state.auth!.user._id;
      const { name, settings } = ctx.request.body as any;

      const userRole = await teamRepository.getMemberRole(teamId, userId);
      if (!userRole || !['owner', 'admin'].includes(userRole)) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 403, 'Insufficient permissions');
      }

      const updateData: any = {};
      if (name !== undefined) updateData.name = name;

      type Plan = 'free' | 'pro' | 'enterprise' | 'custom';
      if (settings?.plan) {
        const validPlans = ['free', 'pro', 'enterprise', 'custom'];
        if (!validPlans.includes(settings.plan)) {
          throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 400, 'Invalid plan');
        }

        const plan = settings.plan as Plan;
        const rateDefaults = rateLimiter.getDefaults();
        const quotaDefaults = quotaChecker.getDefaults();

        updateData.settings = {
          ...existingTeam.settings,
          plan,
          rateLimitOverride:
            plan === 'custom'
              ? settings.rateLimitOverride
              : rateDefaults[plan],
          quotaOverride:
            plan === 'custom'
              ? settings.quotaOverride
              : quotaDefaults[plan],
        };
      }

      if (Object.keys(updateData).length === 0) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 400, 'No valid fields to update');
      }

      const updatedTeam = await teamRepository.updateTeam(teamId, updateData);

      if (!updatedTeam) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 404, 'Team not found');
      }

      ctx.body = {
        id: updatedTeam._id,
        name: updatedTeam.name,
        settings: updatedTeam.settings,
        updatedAt: updatedTeam.updatedAt,
      };
    } catch (error) {
      logger.error('Failed to update team:', error);
      throw error;
    }
  }

  /**
   * Delete team
   * DELETE /_api/teams/:id
   */
  static async deleteTeam(ctx: Context): Promise<void> {
    try {
      const teamId = ctx.params.id;
      const userId = ctx.state.auth!.user._id;

      const team = await teamRepository.findById(teamId);
      if (!team) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 404, 'Team not found');
      }

      if (team.ownerId.toString() !== userId.toString()) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 403, 'Only team owner can delete the team');
      }

      await projectRepository.removeTeamFromProjects(teamId);
      await teamRepository.deleteTeam(teamId);

      ctx.body = {
        message: 'Team deleted successfully',
        teamId,
        deletedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Failed to delete team:', error);
      throw error;
    }
  }

  /**
   * Add member to team
   * POST /_api/teams/:id/members
   */
  static async addMember(ctx: Context): Promise<void> {
    try {
      const teamId = ctx.params.id;
      const userId = ctx.state.auth!.user._id;
      const { email, role } = ctx.request.body as any;

      const userRole = await teamRepository.getMemberRole(teamId, userId);
      if (!userRole || !['owner', 'admin'].includes(userRole)) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 403, 'Insufficient permissions');
      }

      const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      if (!regex.test(email)) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 400, "Invalid email format");
      }

      if (!email) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 400, 'Email is required');
      }
      if (!role || !['admin', 'member'].includes(role)) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 400, 'Role must be admin or member');
      }

      const newMember = await userRepository.findByEmail(email);
      if (!newMember) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 404, 'User not found');
      }

      const isAlreadyMember = await teamRepository.isMember(teamId, newMember._id);
      if (isAlreadyMember) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 409, 'User is already a team member');
      }

      const updatedTeam = await teamRepository.addMember(teamId, {
        userId: newMember._id,
        role: role === 'admin' ? 'admin' : 'member',
      });

      if (!updatedTeam) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 404, 'Team not found');
      }

      ctx.body = {
        message: 'Member added successfully',
        member: {
          userId: newMember._id,
          email: newMember.email,
          name: newMember.name,
          role: role === 'admin' ? 'admin' : 'member',
          addedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      logger.error('Failed to add member:', error);
      throw error;
    }
  }

  /**
   * Update member role in team
   * PUT /_api/teams/:id/members/:memberId
   */
  static async updateMemberRole(ctx: Context): Promise<void> {
    try {
      const teamId = ctx.params.id;
      const memberId = ctx.params.memberId;
      const { role } = ctx.request.body as { role: 'admin' | 'member' };

      const userId = ctx.state.auth!.user._id;

      if (!role || !['admin', 'member'].includes(role)) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 400, 'Invalid role');
      }

      const userRole = await teamRepository.getMemberRole(teamId, userId);
      if (!userRole || !['owner', 'admin'].includes(userRole)) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 403, 'Insufficient permissions');
      }

      const team = await teamRepository.findById(teamId);
      if (!team) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 404, 'Team not found');
      }

      const selectedMember = team.members.find((m) => m.userId.toString() === memberId.toString());
      if (!selectedMember) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 404, 'Selected member not found');
      }

      if (selectedMember.role === 'owner') {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 400, 'Cannot change owner role');
      }

      if (selectedMember.role === role) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 400, 'Member already has this role');
      }

      const updatedTeam = await teamRepository.updateMemberRole(
        teamId,
        memberId,
        role
      );

      if (!updatedTeam) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 404, 'Team or member not found');
      }

      ctx.body = {
        message: 'Member role updated successfully',
        member: {
          userId: memberId,
          role,
          updatedAt: new Date().toISOString(),
        },
      };
    } catch (error) {
      logger.error('Failed to update member role:', error);
      throw error;
    }
  }

  /**
   * Remove member from team
   * DELETE /_api/teams/:id/members/:memberId
   */
  static async removeMember(ctx: Context): Promise<void> {
    try {
      const teamId = ctx.params.id;
      const memberId = ctx.params.memberId;
      const userId = ctx.state.auth!.user._id;

      const userRole = await teamRepository.getMemberRole(teamId, userId);
      if (!userRole || !['owner', 'admin'].includes(userRole)) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 403, 'Insufficient permissions');
      }

      const team = await teamRepository.findById(teamId);
      if (!team) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 404, 'Team not found');
      }

      if (team.ownerId.toString() === memberId.toString()) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 400, 'Cannot remove team owner');
      }

      const updatedTeam = await teamRepository.removeMember(teamId, memberId);

      if (!updatedTeam) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 404, 'Team or member not found');
      }

      ctx.body = {
        message: 'Member removed successfully',
        memberId,
        removedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Failed to remove member:', error);
      throw error;
    }
  }

  /**
   * Assign project to team
   * POST /_api/teams/:id/projects
   */
  static async assignProject(ctx: Context): Promise<void> {
    try {
      const teamId = ctx.params.id;
      const userId = ctx.state.auth!.user._id;
      const { projectId } = ctx.request.body as any;

      if (!projectId) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 400, 'Project ID is required');
      }

      const teamRole = await teamRepository.getMemberRole(teamId, userId);
      if (!teamRole || !['owner', 'admin'].includes(teamRole)) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 403, 'Insufficient permissions');
      }

      const project = await projectRepository.findById(projectId);
      if (!project) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 404, 'Project not found');
      }

      const projectRole = await projectRepository.getMemberRole(projectId, userId);
      if (!projectRole || !['owner', 'admin'].includes(projectRole)) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 403, 'Insufficient project permissions');
      }

      await teamRepository.assignProject(teamId, projectId);

      ctx.body = {
        message: 'Project assigned to team',
        teamId,
        projectId,
        assignedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Failed to assign project:', error);
      throw error;
    }
  }

  /**
   * Remove project from team
   * DELETE /_api/teams/:id/projects/:projectId
   */
  static async removeProject(ctx: Context): Promise<void> {
    try {
      const teamId = ctx.params.id;
      const projectId = ctx.params.projectId;
      const userId = ctx.state.auth!.user._id;

      const teamRole = await teamRepository.getMemberRole(teamId, userId);
      if (!teamRole || !['owner', 'admin'].includes(teamRole)) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 403, 'Insufficient permissions');
      }

      const project = await projectRepository.findById(projectId);
      if (!project) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 404, 'Project not found');
      }

      if (!project.teamIds?.some(id => id.toString() === teamId.toString())) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 400, 'Project is not assigned to this team');
      }

      await teamRepository.removeProject(teamId, projectId);

      ctx.body = {
        message: 'Project removed from team',
        teamId,
        projectId,
        removedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Failed to remove project:', error);
      throw error;
    }
  }

  /**
   * Get team usage statistics
   * GET /_api/teams/:id/usage
   */
  static async getUsageStats(ctx: Context): Promise<void> {
    try {
      const teamId = ctx.params.id;
      const userId = ctx.state.auth!.user._id;
      const { startDate, endDate } = ctx.query;

      const isMember = await teamRepository.isMember(teamId, userId);
      if (!isMember) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 403, 'Access denied');
      }

      const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const end = endDate ? new Date(endDate as string) : new Date();

      const stats = await usageTracker.getTeamUsageStats(teamId, start, end);

      ctx.body = {
        teamId,
        period: { start, end },
        ...stats,
      };
    } catch (error) {
      logger.error('Failed to get team usage stats:', error);
      throw error;
    }
  }
}
