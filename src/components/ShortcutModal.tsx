import React, { useState, useEffect, useMemo } from 'react';
import { TextShortcut, Novel } from '../types';
import { 
  getStoredShortcuts, 
  saveStoredShortcuts, 
  isShortcutsEnabled, 
  setShortcutsEnabled,
  syncShortcutsFromCloud
} from '../services/shortcutService';
import { getNovels } from '../services/firestoreService';
import { auth } from '../services/firebase';
import { 
  X, 
  Plus, 
  Trash2, 
  Search, 
  FileText, 
  Download, 
  Check, 
  Keyboard, 
  ToggleLeft, 
  ToggleRight,
  Edit2,
  Book,
  Cloud,
  RefreshCw
} from 'lucide-react';

interface ShortcutModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentNovelId?: string;
  onSelectNovel?: (novelId: string) => void;
}

export const ShortcutModal: React.FC<ShortcutModalProps> = ({ 
  isOpen, 
  onClose,
  currentNovelId = '',
  onSelectNovel
}) => {
  const [activeNovelId, setActiveNovelId] = useState<string>(currentNovelId);
  const [novels, setNovels] = useState<Novel[]>([]);
  const [shortcuts, setShortcuts] = useState<TextShortcut[]>([]);
  const [enabled, setEnabled] = useState<boolean>(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [isSyncing, setIsSyncing] = useState(false);
  
  // Add single form
  const [newShortcut, setNewShortcut] = useState('');
  const [newExpansion, setNewExpansion] = useState('');
  
  // Bulk import state
  const [showBulk, setShowBulk] = useState(false);
  const [bulkText, setBulkText] = useState('');
  
  // Edit state
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editShortcut, setEditShortcut] = useState('');
  const [editExpansion, setEditExpansion] = useState('');
  
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setActiveNovelId(currentNovelId);
      getNovels().then(list => {
        if (list && list.length > 0) setNovels(list);
      }).catch(() => {});
    }
  }, [isOpen, currentNovelId]);

  useEffect(() => {
    if (isOpen) {
      setShortcuts(getStoredShortcuts(activeNovelId));
      setEnabled(isShortcutsEnabled());
      setMessage(null);
      setEditingId(null);

      // Tự động đồng bộ từ Firestore
      if (activeNovelId && auth.currentUser) {
        setIsSyncing(true);
        syncShortcutsFromCloud(activeNovelId)
          .then(list => {
            if (list) setShortcuts(list);
          })
          .catch(console.warn)
          .finally(() => setIsSyncing(false));
      }
    }
  }, [isOpen, activeNovelId]);

  const currentNovelObj = useMemo(() => {
    return novels.find(n => n.id === activeNovelId);
  }, [novels, activeNovelId]);

  const showToast = (text: string, type: 'success' | 'error' = 'success') => {
    setMessage({ type, text });
    setTimeout(() => setMessage(null), 3000);
  };

  const handleToggleGlobal = () => {
    const next = !enabled;
    setEnabled(next);
    setShortcutsEnabled(next);
    showToast(next ? 'Đã bật tính năng gõ tắt' : 'Đã tắt tính năng gõ tắt');
  };

  const handleAddSingle = (e: React.FormEvent) => {
    e.preventDefault();
    const sc = newShortcut.trim().toLowerCase();
    const exp = newExpansion.trim();

    if (!sc || !exp) {
      showToast('Vui lòng nhập cả phím tắt và cụm từ thay thế', 'error');
      return;
    }

    const exists = shortcuts.some(s => s.shortcut.toLowerCase() === sc);
    if (exists) {
      // Cập nhật lại cụm từ thay thế nếu đã tồn tại
      const updated = shortcuts.map(s => s.shortcut.toLowerCase() === sc ? { ...s, expansion: exp, enabled: true } : s);
      setShortcuts(updated);
      saveStoredShortcuts(updated, activeNovelId);
      setNewShortcut('');
      setNewExpansion('');
      showToast(`Đã cập nhật phím tắt "${sc}" -> "${exp}"`);
      return;
    }

    const newItem: TextShortcut = {
      id: Date.now().toString() + Math.random().toString(36).substring(2, 6),
      novelId: activeNovelId,
      shortcut: sc,
      expansion: exp,
      enabled: true
    };

    const next = [newItem, ...shortcuts];
    setShortcuts(next);
    saveStoredShortcuts(next, activeNovelId);
    setNewShortcut('');
    setNewExpansion('');
    showToast(`Đã thêm phím tắt: ${sc} -> ${exp}`);
  };

  const handleToggleItem = (id: string) => {
    const updated = shortcuts.map(s => s.id === id ? { ...s, enabled: !s.enabled } : s);
    setShortcuts(updated);
    saveStoredShortcuts(updated, activeNovelId);
  };

  const handleDeleteItem = (id: string) => {
    const updated = shortcuts.filter(s => s.id !== id);
    setShortcuts(updated);
    saveStoredShortcuts(updated, activeNovelId);
    showToast('Đã xóa phím tắt');
  };

  const handleStartEdit = (item: TextShortcut) => {
    setEditingId(item.id);
    setEditShortcut(item.shortcut);
    setEditExpansion(item.expansion);
  };

  const handleSaveEdit = (id: string) => {
    const sc = editShortcut.trim().toLowerCase();
    const exp = editExpansion.trim();
    if (!sc || !exp) return;

    const updated = shortcuts.map(s => s.id === id ? { ...s, shortcut: sc, expansion: exp } : s);
    setShortcuts(updated);
    saveStoredShortcuts(updated, activeNovelId);
    setEditingId(null);
    showToast('Đã lưu thay đổi');
  };

  const handleBulkAdd = () => {
    if (!bulkText.trim()) return;
    const lines = bulkText.split('\n');
    const newItems: TextShortcut[] = [];
    const existingMap = new Map(shortcuts.map(s => [s.shortcut.toLowerCase(), s]));

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
        const sc = parts[0].trim().toLowerCase();
        const exp = parts[1].trim();
        if (sc && exp) {
          if (existingMap.has(sc)) {
            // Update existing
            const item = existingMap.get(sc)!;
            item.expansion = exp;
          } else {
            const newItem: TextShortcut = {
              id: Date.now().toString() + Math.random().toString(36).substring(2, 6),
              novelId: activeNovelId,
              shortcut: sc,
              expansion: exp,
              enabled: true
            };
            existingMap.set(sc, newItem);
            newItems.push(newItem);
          }
        }
      }
    });

    const next = Array.from(existingMap.values());
    setShortcuts(next);
    saveStoredShortcuts(next, activeNovelId);
    setBulkText('');
    setShowBulk(false);
    showToast(`Đã nạp thành công danh sách phím tắt (${next.length} từ)`);
  };

  const handleBulkOverwrite = () => {
    if (!bulkText.trim()) return;
    if (!window.confirm('Bạn có chắc chắn muốn GHI ĐÈ TOÀN BỘ danh sách gõ tắt của truyện này bằng nội dung vừa dán?')) return;

    const lines = bulkText.split('\n');
    const parsedItems: TextShortcut[] = [];
    const seen = new Set<string>();

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
        const sc = parts[0].trim().toLowerCase();
        const exp = parts[1].trim();
        if (sc && exp && !seen.has(sc)) {
          seen.add(sc);
          parsedItems.push({
            id: Date.now().toString() + Math.random().toString(36).substring(2, 6),
            novelId: activeNovelId,
            shortcut: sc,
            expansion: exp,
            enabled: true
          });
        }
      }
    });

    if (parsedItems.length === 0) {
      showToast('Không tìm thấy dòng phím tắt hợp lệ nào!', 'error');
      return;
    }

    setShortcuts(parsedItems);
    saveStoredShortcuts(parsedItems, activeNovelId);
    setBulkText('');
    setShowBulk(false);
    showToast(`Đã ghi đè toàn bộ ${parsedItems.length} phím tắt!`);
  };

  const handleExportText = () => {
    const textData = shortcuts.map(s => `${s.shortcut}\t${s.expansion}`).join('\n');
    const blob = new Blob([textData], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const slugName = (currentNovelObj?.name || 'truyen').replace(/[^a-zA-Z0-9]/g, '_');
    a.download = `bang_go_tat_${slugName}_${new Date().toISOString().slice(0, 10)}.txt`;
    a.click();
    URL.revokeObjectURL(url);
    showToast('Đã tải xuống danh sách gõ tắt');
  };

  const filteredShortcuts = useMemo(() => {
    if (!searchQuery.trim()) return shortcuts;
    const q = searchQuery.toLowerCase();
    return shortcuts.filter(s => s.shortcut.toLowerCase().includes(q) || s.expansion.toLowerCase().includes(q));
  }, [shortcuts, searchQuery]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
      <div className="bg-[#FAF7F2] w-full max-w-2xl rounded-2xl shadow-2xl border border-[#D7CCC8] flex flex-col max-h-[90vh] overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        
        {/* HEADER */}
        <div className="bg-[#3E2723] text-[#FFECB3] px-5 py-3.5 flex items-center justify-between border-b border-[#5D4037]">
          <div className="flex items-center gap-2.5">
            <div className="bg-[#5D4037] p-1.5 rounded-lg text-[#FFECB3]">
              <Keyboard size={18} />
            </div>
            <div>
              <h2 className="text-base font-bold text-white tracking-wide">Quản lý Bảng Gõ Tắt</h2>
              <p className="text-[11px] text-[#D7CCC8]">Tự động thay thế từ viết tắt khi gõ (ví dụ: <span className="text-[#FFECB3] font-mono">xh</span> → <span className="text-[#FFECB3] font-bold">xe hơi</span>)</p>
            </div>
          </div>
          
          <div className="flex items-center gap-3">
            {/* Global toggle */}
            <button
              onClick={handleToggleGlobal}
              className={`flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold transition-all ${
                enabled 
                  ? 'bg-emerald-600/30 text-emerald-300 border border-emerald-500/40 hover:bg-emerald-600/40' 
                  : 'bg-rose-900/40 text-rose-300 border border-rose-700/40 hover:bg-rose-900/60'
              }`}
              title="Bật/Tắt tính năng gõ tắt"
            >
              {enabled ? <ToggleRight size={16} /> : <ToggleLeft size={16} />}
              <span>{enabled ? 'Đang BẬT' : 'Đã TẮT'}</span>
            </button>

            <button 
              onClick={onClose}
              className="text-[#D7CCC8] hover:text-white p-1 rounded-lg hover:bg-[#5D4037] transition-colors"
            >
              <X size={18} />
            </button>
          </div>
        </div>

        {/* NOVEL SELECTION BAR */}
        <div className="bg-[#EFEBE9] px-5 py-2.5 flex flex-wrap items-center justify-between gap-2 border-b border-[#D7CCC8]">
          <div className="flex items-center gap-2">
            <Book size={14} className="text-[#5D4037]" />
            <span className="text-xs font-bold text-[#5D4037]">Truyện đang chọn:</span>
            {novels.length > 0 ? (
              <select
                value={activeNovelId}
                onChange={(e) => {
                  const nextId = e.target.value;
                  setActiveNovelId(nextId);
                  onSelectNovel?.(nextId);
                }}
                className="bg-white border border-[#BCAAA4] rounded-lg px-2.5 py-1 text-xs font-bold text-[#3E2723] outline-none focus:ring-1 focus:ring-[#5D4037] shadow-sm"
              >
                <option value="">-- Truyện mặc định (Chung) --</option>
                {novels.map(n => (
                  <option key={n.id} value={n.id}>{n.name}</option>
                ))}
              </select>
            ) : (
              <span className="text-xs font-bold text-[#3E2723] bg-white px-2.5 py-1 rounded-lg border border-[#D7CCC8] shadow-sm">
                {currentNovelObj ? currentNovelObj.name : 'Truyện mặc định / Chung'}
              </span>
            )}
          </div>
          
          <div className="flex items-center gap-2">
            {auth.currentUser ? (
              <button
                onClick={() => {
                  if (activeNovelId) {
                    setIsSyncing(true);
                    syncShortcutsFromCloud(activeNovelId)
                      .then(list => {
                        if (list) setShortcuts(list);
                        showToast('Đã đồng bộ dữ liệu gõ tắt với Firestore');
                      })
                      .catch(() => showToast('Lỗi khi đồng bộ Firestore', 'error'))
                      .finally(() => setIsSyncing(false));
                  }
                }}
                className="flex items-center gap-1 text-[11px] font-medium text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200 hover:bg-emerald-100 transition-colors"
                title="Dữ liệu gõ tắt được tự động lưu lên Firestore theo từng truyện"
              >
                <RefreshCw size={11} className={isSyncing ? "animate-spin" : ""} />
                <span>{isSyncing ? 'Đang đồng bộ...' : 'Tự lưu Firestore'}</span>
              </button>
            ) : (
              <span className="text-[10px] text-amber-800 bg-amber-50 px-2 py-0.5 rounded-full border border-amber-200" title="Đăng nhập để đồng bộ lên Firestore">
                Lưu cục bộ (Đăng nhập để lưu Firestore)
              </span>
            )}
          </div>
        </div>

        {/* TOAST MESSAGE */}
        {message && (
          <div className={`px-4 py-2 text-xs font-semibold flex items-center justify-between ${
            message.type === 'success' ? 'bg-emerald-50 text-emerald-800 border-b border-emerald-200' : 'bg-red-50 text-red-800 border-b border-red-200'
          }`}>
            <span>{message.text}</span>
            <button onClick={() => setMessage(null)}><X size={12} /></button>
          </div>
        )}

        {/* BODY */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          
          {/* QUICK ADD FORM */}
          <div className="bg-white p-3.5 rounded-xl border border-[#D7CCC8] shadow-sm">
            <h3 className="text-xs font-bold text-[#5D4037] uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <Plus size={14} className="text-[#8D6E63]" /> Thêm phím tắt mới
            </h3>
            <form onSubmit={handleAddSingle} className="grid grid-cols-1 sm:grid-cols-12 gap-2">
              <div className="sm:col-span-4">
                <input
                  type="text"
                  value={newShortcut}
                  onChange={(e) => setNewShortcut(e.target.value)}
                  placeholder="Viết tắt (vd: xh, dc, ko)"
                  className="w-full text-xs px-3 py-2 border border-[#D7CCC8] rounded-lg bg-[#FAFAFA] font-mono focus:bg-white focus:ring-1 focus:ring-[#8D6E63] outline-none"
                />
              </div>
              <div className="sm:col-span-6">
                <input
                  type="text"
                  value={newExpansion}
                  onChange={(e) => setNewExpansion(e.target.value)}
                  placeholder="Cụm từ đầy đủ (vd: xe hơi, được, không)"
                  className="w-full text-xs px-3 py-2 border border-[#D7CCC8] rounded-lg bg-[#FAFAFA] focus:bg-white focus:ring-1 focus:ring-[#8D6E63] outline-none"
                />
              </div>
              <div className="sm:col-span-2">
                <button
                  type="submit"
                  className="w-full bg-[#5D4037] hover:bg-[#3E2723] text-white text-xs font-bold py-2 px-3 rounded-lg transition-colors flex items-center justify-center gap-1 shadow-sm"
                >
                  <Plus size={14} /> Thêm
                </button>
              </div>
            </form>
            <div className="mt-1.5 text-[11px] text-[#8D6E63] italic">
              💡 Khi gõ từ viết tắt và nhấn <kbd className="px-1 py-0.5 bg-gray-100 border border-gray-300 rounded text-[10px] font-mono">Dấu cách</kbd>, <kbd className="px-1 py-0.5 bg-gray-100 border border-gray-300 rounded text-[10px] font-mono">Enter</kbd> hoặc dấu câu, từ sẽ tự động bung ra đầy đủ. Hỗ trợ thông minh: <span className="font-mono">Xh</span> → <span className="font-semibold">Xe hơi</span>, <span className="font-mono">XH</span> → <span className="font-semibold">XE HƠI</span>.
            </div>
          </div>

          {/* BULK IMPORT TOGGLE & PANEL */}
          <div className="bg-white rounded-xl border border-[#D7CCC8] overflow-hidden shadow-sm">
            <button
              onClick={() => setShowBulk(!showBulk)}
              className="w-full px-3.5 py-2.5 bg-[#EFEBE9]/40 hover:bg-[#EFEBE9]/80 transition-colors flex items-center justify-between text-xs font-bold text-[#5D4037]"
            >
              <span className="flex items-center gap-1.5">
                <FileText size={14} /> Import hàng loạt / Ghi đè từ Excel ({shortcuts.length} từ)
              </span>
              <span className="text-[11px] text-[#8D6E63] underline">
                {showBulk ? 'Thu gọn ▲' : 'Mở rộng dán nhiều từ ▼'}
              </span>
            </button>

            {showBulk && (
              <div className="p-3.5 border-t border-[#D7CCC8] bg-[#FAFAFA] space-y-2.5">
                <textarea
                  value={bulkText}
                  onChange={(e) => setBulkText(e.target.value)}
                  placeholder="Dán danh sách từ Excel vào đây:&#10;Cột 1: Viết tắt (xh)&#10;Cột 2: Cụm từ đầy đủ (xe hơi)&#10;Hoặc định dạng: xh = xe hơi"
                  className="w-full h-28 text-xs p-2.5 border border-[#D7CCC8] rounded-lg bg-white outline-none resize-none focus:ring-1 focus:ring-[#8D6E63]"
                />
                <div className="flex gap-2">
                  <button
                    onClick={handleBulkAdd}
                    className="flex-1 bg-[#5D4037] hover:bg-[#4E342E] text-white text-xs font-bold py-2 rounded-lg transition-colors shadow-sm"
                  >
                    + Thêm nối tiếp (Giữ từ cũ)
                  </button>
                  <button
                    onClick={handleBulkOverwrite}
                    className="flex-1 bg-red-700 hover:bg-red-800 text-white text-xs font-bold py-2 rounded-lg transition-colors shadow-sm"
                  >
                    Ghi đè toàn bộ danh sách
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* SEARCH & ACTIONS BAR */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 pt-1">
            <div className="relative w-full sm:w-64">
              <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-[#8D6E63]" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm kiếm phím tắt..."
                className="w-full text-xs pl-8 pr-3 py-1.5 border border-[#D7CCC8] rounded-lg bg-white outline-none focus:ring-1 focus:ring-[#8D6E63]"
              />
            </div>

            <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
              <button
                onClick={handleExportText}
                className="text-[11px] font-medium text-[#5D4037] hover:text-[#3E2723] px-2.5 py-1.5 rounded-lg border border-[#D7CCC8] bg-white hover:bg-[#EFEBE9] transition-colors flex items-center gap-1"
                title="Tải về danh sách gõ tắt dạng file văn bản"
              >
                <Download size={12} /> Tải file .txt
              </button>
              {shortcuts.length > 0 && (
                <button
                  onClick={() => {
                    if (window.confirm('Bạn có chắc muốn xóa tất cả từ gõ tắt của truyện này không?')) {
                      setShortcuts([]);
                      saveStoredShortcuts([], activeNovelId);
                      showToast('Đã xóa sạch danh sách gõ tắt của truyện');
                    }
                  }}
                  className="text-[11px] font-medium text-red-600 hover:text-red-800 px-2.5 py-1.5 rounded-lg border border-red-200 bg-red-50 hover:bg-red-100 transition-colors flex items-center gap-1"
                  title="Xóa tất cả phím tắt của truyện này"
                >
                  <Trash2 size={12} /> Xóa tất cả
                </button>
              )}
            </div>
          </div>

          {/* SHORTCUTS LIST */}
          <div className="bg-white rounded-xl border border-[#D7CCC8] overflow-hidden shadow-sm">
            <div className="bg-[#EFEBE9]/60 px-4 py-2 border-b border-[#D7CCC8] flex justify-between items-center text-[11px] font-bold text-[#5D4037] uppercase">
              <span className="w-12">Bật</span>
              <span className="w-28">Viết tắt</span>
              <span className="flex-1">Cụm từ thay thế</span>
              <span className="w-16 text-right">Thao tác</span>
            </div>

            <div className="divide-y divide-[#EFEBE9] max-h-72 overflow-y-auto">
              {filteredShortcuts.length === 0 ? (
                <div className="p-8 text-center text-xs text-[#8D6E63]">
                  {searchQuery ? 'Không tìm thấy phím tắt phù hợp' : 'Chưa có từ gõ tắt nào. Hãy thêm từ đầu tiên ở trên!'}
                </div>
              ) : (
                filteredShortcuts.map((item) => {
                  const isEditing = editingId === item.id;
                  return (
                    <div 
                      key={item.id}
                      className={`px-4 py-2 flex items-center justify-between text-xs transition-colors ${
                        item.enabled ? 'hover:bg-[#FAF7F2]' : 'bg-gray-50/60 opacity-60'
                      }`}
                    >
                      {/* TOGGLE */}
                      <div className="w-12">
                        <input
                          type="checkbox"
                          checked={item.enabled}
                          onChange={() => handleToggleItem(item.id)}
                          className="rounded text-[#5D4037] focus:ring-[#8D6E63] cursor-pointer"
                          title={item.enabled ? 'Đang bật' : 'Đang tắt'}
                        />
                      </div>

                      {/* SHORTCUT */}
                      <div className="w-28 font-mono font-bold text-[#3E2723]">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editShortcut}
                            onChange={(e) => setEditShortcut(e.target.value)}
                            className="w-24 text-xs px-2 py-1 border border-[#8D6E63] rounded font-mono bg-white outline-none"
                          />
                        ) : (
                          <span className="bg-[#EFE5D9] text-[#5D4037] px-2 py-0.5 rounded border border-[#D7CCC8]">
                            {item.shortcut}
                          </span>
                        )}
                      </div>

                      {/* EXPANSION */}
                      <div className="flex-1 text-[#4E342E] pr-2">
                        {isEditing ? (
                          <input
                            type="text"
                            value={editExpansion}
                            onChange={(e) => setEditExpansion(e.target.value)}
                            className="w-full text-xs px-2 py-1 border border-[#8D6E63] rounded bg-white outline-none"
                          />
                        ) : (
                          <span className="font-medium">{item.expansion}</span>
                        )}
                      </div>

                      {/* ACTIONS */}
                      <div className="w-16 flex items-center justify-end gap-1">
                        {isEditing ? (
                          <>
                            <button
                              onClick={() => handleSaveEdit(item.id)}
                              className="text-emerald-700 hover:text-emerald-900 p-1 hover:bg-emerald-50 rounded"
                              title="Lưu"
                            >
                              <Check size={14} />
                            </button>
                            <button
                              onClick={() => setEditingId(null)}
                              className="text-gray-500 hover:text-gray-700 p-1 hover:bg-gray-100 rounded"
                              title="Hủy"
                            >
                              <X size={14} />
                            </button>
                          </>
                        ) : (
                          <>
                            <button
                              onClick={() => handleStartEdit(item)}
                              className="text-[#8D6E63] hover:text-[#3E2723] p-1 hover:bg-[#EFEBE9] rounded"
                              title="Chỉnh sửa"
                            >
                              <Edit2 size={13} />
                            </button>
                            <button
                              onClick={() => handleDeleteItem(item.id)}
                              className="text-red-500 hover:text-red-700 p-1 hover:bg-red-50 rounded"
                              title="Xóa"
                            >
                              <Trash2 size={13} />
                            </button>
                          </>
                        )}
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* FOOTER */}
        <div className="bg-[#EFEBE9]/60 px-5 py-3 border-t border-[#D7CCC8] flex justify-between items-center">
          <div className="text-xs text-[#5D4037] font-semibold">
            Tổng cộng: <span className="font-bold text-[#3E2723]">{shortcuts.length}</span> từ gõ tắt ({shortcuts.filter(s => s.enabled).length} đang bật)
          </div>
          <button
            onClick={onClose}
            className="bg-[#5D4037] hover:bg-[#3E2723] text-white text-xs font-bold px-4 py-2 rounded-xl transition-colors shadow-sm"
          >
            Đóng
          </button>
        </div>

      </div>
    </div>
  );
};
