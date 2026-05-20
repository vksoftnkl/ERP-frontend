/** @type {import('next').NextConfig} */
const nextConfig = {
  // Allow browser access through the LAN URL printed by `next dev`.
  allowedDevOrigins: ["192.168.0.*"],
};

export default nextConfig;
