import { HashingService } from '../../../src/security/hashing';

describe('HashingService', () => {

  it('should hash and verify a password', async () => {
    const password = 'StrongPass@123';

    const hash = await HashingService.hashPassword(password);
    expect(hash).toBeDefined();
    expect(hash).not.toBe(password);

    const isValid = await HashingService.comparePassword(password, hash);
    expect(isValid).toBe(true);
  });

  it('should fail password comparison for wrong password', async () => {
    const password = 'CorrectPass';
    const hash = await HashingService.hashPassword(password);

    const isValid = await HashingService.comparePassword('WrongPass', hash);
    expect(isValid).toBe(false);
  });

  it('should generate secure token', () => {
    const token = HashingService.generateSecureToken();
    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
  });

  it('should generate short code of correct length', () => {
    const code = HashingService.generateShortCode(8);
    expect(code.length).toBe(8);
  });

  it('should hash API key using SHA-256', () => {
    const key = 'api_key_123';
    const hash = HashingService.hashApiKey(key);

    expect(hash).toHaveLength(64); // SHA-256 hex length
  });

  it('should mask token correctly', () => {
    const token = 'abcdefghijklmnop';
    const masked = HashingService.maskToken(token);

    expect(masked.startsWith('abcd')).toBe(true);
    expect(masked.endsWith('mnop')).toBe(true);
  });
});
