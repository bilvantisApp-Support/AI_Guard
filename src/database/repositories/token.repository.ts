import mongoose from 'mongoose';
import { PersonalAccessToken, IPersonalAccessToken } from '../models/token.model';

export interface CreateTokenDto {
  tokenIdentifier: string; // Token identifier for lookups
  tokenHash: string; // Hashed full token
  userId: mongoose.Types.ObjectId;
  projectId?: mongoose.Types.ObjectId;
  name: string;
  description?: string;
  scopes: string[];
  llmProvider: string;
  expiresAt?: Date;
}

export interface UpdateTokenDto {
  name?: string;
  scopes?: string[];
  lastUsedAt?: Date;
}

export class TokenRepository {
  async createToken(tokenData: CreateTokenDto): Promise<IPersonalAccessToken> {
    const token = new PersonalAccessToken(tokenData);
    return await token.save();
  }

  async findByIdentifier(tokenIdentifier: string): Promise<IPersonalAccessToken | null> {
    return await PersonalAccessToken.findOne({
      tokenIdentifier,
      isRevoked: false,
    }).exec();
  }

  async findById(tokenId: string | mongoose.Types.ObjectId): Promise<IPersonalAccessToken | null> {
    return await PersonalAccessToken.findById(tokenId).exec();
  }

  async findByUserId(
    userId: string | mongoose.Types.ObjectId,
    includeRevoked = false
  ): Promise<IPersonalAccessToken[]> {
    const query: any = { userId };
    if (!includeRevoked) {
      query.isRevoked = false;
    }

    return await PersonalAccessToken.find(query)
      .sort({ createdAt: -1 })
      .exec();
  }

  async findByProjectId(
    projectId: string | mongoose.Types.ObjectId,
    includeRevoked = false
  ): Promise<IPersonalAccessToken[]> {
    const query: any = { projectId };
    if (!includeRevoked) {
      query.isRevoked = false;
    }

    return await PersonalAccessToken.find(query)
      .sort({ createdAt: -1 })
      .exec();
  }

  async updateToken(
    tokenId: string | mongoose.Types.ObjectId,
    updateData: UpdateTokenDto
  ): Promise<IPersonalAccessToken | null> {
    return await PersonalAccessToken.findByIdAndUpdate(
      tokenId,
      { $set: updateData },
      { new: true }
    ).exec();
  }

  async updateLastUsed(tokenId: string | mongoose.Types.ObjectId): Promise<void> {
    await PersonalAccessToken.findByIdAndUpdate(tokenId, {
      $set: { lastUsedAt: new Date() },
    }).exec();
  }

  async revokeToken(tokenId: string | mongoose.Types.ObjectId): Promise<IPersonalAccessToken | null> {
    return await PersonalAccessToken.findByIdAndUpdate(
      tokenId,
      { $set: { isRevoked: true } },
      { new: true }
    ).exec();
  }

  async deleteExpiredTokens(): Promise<number> {
    const result = await PersonalAccessToken.deleteMany({
      expiresAt: { $lt: new Date() },
    }).exec();
    return result.deletedCount || 0;
  }

  async findByIdentifierWithUser(
    tokenIdentifier: string
  ): Promise<{
    token: IPersonalAccessToken;
    user: any;
  } | null> {
    const token = await PersonalAccessToken.findOne({
      tokenIdentifier,
      isRevoked: false,
    })
      .populate('userId')
      .exec();

    if (!token) {
      return null;
    }

    // Check if token is expired
    if (token.expiresAt && token.expiresAt < new Date()) {
      return null;
    }

    return {
      token,
      user: token.userId,
    };
  }

  async hasScope(tokenId: string | mongoose.Types.ObjectId, scope: string): Promise<boolean> {
    const token = await this.findById(tokenId);
    if (!token || token.isRevoked) {
      return false;
    }

    return token.scopes.includes(scope) || token.scopes.includes('admin');
  }
}

export const tokenRepository = new TokenRepository();
