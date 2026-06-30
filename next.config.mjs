/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow browser access through the LAN URL printed by `next dev`.
  allowedDevOrigins: ["192.168.0.*"],
  // Tree-shake barrel packages (react-icons/fi etc.) so a few-icon import doesn't
  // drag the whole barrel through the bundler on every cold compile.
  experimental: {
    optimizePackageImports: ["react-icons"],
  },
};

export default nextConfig;
