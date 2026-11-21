#!/usr/bin/env node
/* eslint-disable @typescript-eslint/no-require-imports */

/**
 * Checks the built declaration files of a package (`dist/esm/**\/*.d.ts`) for
 * module paths that resolve only inside this repository. An application's
 * `tsc` cannot follow such a path, and reports an error inside the package's
 * own declaration file.
 *
 * `tsc` writes such a path when it has to name a type that the source does
 * not name: the inferred type of an exported value whose type comes from
 * another package. With a `baseUrl` at the root of the repository that name
 * was `import("packages/tools/dist/esm/types")`. Without it the name is the
 * package path that this repository resolves, which an application resolves
 * too only when the package declares that package.
 *
 * `write-dist-esm-package-json.js` runs this check at the end of every
 * package build. To run it alone:
 *
 *   node scripts/check-dist-esm-declarations.js packages/tools
 */

const fs = require('fs');
const path = require('path');
const { builtinModules } = require('module');

/** A module path of an import, an export or an import type. */
const MODULE_PATH =
  /(?:\bimport\(|\bfrom\s+|\brequire\(|\bimport\s+)(["'])([^"'\n]+)\1/g;

/** A path into the sources or the build folder of a package of this repository. */
const PACKAGE_INTERNAL_PATH = /^@cornerstonejs\/[^/]+\/(?:src|dist)\//;

/**
 * Returns the name of the package of a bare module path, or null for a
 * relative path, an absolute path and a module of Node.
 */
function packageNameOf(specifier) {
  if (
    specifier.startsWith('.') ||
    specifier.startsWith('node:') ||
    path.isAbsolute(specifier)
  ) {
    return null;
  }

  const parts = specifier.split('/');
  const name = specifier.startsWith('@')
    ? parts.slice(0, 2).join('/')
    : parts[0];

  return builtinModules.includes(name) ? null : name;
}

/**
 * Returns the packages that the package of a `dist/esm` folder declares: its
 * own name, its dependencies and its peer dependencies. Returns null when
 * the folder has no package.json two levels up.
 */
function declaredPackages(distEsmDir) {
  const packageJsonPath = path.join(distEsmDir, '..', '..', 'package.json');

  if (!fs.existsSync(packageJsonPath)) {
    return null;
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));

  return new Set([
    packageJson.name,
    ...Object.keys(packageJson.dependencies ?? {}),
    ...Object.keys(packageJson.peerDependencies ?? {}),
    ...Object.keys(packageJson.optionalDependencies ?? {}),
  ]);
}

/**
 * Returns why a module path resolves only inside this repository, or null
 * when an application can resolve it. `declared` holds the packages that the
 * package declares, or null to skip that test.
 */
function repositoryOnlyReason(specifier, file, distEsmDir, declared) {
  if (specifier.startsWith('packages/')) {
    return 'a path from the root of this repository';
  }

  if (path.isAbsolute(specifier) || specifier.includes('node_modules/')) {
    return 'a path of this machine';
  }

  if (PACKAGE_INTERNAL_PATH.test(specifier)) {
    return 'a path into src or dist of a package, which its exports do not serve';
  }

  if (specifier.startsWith('.')) {
    const target = path.resolve(path.dirname(file), specifier);
    const inside = path.relative(distEsmDir, target);

    if (inside.startsWith('..') || path.isAbsolute(inside)) {
      return 'a relative path that leaves dist/esm';
    }
  }

  const packageName = packageNameOf(specifier);

  if (declared && packageName && !declared.has(packageName)) {
    return 'a package that is no dependency or peer dependency of this package';
  }

  return null;
}

/**
 * Returns the declaration files under a folder.
 */
function walkDeclarationFiles(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      walkDeclarationFiles(full, out);
    } else if (entry.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }

  return out;
}

/**
 * Returns every module path in the declaration files of a `dist/esm` folder
 * that resolves only inside this repository, with its file, line and reason.
 */
function findRepositoryOnlyPaths(distEsmDir) {
  const declared = declaredPackages(distEsmDir);
  const found = [];

  for (const file of walkDeclarationFiles(distEsmDir).sort()) {
    const lines = fs.readFileSync(file, 'utf8').split('\n');

    lines.forEach((text, index) => {
      for (const match of text.matchAll(MODULE_PATH)) {
        const reason = repositoryOnlyReason(
          match[2],
          file,
          distEsmDir,
          declared
        );

        if (reason) {
          found.push({
            file: path.relative(distEsmDir, file),
            line: index + 1,
            specifier: match[2],
            reason,
          });
        }
      }
    });
  }

  return found;
}

/**
 * Returns the message of a failed check: each path with its place, and what
 * to do about it.
 */
function describeRepositoryOnlyPaths(found, distEsmDir) {
  const places = found.map(
    ({ file, line, specifier, reason }) =>
      `  ${file}:${line}  "${specifier}"  (${reason})`
  );

  return [
    `Error: ${found.length} module path(s) in the declaration files of ${distEsmDir} resolve only inside this repository:`,
    ...places,
    'Give the exported value in the source an explicit type that it imports from the public path of its package (for example `import type { Types } from "@cornerstonejs/tools"`), and build again.',
  ].join('\n');
}

module.exports = { findRepositoryOnlyPaths, describeRepositoryOnlyPaths };

if (require.main === module) {
  const target = process.argv[2] || process.cwd();
  const nested = path.join(target, 'dist', 'esm');
  const distEsmDir = fs.existsSync(nested) ? nested : target;
  const found = findRepositoryOnlyPaths(distEsmDir);

  if (found.length) {
    console.error(describeRepositoryOnlyPaths(found, distEsmDir));
    process.exit(1);
  }

  console.log(`No repository-only module path in ${distEsmDir}`);
}
