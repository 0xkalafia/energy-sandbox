/**
 * Shared geometry helpers for the boundary pipeline.
 *
 * Kept apart from the fetch script because the maths is worth testing on its
 * own, and because the nationwide build and the single-province build need the
 * same ring assembly, simplification and projection.
 */

export const same = (a, b) =>
  Math.abs(a[0] - b[0]) < 1e-9 && Math.abs(a[1] - b[1]) < 1e-9;

/**
 * Keep only relations that are actually Thai amphoe.
 *
 * The fetch asks Overpass for admin_level=6 relations inside a province's
 * area, and that area is the province relation — which includes territorial
 * waters. Across a maritime border the query therefore also picks up the
 * neighbour's districts: Ranong came back with Kawthoung, a Myanmar district
 * of 13,584 km², five times the whole province, which on its own accounted for
 * 84% of the nationwide area error.
 *
 * Two signals, both from the data rather than from a list of names to exclude:
 * a foreign P-code, and a name:th that says จังหวัด (province) rather than
 * naming an amphoe. Deliberately not "name:th starts with อำเภอ" — that reads
 * plausible and drops two real ones, Bangkok's วัฒนา and Surat Thani's Tha
 * Chang, whose name:th is simply empty.
 *
 * This lives in the shared lib rather than in one script because a second copy
 * is how the two drift apart. It already happened: the protected-area build
 * read the same cache without this filter and measured Ranong's park coverage
 * against a denominator that included Myanmar — 16,875 km² for a province of
 * 3,279.
 */
export function isThaiAmphoe(rel) {
  const t = rel.tags ?? {};
  const pcode = t.dt_pcode_1 ?? t["ref:pcode"] ?? "";
  if (pcode && !pcode.startsWith("TH")) return false;
  if ((t["name:th"] ?? "").startsWith("จังหวัด")) return false;
  return true;
}

/**
 * Chain a relation's member ways into closed rings.
 *
 * Multi-ring is the normal case here, not an edge case: Surat Thani's 19
 * amphoe come to 108 rings once the islands are counted. An implementation
 * that keeps only the largest silently drops Ko Samui.
 */
export function rings(rel, { inner = false, ways = null } = {}) {
  const pool = (rel.members ?? [])
    .filter(
      (m) =>
        m.type === "way" &&
        m.geometry &&
        (inner ? m.role === "inner" : m.role !== "inner"),
    )
    // When a simplified way table is supplied, take the geometry from there.
    // Two amphoe that share a border reference the same way, so this is what
    // makes their shared edge bit-identical after simplification — see
    // simplifyWays below for why that matters.
    .map((m) =>
      ways?.get(m.ref) ?? m.geometry.map((p) => [p.lon, p.lat]),
    );

  const out = [];
  // A malformed relation can leave segments that never close; bail rather than
  // spin, and let the caller notice the ring count.
  let guard = 0;
  while (pool.length && guard++ < 50000) {
    let ring = pool.shift();
    let joined = true;
    while (joined && !same(ring[0], ring.at(-1))) {
      joined = false;
      for (let i = 0; i < pool.length; i++) {
        const s = pool[i];
        if (same(ring.at(-1), s[0])) ring = ring.concat(s.slice(1));
        else if (same(ring.at(-1), s.at(-1)))
          ring = ring.concat([...s].reverse().slice(1));
        else if (same(ring[0], s.at(-1))) ring = s.concat(ring.slice(1));
        else if (same(ring[0], s[0]))
          ring = [...s].reverse().concat(ring.slice(1));
        else continue;
        pool.splice(i, 1);
        joined = true;
        break;
      }
    }
    if (ring.length >= 4) out.push(ring);
  }
  return out.sort((a, b) => b.length - a.length);
}

/** Douglas–Peucker, iterative so a long coastline can't blow the stack. */
export function simplify(pts, tol) {
  if (pts.length < 4) return pts;
  const segDist = (p, a, b) => {
    let [x, y] = a;
    const dx = b[0] - x;
    const dy = b[1] - y;
    if (dx || dy) {
      const t = ((p[0] - x) * dx + (p[1] - y) * dy) / (dx * dx + dy * dy);
      if (t > 1) [x, y] = b;
      else if (t > 0) {
        x += dx * t;
        y += dy * t;
      }
    }
    return (p[0] - x) ** 2 + (p[1] - y) ** 2;
  };
  const t2 = tol * tol;
  const keep = new Array(pts.length).fill(false);
  keep[0] = keep[pts.length - 1] = true;
  const stack = [[0, pts.length - 1]];
  while (stack.length) {
    const [i, k] = stack.pop();
    let maxd = 0;
    let idx = -1;
    for (let m = i + 1; m < k; m++) {
      const d = segDist(pts[m], pts[i], pts[k]);
      if (d > maxd) {
        maxd = d;
        idx = m;
      }
    }
    if (maxd > t2) {
      keep[idx] = true;
      stack.push([i, idx], [idx, k]);
    }
  }
  return pts.filter((_, i) => keep[i]);
}

/**
 * Simplify every distinct way once, keyed by OSM way id.
 *
 * Simplifying ring by ring looks equivalent and isn't. A border shared by two
 * amphoe belongs to one way, but it appears in each amphoe's ring with a
 * different start point and different neighbours, so Douglas–Peucker keeps
 * different vertices on each side. The two versions of the same border then
 * differ by a few metres, the dissolve can't cancel them, and what should be a
 * single province outline comes back as one real ring plus a scatter of
 * slivers — measured on Phetchaburi: 1 ring of 6,158 km² and 16 more totalling
 * 0.93 km².
 *
 * Doing it per way removes the cause. Endpoints always survive DP, so ways
 * still meet exactly where they met before.
 */
export function simplifyWays(relations, tol) {
  const out = new Map();
  for (const rel of relations) {
    for (const m of rel.members ?? []) {
      if (m.type !== "way" || !m.geometry || out.has(m.ref)) continue;
      out.set(
        m.ref,
        simplify(
          m.geometry.map((p) => [p.lon, p.lat]),
          tol,
        ),
      );
    }
  }
  return out;
}

/**
 * km² by shoelace on a local equal-ish projection.
 *
 * The east-west scale is taken at the ring's mean latitude, which is an
 * approximation that costs about 0.85% on a shape 15° tall and is negligible
 * on an amphoe. The shoelace itself closes the ring with `% n`, so a repeated
 * first-and-last vertex contributes a zero-area term and is harmless there —
 * but it would skew the mean latitude, so it is left out of that. Measured, it
 * moves a 5-point box by 0.042% and real amphoe by 0.000%; the correction is
 * here because the function should be right for any caller, not because it
 * changed anything in this project.
 */
export function areaKm2(ring) {
  const n = ring.length > 1 && same(ring[0], ring.at(-1)) ? ring.length - 1 : ring.length;
  let latSum = 0;
  for (let i = 0; i < n; i++) latSum += ring[i][1];
  const lat0 = ((latSum / n) * Math.PI) / 180;
  const kx = 111.32 * Math.cos(lat0);
  const ky = 110.57;
  let a = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % n];
    a += x1 * kx * (y2 * ky) - x2 * kx * (y1 * ky);
  }
  return Math.abs(a) / 2;
}

/** Area-weighted centroid of a ring. */
export function centroid(ring) {
  let a = 0;
  let cx = 0;
  let cy = 0;
  for (let i = 0, n = ring.length; i < n; i++) {
    const [x1, y1] = ring[i];
    const [x2, y2] = ring[(i + 1) % n];
    const f = x1 * y2 - x2 * y1;
    a += f;
    cx += (x1 + x2) * f;
    cy += (y1 + y2) * f;
  }
  a *= 0.5;
  return a === 0 ? ring[0] : [cx / (6 * a), cy / (6 * a)];
}

/**
 * Drop the borders two amphoe of the same province share, leaving the province
 * outline.
 *
 * This is a topological dissolve, not a geometric union, and it works because
 * neighbouring OSM relations reference the *same way objects* — so their
 * shared vertices are identical, not merely close. Measured on Phetchaburi:
 * 62.8% of vertices have an exact counterpart in a neighbour. A real polygon
 * union would be far more code for the same answer.
 */
export function dissolve(ringLists) {
  const key = (p, q) =>
    p[0] < q[0] || (p[0] === q[0] && p[1] <= q[1])
      ? `${p[0]},${p[1]}|${q[0]},${q[1]}`
      : `${q[0]},${q[1]}|${p[0]},${p[1]}`;

  const count = new Map();
  for (const rs of ringLists) {
    for (const r of rs) {
      for (let i = 0; i < r.length - 1; i++) {
        const k = key(r[i], r[i + 1]);
        count.set(k, (count.get(k) ?? 0) + 1);
      }
    }
  }

  // Segments walked once belong to the outside edge; twice means two amphoe
  // share them and they're interior.
  const edges = [];
  for (const rs of ringLists) {
    for (const r of rs) {
      for (let i = 0; i < r.length - 1; i++) {
        if (count.get(key(r[i], r[i + 1])) === 1) edges.push([r[i], r[i + 1]]);
      }
    }
  }

  // Chain the surviving segments back into rings.
  const byPoint = new Map();
  const at = (p) => `${p[0]},${p[1]}`;
  for (const [a, b] of edges) {
    if (!byPoint.has(at(a))) byPoint.set(at(a), []);
    if (!byPoint.has(at(b))) byPoint.set(at(b), []);
    byPoint.get(at(a)).push(b);
    byPoint.get(at(b)).push(a);
  }

  const used = new Set();
  const out = [];
  for (const [a, b] of edges) {
    const seed = key(a, b);
    if (used.has(seed)) continue;
    used.add(seed);
    const ring = [a, b];
    let guard = 0;
    while (guard++ < 200000) {
      const tail = ring.at(-1);
      const next = (byPoint.get(at(tail)) ?? []).find(
        (p) => !used.has(key(tail, p)),
      );
      if (!next) break;
      used.add(key(tail, next));
      ring.push(next);
      if (same(next, ring[0])) break;
    }
    if (ring.length >= 4) out.push(ring);
  }
  return out.sort((a, b) => b.length - a.length);
}

/**
 * One projection for the whole country, so a province view is just a different
 * viewBox over the same coordinates rather than its own coordinate system.
 * Equirectangular with a cosine correction at the mid-latitude keeps shapes
 * from stretching east-west.
 */
export function makeProjection(extent, width, pad) {
  // `extent` is {minLon, minLat, maxLon, maxLat}, accumulated point by point
  // rather than handed over as an array. Thailand's amphoe come to 1.6 million
  // vertices: spreading that into Math.min blows the argument limit, and
  // concatenating it into one array is quadratic.
  const lat0 = ((extent.minLat + extent.maxLat) / 2) * (Math.PI / 180);
  const kx = Math.cos(lat0);
  const bounds = [
    extent.minLon * kx,
    -extent.maxLat,
    extent.maxLon * kx,
    -extent.minLat,
  ];
  const scale = (width - pad * 2) / (bounds[2] - bounds[0]);
  const height = Math.round((bounds[3] - bounds[1]) * scale + pad * 2);
  const project = ([lon, lat]) => [
    +((lon * kx - bounds[0]) * scale + pad).toFixed(1),
    +((-lat - bounds[1]) * scale + pad).toFixed(1),
  ];
  return { project, width, height };
}

export const toPath = (ringList, project) =>
  ringList
    .map((r) => "M" + r.map((p) => project(p).join(",")).join("L") + "Z")
    .join("");
