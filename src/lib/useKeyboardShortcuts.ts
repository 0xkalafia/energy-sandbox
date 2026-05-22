import { useEffect } from "react";

interface Handlers {
  onCommandK: () => void;
  onTab: (index: number) => void;
  onReset: () => void;
  onShare: () => void;
  onTheme: () => void;
}

const TAB_KEYS = ["1", "2", "3", "4", "5", "6", "7"];

/**
 * Global keyboard shortcuts. Ignored when typing in an input/textarea or
 * inside a contenteditable region.
 */
export function useKeyboardShortcuts(handlers: Handlers) {
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isTyping =
        target &&
        (target.tagName === "INPUT" ||
          target.tagName === "TEXTAREA" ||
          target.isContentEditable);

      // ⌘K / Ctrl+K — always (even when typing in non-cmdk input)
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        e.preventDefault();
        handlers.onCommandK();
        return;
      }

      if (isTyping) return;

      // Plain shortcuts — only when not focused on input
      if (TAB_KEYS.includes(e.key)) {
        e.preventDefault();
        handlers.onTab(parseInt(e.key, 10) - 1);
        return;
      }
      if (e.key.toLowerCase() === "r" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        handlers.onReset();
        return;
      }
      if (e.key.toLowerCase() === "s" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        handlers.onShare();
        return;
      }
      if (e.key.toLowerCase() === "t" && !e.metaKey && !e.ctrlKey) {
        e.preventDefault();
        handlers.onTheme();
        return;
      }
    };

    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [handlers]);
}
