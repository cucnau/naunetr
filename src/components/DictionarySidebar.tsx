
import React, { useState, useEffect, useRef, useMemo } from 'react';
import { CustomTerm, VietphraseFileItem } from '../types';
import { Plus, Trash2, BookUser, Settings, Download, Upload, Loader2, Save, Code, Copy, Search, X, RefreshCw, FileText, CheckCircle, FileUp, AlertCircle, FileSpreadsheet, Layers } from 'lucide-react';
import { syncFirestoreData, deleteFirestoreDoc, overwriteFirestoreData } from '../services/firestoreService';
import { auth } from '../services/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { vietphraseEngine } from '../services/vietphraseService';
// Deleted smartClassify import

interface DictionarySidebarProps {
  currentNovelId: string;
  terms: CustomTerm[];
  onUpdateTerms: (terms: CustomTerm[]) => void;
  sheetUrl: string;
  onUpdateSheetUrl: (url: string) => void;
  refreshTrigger?: any;
  onExportExcel?: () => void;
}

// Updated GAS Code to support multiple tabs
const APPS_SCRIPT_CODE = `function doGet(e) {
  var type = e.parameter.type || 'vocab';
  var sheetName = getSheetName(type);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    return ContentService.createTextOutput(JSON.stringify([]))
      .setMimeType(ContentService.MimeType.JSON);
  }

  var data = sheet.getDataRange().getValues();
  // Remove header row
  if (data.length > 0) data.shift();
  
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  var payload = JSON.parse(e.postData.contents);
  var type = payload.type || 'vocab';
  var rows = payload.data;
  
  var sheetName = getSheetName(type);
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheet = ss.getSheetByName(sheetName);
  
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    // Add Headers based on type
    var headers = getHeaders(type);
    sheet.appendRow(headers);
  } else {
    sheet.clear();
    var headers = getHeaders(type);
    sheet.appendRow(headers);
  }
  
  if (rows && rows.length > 0) {
    sheet.getRange(2, 1, rows.length, rows[0].length).setValues(rows);
  }
  
  return ContentService.createTextOutput(JSON.stringify({result: "success"}))
    .setMimeType(ContentService.MimeType.JSON);
}

function getSheetName(type) {
  if (type == 'char') return 'Characters';
  if (type == 'rel') return 'Relationships';
  return 'Vocabulary';
}

function getHeaders(type) {
  if (type == 'char') return ["ID", "Chinese Name", "Viet Name", "Pronouns", "Description"];
  if (type == 'rel') return ["ID", "Char A", "Char B", "Call A->B", "Call B->A", "Note"];
  return ["ID", "Term", "Meaning"];
}`;

const DEFAULT_CATEGORIES = ['Vật phẩm', 'Địa danh', 'Chiêu thức', 'Môn phái', 'Nhân vật', 'Thành thị', 'Vũ khí', 'Trạng thái', 'Hành động', 'Thường dùng', 'Khác'];

export const DictionarySidebar: React.FC<DictionarySidebarProps> = ({
  currentNovelId,
  terms,
  onUpdateTerms,
  sheetUrl,
  onUpdateSheetUrl,
  refreshTrigger,
  onExportExcel
}) => {
  const [newTerm, setNewTerm] = useState('');
  const [newMeaning, setNewMeaning] = useState('');
  const [categoryVal, setCategoryVal] = useState('');
  const [isCreatingCat, setIsCreatingCat] = useState(false);
  const [newCatInput, setNewCatInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showCode, setShowCode] = useState(false);
  const [bulkText, setBulkText] = useState('');
  const [vpCount, setVpCount] = useState(0);
  const [vpFiles, setVpFiles] = useState<VietphraseFileItem[]>(() => vietphraseEngine.getFiles());
  const [isLoadingVp, setIsLoadingVp] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  
  // Sync States
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);
  const [isSignedIn, setIsSignedIn] = useState(!!auth.currentUser);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsSignedIn(!!user);
    });
    return () => unsubscribe();
  }, []);

  // Fetch when novel changes
  useEffect(() => {
      if (isSignedIn && currentNovelId) {
          const timer = setTimeout(() => {
              handlePullFromCloud(true);
          }, 500);
          return () => clearTimeout(timer);
      }
  }, [currentNovelId, isSignedIn]);

  const termsRef = useRef(terms);
  useEffect(() => {
    termsRef.current = terms;
  }, [terms]);
  
  // Auto Sync State
  const [autoSync, setAutoSync] = useState<boolean>(() => {
    const saved = localStorage.getItem('autoSync_vocab');
    return saved === null ? true : saved === 'true';
  });
  const isInitialMount = useRef(true);
  const isPullingRef = useRef(false); // Flag to ignore changes caused by pulling data

  // Persist autoSync preference
  useEffect(() => {
    localStorage.setItem('autoSync_vocab', String(autoSync));
  }, [autoSync]);

  // Load VP size on mount/render
  useEffect(() => {
     setVpCount(vietphraseEngine.getSize());
     setVpFiles(vietphraseEngine.getFiles());
     return vietphraseEngine.subscribe(() => {
         setVpCount(vietphraseEngine.getSize());
         setVpFiles(vietphraseEngine.getFiles());
     });
  }, [refreshTrigger]);

  // Auto-Pull on mount or when switching novel / sign in
  useEffect(() => {
    if (isSignedIn && currentNovelId && !isSyncing && !isPullingRef.current) {
      const timer = setTimeout(() => {
        handlePullFromCloud(true);
      }, 300);
      return () => clearTimeout(timer);
    }
  }, [isSignedIn, currentNovelId]);

  // AUTO SYNC LOGIC (Push)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }
    
    if (!autoSync || !isSignedIn || isPullingRef.current || terms.length === 0) return;
    
    const timer = setTimeout(() => {
      handlePushToCloud(true);
    }, 2000);

    return () => clearTimeout(timer);
  }, [terms, autoSync, isSignedIn]);

  // Filter terms belonging strictly to current novel or global
  const currentNovelTerms = useMemo(() => {
    return terms.filter(t => !currentNovelId || !t.novelId || t.novelId === currentNovelId);
  }, [terms, currentNovelId]);

  // Extract all categories for current novel
  const allCategories = useMemo(() => {
    const unique = Array.from(new Set(currentNovelTerms.map(t => t.category).filter(Boolean))) as string[];
    const categoriesSet = new Set([...DEFAULT_CATEGORIES, ...unique]);
    if (categoryVal && categoryVal.trim() && categoryVal !== '__new__' && !categoriesSet.has(categoryVal.trim())) {
      categoriesSet.add(categoryVal.trim());
    }
    return Array.from(categoriesSet);
  }, [currentNovelTerms, categoryVal]);

  const filteredTerms = currentNovelTerms.filter(t => 
    t.term.toLowerCase().includes(searchTerm.toLowerCase()) || 
    t.meaning.toLowerCase().includes(searchTerm.toLowerCase()) ||
    (t.category && t.category.toLowerCase().includes(searchTerm.toLowerCase()))
  );

  const handleAdd = () => {
    if (!newTerm.trim() || !newMeaning.trim()) return;
    
    const termVal = newTerm.trim();
    const existingIndex = currentNovelTerms.findIndex(t => t.term.toLowerCase() === termVal.toLowerCase());
    
    if (existingIndex >= 0) {
      const updated = currentNovelTerms.map((t, idx) => idx === existingIndex ? { ...t, meaning: newMeaning.trim(), category: (categoryVal.trim() && categoryVal.trim() !== "Chưa phân loại") ? categoryVal.trim() : t.category } : t);
      onUpdateTerms(updated);
      setSyncMessage({ type: 'success', text: `Đã cập nhật nghĩa từ "${termVal}"!` });
    } else {
      const newItem: CustomTerm = {
        id: Date.now().toString() + Math.random().toString(36).substring(2, 6),
        novelId: currentNovelId || '',
        term: termVal,
        meaning: newMeaning.trim(),
        category: (categoryVal.trim() && categoryVal.trim() !== "Chưa phân loại") ? categoryVal.trim() : undefined
      };
      onUpdateTerms([...currentNovelTerms, newItem]);
      setSyncMessage({ type: 'success', text: `Đã thêm từ "${termVal}" thành công!` });
    }
    setNewTerm('');
    setNewMeaning('');
    setCategoryVal('');
    setTimeout(() => setSyncMessage(null), 3000);
  };

  const handleUpdateCategory = (id: string, category: string) => {
    onUpdateTerms(currentNovelTerms.map(t => t.id === id ? { ...t, category } : t));
  };

  const handleDelete = (id: string) => {
    deleteFirestoreDoc('vocab', id);
    onUpdateTerms(currentNovelTerms.filter(t => t.id !== id));
  };

  const handlePullFromCloud = async (silent = false) => {
    if (!isSignedIn) {
        if (!silent) setSyncMessage({ type: 'error', text: 'Chưa đăng nhập!' });
        return;
    }
    if (!currentNovelId) {
        if (!silent) setSyncMessage({ type: 'error', text: 'Chưa chọn truyện!' });
        return;
    }
    setIsSyncing(true);
    isPullingRef.current = true;
    if (!silent) setSyncMessage(null);
    try {
      const data = await syncFirestoreData<CustomTerm>('vocab', currentNovelId, 'GET');
      const currentLocal = termsRef.current.filter(t => !t.novelId || t.novelId === currentNovelId);
      
      // CRITICAL PROTECTION: If silent pull returned empty cloud data but we have local data, do not overwrite!
      if (silent && data.length === 0 && currentLocal.length > 0) {
          console.log("Preserving local terms since cloud is empty");
          if (autoSync) {
              setTimeout(() => {
                  handlePushToCloud(true);
              }, 1000);
          }
          return;
      }

      // NO DATA LOSS MERGING: Merge local and cloud smartly to preserve local edits
      let mergedData = data;
      if (currentLocal.length > 0) {
          const localTermsMap = new Map<string, CustomTerm>();
          currentLocal.forEach(t => {
              localTermsMap.set(t.id, t);
          });

          mergedData = data.map(cloudTerm => {
              const localTerm = localTermsMap.get(cloudTerm.id);
              if (localTerm) {
                  const hasLocalCat = localTerm.category && localTerm.category !== "Chưa phân loại" && localTerm.category.trim() !== "";
                  const hasCloudCat = cloudTerm.category && cloudTerm.category !== "Chưa phân loại" && cloudTerm.category.trim() !== "";
                  
                  return {
                      ...cloudTerm,
                      novelId: currentNovelId,
                      category: (!hasCloudCat && hasLocalCat) ? localTerm.category : cloudTerm.category,
                      meaning: (localTerm.meaning && !cloudTerm.meaning) ? localTerm.meaning : cloudTerm.meaning
                  };
              }
              return { ...cloudTerm, novelId: currentNovelId };
          });

          // Also add any local terms that are not on the cloud yet
          const cloudIds = new Set(data.map(t => t.id));
          const localNewTerms = currentLocal.filter(t => !cloudIds.has(t.id)).map(t => ({ ...t, novelId: currentNovelId }));
          mergedData = [...mergedData, ...localNewTerms];
      } else {
          mergedData = data.map(t => ({ ...t, novelId: currentNovelId }));
      }

      onUpdateTerms(mergedData);
      if (!silent) setSyncMessage({ type: 'success', text: `Đã tải ${mergedData.length} từ!` });
    } catch (e: any) {
      console.warn("Pull from cloud failed:", e);
      if (!silent) setSyncMessage({ type: 'error', text: e.message || "Lỗi tải dữ liệu" });
    } finally {
      setIsSyncing(false);
      setTimeout(() => { isPullingRef.current = false; }, 500);
    }
  };

  const handlePushToCloud = async (silent = false) => {
    if (!isSignedIn) {
        if (!silent) setSyncMessage({ type: 'error', text: 'Chưa đăng nhập!' });
        return;
    }
    if (!currentNovelId) {
        if (!silent) setSyncMessage({ type: 'error', text: 'Chưa chọn truyện!' });
        return;
    }
    setIsSyncing(true);
    if (!silent) setSyncMessage(null);
    try {
      const toPush = termsRef.current.filter(t => !t.novelId || t.novelId === currentNovelId).map(t => ({ ...t, novelId: currentNovelId }));
      await syncFirestoreData<CustomTerm>('vocab', currentNovelId, 'POST', toPush);
      if (!silent) setSyncMessage({ type: 'success', text: 'Đã lưu lên mây!' });
      else setSyncMessage({ type: 'success', text: 'Đã tự động lưu từ vựng' });
    } catch (e: any) {
      console.warn("Push to cloud failed:", e);
      if (!silent) setSyncMessage({ type: 'error', text: e.message || "Lỗi đồng bộ" });
    } finally {
      setIsSyncing(false);
      if (silent) setTimeout(() => setSyncMessage(null), 2000);
      else setTimeout(() => setSyncMessage(null), 5000);
    }
  };

  const handleMultipleFilesUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setIsLoadingVp(true);
    setSyncMessage({ type: 'success', text: `Đang đọc ${files.length} file...` });

    try {
      const fileReadPromises = Array.from(files).map((file) => {
        return new Promise<{ name: string; content: string; size: number }>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (evt) => {
            const content = (evt.target?.result as string) || '';
            resolve({
              name: file.name,
              content: content,
              size: file.size
            });
          };
          reader.onerror = () => reject(new Error(`Không thể đọc file ${file.name}`));
          reader.readAsText(file);
        });
      });

      const loadedFiles = await Promise.all(fileReadPromises);
      const res = await vietphraseEngine.addFiles(loadedFiles);

      setVpCount(res.totalWords);
      setVpFiles(vietphraseEngine.getFiles());
      setSyncMessage({ type: 'success', text: `Đã nạp thành công ${loadedFiles.length} file (${res.totalWords.toLocaleString()} từ)!` });
      setTimeout(() => setSyncMessage(null), 4000);
    } catch (err: any) {
      console.error("Upload Vietphrase files error", err);
      setSyncMessage({ type: 'error', text: err.message || 'Lỗi khi đọc file Vietphrase!' });
      setTimeout(() => setSyncMessage(null), 4000);
    } finally {
      setIsLoadingVp(false);
      e.target.value = ''; // Reset input to allow re-upload
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#EFE5D9] border-r border-[#D7CCC8] w-80 shrink-0">
      {/* Header */}
      <div className="p-3 border-b border-[#D7CCC8] bg-[#D7CCC8]/30 flex items-center justify-between">
         <div className="flex items-center gap-2 text-[#3E2723] font-bold">
            <BookUser size={16} className="text-[#5D4037]" />
            <span className="text-sm">Kho Từ Vựng</span>
         </div>
         <div className="flex items-center gap-1">
            {/* Quick Button for VP status */}
            <button
                onClick={() => setShowSettings(true)}
                className={`p-1 rounded-full transition-colors flex items-center gap-1 ${vpCount > 0 ? 'text-[#3E2723] bg-[#EFE5D9] border border-[#D7CCC8]' : 'text-red-500 hover:bg-red-50 animate-pulse'}`}
                title={vpCount > 0 ? `Đã nạp ${vpFiles.length} file (${vpCount.toLocaleString()} từ)` : "Chưa có Vietphrase! Bấm để nạp"}
            >
                {vpCount > 0 ? <CheckCircle size={14} className="text-green-600" /> : <FileText size={14} />}
                {vpCount > 0 && <span className="text-[9px] font-mono">{vpFiles.length}f·{Math.floor(vpCount/1000)}k</span>}
            </button>
            {onExportExcel && (
              <button
                  onClick={onExportExcel}
                  className="p-1 rounded-full text-[#8D6E63] hover:text-[#3E2723] hover:bg-[#D7CCC8] transition-colors"
                  title="Xuất Excel (Tất cả từ vựng, nhân vật, quan hệ)"
              >
                  <FileSpreadsheet size={14} />
              </button>)}
            
            <button
                onClick={() => setShowSettings(!showSettings)}
                className={`p-1 rounded-full transition-colors ${showSettings ? 'bg-[#3E2723] text-[#F5E6D3]' : 'text-[#8D6E63] hover:text-[#3E2723] hover:bg-[#D7CCC8]'}`}
                title="Cài đặt"
            >
                <Settings size={14} />
            </button>
         </div>
      </div>

      {/* Settings Panel */}
      {showSettings && (
          <div className="bg-[#EFEBE9] border-b border-[#D7CCC8] p-3 text-sm animate-in slide-in-from-top-2 overflow-y-auto max-h-[65vh]">
             
             {/* VIETPHRASE MULTI-FILES SECTION */}
             <div className="mb-4 bg-white border border-[#D7CCC8] rounded-lg p-3">
                <div className="flex justify-between items-center mb-2">
                    <label className="text-[10px] font-bold text-[#5D4037] uppercase flex items-center gap-1">
                        <FileText size={12}/> Vietphrase ({vpFiles.length} file)
                    </label>
                    <span className={`text-[9px] font-bold px-1.5 py-0.5 rounded-full ${vpCount > 0 ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}`}>
                        {vpCount > 0 ? `${vpCount.toLocaleString()} từ` : 'Chưa có file'}
                    </span>
                </div>

                {/* Danh sách các file Vietphrase đã nạp */}
                {vpFiles.length > 0 && (
                  <div className="space-y-1.5 mb-2.5 max-h-44 overflow-y-auto pr-0.5">
                    {vpFiles.map((file) => (
                      <div 
                        key={file.id} 
                        className={`flex items-center justify-between p-1.5 rounded border transition-all text-xs ${
                          file.enabled 
                            ? 'bg-[#FAF8F5] border-[#D7CCC8] text-[#3E2723]' 
                            : 'bg-gray-50 border-gray-200 text-gray-400 opacity-60'
                        }`}
                      >
                        <div className="flex items-center gap-1.5 overflow-hidden flex-1 mr-2 min-w-0">
                          <button
                            type="button"
                            onClick={() => vietphraseEngine.toggleFile(file.id)}
                            className={`w-3.5 h-3.5 rounded flex items-center justify-center text-[9px] border transition-colors shrink-0 ${
                              file.enabled 
                                ? 'bg-green-600 border-green-600 text-white' 
                                : 'bg-white border-gray-300 text-transparent'
                            }`}
                            title={file.enabled ? "Bấm để tắt file này" : "Bấm để bật file này"}
                          >
                            ✓
                          </button>
                          <span className="font-mono text-[11px] truncate font-medium" title={file.name}>
                            {file.name}
                          </span>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          <span className="text-[9px] bg-[#EFE5D9] text-[#5D4037] px-1.5 py-0.5 rounded font-mono font-medium">
                            {file.wordCount.toLocaleString()} từ
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm(`Bạn có chắc muốn xóa file "${file.name}" khỏi từ điển?`)) {
                                vietphraseEngine.removeFile(file.id);
                              }
                            }}
                            className="text-[#A1887F] hover:text-red-600 p-0.5 rounded transition-colors"
                            title="Xóa file này"
                          >
                            <Trash2 size={12} />
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Các nút nạp / xóa */}
                <div className="flex gap-1.5">
                  <button 
                      type="button"
                      disabled={isLoadingVp}
                      onClick={() => fileInputRef.current?.click()}
                      className="flex-1 flex items-center justify-center gap-1.5 bg-[#F5E6D3] hover:bg-[#D7CCC8] text-[#3E2723] py-2 rounded border border-dashed border-[#8D6E63] transition-colors text-xs font-bold disabled:opacity-50"
                  >
                      {isLoadingVp ? <Loader2 size={13} className="animate-spin" /> : <FileUp size={13} />}
                      {vpFiles.length > 0 ? "+ Thêm file Vietphrase (.txt)" : "Chọn các file Vietphrase (.txt)"}
                  </button>

                  {vpFiles.length > 0 && (
                    <button
                      type="button"
                      onClick={() => {
                        if (window.confirm("⚠️ Bạn có chắc muốn XÓA TẤT CẢ các file Vietphrase đã nạp?")) {
                          vietphraseEngine.clearAllFiles();
                        }
                      }}
                      className="px-2.5 py-2 bg-red-50 hover:bg-red-100 text-red-700 rounded border border-red-200 transition-colors text-xs font-medium"
                      title="Xóa tất cả file Vietphrase"
                    >
                      <Trash2 size={13} />
                    </button>
                  )}
                </div>

                <p className="text-[9px] text-[#8D6E63] mt-1.5 italic leading-tight">
                    * Bạn có thể chọn <strong>nhiều file cùng lúc</strong> (Vietphrase.txt, Names.txt, PhuTu.txt, LuatNhan.txt...). Dữ liệu tự động lưu ngoại tuyến và gộp vào từ điển dịch.
                </p>
                <input 
                    type="file" 
                    ref={fileInputRef} 
                    className="hidden" 
                    accept=".txt,.dic" 
                    multiple
                    onChange={handleMultipleFilesUpload} 
                />
             </div>

             {/* CLOUD SYNC SECTION */}
             <div className="border-t border-[#D7CCC8] pt-3">
             <label className="block text-[10px] font-bold text-[#5D4037] uppercase mb-1 flex items-center gap-1"><Settings size={12}/> Đồng bộ Đám mây</label>

             {/* Auto Sync Toggle */}
             <div className="flex items-center justify-between bg-white border border-[#D7CCC8] p-2 rounded mb-2">
                 <div className="flex items-center gap-2">
                   <RefreshCw size={14} className={autoSync ? "text-green-600 animate-spin-slow" : "text-[#A1887F]"} />
                   <span className="text-xs font-medium text-[#5D4037]">Tự động đồng bộ</span>
                 </div>
                 <button 
                   onClick={() => setAutoSync(!autoSync)}
                   className={`w-8 h-4 rounded-full relative transition-colors ${autoSync ? 'bg-green-500' : 'bg-[#D7CCC8]'}`}
                 >
                   <div className={`absolute top-0.5 w-3 h-3 bg-white rounded-full transition-all ${autoSync ? 'left-4.5' : 'left-0.5'}`} style={{left: autoSync ? '18px' : '2px'}} />
                 </button>
               </div>
               
               {!isSignedIn && <div className="text-[10px] text-red-500 mt-1">Đăng nhập để đồng bộ dữ liệu.</div>}
             </div>

             {/* BULK IMPORT & OVERWRITE SECTION */}
             <div className="border-t border-[#D7CCC8] pt-3 mt-3">
                <label className="block text-[10px] font-bold text-[#5D4037] uppercase mb-1 flex items-center gap-1"><FileText size={12}/> Import hàng loạt / Ghi đè từ Excel</label>
                <textarea
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  placeholder="Dán từ Excel vào đây:&#10;Cột 1: Tiếng Trung&#10;Cột 2: Tiếng Việt (hoặc Trung = Việt)&#10;Cột 3: Loại từ (tùy chọn)"
                  className="w-full h-24 text-[10px] p-2 border border-[#D7CCC8] rounded bg-white outline-none resize-none mb-1.5 focus:ring-1 focus:ring-[#8D6E63]"
                />
                <div className="flex gap-1.5">
                  <button 
                    onClick={() => {
                      if (!bulkText.trim()) return;
                      const lines = bulkText.split('\n');
                      const newItems: CustomTerm[] = [];
                      lines.forEach(line => {
                        if (!line.trim()) return;
                        let parts: string[] = [];
                        
                        if (line.includes('\t')) {
                          parts = line.split('\t');
                        } else if (line.includes(' = ')) {
                          parts = line.split(' = ');
                        } else if (line.includes('=')) {
                          parts = line.split('=');
                        } else if (/\s{2,}/.test(line)) {
                          parts = line.split(/\s{2,}/);
                        } else {
                          const match = line.match(/^(\S+)\s+(.+)$/);
                          if (match) parts = [match[1], match[2]];
                        }
                        
                        if (parts.length >= 2) {
                          let termIdx = 0;
                          let meaningIdx = 1;
                          let catIdx = 2;
                          
                          if (/^\d+$/.test(parts[0].trim()) && parts.length >= 3) {
                            termIdx = 1;
                            meaningIdx = 2;
                            catIdx = 3;
                          }
                          
                          const termStr = parts[termIdx]?.trim();
                          const meaningStr = parts[meaningIdx]?.trim();
                          const categoryStr = parts[catIdx] ? parts[catIdx].trim() : undefined;
                          
                          if (termStr && meaningStr) {
                            const alreadyExistsInTerms = currentNovelTerms.some(t => t.term.toLowerCase() === termStr.toLowerCase());
                            const alreadyExistsInNew = newItems.some(t => t.term.toLowerCase() === termStr.toLowerCase());
                            
                            if (!alreadyExistsInTerms && !alreadyExistsInNew) {
                              newItems.push({
                                id: Date.now().toString() + Math.random().toString(36).substring(2, 6),
                                novelId: currentNovelId || '',
                                term: termStr,
                                meaning: meaningStr,
                                category: (categoryStr && categoryStr !== "Chưa phân loại") ? categoryStr : undefined
                              });
                            }
                          }
                        }
                      });
                      if (newItems.length > 0) {
                          onUpdateTerms([...currentNovelTerms, ...newItems]);
                          setBulkText('');
                          setSyncMessage({ type: 'success', text: `Đã thêm ${newItems.length} từ mới!` });
                          setTimeout(() => setSyncMessage(null), 3000);
                      } else {
                          setSyncMessage({ type: 'error', text: 'Tất cả các từ đều đã tồn tại trong truyện này!' });
                          setTimeout(() => setSyncMessage(null), 3000);
                      }
                    }}
                   className="flex-1 bg-[#5D4037] text-white text-[10px] py-1.5 rounded hover:bg-[#4E342E] transition-colors font-medium"
                 >
                   + Thêm nối tiếp
                 </button>

                 <button 
                   onClick={async () => {
                     if (!bulkText.trim()) return;
                     if (!window.confirm(`⚠️ Bạn có chắc chắn muốn GHI ĐÈ TOÀN BỘ từ vựng của bộ truyện này bằng danh sách vừa dán?\n(Tất cả từ cũ của bộ truyện này sẽ được thay thế bằng danh sách mới)`)) {
                       return;
                     }
                     
                     const lines = bulkText.split('\n');
                     const parsedItems: CustomTerm[] = [];
                     const seen = new Set<string>();

                     lines.forEach((line, index) => {
                       if (!line.trim()) return;
                       let parts: string[] = [];
                       
                       if (line.includes('\t')) {
                         parts = line.split('\t');
                       } else if (line.includes(' = ')) {
                         parts = line.split(' = ');
                       } else if (line.includes('=')) {
                         parts = line.split('=');
                       } else if (/\s{2,}/.test(line)) {
                         parts = line.split(/\s{2,}/);
                       } else {
                         const match = line.match(/^(\S+)\s+(.+)$/);
                         if (match) parts = [match[1], match[2]];
                       }
                       
                       if (parts.length >= 2) {
                         let termIdx = 0;
                         let meaningIdx = 1;
                         let catIdx = 2;
                         
                         if (/^\d+$/.test(parts[0].trim()) && parts.length >= 3) {
                           termIdx = 1;
                           meaningIdx = 2;
                           catIdx = 3;
                         }
                         
                         const termStr = parts[termIdx]?.trim();
                         const meaningStr = parts[meaningIdx]?.trim();
                         const categoryStr = parts[catIdx] ? parts[catIdx].trim() : undefined;
                         
                         if (termStr && meaningStr && !seen.has(termStr.toLowerCase())) {
                           seen.add(termStr.toLowerCase());
                           parsedItems.push({
                             id: `t_${Date.now()}_${index}_${Math.random().toString(36).substring(2, 5)}`,
                             novelId: currentNovelId || '',
                             term: termStr,
                             meaning: meaningStr,
                             category: (categoryStr && categoryStr !== "Chưa phân loại") ? categoryStr : undefined
                           });
                         }
                       }
                     });

                     if (parsedItems.length === 0) {
                       setSyncMessage({ type: 'error', text: 'Không tìm thấy dòng từ vựng hợp lệ nào!' });
                       setTimeout(() => setSyncMessage(null), 3000);
                       return;
                     }

                     onUpdateTerms(parsedItems);
                     
                     if (isSignedIn && currentNovelId) {
                       try {
                         await overwriteFirestoreData('vocab', currentNovelId, parsedItems);
                       } catch (err) {
                         console.error("Overwrite Cloud failed:", err);
                       }
                     }

                     setBulkText('');
                     setSyncMessage({ type: 'success', text: `Đã ghi đè thành công ${parsedItems.length} từ vào kho!` });
                     setTimeout(() => setSyncMessage(null), 4000);
                   }}
                   className="flex-1 bg-red-700 text-white text-[10px] py-1.5 rounded hover:bg-red-800 transition-colors font-bold shadow-sm"
                   title="Thay thế toàn bộ từ vựng hiện có của bộ truyện bằng các từ vừa dán"
                 >
                   Ghi đè toàn bộ
                 </button>
                </div>
             </div>
          </div>
      

)} 
      {/* Sync Buttons */}
      {!showSettings && (
          <div className="px-2 py-1.5 border-b border-[#D7CCC8] flex flex-col gap-1.5 bg-[#EFE5D9]">
             <div className="flex gap-2 justify-center">
                <button onClick={() => handlePullFromCloud(false)} disabled={isSyncing || !isSignedIn} className="flex-1 flex items-center justify-center gap-1 text-[10px] font-bold uppercase bg-white border border-blue-200 text-blue-700 py-1 rounded hover:bg-blue-50 shadow-sm disabled:opacity-50">
                   {isSyncing ? <Loader2 className="animate-spin" size={12} /> : <Download size={12} />} Tải về
                </button>
                <button onClick={() => handlePushToCloud(false)} disabled={isSyncing || !isSignedIn} className="flex-1 flex items-center justify-center gap-1 text-[10px] font-bold uppercase bg-white border border-green-200 text-green-700 py-1 rounded hover:bg-green-50 shadow-sm disabled:opacity-50">
                   {isSyncing ? <Loader2 className="animate-spin" size={12} /> : <Upload size={12} />} Đẩy lên
                </button>
             </div>
          </div>
      )}
      
      
      {syncMessage && (
         <div className={`px-2 py-0.5 text-[10px] text-center font-bold ${syncMessage.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'} transition-all`}>
            {syncMessage.text}
         </div>
      )}
      {/* Search Bar */}
      <div className="px-2 py-1.5 border-b border-[#D7CCC8] bg-[#EFE5D9] sticky top-0 z-10">
        <div className="relative">
          <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-[#A1887F]" />
          <input 
            type="text" 
            placeholder="Tìm kiếm..." 
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="w-full pl-7 pr-6 py-1 text-xs bg-white border border-[#D7CCC8] rounded-full focus:ring-1 focus:ring-[#8D6E63] outline-none transition-all placeholder:text-[#D7CCC8]"
          />
          {searchTerm && (
            <button 
              onClick={() => setSearchTerm('')}
              className="absolute right-2 top-1/2 -translate-y-1/2 text-[#A1887F] hover:text-[#5D4037]"
            >
              <X size={10} />
</button>
          )}
          
        </div>
      </div>

      {/* Table Content */}
      <div className="flex-1 overflow-y-auto bg-[#F5E6D3]">
        <table className="w-full text-left border-collapse">
          <thead className="bg-[#EFEBE9] sticky top-0 z-10 shadow-sm">
            <tr>
              <th className="py-0.5 px-1 text-[10px] font-bold text-[#5D4037] uppercase tracking-wider w-1/2 border-r border-[#D7CCC8]">Trung</th>
              <th className="py-0.5 px-1 text-[10px] font-bold text-[#5D4037] uppercase tracking-wider w-1/2">Việt</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#EFEBE9] bg-white">
            {filteredTerms.length === 0 ? (
              <tr>
                <td colSpan={2} className="py-8 text-center text-xs text-[#BCAAA4] italic">
                  {searchTerm ? 'Không tìm thấy kết quả' : 'Chưa có dữ liệu'}
                </td>
              </tr>
            ) : (
              filteredTerms.map((item) => (
                <tr key={item.id} className="group hover:bg-[#FFF8E1] transition-colors">
                  <td className="py-0.5 px-1 text-[11px] font-serif-sc font-medium text-[#3E2723] align-top relative border-r border-[#EFEBE9] leading-tight">
                     {item.term}
                  </td>
                  <td className="py-0.5 px-1 text-[11px] text-[#4E342E] align-top relative leading-tight pb-2 pr-6">
                     <span className="font-medium text-[#795548] block">{item.meaning}</span>
                     
                     {/* Category Dropdown (Google Sheets Style) */}
                     <div className="mt-0.5">
                       <select
                        
                         value={item.category || ''}
                         onChange={(e) => {
                           if (e.target.value === '__new__') {
                             const custom = prompt("Nhập phân loại mới:");
                             if (custom?.trim()) {
                               handleUpdateCategory(item.id, custom.trim());
                             }
                           } else {
                             handleUpdateCategory(item.id, e.target.value);
                           }
                         }}
                         className="text-[9px] px-1 bg-[#F5E6D3] text-[#5D4037] border border-[#D7CCC8] rounded cursor-pointer max-w-[120px] truncate focus:outline-none focus:ring-1 focus:ring-[#8D6E63] py-0"
                       >
                         <option value="">Chưa phân loại</option>
                         {allCategories.map(cat => (
                           <option key={cat} value={cat}>{cat}</option>
              ))}
                         <option value="__new__" className="text-blue-600 font-bold">+ Thêm mới...</option>
                       </select>
                     </div>

                     {/* Delete Button */}
                     
                       <button
                          onClick={() => handleDelete(item.id)}
                          className="absolute right-1 top-1/2 -translate-y-1/2 p-0.5 bg-white shadow-sm border border-[#D7CCC8] rounded text-[#BCAAA4] hover:text-[#D32F2F] opacity-0 group-hover:opacity-100 transition-all z-10"
                          title="Xóa"
                        >
                          <Trash2 size={10} />
                        </button>
                     
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Add New */}
      <div className="p-1 border-t border-[#D7CCC8] bg-[#EFE5D9] space-y-1">
         <div className="flex gap-1">
            <input
                type="text"
                placeholder="Từ gốc"
                value={newTerm}
               
                onChange={(e) => setNewTerm(e.target.value)}
                className={`w-1/2 px-1 py-0.5 text-[10px] border border-[#D7CCC8] rounded outline-none focus:border-[#8D6E63] font-serif-sc`}
            />
            <input
               type="text"
               placeholder="Nghĩa TV"
               value={newMeaning}
              
               onChange={(e) => setNewMeaning(e.target.value)}
               onKeyDown={(e) => e.key === 'Enter' && handleAdd()}
               className={`w-1/2 px-1 py-0.5 text-[10px] border border-[#D7CCC8] rounded outline-none focus:border-[#8D6E63]`}
            />
         </div>
         <div className="flex gap-1 items-center">
            {isCreatingCat ? (
              <div className="flex gap-1 items-center w-full">
                <input
                  type="text"
                  placeholder="Tên phân loại mới..."
                  value={newCatInput}
                  onChange={(e) => setNewCatInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter") {
                      e.preventDefault();
                      if (newCatInput.trim()) setCategoryVal(newCatInput.trim());
                      setIsCreatingCat(false);
                    }
                  }}
                  className="w-full text-[10px] px-1 py-0.5 border border-[#D7CCC8] rounded outline-none focus:border-[#8D6E63] bg-white"
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => {
                    if (newCatInput.trim()) setCategoryVal(newCatInput.trim());
                    setIsCreatingCat(false);
                  }}
                  className="px-1.5 py-0.5 bg-[#3E2723] text-[#F5E6D3] rounded text-[10px] font-bold"
                >
                  Lưu
                </button>
                <button
                  type="button"
                  onClick={() => setIsCreatingCat(false)}
                  className="px-1.5 py-0.5 bg-[#D7CCC8] text-[#3E2723] rounded text-[10px] font-bold"
                >
                  Hủy
                </button>
              </div>
            ) : (
              <select
                 value={categoryVal}
                 onChange={(e) => {
                   if (e.target.value === "__new__") {
                     setIsCreatingCat(true);
                     setNewCatInput("");
                   } else {
                     setCategoryVal(e.target.value);
                   }
                 }}
                 className={`w-full text-[10px] px-1 py-0.5 border border-[#D7CCC8] rounded outline-none focus:border-[#8D6E63] bg-white cursor-pointer`}
              >
                 <option value="">-- Chọn phân loại --</option>
                 {allCategories.map(cat => (
                   <option key={cat} value={cat}>{cat}</option>
                 ))}
                 <option value="__new__" className="text-blue-600 font-bold">+ Thêm phân loại mới...</option>
              </select>
            )}
         </div>
         <button 
            onClick={handleAdd}
            disabled={!newTerm.trim() || !newMeaning.trim()}
            className="w-full bg-[#3E2723] text-[#F5E6D3] py-0.5 rounded text-[10px] font-bold uppercase hover:bg-[#4E342E] disabled:opacity-50 flex justify-center items-center gap-1 shadow-sm"
         >
            <Plus size={10} /> Thêm
         </button>
      </div>
    </div>
  );
};
