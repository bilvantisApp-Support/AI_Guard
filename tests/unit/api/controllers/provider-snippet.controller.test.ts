import { Context } from "koa";
import { ProviderSnippetController } from "../../../../src/api/controllers/provider-snippet.controller";
import { providerSnippetRepository } from "../../../../src/database/repositories/provider-snippet.repository";

jest.mock("../../../../src/database/repositories/provider-snippet.repository", () => ({
    providerSnippetRepository: {
        createProviderSnippet: jest.fn(),
        updateProviderSnippet: jest.fn(),
        getProviderSnippet: jest.fn(),
        getAllProviderSnippets: jest.fn(),
        deleteProviderSnippet: jest.fn(),
    },
}));

describe("ProviderSnippetController", () => {
    let ctx: Context;
    beforeEach(() => {
        ctx = {
            params: {},
            request: {
                body: {},
            },
            body: undefined,
        } as unknown as Context;
        jest.clearAllMocks();
    });

    describe("createProviderSnippet", () => {
        it("should create provider snippet successfully", async () => {
            const mockSnippet = {
                id: "1",
                provider: "openai",
                curl: "curl code",
                node: "node code",
                python: "python code",
                java: "java code",
            };

            (providerSnippetRepository.getProviderSnippet as jest.Mock).mockResolvedValue(null);
            (providerSnippetRepository.createProviderSnippet as jest.Mock).mockResolvedValue(mockSnippet);
            ctx.request.body = {
                provider: "openai",
                curl: "curl code",
                node: "node code",
                python: "python code",
                java: "java code",
            };
            await ProviderSnippetController.createProviderSnippet(ctx);
            expect(providerSnippetRepository.createProviderSnippet)
                .toHaveBeenCalledWith("openai", {
                    curl: "curl code",
                    node: "node code",
                    python: "python code",
                    java: "java code",
                });
            expect(ctx.body).toEqual(mockSnippet);
        });


        it("should throw error for invalid provider", async () => {
            ctx.request.body = {
                provider: "invalid",
            };

            await expect(ProviderSnippetController.createProviderSnippet(ctx)).rejects.toThrow("Invalid provider");
        });

        it("should throw error if snippet already exists", async () => {
            (providerSnippetRepository.getProviderSnippet as jest.Mock).mockResolvedValue({ id: "existing" });
            ctx.request.body = { provider: "openai" };
            await expect(ProviderSnippetController.createProviderSnippet(ctx)).rejects.toThrow("Provider snippet already exists");
        });
    });

    describe("updateProviderSnippet", () => {
        it("should update provider snippet successfully", async () => {
            const updatedSnippet = {
                id: "1",
                provider: "openai",
                curl: "updated curl",
            };

            (providerSnippetRepository.updateProviderSnippet as jest.Mock).mockResolvedValue(updatedSnippet);
            ctx.params = { id: "1" };
            ctx.request.body = { curl: "updated curl" };
            await ProviderSnippetController.updateProviderSnippet(ctx);

            expect(providerSnippetRepository.updateProviderSnippet).toHaveBeenCalledWith("1", { curl: "updated curl" });
            expect(ctx.body).toEqual(updatedSnippet);
        });

        it("should throw error if snippet not found", async () => {
            (providerSnippetRepository.updateProviderSnippet as jest.Mock).mockResolvedValue(null);
            ctx.params = { id: "999" };
            await expect(ProviderSnippetController.updateProviderSnippet(ctx)).rejects.toThrow("Provider snippet not found");
        });
    });

    describe("getProviderSnippet", () => {

        it("should return provider snippet", async () => {
            const snippet = { id: "1", provider: "openai" };
            (providerSnippetRepository.getProviderSnippet as jest.Mock).mockResolvedValue(snippet);
            ctx.params = { provider: "openai" };
            await ProviderSnippetController.getProviderSnippet(ctx);
            expect(providerSnippetRepository.getProviderSnippet).toHaveBeenCalledWith("openai");
            expect(ctx.body).toEqual(snippet);
        });
    });

    describe("getAllProviderSnippets", () => {
        it("should return all snippets", async () => {
            const snippets = [
                { id: "1", provider: "openai" },
                { id: "2", provider: "anthropic" },
            ];

            (providerSnippetRepository.getAllProviderSnippets as jest.Mock).mockResolvedValue(snippets);
            await ProviderSnippetController.getAllProviderSnippets(ctx);
            expect(ctx.body).toEqual({ snippets, total: 2 });
        });
    });

    describe("deleteProviderSnippet", () => {

        it("should delete provider snippet successfully", async () => {
            (providerSnippetRepository.deleteProviderSnippet as jest.Mock).mockResolvedValue({ id: "1" });
            ctx.params = { id: "1" };
            await ProviderSnippetController.deleteProviderSnippet(ctx);
            expect(providerSnippetRepository.deleteProviderSnippet).toHaveBeenCalledWith("1");
            expect(ctx.body).toEqual({
                message: "Provider snippet deleted successfully", id: "1",
            });
        });

        it("should throw error if snippet not found", async () => {
            (providerSnippetRepository.deleteProviderSnippet as jest.Mock).mockResolvedValue(null);
            ctx.params = { id: "999" };
            await expect(ProviderSnippetController.deleteProviderSnippet(ctx)).rejects.toThrow("Provider snippet not found");
        });
    });
});
