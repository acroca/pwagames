import { load, save } from './storage';
import { ES } from './es';

export type Lang = 'en' | 'es';
export const LANGS: { id: Lang; label: string }[] = [
  { id: 'en', label: 'English' },
  { id: 'es', label: 'Español' },
];

const LANG_KEY = 'lang';
const listeners: (() => void)[] = [];

function detect(): Lang {
  const saved = load<Lang>(LANG_KEY);
  if (saved === 'en' || saved === 'es') return saved;
  const prefs = navigator.languages?.length ? navigator.languages : [navigator.language];
  for (const p of prefs) {
    const base = p?.toLowerCase().split('-')[0];
    if (base === 'es') return 'es';
    if (base === 'en') return 'en';
  }
  return 'en';
}

let current: Lang = detect();
if (typeof document !== 'undefined') document.documentElement.lang = current;

export const lang = (): Lang => current;

export function setLang(next: Lang) {
  if (next === current) return;
  current = next;
  save(LANG_KEY, next);
  document.documentElement.lang = next;
  applyStatic();
  listeners.forEach((fn) => fn());
}

export function onLangChange(fn: () => void) {
  listeners.push(fn);
}

/**
 * Translates an English source string. `{name}` placeholders are filled from
 * `params`. Unknown strings fall back to the English text.
 */
export function t(text: string, params?: Record<string, string | number>): string {
  const out = current === 'es' ? (ES[text] ?? text) : text;
  return params ? out.replace(/\{(\w+)\}/g, (_, k: string) => String(params[k] ?? '')) : out;
}

/** Translates elements marked with data-i18n (text) and data-i18n-label (aria-label). */
export function applyStatic() {
  document.querySelectorAll<HTMLElement>('[data-i18n]').forEach((node) => {
    node.textContent = t(node.dataset.i18n!);
  });
  document.querySelectorAll<HTMLElement>('[data-i18n-label]').forEach((node) => {
    node.setAttribute('aria-label', t(node.dataset.i18nLabel!));
  });
  document.querySelectorAll<HTMLMetaElement>('meta[data-i18n-content]').forEach((node) => {
    node.content = t(node.dataset.i18nContent!);
  });
}
