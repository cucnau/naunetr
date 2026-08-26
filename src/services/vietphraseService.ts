
import { CustomTerm } from "../types";
import { db } from "./db";

export interface TrieNode {
  children: Map<string, TrieNode>;
  value?: string; // Nghĩa tiếng Việt
}

class VietphraseEngine {
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

  // Khởi tạo: Load từ DB nếu có
  async init() {
      if (this.isLoaded) return;
      const savedContent = await db.getVietphrase();
      if (savedContent && typeof savedContent === 'string') {
          this.loadDictionary(savedContent, false); // false = không lưu lại vào DB nữa
          console.log("Đã khôi phục Vietphrase từ DB");
      }
      this.isLoaded = true;
      this.notify();
  }

  // Lấy số lượng từ hiện tại
  getSize(): number {
    return this.dictionary.size;
  }

  // Nạp dữ liệu từ nội dung file text (Format: Trung=Việt)
  loadDictionary(content: string, save: boolean = true) {
    this.dictionary.clear();
    this.maxKeyLength = 0;
    
    const lines = content.split(/\r?\n/);
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
    console.log(`Đã nạp ${this.dictionary.size} từ Vietphrase. Max length: ${this.maxKeyLength}`);
    
    if (save) {
        db.saveVietphrase(content).then(() => console.log("Đã lưu Vietphrase vào DB"));
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
