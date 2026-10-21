import { useEffect } from 'react';
import { create } from 'zustand';

const KEY = 'arise.theme';
const DENSITY_KEY = 'arise.density';

function readStored(key, fallback, allowed) {
  try {
    const v = localStorage.getItem(key);
    return allowed.includes(v) ? v : fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    localStorage.setItem(key, value);
  } catch {
    /* private mode / blocked storage — preference just won't persist */
  }
}

function systemMode() {
  try {
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  } catch {
    return 'light';
  }
}

/**
 * Theme preference is 'system' | 'light' | 'dark'; `resolved` is what we render.
 * Table density lives here too since it is the same kind of per-user UI chrome.
 */
export const useThemeStore = create((set, get) => ({
  preference: readStored(KEY, 'system', ['system', 'light', 'dark']),
  resolved: readStored(KEY, 'system', ['system', 'light', 'dark']) === 'system'
    ? systemMode()
    : readStored(KEY, 'system', ['system', 'light', 'dark']),
  density: readStored(DENSITY_KEY, 'middle', ['small', 'middle', 'large']),

  setPreference: (preference) => {
    write(KEY, preference);
    set({ preference, resolved: preference === 'system' ? systemMode() : preference });
  },
  toggle: () => {
    const next = get().resolved === 'dark' ? 'light' : 'dark';
    get().setPreference(next);
  },
  setDensity: (density) => {
    write(DENSITY_KEY, density);
    set({ density });
  },
  syncSystem: () => {
    if (get().preference === 'system') set({ resolved: systemMode() });
  },
}));

/**
 * Keeps <html data-theme> in step with the store (the pre-paint CSS in
 * index.html reads it) and follows OS changes while preference is 'system'.
 */
export function useThemeEffect() {
  const resolved = useThemeStore((s) => s.resolved);
  const syncSystem = useThemeStore((s) => s.syncSystem);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', resolved);
    document.documentElement.style.colorScheme = resolved;
  }, [resolved]);

  useEffect(() => {
    const mq = window.matchMedia('(prefers-color-scheme: dark)');
    const onChange = () => syncSystem();
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [syncSystem]);

  return resolved;
}
