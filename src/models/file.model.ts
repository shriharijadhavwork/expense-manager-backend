import mongoose, { Schema, type HydratedDocument, type Model } from "mongoose";
import {
  ATTACHMENT_KINDS,
  type AttachmentKind,
} from "../utils/attachment-policy.js";

export interface IFile {
  userId: mongoose.Types.ObjectId;
  originalName: string;
  mimeType: string;
  size: number;
  kind: AttachmentKind;
  url: string;
  publicId: string;
  createdAt: Date;
}

export type FileDocument = HydratedDocument<IFile>;
export type FileModel = Model<IFile>;

const fileSchema = new Schema<IFile>(
  {
    userId: {
      type: Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },
    originalName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 255,
    },
    mimeType: {
      type: String,
      required: true,
      trim: true,
      maxlength: 127,
    },
    size: {
      type: Number,
      required: true,
      min: 1,
    },
    kind: {
      type: String,
      enum: ATTACHMENT_KINDS,
      required: true,
    },
    url: {
      type: String,
      required: true,
      trim: true,
    },
    publicId: {
      type: String,
      required: true,
      unique: true,
    },
  },
  {
    timestamps: { createdAt: true, updatedAt: false },
    toJSON: {
      transform(_doc, ret: Record<string, unknown>) {
        return {
          id: String(ret["_id"]),
          name: ret["originalName"],
          mimeType: ret["mimeType"],
          size: ret["size"],
          kind: ret["kind"],
          url: ret["url"],
          createdAt: ret["createdAt"],
        };
      },
    },
  },
);

fileSchema.index({ userId: 1, createdAt: -1 });

export const UploadedFile: FileModel = mongoose.model<IFile>(
  "UploadedFile",
  fileSchema,
);
