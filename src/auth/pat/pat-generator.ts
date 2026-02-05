import { TokenValidator } from '../token-validator';
import { tokenRepository } from '../../database/repositories/token.repository';
import { IPersonalAccessToken } from '../../database/models/token.model';
import { logger } from '../../utils/logger';

export interface GenerateTokenOptions {
  userId: string;
  projectId?: string;
  name: string;
  scopes: string[];
  llmProvider: string;
  expiresInDays?: number;
}

export interface GeneratedToken {
  token: string;
  tokenRecord: IPersonalAccessToken;
}

export class PatGenerator {
  /**
   * Generate a new Personal Access Token
   */
  public static async generateToken(options: GenerateTokenOptions): Promise<GeneratedToken> {
    try {
      // Generate the token with identifier and secret
      const { fullToken, identifier } = TokenValidator.generateTokenString();
      
      // Hash the full token for storage
      const tokenHash = await TokenValidator.hashToken(fullToken);
      
      // Calculate expiration date if specified
      const expiresAt = options.expiresInDays
        ? new Date(Date.now() + options.expiresInDays * 24 * 60 * 60 * 1000)
        : undefined;

      // Create the token record
      const tokenRecord = await tokenRepository.createToken({
        tokenIdentifier: identifier,
        tokenHash,
        userId: options.userId as any,
        projectId: options.projectId as any,
        name: options.name,
        scopes: options.scopes,
        llmProvider: options.llmProvider,
        expiresAt,
      });

      logger.info('Personal Access Token generated', {
        userId: options.userId,
        projectId: options.projectId,
        tokenId: tokenRecord._id,
        tokenIdentifier: identifier,
        scopes: options.scopes,
      });

      return {
        token: fullToken,
        tokenRecord,
      };
    } catch (error) {
      logger.error('Failed to generate Personal Access Token:', error);
      throw error;
    }
  }

  /**
   * Rotate an existing token (revoke old, create new)
   */
  public static async rotateToken(
    tokenId: string,
    userId: string
  ): Promise<GeneratedToken | null> {
    try {
      const existingToken = await tokenRepository.findById(tokenId);
      
      if (!existingToken) {
        logger.warn(`Token not found for rotation: ${tokenId}`);
        return null;
      }

      // Verify the token belongs to the user
      if (existingToken.userId.toString() !== userId) {
        logger.warn(`Unauthorized token rotation attempt: ${tokenId} by user ${userId}`);
        return null;
      }

      // Revoke the old token
      await tokenRepository.revokeToken(tokenId);

      // Generate new token with same properties
      const newToken = await this.generateToken({
        userId,
        projectId: existingToken.projectId?.toString(),
        name: `${existingToken.name} (Rotated)`,
        scopes: existingToken.scopes,
        llmProvider: existingToken.llmProvider,
        expiresInDays: existingToken.expiresAt
          ? Math.ceil((existingToken.expiresAt.getTime() - Date.now()) / (24 * 60 * 60 * 1000))
          : undefined,
      });

      logger.info('Personal Access Token rotated', {
        oldTokenId: tokenId,
        newTokenId: newToken.tokenRecord._id,
        userId,
      });

      return newToken;
    } catch (error) {
      logger.error('Failed to rotate Personal Access Token:', error);
      throw error;
    }
  }

  /**
   * Validate token name uniqueness for a user
   */
  public static async isTokenNameUnique(
    userId: string,
    name: string
  ): Promise<boolean> {
    const userTokens = await tokenRepository.findByUserId(userId);
    return !userTokens.some(token => token.name === name);
  }
}
