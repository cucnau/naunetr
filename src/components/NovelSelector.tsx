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
  const [novels, setNovels] = useState<Novel[]>([]);
  const [loading, setLoading] = useState(false);
  const [isSignedIn, setIsSignedIn] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const unsub = onAuthStateChanged(auth, (user) => {
      setIsSignedIn(!!user);
      if (user) {
        fetchNovels();
      } else {
        setNovels([]);
        setError(null);
      }
    });
    return () => unsub();
  }, []);

  const fetchNovels = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await getNovels();
      setNovels(data);
      if (data.length > 0 && !currentNovelId) {
        onSelectNovel(data[0].id);
      }
    } catch (e: any) {
      console.error(e);
      let errMsg = 'Lỗi tải truyện';
      try {
        const parsed = JSON.parse(e.message);
        if (parsed.error) {
          errMsg = parsed.error;
        }
      } catch (_) {
        errMsg = e.message || 'Lỗi tải truyện';
      }
      setError(errMsg);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    const name = prompt('Nhập tên truyện mới:');
    if (!name) return;
    const id = Date.now().toString();
    try {
      setLoading(true);
      setError(null);
      const newNovel = await createNovel(id, name);
      setNovels([...novels, newNovel]);
      onSelectNovel(newNovel.id);
    } catch (e: any) {
      console.error(e);
      let errMsg = 'Lỗi tạo truyện';
      try {
        const parsed = JSON.parse(e.message);
        if (parsed.error) {
          errMsg = parsed.error;
        }
      } catch (_) {
        errMsg = e.message || 'Lỗi tạo truyện';
      }
      alert(`Không thể tạo truyện: ${errMsg}`);
    } finally {
      setLoading(false);
    }
  };

  if (!isSignedIn) return null;

  return (
    <div className="flex items-center gap-1.5">
      <div className="flex items-center gap-1 bg-[#5D4037] rounded-md border border-[#4E342E] px-2 py-1">
        <Book size={12} className="text-[#D7CCC8]" />
        {loading ? (
          <Loader2 size={12} className="animate-spin text-[#D7CCC8]" />
        ) : (
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
        )}
        <button onClick={handleCreate} className="ml-1 text-[#D7CCC8] hover:text-white" title="Tạo truyện mới">
          <Plus size={12} />
        </button>
      </div>
      {error && (
        <span 
          className="text-[9px] text-red-500 font-bold bg-red-100 border border-red-200 px-1.5 py-0.5 rounded cursor-pointer" 
          title={`${error} - Bấm để tải lại`}
          onClick={fetchNovels}
        >
          ⚠️ Lỗi tải
        </span>
      )}
    </div>
  );
};
