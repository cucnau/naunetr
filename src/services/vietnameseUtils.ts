/**
 * Tiện ích chuẩn hoá văn bản tiếng Việt
 */
export function normalizeVietnameseText(text: string): string {
  if (!text) return "";
  return text.normalize("NFC");
}
