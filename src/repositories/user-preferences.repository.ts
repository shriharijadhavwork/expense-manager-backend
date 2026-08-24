import mongoose from "mongoose";
import {
  UserPreferences,
  type UserPreferencesDocument,
} from "../models/user-preferences.model.js";

export type UpdateUserPreferencesRecord = {
  theme?: "light" | "dark" | "system";
  timezone?: string;
  defaultCurrency?: string;
};

function toObjectId(id: string): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId(id);
}

export const userPreferencesRepository = {
  async createForUser(userId: string): Promise<UserPreferencesDocument> {
    return UserPreferences.create({
      userId: toObjectId(userId),
    });
  },

  async findByUserId(userId: string): Promise<UserPreferencesDocument | null> {
    return UserPreferences.findOne({ userId: toObjectId(userId) }).exec();
  },

  async getOrCreateForUser(userId: string): Promise<UserPreferencesDocument> {
    const existing = await this.findByUserId(userId);
    if (existing) {
      return existing;
    }

    return this.createForUser(userId);
  },

  async updateForUser(
    userId: string,
    updates: UpdateUserPreferencesRecord,
  ): Promise<UserPreferencesDocument | null> {
    return UserPreferences.findOneAndUpdate(
      { userId: toObjectId(userId) },
      { $set: updates },
      { returnDocument: "after", runValidators: true, upsert: true },
    ).exec();
  },
};
