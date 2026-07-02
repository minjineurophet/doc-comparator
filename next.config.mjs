/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {},
  output: 'standalone',
  // Pin the standalone tracing root to this project dir. Without this, Next
  // walks up to the nearest parent lockfile (e.g. when building inside a git
  // worktree under the repo) and nests server.js under that relative path,
  // breaking electron/main.js which expects resources/next-server/server.js.
  outputFileTracingRoot: import.meta.dirname,
};

export default nextConfig;
