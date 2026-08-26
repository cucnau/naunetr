
export interface VocabItem {
  term: string;
  pinyin: string;
  hanViet: string;
  meaning: string;
  explanation: string;
}

export interface TranslationSegment {
  source: string; // Text gốc tiếng Trung của đoạn này
  natural: string;
  quick: string;
  deepl: string;
}

export interface TranslationResponse {
  naturalTranslation: string; // Full text merged
  quickTrans: string;         // Full text merged
  sinoVietnamese: string;
  deeplTranslation: string;     // Full text merged
  segments: TranslationSegment[]; // Array for Table View
  vocabulary: VocabItem[];
}

export interface Novel {
  id: string;
  name: string;
}

export interface CustomTerm {
  id: string;
  novelId: string;
  term: string;
  meaning: string;
  category?: string;
}

export interface Character {
  id: string;
  novelId: string;
  chineseName: string; // Trung
  vietName: string;    // Tên Việt
  pronouns: string;    // ĐTNX (Đại từ nhân xưng - Ngôi 3)
  description: string; // Chi tiết
}

export interface Relationship {
  id: string;
  novelId: string;
  charA: string;    // Nhân vật A
  charB: string;    // Nhân vật B
  callAtoB: string; // A gọi B
  callBtoA: string; // B gọi A
  note: string;     // Ghi chú
}

export interface TextShortcut {
  id: string;
  novelId?: string;      // ID của truyện (tách riêng cho từng truyện)
  shortcut: string;      // Từ viết tắt (ví dụ: xh, dc, ko, ng)
  expansion: string;     // Từ thay thế đầy đủ (ví dụ: xe hơi, được, không, người)
  enabled: boolean;      // Trạng thái kích hoạt
  category?: string;     // Phân loại tùy chọn
}

export interface HistoryItem {
  id: string;
  timestamp: number;
  sourceText: string;
  result: TranslationResponse;
  modelId?: string;
  completedSegments?: number[];
}

export interface Chapter {
  id: string;
  novelId?: string;
  name: string;
  timestamp: number;
  inputText: string;
  deeplText?: string;
  preEditedText?: string;
  result: TranslationResponse;
  completedSegments?: number[];
}

export enum AppStatus {
  IDLE = 'IDLE',
  LOADING = 'LOADING',
  SUCCESS = 'SUCCESS',
  ERROR = 'ERROR'
}

export interface TranslationSession {
  id: string;
  name: string;
  inputText: string;
  deeplText: string;
  status: AppStatus;
  result: TranslationResponse | null;
  error: string | null;
  modelId: string; // Model AI được chọn cho session này
  currentHistoryId?: string; // Liên kết với bản ghi lịch sử
  currentChapterId?: string; // Liên kết với chương đang biên tập
  
  // Data
  customTerms: CustomTerm[];
  sheetUrl: string;
  currentNovelId?: string;
  
  // World Info (Table Data)
  characters: Character[];
  relationships: Relationship[];
  
  notes: string; // Scratchpad
  completedSegments: number[]; // Lưu danh sách index các đoạn đã làm xong
  preEditedText?: string; // Bản edit sẵn cho chế độ Beta
}
