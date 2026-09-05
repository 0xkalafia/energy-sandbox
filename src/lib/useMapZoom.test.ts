import { describe, it, expect } from "vitest";
import { clampView, zoomAbout, type View } from "./useMapZoom";

/**
 * The map's zoom is a couple of dozen lines of arithmetic that decide where
 * the country appears, and it went out with none of it checked. Panning and
 * pinching fail in ways that look like a rendering problem — the shape squashes
 * a little, the view drifts off the coast, a pinch walks the thing you were
 * looking at out of frame — so they are easy to blame on something else.
 *
 * FULL is the real nationwide viewBox, because the aspect ratio is what most
 * of these properties are about and a square would hide it.
 */
const FULL: View = { x: 0, y: 0, w: 1000, h: 1825 };
const MAX = 20;

const zoomOf = (v: View) => FULL.w / v.w;
const inside = (v: View) =>
  v.x >= FULL.x - 1e-9 &&
  v.y >= FULL.y - 1e-9 &&
  v.x + v.w <= FULL.x + FULL.w + 1e-9 &&
  v.y + v.h <= FULL.y + FULL.h + 1e-9;

describe("clampView", () => {
  it("leaves a view that is already legal alone", () => {
    const v = { x: 100, y: 200, w: 250, h: 456.25 };
    expect(clampView(v, FULL, MAX)).toEqual(v);
  });

  it("never lets the view grow past fully zoomed out", () => {
    const c = clampView({ x: -500, y: -500, w: 5000, h: 9125 }, FULL, MAX);
    expect(c).toEqual(FULL);
  });

  it("stops at maxZoom", () => {
    const c = clampView({ x: 500, y: 900, w: 0.001, h: 0.002 }, FULL, MAX);
    expect(zoomOf(c)).toBeCloseTo(MAX, 6);
  });

  it("keeps the aspect ratio exactly, whatever height it is handed", () => {
    // Height is derived from width rather than clamped on its own. Letting
    // both roam free lets each gesture squash the country by a percent or
    // two, and it compounds.
    for (const h of [1, 500, 1825, 99999]) {
      const c = clampView({ x: 0, y: 0, w: 400, h }, FULL, MAX);
      expect(c.h / c.w).toBeCloseTo(FULL.h / FULL.w, 12);
    }
  });

  it("pushes a view that has wandered off the edge back inside", () => {
    for (const v of [
      { x: -300, y: -300, w: 200, h: 365 },
      { x: 5000, y: 5000, w: 200, h: 365 },
      { x: 900, y: 1700, w: 400, h: 730 },
    ]) {
      const c = clampView(v, FULL, MAX);
      expect(inside(c), JSON.stringify(v)).toBe(true);
    }
  });

  it("is idempotent", () => {
    // Pan and pinch both clamp on every event; a second pass that moved the
    // view again would make a held gesture creep.
    for (const v of [
      { x: -50, y: 10, w: 3000, h: 10 },
      { x: 990, y: 1820, w: 30, h: 30 },
      { x: 200, y: 400, w: 500, h: 912.5 },
    ]) {
      const once = clampView(v, FULL, MAX);
      expect(clampView(once, FULL, MAX)).toEqual(once);
    }
  });
});

describe("zoomAbout", () => {
  it("holds the anchor still, except where the edge stops it", () => {
    /*
     * The property that makes a wheel or a pinch feel attached to the map:
     * whatever is under the cursor stays under it.
     *
     * It cannot hold at the boundary, and that is not a defect. Zooming out
     * until the view is as wide as the country leaves nowhere to slide it, so
     * the clamp moves it and the anchor moves with it. Asserting otherwise
     * would be asserting that the map may leave its own frame.
     */
    const v = { x: 200, y: 400, w: 500, h: 912.5 };
    const anchor = { x: 300, y: 700 };
    for (const factor of [1.6, 1 / 1.2, 4, 0.5]) {
      const n = zoomAbout(v, factor, anchor, FULL, MAX);
      const clampedX = n.x <= FULL.x + 1e-9 || n.x + n.w >= FULL.x + FULL.w - 1e-9;
      const clampedY = n.y <= FULL.y + 1e-9 || n.y + n.h >= FULL.y + FULL.h - 1e-9;
      if (!clampedX) {
        expect((anchor.x - n.x) / n.w, `factor ${factor} x`).toBeCloseTo(
          (anchor.x - v.x) / v.w,
          6,
        );
      }
      if (!clampedY) {
        expect((anchor.y - n.y) / n.h, `factor ${factor} y`).toBeCloseTo(
          (anchor.y - v.y) / v.h,
          6,
        );
      }
    }
  });

  it("holds the anchor exactly when there is room on both axes", () => {
    // A small view well inside the country, zoomed about a point inside it:
    // nothing here can hit an edge, so the property must hold outright.
    const v = { x: 400, y: 800, w: 100, h: 182.5 };
    const anchor = { x: 450, y: 890 };
    for (const factor of [1.2, 1 / 1.2, 2]) {
      const n = zoomAbout(v, factor, anchor, FULL, MAX);
      expect((anchor.x - n.x) / n.w, `factor ${factor}`).toBeCloseTo(
        (anchor.x - v.x) / v.w,
        9,
      );
      expect((anchor.y - n.y) / n.h, `factor ${factor}`).toBeCloseTo(
        (anchor.y - v.y) / v.h,
        9,
      );
    }
  });

  it("zooms in and out by the factor asked for", () => {
    const v = { x: 200, y: 400, w: 500, h: 912.5 };
    const anchor = { x: 450, y: 856 };
    expect(zoomOf(zoomAbout(v, 2, anchor, FULL, MAX))).toBeCloseTo(
      zoomOf(v) * 2,
      6,
    );
    expect(zoomOf(zoomAbout(v, 0.5, anchor, FULL, MAX))).toBeCloseTo(
      zoomOf(v) / 2,
      6,
    );
  });

  it("comes back to where it started after in and out", () => {
    const v = { x: 200, y: 400, w: 500, h: 912.5 };
    const anchor = { x: 380, y: 900 };
    const round = zoomAbout(
      zoomAbout(v, 1.6, anchor, FULL, MAX),
      1 / 1.6,
      anchor,
      FULL,
      MAX,
    );
    expect(round.x).toBeCloseTo(v.x, 6);
    expect(round.y).toBeCloseTo(v.y, 6);
    expect(round.w).toBeCloseTo(v.w, 6);
  });

  it("stays inside the country however hard it is pushed", () => {
    // An anchor at the very corner, zooming out: the naive result runs off
    // the edge and the clamp has to catch it.
    for (const anchor of [
      { x: 0, y: 0 },
      { x: 1000, y: 1825 },
      { x: 0, y: 1825 },
      { x: 999, y: 1 },
    ]) {
      for (const factor of [0.1, 0.5, 2, 30]) {
        const n = zoomAbout(
          { x: 400, y: 800, w: 200, h: 365 },
          factor,
          anchor,
          FULL,
          MAX,
        );
        expect(inside(n), `${JSON.stringify(anchor)} ×${factor}`).toBe(true);
        expect(zoomOf(n)).toBeGreaterThanOrEqual(1 - 1e-9);
        expect(zoomOf(n)).toBeLessThanOrEqual(MAX + 1e-9);
      }
    }
  });

  it("cannot be walked out of bounds by a long run of gestures", () => {
    // A pinch fires on every pointermove; hundreds of clamped steps must not
    // accumulate into a view that has crept off the map.
    let v: View = FULL;
    let seed = 7;
    const rand = () => ((seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648);
    for (let i = 0; i < 400; i++) {
      v = zoomAbout(
        v,
        0.7 + rand() * 1.2,
        { x: rand() * 1000, y: rand() * 1825 },
        FULL,
        MAX,
      );
      expect(inside(v), `step ${i}`).toBe(true);
      expect(v.h / v.w).toBeCloseTo(FULL.h / FULL.w, 9);
    }
  });

  it("does not divide by zero on a degenerate view", () => {
    const n = zoomAbout(
      { x: 0, y: 0, w: 0, h: 0 },
      2,
      { x: 10, y: 10 },
      FULL,
      MAX,
    );
    expect(Number.isFinite(n.x)).toBe(true);
    expect(Number.isFinite(n.y)).toBe(true);
    expect(Number.isFinite(n.w)).toBe(true);
  });
});
