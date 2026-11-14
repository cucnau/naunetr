import React, { useState, useMemo } from 'react';
import { createPortal } from 'react-dom';
import {
  X,
  BookOpen,
  FileText,
  History,
  BookA,
  CheckSquare,
  Square,
  Eye,
  EyeOff,
  HardDrive,
  RotateCcw,
} from 'lucide-react';
import {
  ExtractedLocalData,
  SelectedLocalRestoreData,
} from '../services/localExtractService';

interface LocalExtractModalProps {
  isOpen: boolean;
  onClose: () => void;
  data: ExtractedLocalData | null;
  onRestoreSelected: (selection: SelectedLocalRestoreData) => Promise<void> | void;
}

type ExtractTab = 'novels' | 'chapters' | 'drafts' | 'world';

export const LocalExtractModal: React.FC<LocalExtractModalProps> = ({
  isOpen,
  onClose,
  data,
  onRestoreSelected,
}) => {
  const [activeTab, setActiveTab] = useState<ExtractTab>('novels');
  const [selectedNovelIds, setSelectedNovelIds] = useState<Set<string>>(new Set());
  const [selectedChapterIds, setSelectedChapterIds] = useState<Set<string>>(new Set());
  const [selectedSessionId, setSelectedSessionId] = useState<string | null>(null);
  const [selectedHistoryIds, setSelectedHistoryIds] = useState<Set<string>>(new Set());
  const [selectedTermIds, setSelectedTermIds] = useState<Set<string>>(new Set());
  const [selectedCharIds, setSelectedCharIds] = useState<Set<string>>(new Set());
  const [selectedRelIds, setSelectedRelIds] = useState<Set<string>>(new Set());
  const [selectedShortcutIds, setSelectedShortcutIds] = useState<Set<string>>(new Set());

  const [previewKey, setPreviewKey] = useState<string | null>(null);
  const [isApplying, setIsApplying] = useState(false);

  const novelNameById = useMemo(() => {
    const map = new Map<string, string>();
    (data?.novels || []).forEach((n) => map.set(n.id, n.name));
    return map;
  }, [data]);

  if (!isOpen || !data) return null;

  const totalSelectedCount =
    selectedNovelIds.size +
    selectedChapterIds.size +
    (selectedSessionId ? 1 : 0) +
    selectedHistoryIds.size +
    selectedTermIds.size +
    selectedCharIds.size +
    selectedRelIds.size +
    selectedShortcutIds.size;

  const isAllEmpty =
    data.novels.length === 0 &&
    data.chapters.length === 0 &&
    data.sessions.length === 0 &&
    data.historyItems.length === 0 &&
    data.customTerms.length === 0 &&
    data.characters.length === 0 &&
    data.relationships.length === 0 &&
    data.shortcuts.length === 0;

  const toggleSet = (setter: React.Dispatch<React.SetStateAction<Set<string>>>, id: string) => {
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleConfirmRestore = async () => {
    if (totalSelectedCount === 0 || isApplying) return;
    setIsApplying(true);
    try {
      const selection: SelectedLocalRestoreData = {
        novels: data.novels
          .filter((n) => selectedNovelIds.has(n.id))
          .map((n) => ({ id: n.id, name: n.name })),
        chapters: data.chapters
          .filter((c) => selectedChapterIds.has(c.chapter.id))
          .map((c) => c.chapter),
        sessionToRestore: data.sessions.find((s) => s.id === selectedSessionId) || null,
        historyToRestore: data.historyItems
          .filter((h) => selectedHistoryIds.has(h.item.id))
          .map((h) => h.item),
        customTerms: data.customTerms
          .filter((t) => selectedTermIds.has(t.term.id))
          .map((t) => t.term),
        characters: data.characters
          .filter((c) => selectedCharIds.has(c.character.id))
          .map((c) => c.character),
        relationships: data.relationships
          .filter((r) => selectedRelIds.has(r.relationship.id))
          .map((r) => r.relationship),
        shortcuts: data.shortcuts
          .filter((s) => selectedShortcutIds.has(s.shortcut.id))
          .map((s) => s.shortcut),
      };
      await onRestoreSelected(selection);
      onClose();
    } finally {
      setIsApplying(false);
    }
  };

  const formatTime = (ts?: number) => {
    if (!ts) return 'Không rõ thời gian';
    try {
      return new Date(ts).toLocaleString('vi-VN');
    } catch (_) {
      return 'Không rõ thời gian';
    }
  };

  return createPortal(
    <div className="fixed inset-0 z-[120] flex items-center justify-center p-3 sm:p-4">
      <div className="fixed inset-0 bg-black/55" onClick={onClose} />
      <div className="relative bg-[#FAFAFA] border border-[#D7CCC8] rounded-xl shadow-2xl w-full max-w-3xl max-h-[88vh] flex flex-col overflow-hidden z-10 text-[#3E2723]">
        {/* Header */}
        <div className="bg-[#EFE5D9] px-5 py-3.5 flex items-center justify-between border-b border-[#D7CCC8] shrink-0">
          <div className="flex items-center gap-2">
            <HardDrive size={17} className="text-[#5D4037]" />
            <div>
              <h3 className="text-sm font-bold tracking-wide text-[#3E2723]">
                TRÍCH XUẤT DỮ LIỆU LOCAL (CHỈ XEM & CHỌN KHÔI PHỤC)
              </h3>
              <p className="text-[10px] text-[#6D4C41]">
                Dữ liệu dưới đây chỉ được đọc từ trình duyệt để bạn xem trước. Hệ thống chỉ khôi phục những mục bạn tick chọn.
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="text-[#5D4037] hover:text-[#3E2723] hover:bg-[#D7CCC8]/50 p-1 rounded-md transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>
        </div>

        {/* Tabs */}
        <div className="bg-[#F5EDE3] px-4 py-2 border-b border-[#D7CCC8] flex flex-wrap gap-1.5 shrink-0">
          <button
            type="button"
            onClick={() => setActiveTab('novels')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              activeTab === 'novels'
                ? 'bg-[#5D4037] text-white'
                : 'bg-white text-[#5D4037] border border-[#D7CCC8] hover:bg-[#FAF6F0]'
            }`}
          >
            <BookOpen size={13} />
            <span>Truyện ({data.novels.length})</span>
            {selectedNovelIds.size > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-400 text-[#3E2723]">
                {selectedNovelIds.size}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('chapters')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              activeTab === 'chapters'
                ? 'bg-[#5D4037] text-white'
                : 'bg-white text-[#5D4037] border border-[#D7CCC8] hover:bg-[#FAF6F0]'
            }`}
          >
            <FileText size={13} />
            <span>Kho chương ({data.chapters.length})</span>
            {selectedChapterIds.size > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-400 text-[#3E2723]">
                {selectedChapterIds.size}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('drafts')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              activeTab === 'drafts'
                ? 'bg-[#5D4037] text-white'
                : 'bg-white text-[#5D4037] border border-[#D7CCC8] hover:bg-[#FAF6F0]'
            }`}
          >
            <History size={13} />
            <span>Bản thảo & Lịch sử ({data.sessions.length + data.historyItems.length})</span>
            {(selectedSessionId ? 1 : 0) + selectedHistoryIds.size > 0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-400 text-[#3E2723]">
                {(selectedSessionId ? 1 : 0) + selectedHistoryIds.size}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('world')}
            className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-bold transition-colors cursor-pointer ${
              activeTab === 'world'
                ? 'bg-[#5D4037] text-white'
                : 'bg-white text-[#5D4037] border border-[#D7CCC8] hover:bg-[#FAF6F0]'
            }`}
          >
            <BookA size={13} />
            <span>
              Từ điển & Thiết lập (
              {data.customTerms.length +
                data.characters.length +
                data.relationships.length +
                data.shortcuts.length}
              )
            </span>
            {selectedTermIds.size +
              selectedCharIds.size +
              selectedRelIds.size +
              selectedShortcutIds.size >
              0 && (
              <span className="px-1.5 py-0.2 rounded-full text-[10px] bg-amber-400 text-[#3E2723]">
                {selectedTermIds.size +
                  selectedCharIds.size +
                  selectedRelIds.size +
                  selectedShortcutIds.size}
              </span>
            )}
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto p-4 space-y-3 bg-[#FAF7F2]">
          {isAllEmpty && (
            <div className="bg-white border border-[#D7CCC8] rounded-lg p-6 text-center text-xs text-[#6D4C41]">
              Không tìm thấy dữ liệu nào trong bộ nhớ Local (IndexedDB / LocalStorage) của trình duyệt này.
            </div>
          )}

          {/* TAB 1: NOVELS */}
          {activeTab === 'novels' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[#6D4C41] uppercase">
                  Danh sách truyện tìm thấy trong Local ({data.novels.length})
                </span>
                {data.novels.length > 0 && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedNovelIds(new Set(data.novels.map((n) => n.id)))}
                      className="text-[11px] font-semibold text-[#5D4037] underline cursor-pointer"
                    >
                      Chọn tất cả
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedNovelIds(new Set())}
                      className="text-[11px] text-[#8D6E63] underline cursor-pointer"
                    >
                      Bỏ chọn
                    </button>
                  </div>
                )}
              </div>

              {data.novels.length === 0 ? (
                <p className="text-xs text-[#8D6E63] bg-white p-4 rounded-lg border border-[#EFEBE9]">
                  Không có bộ truyện nào được tìm thấy trong Local.
                </p>
              ) : (
                data.novels.map((novel) => {
                  const checked = selectedNovelIds.has(novel.id);
                  const chCount = data.chapters.filter((c) => c.chapter.novelId === novel.id).length;
                  return (
                    <div
                      key={novel.id}
                      onClick={() => toggleSet(setSelectedNovelIds, novel.id)}
                      className={`flex items-start justify-between gap-3 p-3 rounded-lg border cursor-pointer transition-colors ${
                        checked
                          ? 'bg-[#FFF8E1] border-[#FFB74D]'
                          : 'bg-white border-[#E0D6CC] hover:bg-[#FAF6F0]'
                      }`}
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        {checked ? (
                          <CheckSquare size={16} className="text-[#E65100] shrink-0 mt-0.5" />
                        ) : (
                          <Square size={16} className="text-[#A1887F] shrink-0 mt-0.5" />
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-[#3E2723] truncate">{novel.name}</p>
                          <p className="text-[10px] text-[#8D6E63] truncate">
                            ID: {novel.id} • {chCount} chương liên kết • Nguồn: {novel.source}
                          </p>
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* TAB 2: CHAPTERS */}
          {activeTab === 'chapters' && (
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <span className="text-[11px] font-bold text-[#6D4C41] uppercase">
                  Các chương tìm thấy trong Local ({data.chapters.length})
                </span>
                {data.chapters.length > 0 && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setSelectedChapterIds(new Set(data.chapters.map((c) => c.chapter.id)))}
                      className="text-[11px] font-semibold text-[#5D4037] underline cursor-pointer"
                    >
                      Chọn tất cả
                    </button>
                    <button
                      type="button"
                      onClick={() => setSelectedChapterIds(new Set())}
                      className="text-[11px] text-[#8D6E63] underline cursor-pointer"
                    >
                      Bỏ chọn
                    </button>
                  </div>
                )}
              </div>

              {data.chapters.length === 0 ? (
                <p className="text-xs text-[#8D6E63] bg-white p-4 rounded-lg border border-[#EFEBE9]">
                  Không có chương nào được tìm thấy trong Local.
                </p>
              ) : (
                data.chapters.map(({ chapter, source }) => {
                  const checked = selectedChapterIds.has(chapter.id);
                  const segs = chapter.result?.segments || [];
                  const isPreviewOpen = previewKey === `ch_${chapter.id}`;
                  const novelLabel =
                    (chapter.novelId && novelNameById.get(chapter.novelId)) ||
                    chapter.novelId ||
                    'Chưa gắn truyện';
                  return (
                    <div
                      key={chapter.id}
                      className={`rounded-lg border transition-colors ${
                        checked
                          ? 'bg-[#FFF8E1] border-[#FFB74D]'
                          : 'bg-white border-[#E0D6CC]'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2 p-3">
                        <div
                          onClick={() => toggleSet(setSelectedChapterIds, chapter.id)}
                          className="flex items-start gap-2.5 min-w-0 flex-1 cursor-pointer"
                        >
                          {checked ? (
                            <CheckSquare size={16} className="text-[#E65100] shrink-0 mt-0.5" />
                          ) : (
                            <Square size={16} className="text-[#A1887F] shrink-0 mt-0.5" />
                          )}
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-[#3E2723] truncate">
                              {chapter.name || `Chương (${chapter.id})`}
                            </p>
                            <p className="text-[10px] text-[#8D6E63]">
                              Truyện: {novelLabel} • {segs.length} đoạn • {formatTime(chapter.timestamp)} • Nguồn: {source}
                            </p>
                          </div>
                        </div>

                        <button
                          type="button"
                          onClick={() => setPreviewKey(isPreviewOpen ? null : `ch_${chapter.id}`)}
                          className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded border border-[#D7CCC8] bg-[#FAF6F0] hover:bg-[#EFE5D9] text-[#5D4037] shrink-0 cursor-pointer"
                        >
                          {isPreviewOpen ? <EyeOff size={12} /> : <Eye size={12} />}
                          <span>{isPreviewOpen ? 'Ẩn' : 'Xem trước'}</span>
                        </button>
                      </div>

                      {isPreviewOpen && (
                        <div className="px-3 pb-3 pt-1 border-t border-[#EFEBE9] text-[11px] space-y-1.5 bg-white/80">
                          <div>
                            <span className="font-bold text-[#6D4C41]">Raw (trích): </span>
                            <span className="text-[#3E2723] whitespace-pre-wrap">
                              {(chapter.inputText || segs.map((s) => s.source).join('\n')).slice(0, 350) || '(Trống)'}
                            </span>
                          </div>
                          <div>
                            <span className="font-bold text-[#6D4C41]">Bản edit/dịch (trích): </span>
                            <span className="text-[#3E2723] whitespace-pre-wrap">
                              {(chapter.result?.naturalTranslation || segs.map((s) => s.natural).join('\n')).slice(0, 350) || '(Chưa có)'}
                            </span>
                          </div>
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          )}

          {/* TAB 3: DRAFTS & HISTORY */}
          {activeTab === 'drafts' && (
            <div className="space-y-4">
              <div className="space-y-2">
                <span className="text-[11px] font-bold text-[#6D4C41] uppercase block">
                  Bản thảo đang làm dở ({data.sessions.length}) — Chọn tối đa 1 để nạp vào bảng Edit
                </span>
                {data.sessions.length === 0 ? (
                  <p className="text-xs text-[#8D6E63] bg-white p-3 rounded-lg border border-[#EFEBE9]">
                    Không có bản thảo làm dở nào trong Local.
                  </p>
                ) : (
                  data.sessions.map((s) => {
                    const checked = selectedSessionId === s.id;
                    const isPreviewOpen = previewKey === `sess_${s.id}`;
                    const segCount = s.result?.segments?.length || 0;
                    return (
                      <div
                        key={s.id}
                        className={`rounded-lg border ${
                          checked ? 'bg-[#FFF8E1] border-[#FFB74D]' : 'bg-white border-[#E0D6CC]'
                        }`}
                      >
                        <div className="flex items-start justify-between gap-2 p-3">
                          <div
                            onClick={() => setSelectedSessionId(checked ? null : s.id)}
                            className="flex items-start gap-2.5 min-w-0 flex-1 cursor-pointer"
                          >
                            {checked ? (
                              <CheckSquare size={16} className="text-[#E65100] shrink-0 mt-0.5" />
                            ) : (
                              <Square size={16} className="text-[#A1887F] shrink-0 mt-0.5" />
                            )}
                            <div className="min-w-0">
                              <p className="text-xs font-bold text-[#3E2723] truncate">{s.label}</p>
                              <p className="text-[10px] text-[#8D6E63]">
                                {segCount} đoạn đối chiếu • Nguồn: {s.source}
                              </p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => setPreviewKey(isPreviewOpen ? null : `sess_${s.id}`)}
                            className="flex items-center gap-1 text-[10px] font-semibold px-2 py-1 rounded border border-[#D7CCC8] bg-[#FAF6F0] hover:bg-[#EFE5D9] text-[#5D4037] shrink-0 cursor-pointer"
                          >
                            {isPreviewOpen ? <EyeOff size={12} /> : <Eye size={12} />}
                            <span>{isPreviewOpen ? 'Ẩn' : 'Xem'}</span>
                          </button>
                        </div>
                        {isPreviewOpen && (
                          <div className="px-3 pb-3 pt-1 border-t border-[#EFEBE9] text-[11px] bg-white/80 whitespace-pre-wrap">
                            {(s.result?.naturalTranslation || s.inputText || s.preEditedText).slice(0, 450)}
                          </div>
                        )}
                      </div>
                    );
                  })
                )}
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold text-[#6D4C41] uppercase">
                    Lịch sử lưu trong Local ({data.historyItems.length})
                  </span>
                  {data.historyItems.length > 0 && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedHistoryIds(new Set(data.historyItems.map((h) => h.item.id)))}
                        className="text-[11px] font-semibold text-[#5D4037] underline cursor-pointer"
                      >
                        Chọn tất cả
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedHistoryIds(new Set())}
                        className="text-[11px] text-[#8D6E63] underline cursor-pointer"
                      >
                        Bỏ chọn
                      </button>
                    </div>
                  )}
                </div>

                {data.historyItems.length === 0 ? (
                  <p className="text-xs text-[#8D6E63] bg-white p-3 rounded-lg border border-[#EFEBE9]">
                    Không có mục lịch sử nào trong Local.
                  </p>
                ) : (
                  data.historyItems.map(({ item, source }) => {
                    const checked = selectedHistoryIds.has(item.id);
                    return (
                      <div
                        key={item.id}
                        onClick={() => toggleSet(setSelectedHistoryIds, item.id)}
                        className={`flex items-start gap-2.5 p-3 rounded-lg border cursor-pointer ${
                          checked ? 'bg-[#FFF8E1] border-[#FFB74D]' : 'bg-white border-[#E0D6CC]'
                        }`}
                      >
                        {checked ? (
                          <CheckSquare size={16} className="text-[#E65100] shrink-0 mt-0.5" />
                        ) : (
                          <Square size={16} className="text-[#A1887F] shrink-0 mt-0.5" />
                        )}
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-[#3E2723] truncate">
                            {(item.result?.naturalTranslation || item.sourceText || '').slice(0, 80) || 'Bản ghi lịch sử'}
                          </p>
                          <p className="text-[10px] text-[#8D6E63]">
                            {formatTime(item.timestamp)} • {item.result?.segments?.length || 0} đoạn • {source}
                          </p>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}

          {/* TAB 4: TERMS, CHARACTERS, RELATIONSHIPS, SHORTCUTS */}
          {activeTab === 'world' && (
            <div className="space-y-4">
              {/* Custom Terms */}
              <div className="bg-white border border-[#E0D6CC] rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#3E2723]">
                    Từ điển / Thuật ngữ ({data.customTerms.length})
                  </span>
                  {data.customTerms.length > 0 && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedTermIds(new Set(data.customTerms.map((t) => t.term.id)))}
                        className="text-[11px] font-semibold text-[#5D4037] underline cursor-pointer"
                      >
                        Chọn tất cả
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedTermIds(new Set())}
                        className="text-[11px] text-[#8D6E63] underline cursor-pointer"
                      >
                        Bỏ chọn
                      </button>
                    </div>
                  )}
                </div>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {data.customTerms.length === 0 ? (
                    <p className="text-[11px] text-[#8D6E63]">Không có từ vựng nào.</p>
                  ) : (
                    data.customTerms.map(({ term, source }) => {
                      const checked = selectedTermIds.has(term.id);
                      return (
                        <div
                          key={term.id}
                          onClick={() => toggleSet(setSelectedTermIds, term.id)}
                          className="flex items-center gap-2 text-[11px] py-1 px-2 rounded hover:bg-[#FAF6F0] cursor-pointer"
                        >
                          {checked ? (
                            <CheckSquare size={14} className="text-[#E65100] shrink-0" />
                          ) : (
                            <Square size={14} className="text-[#A1887F] shrink-0" />
                          )}
                          <span className="font-bold">{term.term}</span>
                          <span>→ {term.meaning}</span>
                          <span className="text-[10px] text-[#8D6E63] ml-auto">{source}</span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Characters */}
              <div className="bg-white border border-[#E0D6CC] rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#3E2723]">
                    Nhân vật ({data.characters.length})
                  </span>
                  {data.characters.length > 0 && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedCharIds(new Set(data.characters.map((c) => c.character.id)))}
                        className="text-[11px] font-semibold text-[#5D4037] underline cursor-pointer"
                      >
                        Chọn tất cả
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedCharIds(new Set())}
                        className="text-[11px] text-[#8D6E63] underline cursor-pointer"
                      >
                        Bỏ chọn
                      </button>
                    </div>
                  )}
                </div>
                <div className="max-h-40 overflow-y-auto space-y-1">
                  {data.characters.length === 0 ? (
                    <p className="text-[11px] text-[#8D6E63]">Không có nhân vật nào.</p>
                  ) : (
                    data.characters.map(({ character }) => {
                      const checked = selectedCharIds.has(character.id);
                      return (
                        <div
                          key={character.id}
                          onClick={() => toggleSet(setSelectedCharIds, character.id)}
                          className="flex items-center gap-2 text-[11px] py-1 px-2 rounded hover:bg-[#FAF6F0] cursor-pointer"
                        >
                          {checked ? (
                            <CheckSquare size={14} className="text-[#E65100] shrink-0" />
                          ) : (
                            <Square size={14} className="text-[#A1887F] shrink-0" />
                          )}
                          <span className="font-bold">{character.chineseName}</span>
                          <span>→ {character.vietName}</span>
                          {character.pronouns && (
                            <span className="text-[10px] text-[#8D6E63]">({character.pronouns})</span>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Relationships */}
              <div className="bg-white border border-[#E0D6CC] rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#3E2723]">
                    Quan hệ xưng hô ({data.relationships.length})
                  </span>
                  {data.relationships.length > 0 && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedRelIds(new Set(data.relationships.map((r) => r.relationship.id)))}
                        className="text-[11px] font-semibold text-[#5D4037] underline cursor-pointer"
                      >
                        Chọn tất cả
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedRelIds(new Set())}
                        className="text-[11px] text-[#8D6E63] underline cursor-pointer"
                      >
                        Bỏ chọn
                      </button>
                    </div>
                  )}
                </div>
                <div className="max-h-36 overflow-y-auto space-y-1">
                  {data.relationships.length === 0 ? (
                    <p className="text-[11px] text-[#8D6E63]">Không có quan hệ xưng hô nào.</p>
                  ) : (
                    data.relationships.map(({ relationship }) => {
                      const checked = selectedRelIds.has(relationship.id);
                      return (
                        <div
                          key={relationship.id}
                          onClick={() => toggleSet(setSelectedRelIds, relationship.id)}
                          className="flex items-center gap-2 text-[11px] py-1 px-2 rounded hover:bg-[#FAF6F0] cursor-pointer"
                        >
                          {checked ? (
                            <CheckSquare size={14} className="text-[#E65100] shrink-0" />
                          ) : (
                            <Square size={14} className="text-[#A1887F] shrink-0" />
                          )}
                          <span className="font-bold">
                            {relationship.charA} ⇄ {relationship.charB}
                          </span>
                          <span className="text-[#6D4C41]">
                            ({relationship.callAtoB} / {relationship.callBtoA})
                          </span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>

              {/* Shortcuts */}
              <div className="bg-white border border-[#E0D6CC] rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-[#3E2723]">
                    Gõ tắt ({data.shortcuts.length})
                  </span>
                  {data.shortcuts.length > 0 && (
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setSelectedShortcutIds(new Set(data.shortcuts.map((s) => s.shortcut.id)))}
                        className="text-[11px] font-semibold text-[#5D4037] underline cursor-pointer"
                      >
                        Chọn tất cả
                      </button>
                      <button
                        type="button"
                        onClick={() => setSelectedShortcutIds(new Set())}
                        className="text-[11px] text-[#8D6E63] underline cursor-pointer"
                      >
                        Bỏ chọn
                      </button>
                    </div>
                  )}
                </div>
                <div className="max-h-36 overflow-y-auto space-y-1">
                  {data.shortcuts.length === 0 ? (
                    <p className="text-[11px] text-[#8D6E63]">Không có gõ tắt nào.</p>
                  ) : (
                    data.shortcuts.map(({ shortcut }) => {
                      const checked = selectedShortcutIds.has(shortcut.id);
                      return (
                        <div
                          key={shortcut.id}
                          onClick={() => toggleSet(setSelectedShortcutIds, shortcut.id)}
                          className="flex items-center gap-2 text-[11px] py-1 px-2 rounded hover:bg-[#FAF6F0] cursor-pointer"
                        >
                          {checked ? (
                            <CheckSquare size={14} className="text-[#E65100] shrink-0" />
                          ) : (
                            <Square size={14} className="text-[#A1887F] shrink-0" />
                          )}
                          <span className="font-mono font-bold">{shortcut.shortcut}</span>
                          <span>→ {shortcut.expansion}</span>
                        </div>
                      );
                    })
                  )}
                </div>
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="bg-[#EFE5D9] px-5 py-3 border-t border-[#D7CCC8] flex items-center justify-between gap-3 shrink-0">
          <span className="text-xs text-[#5D4037]">
            Đã chọn: <strong className="text-[#3E2723]">{totalSelectedCount}</strong> mục
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-1.5 rounded-lg border border-[#D7CCC8] bg-white hover:bg-[#FAF6F0] text-xs font-semibold text-[#5D4037] cursor-pointer"
            >
              Đóng
            </button>
            <button
              type="button"
              disabled={totalSelectedCount === 0 || isApplying}
              onClick={handleConfirmRestore}
              className="flex items-center gap-1.5 px-4 py-1.5 rounded-lg bg-[#5D4037] hover:bg-[#4E342E] disabled:opacity-45 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer"
            >
              <RotateCcw size={13} />
              <span>{isApplying ? 'Đang khôi phục...' : 'Khôi phục các mục đã chọn'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body
  );
};
