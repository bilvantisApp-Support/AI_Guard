import mongoose, { Schema, Document } from 'mongoose';

export interface IProviderApiKey {
  provider: 'openai' | 'anthropic' | 'gemini';
  encryptedKey: string;
  keyId: string; // For key rotation
  isActive: boolean;
  addedBy: mongoose.Types.ObjectId;
  addedAt: Date;
}

export interface IProjectMember {
  userId: mongoose.Types.ObjectId;
  role: 'owner' | 'admin' | 'member';
  addedAt: Date;
}

export interface IProjectSettings {
  rateLimitOverride?: {
    windowMs: number;
    maxRequests: number;
  };
  quotaOverride?: {
    monthlyLimit: number;
    dailyLimit: number;
  };
  allowedProviders?: string[];
  webhookUrl?: string;
}

export interface IUsageMetrics {
  total: {
    requests: number;
    tokens: number;
    cost: number;
  };
  currentMonth: {
    requests: number;
    tokens: number;
    cost: number;
  };
  currentDay: {
    requests: number;
    tokens: number;
    cost: number;
  };
  lastUpdated: Date;
}

export interface IProject extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  description:string;
  ownerId: mongoose.Types.ObjectId;
  members: IProjectMember[];
  apiKeys: IProviderApiKey[];
  settings: IProjectSettings;
  usage: IUsageMetrics;
  createdAt: Date;
  updatedAt: Date;
}

const providerApiKeySchema = new Schema<IProviderApiKey>(
  {
    provider: {
      type: String,
      enum: ['openai', 'anthropic', 'gemini'],
      required: true,
    },
    encryptedKey: {
      type: String,
      required: true,
    },
    keyId: {
      type: String,
      required: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    addedBy: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    addedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const projectMemberSchema = new Schema<IProjectMember>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    role: {
      type: String,
      enum: ['owner', 'admin', 'member'],
      required: true,
    },
    addedAt: {
      type: Date,
      default: Date.now,
    },
  },
  { _id: false }
);

const projectSchema = new Schema<IProject>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    description:{
      type:String,
    },
    members: [projectMemberSchema],
    apiKeys: [providerApiKeySchema],
    settings: {
      rateLimitOverride: {
        windowMs: Number,
        maxRequests: Number,
      },
      quotaOverride: {
        monthlyLimit: Number,
        dailyLimit: Number,
      },
      allowedProviders: [String],
      webhookUrl: String,
    },
    usage: {
      total: {
        requests: { type: Number, default: 0 },
        tokens: { type: Number, default: 0 },
        cost: { type: Number, default: 0 },
      },
      currentMonth: {
        requests: { type: Number, default: 0 },
        tokens: { type: Number, default: 0 },
        cost: { type: Number, default: 0 },
      },
      currentDay: {
        requests: { type: Number, default: 0 },
        tokens: { type: Number, default: 0 },
        cost: { type: Number, default: 0 },
      },
      lastUpdated: { type: Date, default: Date.now },
    },
  },
  {
    timestamps: true,
  }
);

// Indexes
projectSchema.index({ ownerId: 1 });
projectSchema.index({ 'members.userId': 1 });
projectSchema.index({ name: 1 });

export const Project = mongoose.model<IProject>('Project', projectSchema);