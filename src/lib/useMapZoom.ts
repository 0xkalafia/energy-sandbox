import { useCallback, useRef, useState } from "react";

/**
 * Pan and zoom over an SVG viewBox.
 *
 * The viewBox is the state — no CSS transforms — so strokes, labels and hit
 * targets all stay in the same coordinate system the paths are drawn in, and
 * anything sized in user units can be scaled against the current zoom rather
 * than fighting a transform matrix.
 *
 * Touch handling is the part with a real trade-off. `touch-action: none` is
 * what a map wants and it also traps the page: on a phone the map fills the
 * column, and a finger dragged across it would pan the map instead of
 * scrolling past it. So one finger is left to the page and the map answers to
 * two — the pattern embedded maps have settled on — while a mouse, which has
 * a wheel and a cursor and no such ambiguity, pans on a single drag.
 */

export interface View {
  x: number;
  y: number;
  w: number;
  h: number;
}

interface Options {
  /** The whole thing, fully zoomed out. */
  full: View;
  /** Tightest allowed zoom, as a multiple of `full`. */
  maxZoom?: number;
}

/** A pointer we are currently tracking, in client coordinates. */
interface Tracked {
  id: number;
  x: number;
  y: number;
}

/**
 * Keep a view inside its bounds, and never wider than fully zoomed out.
 *
 * Height follows width so the aspect never drifts: letting both roam free
 * lets a pinch or a clamped pan squash the country by a few percent per
 * gesture, which compounds into a noticeably wrong shape.
 */
export function clampView(v: View, full: View, maxZoom: number): View {
  const w = Math.min(full.w, Math.max(full.w / maxZoom, v.w));
  const h = w * (full.h / full.w);
  return {
    w,
    h,
    x: Math.min(full.x + full.w - w, Math.max(full.x, v.x)),
    y: Math.min(full.y + full.h - h, Math.max(full.y, v.y)),
  };
}

/**
 * Scale a view by `factor` while holding `anchor` (in view units) still.
 *
 * Anchoring is what makes a wheel or a pinch feel attached to the map: zoom
 * about the centre instead and whatever was under the cursor walks off the
 * screen.
 */
export function zoomAbout(
  v: View,
  factor: number,
  anchor: { x: number; y: number },
  full: View,
  maxZoom: number,
): View {
  const w = v.w / factor;
  const h = v.h / factor;
  // A zero-width view makes the anchor arithmetic 0/0. It cannot arise from
  // the gestures above — clampView floors the width at full/maxZoom — but this
  // is exported, and NaN coordinates would put the map somewhere no clamp can
  // recover from rather than failing visibly.
  if (!(v.w > 0) || !(v.h > 0) || !Number.isFinite(w) || !Number.isFinite(h)) {
    return clampView(full, full, maxZoom);
  }
  return clampView(
    {
      w,
      h,
      x: anchor.x - ((anchor.x - v.x) * w) / v.w,
      y: anchor.y - ((anchor.y - v.y) * h) / v.h,
    },
    full,
    maxZoom,
  );
}

export function useMapZoom({ full, maxZoom = 20 }: Options) {
  const [view, setView] = useState<View>(full);
  const svgRef = useRef<SVGSVGElement>(null);
  const pointers = useRef<Tracked[]>([]);
  /** Distance between two fingers when the pinch started. */
  const pinchStart = useRef<{ dist: number; view: View } | null>(null);
  /** How far this gesture has travelled, so a drag is not read as a click. */
  const travelled = useRef(0);

  const zoom = full.w / view.w;

  /** Client pixels → viewBox units, using the box the SVG actually occupies. */
  const toUser = useCallback(
    (clientX: number, clientY: number, v: View) => {
      const box = svgRef.current?.getBoundingClientRect();
      if (!box || box.width === 0) return { x: v.x + v.w / 2, y: v.y + v.h / 2 };
      // preserveAspectRatio is the default (meet), so the drawing is letterboxed
      // inside the element and one axis has slack. Using the element's own
      // width for both axes would drift on the other one.
      const scale = Math.min(box.width / v.w, box.height / v.h);
      const drawnW = v.w * scale;
      const drawnH = v.h * scale;
      const offX = (box.width - drawnW) / 2;
      const offY = (box.height - drawnH) / 2;
      return {
        x: v.x + (clientX - box.left - offX) / scale,
        y: v.y + (clientY - box.top - offY) / scale,
      };
    },
    [],
  );

  const clamp = useCallback(
    (v: View): View => clampView(v, full, maxZoom),
    [full, maxZoom],
  );

  /**
   * Zoom by `factor`, holding one point still.
   *
   * Anchoring matters for the wheel and for pinch: zooming about the centre
   * when the cursor is near an edge walks the thing you were looking at off
   * the screen.
   */
  const zoomBy = useCallback(
    (factor: number, anchorClient?: { x: number; y: number }) => {
      setView((v) => {
        const a = anchorClient
          ? toUser(anchorClient.x, anchorClient.y, v)
          : { x: v.x + v.w / 2, y: v.y + v.h / 2 };
        return zoomAbout(v, factor, a, full, maxZoom);
      });
    },
    [full, maxZoom, toUser],
  );

  const reset = useCallback(() => setView(full), [full]);

  const onPointerDown = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    // Only track touches in pairs; a single finger belongs to the page.
    if (e.pointerType === "touch") {
      pointers.current.push({ id: e.pointerId, x: e.clientX, y: e.clientY });
      if (pointers.current.length === 2) {
        const [a, b] = pointers.current;
        pinchStart.current = { dist: Math.hypot(a.x - b.x, a.y - b.y), view };
        travelled.current = 0;
      }
      return;
    }
    if (e.button !== 0) return;
    pointers.current = [{ id: e.pointerId, x: e.clientX, y: e.clientY }];
    travelled.current = 0;
    e.currentTarget.setPointerCapture(e.pointerId);
  }, [view]);

  const onPointerMove = useCallback(
    (e: React.PointerEvent<SVGSVGElement>) => {
      const idx = pointers.current.findIndex((p) => p.id === e.pointerId);
      if (idx < 0) return;
      const prev = pointers.current[idx];
      const dx = e.clientX - prev.x;
      const dy = e.clientY - prev.y;
      pointers.current[idx] = { id: e.pointerId, x: e.clientX, y: e.clientY };
      travelled.current += Math.hypot(dx, dy);

      const box = svgRef.current?.getBoundingClientRect();
      if (!box || box.width === 0) return;

      if (pointers.current.length === 2 && pinchStart.current) {
        const [a, b] = pointers.current;
        const dist = Math.hypot(a.x - b.x, a.y - b.y);
        const start = pinchStart.current;
        if (start.dist > 0) {
          const factor = dist / start.dist;
          const mid = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
          setView(() =>
            zoomAbout(
              start.view,
              factor,
              toUser(mid.x, mid.y, start.view),
              full,
              maxZoom,
            ),
          );
        }
        return;
      }

      if (pointers.current.length !== 1 || e.pointerType === "touch") return;
      setView((v) => {
        const scale = Math.min(box.width / v.w, box.height / v.h);
        return clamp({ ...v, x: v.x - dx / scale, y: v.y - dy / scale });
      });
    },
    [clamp, full, maxZoom, toUser],
  );

  const endPointer = useCallback((e: React.PointerEvent<SVGSVGElement>) => {
    pointers.current = pointers.current.filter((p) => p.id !== e.pointerId);
    if (pointers.current.length < 2) pinchStart.current = null;
  }, []);

  /**
   * Wheel zooms only with a modifier held.
   *
   * The map lives inside a scrolling page. A wheel that zoomed on its own
   * would swallow the scroll every time the cursor crossed it, which is the
   * single most complained-about behaviour of embedded maps.
   */
  const onWheel = useCallback(
    (e: React.WheelEvent<SVGSVGElement>) => {
      if (!e.ctrlKey && !e.metaKey) return;
      e.preventDefault();
      zoomBy(Math.exp(-e.deltaY / 300), { x: e.clientX, y: e.clientY });
    },
    [zoomBy],
  );

  /** True when the gesture that just ended moved far enough to be a drag. */
  const wasDrag = useCallback(() => travelled.current > 4, []);

  return {
    view,
    zoom,
    svgRef,
    zoomBy,
    reset,
    wasDrag,
    /** Spread onto the <svg>. */
    handlers: {
      onPointerDown,
      onPointerMove,
      onPointerUp: endPointer,
      onPointerCancel: endPointer,
      onWheel,
    },
  };
}
