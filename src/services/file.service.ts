import { fileRepository } from "../repositories/file.repository.js";
import {
  buildDeliveryUrls,
  cloudinaryStorageService,
} from "./storage/cloudinary-storage.service.js";
import type { FileDocument } from "../models/file.model.js";
import { validateAttachmentInput } from "../utils/attachment-policy.js";
import { ApiError } from "../utils/api-error.js";

export type SafeFile = {
  id: string;
  name: string;
  mimeType: string;
  size: number;
  kind: "image" | "pdf" | "doc";
  url: string;
  thumbnailUrl?: string;
  createdAt: string;
};

function sanitizeOriginalName(fileName: string): string {
  const baseName = fileName.split(/[/\\]/).pop() ?? "upload";
  const trimmed = baseName.trim();

  return trimmed.length > 0 ? trimmed.slice(0, 255) : "upload";
}

function toSafeFile(file: FileDocument): SafeFile {
  const delivery = buildDeliveryUrls(file.publicId, file.kind);

  return {
    id: String(file._id),
    name: file.originalName,
    mimeType: file.mimeType,
    size: file.size,
    kind: file.kind,
    url: delivery.url,
    ...(delivery.thumbnailUrl ? { thumbnailUrl: delivery.thumbnailUrl } : {}),
    createdAt: file.createdAt.toISOString(),
  };
}

export const fileService = {
  async upload(
    userId: string,
    input: {
      buffer: Buffer;
      originalName: string;
      mimeType: string;
      size: number;
    },
  ): Promise<SafeFile> {
    const originalName = sanitizeOriginalName(input.originalName);
    const validation = validateAttachmentInput({
      mimeType: input.mimeType,
      fileName: originalName,
      size: input.size,
    });

    if (!validation.ok) {
      throw ApiError.badRequest(validation.error);
    }

    const uploaded = await cloudinaryStorageService.uploadFile({
      buffer: input.buffer,
      kind: validation.kind,
      userId,
    });

    try {
      const file = await fileRepository.create({
        userId,
        originalName,
        mimeType: input.mimeType.toLowerCase(),
        size: input.size,
        kind: validation.kind,
        url: uploaded.url,
        publicId: uploaded.publicId,
      });

      return toSafeFile(file);
    } catch (error) {
      await cloudinaryStorageService
        .deleteFile(uploaded.publicId, validation.kind)
        .catch(() => undefined);
      throw error;
    }
  },

  async getById(userId: string, fileId: string): Promise<SafeFile> {
    const file = await fileRepository.findByIdForUser(fileId, userId);

    if (!file) {
      throw ApiError.notFound("File not found");
    }

    return toSafeFile(file);
  },

  async assertOwnedFileIds(
    userId: string,
    fileIds: string[],
  ): Promise<void> {
    if (fileIds.length === 0) {
      return;
    }

    const uniqueIds = [...new Set(fileIds)];
    const files = await fileRepository.findManyByIdsForUser(uniqueIds, userId);

    if (files.length !== uniqueIds.length) {
      throw ApiError.badRequest("One or more attachments are invalid");
    }
  },
};
