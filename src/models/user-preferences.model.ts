import mongoose, { Schema, type HydratedDocument, type Model } from "mongoose";
import { DEFAULT_CURRENCY } from "../constants/currency.js";
import { DEFAULT_TIMEZONE_PREFERENCE } from "../constants/timezone.js";
import {
  DEFAULT_THEME_PREFERENCE,
  THEME_PREFERENCES,
  type ThemePreference,
} from "../constants/user-preferences.js";

export type { ThemePreference };

export interface IUserPreferences {
  userId: mongoose.Types.ObjectId;
  theme: ThemePreference;
  timezone: string;
  defaultCurrency: string;
  /** Denominated in `defaultCurrency`. Null = not configured — never a fake 0. */
  monthlyIncome: number | null;
  createdAt: Date;
  updatedAt: Date;
}

export type UserPreferencesDocument = HydratedDocument<IUserPreferences>;
export type UserPreferencesModel = Model<IUserPreferences>;

const userPreferencesSchema = new Schema<IUserPreferences>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      unique: true,
      index: true,
    },
    theme: {
      type: String,
      enum: THEME_PREFERENCES,
      required: true,
      default: DEFAULT_THEME_PREFERENCE,
    },
    timezone: {
      type: String,
      required: true,
      trim: true,
      default: DEFAULT_TIMEZONE_PREFERENCE,
    },
    defaultCurrency: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      default: DEFAULT_CURRENCY,
      minlength: 3,
      maxlength: 3,
    },
    monthlyIncome: {
      type: Number,
      default: null,
      min: 0,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        return {
          id: String(ret["_id"]),
          userId: String(ret["userId"]),
          theme: ret["theme"],
          timezone: ret["timezone"],
          defaultCurrency: ret["defaultCurrency"],
          monthlyIncome: ret["monthlyIncome"] ?? null,
          createdAt: ret["createdAt"],
          updatedAt: ret["updatedAt"],
        };
      },
    },
  },
);

export const UserPreferences: UserPreferencesModel = mongoose.model<IUserPreferences>(
  "UserPreferences",
  userPreferencesSchema,
);
