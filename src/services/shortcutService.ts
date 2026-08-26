import { TextShortcut } from '../types';
import { auth } from './firebase';
import { getShortcutsFromCloud, saveShortcutsToCloud } from './firestoreService';

const STORAGE_KEY = 'edit_shortcuts_v1';
const ENABLED_STORAGE_KEY = 'edit_shortcuts_enabled';

export const DEFAULT_SHORTCUTS: TextShortcut[] = [];

let syncDebounceTimer: NodeJS.Timeout | null = null;

export const getAllStoredShortcuts = (): TextShortcut[] => {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify([]));
      return [];
    }
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) return parsed;
    return [];
  } catch (err) {
    console.warn("Could not read shortcuts from localStorage", err);
    return [];
  }
};

export const getStoredShortcuts = (novelId?: string): TextShortcut[] => {
  const all = getAllStoredShortcuts();
  const targetId = novelId || '';
  return all.filter(s => (s.novelId || '') === targetId);
};

export const saveStoredShortcuts = (novelShortcuts: TextShortcut[], novelId?: string, skipCloudSave = false): void => {
  try {
    const all = getAllStoredShortcuts();
    const targetId = novelId || '';
    const remaining = all.filter(s => (s.novelId || '') !== targetId);
    const updated = novelShortcuts.map(s => ({
      ...s,
      novelId: targetId
    }));
    const fullList = [...remaining, ...updated];
    localStorage.setItem(STORAGE_KEY, JSON.stringify(fullList));
    window.dispatchEvent(new CustomEvent('shortcuts_updated', { detail: { novelId: targetId, shortcuts: updated } }));

    // Tự động lưu lên Firestore nếu đã đăng nhập và có novelId
    if (!skipCloudSave && auth.currentUser && targetId) {
      if (syncDebounceTimer) clearTimeout(syncDebounceTimer);
      syncDebounceTimer = setTimeout(() => {
        saveShortcutsToCloud(targetId, updated).catch(err => {
          console.warn("Tự động lưu phím tắt lên Firestore thất bại:", err);
        });
      }, 1000);
    }
  } catch (err) {
    console.error("Could not save shortcuts to localStorage", err);
  }
};

/**
 * Đồng bộ phím tắt từ đám mây (Firestore) về máy và ngược lại
 */
export const syncShortcutsFromCloud = async (novelId?: string): Promise<TextShortcut[]> => {
  const targetId = novelId || '';
  const localShortcuts = getStoredShortcuts(targetId);
  
  if (!auth.currentUser || !targetId) {
    return localShortcuts;
  }

  try {
    const cloudShortcuts = await getShortcutsFromCloud(targetId);
    if (cloudShortcuts && cloudShortcuts.length > 0) {
      // Kết hợp các phím tắt mới tạo cục bộ nếu có
      const cloudIds = new Set(cloudShortcuts.map(s => s.id));
      const localNew = localShortcuts.filter(s => !cloudIds.has(s.id));
      const merged = [...cloudShortcuts, ...localNew];

      saveStoredShortcuts(merged, targetId, true); // true = skipCloudSave to prevent loop
      return merged;
    } else if (localShortcuts.length > 0) {
      // Nếu trên đám mây chưa có nhưng local có thì đẩy lên đám mây
      await saveShortcutsToCloud(targetId, localShortcuts);
      return localShortcuts;
    }
  } catch (err) {
    console.warn("Lỗi đồng bộ phím tắt từ Firestore:", err);
  }

  return localShortcuts;
};


export const isShortcutsEnabled = (): boolean => {
  try {
    const val = localStorage.getItem(ENABLED_STORAGE_KEY);
    return val !== 'false'; // default is true
  } catch {
    return true;
  }
};

export const setShortcutsEnabled = (enabled: boolean): void => {
  try {
    localStorage.setItem(ENABLED_STORAGE_KEY, enabled ? 'true' : 'false');
    window.dispatchEvent(new CustomEvent('shortcuts_toggle', { detail: enabled }));
  } catch (err) {
    console.error("Could not save shortcut enabled state", err);
  }
};

/**
 * Smart casing replacement helper:
 * - "xh" -> "xe hơi"
 * - "Xh" -> "Xe hơi"
 * - "XH" -> "XE HƠI"
 */
export const formatWithCaseMatch = (typedWord: string, expansion: string): string => {
  if (!typedWord || !expansion) return expansion;

  // ALL UPPERCASE (e.g. XH -> XE HƠI)
  if (typedWord === typedWord.toUpperCase() && typedWord.length > 1) {
    return expansion.toUpperCase();
  }

  // Capitalize first letter (Title Case: Xh -> Xe hơi)
  if (typedWord[0] === typedWord[0].toUpperCase() && typedWord.slice(1) === typedWord.slice(1).toLowerCase()) {
    return expansion.charAt(0).toUpperCase() + expansion.slice(1);
  }

  // Lowercase default
  return expansion;
};

/**
 * Check if the word right before the cursor in an HTMLTextAreaElement / HTMLInputElement
 * matches any active shortcut, and replace it automatically.
 */
export const checkAndApplyShortcut = (
  inputEl: HTMLTextAreaElement | HTMLInputElement,
  shortcuts: TextShortcut[],
  triggerChar: string = ''
): { replaced: boolean; newText: string } => {
  if (!isShortcutsEnabled()) return { replaced: false, newText: inputEl.value };
  if (!shortcuts || shortcuts.length === 0) return { replaced: false, newText: inputEl.value };

  const start = inputEl.selectionStart;
  const end = inputEl.selectionEnd;
  if (start === null || end === null || start !== end) {
    return { replaced: false, newText: inputEl.value };
  }

  const text = inputEl.value;
  const textBeforeCursor = text.substring(0, start);

  // Match letters, numbers, and Vietnamese characters at the end of textBeforeCursor
  const match = textBeforeCursor.match(/([A-Za-z0-9àáảãạăằắẳẵặâầấẩẫậèéẻẽẹêềếểễệìíỉĩịòóỏõọôồốổỗộơờớởỡợùúủũụưừứửữựỳýỷỹỵđĐ_]+)$/);
  if (!match) return { replaced: false, newText: text };

  const typedWord = match[1];
  const wordStartPos = start - typedWord.length;

  const matched = shortcuts.find(
    s => s.enabled && s.shortcut.trim().toLowerCase() === typedWord.toLowerCase()
  );

  if (!matched) return { replaced: false, newText: text };

  const formattedExpansion = formatWithCaseMatch(typedWord, matched.expansion);
  const fullInserted = formattedExpansion + triggerChar;

  const newText = text.substring(0, wordStartPos) + fullInserted + text.substring(end);
  const newCursorPos = wordStartPos + fullInserted.length;

  inputEl.value = newText;
  inputEl.selectionStart = newCursorPos;
  inputEl.selectionEnd = newCursorPos;

  // Trigger input event to update React state listeners
  inputEl.dispatchEvent(new Event('input', { bubbles: true }));

  return { replaced: true, newText };
};
