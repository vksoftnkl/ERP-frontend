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

const strict = process.argv.includes("--strict");
const root = path.resolve(__dirname, "..");
// Mirrors next.config.mjs: a deploy points this at a scratch dir it later swaps
// into place, so the build markers must live beside that build, not in `.next`.
const distDir = process.env.NEXT_DIST_DIR || ".next";
const buildIdPath = path.join(root, distDir, "BUILD_ID");
const fingerprintPath = path.join(root, distDir, "deploy-fingerprint");

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

// Next writes one route-type stub per page into `<distDir>/types`, and
// tsconfig.json type-checks `.next/types` whatever distDir the build actually
// uses (a deploy points NEXT_DIST_DIR at a scratch dir). Stubs left behind by an
// earlier build therefore keep validating routes that have since moved or been
// deleted -- `Cannot find module '../../app/(marketing)/page.js'` fails a build
// whose sources are perfectly fine. They are regenerated from the live route
// tree on every build, and `next start` never reads them, so clearing them first
// costs nothing.
function clearGeneratedRouteTypes() {
  for (const target of new Set([
    path.join(root, distDir, "types"),
    path.join(root, ".next", "types"),
    path.join(root, ".next", "dev", "types"),
  ])) {
    fs.rmSync(target, { recursive: true, force: true });
  }
}

console.log(`[ensure-build] rebuilding: ${reason}`);
clearGeneratedRouteTypes();
try {
  execFileSync("npx", ["--no-install", "next", "build"], { cwd: root, stdio: "inherit" });
} catch (error) {
  // A failed rebuild must not take the site down: if the previous bundle is
  // still on disk, serve it and shout in the log. Only a node with nothing to
  // serve fails the unit, because there `next start` would crash anyway.
  //
  // `--strict` opts out of that fallback. The deploy pipeline passes it because
  // a CI run that "succeeds" by silently shipping the previous bundle is worse
  // than a red build -- there, failing loud is the whole point.
  if (strict || !fs.existsSync(buildIdPath)) throw error;
  console.error(
    "[ensure-build] BUILD FAILED -- starting the PREVIOUS build instead. " +
      "The site is live but STALE until this is fixed.",
  );
  process.exit(0);
}
fs.writeFileSync(fingerprintPath, envFingerprint());
