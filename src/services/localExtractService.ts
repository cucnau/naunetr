import {
  AppStatus,
  Chapter,
  Character,
  CustomTerm,
  HistoryItem,
  Novel,
  Relationship,
  TextShortcut,
  TranslationResponse,
} from '../types';
import { db } from './db';

export interface ExtractedNovelItem {
  id: string;
  name: string;
  source: string;
}

export interface ExtractedChapterItem {
  chapter: Chapter;
  source: string;
}

export interface ExtractedSessionItem {
  id: string;
  label: string;
  source: string;
  novelId?: string;
  chapterId?: string;
  inputText: string;
  deeplText: string;
  preEditedText: string;
  result: TranslationResponse | null;
  completedSegments: number[];
  status: AppStatus;
  updatedAt?: number;
}

export interface ExtractedHistoryItem {
  item: HistoryItem;
  source: string;
}

export interface ExtractedLocalData {
  novels: ExtractedNovelItem[];
  chapters: ExtractedChapterItem[];
  sessions: ExtractedSessionItem[];
  historyItems: ExtractedHistoryItem[];
  customTerms: Array<{ term: CustomTerm; source: string }>;
  characters: Array<{ character: Character; source: string }>;
  relationships: Array<{ relationship: Relationship; source: string }>;
  shortcuts: Array<{ shortcut: TextShortcut; source: string }>;
}

export interface SelectedLocalRestoreData {
  novels: Novel[];
  chapters: Chapter[];
  sessionToRestore: ExtractedSessionItem | null;
  historyToRestore: HistoryItem[];
  customTerms: CustomTerm[];
  characters: Character[];
  relationships: Relationship[];
  shortcuts: TextShortcut[];
}

const isValidNonDefaultNovel = (n: any): n is Novel =>
  Boolean(n && typeof n === 'object' && n.id && typeof n.name === 'string' && n.name.trim().length > 0);

const readIdbStoreReadOnly = (
  database: IDBDatabase,
  storeName: string
): Promise<Array<{ key: IDBValidKey; value: any }>> => {
  return new Promise((resolve) => {
    if (!database.objectStoreNames.contains(storeName)) {
      resolve([]);
      return;
    }
    try {
      const tx = database.transaction(storeName, 'readonly');
      const store = tx.objectStore(storeName);
      const entries: Array<{ key: IDBValidKey; value: any }> = [];
      const req = store.openCursor();
      req.onsuccess = (ev) => {
        const cursor = (ev.target as IDBRequest<IDBCursorWithValue | null>).result;
        if (cursor) {
          entries.push({ key: cursor.key, value: cursor.value });
          cursor.continue();
        } else {
          resolve(entries);
        }
      };
      req.onerror = () => resolve([]);
    } catch (_) {
      resolve([]);
    }
  });
};

const openExistingIdbReadOnly = (name: string): Promise<IDBDatabase | null> => {
  return new Promise((resolve) => {
    try {
      const req = window.indexedDB.open(name);
      let createdEmpty = false;
      req.onupgradeneeded = () => {
        // Không tự tạo DB mới khi đang trích xuất read-only
        createdEmpty = true;
        try {
          req.transaction?.abort();
        } catch (_) {}
      };
      req.onsuccess = () => {
        if (createdEmpty) {
          req.result.close();
          resolve(null);
          return;
        }
        resolve(req.result);
      };
      req.onerror = () => resolve(null);
      req.onblocked = () => resolve(null);
    } catch (_) {
      resolve(null);
    }
  });
};

/**
 * Trích xuất toàn bộ dữ liệu hiện có trong trình duyệt (IndexedDB & LocalStorage) ở chế độ CHỈ ĐỌC
 * để người dùng xem trước và chủ động chọn lọc khôi phục những mục mình muốn.
 */
export const extractLocalBrowserData = async (): Promise<ExtractedLocalData> => {
  const novelMap = new Map<string, ExtractedNovelItem>();
  const chapterMap = new Map<string, ExtractedChapterItem>();
  const sessionList: ExtractedSessionItem[] = [];
  const historyMap = new Map<string, ExtractedHistoryItem>();
  const termMap = new Map<string, { term: CustomTerm; source: string }>();
  const charMap = new Map<string, { character: Character; source: string }>();
  const relMap = new Map<string, { relationship: Relationship; source: string }>();
  const shortcutMap = new Map<string, { shortcut: TextShortcut; source: string }>();

  const addNovel = (n: any, source: string) => {
    if (!isValidNonDefaultNovel(n)) return;
    if (n.id === 'default' && n.name.trim() === 'Truyện mặc định') return;
    const existing = novelMap.get(n.id);
    if (!existing) {
      novelMap.set(n.id, { id: String(n.id), name: n.name.trim(), source });
    }
  };

  const addChapter = (c: any, source: string) => {
    if (!c || typeof c !== 'object' || !c.id) return;
    const existing = chapterMap.get(c.id);
    const segCount = c.result?.segments?.length || 0;
    const existingSegCount = existing?.chapter.result?.segments?.length || 0;
    const ts = c.timestamp || 0;
    const existingTs = existing?.chapter.timestamp || 0;

    if (!existing || segCount > existingSegCount || (segCount === existingSegCount && ts > existingTs)) {
      chapterMap.set(c.id, { chapter: c as Chapter, source });
    }
  };

  const addSessionIfHasWork = (raw: any, id: string, source: string) => {
    if (!raw || typeof raw !== 'object') return;
    const inputText = typeof raw.inputText === 'string' ? raw.inputText : '';
    const deeplText = typeof raw.deeplText === 'string' ? raw.deeplText : '';
    const preEditedText = typeof raw.preEditedText === 'string' ? raw.preEditedText : '';
    const result = raw.result && typeof raw.result === 'object' ? (raw.result as TranslationResponse) : null;
    const segsLen = result?.segments?.length || 0;

    if (inputText.trim() || preEditedText.trim() || segsLen > 0) {
      const preview =
        (result?.segments?.[0]?.natural || result?.segments?.[0]?.source || inputText || preEditedText || '')
          .trim()
          .slice(0, 60);
      sessionList.push({
        id,
        label: preview ? `Bản thảo: "${preview}..."` : 'Bản thảo làm dở',
        source,
        novelId: raw.currentNovelId || raw.novelId,
        chapterId: raw.currentChapterId || raw.chapterId,
        inputText,
        deeplText,
        preEditedText,
        result,
        completedSegments: Array.isArray(raw.completedSegments) ? raw.completedSegments : [],
        status: (raw.status as AppStatus) || (result ? AppStatus.SUCCESS : AppStatus.IDLE),
        updatedAt: typeof raw.updatedAt === 'number' ? raw.updatedAt : undefined,
      });
    }

    if (Array.isArray(raw.characters)) {
      raw.characters.forEach((ch: any) => {
        if (ch && ch.id && (ch.chineseName || ch.vietName) && !charMap.has(ch.id)) {
          charMap.set(ch.id, { character: ch as Character, source });
        }
      });
    }
    if (Array.isArray(raw.relationships)) {
      raw.relationships.forEach((rel: any) => {
        if (rel && rel.id && (rel.charA || rel.charB) && !relMap.has(rel.id)) {
          relMap.set(rel.id, { relationship: rel as Relationship, source });
        }
      });
    }
    if (Array.isArray(raw.customTerms)) {
      raw.customTerms.forEach((t: any) => {
        if (t && t.id && t.term && !termMap.has(t.id)) {
          termMap.set(t.id, { term: t as CustomTerm, source });
        }
      });
    }
  };

  // 1. Quét toàn bộ IndexedDB của ứng dụng hiện tại (read-only)
  try {
    const [curChaps, curTerms, curChars, curActive] = await Promise.all([
      db.getAllChapters().catch(() => []),
      db.getAllCustomTerms().catch(() => []),
      db.getCharacters().catch(() => []),
      db.getActiveSession().catch(() => null),
    ]);

    curChaps.forEach((c) => addChapter(c, 'IndexedDB (hiện tại)'));
    curTerms.forEach((t) => {
      if (t && t.id && !termMap.has(t.id)) {
        termMap.set(t.id, { term: t, source: 'IndexedDB (hiện tại)' });
      }
    });
    curChars.forEach((ch) => {
      if (ch && ch.id && !charMap.has(ch.id)) {
        charMap.set(ch.id, { character: ch, source: 'IndexedDB (hiện tại)' });
      }
    });
    if (curActive) {
      addSessionIfHasWork(curActive, 'idb_current_active', 'IndexedDB (hiện tại)');
    }
  } catch (_) {}

  // 2. Quét tất cả các IndexedDB trên cùng origin (hỗ trợ tìm cả dữ liệu nằm ở DB scope khác)
  if (typeof window !== 'undefined' && window.indexedDB && typeof window.indexedDB.databases === 'function') {
    try {
      const dbInfos = await window.indexedDB.databases();
      for (const info of dbInfos) {
        if (!info.name || !info.name.startsWith('AppDB_')) continue;
        const opened = await openExistingIdbReadOnly(info.name);
        if (!opened) continue;
        try {
          const sourceLabel = `IndexedDB (${info.name})`;
          const [settingsEntries, chapterEntries, termEntries] = await Promise.all([
            readIdbStoreReadOnly(opened, 'settings'),
            readIdbStoreReadOnly(opened, 'chapters'),
            readIdbStoreReadOnly(opened, 'custom_terms'),
          ]);

          settingsEntries.forEach(({ key, value }) => {
            const kStr = String(key);
            if (kStr.startsWith('novels_list') && Array.isArray(value)) {
              value.forEach((n) => addNovel(n, `${sourceLabel} → ${kStr}`));
            } else if (kStr === 'characters_data' && Array.isArray(value)) {
              value.forEach((ch: any) => {
                if (ch && ch.id && !charMap.has(ch.id)) {
                  charMap.set(ch.id, { character: ch as Character, source: sourceLabel });
                }
              });
            } else if (kStr === 'active_session_data' && value) {
              addSessionIfHasWork(value, `idb_${info.name}_active`, sourceLabel);
            }
          });

          chapterEntries.forEach(({ value }) => addChapter(value, sourceLabel));
          termEntries.forEach(({ value }) => {
            if (value && value.id && !termMap.has(value.id)) {
              termMap.set(value.id, { term: value as CustomTerm, source: sourceLabel });
            }
          });
        } finally {
          opened.close();
        }
      }
    } catch (_) {}
  }

  // 3. Quét toàn bộ localStorage (read-only)
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      for (let i = 0; i < window.localStorage.length; i++) {
        const key = window.localStorage.key(i);
        if (!key) continue;
        const raw = window.localStorage.getItem(key);
        if (!raw || (!raw.trim().startsWith('{') && !raw.trim().startsWith('['))) continue;

        let parsed: any = null;
        try {
          parsed = JSON.parse(raw);
        } catch (_) {
          continue;
        }
        if (!parsed) continue;

        const lsSource = `LocalStorage (${key})`;

        if (key.includes('cached_novels') && Array.isArray(parsed)) {
          parsed.forEach((n) => addNovel(n, lsSource));
        } else if (
          (key.includes('app_single_session') || key.includes('chiVietSingleSession')) &&
          typeof parsed === 'object' &&
          !Array.isArray(parsed)
        ) {
          addSessionIfHasWork(parsed, `ls_${key}`, lsSource);
        } else if ((key.includes('app_history') || key.includes('chiVietHistory')) && Array.isArray(parsed)) {
          parsed.forEach((h: any) => {
            if (h && h.id && (h.sourceText || h.result) && !historyMap.has(h.id)) {
              historyMap.set(h.id, { item: h as HistoryItem, source: lsSource });
            }
          });
        } else if ((key.includes('edit_shortcuts') || key.includes('text_shortcuts')) && Array.isArray(parsed)) {
          parsed.forEach((sc: any) => {
            if (sc && sc.id && sc.shortcut && !shortcutMap.has(sc.id)) {
              shortcutMap.set(sc.id, { shortcut: sc as TextShortcut, source: lsSource });
            }
          });
        }
      }
    } catch (_) {}
  }

  // Khử trùng lặp sessions có nội dung giống hệt nhau
  const uniqueSessions: ExtractedSessionItem[] = [];
  const seenSessionKeys = new Set<string>();
  sessionList.forEach((s) => {
    const fingerprint = `${s.novelId || ''}|${s.chapterId || ''}|${s.inputText.slice(0, 120)}|${s.result?.segments?.length || 0}`;
    if (!seenSessionKeys.has(fingerprint)) {
      seenSessionKeys.add(fingerprint);
      uniqueSessions.push(s);
    }
  });

  return {
    novels: Array.from(novelMap.values()),
    chapters: Array.from(chapterMap.values()).sort(
      (a, b) => (b.chapter.timestamp || 0) - (a.chapter.timestamp || 0)
    ),
    sessions: uniqueSessions,
    historyItems: Array.from(historyMap.values()).sort(
      (a, b) => (b.item.timestamp || 0) - (a.item.timestamp || 0)
    ),
    customTerms: Array.from(termMap.values()),
    characters: Array.from(charMap.values()),
    relationships: Array.from(relMap.values()),
    shortcuts: Array.from(shortcutMap.values()),
  };
};
