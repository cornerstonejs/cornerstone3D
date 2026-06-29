#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

// Writes a minimal `package.json` declaring `{"type":"module"}` into a package's
// `dist/esm` directory as a postbuild step. The published files under `dist/esm`
// are emitted as ES modules, but without this marker Node classifies bare `.js`
// files as CommonJS (the root package.json is intentionally not `type:module`,
// so root-level config files stay CJS). Scoping the marker to `dist/esm` makes
// Node resolve the output as ESM without affecting the rest of the package.
// See https://github.com/cornerstonejs/cornerstone3D/issues/2763

const fs = require('fs');
const path = require('path');

const packagePath = process.argv[2] || process.cwd();
const distEsmDir = path.join(packagePath, 'dist', 'esm');

if (!fs.existsSync(distEsmDir)) {
  console.error(
    `Error: dist/esm not found at ${distEsmDir}; run the build before this step`
  );
  process.exit(1);
}

const target = path.join(distEsmDir, 'package.json');
fs.writeFileSync(target, `${JSON.stringify({ type: 'module' }, null, 2)}\n`);
console.log(`Wrote ${path.relative(packagePath, target)}`);
