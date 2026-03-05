import mongoose, { Schema, Document } from 'mongoose';

export interface IUsageRecord extends Document {
  _id: mongoose.Types.ObjectId;
  userId: mongoose.Types.ObjectId;
  projectId: mongoose.Types.ObjectId;
  teamId?: mongoose.Types.ObjectId;
  provider: 'openai' | 'anthropic' | 'gemini';
  endpoint: string;
  method: string;
  modelName?: string;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  cost?: number;
  responseTime: number; // in milliseconds
  statusCode: number;
  timestamp: Date;
  metadata?: Record<string, any>;
}

const usageRecordSchema = new Schema<IUsageRecord>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: 'User',
      required: true,
    },
    projectId: {
      type: Schema.Types.ObjectId,
      ref: 'Project',
      required: true,
    },
    teamId: {
      type: Schema.Types.ObjectId,
      ref: 'Team',
    },
    provider: {
      type: String,
      enum: ['openai', 'anthropic', 'gemini'],
      required: true,
    },
    endpoint: {
      type: String,
      required: true,
    },
    method: {
      type: String,
      required: true,
    },
    modelName: {
      type: String,
    },
    promptTokens: {
      type: Number,
    },
    completionTokens: {
      type: Number,
    },
    totalTokens: {
      type: Number,
    },
    cost: {
      type: Number,
    },
    responseTime: {
      type: Number,
      required: true,
    },
    statusCode: {
      type: Number,
      required: true,
    },
    timestamp: {
      type: Date,
      default: Date.now,
    },
    metadata: {
      type: Schema.Types.Mixed,
    },
  },
  {
    timestamps: false, // We use timestamp field instead
  }
);

// Indexes
usageRecordSchema.index({ userId: 1 });
usageRecordSchema.index({ projectId: 1 });
usageRecordSchema.index({ teamId: 1 });
usageRecordSchema.index({ provider: 1 });
usageRecordSchema.index({ timestamp: -1 });

// Compound indexes for common queries
usageRecordSchema.index({ projectId: 1, timestamp: -1 });
usageRecordSchema.index({ userId: 1, provider: 1, timestamp: -1 });

// TTL index to automatically delete records after 90 days
usageRecordSchema.index({ timestamp: 1 }, { expireAfterSeconds: 90 * 24 * 60 * 60 });

export const UsageRecord = mongoose.model<IUsageRecord>('UsageRecord', usageRecordSchema);
