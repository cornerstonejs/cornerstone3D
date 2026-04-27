#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const [ohifDirArg] = process.argv.slice(2);

if (!ohifDirArg) {
  console.error(
    'Usage: node scripts/link-ohif-cornerstone-node-modules.mjs <ohif-dir>'
  );
  process.exit(1);
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const ohifDir = path.resolve(process.cwd(), ohifDirArg);
const nodeModulesRoot = path.join(ohifDir, 'node_modules', '@cornerstonejs');

if (!fs.existsSync(path.join(ohifDir, 'package.json'))) {
  console.error(`Could not find OHIF package.json in ${ohifDir}`);
  process.exit(1);
}

if (!fs.existsSync(nodeModulesRoot)) {
  fs.mkdirSync(nodeModulesRoot, { recursive: true });
}

const localPackages = {
  adapters: 'packages/adapters',
  ai: 'packages/ai',
  core: 'packages/core',
  'dicom-image-loader': 'packages/dicomImageLoader',
  metadata: 'packages/metadata',
  'labelmap-interpolation': 'packages/labelmap-interpolation',
  'nifti-volume-loader': 'packages/nifti-volume-loader',
  'polymorphic-segmentation': 'packages/polymorphic-segmentation',
  tools: 'packages/tools',
};

for (const [packageName, localPath] of Object.entries(localPackages)) {
  const linkPath = path.join(nodeModulesRoot, packageName);
  const targetPath = path.join(repoRoot, localPath);

  if (!fs.existsSync(targetPath)) {
    console.error(`Local package path not found: ${targetPath}`);
    process.exit(1);
  }

  fs.rmSync(linkPath, { recursive: true, force: true });
  fs.symlinkSync(targetPath, linkPath, 'dir');
}

// Compatibility for OHIF Jest mappings that expect @cornerstonejs/*/dist/esm.
// calculate-suv only ships dist/ (without dist/esm), so create an alias.
const calculateSUVDistDir = path.join(
  nodeModulesRoot,
  'calculate-suv',
  'dist'
);
const calculateSUVDistEsmDir = path.join(calculateSUVDistDir, 'esm');

if (fs.existsSync(calculateSUVDistDir) && !fs.existsSync(calculateSUVDistEsmDir)) {
  fs.mkdirSync(calculateSUVDistEsmDir, { recursive: true });
  const shimContents = "module.exports = require('../index.js');\n";
  fs.writeFileSync(path.join(calculateSUVDistEsmDir, 'index.js'), shimContents, 'utf8');
  console.log(
    `Created calculate-suv dist/esm compatibility shim: ${calculateSUVDistEsmDir}/index.js`
  );
}

console.log(`Linked local Cornerstone packages into ${nodeModulesRoot}`);
