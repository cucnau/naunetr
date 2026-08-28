import React, { useState, useEffect } from 'react';
import { getNovels, createNovel } from '../services/firestoreService';
import { Novel } from '../types';
import { Book, Plus, Loader2 } from 'lucide-react';
import { auth } from '../services/firebase';
import { onAuthStateChanged } from 'firebase/auth';

interface NovelSelectorProps {
  currentNovelId: string;
  onSelectNovel: (id: string) => void;
}

export const NovelSelector: React.FC<NovelSelectorProps> = ({ currentNovelId, onSelectNovel }) => {
  const [novels, setNovels] = useState<Novel[]>(() => {
    try {
      const saved = localStorage.getItem('cached_novels_list');
      return saved ? JSON.parse(saved) : [];
    } catch (e) {
      return [];
    }
  });
  const [loading, setLoading] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setIsSignedIn(!!user);
      if (user) {
        // Load local cache if available
        try {
          const userCache = localStorage.getItem(`cached_novels_${user.uid}`);
          if (userCache) {
            const parsed = JSON.parse(userCache);
            if (Array.isArray(parsed) && parsed.length > 0) {
              setNovels(parsed);
              if (!currentNovelId) onSelectNovel(parsed[0].id);
            }
          }
        } catch (_) {}
        fetchNovels(user.uid);
      } else {
        setNovels([]);
        setError(null);
      }
    });
    return () => unsub();
  }, []);

  const fetchNovels = async (uid?: string) => {
    setLoading(true);
    setError(null);
    try {
      const data = await getNovels();
      if (data && data.length > 0) {
        setNovels(data);
        const currentUid = uid || auth.currentUser?.uid;
        if (currentUid) {
          localStorage.setItem(`cached_novels_${currentUid}`, JSON.stringify(data));
        }
        localStorage.setItem('cached_novels_list', JSON.stringify(data));
        if (!currentNovelId) {
          onSelectNovel(data[0].id);
        }
      }
    } catch (e: any) {
      console.warn("Đang tải danh sách truyện từ bộ nhớ máy:", e);
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

    // 1. Cập nhật giao diện ngay lập tức (Optimistic UI)
    const updatedNovels = [...novels, newNovel];
    setNovels(updatedNovels);
    onSelectNovel(newNovel.id);
    
    const uid = auth.currentUser?.uid;
    if (uid) {
      localStorage.setItem(`cached_novels_${uid}`, JSON.stringify(updatedNovels));
    }
    localStorage.setItem('cached_novels_list', JSON.stringify(updatedNovels));

    // 2. Đồng bộ lên Firestore ở chế độ nền
    try {
      setLoading(true);
      setError(null);
      await createNovel(id, trimmedName);
    } catch (e: any) {
      console.warn("Chưa đồng bộ lên đám mây được, đã lưu trên máy cục bộ:", e);
    } finally {
      setLoading(false);
    }
  };

  if (!isSignedIn) return null;

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center gap-1 bg-[#5D4037] rounded-md border border-[#4E342E] px-2 py-1">
        <Book size={12} className="text-[#D7CCC8]" />
        <select 
          value={currentNovelId || ''} 
          onChange={(e) => onSelectNovel(e.target.value)}
          className="bg-transparent text-[#D7CCC8] text-[10px] outline-none max-w-[120px]"
        >
          <option value="" disabled>-- Chọn truyện --</option>
          {novels.map(n => (
            <option key={n.id} value={n.id} className="text-black bg-white">{n.name}</option>
          ))}
        </select>
        {loading ? (
          <Loader2 size={12} className="animate-spin text-[#D7CCC8] ml-0.5" />
        ) : (
          <button onClick={handleCreate} className="ml-1 text-[#D7CCC8] hover:text-white" title="Tạo truyện mới">
            <Plus size={12} />
          </button>
        )}
      </div>
      {error && (
        <span 
          className="text-[9px] text-[#D7CCC8] bg-[#4E342E] border border-[#3E2723] px-1.5 py-0.5 rounded cursor-pointer opacity-80 hover:opacity-100" 
          title={`${error} - Bấm để tải lại từ Cloud`}
          onClick={() => fetchNovels()}
        >
          🔄 Thử lại
        </span>
      )}
    </div>
  );
};
