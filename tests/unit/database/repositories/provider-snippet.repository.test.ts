import mongoose from "mongoose";
import { providerSnippetRepository } from "../../../../src/database/repositories/provider-snippet.repository";
import { ProviderSnippet } from "../../../../src/database/models/provider-snippet.model";

jest.mock("../../../../src/database/models/provider-snippet.model");

const mockProviderSnippet = ProviderSnippet as jest.Mocked<typeof ProviderSnippet>;

describe("ProviderSnippetRepository", () => {
    const snippetId = new mongoose.Types.ObjectId().toString();
    const mockSnippet = {
        _id: snippetId,
        provider: "openai",
        curl: "curl code",
        node: "node code",
        python: "python code",
        java: "java code",
    };
    afterEach(() => { jest.clearAllMocks(); });

    describe("createProviderSnippet", () => {
        it("should create provider snippet", async () => {
            const saveMock = jest.fn().mockResolvedValue(mockSnippet);
            mockProviderSnippet.mockImplementation(() => ({ save: saveMock, }) as any);
            const result = await providerSnippetRepository.createProviderSnippet(
                "openai",
                {
                    curl: "curl code",
                    node: "node code",
                    python: "python code",
                    java: "java code",
                }
            );
            expect(saveMock).toHaveBeenCalled();
            expect(result).toEqual(mockSnippet);
        });
    });

    describe("updateProviderSnippet", () => {
        it("should update provider snippet", async () => {
            const execMock = jest.fn().mockResolvedValue(mockSnippet);
            (ProviderSnippet.findByIdAndUpdate as jest.Mock).mockReturnValue({ exec: execMock });
            const result = await providerSnippetRepository.updateProviderSnippet(snippetId, { curl: "updated curl" }
            );
            expect(ProviderSnippet.findByIdAndUpdate).toHaveBeenCalledWith(snippetId, { $set: { curl: "updated curl" } }, { new: true });
            expect(result).toEqual(mockSnippet);
        });

        it("should return null if snippet not found", async () => {
            const execMock = jest.fn().mockResolvedValue(null);
            (ProviderSnippet.findByIdAndUpdate as jest.Mock).mockReturnValue({ exec: execMock });
            const result = await providerSnippetRepository.updateProviderSnippet(snippetId, { curl: "updated curl" });
            expect(result).toBeNull();
        });
    });

    describe("getProviderSnippet", () => {
        it("should return provider snippet", async () => {
            const execMock = jest.fn().mockResolvedValue(mockSnippet);
            (ProviderSnippet.findOne as jest.Mock).mockReturnValue({ exec: execMock });

            const result = await providerSnippetRepository.getProviderSnippet("openai");
            expect(ProviderSnippet.findOne).toHaveBeenCalledWith({ provider: "openai" });
            expect(result).toEqual(mockSnippet);
        });


        it("should return null if snippet not found", async () => {
            const execMock = jest.fn().mockResolvedValue(null);
            (ProviderSnippet.findOne as jest.Mock).mockReturnValue({ exec: execMock });
            const result = await providerSnippetRepository.getProviderSnippet("openai");
            expect(result).toBeNull();

        });

    });

    describe("getAllProviderSnippets", () => {
        it("should return all snippets", async () => {
            const execMock = jest.fn().mockResolvedValue([mockSnippet]);
            (ProviderSnippet.find as jest.Mock).mockReturnValue({ exec: execMock });
            const result = await providerSnippetRepository.getAllProviderSnippets();
            expect(ProviderSnippet.find).toHaveBeenCalled();
            expect(result).toEqual([mockSnippet]);
        });
    });

    describe("deleteProviderSnippet", () => {
        it("should delete provider snippet", async () => {
            const execMock = jest.fn().mockResolvedValue(mockSnippet);
            (ProviderSnippet.findByIdAndDelete as jest.Mock).mockReturnValue({ exec: execMock });
            const result = await providerSnippetRepository.deleteProviderSnippet(snippetId);

            expect(ProviderSnippet.findByIdAndDelete).toHaveBeenCalledWith(snippetId);
            expect(result).toEqual(mockSnippet);
        });

        it("should return null if snippet not found", async () => {
            const execMock = jest.fn().mockResolvedValue(null);
            (ProviderSnippet.findByIdAndDelete as jest.Mock).mockReturnValue({ exec: execMock });
            const result = await providerSnippetRepository.deleteProviderSnippet(snippetId);
            expect(result).toBeNull();

        });
    });
});
