/**
 * Tien ich xu ly tu dong dien dau ngoac va dau dac biet tu doan raw tieng Trung sang o edit
 * Ho tro cac dau: 【】, 《》, …… va ——
 */

/**
 * Trich xuat chi cac dau dac biet 【】, 《》, …… va —— tu chuoi nguon raw.
 * Vi du:
 * - "【第一章 陨落的天才】" -> "【】"
 * - "《斗破苍穹》" -> "《》"
 * - "“……”" -> "……"
 * - "“——”" -> "——"
 * - "【沈意：……嗯。】" -> "【……】"
 * - "【第1章……】" -> "【……】"
 * - "【第一章】《斗破苍穹》" -> "【】 《》"
 * - "普通句子" -> ""
 */
export function extractBracketsOnly(source: string): string {
  if (!source) return "";

  // Tim cac cap 【...】, 《...》, dau cham lung …… (hoac …) va dau gach ngang —— (hoac \u2014, \u2015)
  const regex = /(【[^】]*】|《[^》]*》|……|…+|\.{3,}|——|\u2014{1,}|\u2015{1,})/g;
  const matches = source.match(regex);

  if (!matches || matches.length === 0) {
    // Truong hop co ky tu mo/dong ngoac hoac dau dac biet nhung khong khop day du
    const hasKuo = source.includes('【') || source.includes('】');
    const hasShu = source.includes('《') || source.includes('》');
    const hasEllipsis = source.includes('……') || source.includes('…') || source.includes('...');
    const hasEmDash = source.includes('——') || source.includes('\u2014') || source.includes('\u2015') || source.includes('--');

    const fallback: string[] = [];
    if (hasKuo) fallback.push('【】');
    if (hasShu) fallback.push('《》');
    if (hasEllipsis) fallback.push('……');
    if (hasEmDash) fallback.push('——');
    return fallback.join(' ');
  }

  // Chuyen moi match thanh dau tuong ung
  const tokens: string[] = [];
  for (const m of matches) {
    if (m.startsWith('【') && m.endsWith('】')) {
      const inner = m.slice(1, -1);
      const innerMarks: string[] = [];
      if (inner.includes('……') || inner.includes('…') || inner.includes('...')) innerMarks.push('……');
      if (inner.includes('——') || inner.includes('\u2014') || inner.includes('\u2015') || inner.includes('--')) innerMarks.push('——');
      if (innerMarks.length > 0) {
        tokens.push('【' + innerMarks.join(' ') + '】');
      } else {
        tokens.push('【】');
      }
    } else if (m.startsWith('《') && m.endsWith('》')) {
      const inner = m.slice(1, -1);
      const innerMarks: string[] = [];
      if (inner.includes('……') || inner.includes('…') || inner.includes('...')) innerMarks.push('……');
      if (inner.includes('——') || inner.includes('\u2014') || inner.includes('\u2015') || inner.includes('--')) innerMarks.push('——');
      if (innerMarks.length > 0) {
        tokens.push('《' + innerMarks.join(' ') + '》');
      } else {
        tokens.push('《》');
      }
    } else if (m.includes('…') || m.includes('.')) {
      tokens.push('……');
    } else if (m.includes('—') || m.includes('\u2014') || m.includes('\u2015') || m.includes('-')) {
      tokens.push('——');
    }
  }

  return tokens.filter(Boolean).join(' ');
}

/**
 * Kiem tra xem mot doan raw co chua dau ngoac hoac dau dac biet 【】, 《》, ……, —— khong
 */
export function hasBracketsInRaw(source: string): boolean {
  if (!source) return false;
  return (
    source.includes('【') ||
    source.includes('】') ||
    source.includes('《') ||
    source.includes('》') ||
    source.includes('……') ||
    source.includes('…') ||
    source.includes('...') ||
    source.includes('——') ||
    source.includes('\u2014') ||
    source.includes('\u2015') ||
    source.includes('--')
  );
}

/**
 * Kiem tra xem gia tri o edit hien tai co can duoc tu dong cap nhat sang dau moi day du hon
 * (khi o dang trong hoac chi chua dau ngoac cu ma chua co chu do nguoi dung nhap vao)
 */
export function shouldUpgradeBrackets(currentVal: string, source: string): boolean {
  if (!source) return false;
  const newBrackets = extractBracketsOnly(source);
  if (!newBrackets) return false;

  const trimmed = (currentVal || '').trim();
  // Neu o edit dang trong
  if (!trimmed) return true;

  // Neu da khop dung voi gia tri dau moi -> khong can cap nhat
  if (trimmed === newBrackets) return false;

  // Neu gia tri hien tai chi la cac dau ngoac cu chua co …… hoac ——
  const isOnlyOldBrackets = trimmed === '【】' || trimmed === '《》' || trimmed === '【】 《》';
  if (isOnlyOldBrackets) return true;

  // Neu gia tri hien tai khong co bat ky chu cai hoac so nao (nguoi dung chua go noi dung)
  const hasAlphanumeric = /[a-zA-Z0-9\u00C0-\u024F\u1EA0-\u1EF9\u4E00-\u9FFF]/.test(trimmed);
  if (!hasAlphanumeric) {
    return true;
  }

  return false;
}
