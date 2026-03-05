import { Context, Next } from 'koa';
import { TokenValidator, AuthResult } from './token-validator';
import { UserResolver } from './user-resolver';
import { logger } from '../utils/logger';

export interface AuthState extends AuthResult {
  project?: any; // IProject
  projectId?: string;
  permissions?: string[];
}

declare module 'koa' {
  interface Context {
    state: {
      auth?: AuthState;
      [key: string]: any;
    };
  }
}

export class AuthMiddleware {
  /**
   * Middleware that requires authentication
   */
  public static requireAuth() {
    return async (ctx: Context, next: Next) => {
      const authHeader = ctx.headers.authorization;
      const captchaToken = ctx.headers['x-captcha-token'] as string;

      if (!authHeader) {
        ctx.throw(401, 'Authorization header required');
      }

      const authResult = await TokenValidator.validateToken(authHeader, captchaToken);

      if (!authResult) {
        ctx.throw(401, 'Invalid or expired token');
      }

      // Store auth result in context
      ctx.state.auth = authResult;

      // Log authentication
      logger.info('User authenticated', {
        userId: authResult.user._id,
        authType: authResult.authType,
        path: ctx.path,
        method: ctx.method,
      });

      await next();
    };
  }

  /**
   * Middleware that optionally validates authentication if provided
   */
  public static optionalAuth() {
    return async (ctx: Context, next: Next) => {
      const authHeader = ctx.headers.authorization;

      if (authHeader) {
        const authResult = await TokenValidator.validateToken(authHeader);

        if (authResult) {
          ctx.state.auth = authResult;

          logger.info('User authenticated (optional)', {
            userId: authResult.user._id,
            authType: authResult.authType,
            path: ctx.path,
            method: ctx.method,
          });
        } else {
          // Authorization header provided but token is invalid - throw 401
          ctx.throw('Invalid or expired token', 401);
        }
      }
      // If no auth header, continue without authentication (truly optional)

      await next();
    };
  }

  /**
   * Middleware that requires specific permissions
   */
  public static requirePermission(permission: string) {
    return async (ctx: Context, next: Next) => {
      if (!ctx.state.auth) {
        ctx.throw('Authentication required', 401);
      }

      const projectId = ctx.params.projectId || ctx.query.projectId || ctx.state.auth.projectId;

      if (!projectId) {
        ctx.throw(400, 'Project ID required');
      }

      const resolvedUser = await UserResolver.resolveUserWithProject(
        ctx.state.auth.user._id.toString(),
        projectId as string
      );

      if (!resolvedUser) {
        ctx.throw(403, 'Access denied');
      }

      if (!UserResolver.hasPermission(resolvedUser.permissions, permission)) {
        ctx.throw(403, `Permission denied: ${permission} required`);
      }

      // Update auth state with project and permissions
      ctx.state.auth.project = resolvedUser.project;
      ctx.state.auth.projectId = projectId as string;
      ctx.state.auth.permissions = resolvedUser.permissions;

      await next();
    };
  }

  /**
   * Middleware that requires PAT with specific scopes
   */
  public static requireScope(scope: string) {
    return async (ctx: Context, next: Next) => {
      if (!ctx.state.auth) {
        ctx.throw(401, 'Authentication required');
      }

      if (ctx.state.auth.authType !== 'pat') {
        ctx.throw(403, 'Personal Access Token required');
      }

      const token = ctx.state.auth.token;
      if (!token) {
        ctx.throw(403, 'Invalid token state');
      }

      const hasScope = token.scopes.includes(scope) || token.scopes.includes('admin');

      if (!hasScope) {
        ctx.throw(403, `Scope required: ${scope}`);
      }

      await next();
    };
  }

  /**
   * Middleware for admin-only endpoints
   */
  public static requireAdmin() {
    return async (ctx: Context, next: Next) => {
      if (!ctx.state.auth) {
        ctx.throw(401, 'Authentication required');
      }

      // Check for admin access
      const role = ctx.state.auth.user.role;

      if (role === 'owner' || role === 'admin') {
        ctx.state.auth.permissions = ['admin:all'];
        await next();
        return;
      }

      // Check for PAT with admin scope
      if (ctx.state.auth.authType === 'pat' && ctx.state.auth.token) {
        const hasAdminScope = ctx.state.auth.token.scopes.includes('admin');
        if (hasAdminScope) {
          ctx.state.auth.permissions = ['admin:all'];
          await next();
          return;
        }
      }

      ctx.throw(403, 'Admin access required');
    };
  }
}