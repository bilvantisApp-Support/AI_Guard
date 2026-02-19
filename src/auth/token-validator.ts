import bcrypt from 'bcryptjs';
import { firebaseAdmin } from './firebase-admin';
import { tokenRepository } from '../database/repositories/token.repository';
import { IUser } from '../database/models/user.model';
import { IPersonalAccessToken } from '../database/models/token.model';
import { logger } from '../utils/logger';
import { captchaService } from '../services/captcha/captcha.service';

export interface AuthResult {
  user: IUser;
  token?: IPersonalAccessToken;
  authType: 'firebase' | 'pat';
}

export class TokenValidator {
  private static readonly BEARER_PREFIX = 'Bearer ';

  public static extractToken(authHeader: string | undefined): string | undefined {
    if (!authHeader || !authHeader.startsWith(this.BEARER_PREFIX)) {
      return authHeader;
    }
    return authHeader.substring(this.BEARER_PREFIX.length);
  }

  public static async validateFirebaseToken(token: string, captchaToken?: string): Promise<AuthResult | null> {
    try {
      const decodedToken = await firebaseAdmin.verifyIdToken(token);
      if (!decodedToken) {
        return null;
      }

      // Import userRepository here to avoid circular dependency
      const { userRepository } = await import('../database/repositories/user.repository');

      // Find or create user based on Firebase UID
      let user = await userRepository.findByFirebaseUid(decodedToken.uid);


      if (!user) {

        //Check Captcha Token
        if (!captchaToken) {
          logger.error("Captcha token missing for new user");
          return null;
        }
        const validCaptchaToken = await captchaService.verifyTurnstileToken(captchaToken);
        if (!validCaptchaToken) {
          logger.warn("Invalid captcha token");
          return null;
        }

        // Create new user from Firebase data
        const firebaseUser = await firebaseAdmin.getUser(decodedToken.uid);
        if (!firebaseUser) {
          return null;
        }

        //Count the number of users
        const existingUsersCount = await userRepository.countUsers();
        const role = existingUsersCount == 0 ? 'owner' : 'member';

        user = await userRepository.createUser({
          firebaseUid: decodedToken.uid,
          email: firebaseUser.email || decodedToken.email || '',
          name: firebaseUser.displayName || decodedToken.name || 'Unknown User',
          role,
          status: 'active',
        });
      }

      // Update last login
      await userRepository.updateLastLogin(user._id);

      return {
        user,
        authType: 'firebase',
      };
    } catch (error) {
      logger.error('Firebase token validation failed:', error);
      return null;
    }
  }

  public static async validatePersonalAccessToken(token: string): Promise<AuthResult | null> {
    try {
      // Parse the token to extract identifier and secret
      const parsed = this.parseToken(token);
      if (!parsed) {
        logger.debug('Invalid PAT format');
        return null;
      }

      // Find token by identifier
      const result = await tokenRepository.findByIdentifierWithUser(parsed.identifier);

      if (!result) {
        logger.debug('PAT not found by identifier');
        return null;
      }

      const { token: patToken, user } = result;

      // Compare the full token with stored hash
      const isValid = await this.compareToken(token, patToken.tokenHash);
      if (!isValid) {
        logger.warn('PAT validation failed - invalid secret');
        return null;
      }

      // Check if user is active
      if (user.status !== 'active') {
        logger.warn(`Attempt to use token for inactive user: ${user._id}`);
        return null;
      }

      // Update token last used
      await tokenRepository.updateLastUsed(patToken._id);

      return {
        user,
        token: patToken,
        authType: 'pat',
      };
    } catch (error) {
      logger.error('PAT validation failed:', error);
      return null;
    }
  }

  public static async validateToken(authHeader: string | undefined, captchaToken?: string): Promise<AuthResult | null> {
    const token = this.extractToken(authHeader);
    if (!token) {
      return null;
    }

    // Try PAT token first
    if (token.startsWith('pat_')) {
      const patResult = await this.validatePersonalAccessToken(token);
      if (patResult) {
        return patResult;
      }
    }

    const firebaseResult = await this.validateFirebaseToken(token, captchaToken);
    if (firebaseResult) {
      return firebaseResult;
    }

    return null;
  }

  public static async hashToken(token: string): Promise<string> {
    const saltRounds = 10;
    return await bcrypt.hash(token, saltRounds);
  }

  public static async compareToken(token: string, hash: string): Promise<boolean> {
    return await bcrypt.compare(token, hash);
  }

  public static generateTokenString(): { fullToken: string; identifier: string; secret: string } {
    // Generate a secure random token with identifier and secret
    const crypto = require('crypto');
    const identifier = crypto.randomBytes(8).toString('hex'); // 16 char identifier
    const secret = crypto.randomBytes(24).toString('base64url'); // 32 char secret
    const fullToken = `pat_${identifier}_${secret}`;

    return {
      fullToken,
      identifier: `pat_${identifier}`,
      secret
    };
  }

  public static parseToken(token: string): { identifier: string; secret: string } | null {
    // Parse token format: pat_<identifier>_<secret>
    const match = token.match(/^(pat_[a-f0-9]{16})_(.+)$/);
    if (!match) {
      return null;
    }

    return {
      identifier: match[1],
      secret: match[2]
    };
  }
}