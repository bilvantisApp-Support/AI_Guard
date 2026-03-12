import { Context } from 'koa';
import { projectRepository } from '../../database/repositories/project.repository';
import { userRepository } from '../../database/repositories/user.repository';
import { KeyManager } from '../../security/key-manager';
import { HashingService } from '../../security/hashing';
import { usageTracker } from '../../interceptors/response/usage-tracker';
import { quotaChecker } from '../../interceptors/request/quota-checker';
import { logger } from '../../utils/logger';
import { ProxyError, ProxyErrorType } from '../../types/proxy';
import mongoose from 'mongoose';
import { rateLimiter } from '../../interceptors';
import { validateApiKeyRepository } from '../../database/repositories/validateapikey.repository';

export class ProjectsController {
  /**
   * Create new project
   * POST /_api/projects
   */
  static async createProject(ctx: Context): Promise<void> {
    try {
      const userId = ctx.state.auth!.user._id;
      const { name, description } = ctx.request.body as any;

      if (!name || !name.trim()) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 400, 'Project name is required');
      }

      if (name.length < 4) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 400, "Name must be at least 4 characters long");
      }
      if (!description || !description.trim()) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 400, 'Project description is required');
      }

      if (description.length > 200) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 400, "Description is too long")
      }

      const existingProject = await projectRepository.findByName(name.trim());

      if (existingProject) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 409, 'Project name already exists');
      }

      const project = await projectRepository.createProject({
        name: name.trim(),
        description,
        ownerId: userId,
      });

      ctx.body = {
        id: project._id,
        name: project.name,
        ownerId: project.ownerId,
        members: project.members,
        createdAt: project.createdAt,
      };
    } catch (error) {
      logger.error('Failed to create project:', error);
      throw error;
    }
  }

  /**
   * List user's projects
   * GET /_api/projects
   */
  static async listProjects(ctx: Context): Promise<void> {
    try {
      const userId = ctx.state.auth!.user._id;
      const page = parseInt(ctx.query.page as string) || 1;
      const limit = parseInt(ctx.query.limit as string) || 20;
      const { projects, total } = await projectRepository.findByMember(userId, { page, limit });

      ctx.body = {
        projects: projects.map(project => ({
          id: project._id,
          name: project.name,
          ownerId: project.ownerId,
          teamId: project.teamIds,
          memberCount: project.members.length,
          members: project.members.map(member => {
            if (typeof member.userId === 'object' && member.userId !== null && 'name' in member.userId) {
              return {
                memberUserId: member.userId._id,
                name: member.userId.name,
              };
            }
            return {
              memberUserId: member.userId,
              name: undefined,
            };
          }),
          apiKeyCount: project.apiKeys.length,
          role: project.members.find(m => m.userId._id.toString() === userId.toString())?.role,
          createdAt: project.createdAt,
          updatedAt: project.updatedAt,
        })),
        pagination: {
          page,
          limit,
          total,
          pages: Math.ceil(total / limit)
        },
      };
    } catch (error) {
      logger.error('Failed to list projects:', error);
      throw error;
    }
  }

  /**
   * Get project details
   * GET /_api/projects/:id
   */
  static async getProject(ctx: Context): Promise<void> {
    try {
      const projectId = ctx.params.id;
      const userId = ctx.state.auth!.user._id;

      const project = await projectRepository.findByIdWithMembers(projectId);

      if (!project) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 404, 'Project not found');
      }

      // Check if user is a member
      const isMember = await projectRepository.isMember(projectId, userId);
      if (!isMember) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 403, 'Access denied');
      }

      const userRole = await projectRepository.getMemberRole(projectId, userId);

      ctx.body = {
        id: project._id,
        name: project.name,
        description: project.description,
        ownerId: project.ownerId,
        teamId: project.teamIds,
        members: project.members.map(member => {
          let memberUserId, name, email;
          if (
            typeof member.userId === 'object' &&
            member.userId !== null &&
            'name' in member.userId &&
            'email' in member.userId
          ) {
            memberUserId = member.userId._id as mongoose.Types.ObjectId;
            name = member.userId.name as string;
            email = member.userId.email as string;
          } else {
            memberUserId = member.userId;
            name = undefined;
            email = undefined;
          }

          return {
            memberUserId,
            name,
            email,
            role: member.role,
            addedAt: member.addedAt,
          };
        }),

        settings: project.settings,
        usage: project.usage,
        userRole,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
      };
    } catch (error) {
      logger.error('Failed to get project:', error);
      throw error;
    }
  }

  /**
   * Update project
   * PUT /_api/projects/:id
   */
  static async updateProject(ctx: Context): Promise<void> {
    try {
      const projectId = ctx.params.id;
      const existingProject = await projectRepository.findById(projectId);
      if (!existingProject) {
        throw new ProxyError(ProxyErrorType.NOT_FOUND_ERROR, 404, 'Project not found');
      }
      const userId = ctx.state.auth!.user._id;
      const { name, settings } = ctx.request.body as any;

      // Check permissions
      const userRole = await projectRepository.getMemberRole(projectId, userId);
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
          ...existingProject.settings,
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

      const updatedProject = await projectRepository.updateProject(projectId, updateData);

      if (!updatedProject) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 404, 'Project not found');
      }

      ctx.body = {
        id: updatedProject._id,
        name: updatedProject.name,
        settings: updatedProject.settings,
        updatedAt: updatedProject.updatedAt,
      };
    } catch (error) {
      logger.error('Failed to update project:', error);
      throw error;
    }
  }

  /**
   * Delete project
   * DELETE /_api/projects/:id
   */
  static async deleteProject(ctx: Context): Promise<void> {
    try {
      const projectId = ctx.params.id;
      const userId = ctx.state.auth!.user._id;

      const project = await projectRepository.findById(projectId);

      if (!project) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 404, 'Project not found');
      }

      // Only owner can delete project
      if (project.ownerId.toString() !== userId.toString()) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 403, 'Only project owner can delete the project');
      }

      await projectRepository.deleteProject(projectId);

      ctx.body = {
        message: 'Project deleted successfully',
        projectId,
        deletedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Failed to delete project:', error);
      throw error;
    }
  }

  /**
   * Add API key to project
   * POST /_api/projects/:id/keys
   */
  static async addApiKey(ctx: Context): Promise<void> {
    try {
      const projectId = ctx.params.id;
      const userId = ctx.state.auth!.user._id;
      const { provider, apiKey } = ctx.request.body as any;

      // Check permissions
      const userRole = await projectRepository.getMemberRole(projectId, userId);
      if (!userRole || !['owner', 'admin'].includes(userRole)) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 403, 'Insufficient permissions');
      }

      if (!provider || !apiKey) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 400, 'Provider and API key are required');
      }

      // Validate provider
      const validProviders = ['openai', 'anthropic', 'gemini'];
      if (!validProviders.includes(provider.toLowerCase())) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 400, 'Invalid provider');
      }

      switch (provider.toLowerCase()) {
        case 'openai':
          await validateApiKeyRepository.validateOpenAIKey(apiKey);
          break;
        case 'anthropic':
          await validateApiKeyRepository.validateAnthropicKey(apiKey);
          break;
        case 'gemini':
          await validateApiKeyRepository.validateGeminiKey(apiKey);
          break;
        default:
          throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 400, "Unsupported provider");
      }

      // Encrypt the API key
      const { encryptedKey, keyId } = KeyManager.encryptApiKey(apiKey, provider, userId.toString());

      const updatedProject = await projectRepository.addApiKey(projectId, {
        provider: provider.toLowerCase(),
        encryptedKey,
        keyId,
        addedBy: userId,
      });

      if (!updatedProject) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 404, 'Project not found');
      }

      ctx.body = {
        message: 'API key added successfully',
        keyId,
        provider: provider.toLowerCase(),
        maskedKey: HashingService.maskToken(apiKey),
        addedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Failed to add API key:', error);
      throw error;
    }
  }

  /**
   * List project API keys (masked)
   * GET /_api/projects/:id/keys
   */
  static async listApiKeys(ctx: Context): Promise<void> {
    try {
      const projectId = ctx.params.id;
      const userId = ctx.state.auth!.user._id;

      // Check if user is a member
      const isMember = await projectRepository.isMember(projectId, userId);
      if (!isMember) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 403, 'Access denied');
      }

      const project = await projectRepository.findById(projectId);

      if (!project) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 404, 'Project not found');
      }

      const keys = project.apiKeys.map(key => {
        // Try to decrypt for masking (safely)
        let maskedKey = '****';
        try {
          const decrypted = KeyManager.decryptApiKey(key.encryptedKey);
          maskedKey = HashingService.maskToken(decrypted);
        } catch (error) {
          // If decryption fails, use default mask
        }

        return {
          keyId: key.keyId,
          provider: key.provider,
          maskedKey,
          isActive: key.isActive,
          addedBy: key.addedBy,
          addedAt: key.addedAt,
        };
      });

      ctx.body = {
        keys,
        total: keys.length,
      };
    } catch (error) {
      logger.error('Failed to list API keys:', error);
      throw error;
    }
  }

  /**
   * Remove API key from project
   * DELETE /_api/projects/:id/keys/:keyId
   */
  static async removeApiKey(ctx: Context): Promise<void> {
    try {
      const projectId = ctx.params.id;
      const keyId = ctx.params.keyId;
      const userId = ctx.state.auth!.user._id;

      // Check permissions
      const userRole = await projectRepository.getMemberRole(projectId, userId);
      if (!userRole || !['owner', 'admin'].includes(userRole)) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 403, 'Insufficient permissions');
      }

      const updatedProject = await projectRepository.removeApiKey(projectId, keyId);

      if (!updatedProject) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 404, 'Project or API key not found');
      }

      ctx.body = {
        message: 'API key removed successfully',
        keyId,
        removedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Failed to remove API key:', error);
      throw error;
    }
  }

  /**
   * Get project usage statistics
   * GET /_api/projects/:id/usage
   */
  static async getUsageStats(ctx: Context): Promise<void> {
    try {
      const projectId = ctx.params.id;
      const userId = ctx.state.auth!.user._id;
      const { startDate, endDate } = ctx.query;

      // Check if user is a member
      const isMember = await projectRepository.isMember(projectId, userId);
      if (!isMember) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 403, 'Access denied');
      }

      const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const end = endDate ? new Date(endDate as string) : new Date();

      const stats = await usageTracker.getProjectUsageStats(projectId, start, end);

      ctx.body = {
        projectId,
        period: { start, end },
        ...stats,
      };
    } catch (error) {
      logger.error('Failed to get usage stats:', error);
      throw error;
    }
  }

  /**
   * Get project quota status
   * GET /_api/projects/:id/quota
   */
  static async getQuotaStatus(ctx: Context): Promise<void> {
    try {
      const projectId = ctx.params.id;
      const userId = ctx.state.auth!.user._id;

      // Check if user is a member
      const isMember = await projectRepository.isMember(projectId, userId);
      if (!isMember) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 403, 'Access denied');
      }

      const project = await projectRepository.findById(projectId);

      if (!project) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 404, 'Project not found');
      }

      const quotaStatus = await quotaChecker.checkQuota(project);

      ctx.body = {
        projectId,
        ...quotaStatus,
      };
    } catch (error) {
      logger.error('Failed to get quota status:', error);
      throw error;
    }
  }

  /**
   * Add member to project
   * POST /_api/projects/:id/members
   */
  static async addMember(ctx: Context): Promise<void> {
    try {
      const projectId = ctx.params.id;
      const userId = ctx.state.auth!.user._id;
      const { email, role } = ctx.request.body as any;

      // Check permissions (only owner and admin can add members)
      const userRole = await projectRepository.getMemberRole(projectId, userId);
      if (!userRole || !['owner', 'admin'].includes(userRole)) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 403, 'Insufficient permissions');
      }

      const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      if (!regex.test(email)) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 400, "Invalid email format");
      }

      if (!role || !['admin', 'member'].includes(role)) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 403, 'Invalid role');
      }

      if (!email || !role) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 400, 'Email and role are required');
      }

      // Find user by email
      const newMember = await userRepository.findByEmail(email);
      if (!newMember) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 404, 'User not found');
      }

      // Check if user is already a member
      const isAlreadyMember = await projectRepository.isMember(projectId, newMember._id);
      if (isAlreadyMember) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 409, 'User is already a project member');
      }

      const updatedProject = await projectRepository.addMember(projectId, {
        userId: newMember._id,
        role: role === 'admin' ? 'admin' : 'member',
      });

      if (!updatedProject) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 404, 'Project not found');
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
   * Update member from project
   * PUT /_api/projects/:id/members/:memberId
   */

  static async updateMemberRole(ctx: Context): Promise<void> {
    try {
      const projectId = ctx.params.id;
      const memberId = ctx.params.memberId;
      const { role } = ctx.request.body as { role: 'admin' | 'member' }

      const userId = ctx.state.auth!.user._id;

      //Check valid roles
      if (!role || !['admin', 'member'].includes(role)) {
        throw new ProxyError(
          ProxyErrorType.INVALID_REQUEST,
          400,
          'Invalid role'
        );
      }

      // Check permissions
      const userRole = await projectRepository.getMemberRole(projectId, userId);
      if (!userRole || !['owner', 'admin'].includes(userRole)) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 403, 'Insufficient permissions');
      }

      //Check project exist
      const project = await projectRepository.findById(projectId);
      if (!project) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 404, 'Project not found');
      }

      //Check member exist
      const selectedMember = project.members.find(
        (m) => m.userId == memberId
      );
      if (!selectedMember) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 404, 'selected member not found');
      }

      //Owner role cannot be changed
      if (selectedMember.role == 'owner') {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 400, 'Cannot change owner role');
      }

      //Prevent to change same role
      if (selectedMember.role == role) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 400, 'Member already has this role');
      }

      // Update role
      const updatedProject = await projectRepository.updateMemberRole(
        projectId,
        memberId,
        role
      );

      if (!updatedProject) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 404, 'Project or member not found');
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
   * Remove member from project
   * DELETE /_api/projects/:id/members/:memberId
   */
  static async removeMember(ctx: Context): Promise<void> {
    try {
      const projectId = ctx.params.id;
      const memberId = ctx.params.memberId;
      const userId = ctx.state.auth!.user._id;

      // Check permissions
      const userRole = await projectRepository.getMemberRole(projectId, userId);
      if (!userRole || !['owner', 'admin'].includes(userRole)) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 403, 'Insufficient permissions');
      }

      // Can't remove the owner
      const project = await projectRepository.findById(projectId);
      if (!project) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 404, 'Project not found');
      }

      if (project.ownerId.toString() === memberId) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 400, 'Cannot remove project owner');
      }

      const updatedProject = await projectRepository.removeMember(projectId, memberId);

      if (!updatedProject) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 404, 'Project or member not found');
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
}
