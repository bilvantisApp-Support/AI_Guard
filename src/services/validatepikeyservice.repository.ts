import axios from 'axios';
import { ProxyError, ProxyErrorType } from '../types/proxy';
import { logger } from '../utils/logger';

export class ValidateApiKeyService {
    async validateOpenAIKey(apiKey: string) {
        try {
            const response = await axios.get('https://api.openai.com/v1/models', {
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                timeout: 5000,
            });
            logger.info('OpenAI API key validation Response: ', response.data);
            return response.data;
        } catch (error: any) {
            throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 400, "Invalid OpenAI API key");
        }
    }

    async validateAnthropicKey(apiKey: string) {
        try {
            const response = await axios.get('https://api.anthropic.com/v1/models', {
                headers: {
                    "x-api-key": apiKey,
                    "Content-Type": 'application/json',
                    "anthropic-version": '2023-06-01'
                },
                timeout: 5000,
            });
            logger.info("Anthropic API Key Validation Response: ", response.data)
            return response.data;
        } catch (error: any) {
            throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 400, "Invalid Anthropic API key");
        }
    }

    async validateGeminiKey(apiKey: string) {
        try {
            const response = await axios.get('https://generativelanguage.googleapis.com/v1beta/models',
                {
                    headers: {
                        'x-goog-api-key': apiKey,
                        'Content-Type': 'application/json',
                    },
                    timeout: 5000,
                });
            logger.info("Gemini API Key Validation Response: ", response.data);
            return response.data;
        } catch (error: any) {
            throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 400, "Invalid Gemini API key");
        }
    }
}

export const validateApiKeyService = new ValidateApiKeyService();