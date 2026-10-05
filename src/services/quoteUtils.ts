/**
 * Tiện ích xử lý tự động chuyển đổi dấu ngoặc kép thẳng ("") thành dấu ngoặc kép cong thông minh (“”)
 */

/**
 * Chuyển đổi toàn bộ dấu ngoặc kép thẳng ("") trong chuỗi thành dấu ngoặc kép cong (“”)
 */
export function convertStraightToSmartQuotes(text: string): string {
  if (!text || !text.includes('"')) return text;
  
  let result = '';
  let inQuote = false;
  
  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    if (char === '"') {
      const prevChar = i > 0 ? text[i - 1] : '';
      const nextChar = i < text.length - 1 ? text[i + 1] : '';
      
      const isStart = i === 0 || /[\s\n\r(【《{\[]/.test(prevChar);
      const isEnd = /[\s\n\r)】,》!?;:.,'"}\]]/.test(nextChar) || i === text.length - 1;
      
      if (isStart && !isEnd) {
        result += '“';
        inQuote = true;
      } else if (!isStart && isEnd) {
        result += '”';
        inQuote = false;
      } else {
        if (!inQuote) {
          result += '“';
          inQuote = true;
        } else {
          result += '”';
          inQuote = false;
        }
      }
    } else {
      result += char;
    }
  }
  return result;
}

/**
 * Xử lý sự kiện khi gõ phím ngoặc kép " (hoặc Backspace giữa cặp ngoặc kép “”)
 * Trả về true nếu đã xử lý (đã gọi preventDefault), false nếu để mặc định
 */
export function handleSmartQuotesKeyDown(
  e: React.KeyboardEvent<HTMLTextAreaElement | HTMLInputElement>,
  onValueChange?: (newVal: string) => void
): boolean {
  const target = e.currentTarget;

  // 1. Khi gõ phím ngoặc kép " (Shift + ')
  if (e.key === '"') {
    e.preventDefault();
    const start = target.selectionStart ?? 0;
    const end = target.selectionEnd ?? 0;
    const val = target.value;

    if (start !== end) {
      // Đang bôi đen text: bọc text lại bằng cặp “ và ”
      const selectedText = val.substring(start, end);
      const newVal = val.substring(0, start) + '“' + selectedText + '”' + val.substring(end);
      target.value = newVal;
      const newCursorPos = start + 1 + selectedText.length + 1;
      target.setSelectionRange(newCursorPos, newCursorPos);
      onValueChange?.(newVal);
      return true;
    } else {
      // Nếu con trỏ đang đứng ngay trước dấu đóng ” -> chỉ nhảy con trỏ qua
      if (val[start] === '”') {
        target.setSelectionRange(start + 1, start + 1);
        return true;
      }

      // Tự động chèn cặp “” và đặt con trỏ ở giữa “|”
      const newVal = val.substring(0, start) + '“”' + val.substring(start);
      target.value = newVal;
      target.setSelectionRange(start + 1, start + 1);
      onValueChange?.(newVal);
      return true;
    }
  }

  // 2. Xóa thông minh cặp “” khi bấm Backspace ở giữa “|”
  if (e.key === 'Backspace' && !e.ctrlKey && !e.altKey && !e.metaKey) {
    const start = target.selectionStart ?? 0;
    const end = target.selectionEnd ?? 0;
    if (start === end && start > 0) {
      const val = target.value;
      if (val[start - 1] === '“' && val[start] === '”') {
        e.preventDefault();
        const newVal = val.substring(0, start - 1) + val.substring(start + 1);
        target.value = newVal;
        target.setSelectionRange(start - 1, start - 1);
        onValueChange?.(newVal);
        return true;
      }
    }
  }

  return false;
}
