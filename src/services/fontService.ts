export interface FontOption {
  id: string;
  name: string;
  family: string;
}

export const AVAILABLE_FONTS: FontOption[] = [
  {
    id: 'system',
    name: 'Mặc định (Hệ thống)',
    family: 'ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
  },
  {
    id: 'roboto',
    name: 'Roboto',
    family: "'Roboto', sans-serif"
  },
  {
    id: 'arial',
    name: 'Arial',
    family: "Arial, Helvetica, sans-serif"
  },
  {
    id: 'times-new-roman',
    name: 'Times New Roman',
    family: "'Times New Roman', 'Noto Serif', Times, serif"
  },
  {
    id: 'noto-serif',
    name: 'Noto Serif',
    family: "'Noto Serif', serif"
  },
  {
    id: 'noto-sans',
    name: 'Noto Sans',
    family: "'Noto Sans', sans-serif"
  },
  {
    id: 'garamond',
    name: 'Garamond',
    family: "'EB Garamond', Garamond, 'Noto Serif', 'Times New Roman', serif"
  },
  {
    id: 'alegreya',
    name: 'Alegreya',
    family: "'Alegreya', 'Noto Serif', serif"
  },
  {
    id: 'mali',
    name: 'Mali',
    family: "'Mali', cursive"
  },
  {
    id: 'dosis',
    name: 'Dosis',
    family: "'Dosis', sans-serif"
  }
];

const STORAGE_KEY = 'app_selected_font_id';

export function getStoredFontId(): string {
  try {
    return localStorage.getItem(STORAGE_KEY) || 'times-new-roman';
  } catch {
    return 'times-new-roman';
  }
}

export function applyFont(fontId: string): void {
  const font = AVAILABLE_FONTS.find(f => f.id === fontId) || AVAILABLE_FONTS[0];
  try {
    localStorage.setItem(STORAGE_KEY, font.id);
  } catch (e) {
    console.warn('Could not save font to localStorage', e);
  }
  document.documentElement.style.setProperty('--app-font', font.family);
  document.documentElement.style.setProperty('--font-sans', font.family);
  window.dispatchEvent(new CustomEvent('app_font_changed', { detail: { fontId: font.id } }));
}

export function initFont(): void {
  const currentId = getStoredFontId();
  applyFont(currentId);
  const currentSize = getStoredFontSize();
  applyFontSize(currentSize);
}

const FONT_SIZE_STORAGE_KEY = 'app_selected_font_size';

export function getStoredFontSize(): number {
  try {
    const saved = localStorage.getItem(FONT_SIZE_STORAGE_KEY);
    if (saved) {
      const parsed = parseInt(saved, 10);
      if (!isNaN(parsed) && parsed >= 8 && parsed <= 72) return parsed;
    }
  } catch {}
  return 11;
}

export function applyFontSize(size: number): void {
  const clamped = Math.max(8, Math.min(72, size));
  try {
    localStorage.setItem(FONT_SIZE_STORAGE_KEY, clamped.toString());
  } catch (e) {
    console.warn('Could not save font size to localStorage', e);
  }
  document.documentElement.style.setProperty('--app-font-size', `${clamped}px`);
  window.dispatchEvent(new CustomEvent('app_font_size_changed', { detail: { fontSize: clamped } }));
}
