'use strict';
/**
 * Cross-platform Electron build script.
 *
 * Steps:
 *   1. next build          → creates .next/standalone/
 *   2. Copy public/ and .next/static/ into the standalone directory
 *      (Next.js standalone omits them by design; they must be added manually)
 *   3. electron-builder    → produces installers in dist/
 *
 * Usage:
 *   npm run electron:build        → build + package installer
 *   npm run electron:pack         → build + unpackaged dir only (fast test)
 */

const { execSync } = require('child_process');
const { cpSync, existsSync } = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const standalone = path.join(root, '.next', 'standalone');

// ── Step 1: Next.js build ─────────────────────────────────────────────────────
console.log('\n[1/3] Building Next.js (standalone output)…');
execSync('npm run build', { stdio: 'inherit', cwd: root });

if (!existsSync(standalone)) {
  console.error('ERROR: .next/standalone not found after build.');
  console.error('Ensure next.config.mjs has output: "standalone".');
  process.exit(1);
}

// ── Step 2: Copy static assets into standalone ────────────────────────────────
// Next.js standalone intentionally omits public/ and .next/static/ (they are
// typically served via CDN). For Electron we must bundle them with the server.
console.log('\n[2/3] Copying public/ and .next/static/ into standalone…');
cpSync(
  path.join(root, 'public'),
  path.join(standalone, 'public'),
  { recursive: true }
);
cpSync(
  path.join(root, '.next', 'static'),
  path.join(standalone, '.next', 'static'),
  { recursive: true }
);

// ── Step 3: electron-builder ──────────────────────────────────────────────────
const isDirOnly = process.argv.includes('--dir');
const builderArgs = isDirOnly ? '--dir' : '';

console.log(`\n[3/3] Running electron-builder${isDirOnly ? ' (directory only)' : ''}…`);
execSync(`npx electron-builder ${builderArgs}`.trim(), { stdio: 'inherit', cwd: root });

console.log('\n✅ Build complete. Check the dist/ directory.');
