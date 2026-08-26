import React, { useState, useMemo, useEffect } from 'react';
import { Chapter, CustomTerm } from '../types';
import { X, Search, BookOpen, Trash2, RotateCcw, Calendar, CheckSquare, Square, FolderDown, Edit2, Check, AlertCircle } from 'lucide-react';
import { vietphraseEngine } from '../services/vietphraseService';
import JSZip from 'jszip';

interface ChapterArchiveModalProps {
  isOpen: boolean;
  onClose: () => void;
  chapters: Chapter[];
  customTerms: CustomTerm[];
  onSelectChapter: (chapter: Chapter) => void;
  onDeleteChapter: (id: string) => void;
  onRenameChapter: (id: string, newName: string) => void;
  onClearAll: () => void;
}

export const ChapterArchiveModal: React.FC<ChapterArchiveModalProps> = ({
  isOpen,
  onClose,
  chapters,
  customTerms,
  onSelectChapter,
  onDeleteChapter,
  onRenameChapter,
  onClearAll
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState('');
  const [isExporting, setIsExporting] = useState(false);
  const [showZipOptions, setShowZipOptions] = useState(false);
  const [optExportTable, setOptExportTable] = useState(true);
  const [optExportParallel, setOptExportParallel] = useState(false);
  const [optExportEdit, setOptExportEdit] = useState(false);

  // Initialize selected IDs to all chapters when modal opens
  useEffect(() => {
    if (isOpen) {
      setSelectedIds(new Set(chapters.map(c => c.id)));
    }
  }, [isOpen, chapters.length]);

  // Filtered Chapters
  const filteredChapters = useMemo(() => {
    if (!chapters || !Array.isArray(chapters)) return [];
    return chapters.filter(c => {
      const name = (c.name || '').toLowerCase();
      const source = (c.inputText || '').toLowerCase();
      const natural = (c.result?.naturalTranslation || '').toLowerCase();
      return name.includes(searchTerm.toLowerCase()) || 
             source.includes(searchTerm.toLowerCase()) || 
             natural.includes(searchTerm.toLowerCase());
    }).sort((a, b) => b.timestamp - a.timestamp);
  }, [chapters, searchTerm]);

  // Toggle Single Selection
  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    setSelectedIds(next);
  };

  // Toggle All Visible
  const toggleSelectAll = () => {
    const visibleIds = filteredChapters.map(c => c.id);
    const allSelected = visibleIds.every(id => selectedIds.has(id));
    
    const next = new Set(selectedIds);
    if (allSelected) {
      visibleIds.forEach(id => next.delete(id));
    } else {
      visibleIds.forEach(id => next.add(id));
    }
    setSelectedIds(next);
  };

  // Handle Edit Name Click
  const startEditing = (c: Chapter) => {
    setEditingId(c.id);
    setEditingName(c.name);
  };

  const saveNameEdit = (id: string) => {
    const trimmed = editingName.trim();
    if (trimmed) {
      onRenameChapter(id, trimmed);
    }
    setEditingId(null);
  };

  const handleExportZipClick = () => {
    const selectedChapters = chapters.filter(c => selectedIds.has(c.id));
    if (selectedChapters.length === 0) return;
    setShowZipOptions(true);
  };

  // Export Selected to ZIP
  const performExportZip = async () => {
    const selectedChapters = chapters.filter(c => selectedIds.has(c.id));
    if (selectedChapters.length === 0) return;

    if (!optExportTable && !optExportParallel && !optExportEdit) {
      alert("Vui lòng chọn ít nhất một định dạng tải về!");
      return;
    }

    setIsExporting(true);
    setShowZipOptions(false);

    try {
      const zip = new JSZip();

      // Optimize custom terms map
      const customMap = new Map<string, string>();
      customTerms.forEach(t => {
        if (t.term && t.meaning) {
          customMap.set(t.term.trim(), t.meaning.trim());
        }
      });

      selectedChapters.forEach(chapter => {
        if (!chapter.result?.segments || chapter.result.segments.length === 0) return;

        let fileWithExt = chapter.name.trim();
        if (!fileWithExt.endsWith('.doc') && !fileWithExt.endsWith('.docx')) {
          fileWithExt += '.doc';
        }

        // Option 1: Table view
        if (optExportTable) {
          let tableRowsHtml = "";
          chapter.result.segments.forEach(seg => {
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
              <title>${chapter.name}</title>
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

          const content = '\ufeff' + htmlContent;
          zip.file(`Bản đối chiếu dạng bảng/${fileWithExt}`, content);
        }

        // Option 2: Edit & Raw
        if (optExportParallel) {
          const parallelHtmlContent = `
            <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
            <head>
              <meta charset="utf-8">
              <title>${chapter.name}</title>
              <style>
                body { font-family: "Times New Roman", Times, serif; font-size: 12pt; line-height: 1.6; color: #333333; }
                p.raw { color: #8D6E63; font-family: "SimSun", serif; font-size: 11pt; margin: 0 0 4px 0; }
                p.edit { color: #3E2723; font-weight: bold; margin: 0 0 16px 0; }
              </style>
            </head>
            <body>
              ${chapter.result.segments.map(seg => {
                const raw = (seg.source || '').trim();
                const edit = (seg.natural || '').trim();
                if (!raw && !edit) return '';
                return `<p class="raw">${raw}</p><p class="edit">${edit}</p>`;
              }).join('')}
            </body>
            </html>
          `;
          zip.file(`Bản dịch song ngữ (Edit & Raw)/${fileWithExt}`, '\ufeff' + parallelHtmlContent);
        }

        // Option 3: Only Edit
        if (optExportEdit) {
          const editHtmlContent = `
            <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
            <head>
              <meta charset="utf-8">
              <title>${chapter.name}</title>
              <style>
                body { font-family: "Times New Roman", Times, serif; font-size: 12pt; line-height: 1.6; color: #3E2723; }
                p { margin: 0 0 12px 0; }
              </style>
            </head>
            <body>
              ${chapter.result.segments.map(seg => {
                const edit = (seg.natural || '').trim();
                if (!edit) return '';
                return `<p>${edit}</p>`;
              }).join('')}
            </body>
            </html>
          `;
          zip.file(`Bản dịch tinh chỉnh (Chỉ Edit)/${fileWithExt}`, '\ufeff' + editHtmlContent);
        }
      });

      const zipBlob = await zip.generateAsync({ type: 'blob' });
      const url = URL.createObjectURL(zipBlob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `Bo_chuong_dich_${new Date().toISOString().slice(0, 10)}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (e) {
      console.error("Lỗi xuất file ZIP", e);
      alert("Đã xảy ra lỗi khi tạo file ZIP. Vui lòng thử lại!");
    } finally {
      setIsExporting(false);
    }
  };

  if (!isOpen) return null;

  const visibleIds = filteredChapters.map(c => c.id);
  const allSelected = visibleIds.length > 0 && visibleIds.every(id => selectedIds.has(id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#3E2723]/70 backdrop-blur-sm animate-in fade-in duration-200">
      <div className="bg-[#FFFDF7] rounded-xl shadow-2xl w-full max-w-3xl overflow-hidden flex flex-col max-h-[85vh] border border-[#D7CCC8]">
        
        {/* Header */}
        <div className="px-6 py-4 border-b border-[#D7CCC8] flex justify-between items-center bg-[#EFE5D9]">
          <div className="flex items-center gap-2 text-[#3E2723]">
            <BookOpen size={20} className="text-[#5D4037]" />
            <h2 className="text-lg font-bold">Kho Lưu Trữ Chương</h2>
          </div>
          <button 
            onClick={onClose}
            className="text-[#A1887F] hover:text-[#3E2723] hover:bg-[#D7CCC8] p-1.5 rounded-full transition-colors"
          >
            <X size={20} />
          </button>
        </div>

        {/* Toolbar */}
        <div className="p-4 border-b border-[#D7CCC8] bg-white flex flex-col sm:flex-row gap-3 items-center justify-between">
          <div className="relative w-full sm:max-w-xs">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-[#A1887F]" />
            <input 
              type="text" 
              placeholder="Tìm chương..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="w-full pl-9 pr-4 py-1.5 text-xs bg-[#EFE5D9]/50 border border-[#D7CCC8] rounded focus:ring-1 focus:ring-[#8D6E63] outline-none transition-all text-[#3E2723] placeholder:text-[#BCAAA4]"
            />
          </div>

          <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
            <button
              onClick={toggleSelectAll}
              className="flex items-center gap-1.5 text-xs font-bold text-[#5D4037] hover:text-[#3E2723] bg-[#EFEBE9]/40 border border-[#D7CCC8] px-3 py-1.5 rounded transition-all"
            >
              {allSelected ? <CheckSquare size={14} /> : <Square size={14} />}
              <span>Chọn tất cả ({selectedIds.size}/{chapters.length})</span>
            </button>
            
            <button
              onClick={handleExportZipClick}
              disabled={selectedIds.size === 0 || isExporting}
              className={`flex items-center gap-1.5 text-xs font-bold px-3 py-1.5 rounded transition-all shadow-sm ${
                selectedIds.size > 0 && !isExporting
                  ? 'bg-[#5D4037] text-white hover:bg-[#3E2723] cursor-pointer'
                  : 'bg-[#EFEBE9] text-[#BCAAA4] border border-[#D7CCC8] cursor-not-allowed'
              }`}
            >
              <FolderDown size={14} />
              <span>{isExporting ? 'Đang tạo ZIP...' : `Tải ZIP (${selectedIds.size} file)`}</span>
            </button>
          </div>
        </div>

        {/* Info Tip */}
        <div className="bg-[#FFF8E1] px-6 py-2 border-b border-[#FFE082] flex items-center gap-2 text-xs text-[#795548]">
          <AlertCircle size={14} className="text-[#FFB300]" />
          <span>Lưu trữ cục bộ không giới hạn dung lượng trên máy tính của bạn. Hãy tích lũy nhiều chương rồi bấm <strong>Tải ZIP</strong> để lấy toàn bộ folder file Word đối chiếu sạch đẹp!</span>
        </div>

        {/* Chapter List */}
        <div className="flex-1 overflow-y-auto p-4 bg-[#F5E6D3]/50 space-y-2">
          {filteredChapters.length === 0 ? (
            <div className="text-center py-16 text-[#BCAAA4] italic text-xs">
              {searchTerm ? 'Không tìm thấy chương nào phù hợp.' : 'Kho chương trống. Hãy lưu chương từ phần kết quả dịch!'}
            </div>
          ) : (
            filteredChapters.map(c => {
              const isSelected = selectedIds.has(c.id);
              const isEditing = editingId === c.id;

              return (
                <div 
                  key={c.id} 
                  className={`flex items-center justify-between p-3 rounded-lg border transition-all ${
                    isSelected 
                      ? 'bg-white border-[#8D6E63] shadow-md ring-1 ring-[#8D6E63]/20' 
                      : 'bg-white border-[#D7CCC8] hover:border-[#8D6E63]/60 hover:shadow-sm'
                  }`}
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0 pr-4">
                    {/* Checkbox */}
                    <button 
                      onClick={() => toggleSelect(c.id)}
                      className="text-[#5D4037] hover:scale-105 transition-transform shrink-0"
                    >
                      {isSelected ? <CheckSquare size={18} /> : <Square size={18} className="text-[#BCAAA4]" />}
                    </button>

                    {/* Content info */}
                    <div className="flex-1 min-w-0">
                      {isEditing ? (
                        <div className="flex items-center gap-1.5">
                          <input 
                            type="text"
                            value={editingName}
                            onChange={(e) => setEditingName(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') saveNameEdit(c.id);
                              if (e.key === 'Escape') setEditingId(null);
                            }}
                            className="bg-white border border-[#8D6E63] rounded px-2 py-0.5 text-xs text-[#3E2723] font-bold outline-none flex-1 max-w-sm focus:ring-1 focus:ring-[#8D6E63]"
                            autoFocus
                          />
                          <button 
                            onClick={() => saveNameEdit(c.id)}
                            className="bg-[#5D4037] text-white p-1 rounded hover:bg-[#3E2723] transition-colors"
                          >
                            <Check size={12} />
                          </button>
                        </div>
                      ) : (
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-xs text-[#3E2723] truncate">{c.name}</span>
                          <button 
                            onClick={() => startEditing(c)}
                            className="text-[#A1887F] hover:text-[#3E2723] transition-colors p-0.5"
                            title="Sửa tên chương"
                          >
                            <Edit2 size={11} />
                          </button>
                        </div>
                      )}
                      
                      <div className="flex items-center gap-3 mt-1 text-[10px] text-[#A1887F]">
                        <span className="flex items-center gap-1">
                          <Calendar size={10} />
                          {new Date(c.timestamp).toLocaleString('vi-VN', { hour: '2-digit', minute: '2-digit', day: '2-digit', month: '2-digit' })}
                        </span>
                        <span>•</span>
                        <span>{c.result?.segments?.length || 0} đoạn dịch</span>
                        {c.completedSegments && c.completedSegments.length > 0 && (
                          <>
                            <span>•</span>
                            <span className="text-emerald-700 font-bold bg-emerald-50 px-1 py-0.2 rounded border border-emerald-200">
                              Đã làm {c.completedSegments.length}/{c.result?.segments?.length || 0}
                            </span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Actions */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      onClick={() => {
                        if (window.confirm(`Bạn có chắc chắn muốn khôi phục và tiếp tục sửa "${c.name}"? Bản nháp hiện tại của bạn sẽ bị ghi đè.`)) {
                          onSelectChapter(c);
                        }
                      }}
                      className="flex items-center gap-1 text-[10px] font-bold text-[#5D4037] hover:text-[#3E2723] bg-[#EFEBE9] hover:bg-[#D7CCC8] px-2.5 py-1 rounded transition-colors"
                      title="Nạp vào editor để dịch tiếp"
                    >
                      <RotateCcw size={11} />
                      <span>Sửa tiếp</span>
                    </button>
                    
                    <button
                      onClick={() => {
                        if (window.confirm(`Bạn muốn xóa "${c.name}" khỏi kho lưu trữ?`)) {
                          onDeleteChapter(c.id);
                        }
                      }}
                      className="text-[#A1887F] hover:text-red-600 p-1 rounded hover:bg-red-50 transition-colors"
                      title="Xóa chương"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        {chapters.length > 0 && (
          <div className="p-4 border-t border-[#D7CCC8] bg-white flex justify-between items-center">
            <span className="text-xs text-[#A1887F] font-bold">Tổng cộng: {chapters.length} chương lưu trữ</span>
            <button 
              onClick={() => {
                if (window.confirm("CẢNH BÁO: Hành động này sẽ XÓA TOÀN BỘ chương lưu trữ trong kho! Bạn có chắc chắn muốn tiếp tục không?")) {
                  onClearAll();
                }
              }}
              className="text-[#D32F2F] text-[10px] font-bold hover:bg-red-50 px-2.5 py-1 rounded transition-colors flex items-center gap-1 border border-transparent"
            >
              <Trash2 size={12} /> Xóa sạch kho chương
            </button>
          </div>
        )}
      </div>

      {showZipOptions && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-[#3E2723]/60 backdrop-blur-sm animate-in fade-in duration-200">
          <div className="bg-[#FFFDF7] rounded-xl border border-[#D7CCC8] shadow-2xl w-full max-w-md overflow-hidden transform animate-in zoom-in-95 duration-150">
            <div className="px-5 py-4 border-b border-[#D7CCC8] bg-[#EFE5D9] flex justify-between items-center">
              <div className="flex items-center gap-2 text-[#3E2723] font-bold text-sm">
                <FolderDown size={16} className="text-[#5D4037]" />
                <span>Cấu hình tải bộ chương ZIP</span>
              </div>
              <button onClick={() => setShowZipOptions(false)} className="text-[#A1887F] hover:text-[#3E2723] p-1 rounded-full transition-colors">
                <X size={16} />
              </button>
            </div>
            
            <div className="p-5 space-y-4">
              <p className="text-xs text-[#5D4037] font-medium leading-relaxed">
                Hệ thống sẽ tạo một file nén <strong>.zip</strong> chứa các thư mục tương ứng với định dạng bạn chọn. Mỗi thư mục sẽ có các chương được lưu dưới dạng file Word (.doc).
              </p>
              
              <div className="space-y-3 bg-white p-3.5 rounded-lg border border-[#D7CCC8]">
                {/* Option 1: Table view */}
                <label className="flex items-start gap-3 cursor-pointer select-none group">
                  <input
                    type="checkbox"
                    checked={optExportTable}
                    onChange={(e) => setOptExportTable(e.target.checked)}
                    className="mt-0.5 rounded text-[#5D4037] focus:ring-[#8D6E63] border-[#D7CCC8]"
                  />
                  <div>
                    <span className="text-xs font-bold text-[#3E2723] group-hover:text-[#5D4037] transition-colors">
                      Thư mục: Bản đối chiếu dạng bảng
                    </span>
                    <p className="text-[10px] text-[#A1887F]">
                      Chứa file bảng đối chiếu 4 cột (Raw - Vietphrase - Google/DeepL - Edit).
                    </p>
                  </div>
                </label>

                {/* Option 2: Edit & Raw */}
                <label className="flex items-start gap-3 cursor-pointer select-none group pt-2 border-t border-[#F5E6D3]">
                  <input
                    type="checkbox"
                    checked={optExportParallel}
                    onChange={(e) => setOptExportParallel(e.target.checked)}
                    className="mt-0.5 rounded text-[#5D4037] focus:ring-[#8D6E63] border-[#D7CCC8]"
                  />
                  <div>
                    <span className="text-xs font-bold text-[#3E2723] group-hover:text-[#5D4037] transition-colors">
                      Thư mục: Bản dịch song ngữ (Edit & Raw)
                    </span>
                    <p className="text-[10px] text-[#A1887F]">
                      Chứa file dạng đoạn Raw và đoạn Edit dính sát nhau, phân dòng rõ ràng.
                    </p>
                  </div>
                </label>

                {/* Option 3: Only Edit */}
                <label className="flex items-start gap-3 cursor-pointer select-none group pt-2 border-t border-[#F5E6D3]">
                  <input
                    type="checkbox"
                    checked={optExportEdit}
                    onChange={(e) => setOptExportEdit(e.target.checked)}
                    className="mt-0.5 rounded text-[#5D4037] focus:ring-[#8D6E63] border-[#D7CCC8]"
                  />
                  <div>
                    <span className="text-xs font-bold text-[#3E2723] group-hover:text-[#5D4037] transition-colors">
                      Thư mục: Bản dịch tinh chỉnh (Chỉ Edit)
                    </span>
                    <p className="text-[10px] text-[#A1887F]">
                      Chứa file chỉ có các đoạn dịch đã tinh chỉnh mượt mà (sạch Raw).
                    </p>
                  </div>
                </label>
              </div>

              <div className="text-[10px] text-[#A1887F] italic bg-[#FFF8E1] p-2 rounded border border-[#FFE082] flex items-center gap-1.5">
                <AlertCircle size={12} className="text-[#FFB300] shrink-0" />
                <span>Bạn có thể tích chọn nhiều thư mục cùng một lúc để tải về trọn bộ!</span>
              </div>
            </div>
            
            <div className="bg-[#F5F2F0] px-5 py-3 border-t border-[#D7CCC8] flex justify-end gap-2">
              <button
                onClick={() => setShowZipOptions(false)}
                className="px-3.5 py-1.5 rounded text-xs font-bold text-[#5D4037] hover:bg-[#D7CCC8]/30 transition-all border border-transparent"
              >
                Hủy
              </button>
              <button
                onClick={performExportZip}
                disabled={!optExportTable && !optExportParallel && !optExportEdit}
                className={`px-4 py-1.5 rounded text-white text-xs font-bold transition-all shadow-sm ${
                  (optExportTable || optExportParallel || optExportEdit)
                    ? 'bg-[#5D4037] hover:bg-[#3E2723] cursor-pointer'
                    : 'bg-[#EFEBE9] text-[#BCAAA4] border border-[#D7CCC8] cursor-not-allowed'
                }`}
              >
                Tải ZIP ({selectedIds.size} chương)
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
