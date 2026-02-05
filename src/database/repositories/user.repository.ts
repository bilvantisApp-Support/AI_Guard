import mongoose from 'mongoose';
import { User, IUser } from '../models/user.model';

export interface CreateUserDto {
  firebaseUid?: string;
  email: string;
  name: string;
  status?: 'active' | 'suspended' | 'deleted';
}

export interface UpdateUserDto {
  name?: string;
  status?: 'active' | 'suspended' | 'deleted';
  defaultProject?: mongoose.Types.ObjectId;
  lastLoginAt?: Date;
}

export class UserRepository {
  async createUser(userData: CreateUserDto): Promise<IUser> {
    const user = new User(userData);
    return await user.save();
  }

  async findById(userId: string | mongoose.Types.ObjectId): Promise<IUser | null> {
    return await User.findById(userId).exec();
  }

  async getActiveUsers(): Promise<IUser[] > {
    return await User.find({status: "active"}).exec()
  }

  async findByFirebaseUid(uid: string): Promise<IUser | null> {
    return await User.findOne({ firebaseUid: uid }).exec();
  }

  async findByEmail(email: string): Promise<IUser | null> {
    return await User.findOne({ email: email.toLowerCase() }).exec();
  }

  async updateUser(
    userId: string | mongoose.Types.ObjectId,
    updateData: UpdateUserDto
  ): Promise<IUser | null> {
    return await User.findByIdAndUpdate(
      userId,
      { $set: updateData },
      { new: true }
    ).exec();
  }

  async updateLastLogin(userId: string | mongoose.Types.ObjectId): Promise<void> {
    await User.findByIdAndUpdate(userId, {
      $set: { lastLoginAt: new Date() },
    }).exec();
  }

  async deleteUser(userId: string | mongoose.Types.ObjectId): Promise<IUser | null> {
    return await User.findByIdAndUpdate(
      userId,
      { $set: { status: 'deleted' } },
      { new: true }
    ).exec();
  }

  async findActiveUsers(
    filters: {
      email?: string;
      name?: string;
    } = {},
    pagination: {
      page?: number;
      limit?: number;
    } = {}
  ): Promise<{ users: IUser[]; total: number }> {
    const query: any = { status: 'active' };

    if (filters.email) {
      query.email = { $regex: filters.email, $options: 'i' };
    }

    if (filters.name) {
      query.name = { $regex: filters.name, $options: 'i' };
    }

    const page = pagination.page || 1;
    const limit = pagination.limit || 10;
    const skip = (page - 1) * limit;

    const [users, total] = await Promise.all([
      User.find(query).skip(skip).limit(limit).exec(),
      User.countDocuments(query).exec(),
    ]);

    return { users, total };
  }

  async getUserWithDefaultProject(userId: string | mongoose.Types.ObjectId): Promise<IUser | null> {
    return await User.findById(userId).populate('defaultProject').exec();
  }
}

export const userRepository = new UserRepository();