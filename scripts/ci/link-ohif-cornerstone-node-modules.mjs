#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const [ohifDirArg] = process.argv.slice(2);

if (!ohifDirArg) {
  console.error(
    'Usage: node scripts/ci/link-ohif-cornerstone-node-modules.mjs <ohif-dir>'
  );
  process.exit(1);
}

const repoRoot = process.cwd();
const ohifDir = path.resolve(repoRoot, ohifDirArg);
const nodeModulesRoot = path.join(ohifDir, 'node_modules', '@cornerstonejs');

if (!fs.existsSync(path.join(ohifDir, 'package.json'))) {
  console.error(`Could not find OHIF package.json in ${ohifDir}`);
  process.exit(1);
}

if (!fs.existsSync(nodeModulesRoot)) {
  console.error(`Could not find ${nodeModulesRoot}. Run install first.`);
  process.exit(1);
}

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

for (const [packageName, localPath] of Object.entries(localPackages)) {
  const linkPath = path.join(nodeModulesRoot, packageName);
  const targetPath = path.join(repoRoot, localPath);

  fs.rmSync(linkPath, { recursive: true, force: true });
  fs.symlinkSync(targetPath, linkPath, 'dir');
}

console.log(`Linked local Cornerstone packages into ${nodeModulesRoot}`);
