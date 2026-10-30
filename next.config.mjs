import { readFileSync } from "node:fs";

// The package's version, shown in the user menu's footer.
const { version: appVersion } = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
);

/** @type {import('next').NextConfig} */
const nextConfig = {
  env: {
    NEXT_PUBLIC_APP_VERSION: appVersion,
  },
  // Allow browser access through the LAN URL printed by `next dev`.
  allowedDevOrigins: ["192.168.0.*"],
  // Tree-shake barrel packages (react-icons/fi etc.) so a few-icon import doesn't
  // drag the whole barrel through the bundler on every cold compile.
  experimental: {
    optimizePackageImports: ["react-icons"],
  },
  // Test files and vitest.config.ts are excluded there, so a production install
  // (no devDependencies) can still typecheck and build.
  typescript: {
    tsconfigPath: "tsconfig.build.json",
    // The VPS deploy type-checks with `tsc --incremental` instead: Next writes
    // its incremental cache before computing the diagnostics, so its own check
    // never reuses anything and cost ~5.5 min per deploy. Unset everywhere else,
    // so local and CI builds still type-check here.
    ignoreBuildErrors: process.env.NEXT_SKIP_TYPECHECK === "1",
  },
  // A deploy builds into a scratch directory and then swaps it into place, so
  // `next build` never rewrites the `.next` the running server is serving from
  // (doing that 502s the live site for the whole build). Unset in dev and in
  // local builds, where this is just ".next".
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
