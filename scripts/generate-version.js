#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

const fs = require('fs');
const path = require('path');

// Get the package path from the arguments
const packagePath = process.argv[2];

if (!packagePath) {
  console.error('Error: Package path is required');
  process.exit(1);
}

// Only stamp version.ts for packages that are actually published. Published
// packages set publishConfig.access to 'public'; anything else (e.g. the private
// docs site) is skipped rather than failing the release.
const packageJsonPath = path.join(packagePath, 'package.json');
let packageJson;
try {
  packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
} catch (error) {
  console.log(`Skipping ${packagePath}: could not read package.json`);
  process.exit(0);
}

if (packageJson.publishConfig?.access !== 'public') {
  console.log(`Skipping ${packagePath}: publishConfig.access is not 'public'`);
  process.exit(0);
}

// A published package may still have no src directory (e.g. the codemods
// registry package). There is nowhere to stamp version.ts, so skip rather than
// fail the release.
const srcDir = path.join(packagePath, 'src');
if (!fs.existsSync(srcDir)) {
  console.log(`Skipping ${packagePath}: no src directory`);
  process.exit(0);
}

// Read the version.json file from the root directory (two levels up from scripts/)
const rootDir = path.resolve(__dirname, '..');
const versionJsonPath = path.join(rootDir, 'version.json');
let versionData;

try {
  versionData = JSON.parse(fs.readFileSync(versionJsonPath, 'utf8'));
} catch (error) {
  console.error(`Error reading version.json at ${versionJsonPath}:`, error);
  process.exit(1);
}

// Create the version.ts file content
const versionContent = `/**
 * Auto-generated from version.json
 * Do not modify this file directly
 */
export const version = '${versionData.version}';\n`;

// Write the version.ts file
const versionFilePath = path.join(srcDir, 'version.ts');
try {
  fs.writeFileSync(versionFilePath, versionContent);
  console.log(`Version exported to ${versionFilePath}`);
} catch (error) {
  console.error(`Error writing version.ts file:`, error);
  process.exit(1);
}
