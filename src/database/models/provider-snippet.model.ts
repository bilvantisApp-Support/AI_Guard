import mongoose, { Schema, Document } from "mongoose";

export interface IProviderSnippet extends Document {
    provider: "openai" | "anthropic" | "gemini";
    curl: string;
    node: string;
    python: string;
    java: string;
    createdAt: Date;
    updatedAt: Date;
}

const providerSnippetSchema = new Schema<IProviderSnippet>(
    {
        provider: {
            type: String,
            required: true,
            unique: true,
            enum: ["openai", "anthropic", "gemini"]
        },
        curl: {
            type: String,
            required: true
        },
        node: {
            type: String,
            required: true
        },
        python: {
            type: String,
            required: true
        },
        java: {
            type: String,
            required: true
        }
    },
    {
        timestamps: true
    }
);

export const ProviderSnippet =
    mongoose.model<IProviderSnippet>(
        "ProviderSnippet",
        providerSnippetSchema
    );
