/** @type {import('next').NextConfig} */
const nextConfig = {
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
  },
  // A deploy builds into a scratch directory and then swaps it into place, so
  // `next build` never rewrites the `.next` the running server is serving from
  // (doing that 502s the live site for the whole build). Unset in dev and in
  // local builds, where this is just ".next".
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
