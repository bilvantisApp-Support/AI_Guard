import bcrypt from 'bcryptjs';
import crypto from 'crypto';
import { logger } from '../utils/logger';

export class HashingService {
  private static readonly SALT_ROUNDS = 10;
  
  /**
   * Hash a password or token using bcrypt
   */
  public static async hashPassword(password: string): Promise<string> {
    try {
      return await bcrypt.hash(password, this.SALT_ROUNDS);
    } catch (error) {
      logger.error('Password hashing failed:', error);
      throw new Error('Failed to hash password');
    }
  }

  /**
   * Compare a password with a bcrypt hash
   */
  public static async comparePassword(password: string, hash: string): Promise<boolean> {
    try {
      return await bcrypt.compare(password, hash);
    } catch (error) {
      logger.error('Password comparison failed:', error);
      return false;
    }
  }

  /**
   * Generate a secure random token
   */
  public static generateSecureToken(length: number = 32): string {
    return crypto.randomBytes(length).toString('base64url');
  }

  /**
   * Generate a short code (for user-friendly identifiers)
   */
  public static generateShortCode(length: number = 8): string {
    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
    let code = '';
    
    for (let i = 0; i < length; i++) {
      const randomIndex = crypto.randomInt(0, chars.length);
      code += chars[randomIndex];
    }
    
    return code;
  }

  /**
   * Create a SHA-256 hash of a value
   */
  public static sha256(value: string): string {
    return crypto.createHash('sha256').update(value).digest('hex');
  }

  /**
   * Create an HMAC signature
   */
  public static createHmac(data: string, secret: string): string {
    return crypto.createHmac('sha256', secret).update(data).digest('hex');
  }

  /**
   * Verify an HMAC signature
   */
  public static verifyHmac(data: string, signature: string, secret: string): boolean {
    const expectedSignature = this.createHmac(data, secret);
    return crypto.timingSafeEqual(
      Buffer.from(signature),
      Buffer.from(expectedSignature)
    );
  }

  /**
   * Generate a time-based one-time password (TOTP) secret
   */
  public static generateTotpSecret(): string {
    return crypto.randomBytes(20).toString('base64');
  }

  /**
   * Hash an API key for storage (one-way)
   */
  public static hashApiKey(apiKey: string): string {
    // Use SHA-256 for API keys as they don't need bcrypt's adjustable work factor
    return this.sha256(apiKey);
  }

  /**
   * Generate a masked version of a token for display
   */
  public static maskToken(token: string, visibleChars: number = 4): string {
    if (token.length <= visibleChars * 2) {
      return '****';
    }
    
    const start = token.substring(0, visibleChars);
    const end = token.substring(token.length - visibleChars);
    const masked = '*'.repeat(Math.min(token.length - visibleChars * 2, 8));
    
    return `${start}${masked}${end}`;
  }
}