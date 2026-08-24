import { User, type UserDocument } from "../models/user.model.js";

export type CreateUserInput = {
  name: string;
  email: string;
  passwordHash: string;
};

export const userRepository = {
  async findByEmail(email: string): Promise<UserDocument | null> {
    return User.findOne({ email }).exec();
  },

  async findByEmailWithPassword(
    email: string,
  ): Promise<UserDocument | null> {
    return User.findOne({ email }).select("+passwordHash").exec();
  },

  async findById(id: string): Promise<UserDocument | null> {
    return User.findById(id).exec();
  },

  async create(input: CreateUserInput): Promise<UserDocument> {
    const user = await User.create(input);
    return user;
  },

  async existsByEmail(email: string): Promise<boolean> {
    const existing = await User.exists({ email }).exec();
    return existing !== null;
  },
};
