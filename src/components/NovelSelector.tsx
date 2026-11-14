import React, { useState, useEffect, useRef } from 'react';
import { Novel } from '../types';
import { Book, Plus, Trash2, Pencil, Check, X } from 'lucide-react';
import { auth } from '../services/firebase';
import { onAuthStateChanged } from 'firebase/auth';
import { setScopedStorageItem, recoverAllCachedNovels } from '../services/storageNamespace';
import { db } from '../services/db';

interface NovelSelectorProps {
  currentNovelId: string;
  onSelectNovel: (id: string) => void;
  onCreateNovel?: (name: string) => Promise<void> | void;
  onRenameNovel?: (id: string, newName: string) => Promise<void> | void;
  onDeleteNovel?: (id: string) => Promise<void> | void;
  novels?: Novel[];
  onNovelsChange?: (novels: Novel[]) => void;
}

export const NovelSelector: React.FC<NovelSelectorProps> = ({
  currentNovelId,
  onSelectNovel,
  onCreateNovel,
  onRenameNovel,
  onDeleteNovel,
  novels: propNovels,
  onNovelsChange,
}) => {
  const [internalNovels, setInternalNovels] = useState<Novel[]>(() => {
    try {
      const uid = auth.currentUser?.uid;
      const recovered = recoverAllCachedNovels(uid);
      if (Array.isArray(recovered) && recovered.length > 0) return recovered;
      return [{ id: 'default', name: 'Truyện mặc định' }];
    } catch (_) {
      return [{ id: 'default', name: 'Truyện mặc định' }];
    }
  });

  const novels = propNovels && propNovels.length > 0 ? propNovels : internalNovels;
  const updateNovelsList = (list: Novel[]) => {
    setInternalNovels(list);
    onNovelsChange?.(list);
  };

  const [actionMode, setActionMode] = useState<'idle' | 'create' | 'rename' | 'delete_confirm'>('idle');
  const [nameInput, setNameInput] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (actionMode === 'create' || actionMode === 'rename') {
      setTimeout(() => inputRef.current?.focus(), 0);
    }
  }, [actionMode]);

  // Reset inline action when switching novel
  useEffect(() => {
    setActionMode('idle');
    setNameInput('');
  }, [currentNovelId]);

  // Khôi phục từ IndexedDB cục bộ chỉ khi component tự quản lý state (không nhận propNovels)
  useEffect(() => {
    if (propNovels !== undefined) return;
    let isMounted = true;
    const uid = auth.currentUser?.uid;
    db.autoRecoverNovels(uid).then((recoveredList) => {
      if (isMounted && Array.isArray(recoveredList) && recoveredList.length > 0) {
        updateNovelsList(recoveredList);
        if (!currentNovelId) {
          onSelectNovel(recoveredList[0].id);
        }
      }
    }).catch(console.error);

    const unsub = onAuthStateChanged(auth, async (user) => {
      try {
        const recovered = await db.autoRecoverNovels(user?.uid);
        if (isMounted && Array.isArray(recovered) && recovered.length > 0) {
          updateNovelsList(recovered);
        }
      } catch (_) {}
    });

    return () => {
      isMounted = false;
      unsub();
    };
  }, [propNovels]);

  const currentNovel = novels.find((n) => n.id === currentNovelId) || novels[0];
  const canDeleteCurrent = Boolean(
    onDeleteNovel &&
    currentNovel &&
    (novels.length > 1 || currentNovel.id !== 'default')
  );

  const handleOpenCreate = () => {
    setNameInput('');
    setActionMode('create');
  };

  const handleOpenRename = () => {
    if (!currentNovel) return;
    setNameInput(currentNovel.name);
    setActionMode('rename');
  };

  const handleSubmitName = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const trimmed = nameInput.trim();
    if (!trimmed) return;

    if (actionMode === 'create') {
      if (onCreateNovel) {
        await onCreateNovel(trimmed);
      } else {
        const id = `novel_${Date.now()}`;
        const newNovel: Novel = { id, name: trimmed };
        const filteredOld = novels.filter(
          (n) => !(n.id === 'default' && n.name === 'Truyện mặc định' && novels.length === 1)
        );
        const updatedNovels = [...filteredOld, newNovel];
        updateNovelsList(updatedNovels);
        onSelectNovel(newNovel.id);
        const uid = auth.currentUser?.uid;
        await db.saveNovels(updatedNovels, uid);
        if (uid) {
          setScopedStorageItem(`cached_novels_${uid}`, JSON.stringify(updatedNovels));
        }
      }
    } else if (actionMode === 'rename' && currentNovel) {
      if (onRenameNovel) {
        await onRenameNovel(currentNovel.id, trimmed);
      } else {
        const updated = novels.map((n) => (n.id === currentNovel.id ? { ...n, name: trimmed } : n));
        updateNovelsList(updated);
        const uid = auth.currentUser?.uid;
        await db.saveNovels(updated, uid);
        if (uid) {
          setScopedStorageItem(`cached_novels_${uid}`, JSON.stringify(updated));
        }
      }
    }

    setActionMode('idle');
    setNameInput('');
  };

  const handleConfirmDelete = async () => {
    if (!currentNovel || !onDeleteNovel) return;
    const targetId = currentNovel.id;
    setActionMode('idle');
    await onDeleteNovel(targetId);
  };

  return (
    <div className="relative flex items-center gap-1.5 shrink-0">
      {actionMode === 'create' || actionMode === 'rename' ? (
        <form
          onSubmit={handleSubmitName}
          className="flex items-center gap-1 rounded-md px-1.5 py-0.5 bg-white border border-[#8D6E63] text-[#3E2723] shadow-xs"
        >
          <input
            ref={inputRef}
            type="text"
            value={nameInput}
            onChange={(e) => setNameInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Escape') {
                setActionMode('idle');
                setNameInput('');
              }
            }}
            placeholder={actionMode === 'create' ? 'Tên truyện mới...' : 'Tên truyện mới...'}
            className="text-[10px] font-medium px-1 py-0.5 w-28 sm:w-36 outline-none bg-transparent text-[#3E2723]"
          />
          <button
            type="submit"
            disabled={!nameInput.trim()}
            className="p-0.5 rounded text-emerald-700 hover:bg-emerald-50 disabled:opacity-40 cursor-pointer"
            title="Lưu (Enter)"
          >
            <Check size={12} />
          </button>
          <button
            type="button"
            onClick={() => {
              setActionMode('idle');
              setNameInput('');
            }}
            className="p-0.5 rounded text-[#8D6E63] hover:bg-[#EFEBE9] cursor-pointer"
            title="Hủy (Esc)"
          >
            <X size={12} />
          </button>
        </form>
      ) : actionMode === 'delete_confirm' && currentNovel ? (
        <div className="flex items-center gap-1.5 rounded-md px-2 py-0.5 bg-red-50 border border-red-300 text-red-900 shadow-xs">
          <span className="text-[10px] font-semibold max-w-[130px] truncate" title={`Xóa "${currentNovel.name}"?`}>
            Xóa "{currentNovel.name}"?
          </span>
          <button
            type="button"
            onClick={handleConfirmDelete}
            className="px-1.5 py-0.5 rounded bg-red-600 hover:bg-red-700 text-white text-[10px] font-bold cursor-pointer"
            title="Xác nhận xóa truyện và chương của truyện này"
          >
            Xóa
          </button>
          <button
            type="button"
            onClick={() => setActionMode('idle')}
            className="px-1.5 py-0.5 rounded bg-white hover:bg-gray-100 border border-gray-300 text-[#5D4037] text-[10px] font-medium cursor-pointer"
          >
            Hủy
          </button>
        </div>
      ) : (
        <div className="flex items-center gap-1 rounded-md px-2 py-1 transition-colors bg-white hover:bg-[#FAF6F0] border border-[#D7CCC8] text-[#3E2723] shadow-2xs">
          <Book size={12} className="text-[#5D4037]" />
          <select
            value={currentNovelId || novels[0]?.id || ''}
            onChange={(e) => onSelectNovel(e.target.value)}
            className="bg-transparent font-medium text-[10px] outline-none max-w-[120px] cursor-pointer text-[#3E2723]"
          >
            {novels.length === 0 && (
              <option value="" disabled>
                -- Chọn truyện --
              </option>
            )}
            {novels.map((n) => (
              <option key={n.id} value={n.id} className="text-black bg-white">
                {n.name}
              </option>
            ))}
          </select>

          <div className="flex items-center gap-1 ml-0.5">
            <button
              type="button"
              onClick={handleOpenCreate}
              className="transition-colors text-[#8D6E63] hover:text-[#3E2723] cursor-pointer"
              title="Tạo truyện mới"
            >
              <Plus size={12} />
            </button>

            {currentNovel && (
              <button
                type="button"
                onClick={handleOpenRename}
                className="transition-colors text-[#8D6E63] hover:text-[#3E2723] ml-0.5 cursor-pointer"
                title="Đổi tên bộ truyện này"
              >
                <Pencil size={10} />
              </button>
            )}

            {canDeleteCurrent && (
              <button
                type="button"
                onClick={() => setActionMode('delete_confirm')}
                className="transition-colors text-[#A1887F] hover:text-red-700 ml-0.5 cursor-pointer"
                title="Xóa bộ truyện này"
              >
                <Trash2 size={11} />
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
