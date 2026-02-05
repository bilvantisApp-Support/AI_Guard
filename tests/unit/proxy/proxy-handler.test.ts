import { ProxyHandler } from '../../../src/proxy/proxy-handler';
import { ApiKeyResolver } from '../../../src/proxy/api-key-resolver';
import { projectRepository } from '../../../src/database/repositories';
import { getProviderConfig } from '../../../src/proxy/provider-config';
import { ProxyErrorType } from '../../../src/types/proxy';

jest.mock('../../../src/proxy/api-key-resolver');
jest.mock('../../../src/database/repositories');
jest.mock('../../../src/proxy/provider-config');

type TestContext = {
  path: string;
  method: string;
  ip: string;
  headers: Record<string, any>;
  request: { body: any };
  querystring: string;
  state: {
    auth?: {
      user?: any;
      token?: any;
      project?: any;
    };
  };
  status?: number;
  body?: any;
  set: jest.Mock;
};

const mockCtx = (overrides: Partial<TestContext> = {}): TestContext => ({
  path: '/v1/chat/completions',
  method: 'POST',
  ip: '127.0.0.1',
  headers: {
    'x-ai-guard-provider': 'openai',
  },
  request: { body: {} },
  querystring: '',
  state: {
    auth: {},
  },
  status: undefined,
  body: undefined,
  set: jest.fn(),
  ...overrides,
});

//Throw error when token is missing projectId or llmProvider
it('returns error when token is missing projectId or llmProvider', async () => {
  (getProviderConfig as jest.Mock).mockReturnValue({ name: 'openai', host: 'https://api.openai.com' });

  const ctx = mockCtx({
    state: {
      auth: {
        token: { userId: 'u1' }, // missing fields
      },
    },
  });

  const handler = new ProxyHandler();

  await handler.handleRequest(ctx as any);

  expect(ctx.status).toBe(503);
  expect(ctx.body.error.type).toBe(ProxyErrorType.CONFIGURATION_ERROR);
});

//Throw error when token llmProvider does not match request provider
it('returns error when token llmProvider does not match request provider', async () => {
  (getProviderConfig as jest.Mock).mockReturnValue({ name: 'openai', host: 'https://api.openai.com' });

  const ctx = mockCtx({
    state: {
      auth: {
        token: {
          projectId: 'p1',
          llmProvider: 'anthropic', 
        },
      },
    },
  });

  const handler = new ProxyHandler();

  await handler.handleRequest(ctx as any);

  expect(ctx.status).toBe(403);
  expect(ctx.body.error.type).toBe(ProxyErrorType.INVALID_REQUEST);
});

//Successfully resolve api key using project and provider
it('resolves api key using project and provider', async () => {
  (getProviderConfig as jest.Mock).mockReturnValue({
    name: 'openai',
    host: 'https://api.openai.com',
  });

  (projectRepository.findById as jest.Mock).mockResolvedValue({
    id: 'p1',
    settings: {},
  });

  (ApiKeyResolver.isProviderAllowed as jest.Mock).mockReturnValue(true);

  (ApiKeyResolver.resolveApiKey as jest.Mock).mockResolvedValue({
    apiKey: 'sk-test',
    source: 'project',
    keyId: 'key1',
  });

  const ctx = mockCtx({
    state: {
      auth: {
        user: { id: 'u1' },
        token: {
          projectId: 'p1',
          llmProvider: 'openai',
        },
      },
    },
  });

  const handler = new ProxyHandler();

  (handler as any).httpClient = {
    request: jest.fn().mockResolvedValue({
      status: 200,
      headers: {},
      data: { ok: true },
    }),
  };

  await handler.handleRequest(ctx as any);

  expect(ApiKeyResolver.resolveApiKey).toHaveBeenCalledWith(
    ctx.state.auth!.user,
    expect.anything(),
    'openai'
  );

});

