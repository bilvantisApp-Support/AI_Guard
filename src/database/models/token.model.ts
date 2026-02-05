import mongoose, { Schema, Document } from 'mongoose';

export interface IPersonalAccessToken extends Document {
  _id: mongoose.Types.ObjectId;
  tokenIdentifier: string; // Unique identifier for token lookup
  tokenHash: string; // Hashed full token (identifier + secret)
  userId: mongoose.Types.ObjectId;
  projectId?: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  scopes: string[];
  llmProvider: string;
  lastUsedAt?: Date;
  expiresAt?: Date;
  createdAt: Date;
  updatedAt: Date;
  isRevoked: boolean;
}

const personalAccessTokenSchema = new Schema<IPersonalAccessToken>(
  {
    tokenIdentifier: {
      type: String,
      required: true,
      unique: true,
      index: true, // For fast lookups
    },
    tokenHash: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      required: false,
      trim: true,
    },
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
    },
    name: {
      type: String,
      required: true,
      trim: true,
    },
    scopes: [{
      type: String,
      enum: [
        'api:read',
        'api:write',
        'projects:read',
        'projects:write',
        'users:read',
        'users:write',
        'admin',
      ],
    }],
    llmProvider: {
      type: String,
      enum: ['openai', 'anthropic', 'gemini']
    },
    lastUsedAt: {
      type: Date,
    },
    expiresAt: {
      type: Date,
    },
    isRevoked: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  }
);

// Indexes (token index is created automatically by unique constraint)
personalAccessTokenSchema.index({ userId: 1 });
personalAccessTokenSchema.index({ projectId: 1 });
personalAccessTokenSchema.index({ isRevoked: 1 });
personalAccessTokenSchema.index({ expiresAt: 1 });

export const PersonalAccessToken = mongoose.model<IPersonalAccessToken>(
  'PersonalAccessToken',
  personalAccessTokenSchema
);
