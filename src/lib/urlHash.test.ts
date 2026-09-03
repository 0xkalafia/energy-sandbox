import { describe, it, expect } from "vitest";
import { encodeInputsToHash, decodeInputsFromHash } from "./urlHash";
import { DEFAULT_INPUTS } from "@/data/constants";
import type { SimInputs } from "@/data/types";

/**
 * A share link is the one piece of state that leaves the app and comes back
 * through an untrusted path — pasted into chat, wrapped by a client, typed by
 * hand. What matters is that a link either restores exactly what was shared or
 * refuses cleanly; a hash that half-decodes is worse than one that fails.
 *
 * The base64 helpers below are spelled out rather than imported from the
 * module under test: an expected value produced by calling the encoder would
 * agree with it however wrong both were. They use btoa/atob deliberately —
 * the same primitives the app runs on in a browser, and unlike Buffer they
 * exist in the app's type environment.
 */

const b64 = (s: string) =>
  btoa(String.fromCharCode(...new TextEncoder().encode(s)));

const b64url = (s: string) =>
  b64(s).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");

const unb64 = (s: string) => {
  const pad = s.length % 4 === 0 ? "" : "=".repeat(4 - (s.length % 4));
  return new TextDecoder().decode(
    Uint8Array.from(atob(s + pad), (c) => c.charCodeAt(0)),
  );
};

const tweak = (over: Partial<SimInputs>): SimInputs => ({
  ...DEFAULT_INPUTS,
  ...over,
});

describe("round trip", () => {
  it("restores a changed scenario exactly", () => {
    const inputs = tweak({
      solarMW: 9999,
      batteryGWh: 31.5,
      season: "monsoon",
      dacOn: false,
      methanolLocalShare: 0.42,
    });
    expect(decodeInputsFromHash("#" + encodeInputsToHash(inputs))).toEqual(inputs);
  });

  it("survives every individual field being non-default", () => {
    // One at a time, so a key dropped by the delta logic can't hide behind
    // another key's value.
    for (const key of Object.keys(DEFAULT_INPUTS) as (keyof SimInputs)[]) {
      const def = DEFAULT_INPUTS[key];
      // Halving keeps fractions (DoD floor, round-trip, local share, coverage)
      // inside the range the validator enforces; adding 1 to those would be
      // clamped on the way back and fail for the wrong reason.
      const changed =
        typeof def === "number"
          ? def > 1
            ? def + 1
            : def * 0.5
          : typeof def === "boolean"
            ? !def
            : def === "summer"
              ? "winter"
              : "summer";
      const inputs = tweak({ [key]: changed } as Partial<SimInputs>);
      const back = decodeInputsFromHash("#" + encodeInputsToHash(inputs));
      expect(back, `key ${key} did not survive the round trip`).toEqual(inputs);
    }
  });

  it("works without the leading #", () => {
    const inputs = tweak({ windMW: 4321 });
    expect(decodeInputsFromHash(encodeInputsToHash(inputs))).toEqual(inputs);
  });
});

describe("only the delta travels", () => {
  it("encodes the defaults as an empty hash", () => {
    // Nothing changed, so the address bar should stay clean.
    expect(encodeInputsToHash(DEFAULT_INPUTS)).toBe("");
  });

  it("stays shorter for one change than for many", () => {
    const one = encodeInputsToHash(tweak({ solarMW: 1234 }));
    const many = encodeInputsToHash(
      tweak({ solarMW: 1234, windMW: 555, biomassMW: 77, batteryGWh: 9 }),
    );
    expect(one.length).toBeLessThan(many.length);
  });

  it("carries the changed key and no others", () => {
    const hash = encodeInputsToHash(tweak({ carbonPrice: 275 }));
    const json = JSON.parse(
      unb64(hash.slice(2).replaceAll("-", "+").replaceAll("_", "/")),
    );
    expect(json).toEqual({ carbonPrice: 275 });
  });
});

describe("base64url — the encoding exists so chat clients don't mangle it", () => {
  /** Standard base64 of the same payload, to compare alphabets against. */
  const standard = (inputs: SimInputs) => {
    const delta: Record<string, unknown> = {};
    for (const k of Object.keys(inputs) as (keyof SimInputs)[]) {
      if (inputs[k] !== DEFAULT_INPUTS[k]) delta[k] = inputs[k];
    }
    return b64(JSON.stringify(delta));
  };

  it("never emits +, / or = across a wide sweep of values", () => {
    for (let i = 1; i < 400; i++) {
      const hash = encodeInputsToHash(
        tweak({ solarMW: i * 7, windMW: i * 13, carbonPrice: i }),
      );
      expect(hash).toMatch(/^s=[A-Za-z0-9_-]+$/);
    }
  });

  it("confirms today's payloads never actually need the + / substitution", () => {
    // Worth stating rather than assuming. Across 20k generated scenarios not
    // one produced a `+` or `/` in standard base64: every field is a number or
    // a fixed season string, so the bytes stay ASCII and never line up on the
    // 62/63 sextets. The forward substitution in toBase64Url is therefore
    // unreachable through the public API right now — it is not dead code to
    // delete, it is the day one field carries a Thai label or an emoji. The
    // decoder half *is* reachable and is covered below.
    let needed = 0;
    for (let i = 1; i < 2000; i++) {
      const std = standard(
        tweak({ solarMW: i * 7, windMW: (i * 13) % 9999, carbonPrice: i % 997 }),
      );
      if (std.includes("+") || std.includes("/")) needed++;
    }
    expect(needed).toBe(0);
  });

  it("decodes - and _ back to + and /", () => {
    // Reachable from outside: an unknown key holding multi-byte UTF-8 puts
    // high bits into the payload, which is what produces 62/63 sextets. The
    // validator drops the key afterwards, but the decode has to survive it.
    const withPlus = JSON.stringify({ solarMW: 4200, note: "🌞🌞" });
    const withSlash = JSON.stringify({ solarMW: 4200, note: "🔋🌞" });
    expect(b64(withPlus)).toContain("+");
    expect(b64(withSlash)).toContain("/");

    for (const payload of [withPlus, withSlash]) {
      const out = decodeInputsFromHash("#s=" + b64url(payload));
      expect(out).not.toBeNull();
      expect(out!.solarMW).toBe(4200);
    }
  });

  it("decodes payloads of every padding length", () => {
    // Padding is stripped on the way out and rebuilt on the way in; lengths
    // ≡ 2 and ≡ 3 (mod 4) are the ones that need it.
    const seen = new Set<number>();
    for (let i = 1; i < 500; i++) {
      const inputs = tweak({ solarMW: i, windMW: i * 3 });
      const hash = encodeInputsToHash(inputs);
      seen.add(hash.slice(2).length % 4);
      expect(decodeInputsFromHash(hash)).toEqual(inputs);
    }
    expect(seen.has(0)).toBe(true);
    expect(seen.has(2)).toBe(true);
    expect(seen.has(3)).toBe(true);
  });
});

describe("refuses junk instead of half-decoding it", () => {
  it.each([
    ["", "empty"],
    ["#", "hash only"],
    ["#nonsense", "no s= prefix"],
    ["#t=abc", "wrong prefix"],
    ["#s=", "empty payload"],
    ["#s=!!!!not-base64!!!!", "invalid base64"],
    ["#s=YWJj", "valid base64, not JSON"],
    ["#s=" + b64url("[1,2,3]"), "JSON array"],
    ["#s=" + b64url("null"), "JSON null"],
    ["#s=" + b64url('"a string"'), "JSON string"],
  ])("returns null for %s (%s)", (hash) => {
    expect(decodeInputsFromHash(hash)).toBeNull();
  });

  it("falls back to defaults for a well-formed hash with hostile values", () => {
    // parseScenarioJSON is the gate; this checks the hash path really goes
    // through it rather than trusting the payload.
    const hostile = b64url(
      JSON.stringify({
        solarMW: -5000,
        batteryRoundTrip: 0,
        methanolLocalShare: 9,
        season: "apocalypse",
        dacOn: "yes",
      }),
    );
    const out = decodeInputsFromHash("#s=" + hostile)!;
    expect(out).not.toBeNull();
    expect(out.solarMW).toBe(0); // clamped, not negative
    expect(out.batteryRoundTrip).toBeGreaterThan(0); // never divide by zero
    expect(out.methanolLocalShare).toBe(1); // clamped to a fraction
    expect(out.season).toBe(DEFAULT_INPUTS.season); // unknown season ignored
    expect(out.dacOn).toBe(DEFAULT_INPUTS.dacOn); // wrong type ignored
  });

  it("ignores keys it doesn't know", () => {
    const out = decodeInputsFromHash(
      "#s=" + b64url(JSON.stringify({ solarMW: 4200, evilKey: "rm -rf" })),
    )!;
    expect(out.solarMW).toBe(4200);
    expect(out).not.toHaveProperty("evilKey");
  });
});
