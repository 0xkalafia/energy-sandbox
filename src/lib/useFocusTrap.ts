import { useEffect, useRef } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  '[tabindex]:not([tabindex="-1"])',
].join(",");

/**
 * Keeps keyboard focus inside an open overlay, and hands it back on close.
 *
 * The mobile drawer is a hand-rolled overlay rather than a Radix dialog, so it
 * came with none of this: opening it left focus on the button behind, Tab
 * walked straight out into the page underneath — which is covered by a
 * backdrop and unusable — and Escape did nothing, because nothing was
 * listening for it. A sighted mouse user never notices; a keyboard user is
 * stuck tabbing through a page they can't see or click.
 *
 * Returns a ref to put on the overlay's container.
 */
export function useFocusTrap<T extends HTMLElement>(
  active: boolean,
  onClose: () => void,
) {
  const ref = useRef<T>(null);
  // onClose is usually an inline arrow, so a new identity every render. Held
  // in a ref so the effect doesn't tear down and re-run — which would yank
  // focus back to the first control on every keystroke.
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  });

  useEffect(() => {
    if (!active) return;
    const node = ref.current;
    if (!node) return;

    const restoreTo = document.activeElement as HTMLElement | null;
    const focusable = () =>
      [...node.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => {
        const r = el.getBoundingClientRect();
        return r.width > 0 && r.height > 0;
      });

    // Move focus in, so the first Tab continues from inside rather than from
    // wherever the opening button happened to be.
    const first = focusable()[0];
    if (first) first.focus();
    else node.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        close.current();
        return;
      }
      if (e.key !== "Tab") return;
      const list = focusable();
      if (list.length === 0) return;
      const firstEl = list[0];
      const lastEl = list[list.length - 1];
      const on = document.activeElement;
      if (e.shiftKey && (on === firstEl || !node.contains(on))) {
        e.preventDefault();
        lastEl.focus();
      } else if (!e.shiftKey && (on === lastEl || !node.contains(on))) {
        e.preventDefault();
        firstEl.focus();
      }
    };

    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("keydown", onKey);
      // Back where it came from, so closing doesn't dump you at the top.
      restoreTo?.focus?.();
    };
  }, [active]);

  return ref;
}
