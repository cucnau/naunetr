import { CustomTerm, VietphraseFileItem, VietphraseCategory } from "../types";
import { db } from "./db";

export function detectVietphraseCategory(filename: string): VietphraseCategory {
  const lower = filename.toLowerCase();

  // 1. Hậu từ / Danh từ hậu từ / Phụ từ / Hậu tố
  if (
    lower.includes('hậu từ') || lower.includes('hautu') || lower.includes('hau_tu') ||
    lower.includes('suffix') || lower.includes('hậu tố') || lower.includes('hauto') ||
    lower.includes('phụ từ') || lower.includes('phutu')
  ) {
    return 'suffixes';
  }

  // 2. Danh từ (Nouns) - nếu không chứa hậu từ
  if (
    lower.includes('danh từ') || lower.includes('danhtu') || lower.includes('danh_tu') ||
    lower.includes('noun')
  ) {
    return 'nouns';
  }

  // 3. Names (Tên riêng, nhân vật, địa danh)
  if (lower.includes('name') || lower.includes('tên') || lower.includes('ten') || lower.includes('nhanvat') || lower.includes('nhân vật')) {
    return 'names';
  }

  // 4. Pronouns (Đại từ nhân xưng, xưng hô)
  if (lower.includes('pronoun') || lower.includes('đại từ') || lower.includes('daitu') || lower.includes('xưng') || lower.includes('xungho')) {
    return 'pronouns';
  }

  // 5. Lạc Việt / Hán Việt
  if (lower.includes('lacviet') || lower.includes('lạc việt') || lower.includes('lac_viet')) {
    return 'lacviet';
  }

  // 6. Vietphrase chung
  if (lower.includes('vietphrase') || lower.includes('phrase') || lower.includes('vp')) {
    return 'vietphrase';
  }

  return 'other';
}

// Hàm lọc sạch ký tự xuống dòng / tab rác trong file từ điển thông thường
export function cleanDictionaryValue(val: string): string {
  if (!val) return "";
  return val.split(/[\r\n\t]|\\n|\\t/)[0].trim();
}

// Hàm bóc tách âm Hán Việt / từ ngắn gọn sạch sẽ từ định nghĩa chi tiết của Lạc Việt
export function extractCleanLacVietWord(raw: string): string {
  if (!raw) return "";

  // 1. Nếu có "Hán Việt: <từ>", ưu tiên trích xuất âm Hán Việt chuẩn xác
  const hanVietMatch = raw.match(/Hán\s*Việt\s*:\s*([^\\\r\n\t;/,+\[\]]+)/i);
  if (hanVietMatch && hanVietMatch[1] && hanVietMatch[1].trim()) {
    const hv = hanVietMatch[1].trim();
    return hv.split(/[,;\s]+/)[0].toLowerCase();
  }

  // 2. Tách theo dấu gạch chéo / nếu có nhiều nghĩa
  let firstPart = raw.split('/')[0].trim();

  // 3. Cắt bỏ hoàn toàn các phần chú thích từ điển từ ký tự +, [, (, \, \n, \t, số thứ tự
  firstPart = firstPart.split(/\+|\[|\{|\(|\n|\r|\t|\\n|\\t/)[0].trim();

  // 4. Cắt theo dấu phẩy hoặc chấm phẩy
  firstPart = firstPart.split(/[,;]/)[0].trim();

  // 5. Nếu từ vẫn quá dài (> 15 ký tự) thì chỉ lấy 1 từ đầu tiên
  if (firstPart.length > 15) {
    const words = firstPart.split(/\s+/);
    if (words.length > 0) return words[0];
  }

  return firstPart;
}

export const VIETPHRASE_CATEGORY_CONFIG: Record<VietphraseCategory, { label: string; priorityNum: number; badgeClass: string; desc: string }> = {
  names: { label: 'Names (Tên riêng)', priorityNum: 1, badgeClass: 'bg-amber-100 text-amber-900 border-amber-300', desc: 'Tên người, địa danh (Ưu tiên cao nhất)' },
  vietphrase: { label: 'Vietphrase (Chung)', priorityNum: 2, badgeClass: 'bg-emerald-100 text-emerald-900 border-emerald-300', desc: 'Từ vựng chung (Cụm dài đến ngắn)' },
  nouns: { label: 'Danh từ (Nouns)', priorityNum: 3, badgeClass: 'bg-indigo-100 text-indigo-900 border-indigo-300', desc: 'Danh từ, chức vị, thuật ngữ' },
  suffixes: { label: 'Hậu từ (Suffixes)', priorityNum: 4, badgeClass: 'bg-rose-100 text-rose-900 border-rose-300', desc: 'Hậu từ, hậu tố danh từ (ca, tỷ, đệ, muội, môn, phái, thành, sơn...)' },
  pronouns: { label: 'Pronouns (Xưng hô)', priorityNum: 5, badgeClass: 'bg-blue-100 text-blue-900 border-blue-300', desc: 'Đại từ nhân xưng' },
  lacviet: { label: 'Lạc Việt (Tra cứu)', priorityNum: 6, badgeClass: 'bg-purple-100 text-purple-900 border-purple-300', desc: 'Từ điển tra nghĩa chi tiết & âm Hán Việt' },
  other: { label: 'Khác (Bổ trợ)', priorityNum: 7, badgeClass: 'bg-stone-100 text-stone-800 border-stone-300', desc: 'Quy tắc / bổ trợ' }
};

class VietphraseEngine {
  private files: VietphraseFileItem[] = [];
  
  // Layered Maps for Strict Priority Execution
  private namesMap: Map<string, string> = new Map();
  private vietphraseMap: Map<string, string> = new Map();
  private nounsMap: Map<string, string> = new Map();
  private suffixesMap: Map<string, string> = new Map();
  private pronounsMap: Map<string, string> = new Map();
  private lacvietMap: Map<string, string> = new Map();
  private lacvietRawLookupMap: Map<string, string> = new Map(); // Lưu nguyên văn giải nghĩa để tra cứu
  private otherMap: Map<string, string> = new Map();

  private maxNamesLength: number = 0;
  private maxVietphraseLength: number = 0;
  private maxNounsLength: number = 0;
  private maxSuffixesLength: number = 0;
  private maxPronounsLength: number = 0;
  private maxLacvietLength: number = 0;
  private maxOtherLength: number = 0;

  private isLoaded: boolean = false;
  private listeners: Set<() => void> = new Set();
  private globalCustomMap: Map<string, string> = new Map();

  constructor() {}

  // Đăng ký nhận sự kiện thay đổi dữ liệu từ điển
  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  private notify() {
    this.listeners.forEach(listener => {
      try {
        listener();
      } catch (e) {
        console.error("Error invoking Vietphrase listener", e);
      }
    });
  }

  setGlobalCustomMap(map: Map<string, string>) {
    this.globalCustomMap = new Map(map);
    this.notify();
  }

  getGlobalCustomMap(): Map<string, string> {
    return this.globalCustomMap;
  }

  // Khởi tạo: Load danh sách file từ DB
  async init() {
    if (this.isLoaded) return;
    try {
      let savedFiles = await db.getVietphraseFiles();
      
      // Khôi phục từ dữ liệu đơn lẻ cũ nếu chưa có danh sách files mới
      if (!savedFiles || savedFiles.length === 0) {
        const legacyContent = await db.getVietphrase();
        if (legacyContent && typeof legacyContent === 'string' && legacyContent.trim()) {
          const lines = legacyContent.split(/\r?\n/).filter(l => l.trim() && !l.startsWith('#') && l.includes('='));
          savedFiles = [{
            id: 'legacy_' + Date.now(),
            name: 'Vietphrase.txt',
            size: new Blob([legacyContent]).size,
            wordCount: lines.length,
            content: legacyContent,
            enabled: true,
            uploadedAt: Date.now(),
            fileType: 'vietphrase'
          }];
          await db.saveVietphraseFiles(savedFiles);
        }
      }

      this.files = (savedFiles || []).map(f => ({
        ...f,
        fileType: f.fileType || detectVietphraseCategory(f.name)
      }));

      this.rebuildDictionary();
    } catch (e) {
      console.error("Vietphrase init error", e);
    } finally {
      this.isLoaded = true;
      this.notify();
    }
  }

  // Lấy danh sách toàn bộ các file Vietphrase hiện có
  getFiles(): VietphraseFileItem[] {
    return [...this.files];
  }

  // Lấy số lượng từ hiện tại trong từ điển đang hoạt động
  getSize(): number {
    return (
      this.namesMap.size +
      this.vietphraseMap.size +
      this.nounsMap.size +
      this.suffixesMap.size +
      this.pronounsMap.size +
      this.lacvietMap.size +
      this.otherMap.size
    );
  }

  getStats() {
    return {
      names: this.namesMap.size,
      vietphrase: this.vietphraseMap.size,
      nouns: this.nounsMap.size,
      suffixes: this.suffixesMap.size,
      pronouns: this.pronounsMap.size,
      lacviet: this.lacvietMap.size,
      lacvietLookup: this.lacvietRawLookupMap.size,
      other: this.otherMap.size,
      total: this.getSize()
    };
  }

  // Lấy giải nghĩa Lạc Việt chi tiết để tra cứu khi người dùng bấm vào từ hoặc bôi đen
  getLacVietDetails(term: string): string | null {
    if (!term) return null;
    const clean = term.trim();
    if (!clean) return null;

    // 1. Tìm chính xác cả cụm từ
    if (this.lacvietRawLookupMap.has(clean)) {
      return this.lacvietRawLookupMap.get(clean) || null;
    }

    // 2. Nếu là cụm từ gồm nhiều ký tự tiếng Trung, tra cứu chi tiết từng ký tự
    const chars = Array.from(clean).filter(c => /[\u4e00-\u9fa5]/.test(c));
    if (chars.length > 1) {
      const charResults: string[] = [];
      for (const ch of chars) {
        if (this.lacvietRawLookupMap.has(ch)) {
          const def = this.lacvietRawLookupMap.get(ch);
          charResults.push(`【${ch}】:\n${def}`);
        }
      }
      if (charResults.length > 0) {
        return charResults.join('\n\n');
      }
    }

    return null;
  }

  // Kiểm tra xem đã có từ điển tra cứu Lạc Việt được nạp chưa
  hasLacViet(): boolean {
    return this.lacvietRawLookupMap.size > 0;
  }

  // Tra cứu toàn diện một từ bất kỳ qua tất cả các tầng từ điển
  lookupComprehensive(term: string, customTerms?: CustomTerm[] | Map<string, string>): {
    term: string;
    vietphrase: string;
    lacvietDetails: string | null;
    layers: string[];
  } {
    const clean = (term || '').trim();
    const vp = this.translate(clean, customTerms);
    const lacviet = this.getLacVietDetails(clean);

    const layers: string[] = [];
    if (this.globalCustomMap.has(clean)) layers.push('Từ riêng truyện');
    if (this.namesMap.has(clean)) layers.push('Names (Tên riêng)');
    if (this.vietphraseMap.has(clean)) layers.push('Vietphrase (Chung)');
    if (this.nounsMap.has(clean)) layers.push('Danh từ');
    if (this.suffixesMap.has(clean)) layers.push('Hậu từ');
    if (this.pronounsMap.has(clean)) layers.push('Đại từ');
    if (this.lacvietMap.has(clean) || this.lacvietRawLookupMap.has(clean)) layers.push('Lạc Việt');

    return {
      term: clean,
      vietphrase: vp,
      lacvietDetails: lacviet,
      layers
    };
  }

  // Lấy số file đang kích hoạt
  getActiveFilesCount(): number {
    return this.files.filter(f => f.enabled).length;
  }

  // Phân tích số từ hợp lệ trong một nội dung file
  private countWordsInContent(content: string): number {
    let count = 0;
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;
      const eqIdx = trimmed.indexOf('=');
      if (eqIdx > 0) {
        const key = trimmed.substring(0, eqIdx).trim();
        // Bỏ qua các dòng quy tắc đặc biệt của LuatNhan
        if (!key.includes('{') && !key.includes('}') && !key.includes('[') && !key.includes(']')) {
          count++;
        }
      }
    }
    return count;
  }

  // Tái tạo lại từ điển gộp từ tất cả các file đang kích hoạt theo Phân Tầng Ưu Tiên
  private rebuildDictionary() {
    this.namesMap.clear();
    this.vietphraseMap.clear();
    this.nounsMap.clear();
    this.suffixesMap.clear();
    this.pronounsMap.clear();
    this.lacvietMap.clear();
    this.lacvietRawLookupMap.clear();
    this.otherMap.clear();

    this.maxNamesLength = 0;
    this.maxVietphraseLength = 0;
    this.maxNounsLength = 0;
    this.maxSuffixesLength = 0;
    this.maxPronounsLength = 0;
    this.maxLacvietLength = 0;
    this.maxOtherLength = 0;

    for (const file of this.files) {
      if (!file.enabled) continue;

      const category: VietphraseCategory = file.fileType || detectVietphraseCategory(file.name);
      let targetMap: Map<string, string>;
      let setTargetMax: (len: number) => void;

      switch (category) {
        case 'names':
          targetMap = this.namesMap;
          setTargetMax = (len) => { this.maxNamesLength = Math.max(this.maxNamesLength, len); };
          break;
        case 'vietphrase':
          targetMap = this.vietphraseMap;
          setTargetMax = (len) => { this.maxVietphraseLength = Math.max(this.maxVietphraseLength, len); };
          break;
        case 'nouns':
          targetMap = this.nounsMap;
          setTargetMax = (len) => { this.maxNounsLength = Math.max(this.maxNounsLength, len); };
          break;
        case 'suffixes':
          targetMap = this.suffixesMap;
          setTargetMax = (len) => { this.maxSuffixesLength = Math.max(this.maxSuffixesLength, len); };
          break;
        case 'pronouns':
          targetMap = this.pronounsMap;
          setTargetMax = (len) => { this.maxPronounsLength = Math.max(this.maxPronounsLength, len); };
          break;
        case 'lacviet':
          targetMap = this.lacvietMap;
          setTargetMax = (len) => { this.maxLacvietLength = Math.max(this.maxLacvietLength, len); };
          break;
        default:
          targetMap = this.otherMap;
          setTargetMax = (len) => { this.maxOtherLength = Math.max(this.maxOtherLength, len); };
          break;
      }

      const lines = file.content.split(/\r?\n/);
      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#') || trimmed.startsWith('//')) continue;

        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.substring(0, eqIdx).trim();
          const value = trimmed.substring(eqIdx + 1).trim();

          // Lọc bỏ ký hiệu quy tắc ngữ pháp của LuatNhan (như [Họ], {0}, v.v.)
          if (key.includes('{') || key.includes('}') || key.includes('[') || key.includes(']')) {
            continue;
          }

          if (key && value) {
            // XỬ LÝ ĐẶC BIỆT CHO LẠC VIỆT:
            // File Lạc Việt chứa giải nghĩa từ điển chi tiết (pinyin, âm Hán Việt, định nghĩa nhiều dòng)
            // Ta lưu bản gốc vào lacvietRawLookupMap để phục vụ tra cứu popup
            // Và lọc lấy duy nhất âm Hán Việt / từ sạch vào lacvietMap để nếu fallback dịch câu thì KHÔNG bị phá nát câu văn!
            if (category === 'lacviet') {
              if (!this.lacvietRawLookupMap.has(key)) {
                this.lacvietRawLookupMap.set(key, value);
              }
              const cleanWord = extractCleanLacVietWord(value);
              if (cleanWord && !this.lacvietMap.has(key)) {
                this.lacvietMap.set(key, cleanWord);
                setTargetMax(key.length);
              }
              continue;
            }

            // Các tầng thông thường: làm sạch các ký tự xuống dòng / tab ngẫu nhiên
            const cleanVal = cleanDictionaryValue(value);
            if (cleanVal) {
              if (!targetMap.has(key)) {
                targetMap.set(key, cleanVal);
                setTargetMax(key.length);
              }
            }
          }
        }
      }
    }

    console.log(
      `[VietphraseEngine] Đã nạp ${this.getSize()} từ: Names (${this.namesMap.size}), Vietphrase (${this.vietphraseMap.size}), Danh từ (${this.nounsMap.size}), Hậu từ (${this.suffixesMap.size}), Pronouns (${this.pronounsMap.size}), LacViet (${this.lacvietMap.size}), Tra cứu Lạc Việt (${this.lacvietRawLookupMap.size}), Khác (${this.otherMap.size})`
    );
  }

  // Nạp thêm nhiều file cùng lúc với tự động nhận diện tầng ưu tiên
  async addFiles(newFiles: { name: string; content: string; size?: number; fileType?: VietphraseCategory }[]): Promise<{ addedCount: number; totalWords: number }> {
    const createdItems: VietphraseFileItem[] = [];

    for (const item of newFiles) {
      const detectedType = item.fileType || detectVietphraseCategory(item.name);
      const wordCount = this.countWordsInContent(item.content);
      const fileItem: VietphraseFileItem = {
        id: 'vp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        name: item.name || 'Vietphrase.txt',
        size: item.size || new Blob([item.content]).size,
        wordCount: wordCount,
        content: item.content,
        enabled: true,
        uploadedAt: Date.now(),
        fileType: detectedType
      };
      createdItems.push(fileItem);
    }

    this.files = [...this.files, ...createdItems];
    this.rebuildDictionary();
    await db.saveVietphraseFiles(this.files);
    this.notify();

    return {
      addedCount: createdItems.length,
      totalWords: this.getSize()
    };
  }

  // Đổi phân loại tầng ưu tiên cho một file
  async setFileType(id: string, fileType: VietphraseCategory): Promise<void> {
    this.files = this.files.map(f => {
      if (f.id === id) {
        return { ...f, fileType };
      }
      return f;
    });

    this.rebuildDictionary();
    await db.saveVietphraseFiles(this.files);
    this.notify();
  }

  // Di chuyển thứ tự file lên hoặc xuống
  async moveFile(id: string, direction: 'up' | 'down'): Promise<void> {
    const index = this.files.findIndex(f => f.id === id);
    if (index === -1) return;
    if (direction === 'up' && index === 0) return;
    if (direction === 'down' && index === this.files.length - 1) return;

    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    const newFiles = [...this.files];
    const temp = newFiles[index];
    newFiles[index] = newFiles[targetIndex];
    newFiles[targetIndex] = temp;

    this.files = newFiles;
    this.rebuildDictionary();
    await db.saveVietphraseFiles(this.files);
    this.notify();
  }

  // Bật/Tắt một file
  async toggleFile(id: string, enabled?: boolean): Promise<void> {
    this.files = this.files.map(f => {
      if (f.id === id) {
        return { ...f, enabled: enabled !== undefined ? enabled : !f.enabled };
      }
      return f;
    });

    this.rebuildDictionary();
    await db.saveVietphraseFiles(this.files);
    this.notify();
  }

  // Xóa một file
  async removeFile(id: string): Promise<void> {
    this.files = this.files.filter(f => f.id !== id);
    this.rebuildDictionary();
    await db.saveVietphraseFiles(this.files);
    this.notify();
  }

  // Xóa toàn bộ file
  async clearAllFiles(): Promise<void> {
    this.files = [];
    this.rebuildDictionary();
    await db.saveVietphraseFiles([]);
    this.notify();
  }

  // Tương thích ngược: load dữ liệu 1 file duy nhất
  async loadDictionary(content: string, save: boolean = true): Promise<number> {
    const wordCount = this.countWordsInContent(content);
    const newFile: VietphraseFileItem = {
      id: 'vp_' + Date.now(),
      name: 'Vietphrase.txt',
      size: new Blob([content]).size,
      wordCount,
      content,
      enabled: true,
      uploadedAt: Date.now(),
      fileType: 'vietphrase'
    };
    
    this.files = [newFile];
    this.rebuildDictionary();
    if (save) {
      await db.saveVietphraseFiles(this.files);
    }
    this.notify();
    return this.getSize();
  }

  // Thuật toán Phân Tầng Ưu Tiên (Multi-Tier Priority Forward Maximum Matching)
  // Tầng 1: Custom Map (Từ điển riêng của truyện)
  // Tầng 2: Names Map (Tên người, địa danh - Names.txt)
  // Dịch một đoạn văn bản chỉ sử dụng các từ điển có sẵn của hệ thống (Names, Vietphrase, Nouns, Suffixes, Pronouns, Lacviet, Other)
  private translateBuiltinDictionaries(text: string): string {
    if (!text) return "";
    let result = "";
    let i = 0;
    const n = text.length;

    const tryConsumeSuffix = () => {
      if (this.maxSuffixesLength > 0 && i < n) {
        const sLimit = Math.min(n, i + this.maxSuffixesLength);
        for (let sj = sLimit; sj > i; sj--) {
          const sSub = text.substring(i, sj);
          if (this.suffixesMap.has(sSub)) {
            let sMeaning = this.suffixesMap.get(sSub) || sSub;
            if (sMeaning.includes('/')) sMeaning = sMeaning.split('/')[0];
            result += sMeaning + " ";
            i = sj;
            break;
          }
        }
      }
    };

    while (i < n) {
      let matched = false;

      // TẦNG 2: Names (Tên người, địa danh, bảo vật, công pháp)
      if (this.maxNamesLength > 0) {
        const limit = Math.min(n, i + this.maxNamesLength);
        for (let j = limit; j > i; j--) {
          const sub = text.substring(i, j);
          if (this.namesMap.has(sub)) {
            let meaning = this.namesMap.get(sub) || sub;
            if (meaning.includes('/')) meaning = meaning.split('/')[0];
            result += " " + meaning + " ";
            i = j;
            matched = true;
            tryConsumeSuffix();
            break;
          }
        }
      }

      // TẦNG 3: Vietphrase (Từ vựng chung - ưu tiên cụm dài nhất)
      if (!matched && this.maxVietphraseLength > 0) {
        const limit = Math.min(n, i + this.maxVietphraseLength);
        for (let j = limit; j > i; j--) {
          const sub = text.substring(i, j);
          if (this.vietphraseMap.has(sub)) {
            let meaning = this.vietphraseMap.get(sub) || sub;
            if (meaning.includes('/')) meaning = meaning.split('/')[0];
            result += " " + meaning + " ";
            i = j;
            matched = true;
            break;
          }
        }
      }

      // TẦNG 4: Danh từ (Nouns - Danh từ chung, thuật ngữ, tước vị)
      if (!matched && this.maxNounsLength > 0) {
        const limit = Math.min(n, i + this.maxNounsLength);
        for (let j = limit; j > i; j--) {
          const sub = text.substring(i, j);
          if (this.nounsMap.has(sub)) {
            let meaning = this.nounsMap.get(sub) || sub;
            if (meaning.includes('/')) meaning = meaning.split('/')[0];
            result += " " + meaning + " ";
            i = j;
            matched = true;
            tryConsumeSuffix();
            break;
          }
        }
      }

      // TẦNG 5: Hậu từ (Suffixes)
      if (!matched && this.maxSuffixesLength > 0) {
        const limit = Math.min(n, i + this.maxSuffixesLength);
        for (let j = limit; j > i; j--) {
          const sub = text.substring(i, j);
          if (this.suffixesMap.has(sub)) {
            let meaning = this.suffixesMap.get(sub) || sub;
            if (meaning.includes('/')) meaning = meaning.split('/')[0];
            result += " " + meaning + " ";
            i = j;
            matched = true;
            break;
          }
        }
      }

      // TẦNG 6: Pronouns (Đại từ nhân xưng)
      if (!matched && this.maxPronounsLength > 0) {
        const limit = Math.min(n, i + this.maxPronounsLength);
        for (let j = limit; j > i; j--) {
          const sub = text.substring(i, j);
          if (this.pronounsMap.has(sub)) {
            let meaning = this.pronounsMap.get(sub) || sub;
            if (meaning.includes('/')) meaning = meaning.split('/')[0];
            result += " " + meaning + " ";
            i = j;
            matched = true;
            break;
          }
        }
      }

      // TẦNG 7: LacViet (Từ điển Lạc Việt / Hán Việt dự phòng)
      if (!matched && this.maxLacvietLength > 0) {
        const limit = Math.min(n, i + this.maxLacvietLength);
        for (let j = limit; j > i; j--) {
          const sub = text.substring(i, j);
          if (this.lacvietMap.has(sub)) {
            let meaning = this.lacvietMap.get(sub) || sub;
            if (meaning.includes('/')) meaning = meaning.split('/')[0];
            result += " " + meaning + " ";
            i = j;
            matched = true;
            break;
          }
        }
      }

      // TẦNG 8: Khác (Bổ trợ)
      if (!matched && this.maxOtherLength > 0) {
        const limit = Math.min(n, i + this.maxOtherLength);
        for (let j = limit; j > i; j--) {
          const sub = text.substring(i, j);
          if (this.otherMap.has(sub)) {
            let meaning = this.otherMap.get(sub) || sub;
            if (meaning.includes('/')) meaning = meaning.split('/')[0];
            result += " " + meaning + " ";
            i = j;
            matched = true;
            break;
          }
        }
      }

      if (!matched) {
        result += text[i];
        i++;
      }
    }

    return result;
  }

  // Thuật toán Dịch Vietphrase đa tầng kết hợp Khóa khoảng từ riêng (Interval Locking)
  // Đảm bảo: Khi người dùng thêm từ / nhân vật, từ đó CHẮC CHẮN GHI ĐÈ 100% lên bản dịch,
  // không bị các cụm từ trong Vietphrase cắt đôi hoặc nuốt mất.
  translate(text: string, customTerms: CustomTerm[] | Map<string, string> = []): string {
    if (!text) return "";

    // 1. Chuẩn bị Custom Map kết hợp (từ tham số hoặc từ globalCustomMap)
    const effectiveCustomMap = new Map<string, string>(this.globalCustomMap);

    if (customTerms instanceof Map) {
      customTerms.forEach((val, key) => {
        if (key && val) effectiveCustomMap.set(key.trim(), val.trim());
      });
    } else if (Array.isArray(customTerms)) {
      for (const t of customTerms) {
        if (t.term && t.meaning) {
          effectiveCustomMap.set(t.term.trim(), t.meaning.trim());
        }
      }
    }

    // Nếu không có từ điển nào và không có custom terms
    if (this.getSize() === 0 && effectiveCustomMap.size === 0) return text;

    // Nếu không có custom terms, chạy trực tiếp từ điển hệ thống
    if (effectiveCustomMap.size === 0) {
      return this.translateBuiltinDictionaries(text).replace(/\s+/g, ' ').trim();
    }

    // THUẬT TOÁN INTERVAL LOCKING:
    // Sắp xếp các từ riêng theo độ dài giảm dần để ưu tiên cụm dài nhất của người dùng
    const sortedEntries = Array.from(effectiveCustomMap.entries())
      .filter(([k, v]) => k && v && k.trim())
      .map(([k, v]) => [k.trim(), v.trim()])
      .sort((a, b) => b[0].length - a[0].length);

    if (sortedEntries.length === 0) {
      return this.translateBuiltinDictionaries(text).replace(/\s+/g, ' ').trim();
    }

    const n = text.length;
    const occupied = new Uint8Array(n);
    const intervals: Array<{ start: number; end: number; meaning: string; term: string }> = [];

    for (const [term, meaning] of sortedEntries) {
      let startPos = 0;
      while (startPos < n) {
        const idx = text.indexOf(term, startPos);
        if (idx === -1) break;
        const end = idx + term.length;

        let isFree = true;
        for (let p = idx; p < end; p++) {
          if (occupied[p] === 1) {
            isFree = false;
            break;
          }
        }

        if (isFree) {
          for (let p = idx; p < end; p++) {
            occupied[p] = 1;
          }
          intervals.push({ start: idx, end, meaning, term });
        }

        startPos = idx + 1;
      }
    }

    // Nếu văn bản không chứa từ riêng nào của người dùng
    if (intervals.length === 0) {
      return this.translateBuiltinDictionaries(text).replace(/\s+/g, ' ').trim();
    }

    // Sắp xếp các khoảng từ trái sang phải
    intervals.sort((a, b) => a.start - b.start);

    // Ghép kết quả: các khoảng trống dịch bằng từ điển hệ thống, các khoảng đã khóa lấy nghĩa từ riêng
    let result = "";
    let cursor = 0;

    for (const item of intervals) {
      if (item.start > cursor) {
        const gap = text.substring(cursor, item.start);
        result += " " + this.translateBuiltinDictionaries(gap) + " ";
      }

      let termMeaning = item.meaning;
      if (termMeaning.includes('/')) termMeaning = termMeaning.split('/')[0];
      result += " " + termMeaning + " ";
      cursor = item.end;

      // Kiểm tra hậu từ (suffixes) ngay sau từ riêng này nếu có
      if (this.maxSuffixesLength > 0 && cursor < n) {
        const sLimit = Math.min(n, cursor + this.maxSuffixesLength);
        for (let sj = sLimit; sj > cursor; sj--) {
          const sSub = text.substring(cursor, sj);
          if (this.suffixesMap.has(sSub)) {
            let sMeaning = this.suffixesMap.get(sSub) || sSub;
            if (sMeaning.includes('/')) sMeaning = sMeaning.split('/')[0];
            result += sMeaning + " ";
            cursor = sj;
            break;
          }
        }
      }
    }

    if (cursor < n) {
      const gap = text.substring(cursor);
      result += " " + this.translateBuiltinDictionaries(gap) + " ";
    }

    return result.replace(/\s+/g, ' ').trim();
  }
}

export const vietphraseEngine = new VietphraseEngine();
