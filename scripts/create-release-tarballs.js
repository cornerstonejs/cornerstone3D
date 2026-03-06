#!/usr/bin/env node
/**
 * Creates npm pack tarballs for all publishable (Lerna) packages and writes
 * them into the given output directory. Used by OHIF integration workflows.
 */
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const rootDir = path.resolve(__dirname, '..');
const outDir = path.resolve(rootDir, process.env.RELEASE_TARBALLS_DIR || 'release-tarballs');

const lernaPath = path.join(rootDir, 'lerna.json');
const lerna = require(lernaPath);

fs.mkdirSync(outDir, { recursive: true });

for (const pkg of lerna.packages) {
  const cwd = path.join(rootDir, pkg);
  execSync('npm pack --pack-destination "' + outDir + '"', {
    cwd,
    stdio: 'inherit',
  });
}

console.log('Tarballs written to', outDir);
