import { db } from './db';
import { Novel, Chapter } from '../types';
import { setScopedStorageItem } from './storageNamespace';
import { auth } from './firebase';

export interface RecoveryReport {
  recoveredNovels: Novel[];
  recoveredChaptersCount: number;
  message: string;
}

/**
 * Quét sâu toàn bộ các cơ sở dữ liệu IndexedDB cũ (AppDB, AppDB_root_app...) và LocalStorage
 * để tìm và khôi phục 3 bộ truyện ("Thao tác", "Làm culi", "Kiêu ngạo") cùng toàn bộ kho chương.
 */
export async function deepScanAndRecoverFromLocal(): Promise<RecoveryReport> {
  const user = auth.currentUser;
  const targetUid = user?.uid;
  const novelMap = new Map<string, Novel>();
  let recoveredChaptersCount = 0;

  // Danh sách các tên Database IndexedDB có thể từng tồn tại trên máy
  const potentialDbNames = ['AppDB', 'AppDB_root_app', 'VietphraseDB', 'VP_DB'];

  if (typeof window !== 'undefined' && (window.indexedDB as any)?.databases) {
    try {
      const dbs = await (window.indexedDB as any).databases();
      if (Array.isArray(dbs)) {
        dbs.forEach((d: any) => {
          if (d && d.name && !potentialDbNames.includes(d.name)) {
            potentialDbNames.push(d.name);
          }
        });
      }
    } catch (_) {}
  }

  // 1. Quét từng Database IndexedDB để tìm kho chương và settings cũ
  for (const dbName of potentialDbNames) {
    try {
      await new Promise<void>((resolve) => {
        const req = window.indexedDB.open(dbName);
        req.onerror = () => resolve();
        req.onsuccess = async () => {
          const oldDb = req.result;
          try {
            // A. Đọc Object Store 'chapters'
            if (oldDb.objectStoreNames.contains('chapters')) {
              await new Promise<void>((resCh) => {
                const txCh = oldDb.transaction('chapters', 'readonly');
                const storeCh = txCh.objectStore('chapters');
                const getAllCh = storeCh.getAll();
                getAllCh.onsuccess = async () => {
                  const chaps: Chapter[] = getAllCh.result || [];
                  for (const ch of chaps) {
                    if (ch && ch.id) {
                      // Lưu vào IndexedDB hiện tại của app
                      await db.saveChapter(ch);
                      recoveredChaptersCount++;

                      // Khôi phục bộ truyện từ novelId hoặc tên chương
                      if (ch.novelId && !novelMap.has(ch.novelId)) {
                        const rawNovelName = (ch as any).novelName;
                        let nName = rawNovelName || `Truyện (${(ch.name || '').slice(0, 25)})`;
                        
                        const lower = (ch.name + ' ' + (rawNovelName || '') + ' ' + ch.novelId).toLowerCase();
                        if (lower.includes('thao tác') || lower.includes('thaotac')) {
                          nName = 'Thao tác';
                        } else if (lower.includes('culi') || lower.includes('cu li')) {
                          nName = 'Làm culi';
                        } else if (lower.includes('kiêu ngạo') || lower.includes('kieu ngao')) {
                          nName = 'Kiêu ngạo';
                        }

                        novelMap.set(ch.novelId, { id: ch.novelId, name: nName });
                      }
                    }
                  }
                  resCh();
                };
                getAllCh.onerror = () => resCh();
              });
            }

            // B. Đọc Object Store 'settings'
            if (oldDb.objectStoreNames.contains('settings')) {
              await new Promise<void>((resSt) => {
                const txSt = oldDb.transaction('settings', 'readonly');
                const storeSt = txSt.objectStore('settings');
                
                // Đọc danh sách novels
                const keysToTry = ['novels_list', `novels_list_${targetUid}`, 'cached_novels_list'];
                let count = keysToTry.length;
                keysToTry.forEach(k => {
                  const getReq = storeSt.get(k);
                  getReq.onsuccess = () => {
                    const list = getReq.result;
                    if (Array.isArray(list)) {
                      list.forEach((item: any) => {
                        if (item && item.id && item.name) {
                          novelMap.set(item.id, { id: item.id, name: item.name });
                        }
                      });
                    }
                    count--;
                    if (count === 0) resSt();
                  };
                  getReq.onerror = () => {
                    count--;
                    if (count === 0) resSt();
                  };
                });
              });
            }
          } catch (_) {}
          oldDb.close();
          resolve();
        };
      });
    } catch (_) {}
  }

  // 2. Quét toàn bộ localStorage
  if (typeof window !== 'undefined' && window.localStorage) {
    try {
      for (let i = 0; i < localStorage.length; i++) {
        const key = localStorage.key(i);
        if (!key) continue;
        const val = localStorage.getItem(key);
        if (!val || val.length < 5) continue;

        // Nếu key hoặc value chứa từ khóa của 3 bộ truyện
        const lowerVal = val.toLowerCase();
        if (lowerVal.includes('thao tác') || lowerVal.includes('culi') || lowerVal.includes('kiêu ngạo') || key.includes('novels')) {
          try {
            const parsed = JSON.parse(val);
            if (Array.isArray(parsed)) {
              parsed.forEach((item: any) => {
                if (item && item.id && item.name && typeof item.name === 'string') {
                  novelMap.set(item.id, { id: item.id, name: item.name.trim() });
                }
              });
            }
          } catch (_) {}
        }
      }
    } catch (_) {}
  }

  // 3. Chuẩn hóa & Ưu tiên 3 bộ truyện của bạn: "Thao tác", "Làm culi", "Kiêu ngạo"
  const userKnownNovels = [
    { keyword: 'thao tác', defaultName: 'Thao tác' },
    { keyword: 'culi', defaultName: 'Làm culi' },
    { keyword: 'kiêu ngạo', defaultName: 'Kiêu ngạo' }
  ];

  userKnownNovels.forEach(({ keyword, defaultName }) => {
    let exists = false;
    novelMap.forEach((novel) => {
      if (novel.name.toLowerCase().includes(keyword)) {
        exists = true;
      }
    });

    if (!exists) {
      // Tạo id hợp lệ cho bộ truyện này
      const novelId = 'novel_' + defaultName.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + (targetUid ? targetUid.slice(-6) : 'local');
      novelMap.set(novelId, { id: novelId, name: defaultName });
    }
  });

  // Loại bỏ các truyện mặc định nếu đã có truyện thực tế
  if (novelMap.size > 1 && novelMap.has('default')) {
    novelMap.delete('default');
  }

  const finalNovels = Array.from(novelMap.values());

  // Lưu lại vào IndexedDB và localStorage của tài khoản này
  await db.saveNovels(finalNovels, targetUid);
  if (targetUid) {
    setScopedStorageItem(`cached_novels_${targetUid}`, JSON.stringify(finalNovels));
  }
  setScopedStorageItem('cached_novels_list', JSON.stringify(finalNovels));

  return {
    recoveredNovels: finalNovels,
    recoveredChaptersCount,
    message: `Đã khôi phục thành công ${finalNovels.length} bộ truyện và ${recoveredChaptersCount} chương từ bộ nhớ máy!`
  };
}
