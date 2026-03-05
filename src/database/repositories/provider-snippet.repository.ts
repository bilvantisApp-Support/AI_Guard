import { ProviderSnippet, IProviderSnippet } from "../models/provider-snippet.model";

export class ProviderSnippetRepository {

    async createProviderSnippet(
        provider: string,
        data: {
            curl: string;
            node: string;
            python: string;
            java: string;
        }
    ): Promise<IProviderSnippet> {
        const snippet = new ProviderSnippet({ provider, ...data });
        return snippet.save();
    }

    async updateProviderSnippet(
        id: string,
        data: {
            curl?: string;
            node?: string;
            python?: string;
            java?: string;
        }
    ): Promise<IProviderSnippet | null> {
        return ProviderSnippet.findByIdAndUpdate(id, { $set: data }, { new: true }).exec();
    }

    async getProviderSnippet(
        provider: string
    ): Promise<IProviderSnippet | null> {
        return ProviderSnippet.findOne({ provider }).exec();
    }

    async getAllProviderSnippets(): Promise<IProviderSnippet[]> {
        return ProviderSnippet.find().exec();
    }

    async deleteProviderSnippet(id: string): Promise<IProviderSnippet | null> {
        return ProviderSnippet.findByIdAndDelete(id).exec();
    }
}

export const providerSnippetRepository = new ProviderSnippetRepository();
