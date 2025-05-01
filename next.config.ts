import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  
  // Add this to ensure service worker is served correctly
  async headers() {
    return [
      {
        source: '/service-worker.js',
        headers: [
          {
            key: 'Cache-Control',
            value: 'public, max-age=0, must-revalidate',
          },
          {
            key: 'Service-Worker-Allowed',
            value: '/',
          },
        ],
      },
    ];
  },
};

export default nextConfig;
