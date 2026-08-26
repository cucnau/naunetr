import React from 'react';
import { VocabItem } from '../types';
import { BookOpen, Copy } from 'lucide-react';

interface VocabCardProps {
  item: VocabItem;
}

export const VocabCard: React.FC<VocabCardProps> = ({ item }) => {
  const copyTerm = () => {
    navigator.clipboard.writeText(item.term);
  };

  return (
    <div className="bg-[#FFFDF7] border border-[#D7CCC8] rounded-xl p-0 shadow-sm hover:shadow-md transition-shadow flex flex-col h-full group">
      {/* Header with Term */}
      <div className="p-4 bg-[#EFEBE9]/50 border-b border-[#EFEBE9] rounded-t-xl flex justify-between items-start">
         <div>
            <div className="flex items-end gap-2 mb-1">
                <h3 className="text-2xl font-serif-sc text-[#3E2723] font-bold leading-none selection:bg-[#D7CCC8]">{item.term}</h3>
                <span className="text-xs font-mono text-[#8D6E63]">{item.pinyin}</span>
            </div>
            <div className="text-sm font-bold text-[#5D4037] uppercase tracking-wide opacity-90">{item.hanViet}</div>
         </div>
         <button 
            onClick={copyTerm}
            className="text-[#D7CCC8] hover:text-[#5D4037] p-1.5 rounded-full hover:bg-[#D7CCC8]/30 transition-colors opacity-0 group-hover:opacity-100"
            title="Sao chép từ"
         >
            <Copy size={16} />
         </button>
      </div>

      {/* Content */}
      <div className="p-4 flex-1 flex flex-col gap-3">
         {/* Meaning */}
         <div>
            <div className="flex items-center gap-1.5 mb-1">
                <span className="w-1.5 h-1.5 bg-[#FFB300] rounded-full"></span>
                <span className="text-[10px] font-bold text-[#8D6E63] uppercase tracking-wider">Nghĩa</span>
            </div>
            <div className="text-[#3E2723] font-medium text-[15px] pl-3 border-l-2 border-[#FFE082]">
                {item.meaning}
            </div>
         </div>

         {/* Explanation - Deeper Dive */}
         <div className="flex-1">
             <div className="flex items-center gap-1.5 mb-1">
                <span className="w-1.5 h-1.5 bg-[#8D6E63] rounded-full"></span>
                <span className="text-[10px] font-bold text-[#8D6E63] uppercase tracking-wider">Giải thích chi tiết</span>
            </div>
            <div className="text-sm text-[#5D4037] leading-relaxed whitespace-pre-wrap pl-3 border-l-2 border-[#D7CCC8] bg-[#F5F5F5]/30 p-2 rounded-r-lg">
                {item.explanation}
            </div>
         </div>
      </div>
    </div>
  );
};
