import { Context } from "koa";
import { providerSnippetRepository } from "../../database/repositories/provider-snippet.repository";
import { ProxyError, ProxyErrorType } from "../../types/proxy";
import { ProviderSnippet } from "../../types/providers";

export class ProviderSnippetController {

    /**
     Create provider code snippets
     POST /_api/provider-snippets
    */
    static async createProviderSnippet(
        ctx: Context
    ) {
        const { provider, curl, node, python, java } = ctx.request.body as {
            provider: string;
            curl: string;
            node: string;
            python: string;
            java: string;
        };

        //Checks valid provider
        if (!provider || !["openai", "anthropic", "gemini"].includes(provider)) {
            throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 400, "Invalid provider");
        }

        const existing = await providerSnippetRepository.getProviderSnippet(provider);
        //Check existing of provider
        if (existing) {
            throw new ProxyError(ProxyErrorType.INVALID_REQUEST, 409, "Provider snippet already exists");
        }
        const snippet = await providerSnippetRepository.createProviderSnippet(provider, { curl, node, python, java });
        ctx.body = snippet;
    }

    /**
     Update provider code snippets
     PUT /_api/provider-snippets/:id
    */
    static async updateProviderSnippet(
        ctx: Context
    ) {
        const id = ctx.params.id;
        const snippet = await providerSnippetRepository.updateProviderSnippet(id, ctx.request.body as ProviderSnippet);

        if (!snippet) {
            throw new ProxyError(ProxyErrorType.NOT_FOUND_ERROR, 404, "Provider snippet not found");
        }
        ctx.body = snippet;
    }

    /**
     lists provider code snippets
     GET /_api/provider-snippets/:provider
    */
    static async getProviderSnippet(
        ctx: Context
    ) {
        const snippet = await providerSnippetRepository.getProviderSnippet(ctx.params.provider);
        ctx.body = snippet;
    }

    /**
     Get all snippet providers
     GET /_api/provider-snippets
    */
    static async getAllProviderSnippets(
        ctx: Context
    ) {
        const snippets = await providerSnippetRepository.getAllProviderSnippets();
        ctx.body = {
            snippets,
            total: snippets.length
        };
    }

    /**
     Delete snippet providers
     DELETE /_api/provider-snippets/:id
    */
    static async deleteProviderSnippet(ctx: Context) {
        const id = ctx.params.id;
        const snippet = await providerSnippetRepository.deleteProviderSnippet(id);
        if (!snippet) {
            throw new ProxyError(ProxyErrorType.NOT_FOUND_ERROR, 404, "Provider snippet not found");
        }
        ctx.body = {
            message: "Provider snippet deleted successfully",
            id
        };
    }
}
