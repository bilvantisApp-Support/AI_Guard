import { PatGenerator } from '../../../../src/auth/pat/pat-generator';
import { tokenRepository } from '../../../../src/database/repositories/token.repository';
import { TokenValidator } from '../../../../src/auth/token-validator';

jest.mock('../../../../src/database/repositories/token.repository');
jest.mock('../../../../src/auth/token-validator');

afterEach(() => {
  jest.clearAllMocks();
});

//generateToken pass llmProvider to tokenrepository to creatToken
it('generateToken passes llmProvider to tokenRepository', async () => {
  (TokenValidator.generateTokenString as jest.Mock).mockReturnValue({
    fullToken: 'full-token',
    identifier: 'identifier',
  });

  (TokenValidator.hashToken as jest.Mock).mockResolvedValue('hashed-token');

  (tokenRepository.createToken as jest.Mock).mockResolvedValue({
    _id: 'token123',
    llmProvider: 'openai',
  });

  await PatGenerator.generateToken({
    userId: 'user1',
    projectId: 'project1',
    name: 'My Token',
    scopes: ['read'],
    llmProvider: 'openai',
  });

  expect(tokenRepository.createToken).toHaveBeenCalledWith(
    expect.objectContaining({
      llmProvider: 'openai',
    })
  );
});

//rotate token keeps llm provider same as existing token
it('rotateToken keeps the same llmProvider from existing token', async () => {
  (tokenRepository.findById as jest.Mock).mockResolvedValue({
    _id: 'oldToken',
    userId: 'user1',
    projectId: 'project1',
    name: 'Old Token',
    scopes: ['api:read'],
    llmProvider: 'anthropic',
    expiresAt: null,
  });

  (tokenRepository.revokeToken as jest.Mock).mockResolvedValue(true);

  jest.spyOn(PatGenerator, 'generateToken').mockResolvedValue({
    token: 'new-token',
    tokenRecord: {
      _id: 'newToken',
      llmProvider: 'anthropic',
    } as any,
  });

  const result = await PatGenerator.rotateToken('oldToken', 'user1');

  expect(PatGenerator.generateToken).toHaveBeenCalledWith(
    expect.objectContaining({
      llmProvider: 'anthropic',
    })
  );

  expect(result).not.toBeNull();
});

