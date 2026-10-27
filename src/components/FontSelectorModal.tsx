import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Check } from 'lucide-react';
import { AVAILABLE_FONTS, FontOption, getStoredFontId, applyFont, getStoredFontSize, applyFontSize } from '../services/fontService';

interface FontSelectorModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const FontSelectorModal: React.FC<FontSelectorModalProps> = ({ isOpen, onClose }) => {
  const [selectedId, setSelectedId] = useState<string>(getStoredFontId());
  const [selectedSize, setSelectedSize] = useState<number>(getStoredFontSize());

  useEffect(() => {
    if (isOpen) {
      setSelectedId(getStoredFontId());
      setSelectedSize(getStoredFontSize());
    }
  }, [isOpen]);

  useEffect(() => {
    const handleSizeEvent = (e: any) => {
      const size = e.detail?.fontSize;
      if (typeof size === 'number' && size !== selectedSize) {
        setSelectedSize(size);
      }
    };
    window.addEventListener('app_font_size_changed', handleSizeEvent);
    return () => window.removeEventListener('app_font_size_changed', handleSizeEvent);
  }, [selectedSize]);

  if (!isOpen) return null;

  const handleSelectFont = (font: FontOption) => {
    setSelectedId(font.id);
    applyFont(font.id);
  };

  const handleUpdateSize = (newSize: number) => {
    const clamped = Math.max(8, Math.min(72, newSize));
    setSelectedSize(clamped);
    applyFontSize(clamped);
  };

  return createPortal(
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/50 animate-in fade-in duration-150">
      <div 
        className="fixed inset-0" 
        onClick={onClose} 
      />

      <div className="relative w-full max-w-md rounded-xl shadow-2xl flex flex-col max-h-[85vh] z-10 animate-in zoom-in-95 duration-200 overflow-hidden bg-[#FFFDF7] border border-[#D7CCC8]">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b shrink-0 bg-[#EFE5D9] text-[#3E2723] border-[#D7CCC8]">
          <h2 className="text-sm sm:text-base font-bold text-[#3E2723]">
            Phông chữ & Cỡ chữ
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-md transition-colors text-[#5D4037] hover:text-[#3E2723] hover:bg-[#D7CCC8]/50"
            title="Đóng (Esc)"
          >
            <X size={18} />
          </button>
        </div>

        {/* Khu vực điều chỉnh cỡ chữ (Lưu vĩnh viễn) */}
        <div className="px-4 py-2.5 border-b shrink-0 flex flex-wrap items-center justify-between gap-2 bg-[#EFEBE9]/60 border-[#D7CCC8]">
          <div className="flex items-center gap-1.5">
            <span className="text-xs font-bold text-[#5D4037]">
              Cỡ chữ:
            </span>
            <div className="flex items-center gap-1">
              <button
                type="button"
                onClick={() => handleUpdateSize(selectedSize - 1)}
                className="w-7 h-7 flex items-center justify-center rounded border font-bold text-sm cursor-pointer transition-colors bg-white border-[#D7CCC8] hover:bg-[#D7CCC8]/40 text-[#3E2723]"
                title="Giảm 1px"
              >
                -
              </button>
              <div className="flex items-center">
                <input
                  type="number"
                  min={8}
                  max={72}
                  value={selectedSize}
                  onChange={(e) => {
                    const val = parseInt(e.target.value, 10);
                    if (!isNaN(val)) {
                      handleUpdateSize(val);
                    }
                  }}
                  className="w-12 h-7 text-center text-xs font-bold border rounded outline-none bg-white border-[#D7CCC8] text-[#3E2723] focus:border-[#8D6E63]"
                />
                <span className="text-[11px] ml-1 font-medium text-[#8D6E63]">px</span>
              </div>
              <button
                type="button"
                onClick={() => handleUpdateSize(selectedSize + 1)}
                className="w-7 h-7 flex items-center justify-center rounded border font-bold text-sm cursor-pointer transition-colors bg-white border-[#D7CCC8] hover:bg-[#D7CCC8]/40 text-[#3E2723]"
                title="Tăng 1px"
              >
                +
              </button>
            </div>
          </div>

          {/* Các nút cỡ chữ nhanh */}
          <div className="flex items-center gap-1">
            {[11, 12, 13, 14, 16, 18].map((size) => (
              <button
                key={size}
                type="button"
                onClick={() => handleUpdateSize(size)}
                className={`px-2 py-1 text-[11px] rounded font-semibold transition-all cursor-pointer ${
                  selectedSize === size
                    ? 'bg-[#5D4037] text-white shadow-xs'
                    : 'bg-white border border-[#D7CCC8] text-[#5D4037] hover:bg-[#D7CCC8]/30'
                }`}
              >
                {size}
              </button>
            ))}
          </div>
        </div>

        {/* Danh sách phông chữ */}
        <div className="flex-1 overflow-y-auto p-3 space-y-2 scrollbar-thin scrollbar-thumb-[#DADCE0] scrollbar-track-transparent">
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
                    className="text-base font-bold truncate text-[#3E2723]"
                    style={{ fontFamily: font.family }}
                  >
                    {font.name}
                  </div>
                  <div 
                    className="text-xs truncate mt-0.5 text-[#8D6E63]"
                    style={{ fontFamily: font.family }}
                  >
                    Đường xa mới biết sức ngựa, ngày dài mới thấu lòng người.
                  </div>
                </div>

                {isSelected ? (
                  <div className="w-5 h-5 rounded-full flex items-center justify-center shrink-0 bg-emerald-100 border border-emerald-400 text-emerald-800">
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
        <div className="px-4 py-2.5 border-t flex justify-end shrink-0 bg-[#EFEBE9] border-[#D7CCC8]">
          <button
            onClick={onClose}
            className="px-4 py-1.5 rounded-lg text-xs font-bold shadow-xs transition-colors cursor-pointer bg-[#5D4037] text-white hover:bg-[#3E2723]"
          >
            Xong
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
};
