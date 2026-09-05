/**
 * Scan-converting lon/lat polygons onto a regular grid.
 *
 * This is how every protected-area figure in the app is measured — 109,380
 * km² nationwide, Phetchaburi at 45%, Kaeng Krachan at 77%. Rasterising
 * instead of intersecting polygons was a deliberate trade: real polygon
 * intersection between 77 provinces and 391 parks is a great deal of code to
 * get subtly wrong, and here the error is bounded by one number, the cell
 * size, which can be stated and checked.
 *
 * Lifted out of fetch-protected-areas.mjs so it can be tested against shapes
 * whose answers are known independently. It had only ever been checked in
 * aggregate — the national total against the official one — and an aggregate
 * check passes happily on a function that is wrong in a way that cancels.
 */

/**
 * A grid over a lon/lat box.
 *
 * `cell` is in degrees. 0.005° is about 550 m, which resolves a province of a
 * few thousand km² to well under 1% and costs 5.3 MB for the whole country.
 */
export function makeGrid({ lon0, lat0, lon1, lat1, cell }) {
  const nx = Math.ceil((lon1 - lon0) / cell);
  const ny = Math.ceil((lat1 - lat0) / cell);
  return {
    lon0,
    lat0,
    cell,
    nx,
    ny,
    /** A fresh empty raster for this grid. */
    alloc: () => new Uint8Array(nx * ny),
    /**
     * Area of one cell on row `r`, km². Cells shrink towards the poles, so
     * this is a function of the row and not a constant.
     */
    cellKm2: (r) =>
      cell *
      111.32 *
      Math.cos(((lat0 + (r + 0.5) * cell) * Math.PI) / 180) *
      cell *
      110.57,
  };
}

/**
 * Scan-convert one shape into a grid, ORing it into whatever is there.
 *
 * Every ring of the shape — outer and inner together — contributes its
 * crossings to the same raster row, and the row is filled on the even-odd
 * rule. Holes then come for free: a cell inside both a park and the enclave
 * carved out of it has an even crossing count and stays clear.
 *
 * Taking all rings in one call is also what makes ORing safe. Painting ring by
 * ring would need XOR to cut the holes, and XOR lets two overlapping shapes
 * cancel into empty space — two parks sharing a border would erase their
 * overlap. Resolving even-odd inside the call and OR-ing the result out means
 * shapes can only ever add.
 */
export function paint(g, grid, ringList) {
  let minY = Infinity;
  let maxY = -Infinity;
  for (const ring of ringList) {
    for (const [, lat] of ring) {
      if (lat < minY) minY = lat;
      if (lat > maxY) maxY = lat;
    }
  }
  if (minY === Infinity) return;
  const r0 = Math.max(0, Math.floor((minY - g.lat0) / g.cell));
  const r1 = Math.min(g.ny - 1, Math.ceil((maxY - g.lat0) / g.cell));
  const xs = [];
  for (let r = r0; r <= r1; r++) {
    const y = g.lat0 + (r + 0.5) * g.cell;
    xs.length = 0;
    for (const ring of ringList) {
      for (let i = 0, n = ring.length; i < n; i++) {
        const [x1, y1] = ring[i];
        const [x2, y2] = ring[(i + 1) % n];
        if (y1 === y2) continue;
        // Half-open in y so a vertex sitting exactly on the scanline is
        // counted once rather than twice — the classic double-count that
        // leaks fill sideways out of a shape.
        if (y >= Math.min(y1, y2) && y < Math.max(y1, y2)) {
          xs.push(x1 + ((y - y1) / (y2 - y1)) * (x2 - x1));
        }
      }
    }
    if (xs.length < 2) continue;
    xs.sort((a, b) => a - b);
    for (let k = 0; k + 1 < xs.length; k += 2) {
      // A cell belongs to the shape when its centre does.
      const c0 = Math.max(0, Math.ceil((xs[k] - g.lon0) / g.cell - 0.5));
      const c1 = Math.min(g.nx - 1, Math.floor((xs[k + 1] - g.lon0) / g.cell - 0.5));
      const base = r * g.nx;
      for (let c = c0; c <= c1; c++) grid[base + c] = 1;
    }
  }
}

/**
 * Grid window covering a set of rings, clamped to the raster.
 *
 * Everything is measured and cleared through one of these. Sweeping the whole
 * 1760 × 3020 grid once per amphoe would be 4.9 billion cell visits across the
 * 931 of them; an amphoe's own window is a few thousand.
 */
export function windowOf(g, ringList) {
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  for (const ring of ringList) {
    for (const [lon, lat] of ring) {
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    }
  }
  if (minLon === Infinity) return null;
  return {
    r0: Math.max(0, Math.floor((minLat - g.lat0) / g.cell) - 1),
    r1: Math.min(g.ny - 1, Math.ceil((maxLat - g.lat0) / g.cell) + 1),
    c0: Math.max(0, Math.floor((minLon - g.lon0) / g.cell) - 1),
    c1: Math.min(g.nx - 1, Math.ceil((maxLon - g.lon0) / g.cell) + 1),
  };
}

/**
 * Land and overlapping land under whatever is painted into `grid`.
 *
 * `overlay` is optional; where given, cells set in both are counted a second
 * time. That is the whole measurement: province cells give the denominator,
 * cells also in the park layer give the numerator.
 */
export function measure(g, grid, overlay, win) {
  const { r0, r1, c0, c1 } = win ?? { r0: 0, r1: g.ny - 1, c0: 0, c1: g.nx - 1 };
  let land = 0;
  let both = 0;
  for (let r = r0; r <= r1; r++) {
    const a = g.cellKm2(r);
    const base = r * g.nx;
    for (let c = c0; c <= c1; c++) {
      const k = base + c;
      if (!grid[k]) continue;
      land += a;
      if (overlay && overlay[k]) both += a;
    }
  }
  return { land, both };
}

/** Zero just the window, so one scratch buffer can serve every shape. */
export function clear(grid, g, win) {
  for (let r = win.r0; r <= win.r1; r++) {
    grid.fill(0, r * g.nx + win.c0, r * g.nx + win.c1 + 1);
  }
}
