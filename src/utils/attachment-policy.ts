export const MAX_ATTACHMENT_BYTES = 8 * 1024 * 1024;

export const ATTACHMENT_KINDS = ["image", "pdf", "doc"] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

const IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/webp",
  "image/heic",
  "image/heif",
]);

const DOCUMENT_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const BLOCKED_EXPLICIT = new Set([
  "image/gif",
  "image/apng",
  "image/svg+xml",
]);

const EXTENSIONS_BY_KIND: Record<AttachmentKind, string[]> = {
  image: [".jpg", ".jpeg", ".png", ".webp", ".heic", ".heif"],
  pdf: [".pdf"],
  doc: [".doc", ".docx"],
};

export const ALLOWED_LABEL =
  "Images (JPG, PNG, WebP, HEIC), PDF, or Word (DOC, DOCX)";

function getExtension(fileName: string): string {
  const lowerName = fileName.toLowerCase();
  const dotIndex = lowerName.lastIndexOf(".");

  if (dotIndex === -1) {
    return "";
  }

  return lowerName.slice(dotIndex);
}

export function getAttachmentKind(
  mimeType: string,
  fileName = "",
): AttachmentKind | null {
  const lowerName = fileName.toLowerCase();
  const normalizedMime = mimeType.toLowerCase();

  if (
    BLOCKED_EXPLICIT.has(normalizedMime) ||
    lowerName.endsWith(".gif") ||
    normalizedMime.startsWith("video/") ||
    normalizedMime.startsWith("audio/")
  ) {
    return null;
  }

  if (
    IMAGE_TYPES.has(normalizedMime) ||
    lowerName.endsWith(".jpg") ||
    lowerName.endsWith(".jpeg") ||
    lowerName.endsWith(".png") ||
    lowerName.endsWith(".webp") ||
    lowerName.endsWith(".heic") ||
    lowerName.endsWith(".heif")
  ) {
    return "image";
  }

  if (normalizedMime.startsWith("image/")) {
    return null;
  }

  if (normalizedMime === "application/pdf" || lowerName.endsWith(".pdf")) {
    return "pdf";
  }

  if (
    DOCUMENT_TYPES.has(normalizedMime) ||
    lowerName.endsWith(".doc") ||
    lowerName.endsWith(".docx")
  ) {
    return "doc";
  }

  return null;
}

export function resolveStoredExtension(
  kind: AttachmentKind,
  fileName: string,
): string {
  const extension = getExtension(fileName);

  if (extension && EXTENSIONS_BY_KIND[kind].includes(extension)) {
    return extension;
  }

  switch (kind) {
    case "image":
      return ".jpg";
    case "pdf":
      return ".pdf";
    case "doc":
      return ".docx";
  }
}

export type AttachmentValidationResult =
  | {
      ok: true;
      kind: AttachmentKind;
    }
  | {
      ok: false;
      error: string;
    };

export function validateAttachmentInput(input: {
  mimeType: string;
  fileName: string;
  size: number;
}): AttachmentValidationResult {
  const normalizedMime = input.mimeType.toLowerCase();

  if (normalizedMime.startsWith("video/") || normalizedMime.startsWith("audio/")) {
    return {
      ok: false,
      error:
        "Video and audio files are not supported. Use an image, PDF, or Word document.",
    };
  }

  if (
    normalizedMime === "image/gif" ||
    input.fileName.toLowerCase().endsWith(".gif")
  ) {
    return {
      ok: false,
      error: "GIFs and stickers are not supported. Use JPG, PNG, WebP, or HEIC.",
    };
  }

  const kind = getAttachmentKind(input.mimeType, input.fileName);
  if (!kind) {
    return {
      ok: false,
      error: `Unsupported file. ${ALLOWED_LABEL}.`,
    };
  }

  if (input.size > MAX_ATTACHMENT_BYTES) {
    return {
      ok: false,
      error: "File is too large. Keep uploads under 8 MB.",
    };
  }

  if (input.size <= 0) {
    return {
      ok: false,
      error: "File is empty.",
    };
  }

  return { ok: true, kind };
}
