import { Context } from 'koa';
import { userRepository } from '../../database/repositories/user.repository';
import { tokenRepository } from '../../database/repositories/token.repository';
import { PatGenerator } from '../../auth/pat/pat-generator';
import { ScopeValidator } from '../../auth/pat/pat-scopes';
import { logger } from '../../utils/logger';
import { ProxyError, ProxyErrorType } from '../../types/proxy';
import { projectRepository } from '../../database/repositories';
import { providerSnippetRepository } from '../../database/repositories/provider-snippet.repository';
import { patCreatedTemplate } from '../../services/mail/templates/pat-created.template';
import {  firebaseAdmin } from '../../auth';
import { forgotPasswordTemplate } from '../../services/mail/templates/forgot-password.template';
import { brevoService } from '../../services/mail/mail.service';

export class UsersController {
  /**
   * Get current user profile
   * GET /_api/users/profile
   */
  static async getProfile(ctx: Context): Promise<void> {
    try {
      const auth = ctx.state.auth;
      if (!auth?.user) {
        throw new ProxyError(ProxyErrorType.AUTHENTICATION_ERROR, 401, 'Authentication required');
      }

      const userId = auth.user._id;
      const user = await userRepository.getUserWithDefaultProject(userId);

      if (!user) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 404, 'User not found');
      }

      ctx.body = {
        id: user._id,
        email: user.email,
        name: user.name,
        role: user.role,
        status: user.status,
        defaultProject: user.defaultProject,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
        lastLoginAt: user.lastLoginAt,
      };
    } catch (error) {
      logger.error('Failed to get user profile:', error);
      throw error;
    }
  }

  /**
   * Get all user profile
   * GET /_api/users
   */
  static async listProfiles(ctx: Context): Promise<void> {
    try {
      const auth = ctx.state.auth;
      if (!auth?.user) {
        throw new ProxyError(ProxyErrorType.AUTHENTICATION_ERROR, 401, 'Authentication required');
      }

      const users = await userRepository.getActiveUsers();

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
        total: users.length,
      };
    } catch (error) {
      logger.error('Failed to get user profiles:', error);
      throw error;
    }
  }

  /**
   * Update user profile
   * PUT /_api/users/profile
   */
  static async updateProfile(ctx: Context): Promise<void> {
    try {
      if (!ctx.state.auth) {
        ctx.status = 401;
        ctx.body = { error: 'Authentication required' };
        return;
      }
      const userId = ctx.state.auth.user._id;
      const { name, defaultProject } = ctx.request.body as any;

      const updateData: any = {};
      if (name !== undefined) updateData.name = name;
      if (defaultProject !== undefined) updateData.defaultProject = defaultProject;

      if (Object.keys(updateData).length === 0) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 400, 'No valid fields to update');
      }

      const updatedUser = await userRepository.updateUser(userId, updateData);

      if (!updatedUser) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 404, 'User not found');
      }

      ctx.body = {
        id: updatedUser._id,
        email: updatedUser.email,
        name: updatedUser.name,
        status: updatedUser.status,
        defaultProject: updatedUser.defaultProject,
        updatedAt: updatedUser.updatedAt,
      };
    } catch (error) {
      logger.error('Failed to update user profile:', error);
      throw error;
    }
  }

  /**
   * Delete user account
   * DELETE /_api/users/account
   */
  static async deleteAccount(ctx: Context): Promise<void> {
    try {
      if (!ctx.state.auth) {
        ctx.status = 401;
        ctx.body = { error: 'Authentication required' };
        return;
      }
      const userId = ctx.state.auth.user._id;

      const user = await userRepository.findById(userId);
      if (user?.firebaseUid) {
        await firebaseAdmin.updateUser(user.firebaseUid);
        console.log(`Firebase user with UID ${user.firebaseUid} has been disabled.`);
      } 

      // Soft delete the user
      const deletedUser = await userRepository.deleteUser(userId);

      if (!deletedUser) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 404, 'User not found');
      }

      // Revoke all user's tokens
      const userTokens = await tokenRepository.findByUserId(userId);
      await Promise.all(
        userTokens.map(token => tokenRepository.revokeToken(token._id))
      );

      ctx.body = {
        message: 'Account deleted successfully',
        deletedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Failed to delete user account:', error);
      throw error;
    }
  }

  /**
   * Create Personal Access Token
   * POST /_api/users/tokens
   */
  static async createToken(ctx: Context): Promise<void> {
    try {
      if (!ctx.state.auth) {
        ctx.status = 401;
        ctx.body = { error: 'Authentication required' };
        return;
      }
      const authUserId = ctx.state.auth.user._id.toString();
      const { name, scopes, llmProvider, projectId, userId, expiresInDays } = ctx.request.body as any;

      // Validate required fields
      if (!name) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 400, 'Token name is required');
      }
      if (typeof name !== "string") {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 400, "Name must be a string");
      }

      if (!scopes || !Array.isArray(scopes) || scopes.length === 0) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 400, 'At least one scope is required');
      }

      if (!llmProvider || typeof llmProvider !== 'string') {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 400, 'LLM provider is required');
      }

      // Validate scopes
      if (!ScopeValidator.validateScopes(scopes)) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 400, 'Invalid scopes provided');
      }

      //Check the token generator project member or not
      const isMember = await projectRepository.isMember(projectId, authUserId);

      if (!isMember) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 404, 'User not a member of the project');
      }

      const memberRole = await projectRepository.getMemberRole(projectId, authUserId);
      if (memberRole == 'member') {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 403, 'Members are not allowed to create PAT');

      }

      //Check the target user should project member
      const targetMember = await projectRepository.isMember(projectId, userId);

      if (!targetMember) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 403, 'User not a member of the project');
      }

      // Check name uniqueness
      const isUnique = await PatGenerator.isTokenNameUnique(userId, name);
      if (!isUnique) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 409, 'Token name already exists');
      }

      // Generate token
      const { token, tokenRecord } = await PatGenerator.generateToken({
        userId,
        projectId,
        name,
        scopes,
        llmProvider,
        expiresInDays,
      });

      const snippets = await providerSnippetRepository.getProviderSnippet(llmProvider);
      if (!snippets) {
        throw new ProxyError(ProxyErrorType.NOT_FOUND_ERROR, 404, 'Provider snippets not found');
      }

      const user = await userRepository.findById(userId);

      if (!user) {
        throw new ProxyError(ProxyErrorType.NOT_FOUND_ERROR, 404, 'User not found');
      }
      // Enable sending OTP once the email service is ready
      const SENT_MAIL = true;

      if (user && SENT_MAIL) {
        const html = patCreatedTemplate(user.name, token, snippets);
        await brevoService.sendMail(
          user.email,
          "Your AI Guard PAT Token",
          html
        );
      }

      ctx.body = {
        id: tokenRecord._id,
        name: tokenRecord.name,
        token, // Only returned once during creation
        scopes: tokenRecord.scopes,
        llmProvider: tokenRecord.llmProvider,
        projectId: tokenRecord.projectId,
        userId: tokenRecord.userId,
        expiresAt: tokenRecord.expiresAt,
        createdAt: tokenRecord.createdAt,
      };
    } catch (error) {
      logger.error('Failed to create token:', error);
      throw error;
    }
  }

  /**
   * List user's Personal Access Tokens
   * GET /_api/users/tokens
   */
  static async listTokens(ctx: Context): Promise<void> {
    try {
      const userId = ctx.state.auth!.user._id;
      const includeRevoked = ctx.query.includeRevoked === 'true';

      const tokens = await tokenRepository.findByUserId(userId, includeRevoked);

      ctx.body = {
        tokens: tokens.map(token => ({
          id: token._id,
          name: token.name,
          scopes: token.scopes,
          projectId: token.projectId,
          lastUsedAt: token.lastUsedAt,
          expiresAt: token.expiresAt,
          isRevoked: token.isRevoked,
          createdAt: token.createdAt,
        })),
        total: tokens.length,
      };
    } catch (error) {
      logger.error('Failed to list tokens:', error);
      throw error;
    }
  }

  /**
   * Revoke Personal Access Token
   * DELETE /_api/users/tokens/:tokenId
   */
  static async revokeToken(ctx: Context): Promise<void> {
    try {
      const userId = ctx.state.auth!.user._id;
      const tokenId = ctx.params.tokenId;

      // Check if token belongs to user
      const token = await tokenRepository.findById(tokenId);
      if (!token || token.userId.toString() !== userId.toString()) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 404, 'Token not found');
      }

      const revokedToken = await tokenRepository.revokeToken(tokenId);

      if (!revokedToken) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 404, 'Token not found');
      }

      ctx.body = {
        message: 'Token revoked successfully',
        tokenId: revokedToken._id,
        revokedAt: new Date().toISOString(),
      };
    } catch (error) {
      logger.error('Failed to revoke token:', error);
      throw error;
    }
  }

  /**
   * Rotate Personal Access Token
   * POST /_api/users/tokens/:tokenId/rotate
   */
  static async rotateToken(ctx: Context): Promise<void> {
    try {
      const userId = ctx.state.auth!.user._id.toString();
      const tokenId = ctx.params.tokenId;

      const result = await PatGenerator.rotateToken(tokenId, userId);

      if (!result) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 404, 'Token not found or unauthorized');
      }

      const { token, tokenRecord } = result;

      ctx.body = {
        id: tokenRecord._id,
        name: tokenRecord.name,
        token, // New token - only returned once
        scopes: tokenRecord.scopes,
        projectId: tokenRecord.projectId,
        expiresAt: tokenRecord.expiresAt,
        createdAt: tokenRecord.createdAt,
        rotatedFrom: tokenId,
      };
    } catch (error) {
      logger.error('Failed to rotate token:', error);
      throw error;
    }
  }

  /**
   * Get user's usage summary
   * GET /_api/users/usage
   */
  static async getUsageSummary(ctx: Context): Promise<void> {
    try {
      const userId = ctx.state.auth!.user._id;
      const { startDate, endDate } = ctx.query;

      const start = startDate ? new Date(startDate as string) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // 30 days ago
      const end = endDate ? new Date(endDate as string) : new Date();

      // Get user's projects for usage aggregation
      // const projects = await userRepository.findById(userId);
      // TODO: Implement usage aggregation across user's projects
      // This would require joining with project data and usage records

      ctx.body = {
        userId,
        period: { start, end },
        summary: {
          totalRequests: 0, // TODO: Implement
          totalTokens: 0,   // TODO: Implement
          totalCost: 0,     // TODO: Implement
        },
        // TODO: Add breakdown by provider, project, etc.
      };
    } catch (error) {
      logger.error('Failed to get usage summary:', error);
      throw error;
    }
  }

  /**
 * Forgot Password
 * POST /_api/users/forgot-password
 */
  static async forgotPassword(ctx: Context): Promise<void> {

    try {
      const { email } = ctx.request.body as { email: string };

      if (typeof email !== 'string' || !email.trim()) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 400, "Email is required");
      }

      if (!email.toLowerCase().endsWith('@bilvantis.io')) {
        throw new Error('Only Bilvantis email addresses are allowed');
      }

      const regex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
      if (!regex.test(email)) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 400, "Invalid email format");
      }

      if (!email || !email.trim()) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 400, "Email is required");
      }

      const user = await userRepository.findByEmail(email);
      // Check user exist
      if (!user) {
        throw new ProxyError(ProxyErrorType.NOT_FOUND_ERROR, 404, "User not found");
      }

      // Generate Firebase reset link
      const resetLink = await firebaseAdmin.generatePasswordResetLink(email);
      if (!resetLink) {
        throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 400, "Failed to generate reset link");
      }

      const html = forgotPasswordTemplate(user.name, resetLink);
      await brevoService.sendMail(
        user.email,
        "Reset Your Password",
        html
      );
      ctx.body = {
        message: "Password reset email sent"
      };

    }
    catch (error) {
      logger.error("Forgot password error:", error);
      throw error;
    }
  }
}
