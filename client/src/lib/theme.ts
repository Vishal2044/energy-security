import { useLayoutEffect, useState } from 'react';

/** Retains each shell's existing preference key while applying one shared theme. */
export function useThemePreference(storageKey: 'dg-admin-dark' | 'dg-guard-dark') {
  const [dark, setDark] = useState(() => localStorage.getItem(storageKey) === '1');
  useLayoutEffect(() => {
    document.documentElement.dataset.theme = dark ? 'dark' : 'light';
    localStorage.setItem(storageKey, dark ? '1' : '0');
    const primary = getComputedStyle(document.documentElement).getPropertyValue('--primary').trim();
    document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')?.setAttribute('content', primary);
  }, [dark, storageKey]);
  return [dark, setDark] as const;
}
