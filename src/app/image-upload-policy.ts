import { t } from "../i18n/runtime";

export const UPLOAD_IMAGE_MIME_TYPES = [
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/avif",
] as const;

export const UPLOAD_IMAGE_MAX_BYTES = 2 * 1024 * 1024;

export const UPLOAD_IMAGE_ACCEPT = UPLOAD_IMAGE_MIME_TYPES.join(",");

type UploadValidation =
  | { ok: true }
  | {
      ok: false;
      message: string;
    };

const ALLOWED_UPLOAD_IMAGE_MIME_SET = new Set<string>(UPLOAD_IMAGE_MIME_TYPES);

function normalizeMimeType(value: unknown): string {
  return String(value || "").trim().toLowerCase();
}

export function isAllowedUploadImageMimeType(value: unknown): boolean {
  const mime = normalizeMimeType(value);
  return ALLOWED_UPLOAD_IMAGE_MIME_SET.has(mime);
}

export function getDataUrlMimeType(dataUrl: unknown): string {
  const value = String(dataUrl || "");
  const match = /^data:([^;,]+)[;,]/i.exec(value);
  return normalizeMimeType(match?.[1] || "");
}

export function validateUploadImageFile(file: File): UploadValidation {
  if (!(file instanceof File)) return { ok: false, message: t("upload.reselect") };

  if (!isAllowedUploadImageMimeType(file.type)) {
    return { ok: false, message: t("upload.type") };
  }

  if (!Number.isFinite(file.size) || file.size <= 0) {
    return { ok: false, message: t("upload.empty") };
  }

  if (file.size > UPLOAD_IMAGE_MAX_BYTES) {
    return { ok: false, message: t("upload.maxSize") };
  }

  return { ok: true };
}
