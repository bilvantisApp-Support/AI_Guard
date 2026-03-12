import axios from 'axios';
import { ProxyError, ProxyErrorType } from '../../types/proxy';

export class ValidateApiKeyRepository {
    async validateOpenAIKey(apiKey: string) {
        try {
            const response = await axios.get('https://api.openai.com/v1/models', {
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                timeout: 5000,
            });
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
                },
                timeout: 5000,
            });
            return response.data;
        } catch (error: any) {
            throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 400, "Invalid Anthropic API key");
        }
    }

    async validateGeminiKey(apiKey: string) {
        try {
            const response = await axios.get(`https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`, { timeout: 5000 });
            return response.data;
        } catch (error: any) {
            throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 400, "Invalid Gemini API key");
        }
    }
}

export const validateApiKeyRepository = new ValidateApiKeyRepository();