'use strict';
/**
 * electron-builder afterPack hook — ad-hoc code-sign the macOS .app.
 *
 * Why this exists:
 *   This project ships without an Apple Developer ID (internal distribution).
 *   When no signing certificate is present, electron-builder skips code signing
 *   entirely, leaving only the linker's default ad-hoc signature on the main
 *   Mach-O. That bundle signature is invalid ("Sealed Resources=none"), so on
 *   Apple Silicon macOS refuses to launch the downloaded app — it appears as
 *   "손상되었기 때문에 열 수 없습니다" (damaged / cannot be opened).
 *
 *   Apple Silicon REQUIRES a valid signature to run any executable. This hook
 *   applies a proper ad-hoc signature (identity "-") that seals all nested
 *   helpers, frameworks, and resources, producing a launchable bundle.
 *
 * Note: ad-hoc is NOT notarized. After downloading, users must clear the
 *   quarantine attribute once (right-click → Open, or `xattr -cr <app>`).
 *   See README for the exact steps.
 */

const { execSync } = require('child_process');
const path = require('path');

exports.default = async function afterPack(context) {
  if (context.electronPlatformName !== 'darwin') return;

  const appName = `${context.packager.appInfo.productFilename}.app`;
  const appPath = path.join(context.appOutDir, appName);

  console.log(`[afterPack] ad-hoc signing ${appPath}`);
  // --deep signs nested code (Helper apps, Frameworks) inside-out.
  // --force replaces the invalid linker-only signature.
  // --sign - is the ad-hoc identity.
  execSync(`codesign --force --deep --sign - "${appPath}"`, { stdio: 'inherit' });

  // Fail the build loudly if the signature is not valid.
  console.log('[afterPack] verifying signature…');
  execSync(`codesign --verify --deep --strict --verbose=2 "${appPath}"`, {
    stdio: 'inherit',
  });
  console.log('[afterPack] ad-hoc signature OK');
};
