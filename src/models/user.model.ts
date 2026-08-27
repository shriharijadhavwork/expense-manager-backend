import mongoose, { Schema, type HydratedDocument, type Model } from "mongoose";

export interface IUser {
  name: string;
  email: string;
  passwordHash: string;
  /** False until signup OTP is verified. Missing on legacy docs → treated as verified. */
  emailVerified: boolean;
  emailOtpHash: string | null;
  emailOtpExpiresAt: Date | null;
  emailOtpAttempts: number;
  emailOtpLastSentAt: Date | null;
  emailOtpSendCount: number;
  emailOtpSendWindowStartedAt: Date | null;
  passwordResetTokenHash: string | null;
  passwordResetExpiresAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

export type UserDocument = HydratedDocument<IUser>;
export type UserModel = Model<IUser>;

const userSchema = new Schema<IUser>(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
      index: true,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    emailVerified: {
      type: Boolean,
      default: false,
      index: true,
    },
    emailOtpHash: {
      type: String,
      default: null,
      select: false,
    },
    emailOtpExpiresAt: {
      type: Date,
      default: null,
      select: false,
    },
    emailOtpAttempts: {
      type: Number,
      default: 0,
      select: false,
    },
    emailOtpLastSentAt: {
      type: Date,
      default: null,
      select: false,
    },
    emailOtpSendCount: {
      type: Number,
      default: 0,
      select: false,
    },
    emailOtpSendWindowStartedAt: {
      type: Date,
      default: null,
      select: false,
    },
    passwordResetTokenHash: {
      type: String,
      default: null,
      select: false,
    },
    passwordResetExpiresAt: {
      type: Date,
      default: null,
      select: false,
    },
  },
  {
    timestamps: true,
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        return {
          id: String(ret["_id"]),
          name: ret["name"],
          email: ret["email"],
          emailVerified: ret["emailVerified"] ?? true,
          createdAt: ret["createdAt"],
          updatedAt: ret["updatedAt"],
        };
      },
    },
  },
);

userSchema.index(
  { passwordResetTokenHash: 1 },
  {
    unique: true,
    partialFilterExpression: {
      passwordResetTokenHash: { $type: "string" },
    },
  },
);

export const User: UserModel = mongoose.model<IUser>("User", userSchema);
