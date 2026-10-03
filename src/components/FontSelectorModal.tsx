import React, { useState, useEffect } from 'react';
import { X, Check } from 'lucide-react';
import { AVAILABLE_FONTS, FontOption, getStoredFontId, applyFont } from '../services/fontService';

interface FontSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FontSelectorModal: React.FC<FontSelectorModalProps> = ({ isOpen, onClose }) => {
  const [selectedId, setSelectedId] = useState<string>(getStoredFontId());

  useEffect(() => {
    if (isOpen) {
      setSelectedId(getStoredFontId());
    }
  }, [isOpen]);

  if (!isOpen) return null;

  const handleSelectFont = (font: FontOption) => {
    setSelectedId(font.id);
    applyFont(font.id);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 backdrop-blur-xs animate-in fade-in duration-150">
      <div 
        className="fixed inset-0" 
        onClick={onClose} 
      />

      <div className="relative w-full max-w-md bg-[#FFFDF7] rounded-xl shadow-2xl border border-[#D7CCC8] flex flex-col max-h-[85vh] z-10 animate-in zoom-in-95 duration-200 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 bg-[#4E342E] text-white border-b border-[#3E2723] shrink-0">
          <h2 className="text-sm sm:text-base font-bold text-[#FFECB3]">
            Phông chữ
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md text-[#D7CCC8] hover:text-white hover:bg-[#5D4037] transition-colors"
            title="Đóng (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        {/* Danh sách phông chữ */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin scrollbar-thumb-[#D7CCC8] scrollbar-track-transparent">
          {AVAILABLE_FONTS.map((font) => {
            const isSelected = selectedId === font.id;
            return (
              <div
                key={font.id}
                onClick={() => handleSelectFont(font)}
                className={`px-3.5 py-2.5 rounded-lg border transition-all cursor-pointer select-none flex items-center justify-between gap-3 ${
                  isSelected
                    ? 'bg-[#FFF9C4]/50 border-amber-500 shadow-xs ring-1 ring-amber-400'
                    : 'bg-white border-[#E0D7D0] hover:border-[#BCAAA4] hover:bg-[#FFFDF7]'
                }`}
              >
                <div className="min-w-0 flex-1">
                  <div 
                    className="text-base font-bold text-[#3E2723] truncate"
                    style={{ fontFamily: font.family }}
                  >
                    {font.name}
                  </div>
                  <div 
                    className="text-xs text-[#8D6E63] truncate mt-0.5"
                    style={{ fontFamily: font.family }}
                  >
                    Đường xa mới biết sức ngựa, ngày dài mới thấu lòng người.
                  </div>
                </div>

                {isSelected ? (
                  <div className="w-5 h-5 rounded-full bg-emerald-100 border border-emerald-400 text-emerald-800 flex items-center justify-center shrink-0">
                    <Check size={13} className="stroke-[2.5]" />
                  </div>
                ) : (
                  <div className="w-5 h-5 rounded-full border border-dashed border-[#D7CCC8] shrink-0" />
                )}
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="px-3 py-2 bg-[#EFEBE9] border-t border-[#D7CCC8] flex justify-end shrink-0">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg bg-[#4E342E] text-[#FFECB3] hover:text-white hover:bg-[#3E2723] text-xs font-bold shadow-xs transition-colors"
          >
            Xong
          </button>
        </div>
      </div>
    </div>
  );
};
