import {
  useCallback,
  useEffect,
  useRef,
  type KeyboardEvent,
  type RefObject,
} from "react";

/**
 * One tab stop for a set of shapes, arrows to move within it.
 *
 * A map of 77 provinces cannot give each one a tab stop: that would put 77
 * stops between the controls above the map and everything after it, and
 * nobody tabs through that — they leave. The pattern is a roving tabindex,
 * where the selected element is the only tabbable one and the arrow keys move
 * both the selection and the focus.
 *
 * This exists because there were two copies and they had already drifted. The
 * nationwide map handled Home and End; the amphoe map did not, and nothing
 * caught it — the keyboard check verified each map on its own terms rather
 * than that they behave alike. One implementation is also one place to fix
 * the part that is genuinely easy to get wrong.
 *
 * Focus has to be moved in an effect, not in the handler. The next element is
 * not tabbable until React has committed the new selection, and a focus()
 * scheduled in a frame callback lands either side of that commit depending on
 * timing — measured, it silently did nothing.
 */
export function useRovingFocus<T>({
  items,
  selected,
  onSelect,
  /** How to find an element in the DOM, given its item. */
  attribute,
  key,
  container,
}: {
  items: T[];
  selected: string | null;
  onSelect: (id: string) => void;
  /** Data attribute the shapes are tagged with, e.g. "data-iso". */
  attribute: string;
  key: (item: T) => string;
  /**
   * The element to search for the shapes. Optional so a caller that has no
   * other use for a ref can take the one returned below — but the nationwide
   * map already holds one for pan and zoom, and two refs on one element is
   * how the focus lookup ends up querying an element nobody attached.
   */
  container?: RefObject<SVGSVGElement | null>;
}) {
  const ownRef = useRef<SVGSVGElement>(null);
  const containerRef = container ?? ownRef;
  /** Set only by arrow navigation, so a mouse click never steals focus. */
  const moveFocus = useRef(false);

  useEffect(() => {
    if (!moveFocus.current || !selected) return;
    moveFocus.current = false;
    containerRef.current
      ?.querySelector<SVGGElement>(`[${attribute}="${CSS.escape(selected)}"]`)
      ?.focus();
  }, [selected, attribute, containerRef]);

  /**
   * Key handler for one shape. `index` is its position in `items`, which is
   * the order the arrows walk.
   */
  const onKeyDown = useCallback(
    (e: KeyboardEvent, index: number) => {
      const id = key(items[index]);
      if (e.key === "Enter" || e.key === " ") {
        e.preventDefault();
        onSelect(id);
        return;
      }
      const step =
        e.key === "ArrowRight" || e.key === "ArrowDown"
          ? 1
          : e.key === "ArrowLeft" || e.key === "ArrowUp"
            ? -1
            : e.key === "Home"
              ? -index
              : e.key === "End"
                ? items.length - 1 - index
                : 0;
      if (!step) return;
      e.preventDefault();
      moveFocus.current = true;
      onSelect(key(items[(index + step + items.length) % items.length]));
    },
    [items, key, onSelect],
  );

  /**
   * Which shape carries the single tab stop.
   *
   * When nothing is selected the first item takes it, so the map is reachable
   * at all — the amphoe map opens with no selection and would otherwise have
   * no way in from the keyboard.
   */
  const isTabStop = useCallback(
    (index: number) =>
      selected ? key(items[index]) === selected : index === 0,
    [items, key, selected],
  );

  return { containerRef, onKeyDown, isTabStop };
}
