import { db, auth } from './firebase';
import { collection, doc, setDoc, getDocs, deleteDoc, writeBatch, query, where, Timestamp, onSnapshot } from 'firebase/firestore';
import { CustomTerm, Character, Relationship, Novel, Chapter, TextShortcut, TranslationSegment } from '../types';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  }
}

export function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData?.map(provider => ({
        providerId: provider.providerId,
        email: provider.email,
      })) || []
    },
    operationType,
    path
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

const sanitizeData = (obj: any): any => {
  if (obj === null || obj === undefined) return null;
  if (typeof obj !== 'object') return obj;
  if (obj instanceof Timestamp) return obj;
  if (Array.isArray(obj)) {
    return obj.map(sanitizeData).filter(v => v !== undefined);
  }
  const result: Record<string, any> = {};
  for (const key of Object.keys(obj)) {
    const val = obj[key];
    if (val !== undefined && val !== null) {
      const sanitizedVal = sanitizeData(val);
      if (sanitizedVal !== undefined && sanitizedVal !== null) {
        result[key] = sanitizedVal;
      }
    }
  }
  return result;
};

const dbCache = new Map<string, Map<string, any>>(); // Global cache to prevent repeated getDocs on POST

const withTimeout = <T>(promise: Promise<T>, ms: number = 8000, errorMsg: string = 'Thao tác Firestore quá thời gian'): Promise<T> => {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(errorMsg)), ms);
    promise
      .then(res => {
        clearTimeout(timer);
        resolve(res);
      })
      .catch(err => {
        clearTimeout(timer);
        reject(err);
      });
  });
};

export const getNovels = async (retryCount = 1): Promise<Novel[]> => {
  const user = auth.currentUser;
  if (!user) return [];
  const path = 'novels';
  try {
    const q = query(collection(db, path), where('userId', '==', user.uid));
    const snap = await withTimeout(getDocs(q), 8000, 'Tải danh sách truyện quá thời gian');
    const novels: Novel[] = [];
    snap.forEach(d => {
      novels.push({ id: d.id, name: d.data().name });
    });
    return novels;
  } catch (error) {
    if (retryCount > 0) {
      await new Promise(res => setTimeout(res, 1000));
      return getNovels(retryCount - 1);
    }
    console.warn("Không thể tải danh sách truyện từ đám mây (đang dùng cache cục bộ):", error);
    // Trả về danh sách từ cache cục bộ nếu có
    try {
      const cached = localStorage.getItem(`cached_novels_${user.uid}`) || localStorage.getItem('cached_novels_list');
      if (cached) {
        const parsed = JSON.parse(cached);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch (_) {}
    return [];
  }
};

export const createNovel = async (id: string, name: string): Promise<Novel> => {
  const user = auth.currentUser;
  if (!user) throw new Error('Bạn cần đăng nhập!');
  const path = `novels/${id}`;
  try {
    const novelRef = doc(db, 'novels', id);
    await withTimeout(
      setDoc(novelRef, { userId: user.uid, name, createdAt: Timestamp.now() }),
      7000,
      'Tạo truyện trên đám mây quá thời gian'
    );
    return { id, name };
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, path);
  }
};

export const deleteNovel = async (id: string): Promise<void> => {
  const user = auth.currentUser;
  if (!user) throw new Error('Bạn cần đăng nhập!');
  const path = `novels/${id}`;
  try {
    await withTimeout(deleteDoc(doc(db, 'novels', id)), 7000);
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
};

export const deleteFirestoreDoc = async (type: 'vocab' | 'char' | 'rel' | 'chapter' | 'shortcut', id: string): Promise<void> => {
  const user = auth.currentUser;
  if (!user || !id) return;
  const collectionName = type === 'vocab' ? 'customTerms' : type === 'char' ? 'characters' : type === 'rel' ? 'relationships' : type === 'shortcut' ? 'shortcuts' : 'chapters';
  try {
    await deleteDoc(doc(db, collectionName, id));
  } catch (error) {
    console.warn(`Lỗi xóa ${collectionName}/${id}:`, error);
  }
};

export const overwriteFirestoreData = async <T extends { id: string, novelId?: string }>(
  type: 'vocab' | 'char' | 'rel' | 'chapter' | 'shortcut',
  novelId: string,
  newItems: T[]
): Promise<void> => {
  const user = auth.currentUser;
  if (!user || !novelId) return;

  const collectionName = type === 'vocab' ? 'customTerms' : type === 'char' ? 'characters' : type === 'rel' ? 'relationships' : type === 'shortcut' ? 'shortcuts' : 'chapters';
  const collRef = collection(db, collectionName);

  // 1. Fetch all existing documents belonging to this user and novelId
  const q = query(collRef, where('userId', '==', user.uid), where('novelId', '==', novelId));
  const snapshot = await getDocs(q);

  const operations: { type: 'set' | 'delete', ref: any, data?: any }[] = [];

  // Delete all existing items
  snapshot.forEach(docSnap => {
    operations.push({ type: 'delete', ref: docSnap.ref });
  });

  // Prepare new items to insert
  newItems.forEach(item => {
    const rawData = {
      ...item,
      novelId,
      userId: user.uid,
      createdAt: Timestamp.now()
    };
    const dataToSave = sanitizeData(rawData);
    Object.keys(dataToSave).forEach(k => {
      if (dataToSave[k] === undefined) delete dataToSave[k];
    });
    operations.push({
      type: 'set',
      ref: doc(collRef, item.id),
      data: dataToSave
    });
  });

  // Execute in small batches to stay well within Firestore 10MB payload & 500 write limit
  const CHUNK_SIZE = 80;
  for (let i = 0; i < operations.length; i += CHUNK_SIZE) {
    const chunk = operations.slice(i, i + CHUNK_SIZE);
    const batch = writeBatch(db);
    chunk.forEach(op => {
      if (op.type === 'delete') {
        batch.delete(op.ref);
      } else {
        batch.set(op.ref, op.data, { merge: true });
      }
    });
    await batch.commit();
  }

  // Clear cache
  dbCache.delete(`${collectionName}_${novelId}`);
};

export const syncFirestoreData = async <T extends { id: string, novelId?: string }>(
  type: 'vocab' | 'char' | 'rel' | 'chapter' | 'shortcut',
  novelId: string,
  action: 'GET' | 'POST',
  payload?: T[]
): Promise<T[]> => {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Bạn cần đăng nhập để đồng bộ dữ liệu!');
  }
  if (!novelId) {
    throw new Error('Chưa chọn truyện!');
  }

  const collectionName = type === 'vocab' ? 'customTerms' : type === 'char' ? 'characters' : type === 'rel' ? 'relationships' : type === 'shortcut' ? 'shortcuts' : 'chapters';
  const collRef = collection(db, collectionName);

  if (action === 'GET') {
    const q = query(collRef, where('userId', '==', user.uid));
    const querySnapshot = await getDocs(q);
    const result: any[] = [];
    const localMap = new Map<string, any>();
    querySnapshot.forEach((doc) => {
      const data = doc.data();
      // Match if belongs to this novelId OR is a global/legacy item without novelId
      if (!data.novelId || data.novelId === novelId) {
        localMap.set(doc.id, data);
        const { userId, createdAt, ...rest } = data;
        result.push({ id: doc.id, ...rest, novelId: data.novelId || novelId });
      }
    });

    dbCache.set(`${collectionName}_${novelId}`, localMap);
    return result as T[];
  } else if (action === 'POST' && payload) {
    const cacheKey = `${collectionName}_${novelId}`;
    let dbDocsMap = dbCache.get(cacheKey);
    if (!dbDocsMap) {
      const q = query(collRef, where('userId', '==', user.uid), where('novelId', '==', novelId));
      const querySnapshot = await getDocs(q);
      dbDocsMap = new Map<string, any>();
      querySnapshot.forEach(doc => {
        dbDocsMap!.set(doc.id, doc.data());
      });
      dbCache.set(cacheKey, dbDocsMap);
    }
    
    const payloadIds = new Set(payload.map(item => item.id));

    // Group all operations to chunk them into batches of max 500
    const operations: { type: 'set' | 'delete', ref: any, data?: any }[] = [];

    // Generic field comparison to check if write can be skipped
    const areFieldsEqual = (localItem: any, dbItem: any) => {
      const allKeys = new Set([
        ...Object.keys(localItem),
        ...Object.keys(dbItem)
      ]);
      for (const key of allKeys) {
        if (key === 'createdAt' || key === 'userId') continue;
        const localVal = localItem[key];
        const dbVal = dbItem[key];
        if (localVal !== dbVal) {
          // If both values are falsy, treat them as equal (e.g. empty string vs undefined)
          if (!localVal && !dbVal) continue;
          return false;
        }
      }
      return true;
    };

    // Filter payload to strictly only items of this novelId
    const targetPayload = payload.filter(item => !item.novelId || item.novelId === novelId);

    // Add/Update items only if they are new or modified
    targetPayload.forEach(item => {
      const dbItem = dbDocsMap!.get(item.id);
      
      if (!dbItem || !areFieldsEqual(item, dbItem)) {
        const rawData = {
            ...item,
            novelId,
            userId: user.uid,
            createdAt: dbItem?.createdAt || Timestamp.now()
        };
        const dataToSave = sanitizeData(rawData);
        
        // Final defensive check: strictly delete any undefined properties from the sanitized object
        Object.keys(dataToSave).forEach(k => {
          if (dataToSave[k] === undefined) {
            delete dataToSave[k];
          }
        });

        operations.push({
          type: 'set',
          ref: doc(collRef, item.id),
          data: dataToSave
        });
        dbDocsMap!.set(item.id, dataToSave);
      }
    });

    if (operations.length === 0) {
      console.log(`Sync skipped for ${collectionName}: No changes detected.`);
      return payload;
    }

    console.log(`Syncing ${collectionName}: Performing ${operations.length} writes (${operations.filter(op => op.type === 'set').length} updates/creates, ${operations.filter(op => op.type === 'delete').length} deletions)`);

    // Commit operations in safe chunks of 80 to adhere strictly to Firestore 10MB payload and 500 write limits
    const CHUNK_SIZE = 80;
    for (let i = 0; i < operations.length; i += CHUNK_SIZE) {
      const chunk = operations.slice(i, i + CHUNK_SIZE);
      const batch = writeBatch(db);
      chunk.forEach(op => {
        if (op.type === 'delete') {
          batch.delete(op.ref);
        } else {
          batch.set(op.ref, op.data, { merge: true });
        }
      });
      await batch.commit();
    }

    return payload;
  }
  return [];
};

export const getChaptersFromCloud = async (novelId: string, retryCount = 1): Promise<Chapter[]> => {
  const user = auth.currentUser;
  if (!user || !novelId) return [];
  const path = 'chapters';
  try {
    const q = query(collection(db, path), where('userId', '==', user.uid), where('novelId', '==', novelId));
    const snap = await getDocs(q);
    const chapters: Chapter[] = [];
    snap.forEach(d => {
      const data = d.data();
      const { userId, ...rest } = data;
      chapters.push({ id: d.id, ...rest } as Chapter);
    });
    chapters.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    return chapters;
  } catch (error) {
    if (retryCount > 0) {
      await new Promise(res => setTimeout(res, 1200));
      return getChaptersFromCloud(novelId, retryCount - 1);
    }
    console.warn("Không thể tải chương từ đám mây (đang dùng cache cục bộ):", error);
    return [];
  }
};

const chapterDebounceTimers = new Map<string, any>();
const chaptersInFlight = new Set<string>();
const pendingChapterSaves = new Map<string, Chapter>();

export const saveChapterToCloud = async (chapter: Chapter, immediate: boolean = true): Promise<void> => {
  const user = auth.currentUser;
  if (!user) return; // Silent return if not logged in
  if (!chapter.novelId || !chapter.id) return;
  const path = `chapters/${chapter.id}`;

  const executeWrite = async (chap: Chapter) => {
    chaptersInFlight.add(chap.id);
    try {
      const rawData = {
        ...chap,
        userId: user.uid,
        createdAt: Timestamp.now()
      };
      const dataToSave = sanitizeData(rawData);
      Object.keys(dataToSave).forEach(k => {
        if (dataToSave[k] === undefined) delete dataToSave[k];
      });
      await setDoc(doc(db, 'chapters', chap.id), dataToSave, { merge: true });
    } catch (error: any) {
      console.warn("Lỗi lưu chương lên Cloud:", error?.message || error);
    } finally {
      chaptersInFlight.delete(chap.id);
      // Nếu trong lúc đang lưu mà có dữ liệu mới hơn được gõ vào, lưu tiếp lượt cuối cùng
      if (pendingChapterSaves.has(chap.id)) {
        const nextData = pendingChapterSaves.get(chap.id)!;
        pendingChapterSaves.delete(chap.id);
        executeWrite(nextData);
      }
    }
  };

  const scheduleSave = (chap: Chapter) => {
    if (chaptersInFlight.has(chap.id)) {
      // Đang có lượt ghi trên đường truyền, lưu lại snapshot mới nhất để ghi sau khi xong
      pendingChapterSaves.set(chap.id, chap);
      return;
    }
    executeWrite(chap);
  };

  if (immediate) {
    if (chapterDebounceTimers.has(chapter.id)) {
      clearTimeout(chapterDebounceTimers.get(chapter.id));
      chapterDebounceTimers.delete(chapter.id);
    }
    scheduleSave(chapter);
  } else {
    pendingChapterSaves.set(chapter.id, chapter);
    if (chapterDebounceTimers.has(chapter.id)) {
      clearTimeout(chapterDebounceTimers.get(chapter.id));
    }
    const timer = setTimeout(() => {
      chapterDebounceTimers.delete(chapter.id);
      const latest = pendingChapterSaves.get(chapter.id) || chapter;
      pendingChapterSaves.delete(chapter.id);
      scheduleSave(latest);
    }, 2500);
    chapterDebounceTimers.set(chapter.id, timer);
  }
};

export const bulkSaveChaptersToCloud = async (chapters: Chapter[]): Promise<void> => {
  const user = auth.currentUser;
  if (!user || chapters.length === 0) return;
  
  // Batch writes in small chunks of 5 chapters with pause to prevent stream exhaust
  const chunkSize = 5;
  for (let i = 0; i < chapters.length; i += chunkSize) {
    const chunk = chapters.slice(i, i + chunkSize);
    const batch = writeBatch(db);
    chunk.forEach(ch => {
      if (!ch.id) return;
      const rawData = {
        ...ch,
        userId: user.uid,
        createdAt: Timestamp.now()
      };
      const dataToSave = sanitizeData(rawData);
      Object.keys(dataToSave).forEach(k => {
        if (dataToSave[k] === undefined) delete dataToSave[k];
      });
      batch.set(doc(db, 'chapters', ch.id), dataToSave, { merge: true });
    });
    try {
      await batch.commit();
      if (i + chunkSize < chapters.length) {
        await new Promise(res => setTimeout(res, 500)); // Nghỉ ngắn giữa các batch
      }
    } catch (e) {
      console.warn("Lỗi lưu batch chương lên Cloud:", e);
    }
  }
};

export const deleteChapterFromCloud = async (chapterId: string): Promise<void> => {
  const user = auth.currentUser;
  if (!user) return;
  const path = `chapters/${chapterId}`;
  try {
    await deleteDoc(doc(db, 'chapters', chapterId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
};

export const clearNovelChaptersFromCloud = async (novelId: string): Promise<void> => {
  const user = auth.currentUser;
  if (!user || !novelId) return;
  const path = 'chapters';
  try {
    const q = query(collection(db, 'chapters'), where('userId', '==', user.uid), where('novelId', '==', novelId));
    const snap = await getDocs(q);
    const batch = writeBatch(db);
    snap.forEach(d => {
      batch.delete(d.ref);
    });
    await batch.commit();
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, path);
  }
};

export const getShortcutsFromCloud = async (novelId: string): Promise<TextShortcut[]> => {
  const user = auth.currentUser;
  if (!user || !novelId) return [];
  const path = 'shortcuts';
  try {
    const q = query(collection(db, path), where('userId', '==', user.uid), where('novelId', '==', novelId));
    const snap = await getDocs(q);
    const shortcuts: TextShortcut[] = [];
    snap.forEach(d => {
      const data = d.data();
      const { userId, createdAt, ...rest } = data;
      shortcuts.push({ id: d.id, ...rest, novelId: data.novelId || novelId } as TextShortcut);
    });
    return shortcuts;
  } catch (error) {
    console.warn("Không thể tải phím tắt từ đám mây (đang dùng cache cục bộ):", error);
    return [];
  }
};

export const saveShortcutsToCloud = async (novelId: string, shortcuts: TextShortcut[]): Promise<void> => {
  const user = auth.currentUser;
  if (!user || !novelId) return;
  await overwriteFirestoreData('shortcut', novelId, shortcuts);
};

// ==========================================
// REAL-TIME SYNCHRONIZATION (ĐỒNG BỘ THỜI GIAN THỰC TOÀN DIỆN)
// Laptop ⇄ Điện thoại thông minh (Phone) ⇄ Máy tính bảng
// ==========================================

export interface LiveSessionData {
  novelId?: string;
  chapterId?: string;
  chapterName?: string;
  status?: string;
  completedSegments?: number[];
  segments?: TranslationSegment[];
  result?: TranslationResponse | null;
  inputText?: string;
  deeplText?: string;
  preEditedText?: string;
  updatedAt: number;
  deviceId: string;
  lastEditedIndex?: number;
}

export const getDeviceId = (): string => {
  if (typeof window === 'undefined') return 'server';
  try {
    let id = localStorage.getItem('chiVietDeviceId');
    if (!id) {
      id = 'dev_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
      localStorage.setItem('chiVietDeviceId', id);
    }
    return id;
  } catch (e) {
    return 'dev_' + Math.random().toString(36).substring(2, 9);
  }
};

/**
 * Lắng nghe thay đổi thời gian thực của toàn bộ danh sách chương thuộc truyện
 */
export const subscribeToChapters = (
  novelId: string,
  onUpdate: (chapters: Chapter[]) => void,
  onError?: (error: any) => void
): (() => void) => {
  const user = auth.currentUser;
  if (!user || !novelId) {
    return () => {};
  }

  const path = 'chapters';
  const q = query(
    collection(db, path),
    where('userId', '==', user.uid),
    where('novelId', '==', novelId)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const chapters: Chapter[] = [];
      snapshot.forEach((d) => {
        const data = d.data();
        const { userId, ...rest } = data;
        chapters.push({ id: d.id, ...rest } as Chapter);
      });
      chapters.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      onUpdate(chapters);
    },
    (error) => {
      console.warn("Lỗi lắng nghe thời gian thực chương Firestore:", error);
      onError?.(error);
    }
  );
};

/**
 * Lắng nghe thay đổi thời gian thực của Toàn bộ Không gian làm việc (Active Workspace)
 * Bao gồm: Bộ truyện đang chọn, Chương đang mở, Bảng Edit đang hiển thị, Các đoạn đã xong (kể cả chưa lưu kho)
 */
export const subscribeToUserLiveWorkspace = (
  onUpdate: (data: LiveSessionData) => void,
  onError?: (error: any) => void
): (() => void) => {
  const user = auth.currentUser;
  if (!user) {
    return () => {};
  }

  const docRef = doc(db, 'activeSessions', `ws_${user.uid}`);

  return onSnapshot(
    docRef,
    (docSnap) => {
      if (docSnap.exists()) {
        const data = docSnap.data() as LiveSessionData;
        onUpdate(data);
      }
    },
    (error) => {
      console.warn("Lỗi lắng nghe thời gian thực Live Workspace:", error);
      onError?.(error);
    }
  );
};

let liveWorkspaceDebounceTimer: any = null;
let isLiveWorkspaceInFlight = false;
let pendingLiveWorkspaceData: Partial<LiveSessionData> | null = null;

/**
 * Đẩy toàn bộ trạng thái không gian làm việc hiện tại lên Cloud để các thiết bị khác đồng bộ tức thì
 */
export const saveUserLiveWorkspaceToCloud = async (
  data: Partial<LiveSessionData>,
  immediate: boolean = false
): Promise<void> => {
  const user = auth.currentUser;
  if (!user) return;

  const executeSave = async (payloadData: Partial<LiveSessionData>) => {
    isLiveWorkspaceInFlight = true;
    try {
      const docRef = doc(db, 'activeSessions', `ws_${user.uid}`);
      const payload: LiveSessionData = {
        novelId: payloadData.novelId || '',
        chapterId: payloadData.chapterId || '',
        chapterName: payloadData.chapterName || '',
        status: payloadData.status || '',
        completedSegments: payloadData.completedSegments || [],
        result: payloadData.result || (payloadData.segments ? { segments: payloadData.segments, naturalTranslation: payloadData.segments.map(s => s.natural).join('\n') } as any : null),
        inputText: payloadData.inputText || '',
        deeplText: payloadData.deeplText || '',
        preEditedText: payloadData.preEditedText || '',
        updatedAt: Date.now(),
        deviceId: getDeviceId(),
        lastEditedIndex: payloadData.lastEditedIndex
      };

      const sanitized = sanitizeData(payload);
      await setDoc(docRef, sanitized, { merge: true });
    } catch (e: any) {
      console.warn("Lỗi lưu Live Workspace lên Cloud:", e?.message || e);
    } finally {
      isLiveWorkspaceInFlight = false;
      if (pendingLiveWorkspaceData) {
        const next = pendingLiveWorkspaceData;
        pendingLiveWorkspaceData = null;
        executeSave(next);
      }
    }
  };

  const scheduleSave = (targetData: Partial<LiveSessionData>) => {
    if (isLiveWorkspaceInFlight) {
      pendingLiveWorkspaceData = targetData;
      return;
    }
    executeSave(targetData);
  };

  if (immediate) {
    if (liveWorkspaceDebounceTimer) clearTimeout(liveWorkspaceDebounceTimer);
    scheduleSave(data);
  } else {
    pendingLiveWorkspaceData = data;
    if (liveWorkspaceDebounceTimer) clearTimeout(liveWorkspaceDebounceTimer);
    liveWorkspaceDebounceTimer = setTimeout(() => {
      if (pendingLiveWorkspaceData) {
        const latest = pendingLiveWorkspaceData;
        pendingLiveWorkspaceData = null;
        scheduleSave(latest);
      }
    }, 2000);
  }
};



