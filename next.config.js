/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Allow trailing slash but don't force it
  trailingSlash: false,
  // Modify experimental features
  experimental: {
    // Allow static generation for error pages
    disableStaticGeneration: false,
  },
  // Add more detailed error reporting
  onDemandEntries: {
    maxInactiveAge: 25 * 1000,
    pagesBufferLength: 2,
  },
  // Add rewrites for coat of arms images
  async rewrites() {
    return [
      {
        source: 'https://backend.serenissima.ai/public/assets/images/coat-of-arms/:path*',
        destination: '/apihttps://backend.serenissima.ai/public/assets/images/coat-of-arms/:path*',
      },
    ];
  },
}

module.exports = nextConfig
