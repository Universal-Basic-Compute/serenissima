/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Disable static generation for all pages
  // This ensures pages are server-rendered or SSR on each request
  staticPageGenerationTimeout: 0,
  // Set pages to be dynamic by default
  trailingSlash: true,
  // Disable automatic static optimization
  experimental: {
    // Disable static generation for all pages
    disableStaticGeneration: true,
  }
}

module.exports = nextConfig
