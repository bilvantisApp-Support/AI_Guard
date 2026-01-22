import { TokenValidator } from '../../../src/auth/token-validator';
import bcrypt from 'bcryptjs';

jest.mock('../../src/database/repositories/token.repository', () => ({
  tokenRepository: {
    findByIdentifierWithUser: jest.fn(),
    updateLastUsed: jest.fn(),
  },
}));

jest.mock('../../src/auth/firebase-admin', () => ({
  firebaseAdmin: {
    verifyIdToken: jest.fn(),
  },
}));

import { tokenRepository } from '../../../src/database/repositories/token.repository';

describe('TokenValidator - PAT', () => {

  it('should generate and parse PAT correctly', () => {
    const { fullToken } = TokenValidator.generateTokenString();

    const parsed = TokenValidator.parseToken(fullToken);
    expect(parsed).not.toBeNull();
    expect(parsed?.identifier.startsWith('pat_')).toBe(true);
  });

  it('should validate personal access token', async () => {
    const token = 'pat_aaaaaaaaaaaaaaaa_secret123';
    const hash = await bcrypt.hash(token, 10);

    (tokenRepository.findByIdentifierWithUser as jest.Mock).mockResolvedValue({
      token: {
        tokenHash: hash,
        _id: 'tokenId',
      },
      user: {
        _id: 'userId',
        status: 'active',
      },
    });

    const result = await TokenValidator.validatePersonalAccessToken(token);
    expect(result).not.toBeNull();
    expect(result?.authType).toBe('pat');
  });

  it('should reject invalid PAT', async () => {
    (tokenRepository.findByIdentifierWithUser as jest.Mock).mockResolvedValue(null);

    const result = await TokenValidator.validatePersonalAccessToken(
      'pat_invalid_invalid'
    );

    expect(result).toBeNull();
  });
});
