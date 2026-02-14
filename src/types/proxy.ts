export enum ProxyErrorType {
  INVALID_PROVIDER = 'INVALID_PROVIDER',
  UPSTREAM_ERROR = 'UPSTREAM_ERROR',
  NETWORK_ERROR = 'NETWORK_ERROR',
  TIMEOUT = 'TIMEOUT',
  INVALID_REQUEST = 'INVALID_REQUEST',
  CONFIGURATION_ERROR = 'CONFIGURATION_ERROR',
  AUTHENTICATION_ERROR = 'AUTHENTICATION_ERROR',
  NOT_FOUND_ERROR = 'NOT_FOUND_ERROR'
}

export class ProxyError extends Error {
  constructor(
    public type: ProxyErrorType,
    public statusCode: number,
    message: string,
    public details?: unknown,
  ) {
    super(message);
    this.name = 'ProxyError';
  }
}

export interface ProxyConfig {
  port: number;
  timeout: number;
  maxRetries: number;
  retryDelay: number;
  maxRequestSize: string;
  enableCompression: boolean;
  logLevel: string;
}

export interface RequestMetadata {
  requestId: string;
  provider: string;
  startTime: number;
  method: string;
  path: string;
  clientIp?: string;
  keySource?: 'project' | 'user' | 'system';
  keyId?: string;
}