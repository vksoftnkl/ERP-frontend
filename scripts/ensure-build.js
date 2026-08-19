#!/usr/bin/env node
/**
 * Build gate for `npm start` on CloudJiffy (Jelastic).
 *
 * The platform deploys by pulling this repo into the existing app directory and
 * restarting the node, so `.next/` (gitignored) survives the pull. The old guard
 * -- `[ -f .next/BUILD_ID ] || next build` -- therefore skipped the rebuild and
 * `next start` happily served the previous deploy's bundle: pushed code was live
 * on disk but invisible in the browser.
 *
 * This rebuilds when either input to the bundle has moved:
 *   1. any tracked source file is newer than .next/BUILD_ID (a git pull bumps
 *      the mtime of every file it changes), or
 *   2. the NEXT_PUBLIC_* env vars differ from the ones baked into the last build
 *      (they are inlined at build time, so changing one in the dashboard alone
 *      would otherwise have no effect).
 */
const { execFileSync } = require("node:child_process");
const { createHash } = require("node:crypto");
const fs = require("node:fs");
const path = require("node:path");

const root = path.resolve(__dirname, "..");
const buildIdPath = path.join(root, ".next", "BUILD_ID");
const fingerprintPath = path.join(root, ".next", "deploy-fingerprint");

// Source roots plus the build-shaping files at the repo root.
const SOURCE_DIRS = [
  "app", "components", "config", "domain", "features", "hooks", "lib",
  "public", "services", "store", "styles", "types",
];
const SOURCE_FILES = [
  "next.config.mjs", "package.json", "package-lock.json", "postcss.config.mjs",
  "tailwind.config.ts", "tsconfig.json",
];
const SKIP_DIRS = new Set(["node_modules", ".next", ".git"]);

function envFingerprint() {
  const publicEnv = Object.keys(process.env)
    .filter((key) => key.startsWith("NEXT_PUBLIC_"))
    .sort()
    .map((key) => `${key}=${process.env[key]}`)
    .join("\n");
  return createHash("sha256").update(publicEnv).digest("hex");
}

function newestMtime(target, limit) {
  let stat;
  try {
    stat = fs.statSync(target);
  } catch {
    return 0;
  }
  if (!stat.isDirectory()) return stat.mtimeMs;
  let newest = stat.mtimeMs;
  for (const entry of fs.readdirSync(target, { withFileTypes: true })) {
    if (entry.isDirectory() && SKIP_DIRS.has(entry.name)) continue;
    newest = Math.max(newest, newestMtime(path.join(target, entry.name), limit));
    // Any single file newer than the build already settles it -- stop walking.
    if (newest > limit) return newest;
  }
  return newest;
}

function reasonToBuild() {
  if (!fs.existsSync(buildIdPath)) return "no previous build found";

  const builtAt = fs.statSync(buildIdPath).mtimeMs;
  for (const entry of [...SOURCE_DIRS, ...SOURCE_FILES]) {
    if (newestMtime(path.join(root, entry), builtAt) > builtAt) {
      return `source changed since last build (${entry})`;
    }
  }

  const previous = fs.existsSync(fingerprintPath)
    ? fs.readFileSync(fingerprintPath, "utf8").trim()
    : "";
  if (previous !== envFingerprint()) return "NEXT_PUBLIC_* env vars changed";

  return null;
}

const reason = reasonToBuild();
if (!reason) {
  console.log("[ensure-build] up to date, skipping next build");
  process.exit(0);
}

console.log(`[ensure-build] rebuilding: ${reason}`);
try {
  execFileSync("npx", ["--no-install", "next", "build"], { cwd: root, stdio: "inherit" });
} catch (error) {
  // A failed rebuild must not take the site down: if the previous bundle is
  // still on disk, serve it and shout in the log. Only a node with nothing to
  // serve fails the unit, because there `next start` would crash anyway.
  if (!fs.existsSync(buildIdPath)) throw error;
  console.error(
    "[ensure-build] BUILD FAILED -- starting the PREVIOUS build instead. " +
      "The site is live but STALE until this is fixed.",
  );
  process.exit(0);
}
fs.writeFileSync(fingerprintPath, envFingerprint());
