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
  utils: 'packages/utils',
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

// Pin OHIF's jest runner/test-framework to OHIF's own jest version.
//
// In the downstream CI, OHIF is checked out *inside* the Cornerstone repo
// (the `ohif/` subdir) and Cornerstone installs with node-linker=hoisted, so
// jest 30's `jest-runner` / `jest-circus` sit flat at
// <cornerstone-root>/node_modules. Jest resolves its default runner and test
// framework by bare specifier ("jest-runner", "jest-circus/runner"). When
// those packages are not resolvable inside OHIF (pnpm's default isolated
// layout, or an older jest whose jest-config doesn't list them as deps), Node's
// resolver walks up out of OHIF and into the Cornerstone repo root, loading the
// mismatched jest 30 runner under OHIF's older jest. The result is the cryptic
//   TypeError: Cannot read properties of undefined (reading 'leakDetector')
// (jest 30's runTest destructuring an undefined return from jest 29's core).
//
// Shadow OHIF's own copies at OHIF's top-level node_modules so resolution stops
// inside OHIF and never escapes to the Cornerstone parent. Purely additive: if
// OHIF already resolves the correct major (e.g. hoisted layout) we leave it be.
pinOhifJestPackages();

console.log(`Linked local Cornerstone packages into ${nodeModulesRoot}`);

function pinOhifJestPackages() {
  const ohifNodeModules = path.join(ohifDir, 'node_modules');

  let jestMajor;
  try {
    const jestPkg = JSON.parse(
      fs.readFileSync(path.join(ohifNodeModules, 'jest', 'package.json'), 'utf8')
    );
    jestMajor = jestPkg.version.split('.')[0];
  } catch {
    console.log(
      'Could not determine OHIF jest version; skipping jest runner pinning.'
    );
    return;
  }

  // jest, jest-runner and jest-circus are released in lockstep, so the major
  // of the meta `jest` package is the one we want for the runner/framework.
  for (const pkgName of ['jest-runner', 'jest-circus']) {
    const linkPath = path.join(ohifNodeModules, pkgName);

    if (packageMajorAt(linkPath) === jestMajor) {
      continue; // already correct (e.g. hoisted layout) — nothing to do
    }

    const target = locateOhifPackage(ohifNodeModules, pkgName, jestMajor);
    if (!target) {
      console.log(
        `Could not locate OHIF ${pkgName}@${jestMajor}; leaving resolution as-is.`
      );
      continue;
    }

    fs.rmSync(linkPath, { recursive: true, force: true });
    fs.symlinkSync(target, linkPath, 'dir');
    console.log(`Pinned ${pkgName} -> ${target}`);
  }
}

// Reads the major version of a package directory, following symlinks. Returns
// null when the package or its package.json is missing.
function packageMajorAt(pkgDir) {
  try {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(pkgDir, 'package.json'), 'utf8')
    );
    return pkg.version.split('.')[0];
  } catch {
    return null;
  }
}

// Finds OHIF's own copy of a jest package matching the requested major,
// preferring an already-correct top-level entry and otherwise scanning the
// pnpm virtual store (node_modules/.pnpm/<pkg>@<major>.<...>/node_modules/<pkg>).
function locateOhifPackage(ohifNodeModules, pkgName, major) {
  const direct = path.join(ohifNodeModules, pkgName);
  if (packageMajorAt(direct) === major) {
    return direct;
  }

  const pnpmDir = path.join(ohifNodeModules, '.pnpm');
  if (!fs.existsSync(pnpmDir)) {
    return null;
  }

  // pnpm encodes scoped names with `+` and appends peer-dep suffixes after `_`.
  const prefix = `${pkgName.replace('/', '+')}@${major}.`;
  for (const entry of fs.readdirSync(pnpmDir)) {
    if (!entry.startsWith(prefix)) {
      continue;
    }
    const candidate = path.join(pnpmDir, entry, 'node_modules', pkgName);
    if (packageMajorAt(candidate) === major) {
      return candidate;
    }
  }

  return null;
}
