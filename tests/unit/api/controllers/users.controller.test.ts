import mongoose from 'mongoose';
import { UsersController } from '../../../../src/api/controllers/users.controller';
import { PatGenerator } from '../../../../src/auth/pat/pat-generator';
import { ScopeValidator } from '../../../../src/auth/pat/pat-scopes';
import { ProxyErrorType } from '../../../../src/types/proxy';

jest.mock('../../../../src/database/repositories/user.repository');
jest.mock('../../../../src/database/repositories/token.repository');
jest.mock('../../../../src/auth/pat/pat-generator');
jest.mock('../../../../src/auth/pat/pat-scopes');

const userId = new mongoose.Types.ObjectId();

const ctxFactory = (overrides: Partial<any> = {}) => ({
  state: {
    auth: { user: { _id: userId } },
  },
  request: {
    body: {},
  },
  params: {},
  query: {},
  body: {},
  status: undefined,
  ...overrides,
});

afterEach(() => {
  jest.clearAllMocks();
});

//Create token with all valid parameters
it('creates token when llmProvider is provided', async () => {
  (ScopeValidator.validateScopes as jest.Mock).mockReturnValue(true);
  (PatGenerator.isTokenNameUnique as jest.Mock).mockResolvedValue(true);
  (PatGenerator.generateToken as jest.Mock).mockResolvedValue({
    token: 'generated-token',
    tokenRecord: {
      _id: 'token123',
      name: 'My Token',
      scopes: ['api:read'],
      llmProvider: 'openai',
      projectId: 'proj1',
      expiresAt: null,
      createdAt: new Date(),
    },
  });

  const ctx = ctxFactory({
    request: {
      body: {
        name: 'My Token',
        scopes: ['api:read'],
        llmProvider: 'openai',
        projectId: 'proj1',
      },
    },
  });

  await UsersController.createToken(ctx as any);

  expect(ctx.body).toMatchObject({
    name: 'My Token',
    scopes: ['api:read'],
    llmProvider: 'openai',
    projectId: 'proj1',
  });
});


//Throw error when llm provider is missing
it('throws error when llmProvider is missing', async () => {
  const ctx = ctxFactory({
    request: {
      body: {
        name: 'My Token',
        scopes: ['api:read'],
      },
    },
  });

  await expect(
    UsersController.createToken(ctx as any)
  ).rejects.toMatchObject({
    statusCode: 400,
    type: ProxyErrorType.INVALID_REQUEST,
  });
});


//Throw error when llm provider is invalid
it('throws error when llmProvider is not a string', async () => {
  const ctx = ctxFactory({
    request: {
      body: {
        name: 'My Token',
        scopes: ['api:read'],
        llmProvider: 123, 
      },
    },
  });

  await expect(
    UsersController.createToken(ctx as any)
  ).rejects.toMatchObject({
    statusCode: 400,
    type: ProxyErrorType.INVALID_REQUEST,
  });
});
