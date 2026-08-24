import mongoose from "mongoose";
import {
  UploadedFile,
  type FileDocument,
} from "../models/file.model.js";
import type { AttachmentKind } from "../utils/attachment-policy.js";

export type CreateFileRecord = {
  userId: string;
  originalName: string;
  mimeType: string;
  size: number;
  kind: AttachmentKind;
  url: string;
  publicId: string;
};

function toObjectId(id: string): mongoose.Types.ObjectId {
  return new mongoose.Types.ObjectId(id);
}

export const fileRepository = {
  async create(input: CreateFileRecord): Promise<FileDocument> {
    return UploadedFile.create({
      userId: toObjectId(input.userId),
      originalName: input.originalName,
      mimeType: input.mimeType,
      size: input.size,
      kind: input.kind,
      url: input.url,
      publicId: input.publicId,
    });
  },

  async findByIdForUser(
    fileId: string,
    userId: string,
  ): Promise<FileDocument | null> {
    return UploadedFile.findOne({
      _id: toObjectId(fileId),
      userId: toObjectId(userId),
    }).exec();
  },

  async findManyByIdsForUser(
    fileIds: string[],
    userId: string,
  ): Promise<FileDocument[]> {
    return UploadedFile.find({
      _id: { $in: fileIds.map(toObjectId) },
      userId: toObjectId(userId),
    }).exec();
  },
};
