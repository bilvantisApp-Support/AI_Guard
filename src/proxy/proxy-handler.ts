import { Context } from 'koa';
import { AxiosRequestConfig } from 'axios';
import { HttpClient } from '../utils/http-client';
import { logRequest, logError, logStreamingStart, logStreamingEnd } from '../utils/logger';
import { ProxyError, ProxyErrorType, RequestMetadata } from '../types/proxy';
import { getProviderConfig } from './provider-config';
import { Readable } from 'stream';
import { ApiKeyResolver } from './api-key-resolver';
import { AuthState } from '../auth/auth-middleware';
import { projectRepository } from '../database/repositories';

export class ProxyHandler {
  private httpClient: HttpClient;

  constructor() {
    this.httpClient = new HttpClient();
  }

  async handleRequest(ctx: Context): Promise<void> {
    // Skip proxy processing for internal API routes
    if (ctx.path.startsWith('/_api')) {
      return;
    }
    
    const requestId = this.generateRequestId();
    const startTime = Date.now();
    
    const metadata: RequestMetadata = {
      requestId,
      provider: '',
      startTime,
      method: ctx.method,
      path: ctx.path,
      clientIp: ctx.ip,
    };

    try {
      // Extract provider from header
      const providerName = ctx.headers['x-ai-guard-provider'] as string;
      if (!providerName) {
        throw new ProxyError(
          ProxyErrorType.INVALID_REQUEST,
          400,
          'Missing required header: X-AI-Guard-Provider',
        );
      }
      
      metadata.provider = providerName.toLowerCase();

      // Get provider configuration
      const providerConfig = getProviderConfig(providerName);
      if (!providerConfig) {
        throw new ProxyError(
          ProxyErrorType.INVALID_PROVIDER,
          400,
          `Unsupported provider: ${providerName}`,
        );
      }

      // Get authenticated user and project from context
      const authState = ctx.state.auth as AuthState | undefined;
      const user = authState?.user;
      const token = authState?.token;

      let project = authState?.project;

      if (!project && token?.projectId) {
        project = await projectRepository.findById(token.projectId);
      }

      // Check if provider is allowed for the project
      if (project && !ApiKeyResolver.isProviderAllowed(project, providerConfig.name)) {
        throw new ProxyError(
          ProxyErrorType.INVALID_REQUEST,
          403,
          `Provider ${providerName} is not allowed for this project`,
        );
      }

      //Check that token must bound to correct llmProvider and project
      if (!token?.projectId || !token?.llmProvider) {
        throw new ProxyError(
          ProxyErrorType.CONFIGURATION_ERROR,
          503,
          `Token is missing required fields`,
        )
      }

      // Check that token is valid for the requested provider
      if (token.llmProvider !== providerConfig.name) {
        throw new ProxyError(
          ProxyErrorType.INVALID_REQUEST,
          403,
          `Token is not valid for provider ${providerName}`,
        )
      }

      // Resolve API key dynamically
      const keyResolution = await ApiKeyResolver.resolveApiKey(
        user,
        project,
        providerConfig.name
      );

      if (!keyResolution) {
        throw new ProxyError(
          ProxyErrorType.CONFIGURATION_ERROR,
          500,
          `API key not configured for provider: ${providerName}`,
        );
      }

      const { apiKey, source, keyId } = keyResolution;
      metadata.keySource = source;
      metadata.keyId = keyId;

      // Build target URL
      const targetUrl = new URL(ctx.path, providerConfig.host);
      
      // Add original query parameters
      if (ctx.querystring) {
        targetUrl.search = ctx.querystring;
      }

      // Add constant query parameters from provider config
      if (providerConfig.constantQueryParams) {
        Object.entries(providerConfig.constantQueryParams).forEach(([key, value]) => {
          targetUrl.searchParams.set(key, value);
        });
      }

      // Copy only essential headers from request
      const headers: Record<string, string> = {};
      const headersToSkip = [
        'host',
        'x-ai-guard-provider',
        'authorization', // We'll set this appropriately based on provider
        'connection',
        'content-length',
        'user-agent',
        'accept-encoding',
        'postman-token',
        'cache-control',
        'pragma',
      ];
      
      Object.entries(ctx.headers).forEach(([key, value]) => {
        if (value && !headersToSkip.includes(key.toLowerCase())) {
          headers[key] = Array.isArray(value) ? value.join(', ') : String(value);
        }
      });

      // Add constant headers from provider config (but don't override existing headers)
      if (providerConfig.constantHeaders) {
        Object.entries(providerConfig.constantHeaders).forEach(([key, value]) => {
          // Only add if the header doesn't already exist
          if (!headers[key] && !headers[key.toLowerCase()]) {
            headers[key] = value;
          }
        });
      }

      // Set auth header using the resolver
      const authHeader = ApiKeyResolver.getAuthorizationHeader(providerConfig.name, apiKey);
      headers[authHeader.header] = authHeader.value;

      // Set host header
      headers['host'] = new URL(providerConfig.host).host;

      // Build axios config
      const axiosConfig: AxiosRequestConfig = {
        method: ctx.method as AxiosRequestConfig['method'],
        url: targetUrl.toString(),
        headers,
        data: (ctx.request as any).body,
        maxBodyLength: Infinity,
        maxContentLength: Infinity,
      };

      // Check if this is a streaming request
      const isStreaming = this.isStreamingRequest(ctx);

      if (isStreaming) {
        await this.handleStreamingRequest(ctx, axiosConfig, metadata);
      } else {
        await this.handleRegularRequest(ctx, axiosConfig, metadata);
      }

    } catch (error) {
      logError(error as Error, metadata);
      this.handleError(ctx, error as Error);
    }
  }

  private async handleRegularRequest(
    ctx: Context,
    config: AxiosRequestConfig,
    metadata: RequestMetadata,
  ): Promise<void> {
    const response = await this.httpClient.request(config);
    
    // Set response status
    ctx.status = response.status;
    
    // Forward response headers
    Object.entries(response.headers).forEach(([key, value]) => {
      const lowerKey = key.toLowerCase();
      // Skip certain headers
      if (!['content-encoding', 'transfer-encoding', 'connection'].includes(lowerKey)) {
        ctx.set(key, Array.isArray(value) ? value.join(', ') : String(value));
      }
    });

    // Set response body
    ctx.body = response.data;

    // Log request
    const duration = Date.now() - metadata.startTime;
    logRequest(metadata, response.status, duration);
  }

  private async handleStreamingRequest(
    ctx: Context,
    config: AxiosRequestConfig,
    metadata: RequestMetadata,
  ): Promise<void> {
    logStreamingStart(metadata);

    const response = await this.httpClient.streamRequest(config);
    
    // Set response status
    ctx.status = response.status;

    // Forward response headers
    Object.entries(response.headers).forEach(([key, value]) => {
      const lowerKey = key.toLowerCase();
      if (!['content-encoding', 'transfer-encoding', 'connection'].includes(lowerKey)) {
        ctx.set(key, Array.isArray(value) ? value.join(', ') : String(value));
      }
    });

    // Stream the response
    const stream = response.data as Readable;
    ctx.body = stream;

    // Log streaming completion
    stream.on('end', () => {
      const duration = Date.now() - metadata.startTime;
      logStreamingEnd(metadata, duration);
    });

    stream.on('error', (error) => {
      logError(error, metadata);
    });
  }

  private isStreamingRequest(ctx: Context): boolean {
    const acceptHeader = ctx.headers.accept || '';
    const contentType = ctx.headers['content-type'] || '';
    const body = (ctx.request as any).body;
    
    return (
      acceptHeader.includes('text/event-stream') ||
      acceptHeader.includes('application/x-ndjson') ||
      contentType.includes('text/event-stream') ||
      (body && typeof body === 'object' && body.stream === true)
    );
  }


  private handleError(ctx: Context, error: Error): void {
    if (error instanceof ProxyError) {
      ctx.status = error.statusCode;
      ctx.body = {
        error: {
          type: error.type,
          message: error.message,
          details: error.details,
        },
      };
    } else if ((error as any).response) {
      // Axios error with response
      const axiosError = error as any;
      ctx.status = axiosError.response.status;
      ctx.body = axiosError.response.data;
    } else if ((error as any).request) {
      // Network error
      ctx.status = 502;
      ctx.body = {
        error: {
          type: ProxyErrorType.NETWORK_ERROR,
          message: 'Failed to connect to upstream provider',
        },
      };
    } else {
      // Unknown error
      ctx.status = 500;
      ctx.body = {
        error: {
          type: ProxyErrorType.UPSTREAM_ERROR,
          message: 'Internal server error',
        },
      };
    }
  }

  private generateRequestId(): string {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }
}
