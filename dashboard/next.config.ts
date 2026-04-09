import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Revalidate dashboard data every 60 seconds on Vercel
  experimental: {},
};

export default nextConfig;
