
import { CustomTerm, Chapter, VietphraseFileItem } from '../types';

// IndexedDB Service
const DB_NAME = 'ChiVietDB';
const DB_VERSION = 5;
const STORE_SETTINGS = 'settings';
const STORE_CUSTOM_TERMS = 'custom_terms';
const STORE_CHAPTERS = 'chapters';

export const KEY_VIETPHRASE = 'vietphrase_data';
export const KEY_VIETPHRASE_FILES = 'vietphrase_files';
export const KEY_CURRENT_NOVEL = 'current_novel_id';

const dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
    if (typeof window === 'undefined' || !window.indexedDB) {
        reject("IndexedDB not supported");
        return;
    }
    const request = window.indexedDB.open(DB_NAME, DB_VERSION);
    
    request.onerror = () => {
        console.error("DB Open Error", request.error);
        reject(request.error);
    };
    
    request.onsuccess = () => resolve(request.result);
    
    request.onupgradeneeded = (event) => {
        const db = (event.target as IDBOpenDBRequest).result;
        if (!db.objectStoreNames.contains(STORE_SETTINGS)) {
            db.createObjectStore(STORE_SETTINGS);
        }
        if (!db.objectStoreNames.contains(STORE_CUSTOM_TERMS)) {
            db.createObjectStore(STORE_CUSTOM_TERMS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_CHAPTERS)) {
            db.createObjectStore(STORE_CHAPTERS, { keyPath: 'id' });
        }
    };
});

export const db = {
    async getVietphraseFiles(): Promise<VietphraseFileItem[]> {
        try {
            const db = await dbPromise;
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_SETTINGS, 'readonly');
                const store = tx.objectStore(STORE_SETTINGS);
                const req = store.get(KEY_VIETPHRASE_FILES);
                req.onsuccess = () => resolve(Array.isArray(req.result) ? req.result : []);
                req.onerror = () => reject(req.error);
            });
        } catch (e) {
            console.error("DB Get Vietphrase Files Error", e);
            return [];
        }
    },

    async saveVietphraseFiles(files: VietphraseFileItem[]): Promise<void> {
        try {
            const db = await dbPromise;
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_SETTINGS, 'readwrite');
                const store = tx.objectStore(STORE_SETTINGS);
                const req = store.put(files, KEY_VIETPHRASE_FILES);
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
            });
        } catch (e) {
            console.error("DB Save Vietphrase Files Error", e);
        }
    },

    async getVietphrase(): Promise<string | null> {
        try {
            const db = await dbPromise;
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_SETTINGS, 'readonly');
                const store = tx.objectStore(STORE_SETTINGS);
                const req = store.get(KEY_VIETPHRASE);
                req.onsuccess = () => resolve(req.result);
                req.onerror = () => reject(req.error);
            });
        } catch (e) {
            console.error("DB Get Vietphrase Error", e);
            return null;
        }
    },

    async saveVietphrase(content: string): Promise<void> {
        try {
            const db = await dbPromise;
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_SETTINGS, 'readwrite');
                const store = tx.objectStore(STORE_SETTINGS);
                const req = store.put(content, KEY_VIETPHRASE);
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
            });
        } catch (e) {
            console.error("DB Save Vietphrase Error", e);
        }
    },

    async getCurrentNovelId(): Promise<string | null> {
        try {
            const db = await dbPromise;
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_SETTINGS, 'readonly');
                const store = tx.objectStore(STORE_SETTINGS);
                const req = store.get(KEY_CURRENT_NOVEL);
                req.onsuccess = () => resolve(req.result || null);
                req.onerror = () => reject(req.error);
            });
        } catch (e) {
            console.error("DB Get Current Novel ID Error", e);
            return null;
        }
    },

    async saveCurrentNovelId(novelId: string): Promise<void> {
        try {
            const db = await dbPromise;
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_SETTINGS, 'readwrite');
                const store = tx.objectStore(STORE_SETTINGS);
                const req = store.put(novelId, KEY_CURRENT_NOVEL);
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
            });
        } catch (e) {
            console.error("DB Save Current Novel ID Error", e);
        }
    },

    async getAllCustomTerms(): Promise<CustomTerm[]> {
        try {
            const db = await dbPromise;
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_CUSTOM_TERMS, 'readonly');
                const store = tx.objectStore(STORE_CUSTOM_TERMS);
                const req = store.getAll();
                req.onsuccess = () => resolve(req.result || []);
                req.onerror = () => reject(req.error);
            });
        } catch (e) {
            console.error("DB Get Terms Error", e);
            return [];
        }
    },

    async saveCustomTerm(term: CustomTerm): Promise<void> {
        try {
            const db = await dbPromise;
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_CUSTOM_TERMS, 'readwrite');
                const store = tx.objectStore(STORE_CUSTOM_TERMS);
                const req = store.put(term);
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
            });
        } catch (e) {
            console.error("DB Save Term Error", e);
        }
    },

    async deleteCustomTerm(id: string): Promise<void> {
        try {
            const db = await dbPromise;
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_CUSTOM_TERMS, 'readwrite');
                const store = tx.objectStore(STORE_CUSTOM_TERMS);
                const req = store.delete(id);
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
            });
        } catch (e) {
            console.error("DB Delete Term Error", e);
        }
    },

    async bulkSaveCustomTerms(terms: CustomTerm[]): Promise<void> {
        try {
            const db = await dbPromise;
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_CUSTOM_TERMS, 'readwrite');
                const store = tx.objectStore(STORE_CUSTOM_TERMS);
                
                tx.oncomplete = () => resolve();
                tx.onerror = () => reject(tx.error);
                tx.onabort = () => reject(tx.error);

                const newTermIds = new Set(terms.map(t => t.id));
                // Target novel IDs present in incoming terms
                const targetNovelIds = new Set(terms.map(t => t.novelId || ''));

                const getAllReq = store.getAll();
                getAllReq.onsuccess = () => {
                    const existingInDb: CustomTerm[] = getAllReq.result || [];
                    // Remove items from DB ONLY IF they belong to one of the target novelIds AND are no longer in the incoming terms
                    existingInDb.forEach(dbTerm => {
                        const termNovelId = dbTerm.novelId || '';
                        if (targetNovelIds.has(termNovelId) && !newTermIds.has(dbTerm.id)) {
                            store.delete(dbTerm.id);
                        }
                    });

                    // Put/Update all incoming terms
                    terms.forEach(term => {
                        store.put(term);
                    });
                };

                getAllReq.onerror = () => {
                    // Fallback to direct put if getAll fails
                    terms.forEach(term => {
                        store.put(term);
                    });
                };
            });
        } catch (e) {
            console.error("DB Bulk Save Error", e);
        }
    },

    async getAllChapters(): Promise<Chapter[]> {
        try {
            const db = await dbPromise;
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_CHAPTERS, 'readonly');
                const store = tx.objectStore(STORE_CHAPTERS);
                const req = store.getAll();
                req.onsuccess = () => resolve(req.result || []);
                req.onerror = () => reject(req.error);
            });
        } catch (e) {
            console.error("DB Get Chapters Error", e);
            return [];
        }
    },

    async saveChapter(chapter: Chapter): Promise<void> {
        try {
            const db = await dbPromise;
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_CHAPTERS, 'readwrite');
                const store = tx.objectStore(STORE_CHAPTERS);
                const req = store.put(chapter);
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
            });
        } catch (e) {
            console.error("DB Save Chapter Error", e);
        }
    },

    async deleteChapter(id: string): Promise<void> {
        try {
            const db = await dbPromise;
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_CHAPTERS, 'readwrite');
                const store = tx.objectStore(STORE_CHAPTERS);
                const req = store.delete(id);
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
            });
        } catch (e) {
            console.error("DB Delete Chapter Error", e);
        }
    },

    async clearAllChapters(): Promise<void> {
        try {
            const db = await dbPromise;
            return new Promise((resolve, reject) => {
                const tx = db.transaction(STORE_CHAPTERS, 'readwrite');
                const store = tx.objectStore(STORE_CHAPTERS);
                const req = store.clear();
                req.onsuccess = () => resolve();
                req.onerror = () => reject(req.error);
            });
        } catch (e) {
            console.error("DB Clear Chapters Error", e);
        }
    }
};
