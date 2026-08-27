
import { CustomTerm, VietphraseFileItem } from "../types";
import { db } from "./db";

export interface TrieNode {
  children: Map<string, TrieNode>;
  value?: string; // Nghĩa tiếng Việt
}

class VietphraseEngine {
  private files: VietphraseFileItem[] = [];
  private dictionary: Map<string, string>;
  private maxKeyLength: number;
  private isLoaded: boolean = false;
  private listeners: Set<() => void> = new Set();

  constructor() {
    this.dictionary = new Map();
    this.maxKeyLength = 0;
  }

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
            uploadedAt: Date.now()
          }];
          await db.saveVietphraseFiles(savedFiles);
          console.log("Đã di chuyển dữ liệu Vietphrase cũ sang danh sách file đa năng");
        }
      }

      this.files = savedFiles || [];
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
    return this.dictionary.size;
  }

  // Lấy số file đang kích hoạt
  getActiveFilesCount(): number {
    return this.files.filter(f => f.enabled).length;
  }

  // Phân tích số từ trong một nội dung file
  private countWordsInContent(content: string): number {
    let count = 0;
    const lines = content.split(/\r?\n/);
    for (const line of lines) {
      if (!line.trim() || line.startsWith('#')) continue;
      if (line.includes('=')) {
        count++;
      }
    }
    return count;
  }

  // Tái tạo lại từ điển gộp từ tất cả các file đang kích hoạt (enabled: true)
  private rebuildDictionary() {
    this.dictionary.clear();
    this.maxKeyLength = 0;

    for (const file of this.files) {
      if (!file.enabled) continue;

      const lines = file.content.split(/\r?\n/);
      for (const line of lines) {
        if (!line.trim() || line.startsWith('#')) continue;

        const parts = line.split('=');
        if (parts.length >= 2) {
          const key = parts[0].trim();
          const value = parts[1].trim();
          if (key && value) {
            this.dictionary.set(key, value);
            if (key.length > this.maxKeyLength) {
              this.maxKeyLength = key.length;
            }
          }
        }
      }
    }

    console.log(`Đã nạp ${this.dictionary.size} từ từ ${this.getActiveFilesCount()}/${this.files.length} file Vietphrase.`);
  }

  // Nạp thêm nhiều file cùng lúc
  async addFiles(newFiles: { name: string; content: string; size?: number }[]): Promise<{ addedCount: number; totalWords: number }> {
    const createdItems: VietphraseFileItem[] = [];

    for (const item of newFiles) {
      const wordCount = this.countWordsInContent(item.content);
      const fileItem: VietphraseFileItem = {
        id: 'vp_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7),
        name: item.name || 'Vietphrase.txt',
        size: item.size || new Blob([item.content]).size,
        wordCount: wordCount,
        content: item.content,
        enabled: true,
        uploadedAt: Date.now()
      };
      createdItems.push(fileItem);
    }

    this.files = [...this.files, ...createdItems];
    this.rebuildDictionary();
    await db.saveVietphraseFiles(this.files);
    this.notify();

    return {
      addedCount: createdItems.length,
      totalWords: this.dictionary.size
    };
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
    this.dictionary.clear();
    this.maxKeyLength = 0;
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
      uploadedAt: Date.now()
    };
    
    // Ghi đè hoặc thêm vào danh sách
    this.files = [newFile];
    this.rebuildDictionary();
    if (save) {
      await db.saveVietphraseFiles(this.files);
    }
    this.notify();
    return this.dictionary.size;
  }

  // Thuật toán Forward Maximum Matching (Dịch ưu tiên cụm dài nhất)
  // Cập nhật: Ưu tiên Custom Terms
  translate(text: string, customTerms: CustomTerm[] | Map<string, string> = []): string {
    // 1. Prepare Custom Map
    let customMap: Map<string, string>;
    let maxCustomLength = 0;

    if (customTerms instanceof Map) {
        customMap = customTerms;
        for (const key of customMap.keys()) {
            if (key.length > maxCustomLength) maxCustomLength = key.length;
        }
    } else {
        customMap = new Map<string, string>();
        for (const t of customTerms) {
            if (t.term && t.meaning) {
                customMap.set(t.term.trim(), t.meaning.trim());
                if (t.term.trim().length > maxCustomLength) maxCustomLength = t.term.trim().length;
            }
        }
    }

    if (this.dictionary.size === 0 && customMap.size === 0) return text;

    let result = "";
    let i = 0;
    const n = text.length;
    const globalMaxLen = Math.max(this.maxKeyLength, maxCustomLength);

    while (i < n) {
      let matched = false;
      // Thử tìm từ dài nhất bắt đầu từ vị trí i
      const limit = Math.min(n, i + globalMaxLen);
      
      for (let j = limit; j > i; j--) {
        const sub = text.substring(i, j);
        
        // ƯU TIÊN 1: Kiểm tra Custom Dictionary trước
        if (customMap.has(sub)) {
             result += " " + customMap.get(sub) + " ";
             i = j;
             matched = true;
             break;
        }

        // ƯU TIÊN 2: Kiểm tra Vietphrase Dictionary
        if (this.dictionary.has(sub)) {
          // Tìm thấy cụm từ trong từ điển
          let meaning = this.dictionary.get(sub) || sub;
          // Xử lý nếu nghĩa có nhiều lựa chọn (VD: Nghĩa1/Nghĩa2) -> lấy nghĩa đầu
          if (meaning.includes('/')) {
              meaning = meaning.split('/')[0];
          }
          result += " " + meaning + " ";
          i = j;
          matched = true;
          break;
        }
      }

      if (!matched) {
        // Không tìm thấy, giữ nguyên ký tự hiện tại
        result += text[i];
        i++;
      }
    }

    // Chuẩn hóa khoảng trắng thừa
    return result.replace(/\s+/g, ' ').trim();
  }
}

export const vietphraseEngine = new VietphraseEngine();
