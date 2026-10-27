import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { HistoryItem } from '../types';
import { X, Search, Clock, Trash2, RotateCcw, Calendar } from 'lucide-react';

interface HistoryModalProps {
  isOpen: boolean;
  onClose: () => void;
  history: HistoryItem[];
  onSelect: (item: HistoryItem) => void;
  onDelete: (id: string) => void;
  onClearAll: () => void;
}

export const HistoryModal: React.FC<HistoryModalProps> = ({
  isOpen,
  onClose,
  history,
  onSelect,
  onDelete,
  onClearAll
}) => {
  const [searchTerm, setSearchTerm] = useState('');

  // 1. FILTER & SORT
  const filteredHistory = useMemo(() => {
    if (!history || !Array.isArray(history)) return [];

    return history.filter(item => {
      if (!item || !item.result) return false;
      
      const term = searchTerm.toLowerCase();
      const source = (item.sourceText || '').toLowerCase();
      const result = (item.result.naturalTranslation || '').toLowerCase();
      
      return source.includes(term) || result.includes(term);
    }).sort((a, b) => (b.timestamp || 0) - (a.timestamp || 0));
  }, [history, searchTerm]);

  // 2. GROUP BY DATE
  const groupedHistory = useMemo(() => {
    const groups: { [key: string]: HistoryItem[] } = {};
    const today = new Date();
    const yesterday = new Date(today);
    yesterday.setDate(yesterday.getDate() - 1);

    const todayStr = today.toDateString();
    const yesterdayStr = yesterday.toDateString();

    filteredHistory.forEach(item => {
      if (!item.timestamp) return;
      
      let date: Date;
      try {
        date = new Date(item.timestamp);
        if (isNaN(date.getTime())) return;
      } catch (e) {
        return;
      }

      const dateStr = date.toDateString();
      
      let dateLabel = date.toLocaleDateString('vi-VN');
      if (dateStr === todayStr) dateLabel = 'Hôm nay';
      else if (dateStr === yesterdayStr) dateLabel = 'Hôm qua';

      if (!groups[dateLabel]) groups[dateLabel] = [];
      groups[dateLabel].push(item);
    });
    return groups;
  }, [filteredHistory]);

  if (!isOpen) return null;

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 animate-in fade-in duration-200">
      <div className="rounded-xl shadow-xl w-full max-w-2xl overflow-hidden flex flex-col max-h-[85vh] bg-white border border-[#D7CCC8]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b flex justify-between items-center bg-[#EFE5D9] border-[#D7CCC8] text-[#3E2723]">
          <div className="flex items-center gap-2">
            <Clock size={20} className="text-[#5D4037]" />
            <h2 className="text-lg font-bold">Lịch Sử Phiên Bản & Edit</h2>
          </div>
          <button 
            onClick={onClose}
            className="p-1.5 rounded-full transition-colors cursor-pointer text-[#A1887F] hover:text-[#3E2723] hover:bg-[#D7CCC8]"
          >
            <X size={20} />
          </button>
        </div>

        {/* Search Bar */}
        <div className="p-4 border-b bg-white border-[#D7CCC8]">
          <div className="relative">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A1887F]" />
            <input 
              type="text" 
              placeholder="Tìm kiếm trong lịch sử..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-2 text-sm rounded-lg outline-none transition-all bg-[#EFE5D9] border-none focus:ring-2 focus:ring-[#D7CCC8] text-[#3E2723] placeholder:text-[#BCAAA4]"
            />
          </div>
        </div>

        {/* List Content */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4 bg-[#F5E6D3]">
          {Object.keys(groupedHistory).length === 0 ? (
            <div className="text-center py-12 italic text-[#BCAAA4]">
              {searchTerm ? 'Không tìm thấy kết quả phù hợp.' : 'Chưa có lịch sử edit.'}
            </div>
          ) : (
            Object.entries(groupedHistory).map(([dateLabel, items]) => (
              <div key={dateLabel}>
                <div className="flex items-center gap-2 mb-2 px-2">
                   <Calendar size={12} className="text-[#A1887F]"/>
                   <span className="text-xs font-bold uppercase tracking-wider text-[#8D6E63]">{dateLabel}</span>
                </div>
                <div className="space-y-2">
                  {(items as HistoryItem[]).map(item => (
                    <div key={item.id} className="p-3 rounded-lg shadow-sm border transition-shadow group relative bg-white border-[#D7CCC8] hover:shadow-md">
                       {/* Time */}
                       <div className="text-[10px] mb-1 flex justify-between items-center text-[#A1887F]">
                          <div className="flex items-center gap-2">
                             <span>{new Date(item.timestamp).toLocaleTimeString('vi-VN', {hour: '2-digit', minute:'2-digit'})}</span>
                          </div>
                          <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                             <button 
                               onClick={(e) => { e.stopPropagation(); onDelete(item.id); }}
                               className="hover:text-red-600 flex items-center gap-1 cursor-pointer"
                               title="Xóa mục này"
                             >
                                <Trash2 size={12} />
                             </button>
                          </div>
                       </div>
                       
                       {/* Content Snippet */}
                       <div className="grid grid-cols-2 gap-4 cursor-pointer" onClick={() => onSelect(item)}>
                          <div className="border-r pr-2 border-[#EFEBE9]">
                             <p className="text-sm font-serif-sc line-clamp-2 text-[#3E2723]">{item.sourceText}</p>
                          </div>
                          <div>
                             <p className="text-sm line-clamp-2 text-[#5D4037]">{item.result?.naturalTranslation || '...'}</p>
                          </div>
                       </div>

                       {/* Restore Button (Floating) */}
                       <button
                          onClick={() => onSelect(item)}
                          className="absolute right-3 top-1/2 -translate-y-1/2 text-white p-2 rounded-full shadow-lg opacity-0 group-hover:opacity-100 transition-all hover:scale-105 cursor-pointer bg-[#3E2723] hover:bg-[#4E342E]"
                          title="Khôi phục bản edit này"
                       >
                          <RotateCcw size={16} />
                       </button>
                    </div>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>

        {/* Footer */}
        {history.length > 0 && (
          <div className="p-4 border-t flex justify-between items-center bg-white border-[#D7CCC8]">
             <span className="text-xs text-[#A1887F]">{history.length} bản ghi</span>
             <button 
               onClick={() => {
                 if (window.confirm("Bạn có chắc chắn muốn xóa toàn bộ lịch sử?")) {
                   onClearAll();
                 }
               }}
               className="text-[#D32F2F] text-xs font-bold hover:bg-red-50 px-3 py-1.5 rounded transition-colors flex items-center gap-1 cursor-pointer"
             >
               <Trash2 size={14} /> Xóa tất cả
             </button>
          </div>
        )}
      </div>
    </div>,
    document.body
  );
};