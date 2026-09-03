import { describe, it, expect } from "vitest";
import { classifyError, errorMessage } from "./errorKind";

/**
 * The point of the classifier is to tell "we shipped a new build while you had
 * the page open" apart from "the code is broken", because only the first one
 * is fixed by clearing caches and reloading. Getting that wrong in either
 * direction is a bad outcome: send someone round the reload loop for a real
 * bug, or bury a stale-chunk error under "try again" when trying again can
 * never work.
 *
 * So the inputs here are the actual strings browsers throw, not paraphrases.
 */
describe("classifyError — stale chunk after a redeploy", () => {
  const REAL_MESSAGES = [
    // Chrome / Edge
    "Failed to fetch dynamically imported module: https://example.com/assets/HouseMode-CWH-yzd_.js",
    // Firefox
    "error loading dynamically imported module: https://example.com/assets/Optimizer-DS1JDWwS.js",
    // Safari
    "Importing a module script failed.",
    // Vite's CSS preload helper
    "Unable to preload CSS for /assets/index-C40KU-HF.css",
    // webpack-style, in case a dependency throws its own
    "Loading chunk 42 failed.",
  ];

  it.each(REAL_MESSAGES)("recognises %s", (message) => {
    expect(classifyError(new Error(message))).toBe("stale-chunk");
  });

  it("recognises it from the error name alone", () => {
    const e = new Error("Loading failed");
    e.name = "ChunkLoadError";
    expect(classifyError(e)).toBe("stale-chunk");
  });
});

describe("classifyError — everything else stays unknown", () => {
  // These are the shapes of real bugs in this app: an engine divide, a bad
  // read off an undefined object, a thrown string. None is fixed by reloading,
  // so none may be reported as a stale chunk.
  const NOT_CHUNKS = [
    new TypeError("Cannot read properties of undefined (reading 'batterySoC')"),
    new RangeError("Invalid array length"),
    new Error("simulateDay: gridLimitMW must be finite"),
    new Error("Failed to fetch"), // a plain network call, not a module import
    new Error("NetworkError when attempting to fetch resource."),
  ];

  it.each(NOT_CHUNKS)("leaves %s alone", (error) => {
    expect(classifyError(error)).toBe("unknown");
  });
});

describe("errorMessage — survives whatever gets thrown", () => {
  it("reads an Error", () => {
    expect(errorMessage(new Error("boom"))).toBe("boom");
  });

  it("falls back to the name when the message is empty", () => {
    expect(errorMessage(new TypeError())).toBe("TypeError");
  });

  it("handles a thrown string", () => {
    expect(errorMessage("just a string")).toBe("just a string");
  });

  it("handles a message-shaped object that isn't an Error", () => {
    expect(errorMessage({ message: 404 })).toBe("404");
  });

  it("handles null and undefined without throwing", () => {
    expect(errorMessage(null)).toBe("null");
    expect(errorMessage(undefined)).toBe("undefined");
  });

  it("classifies a non-Error rejection by its message", () => {
    expect(
      classifyError({ message: "Failed to fetch dynamically imported module" }),
    ).toBe("stale-chunk");
  });
});
