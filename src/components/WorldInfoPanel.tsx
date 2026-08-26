
import React, { useState, useEffect, useRef } from 'react';
import { Character, Relationship } from '../types';
import { Users, Network, Plus, Trash2, Search, Settings, Save, Download, Upload, Loader2, RefreshCw } from 'lucide-react';
import { syncFirestoreData, deleteFirestoreDoc } from '../services/firestoreService';
import { auth } from '../services/firebase';
import { onAuthStateChanged } from 'firebase/auth';

interface WorldInfoPanelProps {
  currentNovelId: string;
  characters: Character[];
  onUpdateCharacters: (chars: Character[]) => void;
  relationships: Relationship[];
  onUpdateRelationships: (rels: Relationship[]) => void;
  notes: string;
  onUpdateNotes: (notes: string) => void;
  sheetUrl: string;
  onUpdateSheetUrl: (url: string) => void;
}

export const WorldInfoPanel: React.FC<WorldInfoPanelProps> = ({
  currentNovelId,
  characters,
  onUpdateCharacters,
  relationships,
  onUpdateRelationships,
  notes,
  onUpdateNotes,
  sheetUrl,
  onUpdateSheetUrl
}) => {
  const [activeTab, setActiveTab] = useState<'char' | 'rel'>('char');
  const [searchTerm, setSearchTerm] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [bulkText, setBulkText] = useState('');
  
  // Sync States
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncMessage, setSyncMessage] = useState<{type: 'success' | 'error', text: string} | null>(null);
  const [isSignedIn, setIsSignedIn] = useState(!!auth.currentUser);

  const charsRef = useRef(characters);
  const relsRef = useRef(relationships);
  useEffect(() => {
    charsRef.current = characters;
  }, [characters]);
  useEffect(() => {
    relsRef.current = relationships;
  }, [relationships]);

  // Auto Sync State
  const [autoSync, setAutoSync] = useState<boolean>(() => {
    const saved = localStorage.getItem('autoSync_world');
    return saved === null ? true : saved === 'true';
  });
  const isInitialMount = useRef(true);
  const isPullingRef = useRef(false);

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setIsSignedIn(!!user);
    });
    return () => unsubscribe();
  }, []);

  // Fetch when novel changes
  useEffect(() => {
      if (isSignedIn && currentNovelId) {
          const timer = setTimeout(() => {
              syncData('char', 'GET', true);
              syncData('rel', 'GET', true);
          }, 500);
          return () => clearTimeout(timer);
      }
  }, [currentNovelId, isSignedIn]);

  // Persist autoSync preference
  useEffect(() => {
    localStorage.setItem('autoSync_world', String(autoSync));
  }, [autoSync]);

  // AUTO SYNC LOGIC (Characters & Relationships)
  useEffect(() => {
    if (isInitialMount.current) {
      isInitialMount.current = false;
      return;
    }

    if (!autoSync || !isSignedIn || isPullingRef.current) return;

    const timer = setTimeout(() => {
    }, 2500);

    return () => clearTimeout(timer);
  }, [characters, relationships, autoSync, isSignedIn]); 

  // Dedicated Effect for Characters
  useEffect(() => {
    if (isInitialMount.current || !autoSync || !isSignedIn || isPullingRef.current) return;
    const timer = setTimeout(() => {
        syncData('char', 'POST', true);
    }, 2000);
    return () => clearTimeout(timer);
  }, [characters, autoSync, isSignedIn]);

  // Dedicated Effect for Relationships
  useEffect(() => {
    if (isInitialMount.current || !autoSync || !isSignedIn || isPullingRef.current) return;
    const timer = setTimeout(() => {
        syncData('rel', 'POST', true);
    }, 2000);
    return () => clearTimeout(timer);
  }, [relationships, autoSync, isSignedIn]);


  // --- SYNC HANDLERS ---
  const syncData = async (type: 'char' | 'rel', action: 'GET' | 'POST', silent = false) => {
    if (!isSignedIn) {
      if (!silent) {
          setSyncMessage({ type: 'error', text: 'Bạn cần đăng nhập!' });
          setShowSettings(true);
      }
      return;
    }
    if (!currentNovelId) {
      if (!silent) {
          setSyncMessage({ type: 'error', text: 'Chưa chọn truyện!' });
      }
      return;
    }
    
    if (isSyncing) return; // Prevent overlapping

    setIsSyncing(true);
    if (!silent) setSyncMessage(null);
    if (action === 'GET') isPullingRef.current = true;

    try {
      if (action === 'GET') {
        const data = await syncFirestoreData<any>(type, currentNovelId, 'GET');
        
        // CRITICAL PROTECTION: If silent pull returned empty cloud data but we have local data, do not overwrite!
        if (silent && data.length === 0) {
          if (type === 'char' && charsRef.current.length > 0) {
             const hasLocal = charsRef.current.some(c => c.novelId === currentNovelId);
             if (hasLocal) {
                console.log("Preserving local characters since cloud is empty");
                if (autoSync) {
                   setTimeout(() => { syncData('char', 'POST', true); }, 1000);
                }
                return;
             }
          } else if (type === 'rel' && relsRef.current.length > 0) {
             const hasLocal = relsRef.current.some(r => r.novelId === currentNovelId);
             if (hasLocal) {
                console.log("Preserving local relationships since cloud is empty");
                if (autoSync) {
                   setTimeout(() => { syncData('rel', 'POST', true); }, 1000);
                }
                return;
             }
          }
        }

        let mergedData = data;
        if (type === 'char') {
          if (charsRef.current.length > 0) {
            const cloudIds = new Set(data.map((c: any) => c.id));
            const localNew = charsRef.current.filter((c: any) => c.novelId === currentNovelId && !cloudIds.has(c.id));
            mergedData = [...data, ...localNew];
          }
          onUpdateCharacters(mergedData as Character[]);
        } else {
          if (relsRef.current.length > 0) {
            const cloudIds = new Set(data.map((r: any) => r.id));
            const localNew = relsRef.current.filter((r: any) => r.novelId === currentNovelId && !cloudIds.has(r.id));
            mergedData = [...data, ...localNew];
          }
          onUpdateRelationships(mergedData as Relationship[]);
        }
        setSyncMessage({ type: 'success', text: `Đã tải ${mergedData.length} mục!` });
      } else {
        if (type === 'char') {
          const toPush = charsRef.current.filter(c => !c.novelId || c.novelId === currentNovelId).map(c => ({ ...c, novelId: currentNovelId }));
          await syncFirestoreData<Character>(type, currentNovelId, 'POST', toPush);
        } else {
          const toPush = relsRef.current.filter(r => !r.novelId || r.novelId === currentNovelId).map(r => ({ ...r, novelId: currentNovelId }));
          await syncFirestoreData<Relationship>(type, currentNovelId, 'POST', toPush);
        }
        if (!silent) setSyncMessage({ type: 'success', text: 'Đã lưu lên mây!' });
        else setSyncMessage({ type: 'success', text: `Đã tự động lưu (${type === 'char' ? 'NV' : 'QH'})` });
      }
    } catch (e: any) {
      setSyncMessage({ type: 'error', text: e.message || "Lỗi đồng bộ" });
    } finally {
      setIsSyncing(false);
      if (action === 'GET') {
          setTimeout(() => { isPullingRef.current = false; }, 500);
      }
      if (silent) setTimeout(() => setSyncMessage(null), 2000);
      else setTimeout(() => setSyncMessage(null), 5000);
    }
  };

  // --- CHARACTER HANDLERS ---
  const handleAddChar = () => {
    const newChar: Character = {
      id: Date.now().toString(),
      novelId: currentNovelId || '',
      chineseName: '',
      vietName: '',
      pronouns: '',
      description: ''
    };
    onUpdateCharacters([...characters, newChar]);
  };

  const updateChar = (id: string, field: keyof Character, value: string) => {
    onUpdateCharacters(characters.map(c => c.id === id ? { ...c, [field]: value } : c));
  };

  const deleteChar = (id: string) => {
    deleteFirestoreDoc('char', id);
    onUpdateCharacters(characters.filter(c => c.id !== id));
  };

  // --- RELATIONSHIP HANDLERS ---
  const handleAddRel = () => {
    const newRel: Relationship = {
      id: Date.now().toString(),
      novelId: currentNovelId || '',
      charA: '',
      charB: '',
      callAtoB: '',
      callBtoA: '',
      note: ''
    };
    onUpdateRelationships([...relationships, newRel]);
  };

  const updateRel = (id: string, field: keyof Relationship, value: string) => {
    onUpdateRelationships(relationships.map(r => r.id === id ? { ...r, [field]: value } : r));
  };

  const deleteRel = (id: string) => {
    deleteFirestoreDoc('rel', id);
    onUpdateRelationships(relationships.filter(r => r.id !== id));
  };

  // --- RENDER HELPERS ---
  
  // Group relationships by Character A
  const getGroupedRelationships = () => {
    const sorted = [...relationships].sort((a, b) => a.charA.localeCompare(b.charA));
    const groups: { [key: string]: Relationship[] } = {};
    
    sorted.forEach(rel => {
      const key = rel.charA.trim() || '(Chưa nhập tên)';
      if (!groups[key]) groups[key] = [];
      groups[key].push(rel);
    });

    return groups;
  };

  const filteredCharacters = characters.filter(c => 
    c.chineseName.toLowerCase().includes(searchTerm.toLowerCase()) || 
    c.vietName.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex flex-col h-full bg-[#EFE5D9] border-l border-[#D7CCC8] w-[360px] shrink-0 transition-all">
      
      {/* Tab Header */}
      <div className="flex border-b border-[#D7CCC8] bg-[#D7CCC8]/30">
        <button
          onClick={() => setActiveTab('char')}
          className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors ${
            activeTab === 'char' ? 'bg-white text-[#3E2723] border-b-2 border-[#3E2723]' : 'text-[#8D6E63] hover:bg-[#D7CCC8]'
          }`}
        >
          <Users size={12} /> Nhân Vật
        </button>
        <button
          onClick={() => setActiveTab('rel')}
          className={`flex-1 py-1.5 text-[10px] font-bold uppercase tracking-wider flex items-center justify-center gap-2 transition-colors ${
            activeTab === 'rel' ? 'bg-white text-[#5D4037] border-b-2 border-[#5D4037]' : 'text-[#8D6E63] hover:bg-[#D7CCC8]'
          }`}
        >
          <Network size={12} /> Quan Hệ
        </button>
      </div>
      
      {/* Universal Settings/Message Bar */}
      {(activeTab === 'char' || activeTab === 'rel') && (
        <div className="bg-[#EFEBE9] border-b border-[#D7CCC8]">
           {showSettings ? (
             <div className="p-2 animate-in slide-in-from-top-2">
                 {/* Auto Sync Toggle */}
                 <div className="flex items-center justify-between bg-white border border-[#D7CCC8] p-1.5 rounded">
                   <div className="flex items-center gap-2">
                     <RefreshCw size={12} className={autoSync ? "text-green-600 animate-spin-slow" : "text-[#A1887F]"} />
                     <span className="text-[10px] font-medium text-[#5D4037]">Tự động đồng bộ</span>
                   </div>
                   <button 
                     onClick={() => setAutoSync(!autoSync)}
                     className={`w-7 h-3.5 rounded-full relative transition-colors ${autoSync ? 'bg-green-500' : 'bg-[#D7CCC8]'}`}
                   >
                     <div className={`absolute top-0.5 w-2.5 h-2.5 bg-white rounded-full transition-all ${autoSync ? 'left-4' : 'left-0.5'}`} style={{left: autoSync ? '16px' : '2px'}} />
                   </button>
                 </div>
                 {!isSignedIn && <div className="text-[10px] text-red-500 mt-1">Đăng nhập để đồng bộ dữ liệu.</div>}
                 
                 {/* BULK IMPORT */}
                 <div className="mt-2 pt-2 border-t border-[#D7CCC8]">
                   <label className="block text-[10px] font-bold text-[#5D4037] mb-1">
                     Import {activeTab === 'char' ? 'Nhân vật' : 'Quan hệ'} (từ Excel)
                   </label>
                   <textarea
                     value={bulkText}
                     onChange={(e) => setBulkText(e.target.value)}
                     placeholder={activeTab === 'char' 
                       ? "Trung \t Việt \t Ngôi xưng \t Chi tiết" 
                       : "NV A \t NV B \t A gọi B \t B gọi A \t Ghi chú"}
                     className="w-full h-16 text-[10px] p-1 border border-[#D7CCC8] rounded bg-white outline-none resize-none mb-1"
                   />
                   <button 
                     onClick={() => {
                       if (!bulkText.trim() || !currentNovelId) return;
                       const lines = bulkText.split('\n');
                       const getParts = (line: string) => {
                          let p = line.split('\t');
                          if (p.length < 2) p = line.split('|');
                          if (p.length < 2) p = line.split(' = ');
                          if (p.length < 2) p = line.split(/\s{2,}/);
                          if (p.length < 2) {
                              const match = line.match(/^(\S+)\s+(.+)$/);
                              if (match) p = [match[1], match[2]];
                          }
                          return p;
                       };
                       if (activeTab === 'char') {
                         const newItems: Character[] = [];
                         lines.forEach(line => {
                           if (!line.trim()) return;
                           const p = getParts(line);
                           if (p.length >= 2) {
                             newItems.push({
                               id: Date.now().toString() + Math.random().toString(),
                               novelId: currentNovelId,
                               chineseName: p[0]?.trim() || '',
                               vietName: p[1]?.trim() || '',
                               pronouns: p[2]?.trim() || '',
                               description: p.slice(3).join(' ').trim()
                             });
                           }
                         });
                         onUpdateCharacters([...characters, ...newItems]);
                         setSyncMessage({ type: 'success', text: `Đã thêm ${newItems.length} NV!` });
                       } else {
                         const newItems: Relationship[] = [];
                         lines.forEach(line => {
                           if (!line.trim()) return;
                           const p = getParts(line);
                           if (p.length >= 2) {
                             newItems.push({
                               id: Date.now().toString() + Math.random().toString(),
                               novelId: currentNovelId,
                               charA: p[0]?.trim() || '',
                               charB: p[1]?.trim() || '',
                               callAtoB: p[2]?.trim() || '',
                               callBtoA: p[3]?.trim() || '',
                               note: p.slice(4).join(' ').trim()
                             });
                           }
                         });
                         onUpdateRelationships([...relationships, ...newItems]);
                         setSyncMessage({ type: 'success', text: `Đã thêm ${newItems.length} QH!` });
                       }
                       setBulkText('');
                       setTimeout(() => setSyncMessage(null), 3000);
                     }}
                     className="w-full bg-[#5D4037] text-white text-[10px] py-1 rounded hover:bg-[#4E342E] transition-colors"
                   >
                     Thêm vào
                   </button>
                 </div>
             </div>
           ) : null}

           {syncMessage && (
               <div className={`px-2 py-0.5 text-[10px] font-bold text-center ${syncMessage.type === 'success' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'} transition-all`}>
                  {syncMessage.text}
               </div>
           )}
        </div>
      )}

      {/* Content */}
      <div className="flex-1 overflow-hidden bg-[#F5E6D3] flex flex-col">
        
        {/* --- CHARACTER TAB --- */}
        {activeTab === 'char' && (
          <>
            <div className="p-1 border-b border-[#D7CCC8] bg-[#EFE5D9] flex gap-2 sticky top-0 z-20 items-center">
               <div className="relative flex-1">
                  <Search size={12} className="absolute left-2 top-1/2 -translate-y-1/2 text-[#A1887F]" />
                  <input 
                    type="text" 
                    placeholder="Tìm nhân vật..." 
                    value={searchTerm}
                    onChange={(e) => setSearchTerm(e.target.value)}
                    className="w-full pl-7 pr-2 py-1 text-[10px] bg-white border border-[#D7CCC8] rounded focus:ring-1 focus:ring-[#8D6E63] outline-none h-6"
                  />
               </div>
               
               {/* Sync Tools */}
               <div className="flex items-center gap-0.5 border-l border-[#D7CCC8] pl-1">
                  <button onClick={() => setShowSettings(!showSettings)} className={`p-1 rounded hover:bg-[#D7CCC8] text-[#A1887F]`} title="Cài đặt đồng bộ">
                     <Settings size={14} />
                  </button>
                  <button onClick={() => syncData('char', 'GET')} disabled={isSyncing || !isSignedIn} className="p-1 text-blue-600 hover:bg-blue-50 rounded disabled:opacity-50" title="Tải từ Cloud">
                     {isSyncing ? <Loader2 className="animate-spin" size={14} /> : <Download size={14} />}
                  </button>
                  <button onClick={() => syncData('char', 'POST')} disabled={isSyncing || !isSignedIn} className="p-1 text-green-600 hover:bg-green-50 rounded disabled:opacity-50" title="Lưu lên Cloud">
                     {isSyncing ? <Loader2 className="animate-spin" size={14} /> : <Upload size={14} />}
                  </button>
               </div>

               <button onClick={handleAddChar} className="bg-[#3E2723] text-white px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1 hover:bg-[#4E342E] ml-0.5 shadow-sm h-6">
                  <Plus size={10} />
               </button>
            </div>
            
            <div className="flex-1 overflow-auto">
              <table className="w-full text-left border-collapse">
                <thead className="bg-[#D7CCC8] sticky top-0 z-10 text-[9px] font-bold text-[#3E2723] uppercase">
                  <tr>
                    <th className="py-0.5 px-1 w-[20%] border-r border-[#BCAAA4]">Trung</th>
                    <th className="py-0.5 px-1 w-[25%] border-r border-[#BCAAA4]">Tên Việt</th>
                    <th className="py-0.5 px-1 w-[15%] border-r border-[#BCAAA4]">Ngôi 3</th>
                    <th className="py-0.5 px-1 w-[40%]">Chi tiết</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-[#EFEBE9]">
                  {filteredCharacters.map(char => (
                    <tr key={char.id} className="hover:bg-[#FFF8E1] group">
                      <td className="p-0 border-r border-[#EFEBE9] align-top">
                        <input type="text" value={char.chineseName} onChange={(e) => updateChar(char.id, 'chineseName', e.target.value)} className="w-full text-[10px] font-serif-sc px-0.5 py-0.5 outline-none bg-transparent leading-tight h-full min-h-[20px]" placeholder="周随" />
                      </td>
                      <td className="p-0 border-r border-[#EFEBE9] align-top">
                        <input type="text" value={char.vietName} onChange={(e) => updateChar(char.id, 'vietName', e.target.value)} className="w-full text-[10px] font-bold text-[#3E2723] px-0.5 py-0.5 outline-none bg-transparent leading-tight h-full min-h-[20px]" placeholder="Chu Tùy" />
                      </td>
                      <td className="p-0 border-r border-[#EFEBE9] align-top">
                        <input type="text" value={char.pronouns} onChange={(e) => updateChar(char.id, 'pronouns', e.target.value)} className="w-full text-[10px] px-0.5 py-0.5 outline-none bg-transparent leading-tight h-full min-h-[20px]" placeholder="cậu" />
                      </td>
                      <td className="p-0 align-top relative">
                        <textarea 
                          value={char.description} 
                          onChange={(e) => {
                            updateChar(char.id, 'description', e.target.value);
                            e.target.style.height = 'auto';
                            e.target.style.height = e.target.scrollHeight + 'px';
                          }}
                          ref={(el) => {
                            if (el) {
                              el.style.height = 'auto';
                              el.style.height = el.scrollHeight + 'px';
                            }
                          }}
                          className="w-full text-[10px] px-0.5 py-0.5 outline-none bg-transparent resize-none overflow-hidden min-h-[20px] leading-tight" 
                          placeholder="..." 
                          rows={1} 
                        />
                        {/* Delete Button */}
                        <button 
                           onClick={() => deleteChar(char.id)} 
                           className="absolute top-0 right-0 p-0.5 bg-white border border-[#D7CCC8] shadow-sm rounded text-[#BCAAA4] hover:text-[#D32F2F] opacity-0 group-hover:opacity-100 transition-all z-10"
                           title="Xóa nhân vật"
                        >
                           <Trash2 size={10} />
                        </button>
                      </td>
                    </tr>
                  ))}
                  {filteredCharacters.length === 0 && (
                     <tr><td colSpan={4} className="py-4 text-center text-[10px] text-[#BCAAA4]">Chưa có nhân vật</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}

        {/* --- RELATIONSHIP TAB --- */}
        {activeTab === 'rel' && (
          <>
            <div className="p-1 border-b border-[#D7CCC8] bg-[#EFE5D9] flex justify-end sticky top-0 z-20 items-center gap-1">
               {/* Sync Tools */}
               <div className="flex items-center gap-0.5 border-r border-[#D7CCC8] pr-1 mr-0.5">
                  <button onClick={() => setShowSettings(!showSettings)} className={`p-1 rounded hover:bg-[#D7CCC8] text-[#A1887F]`} title="Cài đặt đồng bộ">
                     <Settings size={14} />
                  </button>
                  <button onClick={() => syncData('rel', 'GET')} disabled={isSyncing || !isSignedIn} className="p-1 text-blue-600 hover:bg-blue-50 rounded disabled:opacity-50" title="Tải từ Cloud">
                     {isSyncing ? <Loader2 className="animate-spin" size={14} /> : <Download size={14} />}
                  </button>
                  <button onClick={() => syncData('rel', 'POST')} disabled={isSyncing || !isSignedIn} className="p-1 text-green-600 hover:bg-green-50 rounded disabled:opacity-50" title="Lưu lên Cloud">
                     {isSyncing ? <Loader2 className="animate-spin" size={14} /> : <Upload size={14} />}
                  </button>
               </div>

               <button onClick={handleAddRel} className="bg-[#5D4037] text-white px-2 py-1 rounded text-[10px] font-bold flex items-center gap-1 hover:bg-[#795548] shadow-sm h-6">
                  <Plus size={10} /> Thêm QH
               </button>
            </div>
            <div className="flex-1 overflow-auto">
               <table className="w-full text-left border-collapse">
                <thead className="bg-[#D7CCC8] sticky top-0 z-10 text-[9px] font-bold text-[#3E2723] uppercase">
                  <tr>
                    <th className="py-0.5 px-1 w-[20%] border-r border-[#BCAAA4] text-center">A</th>
                    <th className="py-0.5 px-1 w-[20%] border-r border-[#BCAAA4]">B</th>
                    <th className="py-0.5 px-1 w-[25%] border-r border-[#BCAAA4] text-center">Xưng hô</th>
                    <th className="py-0.5 px-1 w-[35%]">Note</th>
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-[#EFEBE9]">
                  {Object.entries(getGroupedRelationships()).map(([charA, rels]) => (
                    <React.Fragment key={charA}>
                       {rels.map((rel, index) => (
                         <tr key={rel.id} className="hover:bg-[#FFF8E1] group border-b border-[#EFEBE9]">
                           {/* Rowspan logic for Char A */}
                           {index === 0 && (
                             <td className="p-0 border-r border-[#D7CCC8] bg-[#F5E6D3] align-top text-center" rowSpan={rels.length}>
                                <textarea 
                                  value={rel.charA} 
                                  onChange={(e) => updateRel(rel.id, 'charA', e.target.value)} 
                                  className="w-full text-[10px] font-bold text-center bg-transparent outline-none placeholder:text-[#BCAAA4] text-[#3E2723] h-full min-h-[2rem] py-0.5 resize-none overflow-hidden leading-tight" 
                                  placeholder="Tên A" 
                                />
                             </td>
                           )}
                           
                           <td className="p-0 border-r border-[#EFEBE9] align-top">
                              <input type="text" value={rel.charB} onChange={(e) => updateRel(rel.id, 'charB', e.target.value)} className="w-full text-[10px] font-medium text-[#4E342E] px-0.5 py-0.5 outline-none bg-transparent leading-tight h-full min-h-[2rem]" placeholder="Tên B" />
                           </td>
                           <td className="p-0 border-r border-[#EFEBE9] align-top">
                              <div className="flex flex-col h-full w-full">
                                <div className="flex items-center border-b border-[#EFEBE9] border-dashed last:border-0 h-1/2 min-h-[16px]">
                                    <span className="text-[7px] text-[#A1887F] w-4 text-center bg-[#EFEBE9]/30 h-full flex items-center justify-center select-none">A→</span>
                                    <input type="text" value={rel.callAtoB} onChange={(e) => updateRel(rel.id, 'callAtoB', e.target.value)} className="flex-1 text-[9px] text-[#5D4037] px-0.5 outline-none bg-transparent h-full leading-none" placeholder="tôi-anh" />
                                </div>
                                <div className="flex items-center h-1/2 min-h-[16px]">
                                    <span className="text-[7px] text-[#A1887F] w-4 text-center bg-[#EFEBE9]/30 h-full flex items-center justify-center select-none">B→</span>
                                    <input type="text" value={rel.callBtoA} onChange={(e) => updateRel(rel.id, 'callBtoA', e.target.value)} className="flex-1 text-[9px] text-[#795548] px-0.5 outline-none bg-transparent h-full leading-none" placeholder="tôi-cậu" />
                                </div>
                              </div>
                           </td>
                           <td className="p-0 align-top relative">
                              <textarea 
                                value={rel.note} 
                                onChange={(e) => {
                                  updateRel(rel.id, 'note', e.target.value);
                                  e.target.style.height = 'auto';
                                  e.target.style.height = e.target.scrollHeight + 'px';
                                }} 
                                ref={(el) => {
                                  if (el) {
                                    el.style.height = 'auto';
                                    el.style.height = el.scrollHeight + 'px';
                                  }
                                }}
                                className="w-full text-[10px] px-0.5 py-0.5 outline-none bg-transparent resize-none overflow-hidden min-h-[2rem] leading-tight" 
                                placeholder="..." 
                                rows={1} 
                              />
                              {/* Delete Button */}
                              <button 
                                 onClick={() => deleteRel(rel.id)} 
                                 className="absolute top-0 right-0 p-0.5 bg-white border border-[#D7CCC8] shadow-sm rounded text-[#BCAAA4] hover:text-[#D32F2F] opacity-0 group-hover:opacity-100 transition-all z-10"
                                 title="Xóa quan hệ"
                              >
                                 <Trash2 size={10} />
                              </button>
                           </td>
                         </tr>
                       ))}
                    </React.Fragment>
                  ))}
                   {relationships.length === 0 && (
                     <tr><td colSpan={4} className="py-4 text-center text-[10px] text-[#BCAAA4]">Chưa có quan hệ nào</td></tr>
                  )}
                </tbody>
              </table>
            </div>
          </>
        )}
      </div>
    </div>
  );
};
