
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { TranslationResponse, VocabItem, CustomTerm, Character, TextShortcut } from '../types';
import { Copy, TableProperties, Check, Info, X, Users, ClipboardList, CheckCircle2, FileDown, BookOpen, Undo2, Redo2, Search, Maximize2, Minimize2, ChevronLeft, ChevronRight, Loader2, Pencil, Trash2, Plus, UserPlus } from 'lucide-react';
import { vietphraseEngine } from '../services/vietphraseService';
import { checkAndApplyShortcut, getStoredShortcuts } from '../services/shortcutService';
// Deleted smartClassify import

interface TranslationOutputProps {
  data: TranslationResponse;
  customTerms?: CustomTerm[];
  characters?: Character[];
  completedSegments?: number[];
  onUpdateSegment?: (index: number, newNatural: string) => void;
  onUpdateAllSegments?: (newNaturals: string[]) => void;
  onToggleComplete?: (index: number) => void;
  onSaveChapter?: (name: string) => void;
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  isFocusMode?: boolean;
  onToggleFocusMode?: () => void;
  onUpdateTerms?: (terms: CustomTerm[]) => void;
  onUpdateCharacters?: (characters: Character[]) => void;
  currentNovelId?: string;
}

const escapeRegExp = (string: string) => {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const DIACRITIC_CLASSES_LOWER: Record<string, string> = {
  'a': '[aàáảãạăằắẳẵặâầấẩẫậ]',
  'e': '[eèéẻẽẹêềếểễệ]',
  'i': '[iìíỉĩị]',
  'o': '[oòóỏõọôồốổỗộơờớởỡợ]',
  'u': '[uùúủũụưừứửữự]',
  'y': '[yỳýỷỹỵ]',
  'd': '[dđ]'
};

const DIACRITIC_CLASSES_UPPER: Record<string, string> = {
  'A': '[AÀÁẢÃẠĂẰẮ|ẲẴẶÂẦẤẨẪẬ]',
  'E': '[EÈÉẺẼẸÊỀẾỂỄỆ]',
  'I': '[IÌÍỈĨỊ]',
  'O': '[OÒÓỎÕỌÔỒỐỔỖỘƠỜỚỞỠỢ]',
  'U': '[UÙÚỦŨỤƯỪỨỬỮỰ]',
  'Y': '[YỲÝỶỸỴ]',
  'D': '[DĐ]'
};

const toBaseVietnamese = (str: string): string => {
  return str
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'D');
};

const getDiacriticRegexClass = (char: string, matchCase: boolean): string => {
  if (!matchCase) {
    const lower = char.toLowerCase();
    return DIACRITIC_CLASSES_LOWER[lower] || escapeRegExp(char);
  } else {
    if (DIACRITIC_CLASSES_UPPER[char]) {
      return DIACRITIC_CLASSES_UPPER[char];
    }
    if (DIACRITIC_CLASSES_LOWER[char]) {
      return DIACRITIC_CLASSES_LOWER[char];
    }
    return escapeRegExp(char);
  }
};

const buildSearchRegex = (findText: string, matchCase: boolean, matchDiacritics: boolean): RegExp | null => {
  if (!findText) return null;
  try {
    if (matchDiacritics) {
      return new RegExp(escapeRegExp(findText), matchCase ? 'g' : 'gi');
    } else {
      const baseText = toBaseVietnamese(findText);
      let regexPattern = '';
      for (let i = 0; i < baseText.length; i++) {
        regexPattern += getDiacriticRegexClass(baseText[i], matchCase);
      }
      return new RegExp(regexPattern, matchCase ? 'g' : 'gi');
    }
  } catch (e) {
    console.error("Failed to build regex", e);
    return null;
  }
};

const EditableSegment = ({ 
    text, 
    onUpdate,
    isFocusMode,
    findText,
    matchCase,
    matchDiacritics,
    novelId,
    onEnterPress
}: { 
    text: string; 
    onUpdate: (val: string) => void;
    isFocusMode?: boolean;
    findText?: string;
    matchCase?: boolean;
    matchDiacritics?: boolean;
    novelId?: string;
    onEnterPress?: () => void;
}) => {
    const [localText, setLocalText] = useState(text);
    const [isFocused, setIsFocused] = useState(false);
    const [shortcuts, setShortcuts] = useState<TextShortcut[]>(() => getStoredShortcuts(novelId));
    const textareaRef = useRef<HTMLTextAreaElement>(null);
    const debounceTimeout = useRef<NodeJS.Timeout | null>(null);
    
    useEffect(() => {
        setLocalText(text);
    }, [text]);

    useEffect(() => {
        setShortcuts(getStoredShortcuts(novelId));
    }, [novelId]);

    useEffect(() => {
        const handleUpdate = () => {
            setShortcuts(getStoredShortcuts(novelId));
        };
        window.addEventListener('shortcuts_updated', handleUpdate);
        window.addEventListener('shortcuts_toggle', handleUpdate);
        return () => {
            window.removeEventListener('shortcuts_updated', handleUpdate);
            window.removeEventListener('shortcuts_toggle', handleUpdate);
        };
    }, [novelId]);
    
    const adjustHeight = () => {
        if (textareaRef.current) {
            textareaRef.current.style.height = '0px';
            const scrollHeight = textareaRef.current.scrollHeight;
            textareaRef.current.style.height = `${scrollHeight}px`;
        }
    };

    useEffect(() => {
        adjustHeight();
        const timer = setTimeout(adjustHeight, 10);
        window.addEventListener('resize', adjustHeight);
        return () => {
            window.removeEventListener('resize', adjustHeight);
            clearTimeout(timer);
        };
    }, [localText, isFocusMode, isFocused]);

    const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.altKey && !e.metaKey) {
            e.preventDefault();
            // Cập nhật giá trị ngay lập tức
            if (debounceTimeout.current) {
                clearTimeout(debounceTimeout.current);
            }
            onUpdate(localText);
            // Gọi callback chuyển dòng tiếp theo và đánh dấu xong
            onEnterPress?.();
            return;
        }

        const triggerKeys = [' ', 'Enter', 'Tab', ',', '.', '?', '!', ';', ':'];
        if (triggerKeys.includes(e.key)) {
            const triggerChar = e.key === 'Tab' ? '\t' : (e.key === 'Enter' ? '\n' : e.key);
            const { replaced, newText } = checkAndApplyShortcut(e.currentTarget, shortcuts, triggerChar);
            if (replaced) {
                e.preventDefault();
                setLocalText(newText);
                adjustHeight();
                if (debounceTimeout.current) {
                    clearTimeout(debounceTimeout.current);
                }
                debounceTimeout.current = setTimeout(() => {
                    onUpdate(newText);
                }, 200);
            }
        }
    };

    const handleChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
        const val = e.target.value;
        setLocalText(val);

        if (debounceTimeout.current) {
            clearTimeout(debounceTimeout.current);
        }
        debounceTimeout.current = setTimeout(() => {
            onUpdate(val);
        }, 500);
    };

    const handleBlur = (e: React.FocusEvent<HTMLTextAreaElement>) => {
        setIsFocused(false);
        if (debounceTimeout.current) {
            clearTimeout(debounceTimeout.current);
        }
        onUpdate(e.target.value);
    };

    const handleFocus = () => {
        setIsFocused(true);
    };

    const regex = findText ? buildSearchRegex(findText, matchCase ?? false, matchDiacritics ?? true) : null;
    const hasSearchMatch = regex ? regex.test(localText) : false;

    const renderSearchTextHighlight = (plainText: string) => {
        if (!plainText) return "";
        if (!findText) return plainText;
        const searchRegex = buildSearchRegex(findText, matchCase ?? false, matchDiacritics ?? true);
        if (!searchRegex) return plainText;

        const parts = plainText.split(searchRegex);
        const matches = plainText.match(searchRegex) || [];

        let matchIdx = 0;
        return parts.map((part, idx) => {
            if (idx > 0) {
                const matched = matches[matchIdx++];
                return (
                    <React.Fragment key={idx}>
                        <mark className="bg-amber-200 text-amber-950 font-medium px-0.5 rounded shadow-sm">
                            {matched}
                        </mark>
                        {part}
                    </React.Fragment>
                );
            }
            return part;
        });
    };

    if (findText && hasSearchMatch && !isFocused) {
        return (
            <div 
                onClick={() => {
                    setIsFocused(true);
                    setTimeout(() => textareaRef.current?.focus(), 20);
                }}
                className={`w-full bg-transparent border-none p-0 text-[#4E342E] leading-[1.2] ${isFocusMode ? 'text-[19px]' : 'text-[15px]'} m-0 block whitespace-pre-wrap break-words min-h-[1.2em] cursor-text`}
                style={{ fontWeight: 400, display: 'block', margin: 0 }}
            >
                {renderSearchTextHighlight(localText)}
            </div>
        );
    }

    return (
        <textarea
            ref={textareaRef}
            value={localText}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onBlur={handleBlur}
            onFocus={handleFocus}
            placeholder="..."
            className={`w-full bg-transparent border-none outline-none resize-none overflow-hidden p-0 text-[#4E342E] placeholder:text-[#A1887F]/30 leading-[1.2] ${isFocusMode ? 'text-[19px]' : 'text-[15px]'} focus:ring-0 m-0 block whitespace-normal min-h-[1.2em]`}
            style={{ fontWeight: 400, display: 'block', margin: 0 }}
            rows={1}
            spellCheck={false}
        />
    );
};



export const TranslationOutput: React.FC<TranslationOutputProps> = ({ 
    data, 
    customTerms = [], 
    characters = [],
    completedSegments = [],
    onUpdateSegment,
    onUpdateAllSegments,
    onToggleComplete,
    onSaveChapter,
    onUndo,
    onRedo,
    canUndo,
    canRedo,
    isFocusMode,
    onToggleFocusMode,
    onUpdateTerms,
    onUpdateCharacters,
    currentNovelId
}) => {
  const [showNamingModal, setShowNamingModal] = useState(false);
  const [exportFileName, setExportFileName] = useState('');
  const [showSaveArchiveModal, setShowSaveArchiveModal] = useState(false);
  const [archiveChapterName, setArchiveChapterName] = useState('');
  const [vpVersion, setVpVersion] = useState(0);
  const [activeVocab, setActiveVocab] = useState<{ 
    item: VocabItem; 
    position: { x: number; y: number }; 
    side: 'top' | 'bottom';
    type?: 'char' | 'custom' | 'ai';
    rawItem?: CustomTerm | Character | VocabItem;
  } | null>(null);

  const [isEditingVocabPopup, setIsEditingVocabPopup] = useState(false);
  const [popupMeaningInput, setPopupMeaningInput] = useState('');
  const [popupCategoryInput, setPopupCategoryInput] = useState('');
  const [popupPronounsInput, setPopupPronounsInput] = useState('Hắn');
  const [popupDescInput, setPopupDescInput] = useState('');
  const [copiedMode, setCopiedMode] = useState<'all' | 'parallel' | null>(null);
  const popupRef = useRef<HTMLDivElement>(null);

  // Search and replace states
  const [showSearchReplace, setShowSearchReplace] = useState(false);
  const [findText, setFindText] = useState('');
  const [replaceText, setReplaceText] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [matchDiacritics, setMatchDiacritics] = useState(true);

  // Calculate search match count
  const matchingSegmentIndices = React.useMemo(() => {
    if (!findText || !data.segments) return [];
    try {
      const regex = buildSearchRegex(findText, matchCase, matchDiacritics);
      if (!regex) return [];
      return data.segments
        .map((seg, idx) => {
          const hasMatch = regex.test(seg.natural || '') || regex.test(seg.source || '');
          return hasMatch ? idx : -1;
        })
        .filter(idx => idx !== -1);
    } catch (e) {
      return [];
    }
  }, [findText, matchCase, matchDiacritics, data.segments]);

  const matchCount = React.useMemo(() => {
    if (!findText || !data.segments) return 0;
    try {
      const regex = buildSearchRegex(findText, matchCase, matchDiacritics);
      if (!regex) return 0;
      let count = 0;
      data.segments.forEach(seg => {
        const matches = (seg.natural || '').match(regex);
        if (matches) count += matches.length;
      });
      return count;
    } catch (e) {
      return 0;
    }
  }, [findText, matchCase, matchDiacritics, data.segments]);

  const [currentMatchIndex, setCurrentMatchIndex] = useState(0);

  useEffect(() => {
    setCurrentMatchIndex(0);
  }, [matchingSegmentIndices.length, findText]);

  useEffect(() => {
    if (matchingSegmentIndices.length > 0 && currentMatchIndex >= 0 && currentMatchIndex < matchingSegmentIndices.length) {
      const targetIdx = matchingSegmentIndices[currentMatchIndex];
      const element = document.getElementById(`segment-row-${targetIdx}`);
      if (element) {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [currentMatchIndex, matchingSegmentIndices]);

  const handleNextMatch = () => {
    if (matchingSegmentIndices.length === 0) return;
    setCurrentMatchIndex(prev => (prev + 1) % matchingSegmentIndices.length);
  };

  const handlePrevMatch = () => {
    if (matchingSegmentIndices.length === 0) return;
    setCurrentMatchIndex(prev => (prev - 1 + matchingSegmentIndices.length) % matchingSegmentIndices.length);
  };

  // Execute search and replace
  const handleReplaceAll = () => {
    if (!findText || !data.segments) return;
    try {
      const regex = buildSearchRegex(findText, matchCase, matchDiacritics);
      if (!regex) return;
      const newNaturals = data.segments.map(seg => (seg.natural || '').replace(regex, replaceText));
      onUpdateAllSegments?.(newNaturals);
    } catch (e) {
      console.error(e);
    }
  };

  // Subscribe to vietphrase changes to trigger re-renders
  useEffect(() => {
    return vietphraseEngine.subscribe(() => {
      setVpVersion(prev => prev + 1);
    });
  }, []);

  // Filter terms and characters for current novel
  const currentCustomTerms = useMemo(() => {
    const list = Array.isArray(customTerms) ? customTerms : [];
    if (!currentNovelId) return list;
    return list.filter(t => !t.novelId || t.novelId === currentNovelId);
  }, [customTerms, currentNovelId]);

  const currentCharacters = useMemo(() => {
    const list = Array.isArray(characters) ? characters : [];
    if (!currentNovelId) return list;
    return list.filter(c => !c.novelId || c.novelId === currentNovelId);
  }, [characters, currentNovelId]);

  // Combined terms map for Vietphrase translate (customTerms take priority over characters)
  const customMap = React.useMemo(() => {
    const map = new Map<string, string>();
    currentCharacters.forEach(c => {
      if (c.chineseName && c.vietName) {
        map.set(c.chineseName.trim(), c.vietName.trim());
      }
    });
    currentCustomTerms.forEach(t => {
      if (t.term && t.meaning) {
        map.set(t.term.trim(), t.meaning.trim());
      }
    });
    return map;
  }, [currentCustomTerms, currentCharacters]);

  // --- SELECTION POPUP STATE ---
  const [selectionPopup, setSelectionPopup] = useState<{
    text: string;
    vietphrase: string;
    rect: { left: number; right: number; top: number; bottom: number; width: number; height: number };
    type: 'idle' | 'vocab' | 'char';
  } | null>(null);

  const popupCoords = useMemo(() => {
    if (!selectionPopup) return { left: 0, top: 0, width: 280 };
    const { rect, type } = selectionPopup;
    
    // Horizontal space constraints
    const maxW = type === 'idle' ? 280 : 320;
    const W = Math.min(maxW, window.innerWidth - 24);
    
    // Approximate popup heights for clamping and placement
    const H = type === 'idle' ? 210 : type === 'vocab' ? 230 : 320;

    // Scroll offsets for absolute positioning relative to body
    const scrollX = typeof window !== 'undefined' ? window.scrollX : 0;
    const scrollY = typeof window !== 'undefined' ? window.scrollY : 0;

    // Horizontal placement: center relative to the selection rect
    let left = rect.left + rect.width / 2 - W / 2;
    // Clamp horizontally with 12px padding from viewport boundaries
    left = Math.max(12, Math.min(left, window.innerWidth - W - 12));
    left += scrollX;

    // Vertical placement: default is above the selection (with 8px spacing)
    let top = rect.top - H - 8;
    
    // If the popup would overflow the top of the viewport (< 12px)
    if (top < 12) {
      // Put it below the selection rect instead
      top = rect.bottom + 8;
    }
    
    // Safety clamp vertical position relative to viewport height
    top = Math.max(12, Math.min(top, window.innerHeight - H - 12));
    top += scrollY;

    return { left, top, width: W };
  }, [selectionPopup]);

  const [vocabMeaning, setVocabMeaning] = useState('');
  const [vocabCategory, setVocabCategory] = useState('');
  const [isCreatingCategory, setIsCreatingCategory] = useState(false);
  const [newCategoryInput, setNewCategoryInput] = useState('');
  const [charVietName, setCharVietName] = useState('');
  const [charPronoun, setCharPronoun] = useState('Hắn');
  const [charDescription, setCharDescription] = useState('');
  const [saveStatus, setSaveStatus] = useState<{ type: 'success' | 'error'; message: string } | null>(null);

  const DEFAULT_CATEGORIES = ['Vật phẩm', 'Địa danh', 'Chiêu thức', 'Môn phái', 'Nhân vật', 'Thành thị', 'Vũ khí', 'Trạng thái', 'Hành động', 'Thường dùng', 'Khác'];

  const allCategories = useMemo(() => {
    const unique = Array.from(new Set(currentCustomTerms.map(t => t.category).filter(Boolean))) as string[];
    const categoriesSet = new Set([...DEFAULT_CATEGORIES, ...unique]);
    if (vocabCategory && vocabCategory.trim() && vocabCategory !== '__new__') {
      categoriesSet.add(vocabCategory.trim());
    }
    return Array.from(categoriesSet);
  }, [currentCustomTerms, vocabCategory]);

  const handleSaveSelectedVocab = () => {
    console.log("handleSaveSelectedVocab called", { selectionPopup, vocabMeaning, hasOnUpdateTerms: !!onUpdateTerms });
    
    if (!selectionPopup) {
      setSaveStatus({ type: 'error', message: 'Không tìm thấy vùng chọn!' });
      return;
    }
    if (!vocabMeaning.trim()) {
      setSaveStatus({ type: 'error', message: 'Vui lòng điền nghĩa tiếng Việt!' });
      return;
    }
    if (!onUpdateTerms) {
      setSaveStatus({ type: 'error', message: 'Hệ thống lỗi: thiếu hàm lưu từ vựng!' });
      return;
    }

    try {
      const cleanTerm = selectionPopup.text.trim();
      const cleanMeaning = vocabMeaning.trim();

      const newTerm: CustomTerm = {
        id: Date.now().toString(),
        novelId: currentNovelId || '',
        term: cleanTerm,
        meaning: cleanMeaning,
        category: vocabCategory.trim() || undefined
      };

      const safeTerms = currentCustomTerms;
      
      // Duplicate check
      const duplicateExists = safeTerms.some(t => t.term === cleanTerm && t.meaning === cleanMeaning);
      if (duplicateExists) {
        setSaveStatus({ type: 'success', message: 'Từ vựng này đã có sẵn!' });
        setTimeout(() => {
          setSelectionPopup(null);
          setSaveStatus(null);
          setVocabCategory('');
          setIsCreatingCategory(false);
          setNewCategoryInput('');
        }, 800);
        return;
      }

      onUpdateTerms([...safeTerms, newTerm]);
      setSaveStatus({ type: 'success', message: 'Đã thêm từ vựng thành công!' });
      setTimeout(() => {
        setSelectionPopup(null);
        setSaveStatus(null);
        setVocabCategory('');
        setIsCreatingCategory(false);
        setNewCategoryInput('');
      }, 800);
    } catch (err: any) {
      console.error("Save vocab error:", err);
      setSaveStatus({ type: 'error', message: err.message || 'Lỗi khi lưu từ vựng!' });
    }
  };

  const handleSaveSelectedCharacter = () => {
    console.log("handleSaveSelectedCharacter called", { selectionPopup, charVietName, hasOnUpdateCharacters: !!onUpdateCharacters });

    if (!selectionPopup) {
      setSaveStatus({ type: 'error', message: 'Không tìm thấy vùng chọn!' });
      return;
    }
    if (!charVietName.trim()) {
      setSaveStatus({ type: 'error', message: 'Vui lòng điền tên nhân vật!' });
      return;
    }
    if (!onUpdateCharacters) {
      setSaveStatus({ type: 'error', message: 'Hệ thống lỗi: thiếu hàm lưu nhân vật!' });
      return;
    }

    try {
      const cleanChinese = selectionPopup.text.trim();
      const cleanViet = charVietName.trim();

      const newChar: Character = {
        id: Date.now().toString(),
        novelId: currentNovelId || '',
        chineseName: cleanChinese,
        vietName: cleanViet,
        pronouns: charPronoun.trim() || 'Hắn',
        description: charDescription.trim()
      };

      const safeCharacters = currentCharacters;
      
      // Duplicate check
      const duplicateExists = safeCharacters.some(c => c.chineseName === cleanChinese && c.vietName === cleanViet);
      if (duplicateExists) {
        setSaveStatus({ type: 'success', message: 'Nhân vật này đã có sẵn!' });
        setTimeout(() => {
          setSelectionPopup(null);
          setSaveStatus(null);
        }, 800);
        return;
      }

      onUpdateCharacters([...safeCharacters, newChar]);
      setSaveStatus({ type: 'success', message: 'Đã thêm nhân vật thành công!' });
      setTimeout(() => {
        setSelectionPopup(null);
        setSaveStatus(null);
      }, 800);
    } catch (err: any) {
      console.error("Save character error:", err);
      setSaveStatus({ type: 'error', message: err.message || 'Lỗi khi lưu nhân vật!' });
    }
  };

  // Selection change or mouseup listener
  useEffect(() => {
    const handleMouseUp = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest('.selection-popup-container')) {
        return;
      }

      const selection = window.getSelection();
      if (!selection || selection.isCollapsed) {
        setSelectionPopup(null);
        return;
      }

      const selectedText = selection.toString().trim();
      // Only trigger if selection is Chinese text or general text of reasonable length
      if (selectedText.length > 0 && selectedText.length < 150) {
        try {
          const range = selection.getRangeAt(0);
          const rect = range.getBoundingClientRect();

          // Compute Vietphrase
          const vpText = vietphraseEngine.translate(selectedText, customMap);

          setSelectionPopup({
            text: selectedText,
            vietphrase: vpText || '',
            rect: {
              left: rect.left,
              right: rect.right,
              top: rect.top,
              bottom: rect.bottom,
              width: rect.width,
              height: rect.height
            },
            type: 'idle'
          });

          setVocabMeaning(vpText || '');
          setCharVietName(vpText || '');
          setCharPronoun('Hắn');
          setCharDescription('');
        } catch (err) {
          console.warn("Failed to capture range bounding rect:", err);
        }
      } else {
        setSelectionPopup(null);
      }
    };

    window.addEventListener('mouseup', handleMouseUp);
    return () => {
      window.removeEventListener('mouseup', handleMouseUp);
    };
  }, [customTerms, characters, customMap, onUpdateTerms, onUpdateCharacters, currentNovelId]);

  const handleEnterNextSegment = (currentIdx: number) => {
    // 1. Tự động đánh dấu hoàn thành dòng hiện tại nếu chưa hoàn thành
    if (!completedSegments.includes(currentIdx)) {
      onToggleComplete?.(currentIdx);
    }

    // 2. Tìm dòng tiếp theo
    const nextIdx = currentIdx + 1;
    if (nextIdx < (data.segments?.length || 0)) {
      setTimeout(() => {
        const nextRow = document.getElementById(`segment-row-${nextIdx}`);
        if (nextRow) {
          // Lướt xuống vị trí dòng tiếp theo mượt mà
          nextRow.scrollIntoView({ behavior: 'smooth', block: 'center' });
          // Focus vào ô textarea của dòng tiếp theo
          const nextTextarea = nextRow.querySelector('textarea');
          if (nextTextarea) {
            nextTextarea.focus();
            const len = nextTextarea.value.length;
            nextTextarea.setSelectionRange(len, len);
          }
        }
      }, 50);
    }
  };

  const copyToClipboard = (text: string, mode: 'all' | 'parallel') => {
    navigator.clipboard.writeText(text.trim());
    setCopiedMode(mode);
    setTimeout(() => setCopiedMode(null), 2000);
  };

  const hasSegments = data.segments && data.segments.length > 0;
  
  // SỬA ĐỔI: Dùng .join('\n') để dính sát nhau
  const getParallelText = () => data.segments.map(seg => `${(seg.source || '').trim()}\n${(seg.natural || '').trim()}`).join('\n');
  const getNaturalText = () => data.segments.map(seg => (seg.natural || '').trim()).join('\n');

  const performWordExport = (fileName: string) => {
    if (!data.segments || data.segments.length === 0) return;

    let tableRowsHtml = "";
    data.segments.forEach((seg, idx) => {
      const cleanSource = (seg.source || '').trim();
      const cleanNatural = (seg.natural || '').trim();
      const cleanDeepl = (seg.deepl || '').trim();
      const cleanQuick = (vietphraseEngine.translate(cleanSource, customMap) || '').trim();

      if (!cleanSource && !cleanNatural) return;

      tableRowsHtml += `
        <tr>
          <td style="border: 1px solid #D7CCC8; padding: 8px; vertical-align: top; font-family: 'SimSun', serif; font-size: 11pt; background-color: #FFFDF7; width: 22%;">${cleanSource}</td>
          <td style="border: 1px solid #D7CCC8; padding: 8px; vertical-align: top; font-family: 'Times New Roman', serif; font-size: 10.5pt; color: #8D6E63; width: 23%;">${cleanQuick}</td>
          <td style="border: 1px solid #D7CCC8; padding: 8px; vertical-align: top; font-family: 'Times New Roman', serif; font-size: 10.5pt; color: #A1887F; width: 23%;">${cleanDeepl}</td>
          <td style="border: 1px solid #D7CCC8; padding: 8px; vertical-align: top; font-family: 'Times New Roman', serif; font-size: 11pt; color: #3E2723; width: 32%;">${cleanNatural}</td>
        </tr>
      `;
    });

    const htmlContent = `
      <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
      <head>
        <meta charset="utf-8">
        <title>${fileName}</title>
        <style>
          body { font-family: "Times New Roman", Times, serif; font-size: 11pt; color: #333333; }
          table { border-collapse: collapse; width: 100%; margin-top: 15px; }
          th { background-color: #EFEBE9; color: #3E2723; border: 1px solid #D7CCC8; padding: 10px 8px; font-weight: bold; text-align: left; font-size: 11pt; }
        </style>
      </head>
      <body>
        <table>
          <thead>
            <tr>
              <th style="width: 22%; background-color: #EFEBE9; color: #3E2723; border: 1px solid #D7CCC8;">Raw</th>
              <th style="width: 23%; background-color: #EFEBE9; color: #3E2723; border: 1px solid #D7CCC8;">Vietphrase</th>
              <th style="width: 23%; background-color: #EFEBE9; color: #3E2723; border: 1px solid #D7CCC8;">GG/DL</th>
              <th style="width: 32%; background-color: #EFEBE9; color: #3E2723; border: 1px solid #D7CCC8;">Bản edit</th>
            </tr>
          </thead>
          <tbody>
            ${tableRowsHtml}
          </tbody>
        </table>
      </body>
      </html>
    `;

    const blob = new Blob(['\ufeff' + htmlContent], { type: 'application/msword' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleConfirmExport = () => {
    let name = exportFileName.trim();
    if (!name) {
      name = `Bang_doi_chieu_${new Date().toISOString().slice(0, 10)}`;
    }
    if (!name.endsWith('.doc') && !name.endsWith('.docx')) {
      name += '.doc';
    }
    performWordExport(name);
    setShowNamingModal(false);
  };

  const exportToWord = () => {
    if (!data.segments || data.segments.length === 0) return;
    const defaultName = `Bang_doi_chieu_${new Date().toISOString().slice(0, 10)}`;
    setExportFileName(defaultName);
    setShowNamingModal(true);
  };

  const handleConfirmSaveArchive = () => {
    let name = archiveChapterName.trim();
    if (!name) {
      name = `Chương_${new Date().toISOString().slice(0, 10)}`;
    }
    onSaveChapter?.(name);
    setShowSaveArchiveModal(false);
  };

  const saveToArchive = () => {
    if (!data.segments || data.segments.length === 0) return;
    const defaultName = `Chương_${new Date().toISOString().slice(0, 10)}`;
    setArchiveChapterName(defaultName);
    setShowSaveArchiveModal(true);
  };

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (popupRef.current && !popupRef.current.contains(event.target as Node)) setActiveVocab(null);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  const handleVocabClick = (
    event: React.MouseEvent, 
    vocab: VocabItem & { rawItem?: CustomTerm | Character | VocabItem }, 
    type: 'char' | 'custom' | 'ai' = 'ai'
  ) => {
     const selection = window.getSelection();
     if (selection && !selection.isCollapsed && selection.toString().trim().length > 0) {
       // Ignore click if the user is currently selecting text
       return;
     }

     event.stopPropagation();
     const rect = event.currentTarget.getBoundingClientRect();
     const viewportHeight = window.innerHeight;
     const spaceBelow = viewportHeight - rect.bottom;
     
     const side = spaceBelow < 260 ? 'top' : 'bottom';
     
     let x = rect.left + rect.width / 2;
     let y = side === 'bottom' 
        ? rect.bottom + 10
        : rect.top - 10;

     if (x < 130) x = 130;
     if (x > window.innerWidth - 130) x = window.innerWidth - 130;
     
     setIsEditingVocabPopup(false);
     setPopupMeaningInput(vocab.meaning || '');

     if (type === 'custom') {
       const raw = vocab.rawItem as CustomTerm;
       setPopupCategoryInput(raw?.category || 'Thường dùng');
     } else if (type === 'char') {
       const raw = vocab.rawItem as Character;
       setPopupMeaningInput(raw?.vietName || vocab.meaning || '');
       setPopupPronounsInput(raw?.pronouns || 'Hắn');
       setPopupDescInput(raw?.description || '');
     } else {
       setPopupCategoryInput('Thường dùng');
       setPopupPronounsInput('Hắn');
       setPopupDescInput(vocab.explanation || '');
     }

     setActiveVocab({ item: vocab, position: { x, y }, side, type, rawItem: vocab.rawItem });
  };

  const handleSaveEditVocabPopup = (vocab: NonNullable<typeof activeVocab>) => {
    if (!vocab) return;
    if (vocab.type === 'custom') {
      const raw = vocab.rawItem as CustomTerm;
      const termToMatch = raw ? raw.term : vocab.item.term;
      const updatedTerms = currentCustomTerms.map(t => {
        if ((raw && t.id === raw.id) || t.term === termToMatch) {
          return {
            ...t,
            meaning: popupMeaningInput.trim(),
            category: popupCategoryInput.trim() || undefined
          };
        }
        return t;
      });
      onUpdateTerms?.(updatedTerms);
    } else if (vocab.type === 'char') {
      const raw = vocab.rawItem as Character;
      const chineseToMatch = raw ? raw.chineseName : vocab.item.term;
      const updatedChars = currentCharacters.map(c => {
        if ((raw && c.id === raw.id) || c.chineseName === chineseToMatch) {
          return {
            ...c,
            vietName: popupMeaningInput.trim(),
            pronouns: popupPronounsInput.trim() || 'Hắn',
            description: popupDescInput.trim()
          };
        }
        return c;
      });
      onUpdateCharacters?.(updatedChars);
    }
    setIsEditingVocabPopup(false);
    setActiveVocab(null);
  };

  const handleDeleteVocabFromPopup = (vocab: NonNullable<typeof activeVocab>) => {
    if (!vocab) return;
    if (vocab.type === 'custom') {
      const raw = vocab.rawItem as CustomTerm;
      const termToMatch = raw ? raw.term : vocab.item.term;
      const updatedTerms = currentCustomTerms.filter(t => (raw ? t.id !== raw.id : t.term !== termToMatch));
      onUpdateTerms?.(updatedTerms);
    } else if (vocab.type === 'char') {
      const raw = vocab.rawItem as Character;
      const chineseToMatch = raw ? raw.chineseName : vocab.item.term;
      const updatedChars = currentCharacters.filter(c => (raw ? c.id !== raw.id : c.chineseName !== chineseToMatch));
      onUpdateCharacters?.(updatedChars);
    }
    setIsEditingVocabPopup(false);
    setActiveVocab(null);
  };

  const handleQuickAddAiVocab = (item: VocabItem, addType: 'term' | 'char') => {
    if (addType === 'term') {
      const newTerm: CustomTerm = {
        id: Date.now().toString(),
        novelId: currentNovelId || '',
        term: item.term.trim(),
        meaning: (popupMeaningInput || item.meaning).trim(),
        category: (popupCategoryInput || 'Thường dùng').trim()
      };
      onUpdateTerms?.([...currentCustomTerms, newTerm]);
    } else {
      const newChar: Character = {
        id: Date.now().toString(),
        novelId: currentNovelId || '',
        chineseName: item.term.trim(),
        vietName: (popupMeaningInput || item.meaning).trim(),
        pronouns: popupPronounsInput || 'Hắn',
        description: popupDescInput || item.explanation || ''
      };
      onUpdateCharacters?.([...currentCharacters, newChar]);
    }
    setActiveVocab(null);
  };

  const { pattern, termMap } = React.useMemo(() => {
    const map = new Map<string, VocabItem & { type: 'char' | 'custom' | 'ai'; rawItem?: CustomTerm | Character | VocabItem }>();
    const aiVocab = data.vocabulary || [];

    const allTerms = [
        ...currentCustomTerms.map(c => ({ term: c.term, item: c, type: 'custom' as const })),
        ...currentCharacters.map(c => ({ term: c.chineseName, item: c, type: 'char' as const })),
        ...aiVocab.map(v => ({ term: v.term, item: v, type: 'ai' as const }))
    ]
    .filter(t => t.term && t.term.trim().length > 0);

    // Sort by length descending, then by type priority (custom > char > ai)
    const typePriority = { custom: 1, char: 2, ai: 3 };
    allTerms.sort((a, b) => {
        if (b.term.length !== a.term.length) {
            return b.term.length - a.term.length;
        }
        return typePriority[a.type] - typePriority[b.type];
    });

    allTerms.forEach(({ term, item, type }) => {
        if (!map.has(term)) {
            let vocabItem: VocabItem;
            if (type === 'char') {
                 const c = item as Character;
                 vocabItem = { term: c.chineseName, pinyin: "Nhân vật", hanViet: c.vietName, meaning: c.vietName, explanation: `(Ngôi 3: ${c.pronouns}) ${c.description || ''}` };
            } else if (type === 'custom') {
                 const c = item as CustomTerm;
                 vocabItem = { term: c.term, pinyin: "Từ điển riêng", hanViet: c.category || "Custom", meaning: c.meaning, explanation: "Từ vựng khớp với danh sách từ điển riêng của bạn." };
            } else {
                 vocabItem = item as VocabItem;
            }
            map.set(term, { ...vocabItem, type, rawItem: item });
        }
    });

    const uniqueTerms = Array.from(map.keys());
    if (uniqueTerms.length === 0) return { pattern: null, termMap: map };
    
    const pattern = new RegExp(`(${uniqueTerms.map(t => escapeRegExp(t)).join('|')})`, 'g');
    
    return { pattern, termMap: map };
  }, [currentCharacters, currentCustomTerms, data.vocabulary]);

  const renderSourceWithHighlight = (text: string) => {
    const trimmedText = (text || "").trim();
    if (!trimmedText) return null;

    const searchRegex = findText ? buildSearchRegex(findText, matchCase, matchDiacritics) : null;

    const renderSearchTextHighlight = (plainText: string) => {
      if (!plainText) return "";
      if (!searchRegex) return plainText;

      const parts = plainText.split(searchRegex);
      const matches = plainText.match(searchRegex) || [];

      let matchIdx = 0;
      return parts.map((part, idx) => {
        if (idx > 0) {
          const matched = matches[matchIdx++];
          return (
            <React.Fragment key={idx}>
              <mark className="bg-amber-200 text-amber-950 font-semibold px-0.5 rounded shadow-sm">
                {matched}
              </mark>
              {part}
            </React.Fragment>
          );
        }
        return part;
      });
    };

    if (!pattern) {
      if (searchRegex) {
        return <>{renderSearchTextHighlight(trimmedText)}</>;
      }
      return trimmedText;
    }

    return trimmedText.split(pattern).map((part, i) => {
        if (!part) return null;
        const match = termMap.get(part);

        if (match) {
             if (match.type === 'char') {
                 return <span key={i} onClick={(e) => handleVocabClick(e, match, 'char')} className="border-b border-dashed border-[#5D4037] bg-[#EFEBE9] cursor-pointer hover:bg-[#D7CCC8] transition-colors rounded-sm px-0.5 text-[#3E2723] font-bold leading-none inline-block">{part}</span>;
             } else if (match.type === 'custom') {
                 return <span key={i} onClick={(e) => handleVocabClick(e, match, 'custom')} className="border-b border-dashed border-[#5D4037] bg-[#EFEBE9] cursor-pointer hover:bg-[#D7CCC8] transition-colors rounded-sm px-0.5 text-[#3E2723] font-bold leading-none inline-block">{part}</span>;
             } else if (match.type === 'ai') {
                 return <span key={i} onClick={(e) => handleVocabClick(e, match, 'ai')} className="border-b-2 border-dashed border-[#FBC02D] bg-[#FFF9C4] cursor-pointer hover:bg-[#FFF176] transition-colors rounded-sm px-0.5 text-[#3E2723] font-bold leading-none inline-block shadow-[inset_0_-2px_0_rgba(251,192,45,0.2)]">{part}</span>;
             }
        }

        if (searchRegex && searchRegex.test(part)) {
          return <React.Fragment key={i}>{renderSearchTextHighlight(part)}</React.Fragment>;
        }

        return part;
    });
  };

  return (
    <div className="bg-white flex flex-col h-full overflow-hidden relative border border-[#D7CCC8] rounded-xl shadow-sm">
      <div className="shrink-0 bg-white">
          <div className="flex items-center justify-between bg-[#EFEBE9] px-3 py-1 border-b border-[#D7CCC8]">
             <div className="flex items-center gap-1.5 text-[#3E2723] font-bold text-[10px] uppercase tracking-tight"><TableProperties size={12} /><span>Bảng đối chiếu</span></div>
             <div className="flex items-center gap-1">
                {/* Undo / Redo */}
                <div className="flex items-center gap-0.5 border-r border-[#D7CCC8] pr-1.5 mr-0.5">
                   <button 
                      onClick={onUndo} onMouseDown={(e) => e.preventDefault()} 
                      disabled={!canUndo} 
                      title="Hoàn tác (Ctrl+Z)"
                      className="p-1 rounded text-[#5D4037] hover:bg-[#D7CCC8] disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                   >
                      <Undo2 size={11} />
                   </button>
                   <button 
                      onClick={onRedo} onMouseDown={(e) => e.preventDefault()} 
                      disabled={!canRedo} 
                      title="Làm lại (Ctrl+Y)"
                      className="p-1 rounded text-[#5D4037] hover:bg-[#D7CCC8] disabled:opacity-30 disabled:hover:bg-transparent transition-colors"
                   >
                      <Redo2 size={11} />
                   </button>
                </div>

                {/* Batch Search and Replace */}
                <button 
                   onClick={() => setShowSearchReplace(!showSearchReplace)} 
                   title="Tìm kiếm & Thay thế"
                   className={`p-1 rounded text-[#5D4037] hover:bg-[#D7CCC8] transition-colors mr-1 ${showSearchReplace ? 'bg-[#D7CCC8]' : ''}`}
                >
                   <Search size={11} />
                </button>

                {/* Focus mode */}
                <button 
                   onClick={onToggleFocusMode} 
                   title={isFocusMode ? "Hủy tập trung (Hiện 2 bên)" : "Tập trung (Mở rộng tối đa)"}
                   className={`p-1 rounded border transition-colors shadow-sm mr-1 ${isFocusMode ? 'bg-[#FFECB3] border-[#FFD54F] text-[#3E2723] hover:bg-[#FFE082]' : 'bg-white border-[#D7CCC8] text-[#5D4037] hover:bg-[#D7CCC8]'}`}
                >
                   {isFocusMode ? <Minimize2 size={11} /> : <Maximize2 size={11} />}
                </button>

                {/* Edit & Raw copy button */}
                <button 
                   onClick={() => copyToClipboard(getParallelText(), 'parallel')} 
                   title="Sao chép Đối chiếu (Gốc & Edit)" 
                   className="p-1 rounded text-[#5D4037] hover:text-[#3E2723] bg-white border border-[#D7CCC8] hover:bg-[#D7CCC8] transition-colors shadow-sm mr-1"
                >
                   {copiedMode === 'parallel' ? <Check size={11} className="text-green-600 font-bold" /> : <ClipboardList size={11} />}
                </button>

                {/* Edit only copy button */}
                <button 
                   onClick={() => copyToClipboard(getNaturalText(), 'all')} 
                   title="Sao chép Bản dịch (Chỉ phần Edit)" 
                   className="p-1 rounded text-[#8D6E63] hover:text-[#3E2723] bg-white border border-[#D7CCC8] hover:bg-[#D7CCC8] transition-colors shadow-sm mr-1"
                >
                   {copiedMode === 'all' ? <Check size={11} className="text-green-600 font-bold" /> : <Copy size={11} />}
                </button>

                {/* Export to Word button */}
                <button 
                   onClick={exportToWord} 
                   title="Xuất file Word (.docx)" 
                   className="p-1 rounded text-[#3E2723] hover:text-white hover:bg-[#5D4037] bg-white border border-[#D7CCC8] hover:bg-[#5D4037] transition-colors shadow-sm mr-1"
                >
                   <FileDown size={11} />
                </button>

                {/* Save chapter button */}
                {onSaveChapter && (
                   <button 
                      onClick={saveToArchive} 
                      title="Lưu vào Kho Lưu trữ Chương" 
                      className="p-1 rounded text-[#5D4037] hover:text-white hover:bg-[#8D6E63] bg-white border border-[#D7CCC8] hover:bg-[#8D6E63] transition-colors shadow-sm mr-1"
                   >
                      <BookOpen size={11} />
                   </button>
                )}
             </div>
          </div>
          {showSearchReplace && (
             <div className="bg-[#FFFDF7] border-b border-[#D7CCC8] p-2 px-3 flex flex-wrap items-center gap-3 animate-in slide-in-from-top-1 duration-150 shrink-0 select-none">
                <div className="flex items-center gap-1.5">
                   <span className="text-[10px] font-bold text-[#5D4037] uppercase tracking-wide">Tìm:</span>
                   <input 
                     type="text" 
                     value={findText}
                     onChange={(e) => setFindText(e.target.value)}
                     placeholder="Từ cần tìm..." 
                     className="bg-white border border-[#D7CCC8] rounded px-2 py-0.5 text-[11px] text-[#3E2723] outline-none focus:border-[#8D6E63] w-36 font-medium"
                   />
                </div>
                <div className="flex items-center gap-1.5">
                   <span className="text-[10px] font-bold text-[#5D4037] uppercase tracking-wide">Thay bằng:</span>
                   <input 
                     type="text" 
                     value={replaceText}
                     onChange={(e) => setReplaceText(e.target.value)}
                     placeholder="Từ thay thế..." 
                     className="bg-white border border-[#D7CCC8] rounded px-2 py-0.5 text-[11px] text-[#3E2723] outline-none focus:border-[#8D6E63] w-36 font-medium"
                   />
                </div>
                <div className="flex items-center gap-1.5">
                   <label className="flex items-center gap-1 cursor-pointer text-[10px] text-[#5D4037] font-medium select-none">
                      <input 
                        type="checkbox" 
                        checked={matchCase} 
                        onChange={(e) => setMatchCase(e.target.checked)}
                        className="rounded text-[#5D4037] focus:ring-[#8D6E63] border-[#D7CCC8] h-3 w-3"
                      />
                      <span>Phân biệt hoa thường</span>
                   </label>
                </div>
                <div className="flex items-center gap-1.5">
                   <label className="flex items-center gap-1 cursor-pointer text-[10px] text-[#5D4037] font-medium select-none">
                      <input 
                        type="checkbox" 
                        checked={matchDiacritics} 
                        onChange={(e) => setMatchDiacritics(e.target.checked)}
                        className="rounded text-[#5D4037] focus:ring-[#8D6E63] border-[#D7CCC8] h-3 w-3"
                      />
                      <span>Khớp dấu</span>
                   </label>
                </div>
                {findText && (
                   <div className="flex items-center gap-1 bg-[#FFF8E1] px-2 py-0.5 rounded border border-[#FFE082]">
                      <span className="text-[10.5px] font-semibold text-[#8D6E63]">
                         Khớp: {matchingSegmentIndices.length > 0 ? `${currentMatchIndex + 1}/${matchingSegmentIndices.length}` : '0'} ({matchCount} từ)
                      </span>
                      {matchingSegmentIndices.length > 0 && (
                         <div className="flex items-center gap-0.5 border-l border-[#FFE282] pl-1 ml-1">
                            <button
                               onClick={handlePrevMatch}
                               className="p-0.5 rounded hover:bg-[#FFE082] text-[#8D6E63] transition-colors"
                               title="Khớp trước đó"
                            >
                               <ChevronLeft size={11} />
                            </button>
                            <button
                               onClick={handleNextMatch}
                               className="p-0.5 rounded hover:bg-[#FFE082] text-[#8D6E63] transition-colors"
                               title="Khớp tiếp theo"
                            >
                               <ChevronRight size={11} />
                            </button>
                         </div>
                      )}
                   </div>
                )}
                <div className="flex items-center gap-1.5 ml-auto">
                   <button 
                     onClick={handleReplaceAll}
                     disabled={!findText || matchCount === 0}
                     className="bg-[#5D4037] hover:bg-[#3E2723] disabled:bg-[#D7CCC8] disabled:cursor-not-allowed text-white text-[10px] font-bold px-2.5 py-0.5 rounded transition-colors shadow-sm"
                   >
                     Thay thế tất cả
                   </button>
                   <button 
                     onClick={() => {
                       setShowSearchReplace(false);
                       setFindText('');
                       setReplaceText('');
                     }}
                     className="text-[#A1887F] hover:text-[#3E2723] text-[10px] font-medium px-1.5 py-0.5"
                   >
                     Hủy
                   </button>
                </div>
             </div>
          )}
          {hasSegments && (
             <div className="flex w-full bg-[#EFEBE9] text-[#5D4037] text-[9px] font-bold uppercase tracking-wider shadow-sm border-t border-[#D7CCC8]">
                 <div className="w-[45%] p-1 border-r border-[#D7CCC8] pl-2">Nguồn</div>
                 <div className="w-[55%] p-1 pl-2">Bản edit</div>
             </div>
          )}
      </div>

      <div className="flex-1 overflow-y-auto bg-white scrollbar-thin scrollbar-thumb-[#D7CCC8] scrollbar-track-transparent pb-4">
        {hasSegments ? (
             <table className="w-full text-left border-collapse table-fixed m-0 p-0 border-none">
                <colgroup><col className="w-[45%]" /><col className="w-[55%]" /></colgroup>
                <tbody className="divide-y divide-[#EFEBE9]">
                   {data.segments.map((seg, idx) => {
                      const isDone = completedSegments.includes(idx);
                      const cleanSource = (seg.source || '').trim();
                      const cleanNatural = (seg.natural || '').trim();
                      const cleanDeepl = (seg.deepl || '').trim();
                      const cleanQuick = (vietphraseEngine.translate(cleanSource, customMap) || '').trim();

                      if (!cleanSource && !cleanNatural) return null;

                      return (
                        <tr 
                          id={`segment-row-${idx}`}
                          key={idx} 
                          className={`${isDone ? 'bg-[#EFEBE9]/40 hover:bg-[#D7CCC8]/30' : 'hover:bg-[#F5F5F5]/40'} ${
                            findText && matchingSegmentIndices[currentMatchIndex] === idx 
                              ? 'bg-amber-100/70 border-2 border-amber-400 ring-2 ring-amber-400/50' 
                              : findText && matchingSegmentIndices.includes(idx) 
                                ? 'bg-amber-50/50' 
                                : ''
                          } transition-all duration-300 group/row border-none`}
                        >
                           <td className={`py-0 px-2 align-top border-r border-[#EFEBE9] relative ${isDone ? 'opacity-80' : 'bg-[#FFFDF7]/30'}`}>
                              <div className="flex flex-col py-0.5">
                                <div className={`${isFocusMode ? 'text-[18.5px]' : 'text-[14.5px]'} font-serif-sc leading-[1.2] text-[#3E2723] m-0 whitespace-normal break-words`}>
                                   <span className={`inline-flex items-center justify-center mr-1 select-none align-middle transform -translate-y-[1px] ${isFocusMode ? 'text-[11px] min-w-[20px]' : 'text-[9px] min-w-[16px]'} font-bold ${isDone ? 'text-[#3E2723]/70 font-black' : 'text-[#A1887F]/40'}`}>
                                       {idx + 1}.
                                   </span>
                                   {renderSourceWithHighlight(cleanSource)}
                                </div>
                                {cleanQuick && (
                                  <div className={`${isFocusMode ? 'text-[13px]' : 'text-[10px]'} text-[#8D6E63] leading-[1.1] opacity-70 italic pl-[18px] -mt-0.5 break-words`}>
                                    {cleanQuick}
                                  </div>
                                )}
                              </div>
                           </td>
                           <td className="py-0 px-2 align-top relative pr-6 border-none">
                              <div className="flex flex-col py-0.5">
                                  <EditableSegment 
                                    text={cleanNatural} 
                                    onUpdate={(val) => onUpdateSegment?.(idx, val)} 
                                    isFocusMode={isFocusMode} 
                                    findText={findText}
                                    matchCase={matchCase}
                                    matchDiacritics={matchDiacritics}
                                    novelId={currentNovelId}
                                    onEnterPress={() => handleEnterNextSegment(idx)}
                                  />
                                  {cleanDeepl && (
                                    <div className={`${isFocusMode ? 'text-[11.5px]' : 'text-[8.5px]'} text-[#A1887F] leading-[1.1] italic opacity-60 -mt-0.5 break-words`}><span className="font-bold mr-1 opacity-80 not-italic text-[#5D4037]">GG/DL:</span>{cleanDeepl}</div>
                                  )}
                              </div>
                              <button
                                  onClick={() => onToggleComplete?.(idx)}
                                  className={`absolute top-0 right-0 p-1 rounded-full transition-all shadow-sm border z-10 ${isDone ? 'opacity-100 bg-[#EFEBE9] border-[#D7CCC8] text-[#5D4037] hover:bg-[#D7CCC8]' : 'opacity-0 group-hover/row:opacity-100 bg-white/70 hover:bg-white text-[#A1887F] hover:text-[#3E2723] border-[#D7CCC8]'}`}
                                  title={isDone ? "Đã đánh dấu hoàn thành (Click để bỏ)" : "Đánh dấu hoàn thành"}
                               >
                                  <CheckCircle2 size={isFocusMode ? 14 : 12} />
                               </button>
                           </td>
                        </tr>
                      );
                   })}
                </tbody>
             </table>
        ) : (
             <div className="p-3"><p className="text-[15px] leading-[1.2] text-[#3E2723] whitespace-normal">{data.naturalTranslation.trim()}</p></div>
        )}
      </div>

      {activeVocab && createPortal(
        <div 
          ref={popupRef} 
          style={{ 
            left: activeVocab.position.x, 
            top: activeVocab.position.y, 
            transform: activeVocab.side === 'bottom' ? 'translate(-50%, 0)' : 'translate(-50%, -100%)' 
          }} 
          className="fixed z-50 w-[270px] bg-[#FFFDF7] rounded-xl shadow-[0_10px_30px_rgba(0,0,0,0.25)] border border-[#D7CCC8] animate-in fade-in zoom-in-95 duration-200 overflow-hidden"
        >
            {activeVocab.side === 'bottom' ? (
                <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-[#FFFDF7] border-l border-t border-[#D7CCC8] rotate-45"></div>
            ) : (
                <div className="absolute -bottom-1.5 left-1/2 -translate-x-1/2 w-3 h-3 bg-[#FFFDF7] border-r border-b border-[#D7CCC8] rotate-45"></div>
            )}
            <div className="p-3">
                {/* Header */}
                <div className="flex justify-between items-start mb-2 pb-1.5 border-b border-[#EFEBE9]">
                    <div>
                        <h3 className="text-base font-serif-sc font-bold text-[#3E2723] leading-none mb-1 flex items-center gap-1.5">
                            {activeVocab.type === 'char' && <Users size={12} className="text-[#8D6E63]" />}
                            {activeVocab.item.term}
                        </h3>
                        <div className="flex items-center gap-1">
                            <span className="bg-[#EFEBE9] text-[#5D4037] px-1 py-0.5 rounded text-[8px] font-mono border border-[#D7CCC8]">
                                {activeVocab.type === 'char' ? 'Nhân vật' : activeVocab.type === 'custom' ? 'Từ điển riêng' : activeVocab.item.pinyin || 'Dịch tự động'}
                            </span>
                            {activeVocab.item.hanViet && activeVocab.type === 'ai' && (
                              <span className="text-[10px] text-[#8D6E63] font-medium ml-1">
                                {activeVocab.item.hanViet}
                              </span>
                            )}
                        </div>
                    </div>
                    <div className="flex items-center gap-1">
                        {(activeVocab.type === 'custom' || activeVocab.type === 'char') && !isEditingVocabPopup && (
                            <button 
                                onClick={() => setIsEditingVocabPopup(true)} 
                                className="text-[#5D4037] hover:text-[#3E2723] px-1.5 py-0.5 rounded hover:bg-[#EFEBE9] transition-colors flex items-center gap-1 text-[10px] font-bold border border-[#D7CCC8]/60 bg-white shadow-2xs"
                                title="Sửa từ này"
                            >
                                <Pencil size={11} />
                                <span>Sửa</span>
                            </button>
                        )}
                        <button 
                            onClick={() => { setActiveVocab(null); setIsEditingVocabPopup(false); }} 
                            className="text-[#A1887F] hover:text-[#3E2723] p-1 rounded-full hover:bg-[#EFEBE9]"
                        >
                            <X size={12} />
                        </button>
                    </div>
                </div>

                {/* Content Body */}
                {isEditingVocabPopup && (activeVocab.type === 'custom' || activeVocab.type === 'char') ? (
                    <div className="space-y-2">
                        <div className="text-[10px] font-bold text-[#5D4037] uppercase tracking-wider flex items-center gap-1">
                            <Pencil size={10} /> Chỉnh sửa {activeVocab.type === 'char' ? 'nhân vật' : 'từ vựng'}
                        </div>
                        {activeVocab.type === 'custom' ? (
                            <>
                                <div>
                                    <label className="block text-[8px] font-bold text-[#8D6E63] uppercase mb-0.5">Nghĩa / Tiếng Việt</label>
                                    <input 
                                        type="text" 
                                        value={popupMeaningInput} 
                                        onChange={(e) => setPopupMeaningInput(e.target.value)}
                                        className="w-full bg-white border border-[#D7CCC8] rounded px-1.5 py-1 text-xs text-[#3E2723] font-bold outline-none focus:border-[#8D6E63]" 
                                        autoFocus
                                    />
                                </div>
                                <div>
                                    <label className="block text-[8px] font-bold text-[#8D6E63] uppercase mb-0.5">Phân loại</label>
                                    <input 
                                        type="text" 
                                        placeholder="VD: Vật phẩm, Địa danh..." 
                                        value={popupCategoryInput} 
                                        onChange={(e) => setPopupCategoryInput(e.target.value)}
                                        className="w-full bg-white border border-[#D7CCC8] rounded px-1.5 py-1 text-xs text-[#3E2723] outline-none focus:border-[#8D6E63]" 
                                    />
                                </div>
                            </>
                        ) : (
                            <>
                                <div>
                                    <label className="block text-[8px] font-bold text-[#8D6E63] uppercase mb-0.5">Tên Việt hiển thị</label>
                                    <input 
                                        type="text" 
                                        value={popupMeaningInput} 
                                        onChange={(e) => setPopupMeaningInput(e.target.value)}
                                        className="w-full bg-white border border-[#D7CCC8] rounded px-1.5 py-1 text-xs text-[#3E2723] font-bold outline-none focus:border-[#8D6E63]" 
                                        autoFocus
                                    />
                                </div>
                                <div className="grid grid-cols-2 gap-1.5">
                                    <div>
                                        <label className="block text-[8px] font-bold text-[#8D6E63] uppercase mb-0.5">Xưng hô (ngôi 3)</label>
                                        <input 
                                            type="text" 
                                            value={popupPronounsInput} 
                                            onChange={(e) => setPopupPronounsInput(e.target.value)}
                                            className="w-full bg-white border border-[#D7CCC8] rounded px-1.5 py-1 text-xs text-[#3E2723] outline-none focus:border-[#8D6E63]" 
                                        />
                                    </div>
                                    <div>
                                        <label className="block text-[8px] font-bold text-[#8D6E63] uppercase mb-0.5">Mô tả</label>
                                        <input 
                                            type="text" 
                                            value={popupDescInput} 
                                            onChange={(e) => setPopupDescInput(e.target.value)}
                                            className="w-full bg-white border border-[#D7CCC8] rounded px-1.5 py-1 text-xs text-[#3E2723] outline-none focus:border-[#8D6E63]" 
                                        />
                                    </div>
                                </div>
                            </>
                        )}
                        <div className="flex items-center justify-between pt-1">
                            <button 
                                type="button"
                                onClick={() => handleDeleteVocabFromPopup(activeVocab)}
                                className="px-2 py-1 bg-red-100 text-red-700 hover:bg-red-200 rounded text-[10px] font-bold flex items-center gap-0.5"
                            >
                                <Trash2 size={10} /> Xóa
                            </button>
                            <div className="flex gap-1">
                                <button 
                                    type="button"
                                    onClick={() => setIsEditingVocabPopup(false)} 
                                    className="px-2 py-1 bg-[#EFEBE9] text-[#5D4037] hover:bg-[#D7CCC8] rounded text-[10px] font-bold"
                                >
                                    Hủy
                                </button>
                                <button 
                                    type="button"
                                    onClick={() => handleSaveEditVocabPopup(activeVocab)} 
                                    className="px-2 py-1 bg-[#5D4037] text-white hover:bg-[#3E2723] rounded text-[10px] font-bold"
                                >
                                    Lưu
                                </button>
                            </div>
                        </div>
                    </div>
                ) : (
                    <div className="space-y-1.5">
                        <div className="flex justify-between items-baseline border-b border-[#EFEBE9] pb-0.5">
                            <span className="text-[7px] font-bold text-[#8D6E63] uppercase tracking-wider">
                                {activeVocab.type === 'char' ? 'Tên Việt' : 'Hán Việt'}
                            </span>
                            <span className="text-xs text-[#3E2723] font-medium">
                                {activeVocab.item.hanViet}
                            </span>
                        </div>
                        <div>
                            <div className="text-[7px] font-bold text-[#8D6E63] uppercase tracking-wider mb-0.5">
                                {activeVocab.type === 'char' ? 'Tên hiển thị' : 'Nghĩa'}
                            </div>
                            <div className="text-xs font-bold text-[#3E2723] bg-[#FFF8E1] p-1 rounded border-l-2 border-[#5D4037]">
                                {activeVocab.item.meaning}
                            </div>
                        </div>
                        {activeVocab.item.explanation && (
                            <div>
                                <div className="text-[7px] font-bold text-[#8D6E63] uppercase tracking-wider mb-0.5 flex items-center gap-1">
                                    <Info size={8} /> Chi tiết
                                </div>
                                <div className="text-[10px] text-[#5D4037] italic leading-tight bg-white border border-[#EFEBE9] p-1 rounded">
                                    {activeVocab.item.explanation}
                                </div>
                            </div>
                        )}

                        {/* Nút Thêm Nhanh dành cho Từ AI (Chưa có trong kho từ vựng) */}
                        {activeVocab.type === 'ai' && (
                            <div className="pt-2 border-t border-[#EFEBE9] space-y-1">
                                <div className="text-[8px] font-bold text-[#8D6E63] uppercase tracking-wider">Thêm nhanh vào kho:</div>
                                <div className="grid grid-cols-2 gap-1">
                                    <button
                                        type="button"
                                        onClick={() => handleQuickAddAiVocab(activeVocab.item, 'term')}
                                        className="px-2 py-1.5 bg-[#5D4037] text-white hover:bg-[#3E2723] rounded text-[10px] font-bold flex items-center justify-center gap-1 shadow-2xs transition-colors cursor-pointer"
                                    >
                                        <Plus size={11} /> + Từ vựng
                                    </button>
                                    <button
                                        type="button"
                                        onClick={() => handleQuickAddAiVocab(activeVocab.item, 'char')}
                                        className="px-2 py-1.5 bg-[#8D6E63] text-white hover:bg-[#5D4037] rounded text-[10px] font-bold flex items-center justify-center gap-1 shadow-2xs transition-colors cursor-pointer"
                                    >
                                        <UserPlus size={11} /> + Nhân vật
                                    </button>
                                </div>
                            </div>
                        )}
                    </div>
                )}
            </div>
        </div>,
        document.body
      )}

      {showNamingModal && createPortal(
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-xs p-4 animate-in fade-in duration-200">
          <div className="bg-[#FFFDF7] border border-[#D7CCC8] rounded-xl shadow-[0_20px_50px_rgba(62,39,35,0.3)] w-full max-w-md overflow-hidden animate-in zoom-in-95 duration-200">
            <div className="bg-[#EFEBE9] px-4 py-3 border-b border-[#D7CCC8] flex items-center justify-between">
              <span className="text-xs font-bold text-[#3E2723] uppercase tracking-wider flex items-center gap-1.5">
                <FileDown size={14} className="text-[#8D6E63]" />
                <span>Đặt tên file Word</span>
              </span>
              <button 
                onClick={() => setShowNamingModal(false)}
                className="text-[#A1887F] hover:text-[#3E2723] p-1 rounded-full hover:bg-[#D7CCC8]/30 transition-colors"
              >
                <X size={16} />
              </button>
            </div>
            
            <div className="p-5">
              <label className="block text-[11px] font-bold text-[#8D6E63] uppercase tracking-wider mb-2">
                Tên file (hệ thống sẽ tự động thêm .doc):
              </label>
              <input
                type="text"
                value={exportFileName}
                onChange={(e) => setExportFileName(e.target.value)}
                placeholder="VD: chuong_153_doi_chieu"
                className="w-full bg-white border border-[#D7CCC8] rounded px-3 py-2 text-[#3E2723] text-sm outline-none focus:border-[#8D6E63] focus:ring-1 focus:ring-[#8D6E63] transition-all font-medium"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleConfirmExport();
                  }
                }}
              />
              <p className="text-[10px] text-[#A1887F] mt-2 italic">
                Bảng sẽ xuất ra Word gồm 4 cột đối chiếu: Nguồn, Vietphrase, GG/DL và Bản edit.
              </p>
            </div>
            
            <div className="bg-[#F5F2F0] px-5 py-3 border-t border-[#D7CCC8] flex justify-end gap-2">
              <button
                onClick={() => setShowNamingModal(false)}
                className="px-3.5 py-1.5 rounded text-xs font-bold text-[#5D4037] hover:bg-[#D7CCC8]/30 transition-all border border-transparent"
              >
                Hủy
              </button>
              <button
                onClick={handleConfirmExport}
                className="px-4 py-1.5 rounded bg-[#5D4037] hover:bg-[#3E2723] text-white text-xs font-bold transition-all shadow-sm"
              >
                Xuất file
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {showSaveArchiveModal && createPortal(
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#3E2723]/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#FFFDF7] rounded-xl border border-[#D7CCC8] shadow-2xl w-full max-w-md overflow-hidden transform animate-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-[#D7CCC8] bg-[#EFE5D9] flex justify-between items-center">
              <div className="flex items-center gap-2 text-[#3E2723] font-bold text-sm">
                <BookOpen size={16} />
                <span>Lưu chương vào kho lưu trữ</span>
              </div>
              <button onClick={() => setShowSaveArchiveModal(false)} className="text-[#A1887F] hover:text-[#3E2723] p-1 rounded-full transition-colors">
                <X size={16} />
              </button>
            </div>
            
            <div className="p-5">
              <label className="block text-xs font-bold text-[#5D4037] mb-2 uppercase tracking-wide">Tên chương để lưu trữ</label>
              <input
                type="text"
                value={archiveChapterName}
                onChange={(e) => setArchiveChapterName(e.target.value)}
                placeholder="VD: Chương 123: Tiêu đề chương"
                className="w-full bg-white border border-[#D7CCC8] rounded px-3 py-2 text-[#3E2723] text-sm outline-none focus:border-[#8D6E63] focus:ring-1 focus:ring-[#8D6E63] transition-all font-medium"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    handleConfirmSaveArchive();
                  }
                }}
              />
              <p className="text-[10px] text-[#A1887F] mt-2 italic">
                Chương sẽ được lưu trữ cục bộ để tích lũy. Khi cần có thể tải ZIP toàn bộ hoặc khôi phục để sửa tiếp.
              </p>
            </div>
            
            <div className="bg-[#F5F2F0] px-5 py-3 border-t border-[#D7CCC8] flex justify-end gap-2">
              <button
                onClick={() => setShowSaveArchiveModal(false)}
                className="px-3.5 py-1.5 rounded text-xs font-bold text-[#5D4037] hover:bg-[#D7CCC8]/30 transition-all border border-transparent"
              >
                Hủy
              </button>
              <button
                onClick={handleConfirmSaveArchive}
                className="px-4 py-1.5 rounded bg-[#5D4037] hover:bg-[#3E2723] text-white text-xs font-bold transition-all shadow-sm"
              >
                Lưu Chương
              </button>
            </div>
          </div>
        </div>,
        document.body
      )}

      {selectionPopup && createPortal(
        <div 
          className="absolute z-50 selection-popup-container bg-[#FFFDF7] rounded-xl shadow-[0_12px_40px_rgba(62,39,35,0.25)] border border-[#D7CCC8] animate-in fade-in zoom-in-95 duration-150 overflow-hidden flex flex-col"
          style={{ 
            left: `${popupCoords.left}px`, 
            top: `${popupCoords.top}px`, 
            width: `${popupCoords.width}px`,
            maxHeight: '380px'
          }}
        >
          {/* Header */}
          <div className="bg-[#EFEBE9]/60 px-3.5 py-2 border-b border-[#D7CCC8]/80 flex justify-between items-center shrink-0">
            <span className="text-[10px] font-bold text-[#5D4037] uppercase tracking-wider flex items-center gap-1">
              <span className="w-1.5 h-1.5 rounded-full bg-[#8D6E63]"></span>
              Tra cứu & Thêm nhanh
            </span>
            <button 
              onClick={() => setSelectionPopup(null)} 
              className="text-[#A1887F] hover:text-[#3E2723] p-1 rounded-full hover:bg-[#D7CCC8]/30 transition-colors"
            >
              <X size={12} />
            </button>
          </div>

          <div className="p-3.5 space-y-3 overflow-y-auto scrollbar-thin max-h-[300px]">
            {selectionPopup.type === 'idle' && (
              <>
                <div className="space-y-2">
                  <div>
                    <div className="text-[9px] font-bold text-[#8D6E63] uppercase tracking-wider mb-0.5">Cụm từ chọn</div>
                    <div className="text-sm font-serif-sc font-bold text-[#3E2723] bg-[#EFEBE9]/20 border border-[#EFEBE9] px-2 py-1 rounded leading-snug">
                      {selectionPopup.text}
                    </div>
                  </div>
                  <div>
                    <div className="text-[9px] font-bold text-[#8D6E63] uppercase tracking-wider mb-0.5">Nghĩa Vietphrase</div>
                    <div className="text-xs font-bold text-[#5D4037] bg-[#FFF8E1] px-2 py-1 rounded border-l-4 border-[#8D6E63] leading-snug shadow-[inset_0_-1px_0_rgba(141,110,99,0.1)]">
                      {selectionPopup.vietphrase || <span className="opacity-40 italic font-normal text-[10px]">Không có trong từ điển thô</span>}
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2 pt-1 border-t border-[#EFEBE9]">
                  <button
                    onClick={() => {
                      setSelectionPopup(prev => prev ? { ...prev, type: 'vocab' } : null);
                      setVocabMeaning(selectionPopup.vietphrase);
                    }}
                    className="flex flex-col items-center justify-center p-1.5 rounded-lg bg-white border border-[#D7CCC8] hover:border-[#8D6E63] hover:bg-[#FFFDF7] text-center transition-all group/btn"
                  >
                    <BookOpen size={14} className="text-[#8D6E63] mb-0.5 group-hover/btn:scale-110 transition-transform" />
                    <span className="text-[9px] font-bold text-[#5D4037]">+ Kho từ vựng</span>
                  </button>

                  <button
                    onClick={() => {
                      setSelectionPopup(prev => prev ? { ...prev, type: 'char' } : null);
                      setCharVietName(selectionPopup.vietphrase);
                    }}
                    className="flex flex-col items-center justify-center p-1.5 rounded-lg bg-white border border-[#D7CCC8] hover:border-[#8D6E63] hover:bg-[#FFFDF7] text-center transition-all group/btn"
                  >
                    <Users size={14} className="text-[#8D6E63] mb-0.5 group-hover/btn:scale-110 transition-transform" />
                    <span className="text-[9px] font-bold text-[#5D4037]">+ Nhân vật</span>
                  </button>
                </div>
              </>
            )}

            {selectionPopup.type === 'vocab' && (
              <div className="space-y-2.5">
                <div className="text-xs font-bold text-[#5D4037] flex items-center gap-1 pb-1 border-b border-[#EFEBE9]">
                  <BookOpen size={12} className="text-[#8D6E63]" />
                  <span>Thêm cụm từ mới</span>
                </div>

                <div className="space-y-1.5">
                  <div>
                    <label className="block text-[8px] font-bold text-[#8D6E63] uppercase tracking-wider mb-0.5">Cụm từ Trung</label>
                    <input 
                      type="text" 
                      value={selectionPopup.text} 
                      disabled
                      className="w-full bg-[#EFEBE9]/30 border border-[#D7CCC8] rounded px-2 py-1 text-[#3E2723] text-xs font-medium font-serif-sc"
                    />
                  </div>
                  <div>
                    <label className="block text-[8px] font-bold text-[#8D6E63] uppercase tracking-wider mb-0.5">Nghĩa Việt (Tự điền)</label>
                    <input 
                      type="text" 
                      value={vocabMeaning} 
                      onChange={(e) => setVocabMeaning(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && vocabMeaning.trim()) {
                          handleSaveSelectedVocab();
                        }
                      }}
                      placeholder="Nhập nghĩa dịch cho từ..."
                      className="w-full bg-white border border-[#D7CCC8] rounded px-2 py-1 text-[#3E2723] text-xs font-bold outline-none focus:border-[#8D6E63] focus:ring-1 focus:ring-[#8D6E63] transition-all"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-[8px] font-bold text-[#8D6E63] uppercase tracking-wider mb-0.5">Phân loại (Không bắt buộc)</label>
                    {isCreatingCategory ? (
                      <div className="flex gap-1 items-center">
                        <input
                          type="text"
                          value={newCategoryInput}
                          onChange={(e) => setNewCategoryInput(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              e.preventDefault();
                              if (newCategoryInput.trim()) {
                                setVocabCategory(newCategoryInput.trim());
                              }
                              setIsCreatingCategory(false);
                            }
                          }}
                          placeholder="Nhập tên phân loại mới..."
                          className="w-full bg-white border border-[#D7CCC8] rounded px-2 py-1 text-[#3E2723] text-xs outline-none focus:border-[#8D6E63] focus:ring-1 focus:ring-[#8D6E63]"
                          autoFocus
                        />
                        <button
                          type="button"
                          onClick={() => {
                            if (newCategoryInput.trim()) {
                              setVocabCategory(newCategoryInput.trim());
                            }
                            setIsCreatingCategory(false);
                          }}
                          className="px-2 py-1 bg-[#5D4037] text-white rounded text-[10px] font-bold whitespace-nowrap hover:bg-[#3E2723]"
                        >
                          Lưu
                        </button>
                        <button
                          type="button"
                          onClick={() => setIsCreatingCategory(false)}
                          className="px-2 py-1 bg-[#D7CCC8] text-[#3E2723] rounded text-[10px] font-bold whitespace-nowrap hover:bg-[#BCAAA4]"
                        >
                          Hủy
                        </button>
                      </div>
                    ) : (
                      <div className="flex gap-1 items-center">
                        <select
                          value={vocabCategory}
                          onChange={(e) => {
                            if (e.target.value === '__new__') {
                              setIsCreatingCategory(true);
                              setNewCategoryInput('');
                            } else {
                              setVocabCategory(e.target.value);
                            }
                          }}
                          className="w-full bg-white border border-[#D7CCC8] rounded px-2 py-1 text-[#3E2723] text-xs outline-none focus:border-[#8D6E63] focus:ring-1 focus:ring-[#8D6E63] cursor-pointer"
                        >
                          <option value="">Chưa phân loại</option>
                          {allCategories.map(cat => (
                            <option key={cat} value={cat}>{cat}</option>
                          ))}
                          <option value="__new__" className="text-blue-600 font-bold">+ Thêm phân loại mới...</option>
                        </select>
                      </div>
                    )}
                  </div>
                </div>

                {saveStatus ? (
                  <div className={`text-[10px] font-bold text-center py-1 rounded ${
                    saveStatus.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  } animate-pulse`}>
                    {saveStatus.message}
                  </div>
                ) : (
                  <div className="flex gap-1.5 justify-end pt-1.5 border-t border-[#EFEBE9]">
                    <button 
                      onClick={() => setSelectionPopup(prev => prev ? { ...prev, type: 'idle' } : null)}
                      className="px-2 py-0.5 rounded text-[10px] font-bold text-[#5D4037] hover:bg-[#D7CCC8]/30 transition-all"
                    >
                      Quay lại
                    </button>
                    <button 
                      onClick={handleSaveSelectedVocab}
                      disabled={!vocabMeaning.trim()}
                      className="px-2.5 py-0.5 bg-[#5D4037] hover:bg-[#3E2723] disabled:opacity-50 text-white rounded text-[10px] font-bold transition-all"
                    >
                      Lưu từ vựng
                    </button>
                  </div>
                )}
              </div>
            )}

            {selectionPopup.type === 'char' && (
              <div className="space-y-2">
                <div className="text-xs font-bold text-[#5D4037] flex items-center gap-1 pb-1 border-b border-[#EFEBE9]">
                  <Users size={12} className="text-[#8D6E63]" />
                  <span>Thêm nhân vật mới</span>
                </div>

                <div className="space-y-1.5">
                  <div>
                    <label className="block text-[8px] font-bold text-[#8D6E63] uppercase tracking-wider mb-0.5">Tên tiếng Trung</label>
                    <input 
                      type="text" 
                      value={selectionPopup.text} 
                      disabled
                      className="w-full bg-[#EFEBE9]/30 border border-[#D7CCC8] rounded px-2 py-0.5 text-[#3E2723] text-xs font-medium font-serif-sc"
                    />
                  </div>
                  <div>
                    <label className="block text-[8px] font-bold text-[#8D6E63] uppercase tracking-wider mb-0.5">Tên tiếng Việt (Tự điền)</label>
                    <input 
                      type="text" 
                      value={charVietName} 
                      onChange={(e) => setCharVietName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && charVietName.trim()) {
                          handleSaveSelectedCharacter();
                        }
                      }}
                      placeholder="Nhập tên tiếng Việt dịch..."
                      className="w-full bg-white border border-[#D7CCC8] rounded px-2 py-1 text-[#3E2723] text-xs font-bold outline-none focus:border-[#8D6E63] focus:ring-1 focus:ring-[#8D6E63] transition-all"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-[8px] font-bold text-[#8D6E63] uppercase tracking-wider mb-0.5">Đại từ xưng hô (Pronoun)</label>
                    <input 
                      type="text" 
                      value={charPronoun} 
                      onChange={(e) => setCharPronoun(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' && charVietName.trim()) {
                          handleSaveSelectedCharacter();
                        }
                      }}
                      placeholder="VD: Hắn, Nàng, Y, Linh thú..."
                      className="w-full bg-white border border-[#D7CCC8] rounded px-2 py-0.5 text-[#3E2723] text-xs outline-none focus:border-[#8D6E63] focus:ring-1 focus:ring-[#8D6E63] transition-all"
                    />
                  </div>
                  <div>
                    <label className="block text-[8px] font-bold text-[#8D6E63] uppercase tracking-wider mb-0.5">Mô tả chi tiết</label>
                    <textarea 
                      value={charDescription} 
                      onChange={(e) => setCharDescription(e.target.value)}
                      placeholder="Mô tả lai lịch, môn phái, vũ khí..."
                      className="w-full bg-white border border-[#D7CCC8] rounded px-2 py-1 text-[#3E2723] text-[10px] h-10 outline-none focus:border-[#8D6E63] focus:ring-1 focus:ring-[#8D6E63] transition-all resize-none"
                    />
                  </div>
                </div>

                {saveStatus ? (
                  <div className={`text-[10px] font-bold text-center py-1 rounded ${
                    saveStatus.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                  } animate-pulse`}>
                    {saveStatus.message}
                  </div>
                ) : (
                  <div className="flex gap-1.5 justify-end pt-1.5 border-t border-[#EFEBE9]">
                    <button 
                      onClick={() => setSelectionPopup(prev => prev ? { ...prev, type: 'idle' } : null)}
                      className="px-2 py-0.5 rounded text-[10px] font-bold text-[#5D4037] hover:bg-[#D7CCC8]/30 transition-all"
                    >
                      Quay lại
                    </button>
                    <button 
                      onClick={handleSaveSelectedCharacter}
                      disabled={!charVietName.trim()}
                      className="px-2.5 py-0.5 bg-[#5D4037] hover:bg-[#3E2723] disabled:opacity-50 text-white rounded text-[10px] font-bold transition-all"
                    >
                      Lưu nhân vật
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>,
        document.body
      )}
    </div>
  );
};
