import type { SimInputs } from "@/data/types";
import { DEFAULT_INPUTS } from "@/data/constants";

/**
 * Encode/decode SimInputs through the URL hash so users can share
 * scenarios just by copying the address bar.
 *
 * Format: `#s=<base64url JSON>` — keeps the hash compact and avoids
 * special characters that some chat clients strip.
 */

function toBase64Url(str: string): string {
  // btoa handles latin-1 only; encode UTF-8 first to be safe
  const bytes = new TextEncoder().encode(str);
  let binary = "";
  for (const b of bytes) binary += String.fromCharCode(b);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replaceAll("=", "");
}

function fromBase64Url(b64: string): string {
  const padded = b64.replaceAll("-", "+").replaceAll("_", "/");
  const fill = padded.length % 4 === 0 ? "" : "=".repeat(4 - (padded.length % 4));
  const binary = atob(padded + fill);
  const bytes = Uint8Array.from(binary, (c) => c.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

/** Serialize only the keys that differ from DEFAULT_INPUTS to keep URL short. */
export function encodeInputsToHash(inputs: SimInputs): string {
  const delta: Partial<SimInputs> = {};
  for (const k of Object.keys(inputs) as (keyof SimInputs)[]) {
    if (inputs[k] !== DEFAULT_INPUTS[k]) {
      // @ts-expect-error narrowed by key
      delta[k] = inputs[k];
    }
  }
  if (Object.keys(delta).length === 0) return "";
  return "s=" + toBase64Url(JSON.stringify(delta));
}

export function decodeInputsFromHash(hash: string): SimInputs | null {
  const clean = hash.startsWith("#") ? hash.slice(1) : hash;
  if (!clean.startsWith("s=")) return null;
  try {
    const json = fromBase64Url(clean.slice(2));
    const delta = JSON.parse(json) as Partial<SimInputs>;
    return { ...DEFAULT_INPUTS, ...delta };
  } catch {
    return null;
  }
}
