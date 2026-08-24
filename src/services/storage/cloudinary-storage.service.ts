import { v2 as cloudinary, type UploadApiResponse } from "cloudinary";
import { randomUUID } from "node:crypto";
import { env } from "../../config/env.js";
import type { AttachmentKind } from "../../utils/attachment-policy.js";

cloudinary.config({
  cloud_name: env.CLOUDINARY_CLOUD_NAME,
  api_key: env.CLOUDINARY_API_KEY,
  api_secret: env.CLOUDINARY_API_SECRET,
  secure: true,
});

function resourceTypeForKind(kind: AttachmentKind): "image" | "raw" {
  return kind === "image" ? "image" : "raw";
}

export function buildOptimizedImageUrl(publicId: string): string {
  return cloudinary.url(publicId, {
    secure: true,
    fetch_format: "auto",
    quality: "auto",
  });
}

export function buildThumbnailImageUrl(
  publicId: string,
  width = 640,
  height = 480,
): string {
  return cloudinary.url(publicId, {
    secure: true,
    fetch_format: "auto",
    quality: "auto",
    width,
    height,
    crop: "limit",
  });
}

export function buildRawAssetUrl(publicId: string): string {
  return cloudinary.url(publicId, {
    secure: true,
    resource_type: "raw",
  });
}

export function buildDeliveryUrls(
  publicId: string,
  kind: AttachmentKind,
): { url: string; thumbnailUrl?: string } {
  if (kind === "image") {
    return {
      url: buildOptimizedImageUrl(publicId),
      thumbnailUrl: buildThumbnailImageUrl(publicId),
    };
  }

  return {
    url: buildRawAssetUrl(publicId),
  };
}

export const cloudinaryStorageService = {
  async uploadFile(input: {
    buffer: Buffer;
    kind: AttachmentKind;
    userId: string;
  }): Promise<{ url: string; publicId: string }> {
    const resourceType = resourceTypeForKind(input.kind);
    const folder = `expense-manager/${input.userId}`;

    const result = await new Promise<UploadApiResponse>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          public_id: randomUUID(),
          resource_type: resourceType,
        },
        (error, uploadResult) => {
          if (error || !uploadResult) {
            reject(error ?? new Error("Cloudinary upload failed"));
            return;
          }

          resolve(uploadResult);
        },
      );

      stream.end(input.buffer);
    });

    return {
      url: result.secure_url,
      publicId: result.public_id,
    };
  },

  async deleteFile(publicId: string, kind: AttachmentKind): Promise<void> {
    await cloudinary.uploader.destroy(publicId, {
      resource_type: resourceTypeForKind(kind),
    });
  },
};
