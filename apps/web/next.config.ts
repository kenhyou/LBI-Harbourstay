import type { NextConfig } from 'next';

const nextConfig: NextConfig = {
  // @harbourstay/shared is prebuilt to dist (CJS), so no transpilePackages needed.
  // API base URL for server-side (RSC) fetches lives in process.env.API_URL.
};

export default nextConfig;
