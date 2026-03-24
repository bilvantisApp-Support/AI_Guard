import { IUser } from '../database/models/user.model';
import { IProject } from '../database/models/project.model';
import { projectRepository } from '../database/repositories/project.repository';
import { KeyManager } from '../security/key-manager';
import { logger } from '../utils/logger';

export interface ApiKeyResolutionResult {
  apiKey: string;
  source: 'project' | 'user' | 'system';
  keyId?: string;
}

export class ApiKeyResolver {
  /**
   * Resolve API key for a request based on user, project, and provider
   */
  public static async resolveApiKey(
    user: IUser | undefined,
    project: IProject | undefined,
    provider: string
  ): Promise<ApiKeyResolutionResult | null> {
    try {
      // 1. Try project-specific key first
      if (project) {
        const projectKey = await this.getProjectApiKey(project, provider);
        if (projectKey) {
          logger.info('Using project-specific API key', {
            projectId: project._id,
            provider,
            keyId: projectKey.keyId,
          });
          return projectKey;
        }
      }

      // 2. Try user's default project key
      if (user && user.defaultProject) {
        const defaultProject = await projectRepository.findById(user.defaultProject);
        if (defaultProject) {
          const defaultProjectKey = await this.getProjectApiKey(defaultProject, provider);
          if (defaultProjectKey) {
            logger.info('Using user default project API key', {
              userId: user._id,
              projectId: defaultProject._id,
              provider,
              keyId: defaultProjectKey.keyId,
            });
            return defaultProjectKey;
          }
        }
      }

      // 3. Fall back to system default (from environment)
      const systemKey = this.getSystemApiKey(provider);
      if (systemKey) {
        logger.info('Using system default API key', {
          provider,
          userId: user?._id,
        });
        return systemKey;
      }

      logger.warn('No API key found for provider', {
        provider,
        userId: user?._id,
        projectId: project?._id,
      });

      return null;
    } catch (error) {
      logger.error('Failed to resolve API key:', error);
      return null;
    }
  }

  /**
   * Get API key from project
   */
  private static async getProjectApiKey(
    project: IProject,
    provider: string
  ): Promise<ApiKeyResolutionResult | null> {
    // Find active key for provider
    const apiKeyEntry = project.apiKeys.find(
      key => key.provider === provider && key.isActive
    );

    if (!apiKeyEntry) {
      return null;
    }

    try {
      // Decrypt the key
      const decryptedKey = KeyManager.decryptApiKey(apiKeyEntry.encryptedKey);
      
      return {
        apiKey: decryptedKey,
        source: 'project',
        keyId: apiKeyEntry.keyId,
      };
    } catch (error) {
      logger.error('Failed to decrypt project API key:', {
        projectId: project._id,
        provider,
        keyId: apiKeyEntry.keyId,
        error,
      });
      return null;
    }
  }

  /**
   * Get system default API key from environment
   */
  private static getSystemApiKey(provider: string): ApiKeyResolutionResult | null {
    const envKeyMap: Record<string, string> = {
      openai: 'OPENAI_API_KEY',
      anthropic: 'ANTHROPIC_API_KEY',
      gemini: 'GEMINI_API_KEY',
    };

    const envVar = envKeyMap[provider.toLowerCase()];
    if (!envVar) {
      return null;
    }

    const apiKey = process.env[envVar];
    if (!apiKey) {
      return null;
    }

    return {
      apiKey,
      source: 'system',
    };
  }

  /**
   * Validate that a provider is allowed for a project
   */
  public static isProviderAllowed(
    project: IProject | undefined,
    provider: string
  ): boolean {
    if (!project || !project.settings.allowedProviders) {
      // No restrictions
      return true;
    }

    return project.settings.allowedProviders.includes(provider);
  }

  /**
   * Get authorization header for provider
   */
  public static getAuthorizationHeader(
    provider: string,
    apiKey: string
  ): { header: string; value: string } {
    // Provider-specific auth header formats
    const authFormats: Record<string, { header: string; prefix?: string }> = {
      openai: {
        header: 'Authorization',
        prefix: 'Bearer',
      },
      anthropic: {
        header: 'X-API-Key',
      },
      gemini: {
        header: 'x-goog-api-key',
      },
    };

    const format = authFormats[provider.toLowerCase()];
    if (!format) {
      // Default to Bearer token
      return {
        header: 'Authorization',
        value: `Bearer ${apiKey}`,
      };
    }

    const value = format.prefix ? `${format.prefix} ${apiKey}` : apiKey;
    
    return {
      header: format.header,
      value,
    };
  }

  /**
   * Check if API key is about to expire (for warnings)
   */
  public static async checkKeyExpiration(
    keyId: string | undefined,
    encryptedKey: string
  ): Promise<{ isExpiring: boolean; daysUntilExpiration?: number }> {
    if (!keyId) {
      return { isExpiring: false };
    }

    try {
      const maxAgeInDays = 90;
      
      const isExpired = KeyManager.isKeyExpired(encryptedKey, maxAgeInDays);
      if (isExpired) {
        return { isExpiring: true, daysUntilExpiration: 0 };
      }

      // For now, skip the detailed expiration check
      return { isExpiring: false };
    } catch (error) {
      logger.error('Failed to check key expiration:', error);
      return { isExpiring: false };
    }
  }
}