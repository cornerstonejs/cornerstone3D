#!/usr/bin/env node

/**
 * Removes symlinked Cornerstone packages from an OHIF project's node_modules
 * and restores them from the registry.
 *
 * Counterpart to scripts/link-ohif-cornerstone-node-modules.mjs
 *
 * Usage: node scripts/unlink-ohif-cornerstone-node-modules.mjs <ohif-dir>
 */

import fs from 'node:fs';
import path from 'node:path';
import { execSync } from 'node:child_process';

const [ohifDirArg] = process.argv.slice(2);

if (!ohifDirArg) {
  console.error(
    'Usage: node scripts/unlink-ohif-cornerstone-node-modules.mjs <ohif-dir>'
  );
  process.exit(1);
}

const ohifDir = path.resolve(process.cwd(), ohifDirArg);
const nodeModulesRoot = path.join(ohifDir, 'node_modules', '@cornerstonejs');

if (!fs.existsSync(path.join(ohifDir, 'package.json'))) {
  console.error(`Could not find OHIF package.json in ${ohifDir}`);
  process.exit(1);
}

if (!fs.existsSync(nodeModulesRoot)) {
  console.error(`Could not find ${nodeModulesRoot}. Run install first.`);
  process.exit(1);
}

// Same package list as link-ohif-cornerstone-node-modules.mjs
const localPackages = {
  adapters: 'packages/adapters',
  ai: 'packages/ai',
  core: 'packages/core',
  'dicom-image-loader': 'packages/dicomImageLoader',
  'labelmap-interpolation': 'packages/labelmap-interpolation',
  'nifti-volume-loader': 'packages/nifti-volume-loader',
  'polymorphic-segmentation': 'packages/polymorphic-segmentation',
  tools: 'packages/tools',
};

let removed = 0;
for (const packageName of Object.keys(localPackages)) {
  const linkPath = path.join(nodeModulesRoot, packageName);
  try {
    const stat = fs.lstatSync(linkPath);
    if (stat.isSymbolicLink()) {
      fs.rmSync(linkPath, { recursive: true });
      console.log(`  Removed symlink: @cornerstonejs/${packageName}`);
      removed++;
    }
  } catch {
    // doesn't exist or not a symlink — skip
  }
}

if (removed === 0) {
  console.log('No symlinks found — nothing to unlink.');
} else {
  console.log(`\nRemoved ${removed} symlink(s).`);
}

// Restore packages from registry
console.log('\nRestoring packages from registry (yarn install --frozen-lockfile)...');
try {
  execSync('yarn install --frozen-lockfile', { cwd: ohifDir, stdio: 'inherit' });
} catch {
  console.log('Frozen lockfile install failed, retrying without --frozen-lockfile...');
  execSync('yarn install', { cwd: ohifDir, stdio: 'inherit' });
}

console.log('\nDone. Packages restored from registry.');
