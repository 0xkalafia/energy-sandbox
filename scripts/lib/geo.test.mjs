import { describe, it, expect } from "vitest";
import {
  same,
  isThaiAmphoe,
  rings,
  simplify,
  simplifyWays,
  areaKm2,
  centroid,
  dissolve,
  makeProjection,
  toPath,
} from "./geo.mjs";

/**
 * Until this file existed, scripts/ had no tests at all — and every boundary,
 * area, centroid and projected coordinate in the app comes out of this
 * module. The only thing that had ever checked it was the nationwide total,
 * 516,601 km² against an official 513,120, which is a self-consistent figure:
 * a systematic error in the shoelace would move both the parts and the whole
 * and still land near enough to look right.
 *
 * So these test against answers known from outside the library — rectangles
 * whose area is a multiplication, squares whose centroid is their middle,
 * a dissolve whose result must equal the sum of its parts.
 */

/** Closed rectangle, the shape rings() produces. */
const box = (lon0, lat0, lon1, lat1) => [
  [lon0, lat0],
  [lon1, lat0],
  [lon1, lat1],
  [lon0, lat1],
  [lon0, lat0],
];

/** A rectangle's area, computed the way a person would. */
const rectKm2 = (dLon, dLat, midLat) =>
  dLon * 111.32 * Math.cos((midLat * Math.PI) / 180) * dLat * 110.57;

describe("areaKm2", () => {
  it("matches a hand-computed rectangle at three latitudes", () => {
    expect(areaKm2(box(0, 0, 1, 1))).toBeCloseTo(rectKm2(1, 1, 0.5), 0);
    expect(areaKm2(box(100, 13, 101, 14))).toBeCloseTo(rectKm2(1, 1, 13.5), 0);
    expect(areaKm2(box(0, 60, 1, 61))).toBeCloseTo(rectKm2(1, 1, 60.5), 0);
  });

  it("scales with the square of a shrinking box", () => {
    const big = areaKm2(box(100, 13, 101, 14));
    const tenth = areaKm2(box(100, 13, 100.1, 13.1));
    expect(tenth / big).toBeCloseTo(0.01, 3);
  });

  it("ignores winding order", () => {
    const r = box(100, 13, 101, 14);
    expect(areaKm2(r)).toBeCloseTo(areaKm2([...r].reverse()), 9);
  });

  it("gives the same answer whether or not the ring repeats its first point", () => {
    // rings() always closes its output, so this is the shape that actually
    // reaches the function; an open ring is what a hand-written test uses.
    // They used to differ by 0.042%, because the repeated vertex was counted
    // twice in the mean latitude that sets the east-west scale.
    const closed = box(100, 13, 101, 14);
    const open = closed.slice(0, -1);
    expect(areaKm2(closed)).toBeCloseTo(areaKm2(open), 9);
  });

  it("is a degenerate zero for a line", () => {
    expect(areaKm2([[0, 0], [1, 1], [2, 2], [0, 0]])).toBeCloseTo(0, 6);
  });
});

describe("centroid", () => {
  it("finds the middle of a square and a third of a triangle", () => {
    expect(centroid(box(0, 0, 1, 1))).toEqual([0.5, 0.5]);
    const [x, y] = centroid(box(100, 13, 101, 14));
    expect(x).toBeCloseTo(100.5, 9);
    expect(y).toBeCloseTo(13.5, 9);
    const [tx, ty] = centroid([[0, 0], [3, 0], [0, 3], [0, 0]]);
    expect(tx).toBeCloseTo(1, 9);
    expect(ty).toBeCloseTo(1, 9);
  });

  it("falls back to a vertex rather than dividing by zero", () => {
    // A zero-area ring makes the area-weighted formula 0/0. Returning NaN here
    // would travel silently into a label position or an API query.
    expect(centroid([[5, 7], [5, 7], [5, 7]])).toEqual([5, 7]);
    expect(centroid([[0, 0], [1, 1]])).toEqual([0, 0]);
  });
});

describe("simplify", () => {
  const wiggle = Array.from({ length: 101 }, (_, i) => [
    i / 100,
    Math.sin(i / 8) * 0.02,
  ]);

  it("keeps both endpoints at every tolerance", () => {
    // This is what lets simplifyWays work: ways still meet exactly where they
    // met before, so neighbouring amphoe share identical vertices and the
    // dissolve can cancel them.
    for (const tol of [0, 0.001, 0.01, 0.1, 1]) {
      const s = simplify(wiggle, tol);
      expect(same(s[0], wiggle[0]), `tol ${tol}`).toBe(true);
      expect(same(s.at(-1), wiggle.at(-1)), `tol ${tol}`).toBe(true);
    }
  });

  it("drops more points as the tolerance grows, and none at zero", () => {
    const counts = [0, 0.001, 0.01, 0.1].map((t) => simplify(wiggle, t).length);
    expect(counts[0]).toBe(wiggle.length);
    for (let i = 1; i < counts.length; i++) {
      expect(counts[i], `tol step ${i}`).toBeLessThan(counts[i - 1]);
    }
    expect(counts.at(-1)).toBe(2);
  });

  it("reduces a straight line to its ends", () => {
    expect(simplify([[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]], 0.001)).toEqual([
      [0, 0],
      [4, 0],
    ]);
  });

  it("leaves anything shorter than four points alone", () => {
    const tiny = [[0, 0], [1, 5], [2, 0]];
    expect(simplify(tiny, 10)).toEqual(tiny);
  });

  it("never moves a kept point off the original line", () => {
    const s = simplify(wiggle, 0.005);
    for (const p of s) {
      expect(wiggle.some((q) => same(p, q))).toBe(true);
    }
  });
});

describe("rings", () => {
  const way = (id, coords) => ({
    type: "way",
    ref: id,
    role: "outer",
    geometry: coords.map(([lon, lat]) => ({ lon, lat })),
  });

  it("chains ways given out of order and back to front", () => {
    // OSM does not promise members in ring order or in a consistent direction;
    // an implementation that only appends forwards silently loses shapes.
    const rel = {
      members: [
        way(1, [[0, 0], [1, 0]]),
        way(2, [[1, 1], [1, 0]]),
        way(3, [[1, 1], [0, 1]]),
        way(4, [[0, 1], [0, 0]]),
      ],
    };
    const [r, ...rest] = rings(rel);
    expect(rest).toHaveLength(0);
    expect(same(r[0], r.at(-1))).toBe(true);
    expect(areaKm2(r)).toBeCloseTo(rectKm2(1, 1, 0.5), 0);
  });

  it("returns every ring, biggest first", () => {
    // Surat Thani's amphoe come to 108 rings once the islands are counted.
    // Keeping only the largest would quietly drop Ko Samui.
    const rel = {
      members: [
        way(1, [[0, 0], [2, 0]]),
        way(2, [[2, 0], [2, 2]]),
        way(3, [[2, 2], [0, 2]]),
        way(4, [[0, 2], [0, 0]]),
        way(5, [[10, 10], [10.5, 10], [10.5, 10.5], [10, 10.5], [10, 10]]),
      ],
    };
    const out = rings(rel);
    expect(out).toHaveLength(2);
    expect(out[0].length).toBeGreaterThanOrEqual(out[1].length);
    expect(areaKm2(out[0])).toBeGreaterThan(areaKm2(out[1]));
  });

  it("separates inner rings from outer ones", () => {
    const rel = {
      members: [
        way(1, [[0, 0], [2, 0], [2, 2], [0, 2], [0, 0]]),
        { ...way(2, [[0.5, 0.5], [1.5, 0.5], [1.5, 1.5], [0.5, 1.5], [0.5, 0.5]]), role: "inner" },
      ],
    };
    expect(rings(rel)).toHaveLength(1);
    expect(rings(rel, { inner: true })).toHaveLength(1);
    expect(areaKm2(rings(rel, { inner: true })[0])).toBeLessThan(
      areaKm2(rings(rel)[0]),
    );
  });

  it("discards fragments that never close", () => {
    const rel = { members: [way(1, [[0, 0], [1, 0]]), way(2, [[5, 5], [6, 6]])] };
    expect(rings(rel)).toHaveLength(0);
  });

  it("takes geometry from a supplied way table when given one", () => {
    // This is how simplifyWays makes a shared border bit-identical on both
    // sides: same way id, same simplified points, so the dissolve can cancel.
    const rel = {
      members: [
        way(1, [[0, 0], [1, 0]]),
        way(2, [[1, 0], [1, 1]]),
        way(3, [[1, 1], [0, 0]]),
      ],
    };
    const ways = new Map([[1, [[0, 0], [0.5, -0.5], [1, 0]]]]);
    const [r] = rings(rel, { ways });
    expect(r.some((p) => same(p, [0.5, -0.5]))).toBe(true);
  });
});

describe("simplifyWays", () => {
  it("simplifies each way once, so a shared border comes out identical", () => {
    /*
     * The bug this prevents: simplifying ring by ring looks equivalent and is
     * not. A border shared by two amphoe is one way, but it appears in each
     * ring with different neighbours, so Douglas-Peucker keeps different
     * vertices on each side. The two copies then differ by metres, the
     * dissolve cannot cancel them, and Phetchaburi came out as one real
     * outline plus 16 slivers.
     */
    const border = Array.from({ length: 40 }, (_, i) => [
      i / 40,
      Math.sin(i / 5) * 0.001,
    ]);
    const asWay = (id, coords) => ({
      type: "way",
      ref: id,
      role: "outer",
      geometry: coords.map(([lon, lat]) => ({ lon, lat })),
    });
    const relA = { members: [asWay(7, border), asWay(8, [[1, 0], [1, 1], [0, 0]])] };
    const relB = { members: [asWay(7, border), asWay(9, [[1, 0], [1, -1], [0, 0]])] };

    const table = simplifyWays([relA, relB], 0.002);
    expect(table.size).toBe(3);

    const a = rings(relA, { ways: table })[0];
    const b = rings(relB, { ways: table })[0];
    const shared = table.get(7);
    for (const p of shared) {
      expect(a.some((q) => same(p, q)) && b.some((q) => same(p, q))).toBe(true);
    }
  });
});

describe("dissolve", () => {
  it("merges two squares sharing an edge into one ring of the same area", () => {
    const left = box(0, 0, 1, 1);
    const right = box(1, 0, 2, 1);
    const out = dissolve([[left], [right]]);
    expect(out).toHaveLength(1);
    expect(areaKm2(out[0])).toBeCloseTo(areaKm2(left) + areaKm2(right), 0);
  });

  it("leaves squares that do not touch as separate rings", () => {
    expect(dissolve([[box(0, 0, 1, 1)], [box(5, 5, 6, 6)]])).toHaveLength(2);
  });

  it("tiles a block into one ring of the same area", () => {
    const parts = [
      [box(0, 0, 1, 1)],
      [box(1, 0, 2, 1)],
      [box(0, 1, 1, 2)],
      [box(1, 1, 2, 2)],
    ];
    const out = dissolve(parts);
    expect(out).toHaveLength(1);
    // Not exact, and correctly so: areaKm2 takes one east-west scale at the
    // ring's mean latitude, so four squares measured separately at 0.5° and
    // 1.5° do not add to the merged square measured once at 1.0°. The gap is
    // 0.004% here, and it is the approximation, not the dissolve.
    const parts4 = parts.reduce((s, [r]) => s + areaKm2(r), 0);
    expect(Math.abs(areaKm2(out[0]) - parts4) / parts4).toBeLessThan(0.001);
  });

  it("keeps a hole a hole", () => {
    // Eight squares round an empty middle. The result must be two rings — the
    // outside and the hole — not one filled block, or a province with an
    // enclave in it would come out solid.
    const parts = [];
    for (let x = 0; x < 3; x++) {
      for (let y = 0; y < 3; y++) {
        if (x === 1 && y === 1) continue;
        parts.push([box(x, y, x + 1, y + 1)]);
      }
    }
    const out = dissolve(parts);
    expect(out).toHaveLength(2);
    // The bigger ring is the outside; the smaller is the missing middle.
    expect(areaKm2(out[0])).toBeGreaterThan(areaKm2(out[1]) * 5);
    const solid = areaKm2(box(0, 0, 3, 3));
    expect(areaKm2(out[0]) - areaKm2(out[1])).toBeCloseTo((solid * 8) / 9, -2);
  });
});

describe("makeProjection", () => {
  const extent = { minLon: 97, minLat: 5.5, maxLon: 106, maxLat: 20.5 };
  const proj = makeProjection(extent, 1000, 20);

  it("puts the corners exactly on the padding", () => {
    expect(proj.project([97, 20.5])).toEqual([20, 20]);
    const [x, y] = proj.project([106, 5.5]);
    expect(x).toBeCloseTo(980, 0);
    expect(y).toBeCloseTo(proj.height - 20, 0);
  });

  it("puts north at the top", () => {
    expect(proj.project([100, 20])[1]).toBeLessThan(proj.project([100, 6])[1]);
  });

  it("keeps the aspect ratio geographic, not raw degrees", () => {
    // Without the cosine correction Thailand would come out stretched
    // east-west; the check is that the drawn aspect matches the ground one.
    const kx = Math.cos((((extent.minLat + extent.maxLat) / 2) * Math.PI) / 180);
    const want = (extent.maxLat - extent.minLat) / ((extent.maxLon - extent.minLon) * kx);
    expect((proj.height - 40) / 960).toBeCloseTo(want, 2);
  });

  it("is monotone in both directions", () => {
    expect(proj.project([98, 10])[0]).toBeLessThan(proj.project([99, 10])[0]);
    expect(proj.project([100, 10])[1]).toBeGreaterThan(proj.project([100, 11])[1]);
  });
});

describe("toPath", () => {
  it("writes one closed subpath per ring", () => {
    const id = ([x, y]) => [x, y];
    const d = toPath([[[0, 0], [1, 0], [1, 1]], [[5, 5], [6, 5], [6, 6]]], id);
    expect(d).toBe("M0,0L1,0L1,1ZM5,5L6,5L6,6Z");
    expect(d.match(/Z/g)).toHaveLength(2);
  });
});

describe("isThaiAmphoe", () => {
  it("drops a foreign district by its P-code", () => {
    // Ranong's query returns Kawthoung in Myanmar: 13,584 km² against a real
    // province of 3,279, and 84% of the nationwide area error on its own.
    expect(isThaiAmphoe({ tags: { dt_pcode_1: "MMR017" } })).toBe(false);
    expect(isThaiAmphoe({ tags: { "ref:pcode": "MMR017015" } })).toBe(false);
    expect(isThaiAmphoe({ tags: { dt_pcode_1: "TH8501" } })).toBe(true);
  });

  it("drops a province that arrived among the amphoe", () => {
    expect(isThaiAmphoe({ tags: { "name:th": "จังหวัดระนอง" } })).toBe(false);
  });

  it("keeps the two amphoe the obvious rule would lose", () => {
    // "name:th starts with อำเภอ" reads plausible and drops Bangkok's Watthana
    // and Surat Thani's Tha Chang, whose name:th is simply absent.
    expect(isThaiAmphoe({ tags: { name: "Watthana" } })).toBe(true);
    expect(isThaiAmphoe({ tags: { "name:en": "Tha Chang" } })).toBe(true);
    expect(isThaiAmphoe({ tags: {} })).toBe(true);
    expect(isThaiAmphoe({})).toBe(true);
  });
});
