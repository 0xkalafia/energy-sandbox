/**
 * Classifying a caught error so the fallback can offer a recovery that stands
 * a chance of working, instead of one generic "try again" for everything.
 *
 * The case worth separating out is a failed dynamic import. Every tab past the
 * first is `lazy()`, so its code arrives as its own hashed chunk. Deploy a new
 * build while someone has the page open and their `index` still asks for chunk
 * hashes that no longer exist — the tab throws on click, through no fault of
 * the code in it. The service worker makes it likelier still, since it can
 * keep answering with the old index after the server has moved on.
 *
 * That one is fixed by clearing the caches and reloading. A genuine bug is
 * not, and telling someone to reload for it just wastes their time.
 */
export type ErrorKind = "stale-chunk" | "unknown";

/**
 * Wording differs per browser and there is no error code to key on, so this
 * matches on text. Kept as a list of the real strings each engine produces:
 *
 *   Chrome/Edge  Failed to fetch dynamically imported module: https://…
 *   Firefox      error loading dynamically imported module: https://…
 *   Safari       Importing a module script failed.
 *   Vite preload '__vitePreload' / Unable to preload CSS for …
 *   Bundlers     ChunkLoadError / Loading chunk 42 failed
 */
const STALE_CHUNK_PATTERNS = [
  /failed to fetch dynamically imported module/i,
  /error loading dynamically imported module/i,
  /importing a module script failed/i,
  /unable to preload css/i,
  /chunkloaderror/i,
  /loading chunk \S+ failed/i,
  /dynamically imported module/i,
];

/** Message text of anything throwable, including the non-Error things that
 *  reject promises in the wild. */
export function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message || error.name;
  if (typeof error === "string") return error;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

export function classifyError(error: unknown): ErrorKind {
  const text = `${error instanceof Error ? error.name : ""} ${errorMessage(error)}`;
  return STALE_CHUNK_PATTERNS.some((re) => re.test(text))
    ? "stale-chunk"
    : "unknown";
}

/**
 * Whether the current URL carries a shared scenario. If it does, a bad
 * scenario is a plausible cause of the crash and "start from the defaults" is
 * worth offering — `parseScenarioJSON` rejects malformed input, but it can't
 * tell that a well-formed one drives the engine somewhere it can't go.
 */
export function hasScenarioInUrl(hash = window.location.hash): boolean {
  return hash.length > 1;
}
