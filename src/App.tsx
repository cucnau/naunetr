
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { AppStatus, TranslationSession, HistoryItem, TranslationResponse, Chapter } from './types';
import { exportToExcel } from './services/excelService';
import { getNovels, getChaptersFromCloud, saveChapterToCloud, bulkSaveChaptersToCloud, deleteChapterFromCloud, clearNovelChaptersFromCloud, syncFirestoreData, subscribeToChapters, subscribeToUserLiveWorkspace, saveUserLiveWorkspaceToCloud, getDeviceId } from './services/firestoreService';
import { auth } from './services/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { vietphraseEngine } from './services/vietphraseService';
import { db } from './services/db'; // Import db service
import { TranslationOutput } from './components/TranslationOutput';
import { DictionarySidebar } from './components/DictionarySidebar';
import { WorldInfoPanel } from './components/WorldInfoPanel';
import { HistoryModal } from './components/HistoryModal'; 
import { ChapterArchiveModal } from './components/ChapterArchiveModal';
import { ShortcutModal } from './components/ShortcutModal';
import { AuthPanel } from './components/AuthPanel';
import { NovelSelector } from './components/NovelSelector';
import { BookOpen, Loader2, Eraser, Quote, Layout, History, AlertTriangle, Layers, PenLine, FolderOpen, Keyboard, BookA, Users, X, Wifi } from 'lucide-react';
import { checkAndApplyShortcut, getStoredShortcuts, isShortcutsEnabled, syncShortcutsFromCloud } from './services/shortcutService';

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

// Hàm căn lề bản dịch (nhất là GG Translate thường xuyên gộp đoạn)
const alignTranslation = (rawLines: string[], translation: string): string[] => {
    if (!translation.trim()) return new Array(rawLines.length).fill("");
    
    const tLines = translation.split('\n').map(l => l.trim()).filter(l => l);
    const rLinesWithIndices = rawLines.map((l, i) => ({ text: l.trim(), index: i }));
    const validRLines = rLinesWithIndices.filter(l => l.text);
    
    const result = new Array(rawLines.length).fill("");
    if (validRLines.length === 0 || tLines.length === 0) return result;
    
    // TRƯỜNG HỢP 1: Bản dịch dán vào đã có cấu trúc phân dòng tốt (số dòng dịch dán vào nhiều hoặc gần bằng số dòng raw)
    // Ta ưu tiên map 1-1 theo dòng gốc để giữ nguyên vẹn cấu trúc xuống dòng cực chuẩn của người dùng dán vào
    if (tLines.length === validRLines.length || Math.abs(tLines.length - validRLines.length) <= 1 && tLines.length >= validRLines.length * 0.9) {
        let tIdx = 0;
        validRLines.forEach((rLine, i) => {
            if (tIdx < tLines.length) {
                // Nếu đây là dòng cuối cùng, gom hết các dòng dịch dán vào còn thừa (nếu có)
                if (i === validRLines.length - 1) {
                    result[rLine.index] = tLines.slice(tIdx).join(" ");
                } else {
                    result[rLine.index] = tLines[tIdx++];
                }
            }
        });
        return result;
    }
    
    // TRƯỜNG HỢP 2: Bản dịch thực sự bị dính cục (ví dụ chỉ có 1 hoặc 2 dòng dính liền, trong khi raw có nhiều dòng)
    // Lúc này mới áp dụng thuật toán tách câu thông minh dựa trên tỷ lệ độ dài ký tự của dòng gốc
    const translationText = tLines.join(" ");
    // Tách thành các câu bằng regex mạnh mẽ hỗ trợ cả dấu câu dịch tiếng Trung lẫn tiếng Việt
    const sentences = translationText.match(/[^.!?。！？]+(?:[.!?。！？]+(?:['"”\] \t])*?|(?=\s*$))/g) || [translationText];
    const cleanSentences = sentences.map(s => s.trim()).filter(s => s);
    
    if (cleanSentences.length === 0) return result;
    
    // Tính toán trọng số dựa trên độ dài ký tự thô của dòng gốc (bỏ dấu cách và dấu câu Trung)
    const rawCleanLengths = validRLines.map(r => {
        const cleanText = r.text.replace(/[\s\p{P}]/gu, '');
        return cleanText.length || 1;
    });
    
    const totalRawLength = rawCleanLengths.reduce((sum, l) => sum + l, 0) || 1;
    const targetProportions = rawCleanLengths.map(l => l / totalRawLength);
    
    // Tổng chiều dài ký tự tiếng Việt đã dịch
    const totalTransLength = cleanSentences.reduce((sum, s) => sum + s.length, 0) || 1;
    
    let sentenceIdx = 0;
    
    validRLines.forEach((rLine, i) => {
        // Dòng cuối cùng nhận toàn bộ những câu còn lại
        if (i === validRLines.length - 1) {
            const assigned = cleanSentences.slice(sentenceIdx);
            result[rLine.index] = assigned.join(" ");
            return;
        }
        
        const lineTarget = totalTransLength * targetProportions[i];
        const lineSentences: string[] = [];
        let currentLineLength = 0;
        
        while (sentenceIdx < cleanSentences.length) {
            const sentence = cleanSentences[sentenceIdx];
            
            // Bắt buộc lấy ít nhất 1 câu đầu tiên cho dòng này để tránh bị trống dòng vô lý
            if (lineSentences.length === 0) {
                lineSentences.push(sentence);
                currentLineLength += sentence.length;
                sentenceIdx++;
                continue;
            }
            
            // RÀO CHẮN BẢO VỆ: Đảm bảo chừa đủ số câu tối thiểu cho các dòng còn lại tiếp theo
            const remainingSentencesAfterThis = cleanSentences.length - sentenceIdx - 1;
            const remainingLinesAfterThis = validRLines.length - 1 - i;
            if (remainingSentencesAfterThis < remainingLinesAfterThis) {
                break;
            }
            
            // Tính khoảng cách tới độ dài mục tiêu để quyết định xem có nên lấy câu này không
            const distWithout = Math.abs(lineTarget - currentLineLength);
            const distWith = Math.abs(lineTarget - (currentLineLength + sentence.length));
            
            if (distWith > distWithout) {
                // cân bằng tối ưu hơn nếu dừng trước khi lấy câu này
                break;
            }
            
            lineSentences.push(sentence);
            currentLineLength += sentence.length;
            sentenceIdx++;
        }
        
        result[rLine.index] = lineSentences.join(" ");
    });
    
    return result;
};

const sanitizeResult = (result: TranslationResponse | null): TranslationResponse | null => {
    if (!result) return null;
    try {
        return {
            ...result,
            segments: (result.segments || []).map(s => ({
                source: (s.source || "").trim(),
                natural: (s.natural || "").trim().replace(/\n+$/, ""),
                quick: (s.quick || "").trim().replace(/\n+$/, ""),
                deepl: (s.deepl || "").trim().replace(/\n+$/, "")
            })),
            naturalTranslation: (result.naturalTranslation || "").trim().replace(/\n+$/, ""),
            quickTrans: (result.quickTrans || "").trim().replace(/\n+$/, ""),
            deeplTranslation: (result.deeplTranslation || "").trim().replace(/\n+$/, ""),
            vocabulary: result.vocabulary || []
        };
    } catch (e) {
        console.warn("Sanitize failed, keeping original", e);
        return result;
    }
};

const createNewSession = (): TranslationSession => ({
  id: 'session_main',
  name: `Bản edit`,
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
      const savedMode = localStorage.getItem('app_mode');
      return (savedMode === 'beta' || savedMode === 'edit') ? savedMode : 'edit';
    } catch (e) {
      return 'edit';
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem('app_mode', mode);
    } catch (e) {}
  }, [mode]);

  const [session, setSession] = useState<TranslationSession>(() => {
    try {
      const savedSingle = localStorage.getItem('chiVietSingleSession');
      if (savedSingle) {
          const parsed = JSON.parse(savedSingle);
          // Force customTerms empty to load from DB instead (avoid localStorage quota)
          return { ...createNewSession(), ...parsed, customTerms: [], result: sanitizeResult(parsed.result) };
      }
      return createNewSession();
    } catch (e) {
      console.error("Failed to load session", e);
      return createNewSession();
    }
  });

  const [history, setHistory] = useState<HistoryItem[]>(() => {
    try {
      const saved = localStorage.getItem('chiVietHistory');
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
  const [shortcuts, setShortcuts] = useState(() => getStoredShortcuts(session.currentNovelId));
  const [shortcutsEnabled, setShortcutsEnabled] = useState(() => isShortcutsEnabled());
  const [vpLoaded, setVpLoaded] = useState(false);

  useEffect(() => {
    setShortcuts(getStoredShortcuts(session.currentNovelId));
    if (session.currentNovelId) {
      syncShortcutsFromCloud(session.currentNovelId).then(cloudList => {
        if (cloudList) setShortcuts(cloudList);
      }).catch(console.warn);
    }
  }, [session.currentNovelId]);

  useEffect(() => {
    const handleUpdate = () => {
      setShortcuts(getStoredShortcuts(session.currentNovelId));
      setShortcutsEnabled(isShortcutsEnabled());
    };
    window.addEventListener('shortcuts_updated', handleUpdate);
    window.addEventListener('shortcuts_toggle', handleUpdate);
    return () => {
      window.removeEventListener('shortcuts_updated', handleUpdate);
      window.removeEventListener('shortcuts_toggle', handleUpdate);
    };
  }, [session.currentNovelId]);
  
  // Undo/Redo/Focus states
  const [undoStack, setUndoStack] = useState<string[][]>([]);
  const [redoStack, setRedoStack] = useState<string[][]>([]);
  const [isFocusMode, setIsFocusMode] = useState(false);
  const [lastRemoteSyncTime, setLastRemoteSyncTime] = useState<number>(0);
  const lastLocalEditTimeRef = useRef<number>(0);

  // --- REFS ---
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // --- COMPUTED ---
  const segmentCount = session.inputText.trim() ? session.inputText.split(/\n/).length : 0;

  const currentNovelChapters = useMemo(() => {
    return chapters.filter(c => c.novelId === session.currentNovelId);
  }, [chapters, session.currentNovelId]);

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

     db.getAllChapters().then(savedChapters => {
         if (savedChapters) {
             setChapters(savedChapters);
         }
     });
}, []);

  // Tự động tải và ĐỒNG BỘ THỜI GIAN THỰC (Real-time) Toàn bộ Không gian làm việc (Truyện đang chọn, Bảng edit chương kể cả chưa lưu kho)
  useEffect(() => {
    let isMounted = true;
    let unsubscribeChaptersRealtime: (() => void) | null = null;
    let unsubscribeUserLiveWorkspace: (() => void) | null = null;

    const setupRealtimeSync = async () => {
      const user = auth.currentUser;
      if (!user) return;

      try {
        // 1. LẮNG NGHE TOÀN DIỆN KHÔNG GIAN LÀM VIỆC CỦA NGƯỜI DÙNG (Active Novel + Active Editing Table)
        if (unsubscribeUserLiveWorkspace) unsubscribeUserLiveWorkspace();
        unsubscribeUserLiveWorkspace = subscribeToUserLiveWorkspace((liveData) => {
          if (!isMounted) return;

          // Chỉ áp dụng khi thay đổi đến từ THIẾT BỊ KHÁC (Laptop ⇄ Điện thoại)
          if (liveData.deviceId && liveData.deviceId !== getDeviceId()) {
            // Nếu người dùng trên thiết bị này vừa bấm gõ trong vòng 350ms, tránh giật lag con trỏ
            if (Date.now() - lastLocalEditTimeRef.current < 350) return;

            setLastRemoteSyncTime(Date.now());

            // Tự động chuyển bộ truyện nếu thiết bị khác vừa chuyển bộ truyện
            if (liveData.novelId) {
              db.saveCurrentNovelId(liveData.novelId).catch(console.error);
            }

            setSession(prev => {
              const targetNovelId = liveData.novelId || prev.currentNovelId;
              const targetChapterId = liveData.chapterId !== undefined ? (liveData.chapterId || undefined) : prev.currentChapterId;
              const targetCompleted = liveData.completedSegments !== undefined ? liveData.completedSegments : prev.completedSegments;

              let targetResult = prev.result;
              if (liveData.result !== undefined) {
                targetResult = liveData.result ? sanitizeResult(liveData.result) : null;
              } else if (liveData.segments && liveData.segments.length > 0) {
                if (prev.result) {
                  targetResult = {
                    ...prev.result,
                    segments: liveData.segments,
                    naturalTranslation: liveData.segments.map(s => s.natural).join('\n')
                  };
                }
              }

              let targetStatus = prev.status;
              if (liveData.status) {
                targetStatus = liveData.status as AppStatus;
              } else if (targetResult) {
                targetStatus = AppStatus.SUCCESS;
              } else if (liveData.inputText) {
                targetStatus = AppStatus.IDLE;
              }

              return {
                ...prev,
                currentNovelId: targetNovelId,
                currentChapterId: targetChapterId,
                inputText: liveData.inputText !== undefined ? liveData.inputText : prev.inputText,
                deeplText: liveData.deeplText !== undefined ? liveData.deeplText : prev.deeplText,
                preEditedText: liveData.preEditedText !== undefined ? liveData.preEditedText : prev.preEditedText,
                result: targetResult,
                status: targetStatus,
                completedSegments: targetCompleted
              };
            });
          }
        });

        // 2. Tải và lắng nghe thời gian thực Kho chương của bộ truyện đang chọn
        const currentNovelId = session.currentNovelId;
        if (currentNovelId) {
          const cloudChapters = await getChaptersFromCloud(currentNovelId);
          if (!isMounted) return;

          const allCurrentChapters = await db.getAllChapters();
          const localChaptersForNovel = (allCurrentChapters || []).filter(c => !c.novelId || c.novelId === currentNovelId);
          
          const cloudIds = new Set((cloudChapters || []).map(c => c.id));
          const unsynced = localChaptersForNovel.filter(c => !cloudIds.has(c.id));
          if (unsynced.length > 0) {
            const toUpload = unsynced.map(c => ({ ...c, novelId: currentNovelId }));
            await bulkSaveChaptersToCloud(toUpload);
            toUpload.forEach(c => db.saveChapter(c));
          }

          const mergedMap = new Map<string, Chapter>();
          localChaptersForNovel.forEach(c => mergedMap.set(c.id, { ...c, novelId: currentNovelId }));
          (cloudChapters || []).forEach(c => mergedMap.set(c.id, c));
          const mergedList = Array.from(mergedMap.values()).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));

          if (isMounted) {
            setChapters(prev => {
              const otherNovelsChapters = prev.filter(c => c.novelId && c.novelId !== currentNovelId);
              return [...mergedList, ...otherNovelsChapters];
            });
          }

          if (unsubscribeChaptersRealtime) unsubscribeChaptersRealtime();
          unsubscribeChaptersRealtime = subscribeToChapters(currentNovelId, (realtimeChapters) => {
            if (!isMounted) return;

            realtimeChapters.forEach(c => db.saveChapter(c));
            setChapters(prev => {
              const otherNovelsChapters = prev.filter(c => c.novelId && c.novelId !== currentNovelId);
              return [...realtimeChapters, ...otherNovelsChapters];
            });
          });
        }

      } catch (err) {
        console.error("Lỗi khởi tạo đồng bộ thời gian thực:", err);
      }
    };

    setupRealtimeSync();
    const unsubscribeAuth = onAuthStateChanged(auth, (user) => {
      if (user) setupRealtimeSync();
    });

    return () => {
      isMounted = false;
      if (unsubscribeChaptersRealtime) unsubscribeChaptersRealtime();
      if (unsubscribeUserLiveWorkspace) unsubscribeUserLiveWorkspace();
      unsubscribeAuth();
    };
  }, [session.currentNovelId]);

  // Tự động tải và đồng bộ Từ vựng của truyện hiện tại từ Cloud Firestore
  useEffect(() => {
    let isMounted = true;
    const fetchCloudVocab = async () => {
      const user = auth.currentUser;
      if (!user || !session.currentNovelId) return;
      try {
        const cloudTerms = await syncFirestoreData<any>('vocab', session.currentNovelId, 'GET');
        if (!isMounted || !cloudTerms || cloudTerms.length === 0) return;
        
        setSession(prev => {
          const currentId = session.currentNovelId;
          const otherTerms = (prev.customTerms || []).filter(t => t.novelId && t.novelId !== currentId);
          const localNovelTerms = (prev.customTerms || []).filter(t => !t.novelId || t.novelId === currentId);
          
          const termMap = new Map<string, any>();
          localNovelTerms.forEach(t => termMap.set(t.id, t));
          cloudTerms.forEach(t => termMap.set(t.id, t));
          
          const merged = [...Array.from(termMap.values()), ...otherTerms];
          db.bulkSaveCustomTerms(merged).catch(console.error);
          return { ...prev, customTerms: merged };
        });
      } catch (err) {
        console.warn("Auto sync vocab in App error:", err);
      }
    };

    fetchCloudVocab();
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      if (user) fetchCloudVocab();
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [session.currentNovelId]);

  // Fix lỗi QuotaExceededError khi lưu Session
  useEffect(() => {
    try {
        // Exclude customTerms from localStorage to save space
        const sessionToSave = { ...session, customTerms: [] };
        localStorage.setItem('chiVietSingleSession', JSON.stringify(sessionToSave));
    } catch (e) {
        if (session.result) {
            try {
                // Thử lưu bản rút gọn (bỏ bớt segments nặng)
                const leanResult = { ...session.result, segments: [] };
                const leanSession = { ...session, customTerms: [], result: leanResult };
                localStorage.setItem('chiVietSingleSession', JSON.stringify(leanSession));
            } catch (innerE) {
                try {
                    // Thử lưu không có result để cứu inputText
                    const ultraLeanSession = { ...session, customTerms: [], result: null };
                    localStorage.setItem('chiVietSingleSession', JSON.stringify(ultraLeanSession));
                } catch (lastE) {
                    console.warn("Storage Quota Exceeded for Session");
                }
            }
        }
    }
  }, [session]);

  // Fix lỗi QuotaExceededError khi lưu History
  useEffect(() => {
    try {
        localStorage.setItem('chiVietHistory', JSON.stringify(history));
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
            localStorage.setItem('chiVietHistory', JSON.stringify(leanHistory));
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
                localStorage.setItem('chiVietHistory', JSON.stringify(superLeanHistory));
            } catch (lastE) {
                console.warn("Storage Quota Exceeded for History");
            }
        }
    }
  }, [history]);

  // Reset undo/redo stacks when loading a new chapter or starting a new translation
  useEffect(() => {
    setUndoStack([]);
    setRedoStack([]);
  }, [session.currentHistoryId, session.inputText]);

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
    setSession(prev => ({ ...prev, ...updates }));
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
        saveChapterToCloud(updated).catch(err => console.error("Auto-save cloud chapter failed", err));
        return updated;
      }
      return c;
    }));
  };

  const handleUpdateSegment = (index: number, newNatural: string) => {
    if (!session.result) return;
    lastLocalEditTimeRef.current = Date.now();

    const cleanNewNatural = newNatural.replace(/\n+$/, "");
    const currentSegments = session.result.segments;
    if (currentSegments[index] && currentSegments[index].natural === cleanNewNatural) {
      return; // No actual change, skip to avoid redundant undo states and clearing redo
    }

    // Save undo state
    const currentNaturals = currentSegments.map(s => s.natural);
    setUndoStack(prev => [...prev, currentNaturals].slice(-100));
    setRedoStack([]);

    const newSegments = [...currentSegments];
    newSegments[index] = { ...newSegments[index], natural: cleanNewNatural };
    const newResult = {
        ...session.result,
        segments: newSegments,
        naturalTranslation: newSegments.map(s => s.natural).join('\n')
    };
    
    updateSession({ result: newResult });
    autoSaveLinkedChapter(newResult);

    saveUserLiveWorkspaceToCloud({
      novelId: session.currentNovelId,
      chapterId: session.currentChapterId,
      status: session.status,
      completedSegments: session.completedSegments,
      segments: newSegments,
      result: newResult,
      inputText: session.inputText,
      deeplText: session.deeplText,
      preEditedText: session.preEditedText,
      lastEditedIndex: index,
      updatedAt: Date.now()
    }, false);

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

    // Save undo state
    const currentNaturals = currentSegments.map(s => s.natural);
    setUndoStack(prev => [...prev, currentNaturals].slice(-100));
    setRedoStack([]);

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

    saveUserLiveWorkspaceToCloud({
      novelId: session.currentNovelId,
      chapterId: session.currentChapterId,
      status: session.status,
      completedSegments: session.completedSegments,
      segments: newSegments,
      result: newResult,
      inputText: session.inputText,
      deeplText: session.deeplText,
      preEditedText: session.preEditedText,
      updatedAt: Date.now()
    }, false);

    if (session.currentHistoryId) {
      setHistory(prev => prev.map(item => 
        item.id === session.currentHistoryId 
          ? { ...item, result: newResult, completedSegments: session.completedSegments, timestamp: Date.now() } 
          : item
      ));
    }
  };

  const handleUndo = () => {
    if (undoStack.length === 0 || !session.result) return;
    
    const previousNaturals = undoStack[undoStack.length - 1];
    const currentNaturals = session.result.segments.map(s => s.natural);
    
    setUndoStack(prev => prev.slice(0, prev.length - 1));
    setRedoStack(prev => [...prev, currentNaturals]);
    
    const newSegments = session.result.segments.map((seg, idx) => ({
      ...seg,
      natural: previousNaturals[idx] || ""
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
          ? { ...item, result: newResult, timestamp: Date.now() } 
          : item
      ));
    }
  };

  const handleRedo = () => {
    if (redoStack.length === 0 || !session.result) return;
    
    const nextNaturals = redoStack[redoStack.length - 1];
    const currentNaturals = session.result.segments.map(s => s.natural);
    
    setRedoStack(prev => prev.slice(0, prev.length - 1));
    setUndoStack(prev => [...prev, currentNaturals]);
    
    const newSegments = session.result.segments.map((seg, idx) => ({
      ...seg,
      natural: nextNaturals[idx] || ""
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
          ? { ...item, result: newResult, timestamp: Date.now() } 
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

    saveUserLiveWorkspaceToCloud({
      novelId: session.currentNovelId,
      chapterId: session.currentChapterId,
      status: session.status,
      completedSegments: newCompleted,
      segments: session.result?.segments,
      result: session.result,
      inputText: session.inputText,
      deeplText: session.deeplText,
      preEditedText: session.preEditedText,
      updatedAt: Date.now()
    }, true);

    if (session.currentHistoryId) {
      setHistory(prev => prev.map(item => 
        item.id === session.currentHistoryId 
          ? { ...item, completedSegments: newCompleted, timestamp: Date.now() } 
          : item
      ));
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
            (session.characters || []).forEach(c => {
                if (c.chineseName && c.vietName) customMap.set(c.chineseName.trim(), c.vietName.trim());
            });
            (session.customTerms || []).forEach(t => {
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
          await saveChapterToCloud(autoChapter);
          setChapters(prev => [autoChapter, ...prev]);
          console.log("Auto-saved draft on clear:", autoName);
        } catch (e) {
          console.error("Auto save on clear failed", e);
        }
      }
    }

    // Tiến hành xóa session
    updateSession({ inputText: '', deeplText: '', preEditedText: '', result: null, status: AppStatus.IDLE, currentChapterId: undefined, currentHistoryId: undefined });
    saveUserLiveWorkspaceToCloud({
      novelId: session.currentNovelId,
      chapterId: '',
      status: AppStatus.IDLE,
      result: null,
      completedSegments: [],
      inputText: '',
      deeplText: '',
      preEditedText: '',
      updatedAt: Date.now()
    }, true);
  };

  const handleTranslate = async (forceFastAlign = false) => {
    if (!session.inputText.trim()) return;
    
    // --- BƯỚC TỰ ĐỘNG LƯU TRỮ CHƯƠNG ĐANG EDIT NẾU QUÊN CHƯA LƯU ---
    if (session.result && session.inputText.trim()) {
      const alreadySaved = chapters.some(c => c.inputText.trim() === session.inputText.trim());
      if (!alreadySaved) {
        let autoName = "";
        const lines = session.inputText.split('\n').map(l => l.trim()).filter(Boolean);
        
        for (const line of lines.slice(0, 5)) {
          if (line.match(/(Chương\s+\d+|第[一二三四五六七八九十百千万\d]+章)/i)) {
            const customMap = new Map<string, string>();
            (session.characters || []).forEach(c => {
                if (c.chineseName && c.vietName) customMap.set(c.chineseName.trim(), c.vietName.trim());
            });
            (session.customTerms || []).forEach(t => {
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
          autoName = `[Tự động] ${autoName}`;
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
          await saveChapterToCloud(autoChapter);
          setChapters(prev => [autoChapter, ...prev]);
          console.log("Auto-saved draft on translate:", autoName);
        } catch (e) {
          console.error("Auto save on translate failed", e);
        }
      }
    }

    // --- BƯỚC 1: TÍNH TOÁN VIETPHRASE NỘI BỘ ---
    const inputLines = session.inputText.split('\n');
    
    const customMap = new Map<string, string>();
    (session.characters || []).forEach(c => {
        if (c.chineseName && c.vietName) customMap.set(c.chineseName.trim(), c.vietName.trim());
    });
    (session.customTerms || []).forEach(t => {
        if (t.term && t.meaning) customMap.set(t.term.trim(), t.meaning.trim());
    });

    const vpSegments = inputLines.map(line => ({
        source: line,
        quick: vietphraseEngine.translate(line, customMap),
    }));
    
    updateSession({ status: AppStatus.LOADING, error: null, result: null, completedSegments: [], currentHistoryId: undefined, currentChapterId: undefined });

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

             return {
                 source: line,
                 natural: preEditedLines[i] || "",
                 quick: vpSegments[i]?.quick || "",
                 deepl: refDeepl
              };
         });
      } else {
         // Standard Edit Mode: Căn lề GG/DeepL làm tài liệu tham khảo, ô dịch để trống để người dùng tự điền
         const deeplLines = alignTranslation(inputLines, session.deeplText || "");
         mergedSegments = inputLines.map((line, i) => ({
            source: line,
            natural: "", // Để trống để người dùng tự điền
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
      
      updateSession({ 
        result: sanitized, 
        status: AppStatus.SUCCESS,
        currentHistoryId: historyId 
      });

      saveUserLiveWorkspaceToCloud({
        novelId: session.currentNovelId,
        chapterId: '',
        status: AppStatus.SUCCESS,
        result: sanitized,
        completedSegments: [],
        inputText: session.inputText,
        deeplText: session.deeplText,
        preEditedText: session.preEditedText,
        updatedAt: Date.now()
      }, true);
      
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

    saveUserLiveWorkspaceToCloud({
      novelId: session.currentNovelId,
      chapterId: '',
      status: AppStatus.SUCCESS,
      result: restored,
      completedSegments: completed,
      inputText: item.sourceText,
      deeplText: item.result?.deeplTranslation || "",
      preEditedText: item.result?.naturalTranslation || "",
      updatedAt: Date.now()
    }, true);
  };

  const deleteHistoryItem = (id: string) => {
    setHistory(prev => prev.filter(item => item.id !== id));
  };

  const handleSaveChapter = async (name: string) => {
    if (!session.result) return;
    lastLocalEditTimeRef.current = Date.now();

    // Reuse existing chapter ID if we are editing an active chapter, or overwrite by name
    const existingChapter = chapters.find(c => c.id === session.currentChapterId || c.name.trim().toLowerCase() === name.trim().toLowerCase());
    const chapterId = existingChapter?.id || `chap_${Date.now()}`;

    const newChapter: Chapter = {
      id: chapterId,
      novelId: session.currentNovelId,
      name,
      timestamp: Date.now(),
      inputText: session.inputText,
      deeplText: session.deeplText,
      preEditedText: session.preEditedText,
      result: session.result,
      completedSegments: session.completedSegments
    };

    await db.saveChapter(newChapter);
    await saveChapterToCloud(newChapter);
    setChapters(prev => [newChapter, ...prev.filter(c => c.id !== chapterId && c.name.trim().toLowerCase() !== name.trim().toLowerCase())]);
    updateSession({ currentChapterId: chapterId });

    saveUserLiveWorkspaceToCloud({
      novelId: session.currentNovelId,
      chapterId,
      chapterName: name,
      status: session.status,
      completedSegments: session.completedSegments,
      segments: session.result.segments,
      result: session.result,
      inputText: session.inputText,
      deeplText: session.deeplText,
      preEditedText: session.preEditedText,
      updatedAt: Date.now()
    }, true);
  };

  const handleRestoreChapter = (chapter: Chapter) => {
    lastLocalEditTimeRef.current = Date.now();
    const restoredResult = sanitizeResult(chapter.result);
    const completed = chapter.completedSegments || [];
    const activeNovelId = chapter.novelId || session.currentNovelId;

    updateSession({
      inputText: chapter.inputText,
      deeplText: chapter.deeplText || "",
      preEditedText: chapter.preEditedText || "",
      result: restoredResult,
      status: AppStatus.SUCCESS,
      error: null,
      completedSegments: completed,
      currentHistoryId: undefined,
      currentChapterId: chapter.id,
      currentNovelId: activeNovelId
    });
    setShowChapters(false);

    saveUserLiveWorkspaceToCloud({
      novelId: activeNovelId,
      chapterId: chapter.id,
      chapterName: chapter.name,
      status: AppStatus.SUCCESS,
      completedSegments: completed,
      segments: restoredResult?.segments || [],
      result: restoredResult,
      inputText: chapter.inputText,
      deeplText: chapter.deeplText,
      preEditedText: chapter.preEditedText,
      updatedAt: Date.now()
    }, true);
  };

  const handleSelectNovel = (novelId: string) => {
    lastLocalEditTimeRef.current = Date.now();
    updateSession({ currentNovelId: novelId });
    db.saveCurrentNovelId(novelId).catch(console.error);

    saveUserLiveWorkspaceToCloud({
      novelId,
      chapterId: session.currentChapterId,
      status: session.status,
      result: session.result,
      completedSegments: session.completedSegments,
      inputText: session.inputText,
      deeplText: session.deeplText,
      preEditedText: session.preEditedText,
      updatedAt: Date.now()
    }, true);
  };

  const handleInputChange = (updates: Partial<TranslationSession>) => {
    lastLocalEditTimeRef.current = Date.now();
    updateSession(updates);

    saveUserLiveWorkspaceToCloud({
      novelId: session.currentNovelId,
      chapterId: session.currentChapterId,
      status: session.status,
      result: session.result,
      completedSegments: session.completedSegments,
      inputText: updates.inputText !== undefined ? updates.inputText : session.inputText,
      deeplText: updates.deeplText !== undefined ? updates.deeplText : session.deeplText,
      preEditedText: updates.preEditedText !== undefined ? updates.preEditedText : session.preEditedText,
      updatedAt: Date.now()
    }, false);
  };

  const handleDeleteChapter = async (id: string) => {
    await db.deleteChapter(id);
    await deleteChapterFromCloud(id);
    setChapters(prev => prev.filter(c => c.id !== id));
  };

  const handleRenameChapter = async (id: string, newName: string) => {
    const chapter = chapters.find(c => c.id === id);
    if (!chapter) return;
    const updated = { ...chapter, name: newName };
    await db.saveChapter(updated);
    await saveChapterToCloud(updated);
    setChapters(prev => prev.map(c => c.id === id ? updated : c));
  };

  const handleClearAllChapters = async () => {
    await db.clearAllChapters();
    if (session.currentNovelId) {
      await clearNovelChaptersFromCloud(session.currentNovelId);
    }
    setChapters([]);
  };

  const handleExportExcel = async () => {
    let novelName = "Truyện";
    const currentId = session.currentNovelId;
    try {
      const allNovels = await getNovels();
      const found = allNovels.find(n => n.id === currentId);
      if (found) novelName = found.name;
    } catch (e) {
      console.warn("Could not fetch novel name for export", e);
    }

    // Chỉ xuất dữ liệu của bộ truyện hiện tại
    const filteredTerms = (session.customTerms || []).filter(t => !currentId || !t.novelId || t.novelId === currentId);
    const filteredChars = (session.characters || []).filter(c => !currentId || !c.novelId || c.novelId === currentId);
    const filteredRels = (session.relationships || []).filter(r => !currentId || !r.novelId || r.novelId === currentId);
    const filteredShortcuts = getStoredShortcuts(currentId);

    exportToExcel(filteredTerms, filteredChars, filteredRels, novelName, filteredShortcuts);
  };

  return (
    <div className="h-screen flex flex-col bg-[#F5E6D3] text-[#3E2723] font-sans overflow-hidden">
      
      {/* HEADER */}
      <header className="bg-[#4E342E] text-[#F5E6D3] border-b border-[#3E2723] h-14 flex items-center justify-between px-3 sm:px-4 shrink-0 z-20 shadow-md overflow-x-auto no-scrollbar">
        <div className="flex items-center gap-1.5 sm:gap-4 shrink-0">
          <div className="flex items-center gap-2" title="Edit">
            <div className="text-[#FFECB3]">
              <PenLine size={22} />
            </div>
            <h1 style={{ fontFamily: '"Nunito", sans-serif' }} className="hidden sm:block text-2xl font-extrabold tracking-wide text-[#FFECB3] pt-1">Edit</h1>
          </div>

          {/* Segmented Mode Control */}
          <div className="flex bg-[#3E2723] p-0.5 rounded-lg border border-[#5D4037] ml-1 sm:ml-2">
            <button
              onClick={() => setMode('edit')}
              className={`px-2 sm:px-3 py-1 rounded-md text-[11px] font-bold transition-all ${mode === 'edit' ? 'bg-[#FFECB3] text-[#3E2723] shadow-sm' : 'text-[#D7CCC8] hover:text-[#FFECB3]'}`}
              title="Chế độ Edit"
            >
              <span className="sm:hidden">E</span>
              <span className="hidden sm:inline">Edit</span>
            </button>
            <button
              onClick={() => setMode('beta')}
              className={`px-2 sm:px-3 py-1 rounded-md text-[11px] font-bold transition-all flex items-center gap-1 ${mode === 'beta' ? 'bg-[#FFECB3] text-[#3E2723] shadow-sm' : 'text-[#D7CCC8] hover:text-[#FFECB3]'}`}
              title="Chế độ Beta"
            >
              <span className="sm:hidden">B</span>
              <span className="hidden sm:inline">Beta</span>
            </button>
          </div>
        </div>
        
        {/* RIGHT CONTROLS */}
        <div className="flex items-center gap-1.5 sm:gap-2 shrink-0">
            {/* Nút mở Từ vựng cho màn hình nhỏ / Tablet (Chỉ icon) */}
            <button
              onClick={() => setShowMobileSidebar(true)}
              className="lg:hidden flex items-center justify-center text-[#FFECB3] hover:text-white bg-[#5D4037]/60 p-2 sm:px-2.5 sm:py-1 rounded-full border border-[#FFECB3]/20 transition-colors"
              title="Kho Từ vựng"
            >
               <BookA size={14} />
            </button>

            {/* Nút mở Nhân vật & Quan hệ cho màn hình nhỏ / Tablet (Chỉ icon) */}
            <button
              onClick={() => setShowMobileWorldInfo(true)}
              className="xl:hidden flex items-center justify-center text-[#FFECB3] hover:text-white bg-[#5D4037]/60 p-2 sm:px-2.5 sm:py-1 rounded-full border border-[#FFECB3]/20 transition-colors"
              title="Bảng Nhân vật & Thiết lập"
            >
               <Users size={14} />
            </button>

            <NovelSelector 
              currentNovelId={session.currentNovelId || ''} 
              onSelectNovel={handleSelectNovel} 
            />
            <button 
              onClick={() => setShowShortcuts(true)} 
              className={`flex items-center gap-1.5 text-[10px] font-medium px-2.5 py-1 rounded-full border transition-colors ${
                shortcutsEnabled 
                  ? 'text-[#FFECB3] hover:text-white hover:bg-[#5D4037] bg-[#5D4037]/40 border-[#FFECB3]/20' 
                  : 'text-[#A1887F] hover:text-white hover:bg-[#5D4037] border-[#5D4037]'
              }`}
              title="Bảng gõ tắt (Auto-replace)"
            >
               <Keyboard size={12} />
               <span className="hidden sm:inline">Gõ tắt</span>
               {shortcuts.length > 0 && (
                 <span className={`text-[9px] px-1.5 py-0.2 rounded-full font-mono font-bold ${shortcutsEnabled ? 'bg-[#FFECB3]/20 text-[#FFECB3]' : 'bg-gray-600/40 text-gray-300'}`}>
                   {shortcuts.filter(s => s.enabled).length}
                 </span>
               )}
            </button>
            <button onClick={() => setShowChapters(true)} className="flex items-center gap-1.5 text-[10px] font-medium text-[#FFECB3] hover:text-white hover:bg-[#5D4037] bg-[#5D4037]/30 px-2 sm:px-2.5 py-1 rounded-full border border-[#FFECB3]/20 transition-colors">
               <FolderOpen size={12} />
               <span className="hidden sm:inline">Kho chương</span>
               <span>({currentNovelChapters.length})</span>
            </button>
            <button onClick={() => setShowHistory(true)} className="flex items-center gap-1.5 text-[10px] font-medium text-[#D7CCC8] hover:text-white hover:bg-[#5D4037] px-2 py-1 rounded-full border border-[#5D4037] transition-colors">
               <History size={12} />
               <span className="hidden sm:inline">Lịch sử</span>
            </button>

            {auth.currentUser && (
              <div 
                className={`flex items-center gap-1 text-[10px] px-2 py-1 rounded-full border transition-all ${
                  Date.now() - lastRemoteSyncTime < 4000
                    ? 'bg-emerald-800/80 text-emerald-200 border-emerald-500 shadow-sm animate-pulse'
                    : 'text-[#D7CCC8]/70 border-[#5D4037] bg-[#3E2723]/40'
                }`}
                title={Date.now() - lastRemoteSyncTime < 4000 ? "Vừa đồng bộ tức thì từ thiết bị khác!" : "Đang kết nối đồng bộ thời gian thực (Laptop ⇄ Điện thoại)"}
              >
                <Wifi size={11} className={Date.now() - lastRemoteSyncTime < 4000 ? "text-emerald-300" : "text-[#D7CCC8]/60"} />
                <span className="hidden md:inline font-mono text-[9px]">
                  {Date.now() - lastRemoteSyncTime < 4000 ? "Đã đồng bộ" : "Live"}
                </span>
              </div>
            )}

            <AuthPanel />
        </div>
      </header>

      {/* MAIN WORKSPACE */}
      <div className="flex-1 flex overflow-hidden relative">
        {/* LEFT SIDEBAR (Desktop / Laptop) */}
        <div className={`w-80 border-r border-[#D7CCC8] bg-[#EFE5D9] shrink-0 ${isFocusMode ? 'hidden' : 'hidden lg:block'}`}>
            <DictionarySidebar 
                currentNovelId={session.currentNovelId || ''}
                terms={session.customTerms} onExportExcel={handleExportExcel} 
                onUpdateTerms={(novelTerms) => {
                    try {
                        const currentId = session.currentNovelId;
                        const otherTerms = (session.customTerms || []).filter(t => t.novelId && t.novelId !== currentId);
                        const merged = [...novelTerms, ...otherTerms];
                        updateSession({ customTerms: merged });
                        db.bulkSaveCustomTerms(merged).catch(err => {
                            console.error("App Sidebar: db.bulkSaveCustomTerms failed", err);
                        });
                    } catch (err) {
                        console.error("App Sidebar: onUpdateTerms caught error:", err);
                    }
                }} 
                sheetUrl={session.sheetUrl} 
                onUpdateSheetUrl={(url) => updateSession({ sheetUrl: url })} 
                refreshTrigger={vpLoaded}
            />
        </div>

        {/* MOBILE / TABLET SLIDE-OVER DRAWER FOR DICTIONARY */}
        {showMobileSidebar && (
          <div className="fixed inset-0 z-50 flex lg:hidden animate-in fade-in duration-150">
            <div 
              className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity" 
              onClick={() => setShowMobileSidebar(false)} 
            />
            <div className="relative w-80 max-w-[85vw] bg-[#EFE5D9] h-full shadow-2xl z-10 flex flex-col animate-in slide-in-from-left duration-200">
              <div className="flex items-center justify-between p-2.5 bg-[#4E342E] text-white border-b border-[#3E2723]">
                <span className="text-xs font-bold text-[#FFECB3] flex items-center gap-1.5">
                  <BookA size={14} /> Kho từ vựng & Nhân vật
                </span>
                <button 
                  onClick={() => setShowMobileSidebar(false)}
                  className="p-1 rounded-md text-[#D7CCC8] hover:text-white hover:bg-[#5D4037]"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                <DictionarySidebar 
                    currentNovelId={session.currentNovelId || ''}
                    terms={session.customTerms} onExportExcel={handleExportExcel} 
                    onUpdateTerms={(novelTerms) => {
                        try {
                            const currentId = session.currentNovelId;
                            const otherTerms = (session.customTerms || []).filter(t => t.novelId && t.novelId !== currentId);
                            const merged = [...novelTerms, ...otherTerms];
                            updateSession({ customTerms: merged });
                            db.bulkSaveCustomTerms(merged).catch(err => {
                                console.error("App Sidebar: db.bulkSaveCustomTerms failed", err);
                            });
                        } catch (err) {
                            console.error("App Sidebar: onUpdateTerms caught error:", err);
                        }
                    }} 
                    sheetUrl={session.sheetUrl} 
                    onUpdateSheetUrl={(url) => updateSession({ sheetUrl: url })} 
                    refreshTrigger={vpLoaded}
                />
              </div>
            </div>
          </div>
        )}

        {/* CENTER MAIN CONTENT */}
        <main className="flex-1 flex flex-col h-full overflow-hidden bg-[#F5E6D3] min-w-0">
          <div className="flex-1 overflow-y-auto overflow-x-hidden scroll-smooth scrollbar-thin scrollbar-thumb-[#D7CCC8] scrollbar-track-transparent">
             <div className="flex flex-col px-2 pb-2">
                
                {/* INPUT AREA */}
                {!isFocusMode && (
                  <div className="mt-2 bg-white rounded-xl shadow-sm border border-[#D7CCC8] overflow-hidden transition-all focus-within:ring-2 focus-within:ring-[#8D6E63]/20 focus-within:border-[#8D6E63]/50 mb-2 flex flex-col">
                      <div className="flex justify-between items-center bg-[#EFEBE9]/50 px-3 py-1.5 border-b border-[#EFEBE9]">
                          <div className="flex items-center gap-2">
                              <span className="bg-[#5D4037] text-white text-[9px] font-bold px-1.5 py-0.5 rounded-full uppercase tracking-wider">
                                  {mode === 'beta' ? 'Nguồn & Tham chiếu (Beta)' : 'Nguồn & Tham chiếu'}
                              </span>
                              <div className="flex items-center gap-1 text-[10px] font-bold text-[#8D6E63]">
                                  <Layers size={10} />
                                  <span>{segmentCount} đoạn văn</span>
                              </div>
                          </div>
                          <div className="flex gap-2">
                              <button 
                                  onClick={() => handleInputChange({ 
                                      inputText: EXAMPLE_TEXT, 
                                      deeplText: "Đường dài mới biết ngựa hay, ở lâu mới biết lòng dạ con người.",
                                      preEditedText: mode === 'beta' ? "Đường dài mới biết sức ngựa, ngày lâu mới tỏ lòng người." : ""
                                  })} 
                                  className="text-[10px] text-[#8D6E63] hover:text-[#3E2723] px-2 py-1 rounded hover:bg-[#D7CCC8] flex items-center gap-1"
                              >
                                  <Quote size={10} /> Ví dụ
                              </button>
                              <button 
                                  onClick={handleClearSession} 
                                  disabled={!session.inputText && !session.deeplText && !session.preEditedText} 
                                  className="text-[10px] text-[#8D6E63] hover:text-[#3E2723] px-2 py-1 rounded hover:bg-[#D7CCC8] flex items-center gap-1 disabled:opacity-50"
                              >
                                  <Eraser size={10} /> Xóa
                              </button>
                          </div>
                      </div>

                      <div className={`grid ${mode === 'beta' ? 'grid-cols-1 sm:grid-cols-3' : 'grid-cols-1 sm:grid-cols-2'} flex-1 min-h-[140px] divide-y sm:divide-y-0 sm:divide-x divide-[#EFEBE9]`}>
                          <div className="flex flex-col flex-1">
                              <div className="text-[9px] font-bold text-[#8D6E63] uppercase tracking-wider px-3 pt-1.5 bg-[#FAFAFA]/40">1. Văn bản gốc (Trung)</div>
                              <textarea
                                  ref={textareaRef}
                                  value={session.inputText}
                                  onChange={(e) => handleInputChange({ inputText: e.target.value })}
                                  placeholder="Nhập văn bản nguồn (Trung)..."
                                  className="flex-1 p-3 text-lg font-serif-sc bg-transparent border-none outline-none resize-none placeholder:text-[#BCAAA4] leading-relaxed"
                                  spellCheck="false"
                              />
                          </div>
                          <div className="flex flex-col flex-1">
                              <div className="text-[9px] font-bold text-[#8D6E63] uppercase tracking-wider px-3 pt-1.5 bg-[#FAFAFA]/40">2. Bản dịch GG / DeepL {mode === 'beta' && <span className="text-[8px] font-normal lowercase text-[#BCAAA4]">(không bắt buộc)</span>}</div>
                              <textarea
                                  value={session.deeplText}
                                  onChange={(e) => handleInputChange({ deeplText: e.target.value })}
                                  onKeyDown={(e) => {
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
                                  placeholder="Dán bản dịch GG/DeepL vào đây..."
                                  className="flex-1 p-3 text-sm bg-transparent border-none outline-none resize-none placeholder:text-[#BCAAA4] leading-relaxed"
                                  spellCheck="false"
                              />
                          </div>
                          {mode === 'beta' && (
                              <div className="flex flex-col flex-1">
                                  <div className="text-[9px] font-bold text-[#E64A19] uppercase tracking-wider px-3 pt-1.5 bg-[#FAFAFA]/40 flex items-center gap-1">3. Bản edit sẵn <span className="bg-[#E64A19] text-white text-[7px] px-1 rounded-full uppercase">Beta</span></div>
                                  <textarea
                                      value={session.preEditedText || ''}
                                      onChange={(e) => handleInputChange({ preEditedText: e.target.value })}
                                      onKeyDown={(e) => {
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
                                      placeholder="Dán bản edit sẵn vào đây..."
                                      className="flex-1 p-3 text-sm bg-transparent border-none outline-none resize-none placeholder:text-[#BCAAA4] leading-relaxed font-medium text-[#4E342E]"
                                      spellCheck="false"
                                  />
                              </div>
                          )}
                      </div>

                      <div className="flex justify-between items-center p-2 border-t border-[#EFEBE9] bg-[#FAFAFA]">
                          <div className="flex items-center gap-4">
                              <div className="text-[10px] font-medium transition-colors text-[#A1887F]">
                                  {session.inputText.length} ký tự
                              </div>
                          </div>
                          <button
                              onClick={() => handleTranslate(false)}
                              disabled={session.status === AppStatus.LOADING || !session.inputText.trim()}
                              className="bg-[#3E2723] text-[#FFECB3] hover:bg-[#4E342E] disabled:bg-[#A1887F] disabled:cursor-not-allowed px-4 py-1.5 rounded text-sm font-bold flex items-center gap-2 transition-all shadow-sm"
                          >
                              {session.status === AppStatus.LOADING ? (<><Loader2 className="animate-spin" size={14} /> Phân tích...</>) : 'Phân tích'}
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
                    <div className={isFocusMode ? "mt-1" : "sticky top-2 z-10"}>
                        <div className={isFocusMode ? "h-[calc(100vh-4.2rem)]" : "h-[calc(100vh-4.5rem)]"}>
                            <TranslationOutput 
                                data={session.result} 
                                customTerms={session.customTerms} 
                                characters={session.characters} 
                                completedSegments={session.completedSegments || []}
                                onUpdateSegment={handleUpdateSegment} 
                                onUpdateAllSegments={handleUpdateAllSegments}
                                onToggleComplete={handleToggleComplete}
                                onSaveChapter={handleSaveChapter}
                                onUndo={handleUndo}
                                onRedo={handleRedo}
                                canUndo={undoStack.length > 0}
                                canRedo={redoStack.length > 0}
                                isFocusMode={isFocusMode}
                                onToggleFocusMode={() => setIsFocusMode(!isFocusMode)}
                                onUpdateTerms={(novelTerms) => {
                                    try {
                                        const currentId = session.currentNovelId;
                                        const otherTerms = (session.customTerms || []).filter(t => t.novelId && t.novelId !== currentId);
                                        const merged = [...novelTerms, ...otherTerms];
                                        updateSession({ customTerms: merged });
                                        db.bulkSaveCustomTerms(merged).catch(err => {
                                            console.error("App Output: db.bulkSaveCustomTerms failed", err);
                                        });
                                    } catch (err) {
                                        console.error("App Output: onUpdateTerms caught error:", err);
                                    }
                                }}
                                onUpdateCharacters={(novelChars) => {
                                    try {
                                        const currentId = session.currentNovelId;
                                        const otherChars = (session.characters || []).filter(c => c.novelId && c.novelId !== currentId);
                                        const merged = [...novelChars, ...otherChars];
                                        updateSession({ characters: merged });
                                    } catch (err) {
                                        console.error("App Output: onUpdateCharacters caught error:", err);
                                    }
                                }}
                                currentNovelId={session.currentNovelId || ''}
                            />
                        </div>
                    </div>
                ) : (
                    session.status === AppStatus.IDLE && (
                        <div className="flex flex-col items-center justify-center text-[#BCAAA4] border-2 border-dashed border-[#D7CCC8] rounded-xl py-12">
                            <Layout size={32} className="mb-2 opacity-50"/>
                            <p className="text-xs">Khu vực hiển thị kết quả</p>
                        </div>
                    )
                )}
             </div>
          </div>
        </main>

        {/* RIGHT SIDEBAR (Desktop / Laptop) */}
        <div className={`w-[340px] border-l border-[#D7CCC8] bg-[#EFE5D9] shrink-0 ${isFocusMode ? 'hidden' : 'hidden xl:block'}`}>
            <WorldInfoPanel 
                currentNovelId={session.currentNovelId || ''}
                characters={session.characters} 
                onUpdateCharacters={(chars) => updateSession({ characters: chars })} 
                relationships={session.relationships} 
                onUpdateRelationships={(rels) => updateSession({ relationships: rels })} 
                notes={session.notes} 
                onUpdateNotes={(val) => updateSession({ notes: val })} 
                sheetUrl={session.sheetUrl} 
                onUpdateSheetUrl={(url) => updateSession({ sheetUrl: url })} 
            />
        </div>

        {/* MOBILE / TABLET SLIDE-OVER DRAWER FOR WORLD INFO & CHARACTERS */}
        {showMobileWorldInfo && (
          <div className="fixed inset-0 z-50 flex justify-end xl:hidden animate-in fade-in duration-150">
            <div 
              className="fixed inset-0 bg-black/40 backdrop-blur-xs transition-opacity" 
              onClick={() => setShowMobileWorldInfo(false)} 
            />
            <div className="relative w-84 max-w-[88vw] bg-[#EFE5D9] h-full shadow-2xl z-10 flex flex-col animate-in slide-in-from-right duration-200">
              <div className="flex items-center justify-between p-2.5 bg-[#4E342E] text-white border-b border-[#3E2723]">
                <span className="text-xs font-bold text-[#FFECB3] flex items-center gap-1.5">
                  <Users size={14} /> Nhân vật & Thiết lập
                </span>
                <button 
                  onClick={() => setShowMobileWorldInfo(false)}
                  className="p-1 rounded-md text-[#D7CCC8] hover:text-white hover:bg-[#5D4037]"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="flex-1 overflow-hidden">
                <WorldInfoPanel 
                    currentNovelId={session.currentNovelId || ''}
                    characters={session.characters} 
                    onUpdateCharacters={(chars) => updateSession({ characters: chars })} 
                    relationships={session.relationships} 
                    onUpdateRelationships={(rels) => updateSession({ relationships: rels })} 
                    notes={session.notes} 
                    onUpdateNotes={(val) => updateSession({ notes: val })} 
                    sheetUrl={session.sheetUrl} 
                    onUpdateSheetUrl={(url) => updateSession({ sheetUrl: url })} 
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <HistoryModal isOpen={showHistory} onClose={() => setShowHistory(false)} history={history} onSelect={handleRestoreHistory} onDelete={deleteHistoryItem} onClearAll={() => setHistory([])} />

      <ChapterArchiveModal 
        isOpen={showChapters} 
        onClose={() => setShowChapters(false)} 
        chapters={currentNovelChapters} 
        customTerms={session.customTerms} 
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