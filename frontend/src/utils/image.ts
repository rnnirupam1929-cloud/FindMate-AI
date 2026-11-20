export const ACCEPTED_TYPES = ["image/jpeg", "image/png", "image/webp"];
export const MAX_BYTES = 5 * 1024 * 1024;

/** Client-side check for fast feedback. The server validates again (never trust the client). */
export function validateImage(file: File): string | null {
  if (!ACCEPTED_TYPES.includes(file.type)) return "Unsupported file type. Please choose a JPG, PNG or WebP image.";
  if (file.size > MAX_BYTES) return "This image is larger than 5 MB. Please choose a smaller one.";
  if (file.size === 0) return "This file is empty.";
  return null;
}
