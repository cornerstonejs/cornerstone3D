#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

// Finalizes a package's `dist/esm` output for native Node ESM resolution.
//
// 1. Writes a minimal `package.json` declaring `{"type":"module"}` into
//    `dist/esm`. The root package.json is intentionally not `type:module`, so
//    root-level config files stay CJS.
// 2. Rewrites emitted runtime imports from dependency subpaths that native Node
//    ESM cannot resolve while extensionless.
//
// See https://github.com/cornerstonejs/cornerstone3D/issues/2763

const fs = require('fs');
const path = require('path');

const packagePath = process.argv[2] || process.cwd();
const distEsmDir = path.join(packagePath, 'dist', 'esm');
const RUNTIME_IMPORT_RE =
  /((?:from\s*|import\s*\(\s*|import\s*)['"])(@kitware\/vtk\.js\/[^'"]+|gl-matrix\/[^'"]+)(['"])/g;
const JS_EXT_RE = /\.(?:cjs|mjs|js|json)$/;

if (!fs.existsSync(distEsmDir)) {
  console.error(
    `Error: dist/esm not found at ${distEsmDir}; run the build before this step`
  );
  process.exit(1);
}

const target = path.join(distEsmDir, 'package.json');
fs.writeFileSync(target, `${JSON.stringify({ type: 'module' }, null, 2)}\n`);
console.log(`Wrote ${path.relative(packagePath, target)}`);

const dependencyRoots = {
  glMatrix: resolvePackageRoot('gl-matrix'),
  vtk: resolvePackageRoot('@kitware/vtk.js'),
};
const rewritten = rewriteRuntimeImports(distEsmDir, dependencyRoots);
if (rewritten) {
  console.log(`Rewrote ${rewritten} native-Node runtime import specifier(s)`);
}

function resolvePackageRoot(packageName) {
  return path.dirname(
    require.resolve(`${packageName}/package.json`, {
      paths: [packagePath, process.cwd()],
    })
  );
}

function rewriteRuntimeImports(dir, dependencyRoots) {
  let rewritten = 0;
  for (const file of walkJsFiles(dir)) {
    const original = fs.readFileSync(file, 'utf8');
    const next = original.replace(
      RUNTIME_IMPORT_RE,
      (match, prefix, spec, quote) => {
        const resolved = resolveRuntimeSpecifier(spec, dependencyRoots);
        if (resolved === spec) {
          return match;
        }
        rewritten += 1;
        return `${prefix}${resolved}${quote}`;
      }
    );

    if (next !== original) {
      fs.writeFileSync(file, next);
    }
  }
  return rewritten;
}

function resolveRuntimeSpecifier(spec, dependencyRoots) {
  if (JS_EXT_RE.test(spec)) {
    return spec;
  }

  if (spec.startsWith('@kitware/vtk.js/')) {
    const vtkRel = spec.slice('@kitware/vtk.js/'.length);
    const jsTarget = path.join(dependencyRoots.vtk, `${vtkRel}.js`);
    if (!fs.existsSync(jsTarget)) {
      throw new Error(
        `Cannot resolve ${spec}.js from vtk.js; update the source import or postbuild rewrite.`
      );
    }
    return `${spec}.js`;
  }

  if (spec.startsWith('gl-matrix/')) {
    const glMatrixRel = spec.slice('gl-matrix/'.length);
    const jsTarget = path.join(
      dependencyRoots.glMatrix,
      'esm',
      `${glMatrixRel}.js`
    );
    if (!fs.existsSync(jsTarget)) {
      throw new Error(
        `Cannot resolve gl-matrix/esm/${glMatrixRel}.js; update the source import or postbuild rewrite.`
      );
    }
    return `gl-matrix/esm/${glMatrixRel}.js`;
  }

  return spec;
}

function walkJsFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkJsFiles(full, out);
    } else if (entry.name.endsWith('.js')) {
      out.push(full);
    }
  }
  return out;
}
