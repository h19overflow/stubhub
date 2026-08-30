import type { NextConfig } from "next";

const identityServiceUrl = process.env.IDENTITY_SERVICE_URL ?? "http://localhost:3001";
const ticketsServiceUrl = process.env.TICKETS_SERVICE_URL ?? "http://localhost:3002";
const ordersServiceUrl = process.env.ORDERS_SERVICE_URL ?? "http://localhost:3003";
const moderationServiceUrl =
  process.env.MODERATION_SERVICE_URL ?? "http://localhost:3004";
const nextConfig: NextConfig = {
  async rewrites() {
    return [
      {
        source: "/api/identity/:path*",
        destination: `${identityServiceUrl}/:path*`,
      },
      {
        source: "/api/tickets/internal/:path*",
        destination: "/404",
      },
      {
        source: "/api/tickets/:path*",
        destination: `${ticketsServiceUrl}/:path*`,
      },
      {
        source: "/api/orders/:path*",
        destination: `${ordersServiceUrl}/:path*`,
      },
      {
        source: "/api/moderation/:path*",
        destination: `${moderationServiceUrl}/:path*`,
      },
      {
        source: "/ticket-images/:path*",
        destination: `${ticketsServiceUrl}/ticket-images/:path*`,
      },
    ];
  },
};

export default nextConfig;
