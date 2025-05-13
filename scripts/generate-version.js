#!/usr/bin/env node

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get the current file's directory
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Get the package path from the arguments
const packagePath = process.argv[2];

if (!packagePath) {
  console.error('Error: Package path is required');
  process.exit(1);
}

// Get the root directory (two levels up from scripts/)
const rootDir = path.resolve(__dirname, '..');

// Read the version.json file from the root directory
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

// Determine the src directory
const srcDir = path.join(packagePath, 'src');
if (!fs.existsSync(srcDir)) {
  console.error(`Error: src directory not found at ${srcDir}`);
  process.exit(1);
}

// Write the version.ts file
const versionFilePath = path.join(srcDir, 'version.ts');
try {
  fs.writeFileSync(versionFilePath, versionContent);
  console.log(`Version exported to ${versionFilePath}`);
} catch (error) {
  console.error(`Error writing version.ts file:`, error);
  process.exit(1);
}
