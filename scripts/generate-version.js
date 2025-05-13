#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Get the package path from the arguments
const packagePath = process.argv[2];

if (!packagePath) {
  console.error('Error: Package path is required');
  process.exit(1);
}

// Read the package.json file
const packageJsonPath = path.join(packagePath, 'package.json');
let packageJson;

try {
  packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
} catch (error) {
  console.error(`Error reading package.json at ${packageJsonPath}:`, error);
  process.exit(1);
}

// Create the version.ts file content
const versionContent = `/**
 * Auto-generated from package.json version
 * Do not modify this file directly
 */
export const version = '${packageJson.version}';\n`;

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
