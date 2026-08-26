import * as XLSX from 'xlsx';
import { CustomTerm, Character, Relationship, TextShortcut } from '../types';

export const exportToExcel = (
  terms: CustomTerm[],
  characters: Character[],
  relationships: Relationship[],
  novelName: string = "Truyen",
  shortcuts: TextShortcut[] = []
) => {
  // Create a new workbook
  const wb = XLSX.utils.book_new();

  // 1. Vocabulary Sheet (Từ vựng)
  const vocabData = terms.map((t, index) => ({
    "STT": index + 1,
    "Từ gốc (Trung)": t.term,
    "Nghĩa dịch (Việt)": t.meaning,
    "Phân loại": t.category || "Chưa phân loại"
  }));
  const wsVocab = XLSX.utils.json_to_sheet(vocabData);
  XLSX.utils.book_append_sheet(wb, wsVocab, "Từ vựng");

  // 2. Characters Sheet (Nhân vật)
  const charData = characters.map((c, index) => ({
    "STT": index + 1,
    "Tên gốc (Trung)": c.chineseName,
    "Tên dịch (Việt)": c.vietName,
    "Xưng hô / Đại từ": c.pronouns,
    "Mô tả": c.description
  }));
  const wsChar = XLSX.utils.json_to_sheet(charData);
  XLSX.utils.book_append_sheet(wb, wsChar, "Nhân vật");

  // 3. Relationships Sheet (Quan hệ)
  const relData = relationships.map((r, index) => ({
    "STT": index + 1,
    "Nhân vật A": r.charA,
    "Nhân vật B": r.charB,
    "A gọi B là": r.callAtoB,
    "B gọi A là": r.callBtoA,
    "Ghi chú": r.note
  }));
  const wsRel = XLSX.utils.json_to_sheet(relData);
  XLSX.utils.book_append_sheet(wb, wsRel, "Quan hệ");

  // 4. Shortcuts Sheet (Gõ tắt)
  const shortcutData = shortcuts.length > 0 
    ? shortcuts.map((s, index) => ({
        "STT": index + 1,
        "Từ viết tắt": s.shortcut,
        "Cụm từ thay thế": s.expansion,
        "Trạng thái": s.enabled ? "Bật" : "Tắt"
      }))
    : [{ "STT": 1, "Từ viết tắt": "", "Cụm từ thay thế": "", "Trạng thái": "Bật" }];
  const wsShortcut = XLSX.utils.json_to_sheet(shortcutData);
  XLSX.utils.book_append_sheet(wb, wsShortcut, "Gõ tắt");

  // Format filename safely
  const cleanNovelName = novelName.replace(/[^a-zA-Z0-9àáảãạăắằẳẵặâấầẩẫậèéẻẽẹêếềểễệìíỉĩịòóỏõọôốồổỗộơớờởỡợùúủũụưứừửữựỳýỷỹỵđ_-\s]/g, "") || "DuLieu";
  const fileName = `${cleanNovelName}.xlsx`;

  // Write and download the file
  XLSX.writeFile(wb, fileName);
};

