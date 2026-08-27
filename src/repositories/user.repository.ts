import { User, type UserDocument } from "../models/user.model.js";

export type CreateUserInput = {
  name: string;
  email: string;
  passwordHash: string;
  emailVerified?: boolean;
};

export type EmailOtpStateUpdate = {
  emailOtpHash: string | null;
  emailOtpExpiresAt: Date | null;
  emailOtpAttempts: number;
  emailOtpLastSentAt: Date | null;
  emailOtpSendCount: number;
  emailOtpSendWindowStartedAt: Date | null;
};

const EMAIL_OTP_SELECT =
  "+emailOtpHash +emailOtpExpiresAt +emailOtpAttempts +emailOtpLastSentAt +emailOtpSendCount +emailOtpSendWindowStartedAt";

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

  async findByIdWithEmailOtp(id: string): Promise<UserDocument | null> {
    return User.findById(id).select(EMAIL_OTP_SELECT).exec();
  },

  async findByIds(ids: string[]): Promise<UserDocument[]> {
    if (ids.length === 0) {
      return [];
    }

    return User.find({
      _id: { $in: ids },
    }).exec();
  },

  async findByEmails(emails: string[]): Promise<UserDocument[]> {
    if (emails.length === 0) {
      return [];
    }

    const normalized = [
      ...new Set(emails.map((email) => email.toLowerCase().trim())),
    ];

    return User.find({
      email: { $in: normalized },
    }).exec();
  },

  async create(input: CreateUserInput): Promise<UserDocument> {
    const user = await User.create({
      name: input.name,
      email: input.email,
      passwordHash: input.passwordHash,
      emailVerified: input.emailVerified ?? false,
    });
    return user;
  },

  async existsByEmail(email: string): Promise<boolean> {
    const existing = await User.exists({ email }).exec();
    return existing !== null;
  },

  async updateEmailOtpState(
    userId: string,
    state: EmailOtpStateUpdate,
  ): Promise<UserDocument | null> {
    return User.findByIdAndUpdate(
      userId,
      {
        $set: state,
      },
      { returnDocument: "after" },
    )
      .select(EMAIL_OTP_SELECT)
      .exec();
  },

  async markEmailVerified(userId: string): Promise<UserDocument | null> {
    return User.findByIdAndUpdate(
      userId,
      {
        $set: {
          emailVerified: true,
          emailOtpHash: null,
          emailOtpExpiresAt: null,
          emailOtpAttempts: 0,
          emailOtpLastSentAt: null,
          emailOtpSendCount: 0,
          emailOtpSendWindowStartedAt: null,
        },
      },
      { returnDocument: "after" },
    ).exec();
  },

  async incrementEmailOtpAttempts(
    userId: string,
  ): Promise<UserDocument | null> {
    return User.findByIdAndUpdate(
      userId,
      {
        $inc: { emailOtpAttempts: 1 },
      },
      { returnDocument: "after" },
    )
      .select(EMAIL_OTP_SELECT)
      .exec();
  },

  async setPasswordResetToken(
    userId: string,
    input: { tokenHash: string; expiresAt: Date },
  ): Promise<UserDocument | null> {
    return User.findByIdAndUpdate(
      userId,
      {
        $set: {
          passwordResetTokenHash: input.tokenHash,
          passwordResetExpiresAt: input.expiresAt,
        },
      },
      { returnDocument: "after" },
    ).exec();
  },

  async findByPasswordResetTokenHash(
    tokenHash: string,
  ): Promise<UserDocument | null> {
    return User.findOne({ passwordResetTokenHash: tokenHash })
      .select("+passwordResetTokenHash +passwordResetExpiresAt")
      .exec();
  },

  async clearPasswordResetToken(userId: string): Promise<void> {
    await User.findByIdAndUpdate(userId, {
      $set: {
        passwordResetTokenHash: null,
        passwordResetExpiresAt: null,
      },
    }).exec();
  },

  async updatePasswordAndClearReset(
    userId: string,
    input: { passwordHash: string },
  ): Promise<UserDocument | null> {
    return User.findByIdAndUpdate(
      userId,
      {
        $set: {
          passwordHash: input.passwordHash,
          passwordResetTokenHash: null,
          passwordResetExpiresAt: null,
        },
      },
      { returnDocument: "after" },
    ).exec();
  },
};
