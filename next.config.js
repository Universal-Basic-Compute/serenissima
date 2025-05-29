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
  images: {
    domains: ['backend.serenissima.ai', 'via.placeholder.com'], // Added backend.serenissima.ai and via.placeholder.com for fallbacks
  },
}

module.exports = nextConfig
