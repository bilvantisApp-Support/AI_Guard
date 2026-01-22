import { Context, Next } from 'koa';
import { TokenValidator } from '../token-validator';
import { tokenRepository } from '../../database/repositories/token.repository';
import { ScopeValidator, TokenScope } from './pat-scopes';
import { logger } from '../../utils/logger';

export class PatMiddleware {
  /**
   * Middleware that requires a PAT with specific scopes
   */
  public static requirePatWithScope(...requiredScopes: TokenScope[]) {
    return async (ctx: Context, next: Next) => {
      const authHeader = ctx.headers.authorization;
      const token = TokenValidator.extractToken(authHeader);

      if (!token) {
        ctx.throw(401, 'Personal Access Token required');
      }

      // Validate it's a PAT
      const authResult = await TokenValidator.validatePersonalAccessToken(token);
      
      if (!authResult) {
        ctx.throw(401, 'Invalid Personal Access Token');
      }

      // Check if user is active
      if (authResult.user.status !== 'active') {
        ctx.throw(403, 'User account is not active');
      }

      // Check scopes
      const tokenScopes = authResult.token?.scopes || [];
      const hasRequiredScopes = requiredScopes.every(scope => 
        ScopeValidator.hasScope(tokenScopes, scope)
      );

      if (!hasRequiredScopes) {
        ctx.throw(403, `Required scopes: ${requiredScopes.join(', ')}`);
      }

      // Store auth info in context
      ctx.state.auth = authResult;

      logger.info('PAT authenticated with scopes', {
        userId: authResult.user._id,
        tokenId: authResult.token?._id,
        scopes: tokenScopes,
        llmProvider: authResult.token?.llmProvider,
        requiredScopes,
        path: ctx.path,
        method: ctx.method,
      });

      await next();
    };
  }

  /**
   * Middleware to validate PAT for API proxy requests
   */
  public static validatePatForProxy() {
    return async (ctx: Context, next: Next) => {
      const authHeader = ctx.headers.authorization;
      const token = TokenValidator.extractToken(authHeader);

      if (!token) {
        // PAT not required for proxy if other auth methods are available
        await next();
        return;
      }

      // Check if it looks like a PAT
      if (!token.startsWith('pat_')) {
        // Not a PAT, let other auth methods handle it
        await next();
        return;
      }

      // Validate PAT
      const authResult = await TokenValidator.validatePersonalAccessToken(token);
      
      if (!authResult) {
        ctx.throw(401, 'Invalid Personal Access Token');
      }

      // Check if token has API access scope
      const tokenScopes = authResult.token?.scopes || [];
      const hasApiAccess = 
        ScopeValidator.hasScope(tokenScopes, TokenScope.API_READ) ||
        ScopeValidator.hasScope(tokenScopes, TokenScope.API_WRITE);

      if (!hasApiAccess) {
        ctx.throw(403, 'Token does not have API access scope');
      }

      // Store auth info in context
      ctx.state.auth = authResult;

      // Update last used timestamp
      if (authResult.token) {
        await tokenRepository.updateLastUsed(authResult.token._id);
      }

      await next();
    };
  }

  /**
   * Check if a PAT has expired
   */
  public static async isTokenExpired(tokenId: string): Promise<boolean> {
    const token = await tokenRepository.findById(tokenId);
    
    if (!token) {
      return true;
    }

    if (token.isRevoked) {
      return true;
    }

    if (token.expiresAt && token.expiresAt < new Date()) {
      return true;
    }

    return false;
  }
}
