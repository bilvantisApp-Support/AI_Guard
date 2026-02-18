import mongoose, { Schema, Document } from 'mongoose';

export interface ITeamMember {
  userId: mongoose.Types.ObjectId;
  role: 'owner' | 'admin' | 'member';
  addedAt: Date;
}

export interface ITeamSettings {
  plan?: 'free' | 'pro' | 'enterprise' | 'custom';
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

export interface ITeamUsageMetrics {
  total: {
    requests: number;
    tokens: number;
    cost: number;
  };
  currentMonth: {
    month: string;
    requests: number;
    tokens: number;
    cost: number;
  };
  currentDay: {
    date: Date;
    requests: number;
    tokens: number;
    cost: number;
  };
  lastUpdated: Date;
}

export interface ITeam extends Document {
  _id: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  ownerId: mongoose.Types.ObjectId;
  members: ITeamMember[];
  settings: ITeamSettings;
  usage: ITeamUsageMetrics;
  createdAt: Date;
  updatedAt: Date;
}

const teamMemberSchema = new Schema<ITeamMember>(
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

const teamSchema = new Schema<ITeam>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    description: {
      type: String,
    },
    ownerId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    members: [teamMemberSchema],
    settings: {
      plan: {
        type: String,
        enum: ['free', 'pro', 'enterprise', 'custom'],
        default: 'free',
      },
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
teamSchema.index({ ownerId: 1 });
teamSchema.index({ 'members.userId': 1 });
teamSchema.index({ name: 1 });

export const Team = mongoose.model<ITeam>('Team', teamSchema);
