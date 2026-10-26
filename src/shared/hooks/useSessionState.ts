import { useEffect, useState } from "react";

/**
 * useState that survives leaving and returning to a page in the same tab
 * (e.g. opening a contract and coming back to the list). No key means plain
 * useState. Storage can be blocked; the page still works without it.
 */
export function useSessionState<T>(key: string | undefined, initial: T) {
  const [value, setValue] = useState<T>(() => {
    if (!key) return initial;
    try {
      const raw = sessionStorage.getItem(key);
      return raw === null ? initial : (JSON.parse(raw) as T);
    } catch {
      return initial;
    }
  });
  useEffect(() => {
    if (!key) return;
    try {
      sessionStorage.setItem(key, JSON.stringify(value));
    } catch {
      // storage unavailable: state just won't persist
    }
  }, [key, value]);
  return [value, setValue] as const;
}

/** The app shell's scrolling content area (AppShell marks it). */
function scrollRoot(): HTMLElement | null {
  return document.querySelector<HTMLElement>("[data-scroll-root]");
}

export function saveScroll(key: string): void {
  try {
    sessionStorage.setItem(`${key}.scroll`, String(scrollRoot()?.scrollTop ?? 0));
  } catch {
    // ignore
  }
}

export function restoreScroll(key: string): void {
  try {
    const top = Number(sessionStorage.getItem(`${key}.scroll`) ?? 0);
    const root = scrollRoot();
    if (root && top > 0) root.scrollTop = top;
  } catch {
    // ignore
  }
}
