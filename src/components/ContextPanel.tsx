
import React from 'react';
import { FileText, Users, NotebookPen } from 'lucide-react';

interface ContextPanelProps {
  contextRules: string;
  onUpdateContextRules: (rules: string) => void;
  notes: string;
  onUpdateNotes: (notes: string) => void;
}

export const ContextPanel: React.FC<ContextPanelProps> = ({
  contextRules,
  onUpdateContextRules,
  notes,
  onUpdateNotes
}) => {
  return (
    <div className="flex flex-col h-full bg-white border-l border-stone-200 w-80 shrink-0">
      {/* Context / Rules Section */}
      <div className="flex flex-col h-1/2 border-b border-stone-200">
        <div className="p-4 border-b border-stone-100 bg-stone-50 flex items-center gap-2 text-stone-800 font-bold">
           <Users size={18} className="text-indigo-600" />
           <span>Quy Tắc & Nhân Vật</span>
        </div>
        <div className="flex-1 p-0 relative bg-[#f8f7f5]">
           <textarea
              className="w-full h-full resize-none p-3 text-sm bg-transparent outline-none focus:bg-white transition-colors text-stone-700 leading-relaxed"
              placeholder={`Ví dụ:
- Nam chính: Tạ Liên (Hắn/Y)
- Nữ chính: Không có
- Bối cảnh: Tiên hiệp
- Sư tôn xưng Ta - Ngươi`}
              value={contextRules}
              onChange={(e) => onUpdateContextRules(e.target.value)}
              spellCheck={false}
           />
           <div className="absolute bottom-2 right-2 text-[10px] text-stone-400 pointer-events-none bg-stone-100/80 px-1 rounded">
              AI sẽ dùng quy tắc này khi dịch
           </div>
        </div>
      </div>

      {/* Notes Section */}
      <div className="flex flex-col h-1/2">
        <div className="p-4 border-b border-stone-100 bg-stone-50 flex items-center gap-2 text-stone-800 font-bold">
           <NotebookPen size={18} className="text-amber-600" />
           <span>Ghi Chú Nháp</span>
        </div>
        <div className="flex-1 p-0 bg-[#fffbeb]">
           <textarea
              className="w-full h-full resize-none p-3 text-sm bg-transparent outline-none text-stone-800 font-medium leading-relaxed"
              placeholder="Nháp nhanh ý tưởng, từ vựng chưa tra cứu..."
              value={notes}
              onChange={(e) => onUpdateNotes(e.target.value)}
              spellCheck={false}
           />
        </div>
      </div>
    </div>
  );
};
