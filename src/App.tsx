
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { AppStatus, TranslationSession, HistoryItem, TranslationResponse, Chapter, TranslationSegment, Character, Relationship, CustomTerm, Novel } from './types';
import { exportToExcel } from './services/excelService';
import { getNovels, createNovel, deleteNovel, getAllUserChaptersFromCloud, bulkSaveChaptersToCloud, deleteChapterFromCloud, clearNovelChaptersFromCloud, syncFirestoreData, saveUserLiveWorkspaceToCloud, getUserLiveWorkspaceFromCloud, isCloudQuotaExhausted, RecoveredCloudData } from './services/firestoreService';
import { SelectedLocalRestoreData } from './services/localExtractService';
import { auth } from './services/firebase';
import { onAuthStateChanged, User } from 'firebase/auth';
import { vietphraseEngine } from './services/vietphraseService';
import { extractBracketsOnly } from './services/bracketUtils';
import { db } from './services/db'; // Import db service
import { TranslationOutput } from './components/TranslationOutput';
import { DictionarySidebar } from './components/DictionarySidebar';
import { WorldInfoPanel } from './components/WorldInfoPanel';
import { HistoryModal } from './components/HistoryModal'; 
import { ChapterArchiveModal } from './components/ChapterArchiveModal';
import { ShortcutModal } from './components/ShortcutModal';
import { AuthPanel } from './components/AuthPanel';
import { NovelSelector } from './components/NovelSelector';
import { FontSelectorModal } from './components/FontSelectorModal';
import { initFont } from './services/fontService';
import { BookOpen, Loader2, Eraser, Quote, Layout, History, AlertTriangle, Layers, FolderOpen, Keyboard, BookA, Users, X, Scissors, CheckSquare, Square, Type, ExternalLink, FileText, Cloud, Check, Star, ChevronDown, CheckCircle2, RefreshCw } from 'lucide-react';
import { checkAndApplyShortcut, getStoredShortcuts, saveStoredShortcuts, isShortcutsEnabled, syncShortcutsFromCloud } from './services/shortcutService';
import { handleSmartQuotesKeyDown, convertStraightToSmartQuotes } from './services/quoteUtils';
import { getScopedStorageItem, setScopedStorageItem, recoverAllCachedNovels } from './services/storageNamespace';
import { normalizeVietnameseText } from './services/vietnameseUtils';

const EXAMPLE_TEXT = "路遥知马力，日久见人心。";

// --- ERROR BOUNDARY COMPONENT ---
class ErrorBoundary extends React.Component<{children: React.ReactNode}, {hasError: boolean, error: any}> {
  state: any;
  props: any;
  constructor(props: any) {
    super(props);
    this.state = { hasError: false, error: null };
  }
  static getDerivedStateFromError(error: any) {
    return { hasError: true, error };
  }
  componentDidCatch(error: any, errorInfo: any) {
    console.error("ErrorBoundary caught error:", error, errorInfo);
  }
  render() {
    if (this.state.hasError) {
       return (
         <div className="h-screen flex flex-col items-center justify-center bg-[#F5E6D3] text-[#3E2723] p-8 text-center font-sans">
            <div className="bg-red-100 p-4 rounded-full mb-4">
                <AlertTriangle size={48} className="text-red-600" />
            </div>
            <h1 className="text-2xl font-bold mb-2">Rất tiếc, đã xảy ra lỗi!</h1>
            <p className="mb-6 opacity-80 max-w-md">Ứng dụng gặp sự cố bất ngờ. Vui lòng tải lại trang hoặc kiểm tra lại kết nối.</p>
            
            <div className="bg-white p-4 rounded-lg shadow-sm border border-red-200 text-left overflow-auto max-w-lg w-full max-h-60 mb-6 relative">
                <div className="absolute top-2 right-2 text-[10px] text-red-400 font-bold uppercase tracking-wider">Chi tiết lỗi</div>
                <code className="text-xs text-red-800 font-mono whitespace-pre-wrap block pt-4">{this.state.error?.toString()}</code>
            </div>

            <button 
                onClick={() => window.location.reload()} 
                className="bg-[#3E2723] text-white px-6 py-2.5 rounded-lg hover:bg-[#4E342E] font-bold shadow-lg transition-all active:scale-95"
            >
               Tải lại ứng dụng
            </button>
         </div>
       )
    }
    return this.props.children;
  }
}

// Hàm căn lề bản dịch (giữ nguyên 100% từng dòng/đoạn người dùng đã nhập)
const alignTranslation = (rawLines: string[], translation: string): string[] => {
    if (!translation || !translation.trim()) return new Array(rawLines.length).fill("");
    
    // Tách các dòng của bản dịch theo dấu xuống hàng chuẩn
    const tRawLines = translation.split(/\r?\n/).map(l => l.replace(/\r$/, ''));
    const result = new Array(rawLines.length).fill("");
    
    // NẾU BẢN DỊCH ĐÃ CÓ PHÂN DÒNG (người dùng đã xuống dòng / có sẵn cấu trúc đoạn):
    // Giữ nguyên 100% dòng nào vào đúng dòng đó theo đúng vị trí người dùng đã nhập, KHÔNG CẮT/XÉ CÂU
    if (tRawLines.length > 1 || rawLines.length <= 1) {
        for (let i = 0; i < rawLines.length; i++) {
            if (i < tRawLines.length) {
                result[i] = tRawLines[i];
            }
        }
        // Nếu số dòng dịch nhiều hơn số dòng raw, gom các dòng thừa vào dòng cuối cùng
        if (tRawLines.length > rawLines.length && rawLines.length > 0) {
            const extra = tRawLines.slice(rawLines.length - 1).filter(l => l.trim() !== "");
            result[rawLines.length - 1] = extra.join("\n");
        }
        return result;
    }
    
    // TRƯỜNG HỢP DUY NHẤT CẦN TÁCH CÂU: Bản dịch chỉ là 1 khối duy nhất (1 dòng) trong khi raw có nhiều dòng
    const singleBlock = tRawLines[0] || translation;
    const validRLines = rawLines.map((l, i) => ({ text: l.trim(), index: i })).filter(l => l.text);
    if (validRLines.length === 0) return result;
    
    // Tách câu an toàn không xé dấu ngoặc kép
    const regex = /[^.!?。！？…;；\n]+(?:[.!?。！？…;；]+["'”’』」）\)\>\]]*|(?=\n|$))/g;
    const matches = singleBlock.match(regex) || [singleBlock];
    const cleanUnits: string[] = [];
    let buffer = "";
    for (const part of matches) {
        const p = part.trim();
        if (!p) continue;
        if (!buffer) {
            buffer = p;
        } else {
            const openQuotes = (buffer.match(/["“「『]/g) || []).length;
            const closeQuotes = (buffer.match(/["”」』]/g) || []).length;
            if (openQuotes > closeQuotes) {
                buffer += " " + p;
            } else {
                cleanUnits.push(buffer);
                buffer = p;
            }
        }
    }
    if (buffer) cleanUnits.push(buffer);
    
    // Phân bổ 1-1 cho các dòng
    validRLines.forEach((rLine, i) => {
        if (i < cleanUnits.length) {
            result[rLine.index] = cleanUnits[i];
        }
    });
    if (cleanUnits.length > validRLines.length && validRLines.length > 0) {
        const lastValid = validRLines[validRLines.length - 1];
        result[lastValid.index] = cleanUnits.slice(validRLines.length - 1).join(" ");
    }
    return result;
};

const sanitizeResult = (result: TranslationResponse | null): TranslationResponse | null => {
    if (!result) return null;
    try {
        return {
            ...result,
            segments: (result.segments || []).map(s => ({
                source: (s.source || "").trim(),
                natural: normalizeVietnameseText((s.natural || "").trim().replace(/\n+$/, "")),
                quick: normalizeVietnameseText((s.quick || "").trim().replace(/\n+$/, "")),
                deepl: normalizeVietnameseText((s.deepl || "").trim().replace(/\n+$/, ""))
            })),
            naturalTranslation: normalizeVietnameseText((result.naturalTranslation || "").trim().replace(/\n+$/, "")),
            quickTrans: normalizeVietnameseText((result.quickTrans || "").trim().replace(/\n+$/, "")),
            deeplTranslation: normalizeVietnameseText((result.deeplTranslation || "").trim().replace(/\n+$/, "")),
            vocabulary: result.vocabulary || []
        };
    } catch (e) {
        console.warn("Sanitize failed, keeping original", e);
        return result;
    }
};

/**
 * Tu dong khoi phuc lai danh sach segments doi chieu neu bi rong
 * do loi cat bo bo nho (QuotaExceededError) hoac phien bi luoc bot truoc do.
 * CHỈ khôi phục khi đã có bản dịch thực sự (naturalTranslation không rỗng).
 * Tuyệt đối không tự động tạo segments khi người dùng mới chỉ dán raw hoặc chưa bấm phân tích.
 */
const reconstructSegmentsIfEmpty = (sessionData: TranslationSession): TranslationSession => {
    const result = sessionData.result;
    if (!result) return sessionData;

    if (!result.segments || result.segments.length === 0) {
        const rawText = sessionData.inputText || '';
        const natText = result.naturalTranslation || '';
        const deeplText = sessionData.deeplText || result.deeplTranslation || '';

        // Khôi phục khi có rawText hoặc có naturalTranslation
        if (rawText.trim().length > 0 || natText.trim().length > 0) {
            const rawLines = rawText ? rawText.split('\n') : [];
            const natLines = natText ? natText.split('\n') : [];
            const dpLines = deeplText ? deeplText.split('\n') : [];

            const lineCount = Math.max(rawLines.length, natLines.length);
            if (lineCount > 0) {
                const reconstructedSegments: TranslationSegment[] = [];
                for (let i = 0; i < lineCount; i++) {
                    const src = rawLines[i] ?? '';
                    const nat = natLines[i] !== undefined ? natLines[i] : extractBracketsOnly(src);
                    const dp = dpLines[i] ?? '';
                    const qk = src ? vietphraseEngine.translate(src) : '';
                    reconstructedSegments.push({
                        source: src,
                        natural: nat,
                        quick: qk,
                        deepl: dp
                    });
                }
                return {
                    ...sessionData,
                    result: {
                        ...result,
                        segments: reconstructedSegments,
                        naturalTranslation: reconstructedSegments.map(s => s.natural).join('\n'),
                        quickTrans: reconstructedSegments.map(s => s.quick).join('\n')
                    }
                };
            }
        }
    }
    return sessionData;
};

// Thuật toán giải quyết xung đột thông minh giữa Bản Cục Bộ (IndexedDB) và Bản Đám Mây (Firestore)
// QUY TẮC BẢO VỆ DỮ LIỆU: Không bao giờ để bản Cloud ít đoạn hơn hoặc cũ hơn ghi đè làm mất đoạn cuối chương hay tên chương!
const resolveChapterConflict = (localChap?: Chapter, cloudChap?: Chapter): { selected: Chapter; shouldSyncToCloud: boolean } => {
  if (!localChap && cloudChap) return { selected: cloudChap, shouldSyncToCloud: false };
  if (localChap && !cloudChap) return { selected: localChap, shouldSyncToCloud: true };
  if (!localChap && !cloudChap) throw new Error("Empty chapters comparison");

  const l = localChap!;
  const c = cloudChap!;

  const lSegs = l.result?.segments?.length || 0;
  const cSegs = c.result?.segments?.length || 0;
  const lTime = l.timestamp || 0;
  const cTime = c.timestamp || 0;

  // 1. Nếu bản Local có nhiều đoạn hơn Cloud: Chắc chắn Cloud bị thiếu đoạn cuối -> Ưu tiên 100% Local!
  if (lSegs > cSegs) {
    return { selected: l, shouldSyncToCloud: true };
  }
  // 2. Nếu bản Cloud có nhiều đoạn hơn Local hẳn: Lấy Cloud
  if (cSegs > lSegs) {
    return { selected: c, shouldSyncToCloud: false };
  }
  // 3. Nếu số đoạn bằng nhau:
  // Nếu Local có timestamp mới hơn hoặc bằng Cloud (ví dụ vừa đổi tên hoặc vừa gõ): Ưu tiên 100% Local!
  if (lTime >= cTime) {
    return { selected: l, shouldSyncToCloud: lTime > cTime };
  } else {
    // Nếu Cloud có timestamp mới hơn nhưng tên ở Local khác tên ở Cloud:
    // Nếu Local đã được đặt tên rõ ràng, giữ lại tên mới của Local
    if (l.name && l.name !== c.name) {
      if (c.name.startsWith('Chương ') || c.name.startsWith('chap_') || lTime >= cTime - 86400000) {
        return { selected: { ...c, name: l.name, timestamp: Math.max(lTime, cTime) }, shouldSyncToCloud: true };
      }
    }
    return { selected: c, shouldSyncToCloud: false };
  }
};

const createNewSession = (): TranslationSession => ({
  id: 'session_main',
  name: `Edit`,
  inputText: '',
  deeplText: '',
  preEditedText: '',
  status: AppStatus.IDLE,
  result: null,
  error: null,
  modelId: 'auto',
  currentHistoryId: undefined,
  customTerms: [],
  sheetUrl: '',
  characters: [],    
  relationships: [], 
  notes: '',
  completedSegments: []
});

function AppContent() {
  // --- STATE ---
  const [mode, setMode] = useState<'edit' | 'beta'>(() => {
    try {
      const savedMode = getScopedStorageItem('app_mode');
      return (savedMode === 'beta' || savedMode === 'edit') ? savedMode : 'edit';
    } catch (e) {
      return 'edit';
    }
  });

  useEffect(() => {
    try {
      setScopedStorageItem('app_mode', mode);
    } catch (e) {}
  }, [mode]);

  const [session, setSession] = useState<TranslationSession>(() => {
    try {
      const savedSingle = getScopedStorageItem('app_single_session', 'chiVietSingleSession');
      if (savedSingle) {
          const parsed = JSON.parse(savedSingle);
          // Force customTerms empty to load from DB instead (avoid localStorage quota)
          const baseSession = { ...createNewSession(), ...parsed, customTerms: [], result: sanitizeResult(parsed.result) };
          return reconstructSegmentsIfEmpty(baseSession);
      }
      return createNewSession();
    } catch (e) {
      console.error("Failed to load session", e);
      return createNewSession();
    }
  });

  const [history, setHistory] = useState<HistoryItem[]>(() => {
    try {
      const saved = getScopedStorageItem('app_history', 'chiVietHistory');
      const parsed = saved ? JSON.parse(saved) : [];
      return Array.isArray(parsed) ? parsed : [];
    } catch (e) {
      return [];
    }
  });
  const [showHistory, setShowHistory] = useState(false);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [showChapters, setShowChapters] = useState(false);
  const [showShortcuts, setShowShortcuts] = useState(false);
  const [showMobileSidebar, setShowMobileSidebar] = useState(false);
  const [showMobileWorldInfo, setShowMobileWorldInfo] = useState(false);
  const [showFontModal, setShowFontModal] = useState(false);
  const [shortcuts, setShortcuts] = useState(() => getStoredShortcuts(session.currentNovelId));
  const [shortcutsEnabled, setShortcutsEnabled] = useState(() => isShortcutsEnabled());
  const [vpLoaded, setVpLoaded] = useState(false);

  useEffect(() => {
    initFont();
  }, []);

  useEffect(() => {
    setShortcuts(getStoredShortcuts(session.currentNovelId));
  }, [session.currentNovelId]);

  useEffect(() => {
    const handleUpdate = (e: Event) => {
      setShortcuts(getStoredShortcuts(session.currentNovelId));
      setShortcutsEnabled(isShortcutsEnabled());
      const detail = (e as CustomEvent)?.detail;
      if (detail?.isLocalEdit) {
        markLocalWorkspaceDirty();
      }
    };
    window.addEventListener('shortcuts_updated', handleUpdate);
    window.addEventListener('shortcuts_toggle', handleUpdate);
    return () => {
      window.removeEventListener('shortcuts_updated', handleUpdate);
      window.removeEventListener('shortcuts_toggle', handleUpdate);
    };
  }, [session.currentNovelId]);
  
  // Undo/Redo/Focus states
  interface HistorySnapshot {
    segments: TranslationSegment[];
    completedSegments?: number[];
    inputText: string;
    deeplText: string;
  }

  const [undoStack, setUndoStack] = useState<HistorySnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<HistorySnapshot[]>([]);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [autoCleanBlankLines, setAutoCleanBlankLines] = useState(true);
  const [currentUser, setCurrentUser] = useState<User | null>(auth.currentUser);
  const [lastRemoteSyncTime, setLastRemoteSyncTime] = useState<number>(0);
  const lastLocalEditTimeRef = useRef<number>(0);
  const localWorkspaceUpdatedAtRef = useRef<number>(
    Number(getScopedStorageItem('local_workspace_updated_at') || '0')
  );

  const loadIdSetFromStorage = (key: string): Set<string> => {
    try {
      const raw = getScopedStorageItem(key);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) return new Set(parsed.map(String));
      }
    } catch (_) {}
    return new Set<string>();
  };

  const deletedChapterIdsRef = useRef<Set<string>>(loadIdSetFromStorage('deleted_chapter_ids'));
  const deletedNovelIdsRef = useRef<Set<string>>(loadIdSetFromStorage('deleted_novel_ids'));

  const persistDeletedIds = () => {
    try {
      setScopedStorageItem('deleted_chapter_ids', JSON.stringify(Array.from(deletedChapterIdsRef.current)));
      setScopedStorageItem('deleted_novel_ids', JSON.stringify(Array.from(deletedNovelIdsRef.current)));
    } catch (_) {}
  };

  const [hasUnsyncedChanges, setHasUnsyncedChanges] = useState<boolean>(() => {
    try {
      return getScopedStorageItem('has_unsynced_changes') === 'true';
    } catch (_) {
      return false;
    }
  });
  const hasUnsyncedChangesRef = useRef<boolean>(hasUnsyncedChanges);
  useEffect(() => {
    hasUnsyncedChangesRef.current = hasUnsyncedChanges;
  }, [hasUnsyncedChanges]);

  const [isSyncingToCloud, setIsSyncingToCloud] = useState<boolean>(false);
  const [showLeaveSyncModal, setShowLeaveSyncModal] = useState<boolean>(false);
  const [syncToastMessage, setSyncToastMessage] = useState<{ type: 'success' | 'error' | 'info'; text: string } | null>(null);

  const markLocalWorkspaceDirty = (timestamp?: number) => {
    const ts = timestamp || Date.now();
    lastLocalEditTimeRef.current = ts;
    localWorkspaceUpdatedAtRef.current = ts;
    hasUnsyncedChangesRef.current = true;
    try {
      setScopedStorageItem('local_workspace_updated_at', String(ts));
      setScopedStorageItem('has_unsynced_changes', 'true');
    } catch (_) {}
    setHasUnsyncedChanges(true);
  };

  const clearUnsyncedChanges = () => {
    hasUnsyncedChangesRef.current = false;
    try {
      setScopedStorageItem('has_unsynced_changes', 'false');
    } catch (_) {}
    setHasUnsyncedChanges(false);
    setShowLeaveSyncModal(false);
  };

  // Nhắc nhở người dùng nhấn nút đồng bộ khi định đóng tab / đóng app / tắt máy
  useEffect(() => {
    const warnMsg = 'Bạn có thay đổi chưa được đồng bộ với Firestore! Hãy nhấn nút "Đồng bộ Firestore" trước khi đóng tab, thoát app hoặc tắt máy.';

    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (hasUnsyncedChangesRef.current) {
        setShowLeaveSyncModal(true);
        e.preventDefault();
        e.returnValue = warnMsg;
        return warnMsg;
      }
    };

    const handleVisibilityOrPageHide = () => {
      if (document.visibilityState === 'hidden') {
        try {
          setScopedStorageItem('has_unsynced_changes', hasUnsyncedChangesRef.current ? 'true' : 'false');
        } catch (_) {}
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('pagehide', handleVisibilityOrPageHide);
    document.addEventListener('visibilitychange', handleVisibilityOrPageHide);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('pagehide', handleVisibilityOrPageHide);
      document.removeEventListener('visibilitychange', handleVisibilityOrPageHide);
    };
  }, []);
  const [novels, setNovels] = useState<Novel[]>(() => {
    try {
      const uid = auth.currentUser?.uid;
      const recovered = recoverAllCachedNovels(uid);
      if (Array.isArray(recovered) && recovered.length > 0) return recovered;
      return [{ id: 'default', name: 'Truyện mặc định' }];
    } catch (_) {
      return [{ id: 'default', name: 'Truyện mặc định' }];
    }
  });

  // Tự động khôi phục dữ liệu IndexedDB của đúng tài khoản ngay khi ứng dụng khởi chạy
  useEffect(() => {
    let isMounted = true;
    const uid = auth.currentUser?.uid;
    db.autoRecoverNovels(uid).then((recoveredList) => {
      if (isMounted && Array.isArray(recoveredList) && recoveredList.length > 0) {
        setNovels(recoveredList);
        if (!session.currentNovelId) {
          setSession(prev => ({ ...prev, currentNovelId: recoveredList[0].id }));
        }
      }
    }).catch(console.error);

    return () => { isMounted = false; };
  }, []);

  // Chỉ nạp dữ liệu CỤC BỘ theo đúng tài khoản khi đăng nhập/khởi chạy (KHÔNG tự động gọi Firestore để tiết kiệm quota)
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setCurrentUser(user);
      if (user) {
        try {
          const userLocal = await db.autoRecoverNovels(user.uid);
          const filteredLocal = (userLocal || []).filter((n) => n && n.id && n.name && !deletedNovelIdsRef.current.has(n.id));
          if (filteredLocal.length > 0) {
            setNovels(filteredLocal);
            const nonDefault = filteredLocal.find((n) => n.id !== 'default');
            const targetId =
              session.currentNovelId &&
              session.currentNovelId !== 'default' &&
              filteredLocal.some((n) => n.id === session.currentNovelId)
                ? session.currentNovelId
                : nonDefault
                ? nonDefault.id
                : filteredLocal[0].id;
            if (targetId && targetId !== session.currentNovelId) {
              setSession((prev) => ({ ...prev, currentNovelId: targetId }));
              db.saveCurrentNovelId(targetId).catch(console.error);
            }
          }
        } catch (e) {
          console.warn("Lỗi nạp dữ liệu cục bộ cho tài khoản:", e);
        }
      } else {
        try {
          const guestNovels = await db.autoRecoverNovels();
          const filteredGuest = (guestNovels || []).filter((n) => n && n.id && n.name && !deletedNovelIdsRef.current.has(n.id));
          if (filteredGuest.length > 0) {
            setNovels(filteredGuest);
          }
        } catch (_) {}
      }
    });
    return () => unsub();
  }, []);

  // Handler tạo truyện mới (chỉ lưu cục bộ, đồng bộ lên Firestore khi người dùng nhấn nút Đồng bộ)
  const handleCreateNovel = async (name: string) => {
    const trimmed = name.trim();
    if (!trimmed) return;
    const newId = `novel_${Date.now()}`;
    const newNovel: Novel = { id: newId, name: trimmed };
    const filteredOld = novels.filter(n => !(n.id === 'default' && n.name === 'Truyện mặc định' && novels.length === 1));
    const updatedNovels = [...filteredOld, newNovel];

    deletedNovelIdsRef.current.delete(newId);
    persistDeletedIds();
    markLocalWorkspaceDirty();
    setNovels(updatedNovels);
    setSession(prev => ({
      ...prev,
      currentNovelId: newId,
      currentChapterId: undefined,
      result: null,
      inputText: '',
      deeplText: '',
      preEditedText: ''
    }));

    const uid = auth.currentUser?.uid;
    await db.saveNovels(updatedNovels, uid);
    await db.saveNovels(updatedNovels);
    await db.saveCurrentNovelId(newId);
    if (uid) {
      setScopedStorageItem(`cached_novels_${uid}`, JSON.stringify(updatedNovels));
    }
    setScopedStorageItem('cached_novels_list', JSON.stringify(updatedNovels));
  };

  // Handler đổi tên truyện (chỉ lưu cục bộ, đồng bộ lên Firestore khi người dùng nhấn nút Đồng bộ)
  const handleRenameNovel = async (id: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;
    markLocalWorkspaceDirty();
    const updated = novels.map(n => n.id === id ? { ...n, name: trimmed } : n);
    setNovels(updated);
    const uid = auth.currentUser?.uid;
    await db.saveNovels(updated, uid);
    await db.saveNovels(updated);
    if (uid) {
      setScopedStorageItem(`cached_novels_${uid}`, JSON.stringify(updated));
    }
    setScopedStorageItem('cached_novels_list', JSON.stringify(updated));
  };

  // Handler xóa truyện triệt để trên máy (xóa danh sách + xóa toàn bộ chương trong IndexedDB để không tự phục hồi)
  const handleDeleteNovel = async (id: string) => {
    markLocalWorkspaceDirty();

    if (id && id !== 'default') {
      deletedNovelIdsRef.current.add(id);
    }

    // Xóa toàn bộ chương của truyện này khỏi IndexedDB và đánh dấu để đồng bộ xóa lên Firestore khi bấm Đồng bộ
    try {
      const allDbChapters = await db.getAllChapters();
      const chapsOfNovel = (allDbChapters || []).filter(
        c => c.novelId === id || (id === 'default' && !c.novelId)
      );
      for (const ch of chapsOfNovel) {
        deletedChapterIdsRef.current.add(ch.id);
        await db.deleteChapter(ch.id);
      }
    } catch (e) {
      console.warn("Lỗi xóa chương của truyện trong IndexedDB:", e);
    }
    persistDeletedIds();

    const remaining = novels.filter(n => n.id !== id);
    const finalNovels: Novel[] = remaining.length > 0 ? remaining : [{ id: 'default', name: 'Truyện mặc định' }];
    const nextCurrentId = session.currentNovelId === id ? finalNovels[0].id : (session.currentNovelId || finalNovels[0].id);

    setNovels(finalNovels);
    const uid = auth.currentUser?.uid;
    await db.saveNovels(finalNovels, uid);
    await db.saveNovels(finalNovels);
    await db.saveCurrentNovelId(nextCurrentId);
    if (uid) {
      setScopedStorageItem(`cached_novels_${uid}`, JSON.stringify(finalNovels));
    }
    setScopedStorageItem('cached_novels_list', JSON.stringify(finalNovels));

    // Dọn các dữ liệu phụ thuộc truyện vừa xóa trong bộ nhớ cục bộ
    const remainingTerms = (session.customTerms || []).filter(t => t.novelId !== id && (id !== 'default' || t.novelId));
    const remainingChars = (session.characters || []).filter(c => c.novelId !== id && (id !== 'default' || c.novelId));
    const remainingRels = (session.relationships || []).filter(r => r.novelId !== id && (id !== 'default' || r.novelId));
    await db.bulkSaveCustomTerms(remainingTerms).catch(console.warn);
    await db.saveCharacters(remainingChars).catch(console.warn);
    saveStoredShortcuts([], id, true);

    setChapters(prev => prev.filter(c => c.novelId !== id && (id !== 'default' || c.novelId)));

    if (session.currentNovelId === id) {
      setSession(prev => ({
        ...prev,
        currentNovelId: nextCurrentId,
        currentChapterId: undefined,
        currentHistoryId: undefined,
        result: null,
        inputText: '',
        deeplText: '',
        preEditedText: '',
        completedSegments: [],
        status: AppStatus.IDLE,
        customTerms: remainingTerms,
        characters: remainingChars,
        relationships: remainingRels
      }));
    } else {
      setSession(prev => ({
        ...prev,
        customTerms: remainingTerms,
        characters: remainingChars,
        relationships: remainingRels
      }));
    }
  };



  // --- REFS ---
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // --- COMPUTED ---
  const segmentCount = session.inputText.trim() ? session.inputText.split(/\n/).length : 0;

  const currentNovelChapters = useMemo(() => {
    return chapters.filter(c => c.novelId === session.currentNovelId);
  }, [chapters, session.currentNovelId]);

  const currentNovelCharacters = useMemo(() => {
    if (!session.currentNovelId) return session.characters || [];
    return (session.characters || []).filter(c => !c.novelId || c.novelId === session.currentNovelId || c.novelId === 'default');
  }, [session.characters, session.currentNovelId]);

  const currentNovelRelationships = useMemo(() => {
    if (!session.currentNovelId) return session.relationships || [];
    return (session.relationships || []).filter(r => !r.novelId || r.novelId === session.currentNovelId || r.novelId === 'default');
  }, [session.relationships, session.currentNovelId]);

  const currentNovelTerms = useMemo(() => {
    if (!session.currentNovelId) return session.customTerms || [];
    return (session.customTerms || []).filter(t => !t.novelId || t.novelId === session.currentNovelId || t.novelId === 'default');
  }, [session.customTerms, session.currentNovelId]);

  // Migration: Tự động gán novelId cho từ vựng / nhân vật / quan hệ cũ nếu chưa có novelId (chỉ gắn vào truyện ban đầu)
  const migratedRef = useRef(false);
  useEffect(() => {
    if (migratedRef.current || !session.currentNovelId) return;
    const hasLegacyChars = (session.characters || []).some(c => !c.novelId);
    const hasLegacyRels = (session.relationships || []).some(r => !r.novelId);
    const hasLegacyTerms = (session.customTerms || []).some(t => !t.novelId);
    if (hasLegacyChars || hasLegacyRels || hasLegacyTerms) {
      migratedRef.current = true;
      setSession(prev => {
        const curId = prev.currentNovelId;
        if (!curId) return prev;
        const updatedChars = (prev.characters || []).map(c => c.novelId ? c : { ...c, novelId: curId });
        const updatedRels = (prev.relationships || []).map(r => r.novelId ? r : { ...r, novelId: curId });
        const updatedTerms = (prev.customTerms || []).map(t => t.novelId ? t : { ...t, novelId: curId });
        db.saveCharacters(updatedChars).catch(console.error);
        db.bulkSaveCustomTerms(updatedTerms).catch(console.error);
        return {
          ...prev,
          characters: updatedChars,
          relationships: updatedRels,
          customTerms: updatedTerms
        };
      });
    } else {
      migratedRef.current = true;
    }
  }, [session.currentNovelId]);

  // --- EFFECTS ---
  // Init Vietphrase Engine from DB & Load Custom Terms
useEffect(() => {
  (async () => {
    await vietphraseEngine.init();
    console.log("Vietphrase Engine Initialized");
    setVpLoaded(true);
  })();
     
     db.getAllCustomTerms().then(terms => {
         if (terms && terms.length > 0) {
             setSession(prev => ({ ...prev, customTerms: terms }));
         }
     });

     db.getCharacters().then(chars => {
         if (chars && chars.length > 0) {
             setSession(prev => ({ ...prev, characters: chars }));
         }
     });

     db.getAllChapters().then(savedChapters => {
         if (savedChapters) {
             const normalized = savedChapters.map(c => ({
                 ...c,
                 name: normalizeVietnameseText(c.name),
                 result: c.result ? (sanitizeResult(c.result) as TranslationResponse) : c.result
             }));
             setChapters(normalized);
         }
     });

     db.getCurrentNovelId().then(savedNovelId => {
         if (savedNovelId) {
             setSession(prev => prev.currentNovelId ? prev : ({ ...prev, currentNovelId: savedNovelId }));
         }
     });

     db.getActiveSession().then(savedDbSession => {
         if (savedDbSession && savedDbSession.result) {
             setSession(prev => {
                 if (!prev.result?.segments || prev.result.segments.length === 0) {
                     const restored = reconstructSegmentsIfEmpty({
                         ...prev,
                         ...savedDbSession,
                         result: sanitizeResult(savedDbSession.result)
                     });
                     return restored;
                 }
                 return prev;
             });
         }
     }).catch(console.warn);
  }, []);

  // Dong bo Custom Map vao Vietphrase Engine de chac chan ghi de len ban dich Vietphrase o moi noi
  useEffect(() => {
    const map = new Map<string, string>();
    // 1. Nạp toàn bộ kho nhân vật & từ vựng đã lưu trong ứng dụng làm fallback
    (session.characters || []).forEach(c => {
      if (c.chineseName && c.vietName) map.set(c.chineseName.trim(), c.vietName.trim());
    });
    (session.customTerms || []).forEach(t => {
      if (t.term && t.meaning) map.set(t.term.trim(), t.meaning.trim());
    });
    // 2. Ghi đè bởi từ vựng & nhân vật riêng của truyện hiện tại (ưu tiên cao nhất)
    currentNovelCharacters.forEach(c => {
      if (c.chineseName && c.vietName) map.set(c.chineseName.trim(), c.vietName.trim());
    });
    currentNovelTerms.forEach(t => {
      if (t.term && t.meaning) map.set(t.term.trim(), t.meaning.trim());
    });
    vietphraseEngine.setGlobalCustomMap(map);
  }, [session.characters, session.customTerms, currentNovelCharacters, currentNovelTerms]);

  // Đã tắt hoàn toàn lắng nghe thời gian thực / tự động tải Firestore để không tốn quota.
  // Dữ liệu chỉ đồng bộ khi người dùng chủ động nhấn nút "Đồng bộ Firestore".

  // Tu dong khoi phuc lai cac dong doi chieu neu dang o tinh trang rong segments (chi khi da tung dich xong va co ban dich)
  useEffect(() => {
    if (session.status === AppStatus.SUCCESS && session.result && (!session.result.segments || session.result.segments.length === 0)) {
      const nat = session.result.naturalTranslation || '';
      if (nat.trim()) {
        const fixed = reconstructSegmentsIfEmpty(session);
        if (fixed.result?.segments && fixed.result.segments.length > 0) {
          setSession(fixed);
        }
      }
    }
  }, [session.status, session.result]);

  // Luu phien lam viec hien tai an toan: Luon luu day du vao IndexedDB (khong gioi han dung luong)
  // va luu du phong vao localStorage (neu localStorage qua tai thi IndexedDB van bao ve 100% du lieu)
  useEffect(() => {
    const sessionToSave = { ...session, customTerms: [] };
    // 1. Luon luu day du 100% vao IndexedDB
    db.saveActiveSession(sessionToSave).catch(console.error);

    // 2. Luu vao localStorage
    try {
        setScopedStorageItem('app_single_session', JSON.stringify(sessionToSave));
    } catch (e) {
        console.warn("localStorage quota exceeded, session safely preserved in IndexedDB");
    }
  }, [session]);

  // Fix lỗi QuotaExceededError khi lưu History
  useEffect(() => {
    try {
        setScopedStorageItem('app_history', JSON.stringify(history));
    } catch (e) {
        // Nếu bộ nhớ đầy, nén bớt history bằng cách lược bỏ segments của các bản ghi cũ
        try {
            const leanHistory = history.slice(0, 15).map((item, idx) => {
                if (idx >= 2 && item.result) {
                    return {
                        ...item,
                        result: {
                            ...item.result,
                            segments: []
                        }
                    };
                }
                return item;
            });
            setScopedStorageItem('app_history', JSON.stringify(leanHistory));
        } catch (innerE) {
            try {
                // Nếu vẫn đầy, chỉ giữ 5 bản ghi và bỏ hết segments
                const superLeanHistory = history.slice(0, 5).map(item => ({
                    ...item,
                    result: item.result ? {
                        ...item.result,
                        segments: []
                    } : null
                }));
                setScopedStorageItem('app_history', JSON.stringify(superLeanHistory));
            } catch (lastE) {
                console.warn("Storage Quota Exceeded for History");
            }
        }
    }
  }, [history]);

  // Reset undo/redo stacks when loading a new chapter or novel
  useEffect(() => {
    setUndoStack([]);
    setRedoStack([]);
  }, [session.currentHistoryId, session.currentChapterId, session.currentNovelId]);

  // Keyboard shortcuts for Undo (Ctrl+Z) and Redo (Ctrl+Y / Ctrl+Shift+Z)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey) {
        if (e.key === 'z' || e.key === 'Z') {
          if (e.shiftKey) {
            e.preventDefault();
            handleRedo();
          } else {
            e.preventDefault();
            handleUndo();
          }
        } else if (e.key === 'y' || e.key === 'Y') {
          e.preventDefault();
          handleRedo();
        }
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undoStack, redoStack, session.result]);

  // --- ACTIONS ---

  const updateSession = (updates: Partial<TranslationSession>) => {
    markLocalWorkspaceDirty();
    setSession(prev => ({ ...prev, ...updates }));
  };

  // Hàm thủ công ĐỒNG BỘ 2 CHIỀU VỚI FIRESTORE (Trộn thông minh Local <-> Cloud, không ghi đè 1 chiều)
  const handleManualSyncToFirestore = async () => {
    const user = auth.currentUser;
    if (!user) {
      setSyncToastMessage({
        type: 'info',
        text: 'Vui lòng đăng nhập tài khoản (góc phải trên) trước khi đồng bộ 2 chiều với Firestore!'
      });
      setTimeout(() => setSyncToastMessage(null), 4000);
      return;
    }
    if (isSyncingToCloud) return;

    setIsSyncingToCloud(true);
    setSyncToastMessage({ type: 'info', text: 'Đang đồng bộ 2 chiều giữa máy và Firestore...' });

    try {
      // 0. XÓA TRÊN FIRESTORE CÁC TRUYỆN / CHƯƠNG MÀ NGƯỜI DÙNG ĐÃ XÓA CỤC BỘ
      if (!isCloudQuotaExhausted()) {
        for (const delNovelId of Array.from(deletedNovelIdsRef.current)) {
          if (delNovelId && delNovelId !== 'default') {
            await deleteNovel(delNovelId).catch(console.warn);
            await clearNovelChaptersFromCloud(delNovelId).catch(console.warn);
          }
        }
        for (const delChapId of Array.from(deletedChapterIdsRef.current)) {
          if (delChapId) {
            await deleteChapterFromCloud(delChapId).catch(console.warn);
          }
        }
      }

      // 1. ĐỒNG BỘ 2 CHIỀU DANH SÁCH TRUYỆN
      const [cloudNovels, localDbNovels] = await Promise.all([
        getNovels().catch(() => [] as Novel[]),
        db.autoRecoverNovels(user.uid).catch(() => [] as Novel[])
      ]);

      const mergedNovelsMap = new Map<string, Novel>();
      (localDbNovels || []).forEach(n => {
        if (n && n.id && n.name && !deletedNovelIdsRef.current.has(n.id)) mergedNovelsMap.set(n.id, n);
      });
      (cloudNovels || []).forEach(n => {
        if (n && n.id && n.name && !deletedNovelIdsRef.current.has(n.id)) mergedNovelsMap.set(n.id, n);
      });
      // Đặt danh sách hiện tại trên UI sau cùng để bảo toàn việc đổi tên truyện ở máy
      (novels || []).forEach(n => {
        if (n && n.id && n.name && !deletedNovelIdsRef.current.has(n.id)) mergedNovelsMap.set(n.id, n);
      });

      if (mergedNovelsMap.size > 1 && mergedNovelsMap.has('default')) {
        mergedNovelsMap.delete('default');
      }

      const mergedNovels = Array.from(mergedNovelsMap.values());
      if (mergedNovels.length > 0) {
        setNovels(mergedNovels);
        await db.saveNovels(mergedNovels, user.uid);
        await db.saveNovels(mergedNovels);
        setScopedStorageItem(`cached_novels_${user.uid}`, JSON.stringify(mergedNovels));
        setScopedStorageItem('cached_novels_list', JSON.stringify(mergedNovels));

        // Đẩy lên Cloud những bộ truyện mới hoặc vừa đổi tên ở Local
        if (!isCloudQuotaExhausted()) {
          for (const novel of mergedNovels) {
            const cloudMatch = cloudNovels.find(cn => cn.id === novel.id);
            if (novel.id !== 'default' && (!cloudMatch || cloudMatch.name !== novel.name)) {
              await createNovel(novel.id, novel.name).catch(console.warn);
            }
          }
        }
      }

      const activeNovelId =
        session.currentNovelId && session.currentNovelId !== 'default' && mergedNovels.some(n => n.id === session.currentNovelId)
          ? session.currentNovelId
          : (mergedNovels.find(n => n.id !== 'default')?.id || session.currentNovelId || 'default');

      // 2. ĐỒNG BỘ 2 CHIỀU KHO CHƯƠNG CHO TOÀN BỘ TRUYỆN
      const allLocalChaps = await db.getAllChapters();
      const targetNovelIds = Array.from(
        new Set(
          mergedNovels
            .map(n => n.id)
            .concat(activeNovelId && activeNovelId !== 'default' ? [activeNovelId] : [])
            .filter(id => id && id !== 'default' && !deletedNovelIdsRef.current.has(id))
        )
      );

      const allMergedChapters: Chapter[] = [];
      const chapsToSaveDb: Chapter[] = [];
      const chapsToUpload: Chapter[] = [];

      const allCloudChaps = isCloudQuotaExhausted()
        ? []
        : await getAllUserChaptersFromCloud().catch(() => [] as Chapter[]);

      for (const nId of targetNovelIds) {
        const localForNovel = (allLocalChaps || []).filter(c =>
          !deletedChapterIdsRef.current.has(c.id) &&
          !deletedNovelIdsRef.current.has(c.novelId || '') &&
          (c.novelId === nId || (!c.novelId && nId === activeNovelId))
        );
        const cloudForNovel = allCloudChaps.filter(c => c.novelId === nId);

        const localMap = new Map<string, Chapter>();
        localForNovel.forEach(c => localMap.set(c.id, { ...c, novelId: c.novelId || nId }));

        const novelMergedMap = new Map<string, Chapter>();

        (cloudForNovel || []).forEach(cloudCh => {
          if (deletedChapterIdsRef.current.has(cloudCh.id) || deletedNovelIdsRef.current.has(cloudCh.novelId || '')) return;
          const localCh = localMap.get(cloudCh.id);
          const { selected, shouldSyncToCloud } = resolveChapterConflict(localCh, cloudCh);
          const normalizedSelected: Chapter = { ...selected, novelId: nId };
          novelMergedMap.set(cloudCh.id, normalizedSelected);

          if (selected === cloudCh && (!localCh || (cloudCh.timestamp || 0) > (localCh.timestamp || 0) || (cloudCh.result?.segments?.length || 0) > (localCh.result?.segments?.length || 0))) {
            chapsToSaveDb.push(normalizedSelected);
          } else if (shouldSyncToCloud) {
            chapsToUpload.push(normalizedSelected);
          }
        });

        localMap.forEach((localCh, id) => {
          if (!novelMergedMap.has(id)) {
            novelMergedMap.set(id, localCh);
            chapsToUpload.push(localCh);
          }
        });

        novelMergedMap.forEach(c => allMergedChapters.push(c));
      }

      for (const ch of chapsToSaveDb) {
        await db.saveChapter(ch);
      }
      if (chapsToUpload.length > 0 && !isCloudQuotaExhausted()) {
        await bulkSaveChaptersToCloud(chapsToUpload);
      }

      if (allMergedChapters.length > 0 || targetNovelIds.length > 0) {
        setChapters(prev => {
          const otherChaps = prev.filter(c => c.novelId && !targetNovelIds.includes(c.novelId));
          const combined = [...allMergedChapters, ...otherChaps].sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
          return combined;
        });
      }

      // 3. ĐỒNG BỘ 2 CHIỀU TIẾN ĐỘ LÀM DỞ (Live Workspace)
      const cloudWorkspace = isCloudQuotaExhausted()
        ? null
        : await getUserLiveWorkspaceFromCloud().catch(() => null);

      const hasLocalWork = Boolean(
        (session.inputText && session.inputText.trim().length > 0) ||
        (session.result?.segments && session.result.segments.length > 0) ||
        (session.preEditedText && session.preEditedText.trim().length > 0)
      );
      const hasCloudWork = Boolean(
        cloudWorkspace &&
        ((cloudWorkspace.inputText && cloudWorkspace.inputText.trim().length > 0) ||
          (cloudWorkspace.result?.segments && cloudWorkspace.result.segments.length > 0) ||
          (cloudWorkspace.preEditedText && cloudWorkspace.preEditedText.trim().length > 0))
      );

      const localTime = localWorkspaceUpdatedAtRef.current || 0;
      const cloudTime = cloudWorkspace?.updatedAt || 0;

      let effectiveNovelIdForData = activeNovelId;

      if (hasCloudWork && cloudWorkspace && (!hasLocalWork || cloudTime > localTime)) {
        // Cloud mới hơn hoặc Local đang trống -> Kéo về màn hình
        const targetNovel = (cloudWorkspace.novelId && mergedNovels.some(n => n.id === cloudWorkspace.novelId))
          ? cloudWorkspace.novelId
          : activeNovelId;
        effectiveNovelIdForData = targetNovel;

        let restoredResult = cloudWorkspace.result ? sanitizeResult(cloudWorkspace.result) : null;
        if (!restoredResult && cloudWorkspace.segments && cloudWorkspace.segments.length > 0) {
          restoredResult = {
            segments: cloudWorkspace.segments,
            naturalTranslation: cloudWorkspace.segments.map((s: any) => s.natural).join('\n'),
            quickTrans: cloudWorkspace.segments.map((s: any) => s.quick).join('\n'),
            sinoVietnamese: '',
            deeplTranslation: cloudWorkspace.segments.map((s: any) => s.deepl).join('\n'),
            vocabulary: []
          };
        }

        const syncedTs = cloudTime || Date.now();
        localWorkspaceUpdatedAtRef.current = syncedTs;
        setScopedStorageItem('local_workspace_updated_at', String(syncedTs));

        setSession(prev => {
          const updatedSession: TranslationSession = {
            ...prev,
            currentNovelId: targetNovel,
            currentChapterId: cloudWorkspace.chapterId || undefined,
            inputText: cloudWorkspace.inputText || '',
            deeplText: cloudWorkspace.deeplText || '',
            preEditedText: cloudWorkspace.preEditedText || '',
            result: restoredResult,
            status: (cloudWorkspace.status as AppStatus) || (restoredResult ? AppStatus.SUCCESS : AppStatus.IDLE),
            completedSegments: cloudWorkspace.completedSegments || []
          };
          db.saveActiveSession({ ...updatedSession, customTerms: [] }).catch(console.error);
          return updatedSession;
        });
      } else {
        // Local mới hơn hoặc Cloud chưa có -> Đẩy tiến độ Local lên Cloud
        const pushTs = localTime || Date.now();
        localWorkspaceUpdatedAtRef.current = pushTs;
        setScopedStorageItem('local_workspace_updated_at', String(pushTs));
        if (!isCloudQuotaExhausted()) {
          await saveUserLiveWorkspaceToCloud({
            novelId: activeNovelId,
            chapterId: session.currentChapterId,
            inputText: session.inputText || '',
            deeplText: session.deeplText || '',
            preEditedText: session.preEditedText || '',
            result: session.result,
            completedSegments: session.completedSegments || [],
            status: session.status,
            updatedAt: pushTs
          }, true);
        }
      }

      // 4. ĐỒNG BỘ 2 CHIỀU TỪ ĐIỂN, NHÂN VẬT, QUAN HỆ & GÕ TẮT CHO TRUYỆN HIỆN TẠI
      if (effectiveNovelIdForData && effectiveNovelIdForData !== 'default' && !isCloudQuotaExhausted()) {
        // Từ vựng (2 chiều)
        const cloudTerms = await syncFirestoreData<CustomTerm>('vocab', effectiveNovelIdForData, 'GET').catch(() => [] as CustomTerm[]);
        const localNovelTerms = (session.customTerms || []).filter(t => !t.novelId || t.novelId === effectiveNovelIdForData || t.novelId === 'default');
        const otherTerms = (session.customTerms || []).filter(t => t.novelId && t.novelId !== effectiveNovelIdForData && t.novelId !== 'default');
        const termMap = new Map<string, CustomTerm>();
        cloudTerms.forEach(t => termMap.set(t.id, { ...t, novelId: effectiveNovelIdForData }));
        localNovelTerms.forEach(t => termMap.set(t.id, { ...t, novelId: effectiveNovelIdForData }));
        const mergedNovelTerms = Array.from(termMap.values());
        if (mergedNovelTerms.length > 0) {
          await syncFirestoreData('vocab', effectiveNovelIdForData, 'POST', mergedNovelTerms).catch(console.warn);
        }

        // Nhân vật (2 chiều)
        const cloudChars = await syncFirestoreData<Character>('char', effectiveNovelIdForData, 'GET').catch(() => [] as Character[]);
        const localNovelChars = (session.characters || []).filter(c => !c.novelId || c.novelId === effectiveNovelIdForData || c.novelId === 'default');
        const otherChars = (session.characters || []).filter(c => c.novelId && c.novelId !== effectiveNovelIdForData && c.novelId !== 'default');
        const charMap = new Map<string, Character>();
        cloudChars.forEach(c => charMap.set(c.id, { ...c, novelId: effectiveNovelIdForData }));
        localNovelChars.forEach(c => charMap.set(c.id, { ...c, novelId: effectiveNovelIdForData }));
        const mergedNovelChars = Array.from(charMap.values());
        if (mergedNovelChars.length > 0) {
          await syncFirestoreData('char', effectiveNovelIdForData, 'POST', mergedNovelChars).catch(console.warn);
        }

        // Quan hệ (2 chiều)
        const cloudRels = await syncFirestoreData<Relationship>('rel', effectiveNovelIdForData, 'GET').catch(() => [] as Relationship[]);
        const localNovelRels = (session.relationships || []).filter(r => !r.novelId || r.novelId === effectiveNovelIdForData || r.novelId === 'default');
        const otherRels = (session.relationships || []).filter(r => r.novelId && r.novelId !== effectiveNovelIdForData && r.novelId !== 'default');
        const relMap = new Map<string, Relationship>();
        cloudRels.forEach(r => relMap.set(r.id, { ...r, novelId: effectiveNovelIdForData }));
        localNovelRels.forEach(r => relMap.set(r.id, { ...r, novelId: effectiveNovelIdForData }));
        const mergedNovelRels = Array.from(relMap.values());
        if (mergedNovelRels.length > 0) {
          await syncFirestoreData('rel', effectiveNovelIdForData, 'POST', mergedNovelRels).catch(console.warn);
        }

        const allMergedTerms = [...mergedNovelTerms, ...otherTerms];
        const allMergedChars = [...mergedNovelChars, ...otherChars];
        const allMergedRels = [...mergedNovelRels, ...otherRels];

        db.bulkSaveCustomTerms(allMergedTerms).catch(console.error);
        db.saveCharacters(allMergedChars).catch(console.error);

        setSession(prev => ({
          ...prev,
          customTerms: allMergedTerms,
          characters: allMergedChars,
          relationships: allMergedRels
        }));

        const cloudList = await syncShortcutsFromCloud(effectiveNovelIdForData).catch(() => null);
        if (cloudList) setShortcuts(cloudList);
      }

      if (!isCloudQuotaExhausted()) {
        deletedNovelIdsRef.current.clear();
        deletedChapterIdsRef.current.clear();
        persistDeletedIds();
        clearUnsyncedChanges();
      }
      setLastRemoteSyncTime(Date.now());
      setSyncToastMessage({
        type: isCloudQuotaExhausted() ? 'error' : 'success',
        text: isCloudQuotaExhausted()
          ? 'Firestore đã hết hạn ngạch miễn phí hôm nay. Dữ liệu vẫn được bảo vệ 100% trên bộ nhớ máy!'
          : 'Đã đồng bộ 2 chiều với Firestore thành công!'
      });
      setTimeout(() => setSyncToastMessage(null), 4000);
    } catch (err: any) {
      console.error("Lỗi đồng bộ Firestore:", err);
      setSyncToastMessage({ 
        type: 'error', 
        text: isCloudQuotaExhausted() 
          ? 'Firestore đã hết hạn ngạch miễn phí hôm nay. Dữ liệu vẫn được bảo vệ 100% trên bộ nhớ máy của bạn!' 
          : `Lỗi đồng bộ: ${err?.message || 'Không thể kết nối đến Firestore'}` 
      });
      setTimeout(() => setSyncToastMessage(null), 5000);
    } finally {
      setIsSyncingToCloud(false);
    }
  };

  // Áp dụng dữ liệu khôi phục toàn diện từ Firestore (lấy từ mục Thiết lập tài khoản)
  const handleApplyCloudRecovery = async (data: RecoveredCloudData) => {
    const uid = auth.currentUser?.uid;

    // 1. Hợp nhất danh sách truyện
    const novelMap = new Map<string, Novel>();
    (novels || []).forEach((n) => {
      if (n && n.id && n.name) novelMap.set(n.id, n);
    });
    (data.novels || []).forEach((n) => {
      if (n && n.id && n.name) novelMap.set(n.id, n);
    });
    if (novelMap.size > 1 && novelMap.has('default')) {
      novelMap.delete('default');
    }
    const mergedNovels = Array.from(novelMap.values());
    if (mergedNovels.length > 0) {
      setNovels(mergedNovels);
      await db.saveNovels(mergedNovels, uid);
      if (uid) setScopedStorageItem(`cached_novels_${uid}`, JSON.stringify(mergedNovels));
      setScopedStorageItem('cached_novels_list', JSON.stringify(mergedNovels));
    }

    // 2. Hợp nhất toàn bộ kho chương
    const existingAllChaps = await db.getAllChapters();
    const chapMap = new Map<string, Chapter>();
    (existingAllChaps || []).forEach((c) => chapMap.set(c.id, c));
    (chapters || []).forEach((c) => {
      if (!chapMap.has(c.id)) chapMap.set(c.id, c);
    });

    const chapsToSave: Chapter[] = [];
    (data.chapters || []).forEach((cloudCh) => {
      const localCh = chapMap.get(cloudCh.id);
      if (!localCh) {
        chapMap.set(cloudCh.id, cloudCh);
        chapsToSave.push(cloudCh);
      } else {
        const { selected } = resolveChapterConflict(localCh, cloudCh);
        chapMap.set(cloudCh.id, selected);
        if (selected === cloudCh) {
          chapsToSave.push(cloudCh);
        }
      }
    });

    for (const ch of chapsToSave) {
      await db.saveChapter(ch);
    }
    const mergedChapters = Array.from(chapMap.values()).sort(
      (a, b) => (b.timestamp || 0) - (a.timestamp || 0)
    );
    setChapters(mergedChapters);

    // 3. Hợp nhất từ vựng, nhân vật, quan hệ
    const termMap = new Map<string, CustomTerm>();
    (session.customTerms || []).forEach((t) => termMap.set(t.id, t));
    (data.customTerms || []).forEach((t) => termMap.set(t.id, t));
    const mergedTerms = Array.from(termMap.values());

    const charMap = new Map<string, Character>();
    (session.characters || []).forEach((c) => charMap.set(c.id, c));
    (data.characters || []).forEach((c) => charMap.set(c.id, c));
    const mergedChars = Array.from(charMap.values());

    const relMap = new Map<string, Relationship>();
    (session.relationships || []).forEach((r) => relMap.set(r.id, r));
    (data.relationships || []).forEach((r) => relMap.set(r.id, r));
    const mergedRels = Array.from(relMap.values());

    await db.bulkSaveCustomTerms(mergedTerms);
    await db.saveCharacters(mergedChars);

    // 4. Hợp nhất phím tắt theo từng novelId
    if (data.shortcuts && data.shortcuts.length > 0) {
      const byNovel = new Map<string, typeof data.shortcuts>();
      data.shortcuts.forEach((sc) => {
        const nId = sc.novelId || '';
        const list = byNovel.get(nId) || [];
        list.push(sc);
        byNovel.set(nId, list);
      });
      byNovel.forEach((cloudList, nId) => {
        const localList = getStoredShortcuts(nId);
        const scMap = new Map(localList.map((s) => [s.id, s]));
        cloudList.forEach((s) => scMap.set(s.id, s));
        saveStoredShortcuts(Array.from(scMap.values()), nId, true);
      });
    }

    // 5. Xác định truyện active & khôi phục bản thảo đang làm dở nếu có
    const currentHasWork = Boolean(
      (session.inputText && session.inputText.trim().length > 0) ||
        (session.result?.segments && session.result.segments.length > 0) ||
        (session.preEditedText && session.preEditedText.trim().length > 0)
    );
    const nonDefault = mergedNovels.find((n) => n.id !== 'default');
    let nextNovelId =
      session.currentNovelId &&
      session.currentNovelId !== 'default' &&
      mergedNovels.some((n) => n.id === session.currentNovelId)
        ? session.currentNovelId
        : nonDefault?.id || mergedNovels[0]?.id || session.currentNovelId;

    const ws = data.latestWorkspace;
    if (ws && (!currentHasWork || (ws.updatedAt || 0) > (localWorkspaceUpdatedAtRef.current || 0))) {
      if (ws.novelId && mergedNovels.some((n) => n.id === ws.novelId)) {
        nextNovelId = ws.novelId;
      }
      let restoredResult = ws.result ? sanitizeResult(ws.result) : null;
      if (!restoredResult && ws.segments && ws.segments.length > 0) {
        restoredResult = {
          segments: ws.segments,
          naturalTranslation: ws.segments.map((s: any) => s.natural).join('\n'),
          quickTrans: ws.segments.map((s: any) => s.quick).join('\n'),
          sinoVietnamese: '',
          deeplTranslation: ws.segments.map((s: any) => s.deepl).join('\n'),
          vocabulary: [],
        };
      }
      const wsTime = ws.updatedAt || Date.now();
      localWorkspaceUpdatedAtRef.current = wsTime;
      setScopedStorageItem('local_workspace_updated_at', String(wsTime));

      const nextSession: TranslationSession = {
        ...session,
        currentNovelId: nextNovelId,
        currentChapterId: ws.chapterId || undefined,
        inputText: ws.inputText || '',
        deeplText: ws.deeplText || '',
        preEditedText: ws.preEditedText || '',
        result: restoredResult,
        status: (ws.status as AppStatus) || (restoredResult ? AppStatus.SUCCESS : AppStatus.IDLE),
        completedSegments: ws.completedSegments || [],
        customTerms: mergedTerms,
        characters: mergedChars,
        relationships: mergedRels,
      };
      setSession(nextSession);
      db.saveActiveSession({ ...nextSession, customTerms: [] }).catch(console.error);
    } else {
      setSession((prev) => ({
        ...prev,
        currentNovelId: nextNovelId,
        customTerms: mergedTerms,
        characters: mergedChars,
        relationships: mergedRels,
      }));
    }

    if (nextNovelId) {
      db.saveCurrentNovelId(nextNovelId).catch(console.error);
      setShortcuts(getStoredShortcuts(nextNovelId));
    }

    clearUnsyncedChanges();
    setLastRemoteSyncTime(Date.now());
    setSyncToastMessage({
      type: 'success',
      text: `Đã khôi phục từ Firestore: ${mergedNovels.length} truyện, ${data.chapters.length} chương!`,
    });
    setTimeout(() => setSyncToastMessage(null), 4500);
  };

  // Áp dụng các mục người dùng tự chọn từ công cụ Trích xuất Local
  const handleApplyLocalSelection = async (selection: SelectedLocalRestoreData) => {
    const uid = auth.currentUser?.uid;

    // 1. Truyện đã chọn
    let nextNovelId = session.currentNovelId;
    if (selection.novels.length > 0) {
      const novelMap = new Map<string, Novel>();
      (novels || []).forEach((n) => {
        if (n && n.id && n.name) novelMap.set(n.id, n);
      });
      selection.novels.forEach((n) => novelMap.set(n.id, n));
      if (novelMap.size > 1 && novelMap.has('default')) {
        novelMap.delete('default');
      }
      const mergedNovels = Array.from(novelMap.values());
      setNovels(mergedNovels);
      await db.saveNovels(mergedNovels, uid);
      if (uid) setScopedStorageItem(`cached_novels_${uid}`, JSON.stringify(mergedNovels));
      setScopedStorageItem('cached_novels_list', JSON.stringify(mergedNovels));

      if (!nextNovelId || nextNovelId === 'default') {
        nextNovelId = selection.novels[0].id;
      }
    }

    // 2. Chương đã chọn
    if (selection.chapters.length > 0) {
      const chapMap = new Map<string, Chapter>();
      (chapters || []).forEach((c) => chapMap.set(c.id, c));
      for (const ch of selection.chapters) {
        const normalizedCh: Chapter = {
          ...ch,
          novelId: ch.novelId || (nextNovelId && nextNovelId !== 'default' ? nextNovelId : ch.novelId),
        };
        chapMap.set(normalizedCh.id, normalizedCh);
        await db.saveChapter(normalizedCh);
      }
      setChapters(
        Array.from(chapMap.values()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0))
      );
    }

    // 3. Từ vựng, nhân vật, quan hệ đã chọn
    const termMap = new Map<string, CustomTerm>();
    (session.customTerms || []).forEach((t) => termMap.set(t.id, t));
    selection.customTerms.forEach((t) => termMap.set(t.id, t));
    const mergedTerms = Array.from(termMap.values());

    const charMap = new Map<string, Character>();
    (session.characters || []).forEach((c) => charMap.set(c.id, c));
    selection.characters.forEach((c) => charMap.set(c.id, c));
    const mergedChars = Array.from(charMap.values());

    const relMap = new Map<string, Relationship>();
    (session.relationships || []).forEach((r) => relMap.set(r.id, r));
    selection.relationships.forEach((r) => relMap.set(r.id, r));
    const mergedRels = Array.from(relMap.values());

    if (selection.customTerms.length > 0) await db.bulkSaveCustomTerms(mergedTerms);
    if (selection.characters.length > 0) await db.saveCharacters(mergedChars);

    // 4. Gõ tắt đã chọn
    if (selection.shortcuts.length > 0) {
      const byNovel = new Map<string, typeof selection.shortcuts>();
      selection.shortcuts.forEach((sc) => {
        const nId = sc.novelId || nextNovelId || '';
        const list = byNovel.get(nId) || [];
        list.push(sc);
        byNovel.set(nId, list);
      });
      byNovel.forEach((picked, nId) => {
        const currentList = getStoredShortcuts(nId);
        const scMap = new Map(currentList.map((s) => [s.id, s]));
        picked.forEach((s) => scMap.set(s.id, s));
        saveStoredShortcuts(Array.from(scMap.values()), nId, true);
      });
      setShortcuts(getStoredShortcuts(nextNovelId));
    }

    // 5. Lịch sử đã chọn
    if (selection.historyToRestore.length > 0) {
      setHistory((prev) => {
        const hMap = new Map(prev.map((h) => [h.id, h]));
        selection.historyToRestore.forEach((h) => hMap.set(h.id, h));
        return Array.from(hMap.values()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
      });
    }

    // 6. Bản thảo làm dở đã chọn (nếu có)
    if (selection.sessionToRestore) {
      const picked = selection.sessionToRestore;
      const targetNovel = picked.novelId || nextNovelId;
      const nextSession: TranslationSession = {
        ...session,
        currentNovelId: targetNovel,
        currentChapterId: picked.chapterId,
        inputText: picked.inputText,
        deeplText: picked.deeplText,
        preEditedText: picked.preEditedText,
        result: picked.result ? sanitizeResult(picked.result) : null,
        completedSegments: picked.completedSegments,
        status: picked.status,
        customTerms: mergedTerms,
        characters: mergedChars,
        relationships: mergedRels,
      };
      setSession(nextSession);
      await db.saveActiveSession({ ...nextSession, customTerms: [] });
    } else {
      setSession((prev) => ({
        ...prev,
        currentNovelId: nextNovelId || prev.currentNovelId,
        customTerms: mergedTerms,
        characters: mergedChars,
        relationships: mergedRels,
      }));
    }

    markLocalWorkspaceDirty();
    setSyncToastMessage({
      type: 'success',
      text: 'Đã khôi phục các mục bạn chọn từ Local! Nhấn "Đồng bộ Firestore" nếu muốn lưu lên đám mây.',
    });
    setTimeout(() => setSyncToastMessage(null), 5000);
  };

  const handleUpdateCharacters = (novelChars: Character[]) => {
    try {
      const currentId = session.currentNovelId || 'default';
      const novelCharsWithId = novelChars.map(c => ({ ...c, novelId: c.novelId || currentId }));
      const novelCharIds = new Set(novelCharsWithId.map(c => c.id));
      const novelChineseNames = new Set(novelCharsWithId.map(c => c.chineseName.trim().toLowerCase()));

      // Giữ lại các nhân vật khác (thuộc truyện khác hoặc nhân vật chung chưa bị ghi đè)
      const otherChars = (session.characters || []).filter(c => {
        if (novelCharIds.has(c.id)) return false;
        if (c.novelId === currentId) return false;
        // Nếu cùng tên tiếng Trung nhưng ở truyện khác và đã có trong novelChars thì ưu tiên novelChars
        if (novelChineseNames.has(c.chineseName.trim().toLowerCase())) return false;
        return true;
      });

      const merged = [...novelCharsWithId, ...otherChars];
      updateSession({ characters: merged });
      db.saveCharacters(merged).catch(err => {
        console.error("App: db.saveCharacters failed", err);
      });
    } catch (err) {
      console.error("App: handleUpdateCharacters caught error:", err);
    }
  };

  const handleUpdateRelationships = (novelRels: Relationship[]) => {
    try {
      const currentId = session.currentNovelId || 'default';
      const novelRelsWithId = novelRels.map(r => ({ ...r, novelId: r.novelId || currentId }));
      const novelRelIds = new Set(novelRelsWithId.map(r => r.id));
      const otherRels = (session.relationships || []).filter(r => !novelRelIds.has(r.id) && r.novelId !== currentId);
      const merged = [...novelRelsWithId, ...otherRels];
      updateSession({ relationships: merged });
    } catch (err) {
      console.error("App: handleUpdateRelationships caught error:", err);
    }
  };

  const handleUpdateTerms = (novelTerms: CustomTerm[]) => {
    try {
      const currentId = session.currentNovelId || 'default';
      const novelTermsWithId = novelTerms.map(t => ({ ...t, novelId: t.novelId || currentId }));
      const novelTermIds = new Set(novelTermsWithId.map(t => t.id));
      const novelTermsClean = new Set(novelTermsWithId.map(t => t.term.trim().toLowerCase()));

      // Giữ lại các từ vựng khác (thuộc truyện khác hoặc từ vựng chung chưa bị ghi đè)
      const otherTerms = (session.customTerms || []).filter(t => {
        if (novelTermIds.has(t.id)) return false;
        if (t.novelId === currentId) return false;
        if (novelTermsClean.has(t.term.trim().toLowerCase())) return false;
        return true;
      });

      const merged = [...novelTermsWithId, ...otherTerms];
      updateSession({ customTerms: merged });
      db.bulkSaveCustomTerms(merged).catch(err => {
        console.error("App: db.bulkSaveCustomTerms failed", err);
      });
    } catch (err) {
      console.error("App: handleUpdateTerms caught error:", err);
    }
  };

  const autoSaveLinkedChapter = (newResult: any, newCompleted?: number[]) => {
    if (!session.currentChapterId) return;
    
    const completedToSave = newCompleted !== undefined ? newCompleted : (session.completedSegments || []);
    
    setChapters(prev => prev.map(c => {
      if (c.id === session.currentChapterId) {
        const updated = {
          ...c,
          result: newResult || c.result,
          completedSegments: completedToSave,
          timestamp: Date.now()
        };
        db.saveChapter(updated).catch(err => console.error("Auto-save chapter failed", err));
        return updated;
      }
      return c;
    }));
  };

  const createSnapshot = (): HistorySnapshot => ({
    segments: session.result?.segments?.map(s => ({ ...s })) || [],
    completedSegments: [...(session.completedSegments || [])],
    inputText: session.inputText || '',
    deeplText: session.deeplText || ''
  });

  const saveUndoSnapshot = () => {
    if (!session.result) return;
    const snapshot = createSnapshot();
    setUndoStack(prev => [...prev, snapshot].slice(-100));
    setRedoStack([]);
  };

  const handleUpdateSegment = (index: number, newNatural: string) => {
    if (!session.result) return;
    lastLocalEditTimeRef.current = Date.now();

    const cleanNewNatural = newNatural.replace(/\n+$/, "");
    const currentSegments = session.result.segments;
    if (currentSegments[index] && currentSegments[index].natural === cleanNewNatural) {
      return; // No actual change, skip to avoid redundant undo states and clearing redo
    }

    saveUndoSnapshot();

    const newSegments = [...currentSegments];
    newSegments[index] = { ...newSegments[index], natural: cleanNewNatural };
    const newResult = {
        ...session.result,
        segments: newSegments,
        naturalTranslation: newSegments.map(s => s.natural).join('\n')
    };
    
    updateSession({ result: newResult });
    autoSaveLinkedChapter(newResult);

    if (session.currentHistoryId) {
      setHistory(prev => prev.map(item => 
        item.id === session.currentHistoryId 
          ? { ...item, result: newResult, completedSegments: session.completedSegments, timestamp: Date.now() } 
          : item
      ));
    }
  };

  const handleUpdateAllSegments = (newNaturals: string[]) => {
    if (!session.result) return;
    lastLocalEditTimeRef.current = Date.now();

    const currentSegments = session.result.segments;
    let hasChanged = false;
    const cleanedNewNaturals = newNaturals.map(n => (n || '').replace(/\n+$/, ""));
    
    for (let i = 0; i < currentSegments.length; i++) {
      if (currentSegments[i].natural !== (cleanedNewNaturals[i] || '')) {
        hasChanged = true;
        break;
      }
    }
    
    if (!hasChanged) return; // No actual change

    saveUndoSnapshot();

    const newSegments = currentSegments.map((seg, idx) => ({
      ...seg,
      natural: cleanedNewNaturals[idx] || ''
    }));

    const newResult = {
        ...session.result,
        segments: newSegments,
        naturalTranslation: newSegments.map(s => s.natural).join('\n')
    };
    
    updateSession({ result: newResult });
    autoSaveLinkedChapter(newResult);

    if (session.currentHistoryId) {
      setHistory(prev => prev.map(item => 
        item.id === session.currentHistoryId 
          ? { ...item, result: newResult, completedSegments: session.completedSegments, timestamp: Date.now() } 
          : item
      ));
    }
  };

  const handleUpdateSegmentField = (index: number, field: 'source' | 'natural' | 'quick' | 'deepl', value: string) => {
    if (!session.result?.segments || !session.result.segments[index]) return;
    lastLocalEditTimeRef.current = Date.now();

    const currentSegments = session.result.segments;
    const prevVal = currentSegments[index][field] || '';
    if (prevVal === value) return;

    saveUndoSnapshot();

    const newSegments = [...currentSegments];
    newSegments[index] = {
      ...newSegments[index],
      [field]: value
    };

    let newInputText = session.inputText;
    let newDeeplText = session.deeplText;
    if (field === 'source') {
      newInputText = newSegments.map(s => (s.source || '').trim()).join('\n');
    } else if (field === 'deepl') {
      newDeeplText = newSegments.map(s => (s.deepl || '').trim()).join('\n');
    }

    const newResult: TranslationResponse = {
      ...session.result,
      segments: newSegments,
      naturalTranslation: newSegments.map(s => s.natural).join('\n')
    };

    updateSession({
      result: newResult,
      inputText: newInputText,
      deeplText: newDeeplText
    });
    autoSaveLinkedChapter(newResult);

    if (session.currentHistoryId) {
      setHistory(prev => prev.map(item => 
        item.id === session.currentHistoryId 
          ? { ...item, result: newResult, completedSegments: session.completedSegments, timestamp: Date.now() } 
          : item
      ));
    }
  };

  const handleDeleteSegment = (index: number) => {
    if (!session.result?.segments || !session.result.segments[index]) return;
    lastLocalEditTimeRef.current = Date.now();

    const currentSegments = session.result.segments;
    saveUndoSnapshot();

    const newSegments = currentSegments.filter((_, i) => i !== index);
    const newCompletedSegments = (session.completedSegments || [])
      .filter(i => i !== index)
      .map(i => i > index ? i - 1 : i);

    const newInputText = newSegments.map(s => (s.source || '').trim()).join('\n');
    const newDeeplText = newSegments.map(s => (s.deepl || '').trim()).join('\n');

    const newResult: TranslationResponse = {
      ...session.result,
      segments: newSegments,
      naturalTranslation: newSegments.map(s => s.natural).join('\n')
    };

    updateSession({
      result: newResult,
      completedSegments: newCompletedSegments,
      inputText: newInputText,
      deeplText: newDeeplText
    });
    autoSaveLinkedChapter(newResult, newCompletedSegments);

    if (session.currentHistoryId) {
      setHistory(prev => prev.map(item => 
        item.id === session.currentHistoryId 
          ? { ...item, result: newResult, completedSegments: newCompletedSegments, timestamp: Date.now() } 
          : item
      ));
    }
  };

  const handleUndo = () => {
    if (undoStack.length === 0 || !session.result) return;
    
    const previousState = undoStack[undoStack.length - 1];
    const currentState = createSnapshot();
    
    setUndoStack(prev => prev.slice(0, prev.length - 1));
    setRedoStack(prev => [...prev, currentState]);
    
    const newSegments = previousState.segments.map(s => ({ ...s }));
    const newResult = {
      ...session.result,
      segments: newSegments,
      naturalTranslation: newSegments.map(s => s.natural).join('\n')
    };
    
    updateSession({
      result: newResult,
      completedSegments: previousState.completedSegments || [],
      inputText: previousState.inputText,
      deeplText: previousState.deeplText
    });
    autoSaveLinkedChapter(newResult, previousState.completedSegments);

    if (session.currentHistoryId) {
      setHistory(prev => prev.map(item => 
        item.id === session.currentHistoryId 
          ? { ...item, result: newResult, completedSegments: previousState.completedSegments, timestamp: Date.now() } 
          : item
      ));
    }
  };

  const handleRedo = () => {
    if (redoStack.length === 0 || !session.result) return;
    
    const nextState = redoStack[redoStack.length - 1];
    const currentState = createSnapshot();
    
    setRedoStack(prev => prev.slice(0, prev.length - 1));
    setUndoStack(prev => [...prev, currentState]);
    
    const newSegments = nextState.segments.map(s => ({ ...s }));
    const newResult = {
      ...session.result,
      segments: newSegments,
      naturalTranslation: newSegments.map(s => s.natural).join('\n')
    };
    
    updateSession({
      result: newResult,
      completedSegments: nextState.completedSegments || [],
      inputText: nextState.inputText,
      deeplText: nextState.deeplText
    });
    autoSaveLinkedChapter(newResult, nextState.completedSegments);

    if (session.currentHistoryId) {
      setHistory(prev => prev.map(item => 
        item.id === session.currentHistoryId 
          ? { ...item, result: newResult, completedSegments: nextState.completedSegments, timestamp: Date.now() } 
          : item
      ));
    }
  };

  const handleToggleComplete = (index: number) => {
    lastLocalEditTimeRef.current = Date.now();
    const currentCompleted = session.completedSegments || [];
    const isCompleted = currentCompleted.includes(index);
    const newCompleted = isCompleted 
        ? currentCompleted.filter(i => i !== index)
        : [...currentCompleted, index];
    
    updateSession({ completedSegments: newCompleted });
    autoSaveLinkedChapter(session.result, newCompleted);

    if (session.currentHistoryId) {
      setHistory(prev => prev.map(item => 
        item.id === session.currentHistoryId 
          ? { ...item, completedSegments: newCompleted, timestamp: Date.now() } 
          : item
      ));
    }
  };

  const handleRestoreSegments = () => {
    if (!session.result) return;
    saveUndoSnapshot();
    const fixed = reconstructSegmentsIfEmpty(session);
    if (fixed.result?.segments && fixed.result.segments.length > 0) {
      updateSession({ result: fixed.result });
    }
  };

  const removeBlankLines = (text: string): string => {
    return text
      .split(/\r?\n/)
      .filter(line => line.trim().length > 0)
      .join('\n');
  };

  const handleCleanAllBlankLines = () => {
    const newInput = removeBlankLines(session.inputText);
    const newDeepl = removeBlankLines(session.deeplText);
    const newPreEdit = removeBlankLines(session.preEditedText || '');
    handleInputChange({
      inputText: newInput,
      deeplText: newDeepl,
      preEditedText: newPreEdit
    });
  };

  const handleCleanFieldBlankLines = (fieldKey: 'inputText' | 'deeplText' | 'preEditedText') => {
    const currentVal = session[fieldKey] || '';
    const cleaned = removeBlankLines(currentVal);
    handleInputChange({ [fieldKey]: cleaned });
  };

  const handlePasteWithClean = (e: React.ClipboardEvent<HTMLTextAreaElement>, fieldKey: 'inputText' | 'deeplText' | 'preEditedText') => {
    if (!autoCleanBlankLines) return;
    const clipboardText = e.clipboardData.getData('text');
    if (!clipboardText) return;

    const cleaned = removeBlankLines(clipboardText);
    if (cleaned !== clipboardText) {
      e.preventDefault();
      const textarea = e.currentTarget;
      const start = textarea.selectionStart || 0;
      const end = textarea.selectionEnd || 0;
      const originalValue = textarea.value;
      const newValue = originalValue.substring(0, start) + cleaned + originalValue.substring(end);

      handleInputChange({ [fieldKey]: newValue });

      setTimeout(() => {
        textarea.selectionStart = textarea.selectionEnd = start + cleaned.length;
      }, 0);
    }
  };

  const handleClearSession = async () => {
    if (!session.inputText.trim()) return;

    // --- TỰ ĐỘNG LƯU TRỮ CHƯƠNG ĐANG EDIT NẾU QUÊN CHƯA LƯU TRƯỚC KHI XÓA ---
    if (session.result && session.inputText.trim()) {
      const alreadySaved = chapters.some(c => c.inputText.trim() === session.inputText.trim());
      if (!alreadySaved) {
        let autoName = "";
        const lines = session.inputText.split('\n').map(l => l.trim()).filter(Boolean);
        
        for (const line of lines.slice(0, 5)) {
          if (line.match(/(Chương\s+\d+|第[一二三四五六七八九十百千万\d]+章)/i)) {
            const customMap = new Map<string, string>();
            currentNovelCharacters.forEach(c => {
                if (c.chineseName && c.vietName) customMap.set(c.chineseName.trim(), c.vietName.trim());
            });
            currentNovelTerms.forEach(t => {
                if (t.term && t.meaning) customMap.set(t.term.trim(), t.meaning.trim());
            });
            autoName = vietphraseEngine.translate(line, customMap);
            break;
          }
        }
        
        if (!autoName && session.result.segments && session.result.segments.length > 0) {
          const firstEditLine = session.result.segments[0].natural.trim();
          if (firstEditLine) {
            autoName = firstEditLine.slice(0, 50);
          }
        }
        
        if (!autoName) {
          autoName = `Chương tự động (${new Date().toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit' })})`;
        } else {
          autoName = `[Tự động - Xóa] ${autoName}`;
        }
        
        const autoChapter: Chapter = {
          id: `auto_${Date.now()}`,
          novelId: session.currentNovelId,
          name: autoName,
          timestamp: Date.now(),
          inputText: session.inputText,
          deeplText: session.deeplText,
          preEditedText: session.preEditedText,
          result: session.result,
          completedSegments: session.completedSegments
        };
        
        try {
          await db.saveChapter(autoChapter);
          setChapters(prev => [autoChapter, ...prev]);
          console.log("Auto-saved draft on clear:", autoName);
        } catch (e) {
          console.error("Auto save on clear failed", e);
        }
      }
    }

    // Tiến hành xóa session cục bộ
    updateSession({ inputText: '', deeplText: '', preEditedText: '', result: null, status: AppStatus.IDLE, currentChapterId: undefined, currentHistoryId: undefined });
  };

  const handleTranslate = async (forceFastAlign = false) => {
    if (!session.inputText.trim()) return;

    // --- BƯỚC 1: TÍNH TOÁN VIETPHRASE NỘI BỘ ---
    const inputLines = session.inputText.split(/\r?\n/).map(l => l.replace(/\r$/, ''));
    
    const customMap = new Map<string, string>();
    // 1. Nạp toàn bộ kho từ vựng & nhân vật đã lưu làm nền tảng
    (session.characters || []).forEach(c => {
        if (c.chineseName && c.vietName) customMap.set(c.chineseName.trim(), c.vietName.trim());
    });
    (session.customTerms || []).forEach(t => {
        if (t.term && t.meaning) customMap.set(t.term.trim(), t.meaning.trim());
    });
    // 2. Ghi đè bởi từ vựng & nhân vật truyện hiện tại
    currentNovelCharacters.forEach(c => {
        if (c.chineseName && c.vietName) customMap.set(c.chineseName.trim(), c.vietName.trim());
    });
    currentNovelTerms.forEach(t => {
        if (t.term && t.meaning) customMap.set(t.term.trim(), t.meaning.trim());
    });

    const vpSegments = inputLines.map(line => ({
        source: line,
        quick: vietphraseEngine.translate(line, customMap),
    }));
    
    const currentChapId = session.currentChapterId;
    updateSession({ status: AppStatus.LOADING, error: null, result: null, completedSegments: [], currentHistoryId: undefined, currentChapterId: currentChapId });

    try {
      const hasPreEdited = !!(session.preEditedText && session.preEditedText.trim());
      const hasDeepl = !!(session.deeplText && session.deeplText.trim());
      
      let mergedSegments = [];

      if (mode === 'beta' && hasPreEdited) {
         // Căn lề bản dịch cũ hoàn toàn cục bộ
         const preEditedLines = alignTranslation(inputLines, session.preEditedText || "");
         
         // Căn lề GG/DeepL hoàn toàn cục bộ
         const deeplLines = hasDeepl ? alignTranslation(inputLines, session.deeplText) : [];

         mergedSegments = inputLines.map((line, i) => {
             let refDeepl = "";
             if (hasDeepl) {
                 refDeepl = deeplLines[i] || "";
             }

             const preEdit = preEditedLines[i] || "";
             const brackets = extractBracketsOnly(line);

             return {
                 source: line,
                 natural: preEdit ? preEdit : brackets,
                 quick: vpSegments[i]?.quick || "",
                 deepl: refDeepl
              };
         });
      } else {
         // Standard Edit Mode: Can le GG/DeepL lam tai lieu tham khao, o dich tu fill dau neu raw co 【】, 《》, …… hoac ——
         const deeplLines = alignTranslation(inputLines, session.deeplText || "");
         mergedSegments = inputLines.map((line, i) => ({
            source: line,
            natural: extractBracketsOnly(line), // Tu fill dau 【】, 《》, ……, —— (chi dau), con lai de trong de nguoi dung tu dien
            quick: vpSegments[i]?.quick || "",
            deepl: deeplLines[i] || ""
         }));
      }

      const mergedResult = {
         segments: mergedSegments,
         sinoVietnamese: "",
         vocabulary: [],
         naturalTranslation: mergedSegments.map(s => s.natural).join('\n'),
         quickTrans: mergedSegments.map(s => s.quick).join('\n'),
         deeplTranslation: mergedSegments.map(s => s.deepl).join('\n'),
         modelUsed: "Offline Engine"
      };

      const sanitized = sanitizeResult(mergedResult);
      const historyId = Date.now().toString();
      
      let activeChapId = currentChapId;
      if (!activeChapId) {
        // Tự động tạo duy nhất 1 chương mới nếu chưa có chương liên kết
        activeChapId = `chap_${Date.now()}`;
        let extractedName = "";
        const lines = session.inputText.split('\n').map(l => l.trim()).filter(Boolean);
        for (const line of lines.slice(0, 5)) {
          if (line.match(/(Chương\s+\d+|第[一二三四五六七八九十百千万\d]+章)/i)) {
            extractedName = vietphraseEngine.translate(line, customMap);
            break;
          }
        }
        const novChapters = chapters.filter(c => c.novelId === session.currentNovelId);
        const autoName = extractedName || session.name || `Chương ${novChapters.length + 1}`;

        const newChapter: Chapter = {
          id: activeChapId,
          novelId: session.currentNovelId || 'default',
          name: autoName,
          timestamp: Date.now(),
          inputText: session.inputText,
          deeplText: session.deeplText,
          preEditedText: session.preEditedText,
          result: sanitized as TranslationResponse,
          completedSegments: []
        };
        db.saveChapter(newChapter).catch(console.warn);
        setChapters(prev => [newChapter, ...prev]);
        updateSession({ 
          name: autoName,
          result: sanitized, 
          status: AppStatus.SUCCESS,
          currentHistoryId: historyId,
          currentChapterId: activeChapId
        });
      } else {
        // Cập nhật DUY NHẤT chương hiện tại, tuyệt đối không tạo thêm file mới
        updateSession({ 
          result: sanitized, 
          status: AppStatus.SUCCESS,
          currentHistoryId: historyId,
          currentChapterId: activeChapId
        });

        setChapters(prev => prev.map(c => {
          if (c.id === activeChapId) {
            return {
              ...c,
              timestamp: Date.now(),
              inputText: session.inputText,
              deeplText: session.deeplText,
              preEditedText: session.preEditedText,
              result: sanitized as TranslationResponse,
              completedSegments: []
            };
          }
          return c;
        }));
        
        const chapToSave: Chapter = {
          id: activeChapId,
          novelId: session.currentNovelId || 'default',
          name: session.name || 'Chương',
          timestamp: Date.now(),
          inputText: session.inputText,
          deeplText: session.deeplText,
          preEditedText: session.preEditedText,
          result: sanitized as TranslationResponse,
          completedSegments: []
        };
        db.saveChapter(chapToSave).catch(console.warn);
      }
      
      const newHistoryItem: HistoryItem = {
        id: historyId,
        timestamp: Date.now(),
        sourceText: session.inputText,
        result: sanitized as TranslationResponse,
        modelId: "Offline Engine",
        completedSegments: []
      };
      setHistory(prev => [newHistoryItem, ...prev].slice(0, 50));
    } catch (err: any) {
      updateSession({ 
        error: err.message || "Đã xảy ra lỗi không xác định.", 
        status: AppStatus.ERROR 
      });
    }
  };

  const handleRestoreHistory = (item: HistoryItem) => {
    lastLocalEditTimeRef.current = Date.now();
    const restored = sanitizeResult(item.result);
    const completed = item.completedSegments || [];

    updateSession({
      inputText: item.sourceText,
      deeplText: item.result?.deeplTranslation || "",
      preEditedText: item.result?.naturalTranslation || "",
      result: restored,
      status: AppStatus.SUCCESS,
      error: null,
      completedSegments: completed,
      currentHistoryId: item.id
    });
    setShowHistory(false);
  };

  const deleteHistoryItem = (id: string) => {
    setHistory(prev => prev.filter(item => item.id !== id));
  };

  const handleSaveChapter = async (name: string, saveMode: 'new' | 'update' = 'new') => {
    if (!session.result) return;
    lastLocalEditTimeRef.current = Date.now();

    // Buộc flush toàn bộ ô textarea đang edit dở trước khi đóng gói dữ liệu
    window.dispatchEvent(new CustomEvent('app_flush_edits'));
    (document.activeElement as HTMLElement)?.blur();

    let chapterId: string;
    if (saveMode === 'update' && session.currentChapterId) {
      chapterId = session.currentChapterId;
    } else {
      chapterId = `chap_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
    }

    const currentSegments = session.result.segments || [];
    const fullNaturalText = currentSegments.map(s => s.natural || '').join('\n');
    const fullSourceText = currentSegments.map(s => s.source || '').join('\n');
    const fullDeeplText = currentSegments.map(s => s.deepl || '').join('\n');
    const fullQuickText = currentSegments.map(s => s.quick || '').join('\n');

    const cleanResult: TranslationResponse = {
      ...session.result,
      segments: currentSegments,
      naturalTranslation: fullNaturalText,
      quickTrans: fullQuickText,
      deeplTranslation: fullDeeplText
    };

    const newChapter: Chapter = {
      id: chapterId,
      novelId: session.currentNovelId,
      name,
      timestamp: Date.now(),
      inputText: fullSourceText || session.inputText,
      deeplText: fullDeeplText || session.deeplText,
      preEditedText: fullNaturalText || session.preEditedText,
      result: cleanResult,
      completedSegments: session.completedSegments
    };

    markLocalWorkspaceDirty();
    await db.saveChapter(newChapter);
    setChapters(prev => {
      const exists = prev.some(c => c.id === chapterId);
      if (exists) {
        return prev.map(c => c.id === chapterId ? newChapter : c);
      } else {
        return [newChapter, ...prev];
      }
    });
    updateSession({ 
      currentChapterId: chapterId,
      result: cleanResult,
      inputText: fullSourceText || session.inputText,
      preEditedText: fullNaturalText || session.preEditedText
    });
  };

  const handleRestoreChapter = (chapter: Chapter) => {
    lastLocalEditTimeRef.current = Date.now();
    let restoredResult = sanitizeResult(chapter.result);
    const completed = chapter.completedSegments || [];
    const activeNovelId = chapter.novelId || session.currentNovelId;

    // Nếu segments bị rỗng nhưng có văn bản lưu trữ, tự động khôi phục segments ngay lập tức
    if ((!restoredResult?.segments || restoredResult.segments.length === 0) && (chapter.inputText?.trim() || chapter.preEditedText?.trim() || chapter.result?.naturalTranslation?.trim())) {
      const rawLines = (chapter.inputText || '').split(/\r?\n/);
      const natLines = (chapter.preEditedText || chapter.result?.naturalTranslation || '').split(/\r?\n/);
      const dpLines = (chapter.deeplText || chapter.result?.deeplTranslation || '').split(/\r?\n/);
      const lineCount = Math.max(rawLines.length, natLines.length);

      if (lineCount > 0) {
        const customMap = new Map<string, string>();
        currentNovelCharacters.forEach(c => {
          if (c.chineseName && c.vietName) customMap.set(c.chineseName.trim(), c.vietName.trim());
        });
        currentNovelTerms.forEach(t => {
          if (t.term && t.meaning) customMap.set(t.term.trim(), t.meaning.trim());
        });

        const recoveredSegments: TranslationSegment[] = [];
        for (let i = 0; i < lineCount; i++) {
          const src = rawLines[i] ?? '';
          const nat = natLines[i] !== undefined ? natLines[i] : extractBracketsOnly(src);
          const dp = dpLines[i] ?? '';
          const qk = src ? vietphraseEngine.translate(src, customMap) : '';
          recoveredSegments.push({
            source: src,
            natural: nat,
            quick: qk,
            deepl: dp
          });
        }

        restoredResult = {
          segments: recoveredSegments,
          naturalTranslation: recoveredSegments.map(s => s.natural).join('\n'),
          quickTrans: recoveredSegments.map(s => s.quick).join('\n'),
          deeplTranslation: recoveredSegments.map(s => s.deepl).join('\n'),
          sinoVietnamese: '',
          vocabulary: []
        };
      }
    }

    const hasSegments = !!(restoredResult?.segments && restoredResult.segments.length > 0);
    // Luôn ưu tiên lấy chính xác từ restoredResult.segments nếu có để bảo toàn nguyên vẹn mọi đoạn edit
    const sourceText = hasSegments ? (restoredResult?.segments || []).map(s => s.source || '').join('\n') : (chapter.inputText || "");
    const deeplText = hasSegments ? (restoredResult?.segments || []).map(s => s.deepl || '').join('\n') : (chapter.deeplText || "");
    const naturalText = hasSegments ? (restoredResult?.segments || []).map(s => s.natural || '').join('\n') : (chapter.preEditedText || "");

    updateSession({
      name: chapter.name,
      inputText: sourceText,
      deeplText: deeplText,
      preEditedText: naturalText,
      result: restoredResult,
      status: hasSegments ? AppStatus.SUCCESS : AppStatus.IDLE,
      error: null,
      completedSegments: completed,
      currentHistoryId: undefined,
      currentChapterId: chapter.id,
      currentNovelId: activeNovelId
    });
    setShowChapters(false);
  };

  // Tự động nạp nội dung chương nếu session có currentChapterId nhưng chưa có nội dung
  useEffect(() => {
    if (session.currentChapterId && !session.result && !session.inputText.trim() && chapters.length > 0) {
      const activeChap = chapters.find(c => c.id === session.currentChapterId);
      if (activeChap && (activeChap.inputText?.trim() || (activeChap.result?.segments && activeChap.result.segments.length > 0))) {
        handleRestoreChapter(activeChap);
      }
    }
  }, [session.currentChapterId, session.result, session.inputText, chapters]);

  const handleSelectNovel = (novelId: string) => {
    if (!novelId || novelId === session.currentNovelId) return;
    const now = Date.now();
    markLocalWorkspaceDirty(now);
    setSession(prev => ({
      ...prev,
      currentNovelId: novelId,
      currentChapterId: undefined,
      currentHistoryId: undefined,
      result: null,
      inputText: '',
      deeplText: '',
      preEditedText: '',
      completedSegments: [],
      status: AppStatus.IDLE
    }));
    db.saveCurrentNovelId(novelId).catch(console.error);
  };

  const handleInputChange = (updates: Partial<TranslationSession>) => {
    lastLocalEditTimeRef.current = Date.now();
    const cleanUpdates = { ...updates };
    if (cleanUpdates.inputText && cleanUpdates.inputText.includes('"')) {
      cleanUpdates.inputText = convertStraightToSmartQuotes(cleanUpdates.inputText);
    }
    if (cleanUpdates.deeplText && cleanUpdates.deeplText.includes('"')) {
      cleanUpdates.deeplText = convertStraightToSmartQuotes(cleanUpdates.deeplText);
    }
    if (cleanUpdates.preEditedText && cleanUpdates.preEditedText.includes('"')) {
      cleanUpdates.preEditedText = convertStraightToSmartQuotes(cleanUpdates.preEditedText);
    }
    updateSession(cleanUpdates);
  };

  const handleDeleteChapter = async (id: string) => {
    markLocalWorkspaceDirty();
    deletedChapterIdsRef.current.add(id);
    persistDeletedIds();
    // 1. Cập nhật state UI ngay lập tức
    setChapters(prev => prev.filter(c => c.id !== id));

    // 2. Xóa trong IndexedDB cục bộ
    try {
      await db.deleteChapter(id);
    } catch (e) {
      console.warn("Lỗi xóa chương trong IndexedDB:", e);
    }

    // 3. Nếu chương đang mở chính là chương vừa xóa, dọn sạch session
    if (session.currentChapterId === id) {
      updateSession({
        currentChapterId: undefined,
        currentHistoryId: undefined,
        name: '',
        inputText: '',
        deeplText: '',
        preEditedText: '',
        result: null,
        completedSegments: [],
        status: AppStatus.IDLE
      });
    }
  };

  const handleRenameChapter = async (id: string, newName: string) => {
    const trimmed = newName.trim();
    if (!trimmed) return;

    const now = Date.now();
    markLocalWorkspaceDirty(now);
    const chapter = chapters.find(c => c.id === id);
    if (!chapter) return;

    const updated: Chapter = { ...chapter, name: trimmed, timestamp: now };

    // 1. Cập nhật UI ngay tức thì
    setChapters(prev => prev.map(c => c.id === id ? updated : c));
    if (session.currentChapterId === id) {
      updateSession({ name: trimmed });
    }

    // 2. Lưu vĩnh viễn vào IndexedDB cục bộ
    await db.saveChapter(updated);
  };

  const handleClearAllChapters = async () => {
    markLocalWorkspaceDirty();
    const targetNovelId = session.currentNovelId;
    const toDelete = chapters.filter(c => c.novelId === targetNovelId || (!c.novelId && targetNovelId === 'default'));
    for (const ch of toDelete) {
      deletedChapterIdsRef.current.add(ch.id);
      await db.deleteChapter(ch.id);
    }
    persistDeletedIds();
    setChapters(prev => prev.filter(c => c.novelId !== targetNovelId && (targetNovelId !== 'default' || Boolean(c.novelId))));
  };

  const handleExportExcel = async () => {
    let novelName = "Truyện";
    const currentId = session.currentNovelId;
    const found = novels.find(n => n.id === currentId);
    if (found) novelName = found.name;

    // Chỉ xuất dữ liệu của bộ truyện hiện tại
    const filteredTerms = (session.customTerms || []).filter(t => currentId && t.novelId === currentId);
    const filteredChars = (session.characters || []).filter(c => currentId && c.novelId === currentId);
    const filteredRels = (session.relationships || []).filter(r => currentId && r.novelId === currentId);
    const filteredShortcuts = getStoredShortcuts(currentId);

    exportToExcel(filteredTerms, filteredChars, filteredRels, novelName, filteredShortcuts);
  };



  return (
    <div className="h-screen flex flex-col font-sans overflow-hidden bg-[#F5E6D3] text-[#3E2723]">
      
      {/* HEADER */}
      
        <header className={`bg-[#EFE5D9] text-[#3E2723] border-b border-[#D7CCC8] min-h-14 py-1.5 flex-wrap items-center justify-between gap-2 px-3 sm:px-4 shrink-0 z-20 shadow-xs ${isFocusMode ? 'hidden' : 'flex'}`}>
          <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
            {/* Segmented Mode Control */}
            <div className="flex bg-[#E4D5C3] p-0.5 rounded-lg border border-[#D7CCC8]">
              <button
                onClick={() => setMode('edit')}
                className={`px-2 sm:px-3 py-1 rounded-md text-[11px] font-bold transition-all ${mode === 'edit' ? 'bg-[#5D4037] text-white shadow-xs' : 'text-[#5D4037] hover:text-[#3E2723]'}`}
                title="Chế độ Edit"
              >
                <span className="sm:hidden">E</span>
                <span className="hidden sm:inline">Edit</span>
              </button>
              <button
                onClick={() => setMode('beta')}
                className={`px-2 sm:px-3 py-1 rounded-md text-[11px] font-bold transition-all flex items-center gap-1 ${mode === 'beta' ? 'bg-[#5D4037] text-white shadow-xs' : 'text-[#5D4037] hover:text-[#3E2723]'}`}
                title="Chế độ Beta"
              >
                <span className="sm:hidden">B</span>
                <span className="hidden sm:inline">Beta</span>
              </button>
            </div>

            <button
              onClick={handleManualSyncToFirestore}
              disabled={isSyncingToCloud}
              className={`flex items-center gap-1.5 text-[10px] font-semibold px-2.5 py-1 rounded-full border transition-all shadow-2xs ${
                isSyncingToCloud
                  ? 'bg-amber-50 text-amber-800 border-amber-300 animate-pulse'
                  : !currentUser
                  ? 'bg-white/80 hover:bg-white text-[#8D6E63] border-[#D7CCC8]'
                  : hasUnsyncedChanges
                  ? 'bg-[#FFF3E0] hover:bg-[#FFE0B2] text-[#E65100] border-[#FFB74D] shadow-xs ring-1 ring-amber-400/50'
                  : 'bg-white hover:bg-[#FAF6F0] text-[#5D4037] hover:text-[#3E2723] border-[#D7CCC8]'
              }`}
              title={
                !currentUser
                  ? "Đăng nhập tài khoản để bật đồng bộ 2 chiều với Firestore"
                  : hasUnsyncedChanges
                  ? "Bạn có thay đổi chưa đồng bộ 2 chiều với Firestore! Nhấn để đồng bộ ngay"
                  : "Nhấn để đồng bộ 2 chiều giữa máy và Firestore"
              }
            >
              {isSyncingToCloud ? (
                <>
                  <Loader2 size={12} className="animate-spin text-amber-700" />
                  <span>Đang đồng bộ...</span>
                </>
              ) : !currentUser ? (
                <>
                  <RefreshCw size={12} className="text-[#8D6E63]" />
                  <span>Đồng bộ Firestore</span>
                </>
              ) : hasUnsyncedChanges ? (
                <>
                  <RefreshCw size={12} className="text-[#E65100]" />
                  <span className="font-bold">Đồng bộ Firestore</span>
                  <span className="w-1.5 h-1.5 rounded-full bg-[#E65100] animate-ping" />
                </>
              ) : (
                <>
                  <RefreshCw size={12} className="text-[#5D4037]" />
                  <span>Đồng bộ Firestore</span>
                </>
              )}
            </button>
          </div>
          
          {/* RIGHT CONTROLS */}
          <div className="flex flex-wrap items-center gap-1.5 sm:gap-2">
              <button
                onClick={() => setShowMobileSidebar(true)}
                className="lg:hidden flex items-center justify-center text-[#5D4037] hover:text-[#3E2723] bg-white hover:bg-[#FAF6F0] p-2 sm:px-2.5 sm:py-1 rounded-full border border-[#D7CCC8] shadow-2xs transition-colors"
                title="Kho Từ vựng"
              >
                 <BookA size={14} />
              </button>

              <button
                onClick={() => setShowMobileWorldInfo(true)}
                className="xl:hidden flex items-center justify-center text-[#5D4037] hover:text-[#3E2723] bg-white hover:bg-[#FAF6F0] p-2 sm:px-2.5 sm:py-1 rounded-full border border-[#D7CCC8] shadow-2xs transition-colors"
                title="Bảng Nhân vật & Thiết lập"
              >
                 <Users size={14} />
              </button>

              <NovelSelector 
                currentNovelId={session.currentNovelId || ''} 
                onSelectNovel={handleSelectNovel}
                onCreateNovel={handleCreateNovel}
                onRenameNovel={handleRenameNovel}
                onDeleteNovel={handleDeleteNovel}
                novels={novels}
                onNovelsChange={setNovels}
              />
              <button 
                onClick={() => setShowShortcuts(true)} 
                className={`flex items-center gap-1.5 text-[10px] font-medium px-2.5 py-1 rounded-full border transition-colors shadow-2xs ${
                  shortcutsEnabled 
                    ? 'text-[#5D4037] hover:text-[#3E2723] bg-white hover:bg-[#FAF6F0] border-[#D7CCC8]' 
                    : 'text-[#8D6E63] hover:text-[#3E2723] bg-white/60 border-[#D7CCC8]'
                }`}
                title="Bảng gõ tắt (Auto-replace)"
              >
                 <Keyboard size={12} />
                 <span className="hidden sm:inline">Gõ tắt</span>
                 {shortcuts.length > 0 && (
                   <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-mono font-bold ${shortcutsEnabled ? 'bg-[#EFEBE9] text-[#5D4037]' : 'bg-gray-200 text-gray-500'}`}>
                     {shortcuts.filter(s => s.enabled).length}
                   </span>
                 )}
              </button>
              <button 
                onClick={() => setShowFontModal(true)} 
                className="flex items-center gap-1.5 text-[10px] font-medium text-[#5D4037] hover:text-[#3E2723] bg-white hover:bg-[#FAF6F0] px-2 sm:px-2.5 py-1 rounded-full border border-[#D7CCC8] shadow-2xs transition-colors"
                title="Đổi phông chữ hiển thị toàn ứng dụng"
              >
                 <Type size={12} />
                 <span className="hidden sm:inline">Phông chữ</span>
              </button>
              <button onClick={() => setShowChapters(true)} className="flex items-center gap-1.5 text-[10px] font-medium text-[#5D4037] hover:text-[#3E2723] bg-white hover:bg-[#FAF6F0] px-2 sm:px-2.5 py-1 rounded-full border border-[#D7CCC8] shadow-2xs transition-colors">
                 <FolderOpen size={12} />
                 <span className="hidden sm:inline">Kho chương</span>
                 <span>({currentNovelChapters.length})</span>
              </button>
              <button onClick={() => setShowHistory(true)} className="flex items-center gap-1.5 text-[10px] font-medium text-[#5D4037] hover:text-[#3E2723] bg-white hover:bg-[#FAF6F0] px-2 py-1 rounded-full border border-[#D7CCC8] shadow-2xs transition-colors">
                 <History size={12} />
                 <span className="hidden sm:inline">Lịch sử</span>
              </button>

              <AuthPanel
                onApplyCloudRecovery={handleApplyCloudRecovery}
                onApplyLocalSelection={handleApplyLocalSelection}
              />
          </div>
        </header>

      {/* MAIN WORKSPACE */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* LEFT SIDEBAR (Desktop / Laptop) */}
        <div className={`w-80 shrink-0 ${isFocusMode ? 'hidden' : 'hidden lg:block'} border-r border-[#D7CCC8] bg-[#EFE5D9]`}>
            <DictionarySidebar 
                currentNovelId={session.currentNovelId || ''}
                terms={currentNovelTerms} 
                onExportExcel={handleExportExcel} 
                onUpdateTerms={handleUpdateTerms} 
                sheetUrl={session.sheetUrl} 
                onUpdateSheetUrl={(url) => updateSession({ sheetUrl: url })} 
                refreshTrigger={vpLoaded}
            />
        </div>

        {/* MOBILE / TABLET SLIDE-OVER DRAWER FOR DICTIONARY */}
        {showMobileSidebar && createPortal(
          <div className={`fixed inset-0 z-50 flex ${isFocusMode ? '' : 'lg:hidden'} animate-in fade-in duration-150`}>
            <div 
              className="fixed inset-0 bg-black/50 transition-opacity" 
              onClick={() => setShowMobileSidebar(false)} 
            />
            <div className={`relative w-80 max-w-[85vw] h-full shadow-2xl z-10 flex flex-col animate-in slide-in-from-left duration-200 bg-[#EFE5D9]`}>
              <div className={`flex items-center justify-between p-2.5 border-b bg-[#EFE5D9] text-[#3E2723] border-[#D7CCC8]`}>
                <span className={`text-xs font-bold flex items-center gap-1.5 text-[#3E2723]`}>
                  <BookA size={14} className="text-[#5D4037]" /> Kho từ vựng
                </span>
                <button 
                  onClick={() => setShowMobileSidebar(false)}
                  className={`p-1 rounded-md transition-colors text-[#5D4037] hover:text-[#3E2723] hover:bg-[#D7CCC8]/50`}
                >
                  <X size={16} />
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                <DictionarySidebar 
                    currentNovelId={session.currentNovelId || ''}
                    terms={currentNovelTerms} 
                    onExportExcel={handleExportExcel} 
                    onUpdateTerms={handleUpdateTerms} 
                    sheetUrl={session.sheetUrl} 
                    onUpdateSheetUrl={(url) => updateSession({ sheetUrl: url })} 
                    refreshTrigger={vpLoaded}
                />
              </div>
            </div>
          </div>,
          document.body
        )}

        <main className={`flex-1 flex flex-col h-full overflow-hidden min-w-0 bg-[#F5E6D3]`}>
          <div className={`flex-1 ${isFocusMode ? 'h-full flex flex-col p-2 sm:p-3 overflow-hidden' : 'overflow-y-auto overflow-x-hidden scroll-smooth scrollbar-thin scrollbar-thumb-[#D7CCC8] scrollbar-track-transparent'}`}>
             <div className={`flex flex-col ${isFocusMode ? 'h-full flex-1 min-h-0' : 'px-2 pb-2'}`}>
                
                {/* INPUT AREA */}
                {!isFocusMode && (
                  <div className={`mt-2 overflow-hidden transition-all mb-2 flex flex-col ${
                    'bg-white rounded-xl shadow-sm border border-[#D7CCC8] focus-within:ring-2 focus-within:ring-[#8D6E63]/20 focus-within:border-[#8D6E63]/50'
                  }`}>
                      <div className={`flex flex-col sm:flex-row sm:justify-between sm:items-center px-2.5 sm:px-3 py-1.5 border-b gap-1.5 sm:gap-2 ${
                        'bg-[#EFEBE9]/50 border-[#EFEBE9]'
                      }`}>
                          {/* Hàng 1 trên mobile / Bên trái trên desktop */}
                          <div className="flex items-center justify-between sm:justify-start gap-2">
                              <div className={`flex items-center gap-1 text-[10px] font-bold shrink-0 whitespace-nowrap ${
                                'text-[#8D6E63]'
                              }`}>
                                  <Layers size={11} />
                                  <span>{segmentCount} đoạn văn</span>
                              </div>
                              <label 
                                  title="Tự động lọc bỏ các dòng trống khi dán nội dung vào ô Raw, VietTrans, Edit" 
                                  className={`sm:hidden text-[10px] px-1.5 py-0.5 rounded flex items-center gap-1.5 cursor-pointer select-none shrink-0 whitespace-nowrap ${
                                    'text-[#5D4037] hover:text-[#3E2723] hover:bg-[#D7CCC8]/60'
                                  }`}
                              >
                                  <input 
                                      type="checkbox" 
                                      checked={autoCleanBlankLines} 
                                      onChange={(e) => setAutoCleanBlankLines(e.target.checked)} 
                                      className={`w-3.5 h-3.5 rounded focus:ring-0 cursor-pointer ${
                                        'text-[#5D4037]'
                                      }`}
                                  />
                                  <span>Tự xóa dòng trống</span>
                              </label>
                          </div>

                          {/* Hàng 2 trên mobile / Bên phải trên desktop */}
                          <div className="flex items-center justify-end gap-1.5 sm:gap-2 overflow-x-auto scrollbar-none">
                              <label 
                                  title="Tự động lọc bỏ các dòng trống khi dán nội dung vào ô Raw, VietTrans, Edit" 
                                  className={`hidden sm:flex text-[10px] px-1.5 py-1 rounded items-center gap-1 cursor-pointer select-none shrink-0 whitespace-nowrap ${
                                    'text-[#5D4037] hover:text-[#3E2723] hover:bg-[#D7CCC8]/60'
                                  }`}
                              >
                                  <input 
                                      type="checkbox" 
                                      checked={autoCleanBlankLines} 
                                      onChange={(e) => setAutoCleanBlankLines(e.target.checked)} 
                                      className={`w-3 h-3 rounded focus:ring-0 cursor-pointer ${
                                        'text-[#5D4037]'
                                      }`}
                                  />
                                  <span>Tự xóa dòng trống</span>
                              </label>
                              <button 
                                  onClick={handleCleanAllBlankLines} 
                                  disabled={!session.inputText && !session.deeplText && !session.preEditedText} 
                                  title="Lọc bỏ toàn bộ dòng trống trong tất cả các ô nhập" 
                                   className="text-[10px] px-2 py-1 rounded flex items-center gap-1 disabled:opacity-40 shrink-0 whitespace-nowrap transition-colors text-[#8D6E63] hover:text-[#3E2723] hover:bg-[#D7CCC8] bg-[#EFEBE9]/60 sm:bg-transparent"
                              >
                                  <Scissors size={11} /> <span>Xóa dòng trống</span>
                              </button>
                              <button 
                                  onClick={handleClearSession} 
                                  disabled={!session.inputText && !session.deeplText && !session.preEditedText} 
                                   className="text-[10px] px-2 py-1 rounded flex items-center gap-1 disabled:opacity-40 shrink-0 whitespace-nowrap transition-colors text-[#8D6E63] hover:text-[#3E2723] hover:bg-[#D7CCC8] bg-[#EFEBE9]/60 sm:bg-transparent"
                              >
                                  <Eraser size={11} /> <span>Xóa</span>
                              </button>
                          </div>
                      </div>

                      <div className={`grid ${mode === 'beta' ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'} flex-1 min-h-[140px] divide-y sm:divide-y-0 sm:divide-x ${
                        'divide-[#EFEBE9]'
                      }`}>
                          <div className="flex flex-col flex-1">
                              <div className={`flex justify-between items-center px-3 pt-1.5 pb-1 ${'bg-[#FAFAFA]/40'}`}>
                                  <div className={`text-[9px] font-bold uppercase tracking-wider ${'text-[#8D6E63]'}`}>1. Raw</div>
                                  <button
                                      type="button"
                                      onClick={() => handleCleanFieldBlankLines('inputText')}
                                      disabled={!session.inputText}
                                      title="Xóa các dòng trống trong ô Raw"
                                      className={`text-[9px] px-1.5 py-0.5 rounded flex items-center gap-1 disabled:opacity-40 transition-colors ${
                                        'text-[#8D6E63] hover:text-[#3E2723] hover:bg-[#EFEBE9]'
                                      }`}
                                  >
                                      <Scissors size={9} /> Dọn dòng trống
                                  </button>
                              </div>
                              <textarea
                                  ref={textareaRef}
                                  value={session.inputText}
                                  onChange={(e) => handleInputChange({ inputText: e.target.value })}
                                  onPaste={(e) => handlePasteWithClean(e, 'inputText')}
                                  onKeyDown={(e) => {
                                      handleSmartQuotesKeyDown(e, (newVal) => handleInputChange({ inputText: newVal }));
                                  }}
                                  placeholder="Nhập Raw..."
                                  className={`flex-1 p-3 text-lg font-serif-sc bg-transparent border-none outline-none resize-none leading-relaxed ${
                                    'text-[#3E2723] placeholder:text-[#BCAAA4]'
                                  }`}
                                  spellCheck="false"
                              />
                          </div>
                          <div className="flex flex-col flex-1">
                              <div className={`flex justify-between items-center px-3 pt-1.5 pb-1 ${'bg-[#FAFAFA]/40'}`}>
                                  <div className={`text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                                    'text-[#8D6E63]'
                                  }`}>
                                      <a 
                                          href="https://vietnamese-translation.com/chinese-traditional-to-vietnamese.aspx" 
                                          target="_blank" 
                                          rel="noopener noreferrer"
                                          className={`hover:underline flex items-center gap-1 transition-colors group/vt ${
                                            'text-[#8D6E63] hover:text-[#3E2723]'
                                          }`}
                                          title="Bấm để mở trang web dịch vietnamese-translation.com trong tab mới"
                                      >
                                          <span>2. VietTrans</span>
                                          <ExternalLink size={10} className="group-hover/vt:translate-x-0.5 transition-transform" />
                                      </a>
                                      {mode === 'beta' && <span className={`text-[8px] font-normal lowercase ${'text-[#BCAAA4]'}`}>(không bắt buộc)</span>}
                                  </div>
                                  <button
                                      type="button"
                                      onClick={() => handleCleanFieldBlankLines('deeplText')}
                                      disabled={!session.deeplText}
                                      title="Xóa các dòng trống trong ô VietTrans"
                                      className={`text-[9px] px-1.5 py-0.5 rounded flex items-center gap-1 disabled:opacity-40 transition-colors ${
                                        'text-[#8D6E63] hover:text-[#3E2723] hover:bg-[#EFEBE9]'
                                      }`}
                                  >
                                      <Scissors size={9} /> Dọn dòng trống
                                  </button>
                              </div>
                              <textarea
                                  value={session.deeplText}
                                  onChange={(e) => handleInputChange({ deeplText: e.target.value })}
                                  onPaste={(e) => handlePasteWithClean(e, 'deeplText')}
                                  onKeyDown={(e) => {
                                      if (handleSmartQuotesKeyDown(e, (newVal) => handleInputChange({ deeplText: newVal }))) {
                                          return;
                                      }
                                      const triggerKeys = [' ', 'Enter', 'Tab', ',', '.', '?', '!', ';', ':'];
                                      if (triggerKeys.includes(e.key)) {
                                          const triggerChar = e.key === 'Tab' ? '\t' : (e.key === 'Enter' ? '\n' : e.key);
                                          const { replaced, newText } = checkAndApplyShortcut(e.currentTarget, shortcuts, triggerChar);
                                          if (replaced) {
                                              e.preventDefault();
                                              handleInputChange({ deeplText: newText });
                                          }
                                      }
                                  }}
                                  placeholder="Dán VietTrans (hoặc web dịch) vào đây..."
                                  className={`flex-1 p-3 text-sm bg-transparent border-none outline-none resize-none leading-relaxed ${
                                    'text-[#3E2723] placeholder:text-[#BCAAA4]'
                                  }`}
                                  spellCheck="false"
                              />
                          </div>
                          {mode === 'beta' && (
                              <div className="flex flex-col flex-1">
                                  <div className={`flex justify-between items-center px-3 pt-1.5 pb-1 ${'bg-[#FAFAFA]/40'}`}>
                                      <div className={`text-[9px] font-bold uppercase tracking-wider flex items-center gap-1 ${
                                        'text-[#E64A19]'
                                      }`}>
                                        3. Edit sẵn <span className={`text-white text-[7px] px-1 rounded-full uppercase ${'bg-[#E64A19]'}`}>Beta</span>
                                      </div>
                                      <button
                                          type="button"
                                          onClick={() => handleCleanFieldBlankLines('preEditedText')}
                                          disabled={!session.preEditedText}
                                          title="Xóa các dòng trống trong ô Edit sẵn"
                                          className={`text-[9px] px-1.5 py-0.5 rounded flex items-center gap-1 disabled:opacity-40 transition-colors ${
                                            'text-[#E64A19] hover:text-[#BF360C] hover:bg-[#FBE9E7]'
                                          }`}
                                      >
                                          <Scissors size={9} /> Dọn dòng trống
                                      </button>
                                  </div>
                                  <textarea
                                      value={session.preEditedText || ''}
                                      onChange={(e) => handleInputChange({ preEditedText: e.target.value })}
                                      onPaste={(e) => handlePasteWithClean(e, 'preEditedText')}
                                      onKeyDown={(e) => {
                                          if (handleSmartQuotesKeyDown(e, (newVal) => handleInputChange({ preEditedText: newVal }))) {
                                              return;
                                          }
                                          const triggerKeys = [' ', 'Enter', 'Tab', ',', '.', '?', '!', ';', ':'];
                                          if (triggerKeys.includes(e.key)) {
                                              const triggerChar = e.key === 'Tab' ? '\t' : (e.key === 'Enter' ? '\n' : e.key);
                                              const { replaced, newText } = checkAndApplyShortcut(e.currentTarget, shortcuts, triggerChar);
                                              if (replaced) {
                                                  e.preventDefault();
                                                  handleInputChange({ preEditedText: newText });
                                              }
                                          }
                                      }}
                                      placeholder="Dán edit sẵn vào đây..."
                                      className={`flex-1 p-3 text-sm bg-transparent border-none outline-none resize-none leading-relaxed font-medium ${
                                        'text-[#4E342E] placeholder:text-[#BCAAA4]'
                                      }`}
                                      spellCheck="false"
                                  />
                              </div>
                          )}
                      </div>

                      <div className={`flex justify-between items-center p-2.5 border-t ${
                        'bg-[#FAFAFA] border-[#EFEBE9]'
                      }`}>
                          <div className="flex items-center gap-4">
                              <div className={`text-[10px] font-medium transition-colors ${
                                'text-[#A1887F]'
                              }`}>
                                  {session.inputText.length} ký tự
                              </div>
                          </div>
                          <button
                              onClick={() => handleTranslate(false)}
                              disabled={session.status === AppStatus.LOADING || !session.inputText.trim()}
                               className="px-4 py-1.5 rounded text-xs font-semibold flex items-center gap-1.5 transition-colors shadow-2xs bg-[#3E2723] text-[#FFECB3] hover:bg-[#4E342E] disabled:bg-[#A1887F] disabled:cursor-not-allowed"
                          >
                              {session.status === AppStatus.LOADING ? (<><Loader2 className="animate-spin" size={13} /> Phân tích...</>) : 'Phân tích'}
                          </button>
                      </div>
                  </div>
                )}

                {/* ERROR */}
                {session.status === AppStatus.ERROR && (
                    <div className="bg-red-50 border border-red-200 rounded-lg p-3 text-red-800 text-sm flex gap-3 items-start shrink-0 mb-6">
                        <AlertTriangle className="shrink-0 text-red-600" size={16} /> 
                        <div className="flex-1"><p className="font-bold mb-1">Đã xảy ra lỗi:</p><p className="opacity-90 leading-relaxed whitespace-pre-wrap">{session.error}</p></div>
                    </div>
                )}

                {/* RESULT */}
                {(session.result && (session.status === AppStatus.SUCCESS || session.status === AppStatus.LOADING)) ? (
                    <div className={isFocusMode ? "h-full flex-1 flex flex-col min-h-0" : "sticky top-2 z-10"}>
                        <div className={isFocusMode ? "h-full flex-1 min-h-0" : "h-[calc(100vh-4.5rem)]"}>
                            <TranslationOutput 
                                data={session.result} 
                                customTerms={currentNovelTerms} 
                                characters={currentNovelCharacters} 
                                completedSegments={session.completedSegments || []}
                                onUpdateSegment={handleUpdateSegment} 
                                onUpdateAllSegments={handleUpdateAllSegments}
                                onUpdateSegmentField={handleUpdateSegmentField}
                                onDeleteSegment={handleDeleteSegment}
                                onToggleComplete={handleToggleComplete}
                                onSaveChapter={handleSaveChapter}
                                onUndo={handleUndo}
                                onRedo={handleRedo}
                                canUndo={undoStack.length > 0}
                                canRedo={redoStack.length > 0}
                                isFocusMode={isFocusMode}
                                onToggleFocusMode={() => setIsFocusMode(!isFocusMode)}
                                currentNovelId={session.currentNovelId}
                                currentChapterId={session.currentChapterId}
                                currentChapterName={chapters.find(c => c.id === session.currentChapterId)?.name}
                                chaptersCount={currentNovelChapters.length}
                                onUpdateTerms={handleUpdateTerms}
                                onUpdateCharacters={handleUpdateCharacters}
                                onOpenVocab={() => setShowMobileSidebar(true)}
                                onOpenWorldInfo={() => setShowMobileWorldInfo(true)}
                                onRestoreSegments={handleRestoreSegments}
                            />
                        </div>
                    </div>
                ) : (
                    session.status === AppStatus.IDLE && (
                        <div className={`flex flex-col items-center justify-center py-12 ${
                          'border-2 border-dashed border-[#D7CCC8] rounded-xl text-[#BCAAA4]'
                        }`}>
                            <Layout size={32} className="mb-2 opacity-50"/>
                            <p className="text-xs">Khu vực hiển thị kết quả dịch</p>
                        </div>
                    )
                )}
             </div>
          </div>
        </main>

        {/* RIGHT SIDEBAR (Desktop / Laptop) */}
        <div className={`w-[360px] shrink-0 ${isFocusMode ? 'hidden' : 'hidden xl:block'} border-l border-[#D7CCC8] bg-[#EFE5D9]`}>
            <WorldInfoPanel 
                currentNovelId={session.currentNovelId || ''}
                characters={currentNovelCharacters} 
                onUpdateCharacters={handleUpdateCharacters} 
                relationships={currentNovelRelationships} 
                onUpdateRelationships={handleUpdateRelationships} 
                notes={session.notes} 
                onUpdateNotes={(val) => updateSession({ notes: val })} 
                sheetUrl={session.sheetUrl} 
                onUpdateSheetUrl={(url) => updateSession({ sheetUrl: url })}
            />
        </div>

        {/* MOBILE / TABLET SLIDE-OVER DRAWER FOR WORLD INFO & CHARACTERS */}
        {showMobileWorldInfo && createPortal(
          <div className={`fixed inset-0 z-50 flex justify-end ${isFocusMode ? '' : 'xl:hidden'} animate-in fade-in duration-150`}>
            <div 
              className="fixed inset-0 bg-black/50 transition-opacity" 
              onClick={() => setShowMobileWorldInfo(false)} 
            />
            <div className="relative w-96 max-w-[92vw] bg-[#EFE5D9] h-full shadow-2xl z-10 flex flex-col animate-in slide-in-from-right duration-200">
              <div className="flex items-center justify-between p-2.5 bg-[#EFE5D9] text-[#3E2723] border-b border-[#D7CCC8]">
                <span className="text-xs font-bold text-[#3E2723] flex items-center gap-1.5">
                  <Users size={14} className="text-[#5D4037]" /> Nhân vật & Thiết lập
                </span>
                <button 
                  onClick={() => setShowMobileWorldInfo(false)}
                  className="p-1 rounded-md text-[#5D4037] hover:text-[#3E2723] hover:bg-[#D7CCC8]/50 transition-colors"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                <WorldInfoPanel 
                    currentNovelId={session.currentNovelId || ''}
                    characters={currentNovelCharacters} 
                    onUpdateCharacters={handleUpdateCharacters} 
                    relationships={currentNovelRelationships} 
                    onUpdateRelationships={handleUpdateRelationships} 
                    notes={session.notes} 
                    onUpdateNotes={(val) => updateSession({ notes: val })} 
                    sheetUrl={session.sheetUrl} 
                    onUpdateSheetUrl={(url) => updateSession({ sheetUrl: url })}
                />
              </div>
            </div>
          </div>,
          document.body
        )}
      </div>

      <HistoryModal isOpen={showHistory} onClose={() => setShowHistory(false)} history={history} onSelect={handleRestoreHistory} onDelete={deleteHistoryItem} onClearAll={() => setHistory([])} />

      <ChapterArchiveModal 
        isOpen={showChapters} 
        onClose={() => setShowChapters(false)} 
        chapters={currentNovelChapters} 
        customTerms={currentNovelTerms} 
        onSelectChapter={handleRestoreChapter} 
        onDeleteChapter={handleDeleteChapter} 
        onRenameChapter={handleRenameChapter} 
        onClearAll={handleClearAllChapters} 
      />

      <ShortcutModal 
        isOpen={showShortcuts} 
        onClose={() => setShowShortcuts(false)} 
        currentNovelId={session.currentNovelId || ''}
        onSelectNovel={(id) => updateSession({ currentNovelId: id })}
      />

      <FontSelectorModal
        isOpen={showFontModal}
        onClose={() => setShowFontModal(false)}
      />

      {/* HỘP THOẠI NHẮC NHỞ ĐỒNG BỘ KHI ĐỊNH ĐÓNG TAB / THOÁT APP */}
      {showLeaveSyncModal && hasUnsyncedChanges && createPortal(
        <div className="fixed inset-0 z-[110] flex items-center justify-center p-4">
          <div className="fixed inset-0 bg-black/50" onClick={() => setShowLeaveSyncModal(false)} />
          <div className="relative bg-[#FAFAFA] border border-[#FFB74D] rounded-xl shadow-2xl w-full max-w-md overflow-hidden z-10 animate-in zoom-in-95 duration-150 text-[#3E2723]">
            <div className="bg-[#FFF3E0] px-5 py-3.5 flex items-center justify-between border-b border-[#FFE0B2]">
              <div className="flex items-center gap-2 text-[#E65100] font-bold text-xs tracking-wide uppercase">
                <AlertTriangle size={16} className="shrink-0" />
                <span>Chưa đồng bộ Firestore</span>
              </div>
              <button
                type="button"
                onClick={() => setShowLeaveSyncModal(false)}
                className="text-[#8D6E63] hover:text-[#3E2723] p-1 rounded-md transition-colors cursor-pointer"
              >
                <X size={16} />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <p className="text-xs text-[#4E342E] leading-relaxed">
                Bạn vừa chỉnh sửa dữ liệu trên máy nhưng <strong>chưa nhấn Đồng bộ Firestore</strong>. Nếu bạn đóng tab, thoát ứng dụng hoặc tắt máy lúc này, phần thay đổi mới nhất sẽ chưa được lưu lên tài khoản đám mây.
              </p>

              <div className="flex flex-col sm:flex-row gap-2 pt-1">
                <button
                  type="button"
                  onClick={handleManualSyncToFirestore}
                  disabled={isSyncingToCloud}
                  className="flex-1 bg-[#E65100] hover:bg-[#BF360C] text-white py-2.5 px-4 rounded-lg font-bold text-xs shadow-sm transition-colors flex items-center justify-center gap-2 disabled:opacity-50 cursor-pointer"
                >
                  {isSyncingToCloud ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                  <span>{isSyncingToCloud ? 'Đang đồng bộ...' : 'Đồng bộ Firestore ngay'}</span>
                </button>
                <button
                  type="button"
                  onClick={() => setShowLeaveSyncModal(false)}
                  className="px-4 py-2.5 rounded-lg border border-[#D7CCC8] bg-white hover:bg-[#FAF6F0] text-[#5D4037] font-bold text-xs transition-colors cursor-pointer"
                >
                  Để sau
                </button>
              </div>
            </div>
          </div>
        </div>,
        document.body
      )}

      {/* THÔNG BÁO TRẠNG THÁI ĐỒNG BỘ FIRESTORE */}
      {syncToastMessage && (
        <div 
          className="fixed bottom-4 right-4 z-50 flex items-center gap-2 px-3.5 py-2.5 rounded-lg shadow-xl text-xs font-medium animate-in fade-in slide-in-from-bottom-2 duration-200 border bg-white"
          style={{
            borderColor: syncToastMessage.type === 'error' ? '#EF9A9A' : syncToastMessage.type === 'info' ? '#90CAF9' : '#A5D6A7',
            color: syncToastMessage.type === 'error' ? '#C62828' : syncToastMessage.type === 'info' ? '#1565C0' : '#2E7D32'
          }}
        >
          {syncToastMessage.type === 'error' ? (
            <AlertTriangle size={15} className="shrink-0 text-[#C62828]" />
          ) : syncToastMessage.type === 'info' ? (
            <Loader2 size={15} className="shrink-0 animate-spin text-[#1565C0]" />
          ) : (
            <CheckCircle2 size={15} className="shrink-0 text-[#2E7D32]" />
          )}
          <span>{syncToastMessage.text}</span>
          <button 
            onClick={() => setSyncToastMessage(null)} 
            className="ml-2 opacity-60 hover:opacity-100 transition-opacity"
          >
            <X size={13} />
          </button>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}