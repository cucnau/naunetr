import { db, auth } from './firebase';
import { collection, doc, setDoc, getDoc, getDocs, deleteDoc, writeBatch, query, where, Timestamp, onSnapshot } from 'firebase/firestore';
import { CustomTerm, Character, Relationship, Novel, Chapter, TextShortcut, TranslationSegment, TranslationResponse } from '../types';
import { getAppNamespace, getScopedStorageItem, recoverAllCachedNovels } from './storageNamespace';

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

let quotaExhaustedUntil: number = 0;

export const isCloudQuotaExhausted = (): boolean => {
  return Date.now() < quotaExhaustedUntil;
};

export const handleQuotaExhausted = (error: any) => {
  const msg = String(error?.message || error || '').toLowerCase();
  if (msg.includes('quota') || msg.includes('resource-exhausted') || msg.includes('resource_exhausted') || msg.includes('free daily read units')) {
    quotaExhaustedUntil = Date.now() + 15 * 60 * 1000;
    console.warn("Firestore đã đạt giới hạn miễn phí hàng ngày (Free daily read units). Ứng dụng tự động lưu trữ và phục hồi an toàn 100% từ IndexedDB/LocalStorage của thiết bị.");
  }
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
  if (isCloudQuotaExhausted()) {
    try {
      const userCached = getScopedStorageItem(`cached_novels_${user.uid}`);
      if (userCached) {
        const parsed = JSON.parse(userCached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (_) {}
    return [];
  }
  const path = 'novels';
  const currentScope = getAppScope();
  try {
    const q = query(collection(db, path), where('userId', '==', user.uid));
    const snap = await withTimeout(getDocs(q), 8000, 'Tải danh sách truyện quá thời gian');
    const myNovels: Novel[] = [];
    snap.forEach(d => {
      const data = d.data();
      if (data && data.name) {
        // QUY TẮC PHÂN LẬP 1: acc nào acc đó dùng - Tuyệt đối không lấy truyện của tài khoản khác
        if (data.userId && data.userId !== user.uid) return;

        // QUY TẮC PHÂN LẬP 2: web nào web nấy dùng - Tuyệt đối không lấy truyện của web repo khác
        if (data.appScope && data.appScope !== currentScope) return;

        myNovels.push({ id: d.id, name: data.name });
      }
    });

    return myNovels;
  } catch (error) {
    handleQuotaExhausted(error);
    if (!isCloudQuotaExhausted() && retryCount > 0) {
      await new Promise(res => setTimeout(res, 1000));
      return getNovels(retryCount - 1);
    }
    console.warn("Không thể tải danh sách truyện từ đám mây (đang dùng cache của tài khoản này):", error);
    try {
      const userCached = getScopedStorageItem(`cached_novels_${user.uid}`);
      if (userCached) {
        const parsed = JSON.parse(userCached);
        if (Array.isArray(parsed) && parsed.length > 0) return parsed;
      }
    } catch (_) {}
    return [];
  }
};

export const createNovel = async (id: string, name: string): Promise<Novel> => {
  const user = auth.currentUser;
  if (!user) throw new Error('Bạn cần đăng nhập!');
  if (isCloudQuotaExhausted()) {
    return { id, name };
  }
  const path = `novels/${id}`;
  const currentScope = getAppScope();
  try {
    const novelRef = doc(db, 'novels', id);
    await withTimeout(
      setDoc(novelRef, { 
        userId: user.uid, 
        appScope: currentScope, 
        name, 
        createdAt: Timestamp.now() 
      }, { merge: true }),
      7000,
      'Tạo truyện trên đám mây quá thời gian'
    );
    return { id, name };
  } catch (error) {
    handleQuotaExhausted(error);
    console.warn("Lỗi tạo truyện trên Firestore (đã lưu cục bộ):", error);
    return { id, name };
  }
};

export const deleteNovel = async (id: string): Promise<void> => {
  const user = auth.currentUser;
  if (!user) throw new Error('Bạn cần đăng nhập!');
  if (isCloudQuotaExhausted()) return;
  try {
    const novelRef = doc(db, 'novels', id);
    const snap = await getDoc(novelRef);
    if (snap.exists()) {
      const data = snap.data();
      // Nếu bộ truyện này thuộc về tài khoản khác (chỉ hiển thị nhầm trên máy này), KHÔNG xóa trên Firestore của người kia!
      if (data && data.userId && data.userId !== user.uid) {
        console.warn("Bộ truyện này thuộc tài khoản khác, bảo toàn an toàn trên Cloud cho bạn.");
        return;
      }
      await withTimeout(deleteDoc(novelRef), 7000);
    }
  } catch (error) {
    handleQuotaExhausted(error);
    console.warn("Không thể xóa truyện trên Firestore:", error);
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

  // 1. Fetch all existing documents belonging to this novelId
  const q = query(collRef, where('novelId', '==', novelId));
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
  if (!user || !novelId || isCloudQuotaExhausted()) {
    return (payload || []) as T[];
  }

  try {
    const collectionName = type === 'vocab' ? 'customTerms' : type === 'char' ? 'characters' : type === 'rel' ? 'relationships' : type === 'shortcut' ? 'shortcuts' : 'chapters';
    const collRef = collection(db, collectionName);

    if (action === 'GET') {
      const q = query(collRef, where('novelId', '==', novelId));
      const querySnapshot = await getDocs(q);
      const result: any[] = [];
      const localMap = new Map<string, any>();
      querySnapshot.forEach((doc) => {
        const data = doc.data();
        // Match strictly if belongs to this novelId and this user
        if (data.userId && data.userId !== user.uid) return;
        if (data.novelId === novelId) {
          localMap.set(doc.id, data);
          const { userId, createdAt, ...rest } = data;
          result.push({ id: doc.id, ...rest, novelId: data.novelId });
        }
      });

      dbCache.set(`${collectionName}_${novelId}`, localMap);
      return result as T[];
    } else if (action === 'POST' && payload) {
      const cacheKey = `${collectionName}_${novelId}`;
      let dbDocsMap = dbCache.get(cacheKey);
      if (!dbDocsMap) {
        const q = query(collRef, where('novelId', '==', novelId));
        const querySnapshot = await getDocs(q);
        dbDocsMap = new Map<string, any>();
        querySnapshot.forEach(doc => {
          const data = doc.data();
          if (data.userId && data.userId !== user.uid) return;
          dbDocsMap!.set(doc.id, data);
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
        return payload;
      }

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
  } catch (error) {
    handleQuotaExhausted(error);
    console.warn(`Lỗi đồng bộ ${type} Firestore (dùng dữ liệu bộ nhớ máy):`, error);
  }
  return (payload || []) as T[];
};

export const restoreLeanChapter = (raw: any): Chapter => {
  const chapter = { ...raw } as Chapter;
  if (chapter.result?.segments && chapter.result.segments.length > 0) {
    const segs = chapter.result.segments;
    if (!chapter.inputText) {
      chapter.inputText = segs.map(s => s.source || '').join('\n');
    }
    if (!chapter.deeplText) {
      chapter.deeplText = segs.map(s => s.deepl || '').join('\n');
    }
    if (!chapter.preEditedText) {
      chapter.preEditedText = segs.map(s => s.natural || '').join('\n');
    }
    if (!chapter.result.naturalTranslation) {
      chapter.result.naturalTranslation = segs.map(s => s.natural || '').join('\n');
    }
    if (!chapter.result.quickTrans) {
      chapter.result.quickTrans = segs.map(s => s.quick || '').join('\n');
    }
    if (!chapter.result.deeplTranslation) {
      chapter.result.deeplTranslation = segs.map(s => s.deepl || '').join('\n');
    }
  }
  return chapter;
};

const prepareChapterForCloud = (chap: Chapter, userId: string): Record<string, any> => {
  const currentScope = getAppScope();
  const rawData: any = {
    ...chap,
    userId,
    appScope: currentScope,
    novelId: chap.novelId,
    createdAt: Timestamp.now()
  };

  // Nếu chapter đã có segments chi tiết, luôn dọn dẹp các trường rác không dùng đến
  if (rawData.result?.segments && rawData.result.segments.length > 0) {
    rawData.result = {
      ...rawData.result,
      sinoVietnamese: "",
      vocabulary: []
    };

    const jsonEstimate = JSON.stringify(rawData);
    // Nếu kích thước > 350KB, loại bỏ chuỗi string nối dài trùng lặp để nằm gọn trong hạn mức Firestore
    if (jsonEstimate.length > 350 * 1024) {
      rawData.result = {
        segments: rawData.result.segments.map((s: any) => ({
          source: (s.source || '').trim(),
          natural: (s.natural || '').trim(),
          quick: (s.quick || '').trim(),
          deepl: (s.deepl || '').trim()
        })),
        naturalTranslation: "",
        quickTrans: "",
        deeplTranslation: "",
        sinoVietnamese: "",
        vocabulary: []
      };
      rawData.inputText = "";
      rawData.deeplText = "";
      rawData.preEditedText = "";
      rawData._isLean = true;
    }
  }

  const dataToSave = sanitizeData(rawData);
  Object.keys(dataToSave).forEach(k => {
    if (dataToSave[k] === undefined) delete dataToSave[k];
  });
  return dataToSave;
};

export const getChaptersFromCloud = async (novelId: string, retryCount = 1): Promise<Chapter[]> => {
  const user = auth.currentUser;
  if (!user || !novelId || novelId === 'default' || isCloudQuotaExhausted()) return [];
  const path = 'chapters';
  try {
    const q = query(collection(db, path), where('novelId', '==', novelId));
    const snap = await getDocs(q);
    const chapters: Chapter[] = [];
    snap.forEach(d => {
      const data = d.data();
      // ĐÚNG ACC: Tài khoản nào chỉ dùng chương của tài khoản đó
      if (data.userId && data.userId !== user.uid) return;
      // ĐÚNG CHƯƠNG CỦA TRUYỆN: Chỉ lấy chương của đúng bộ truyện này
      if (data.novelId && data.novelId !== novelId) return;

      const { userId, ...rest } = data;
      chapters.push(restoreLeanChapter({ id: d.id, ...rest, novelId }));
    });
    chapters.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
    return chapters;
  } catch (error) {
    handleQuotaExhausted(error);
    if (!isCloudQuotaExhausted() && retryCount > 0) {
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
  if (isCloudQuotaExhausted()) return;

  const executeWrite = async (chap: Chapter) => {
    if (isCloudQuotaExhausted()) return;
    chaptersInFlight.add(chap.id);
    try {
      const dataToSave = prepareChapterForCloud(chap, user.uid);
      await setDoc(doc(db, 'chapters', chap.id), dataToSave, { merge: true });
    } catch (error: any) {
      handleQuotaExhausted(error);
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
  if (isCloudQuotaExhausted()) return;
  
  // Batch writes in small chunks of 5 chapters with pause to prevent stream exhaust
  const chunkSize = 5;
  for (let i = 0; i < chapters.length; i += chunkSize) {
    const chunk = chapters.slice(i, i + chunkSize);
    const batch = writeBatch(db);
    chunk.forEach(ch => {
      if (!ch.id) return;
      const dataToSave = prepareChapterForCloud(ch, user.uid);
      batch.set(doc(db, 'chapters', ch.id), dataToSave, { merge: true });
    });
    try {
      await batch.commit();
      if (i + chunkSize < chapters.length) {
        await new Promise(res => setTimeout(res, 500)); // Nghỉ ngắn giữa các batch
      }
    } catch (e) {
      handleQuotaExhausted(e);
      console.warn("Lỗi lưu batch chương lên Cloud:", e);
      if (isCloudQuotaExhausted()) break;
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
    console.warn("Không thể xóa chương trên Cloud Firestore:", error);
  }
};

export const clearNovelChaptersFromCloud = async (novelId: string): Promise<void> => {
  const user = auth.currentUser;
  if (!user || !novelId || isCloudQuotaExhausted()) return;
  try {
    const q = query(collection(db, 'chapters'), where('novelId', '==', novelId));
    const snap = await getDocs(q);
    if (snap.empty) return;
    const batch = writeBatch(db);
    let count = 0;
    snap.forEach(d => {
      const data = d.data();
      if (!data?.userId || data.userId === user.uid) {
        batch.delete(d.ref);
        count++;
      }
    });
    if (count > 0) {
      await batch.commit();
    }
  } catch (error) {
    handleQuotaExhausted(error);
    console.warn("Không thể xóa các chương của truyện trên Firestore:", error);
  }
};

export const getShortcutsFromCloud = async (novelId: string): Promise<TextShortcut[]> => {
  const user = auth.currentUser;
  if (!user || !novelId) return [];
  const path = 'shortcuts';
  try {
    const q = query(collection(db, path), where('novelId', '==', novelId));
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
    let id = localStorage.getItem('app_device_id');
    if (!id) {
      id = 'dev_' + Math.random().toString(36).substring(2, 9) + '_' + Date.now();
      localStorage.setItem('app_device_id', id);
    }
    return id;
  } catch (e) {
    return 'dev_' + Math.random().toString(36).substring(2, 9);
  }
};

/**
 * Xác định phân vùng không gian làm việc (App Scope / Instance Key)
 * Giúp tách biệt hoàn toàn các bản web chạy ở repo khác nhau trên GitHub Pages
 * tránh việc bị sync đè lên bảng đang edit dở của nhau.
 */
export const getAppScope = (): string => {
  return getAppNamespace();
};

export const setAppScope = (scope: string): void => {
  if (typeof window === 'undefined') return;
  try {
    if (!scope || !scope.trim()) {
      localStorage.removeItem('app_workspace_scope');
    } else {
      const clean = scope.trim().toLowerCase().replace(/[^a-z0-9_-]/g, '_');
      localStorage.setItem('app_workspace_scope', clean);
    }
    window.location.reload();
  } catch (_) {}
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
  if (!user || !novelId || novelId === 'default' || isCloudQuotaExhausted()) {
    return () => {};
  }

  const path = 'chapters';
  const q = query(
    collection(db, path),
    where('novelId', '==', novelId)
  );

  return onSnapshot(
    q,
    (snapshot) => {
      const chapters: Chapter[] = [];
      snapshot.forEach((d) => {
        const data = d.data();
        if (data.userId && data.userId !== user.uid) return;
        if (data.novelId && data.novelId !== novelId) return;
        const { userId, ...rest } = data;
        chapters.push(restoreLeanChapter({ id: d.id, ...rest, novelId }));
      });
      chapters.sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      onUpdate(chapters);
    },
    (error) => {
      handleQuotaExhausted(error);
      console.warn("Lỗi lắng nghe thời gian thực chương Firestore (dùng dữ liệu bộ nhớ máy):", error);
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
  if (!user || isCloudQuotaExhausted()) {
    return () => {};
  }

  const scope = getAppScope();
  const docRef = doc(db, 'activeSessions', `ws_${user.uid}_${scope}`);

  return onSnapshot(
    docRef,
    (docSnap) => {
      if (docSnap.exists()) {
        const raw = docSnap.data();
        let data = raw as LiveSessionData;
        if ((raw as any)._isLean && data.result?.segments && data.result.segments.length > 0) {
          const segs = data.result.segments;
          if (!data.inputText) data.inputText = segs.map(s => s.source || '').join('\n');
          if (!data.deeplText) data.deeplText = segs.map(s => s.deepl || '').join('\n');
          if (!data.result.naturalTranslation) data.result.naturalTranslation = segs.map(s => s.natural || '').join('\n');
          if (!data.result.quickTrans) data.result.quickTrans = segs.map(s => s.quick || '').join('\n');
          if (!data.result.deeplTranslation) data.result.deeplTranslation = segs.map(s => s.deepl || '').join('\n');
        }
        onUpdate(data);
      }
    },
    (error) => {
      handleQuotaExhausted(error);
      console.warn("Lỗi lắng nghe thời gian thực Live Workspace (dùng dữ liệu bộ nhớ máy):", error);
      onError?.(error);
    }
  );
};

/**
 * Đọc tiến độ thực tế đang làm dở từ Cloud Firestore để khôi phục đúng chỗ đang làm khi đăng nhập/mở web
 */
export const getUserLiveWorkspaceFromCloud = async (): Promise<LiveSessionData | null> => {
  const user = auth.currentUser;
  if (!user || isCloudQuotaExhausted()) return null;
  const scope = getAppScope();
  try {
    const docRef = doc(db, 'activeSessions', `ws_${user.uid}_${scope}`);
    const docSnap = await getDoc(docRef);
    if (docSnap.exists()) {
      const raw = docSnap.data();
      let data = raw as LiveSessionData;
      if ((raw as any)._isLean && data.result?.segments && data.result.segments.length > 0) {
        const segs = data.result.segments;
        if (!data.inputText) data.inputText = segs.map(s => s.source || '').join('\n');
        if (!data.deeplText) data.deeplText = segs.map(s => s.deepl || '').join('\n');
        if (!data.result.naturalTranslation) data.result.naturalTranslation = segs.map(s => s.natural || '').join('\n');
        if (!data.result.quickTrans) data.result.quickTrans = segs.map(s => s.quick || '').join('\n');
        if (!data.result.deeplTranslation) data.result.deeplTranslation = segs.map(s => s.deepl || '').join('\n');
      }
      return data;
    }
    // Fallback: Tìm session với scope root hoặc default nếu chuyển đổi web
    const fallbackRef = doc(db, 'activeSessions', `ws_${user.uid}_root_app`);
    const fallbackSnap = await getDoc(fallbackRef);
    if (fallbackSnap.exists()) {
      return fallbackSnap.data() as LiveSessionData;
    }
  } catch (e) {
    handleQuotaExhausted(e);
    console.warn("Lỗi đọc Live Workspace từ Cloud Firestore (sử dụng bản lưu bộ nhớ máy):", e);
  }
  return null;
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
  if (isCloudQuotaExhausted()) return;

  const executeSave = async (payloadData: Partial<LiveSessionData>) => {
    if (isCloudQuotaExhausted()) return;
    isLiveWorkspaceInFlight = true;
    try {
      const scope = getAppScope();
      const docRef = doc(db, 'activeSessions', `ws_${user.uid}_${scope}`);
      const payload: any = {
        userId: user.uid,
        novelId: payloadData.novelId || '',
        chapterId: payloadData.chapterId || '',
        chapterName: payloadData.chapterName || '',
        status: payloadData.status || '',
        completedSegments: payloadData.completedSegments || [],
        result: payloadData.result || (payloadData.segments ? { segments: payloadData.segments, naturalTranslation: payloadData.segments.map(s => s.natural).join('\n') } as any : null),
        inputText: payloadData.inputText || '',
        deeplText: payloadData.deeplText || '',
        preEditedText: payloadData.preEditedText || '',
        updatedAt: payloadData.updatedAt || Date.now(),
        deviceId: getDeviceId(),
        lastEditedIndex: payloadData.lastEditedIndex
      };

      // If estimated size > 500KB and segments exist, omit duplicate full-text strings
      if (payload.result?.segments && payload.result.segments.length > 0) {
        const jsonEstimate = JSON.stringify(payload);
        if (jsonEstimate.length > 500 * 1024) {
          payload.result = {
            segments: payload.result.segments,
            naturalTranslation: "",
            quickTrans: "",
            deeplTranslation: "",
            sinoVietnamese: "",
            vocabulary: []
          };
          payload.inputText = "";
          payload.deeplText = "";
          payload.preEditedText = "";
          payload._isLean = true;
        }
      }

      const sanitized = sanitizeData(payload);
      await setDoc(docRef, sanitized, { merge: true });
    } catch (e: any) {
      handleQuotaExhausted(e);
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

export interface RecoveredCloudData {
  novels: Novel[];
  chapters: Chapter[];
  customTerms: CustomTerm[];
  characters: Character[];
  relationships: Relationship[];
  shortcuts: TextShortcut[];
  latestWorkspace: LiveSessionData | null;
}

/**
 * Khôi phục TẤT CẢ dữ liệu thuộc về tài khoản đang đăng nhập từ Firestore
 * (Truy vấn trực tiếp theo userId trên toàn bộ collection, không bỏ sót do lệch appScope).
 */
export const recoverAllUserDataFromFirestore = async (): Promise<RecoveredCloudData> => {
  const user = auth.currentUser;
  if (!user) {
    throw new Error('Bạn cần đăng nhập tài khoản trước khi khôi phục dữ liệu từ Firestore.');
  }

  const novelMap = new Map<string, Novel>();
  const chapterMap = new Map<string, Chapter>();
  const termMap = new Map<string, CustomTerm>();
  const charMap = new Map<string, Character>();
  const relMap = new Map<string, Relationship>();
  const shortcutMap = new Map<string, TextShortcut>();

  try {
    // 1. Tải toàn bộ dữ liệu gắn với userId của tài khoản này
    const [
      novelsSnap,
      chaptersSnap,
      termsSnap,
      charsSnap,
      relsSnap,
      shortcutsSnap,
      sessionsByUidSnap,
    ] = await withTimeout(
      Promise.all([
        getDocs(query(collection(db, 'novels'), where('userId', '==', user.uid))),
        getDocs(query(collection(db, 'chapters'), where('userId', '==', user.uid))),
        getDocs(query(collection(db, 'customTerms'), where('userId', '==', user.uid))),
        getDocs(query(collection(db, 'characters'), where('userId', '==', user.uid))),
        getDocs(query(collection(db, 'relationships'), where('userId', '==', user.uid))),
        getDocs(query(collection(db, 'shortcuts'), where('userId', '==', user.uid))),
        getDocs(query(collection(db, 'activeSessions'), where('userId', '==', user.uid))),
      ]),
      15000,
      'Khôi phục dữ liệu từ Firestore quá thời gian. Vui lòng thử lại.'
    );

    novelsSnap.forEach((d) => {
      const data = d.data();
      if (data && data.name && (!data.userId || data.userId === user.uid)) {
        novelMap.set(d.id, { id: d.id, name: String(data.name).trim() });
      }
    });

    chaptersSnap.forEach((d) => {
      const data = d.data();
      if (data && (!data.userId || data.userId === user.uid)) {
        const { userId, ...rest } = data;
        chapterMap.set(d.id, restoreLeanChapter({ id: d.id, ...rest }));
      }
    });

    termsSnap.forEach((d) => {
      const data = d.data();
      if (data && (!data.userId || data.userId === user.uid)) {
        const { userId, createdAt, ...rest } = data;
        termMap.set(d.id, { id: d.id, ...rest } as CustomTerm);
      }
    });

    charsSnap.forEach((d) => {
      const data = d.data();
      if (data && (!data.userId || data.userId === user.uid)) {
        const { userId, createdAt, ...rest } = data;
        charMap.set(d.id, { id: d.id, ...rest } as Character);
      }
    });

    relsSnap.forEach((d) => {
      const data = d.data();
      if (data && (!data.userId || data.userId === user.uid)) {
        const { userId, createdAt, ...rest } = data;
        relMap.set(d.id, { id: d.id, ...rest } as Relationship);
      }
    });

    shortcutsSnap.forEach((d) => {
      const data = d.data();
      if (data && (!data.userId || data.userId === user.uid)) {
        const { userId, createdAt, ...rest } = data;
        shortcutMap.set(d.id, { id: d.id, ...rest } as TextShortcut);
      }
    });

    // 2. Bổ sung kiểm tra các bản lưu theo từng novelId của tài khoản này (phòng dữ liệu cũ thiếu field userId)
    const knownNovelIds = Array.from(novelMap.keys()).filter((id) => id && id !== 'default');
    for (const nId of knownNovelIds) {
      const [nChaps, nTerms, nChars, nRels, nShortcuts] = await Promise.all([
        getDocs(query(collection(db, 'chapters'), where('novelId', '==', nId))).catch(() => null),
        getDocs(query(collection(db, 'customTerms'), where('novelId', '==', nId))).catch(() => null),
        getDocs(query(collection(db, 'characters'), where('novelId', '==', nId))).catch(() => null),
        getDocs(query(collection(db, 'relationships'), where('novelId', '==', nId))).catch(() => null),
        getDocs(query(collection(db, 'shortcuts'), where('novelId', '==', nId))).catch(() => null),
      ]);

      nChaps?.forEach((d) => {
        const data = d.data();
        if (data && (!data.userId || data.userId === user.uid) && !chapterMap.has(d.id)) {
          const { userId, ...rest } = data;
          chapterMap.set(d.id, restoreLeanChapter({ id: d.id, ...rest, novelId: nId }));
        }
      });
      nTerms?.forEach((d) => {
        const data = d.data();
        if (data && (!data.userId || data.userId === user.uid) && !termMap.has(d.id)) {
          const { userId, createdAt, ...rest } = data;
          termMap.set(d.id, { id: d.id, ...rest, novelId: nId } as CustomTerm);
        }
      });
      nChars?.forEach((d) => {
        const data = d.data();
        if (data && (!data.userId || data.userId === user.uid) && !charMap.has(d.id)) {
          const { userId, createdAt, ...rest } = data;
          charMap.set(d.id, { id: d.id, ...rest, novelId: nId } as Character);
        }
      });
      nRels?.forEach((d) => {
        const data = d.data();
        if (data && (!data.userId || data.userId === user.uid) && !relMap.has(d.id)) {
          const { userId, createdAt, ...rest } = data;
          relMap.set(d.id, { id: d.id, ...rest, novelId: nId } as Relationship);
        }
      });
      nShortcuts?.forEach((d) => {
        const data = d.data();
        if (data && (!data.userId || data.userId === user.uid) && !shortcutMap.has(d.id)) {
          const { userId, createdAt, ...rest } = data;
          shortcutMap.set(d.id, { id: d.id, ...rest, novelId: nId } as TextShortcut);
        }
      });
    }

    // 3. Tự động tái tạo đầu truyện nếu có chương/từ vựng thuộc về novelId chưa có trong collection novels
    chapterMap.forEach((chap) => {
      if (chap.novelId && chap.novelId !== 'default' && !novelMap.has(chap.novelId)) {
        const candidateName = (chap as any).novelName || (chap.name ? `Truyện (${chap.name.slice(0, 28)})` : `Truyện khôi phục (${chap.novelId.slice(-4)})`);
        novelMap.set(chap.novelId, { id: chap.novelId, name: candidateName });
      }
    });

    if (novelMap.size > 1 && novelMap.has('default')) {
      novelMap.delete('default');
    }

    // 4. Tìm tiến độ làm việc dở dang (activeSessions) thuộc về user này
    const candidateWorkspaces: LiveSessionData[] = [];
    const currentScope = getAppScope();
    const directScopeIds = Array.from(new Set([`ws_${user.uid}_${currentScope}`, `ws_${user.uid}_root_app`]));
    const directSnaps = await Promise.all(
      directScopeIds.map((docId) => getDoc(doc(db, 'activeSessions', docId)).catch(() => null))
    );

    const parseWorkspaceDoc = (raw: any): LiveSessionData | null => {
      if (!raw) return null;
      if (raw.userId && raw.userId !== user.uid) return null;
      const data = { ...raw } as LiveSessionData;
      if ((raw as any)._isLean && data.result?.segments && data.result.segments.length > 0) {
        const segs = data.result.segments;
        if (!data.inputText) data.inputText = segs.map((s) => s.source || '').join('\n');
        if (!data.deeplText) data.deeplText = segs.map((s) => s.deepl || '').join('\n');
        if (!data.result.naturalTranslation) data.result.naturalTranslation = segs.map((s) => s.natural || '').join('\n');
        if (!data.result.quickTrans) data.result.quickTrans = segs.map((s) => s.quick || '').join('\n');
        if (!data.result.deeplTranslation) data.result.deeplTranslation = segs.map((s) => s.deepl || '').join('\n');
      }
      return data;
    };

    directSnaps.forEach((s) => {
      if (s && s.exists()) {
        const parsed = parseWorkspaceDoc(s.data());
        if (parsed) candidateWorkspaces.push(parsed);
      }
    });

    sessionsByUidSnap.forEach((d) => {
      const parsed = parseWorkspaceDoc(d.data());
      if (parsed) candidateWorkspaces.push(parsed);
    });

    const nonEmptyWorkspaces = candidateWorkspaces
      .filter((w) =>
        Boolean(
          (w.inputText && w.inputText.trim().length > 0) ||
            (w.result?.segments && w.result.segments.length > 0) ||
            (w.preEditedText && w.preEditedText.trim().length > 0)
        )
      )
      .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

    const latestWorkspace = nonEmptyWorkspaces[0] || null;
    if (latestWorkspace?.novelId && latestWorkspace.novelId !== 'default' && !novelMap.has(latestWorkspace.novelId)) {
      novelMap.set(latestWorkspace.novelId, {
        id: latestWorkspace.novelId,
        name: latestWorkspace.chapterName
          ? `Truyện (${latestWorkspace.chapterName.slice(0, 28)})`
          : `Truyện khôi phục (${latestWorkspace.novelId.slice(-4)})`,
      });
    }

    return {
      novels: Array.from(novelMap.values()),
      chapters: Array.from(chapterMap.values()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0)),
      customTerms: Array.from(termMap.values()),
      characters: Array.from(charMap.values()),
      relationships: Array.from(relMap.values()),
      shortcuts: Array.from(shortcutMap.values()),
      latestWorkspace,
    };
  } catch (error) {
    handleQuotaExhausted(error);
    throw error;
  }
};



