import React, { useState, useEffect } from 'react';
import { getNovels, createNovel } from '../services/firestoreService';
import { Novel } from '../types';
import { Book, Plus, Loader2, Trash2 } from 'lucide-react';
import { auth } from '../services/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { getScopedStorageItem, setScopedStorageItem, recoverAllCachedNovels } from '../services/storageNamespace';
import { db } from '../services/db';

interface NovelSelectorProps {
  currentNovelId: string;
  onSelectNovel: (id: string) => void;
  onDeleteNovel?: (id: string) => void;
}

export const NovelSelector: React.FC<NovelSelectorProps> = ({ currentNovelId, onSelectNovel, onDeleteNovel }) => {
  const [novels, setNovels] = useState<Novel[]>(() => {
    try {
      const uid = auth.currentUser?.uid;
      const recovered = recoverAllCachedNovels(uid);
      if (Array.isArray(recovered) && recovered.length > 0) return recovered;
      return [{ id: 'default', name: 'Truyện mặc định' }];
    } catch (e) {
      return [{ id: 'default', name: 'Truyện mặc định' }];
    }
  });
  const [loading, setLoading] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Khôi phục bền vững từ IndexedDB ngay khi component mount
  useEffect(() => {
    let isMounted = true;
    const uid = auth.currentUser?.uid;
    db.autoRecoverNovels(uid).then((recoveredList) => {
      if (isMounted && Array.isArray(recoveredList) && recoveredList.length > 0) {
        setNovels(recoveredList);
        if (!currentNovelId) {
          onSelectNovel(recoveredList[0].id);
        }
      }
    }).catch(console.error);

    return () => { isMounted = false; };
  }, []);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setIsSignedIn(!!user);
      if (user) {
        // Tải cache của user này nếu có
        try {
          const userCache = getScopedStorageItem(`cached_novels_${user.uid}`);
          if (userCache) {
            const parsed = JSON.parse(userCache);
            if (Array.isArray(parsed) && parsed.length > 0) {
              const clean = parsed.filter((n: any) => n && n.name && typeof n.name === 'string');
              if (clean.length > 0) {
                setNovels(clean);
                const nonDef = clean.find((n: any) => n.id !== 'default');
                if (!currentNovelId || currentNovelId === 'default') {
                  onSelectNovel(nonDef ? nonDef.id : clean[0].id);
                }
              }
            }
          }
        } catch (_) {}
        fetchNovels(user.uid);
      } else {
        // Khi không đăng nhập: Khôi phục danh sách từ IndexedDB & localStorage của khách
        try {
          const recovered = await db.autoRecoverNovels();
          if (Array.isArray(recovered) && recovered.length > 0) {
            setNovels(recovered);
            const nonDef = recovered.find(n => n.id !== 'default');
            if (!currentNovelId || currentNovelId === 'default') {
              onSelectNovel(nonDef ? nonDef.id : recovered[0].id);
            }
          }
        } catch (_) {
          const fallback = recoverAllCachedNovels();
          setNovels(fallback);
          if (!currentNovelId && fallback.length > 0) onSelectNovel(fallback[0].id);
        }
      }
    });
    return () => unsub();
  }, []);

  useEffect(() => {
    if (!currentNovelId && novels.length > 0) {
      onSelectNovel(novels[0].id);
    }
  }, [currentNovelId, novels]);

  const fetchNovels = async (uid?: string) => {
    setLoading(true);
    setError(null);
    try {
      const currentUid = uid || auth.currentUser?.uid;
      const cloudData = await getNovels();
      
      // 1. Nếu tải thành công từ Firestore
      if (cloudData && cloudData.length > 0) {
        setNovels(cloudData);
        if (currentUid) {
          setScopedStorageItem(`cached_novels_${currentUid}`, JSON.stringify(cloudData));
          await db.saveNovels(cloudData, currentUid);
        }
        const nonDef = cloudData.find(n => n.id !== 'default');
        const targetId = (currentNovelId && currentNovelId !== 'default' && cloudData.some(n => n.id === currentNovelId))
          ? currentNovelId
          : (nonDef ? nonDef.id : cloudData[0].id);
        onSelectNovel(targetId);
        return;
      }

      // 2. Nếu Cloud chưa có hoặc offline: Khôi phục cache của ĐÚNG tài khoản này
      const localData = await db.autoRecoverNovels(currentUid);
      if (localData && localData.length > 0) {
        setNovels(localData);
        const nonDef = localData.find(n => n.id !== 'default');
        const targetId = (currentNovelId && currentNovelId !== 'default' && localData.some(n => n.id === currentNovelId))
          ? currentNovelId
          : (nonDef ? nonDef.id : localData[0].id);
        onSelectNovel(targetId);
      }
    } catch (e: any) {
      console.warn("Đang dùng danh sách truyện từ bộ nhớ máy:", e);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    const name = prompt('Nhập tên truyện mới:');
    if (!name || !name.trim()) return;
    
    const trimmedName = name.trim();
    const id = Date.now().toString();
    const newNovel: Novel = { id, name: trimmedName };

    // 1. Cập nhật giao diện ngay lập tức
    const filteredOld = novels.filter(n => !(n.id === 'default' && n.name === 'Truyện mặc định' && novels.length === 1));
    const updatedNovels = [...filteredOld, newNovel];
    setNovels(updatedNovels);
    onSelectNovel(newNovel.id);
    
    // Lưu đồng thời vào cả IndexedDB lẫn LocalStorage theo đúng tài khoản này
    const uid = auth.currentUser?.uid;
    await db.saveNovels(updatedNovels, uid);
    if (uid) {
      setScopedStorageItem(`cached_novels_${uid}`, JSON.stringify(updatedNovels));
    }

    // 2. Đồng bộ lên Firestore nếu đã đăng nhập
    if (auth.currentUser) {
      try {
        setLoading(true);
        setError(null);
        await createNovel(id, trimmedName);
      } catch (e: any) {
        console.warn("Chưa đồng bộ lên đám mây được, đã lưu an toàn trên máy cục bộ:", e);
      } finally {
        setLoading(false);
      }
    }
  };

  const handleDelete = () => {
    const current = novels.find(n => n.id === currentNovelId);
    if (!current) return;
    const confirmDelete = window.confirm(`Bạn có chắc chắn muốn xóa bộ truyện "${current.name}" khỏi tài khoản không?`);
    if (confirmDelete && onDeleteNovel) {
      onDeleteNovel(current.id);
    }
  };

  return (
    <div className="flex items-center gap-1.5 shrink-0">
      <div className="flex items-center gap-1 rounded-md px-2 py-1 transition-colors bg-white hover:bg-[#FAF6F0] border border-[#D7CCC8] text-[#3E2723] shadow-2xs">
        <Book size={12} className="text-[#5D4037]" />
        <select 
          value={currentNovelId || (novels[0]?.id || '')} 
          onChange={(e) => onSelectNovel(e.target.value)}
          className="bg-transparent font-medium text-[10px] outline-none max-w-[120px] cursor-pointer text-[#3E2723]"
        >
          {novels.length === 0 && <option value="" disabled>-- Chọn truyện --</option>}
          {novels.map(n => (
            <option key={n.id} value={n.id} className="text-black bg-white">{n.name}</option>
          ))}
        </select>
        {loading ? (
          <Loader2 size={12} className="animate-spin ml-0.5 text-[#8D6E63]" />
        ) : (
          <div className="flex items-center gap-1 ml-0.5">
            <button 
              onClick={handleCreate} 
              className="transition-colors text-[#8D6E63] hover:text-[#3E2723]" 
              title="Tạo truyện mới"
            >
              <Plus size={12} />
            </button>

            {onDeleteNovel && (novels.length > 1 || currentNovelId !== 'default') && (
              <button
                onClick={handleDelete}
                className="transition-colors text-[#A1887F] hover:text-red-700 ml-0.5"
                title="Xóa bộ truyện này"
              >
                <Trash2 size={11} />
              </button>
            )}
          </div>
        )}
      </div>

      {error && (
        <span 
          className="text-[9px] text-[#C62828] bg-red-50 border border-red-200 px-1.5 py-0.5 rounded cursor-pointer opacity-90 hover:opacity-100" 
          title={`${error} - Bấm để tải lại từ Cloud`}
          onClick={() => fetchNovels()}
        >
          Thử lại
        </span>
      )}
    </div>
  );
};
