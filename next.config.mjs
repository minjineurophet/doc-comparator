/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',
  basePath: '/doc-comparator',
  assetPrefix: '/doc-comparator',
  trailingSlash: true,
  images: { unoptimized: true },
  turbopack: {},
};

export default nextConfig;
