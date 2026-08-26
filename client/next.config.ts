import type { NextConfig } from "next";

const identityServiceUrl = process.env.IDENTITY_SERVICE_URL ?? "http://localhost:3001";

const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/identity/:path*",
        destination: `${identityServiceUrl}/:path*`,
      },
    ];
  },
};

export default nextConfig;
