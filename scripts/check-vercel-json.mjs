/**
 * Validate vercel.json against Vercel's published schema.
 *
 * Nothing local reads this file — `npm run build` doesn't, and neither does
 * anything in CI — so a mistake in it survives a completely green gate and
 * only shows up as a failed deployment. That is exactly how the first deploy
 * of this project failed: two `"comment"` keys added inside `headers[]`, where
 * the schema sets `additionalProperties: false`, so Vercel rejected the whole
 * file. JSON has no comments; the reasoning lives in the README instead.
 *
 *   npm run check:vercel
 *
 * Offline, it validates the parts it knows about and says so rather than
 * silently passing.
 */
import { readFileSync } from "node:fs";

const SCHEMA_URL = "https://openapi.vercel.sh/vercel.json";
const config = JSON.parse(readFileSync("vercel.json", "utf8"));

let schema = null;
try {
  const res = await fetch(SCHEMA_URL, { signal: AbortSignal.timeout(15000) });
  if (res.ok) schema = await res.json();
} catch {
  // fall through to the offline path
}

const problems = [];

/** Keys an object may carry, per the schema — recursed only where it matters. */
function checkObject(value, node, path) {
  if (!node || typeof value !== "object" || value === null) return;
  const allowed = node.properties ? Object.keys(node.properties) : null;
  if (allowed && node.additionalProperties === false) {
    for (const key of Object.keys(value)) {
      if (!allowed.includes(key)) {
        problems.push(
          `${path}: "${key}" is not allowed here (schema permits ${allowed.join(", ")})`,
        );
      }
    }
  }
  if (Array.isArray(value) || !node.properties) return;
  for (const [key, child] of Object.entries(value)) {
    const childNode = node.properties[key];
    if (!childNode) continue;
    if (Array.isArray(child) && childNode.items) {
      child.forEach((item, i) =>
        checkObject(item, childNode.items, `${path}.${key}[${i}]`),
      );
    } else {
      checkObject(child, childNode, `${path}.${key}`);
    }
  }
}

if (schema) {
  // `$schema` is ours, not Vercel's; the real schema doesn't declare it.
  const { $schema: _ignored, ...rest } = config;
  checkObject(rest, schema, "vercel.json");
  console.log(
    problems.length
      ? `vercel.json — ${problems.length} problem(s) against ${SCHEMA_URL}`
      : `vercel.json validates against ${SCHEMA_URL}`,
  );
} else {
  console.log("Schema unreachable — checked structure only, not key names.");
}

// Structural checks that hold with or without the schema.
for (const [i, rule] of (config.headers ?? []).entries()) {
  if (typeof rule.source !== "string") {
    problems.push(`headers[${i}]: missing a string "source"`);
  }
  if (!Array.isArray(rule.headers) || rule.headers.length === 0) {
    problems.push(`headers[${i}]: "headers" must be a non-empty array`);
  }
  for (const [j, h] of (rule.headers ?? []).entries()) {
    if (typeof h?.key !== "string" || typeof h?.value !== "string") {
      problems.push(`headers[${i}].headers[${j}]: needs string key and value`);
    }
  }
}

for (const p of problems) console.log(`  ${p}`);
process.exit(problems.length ? 1 : 0);
