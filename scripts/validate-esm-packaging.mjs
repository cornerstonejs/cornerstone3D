// Validates that every published @cornerstonejs/* package ships correct,
// natively-resolvable ESM, so bundler AND native-Node consumers can always
// load it. Guards the packaging work from https://github.com/cornerstonejs/cornerstone3D/issues/2763
// from ever regressing. Run AFTER building (dist/esm must exist).
//
// Per package it checks:
//   1. ESM marker     - dist/esm/package.json declares {"type":"module"}
//   2. Import scan     - every relative import/export in emitted .js and .d.ts
//                        carries an explicit extension and resolves to a real file
//   3. Asset URLs      - relative `new URL(x, import.meta.url)` targets exist
//                        (e.g. the dicom-image-loader decode worker)
//   4. publint         - no error-level packaging problems
//   5. attw            - types resolve under the esm-only profile
//   6. Node import      - a leaf module loads in native Node ESM
//
// Usage: node scripts/validate-esm-packaging.mjs [pkgName ...]
//        node scripts/validate-esm-packaging.mjs --skip-attw

import { execFileSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync } from 'node:fs';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const skipAttw = args.includes('--skip-attw');
const nameFilter = args.filter((a) => !a.startsWith('--'));

// Extensions that count as a resolved JS module specifier.
const JS_EXTS = ['.js', '.mjs', '.cjs', '.json'];
const NATIVE_NODE_EXTENSION_REQUIRED_PREFIXES = [
  '@kitware/vtk.js/',
  'gl-matrix/',
];
const GLOB_CHARS = /[*?[\]{}]/;

function assertLiteralPackageDirs(packageDirs) {
  for (const rel of packageDirs) {
    if (
      typeof rel !== 'string' ||
      !rel ||
      rel.startsWith('!') ||
      GLOB_CHARS.test(rel)
    ) {
      throw new Error(
        `lerna.json package entry '${rel}' must be a literal package directory, not a glob`
      );
    }
  }
}

function listPublishedPackages() {
  const lerna = JSON.parse(readFileSync(join(repoRoot, 'lerna.json'), 'utf8'));
  assertLiteralPackageDirs(lerna.packages);
  const pkgs = [];
  for (const rel of lerna.packages) {
    // lerna.json entries here are literal directories, not globs.
    const dir = join(repoRoot, rel);
    const pkgJsonPath = join(dir, 'package.json');
    if (!existsSync(pkgJsonPath)) {
      continue;
    }
    const json = JSON.parse(readFileSync(pkgJsonPath, 'utf8'));
    // In scope: anything that declares an exports map and has built ESM.
    // This naturally excludes the source-only codemods package.
    if (!json.exports || !existsSync(join(dir, 'dist', 'esm'))) {
      continue;
    }
    pkgs.push({ name: json.name, dir, json });
  }
  return pkgs;
}

function walk(dir, predicate, out = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full, predicate, out);
    } else if (predicate(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

// Pull every module specifier out of a JS/d.ts file.
function moduleSpecifiers(code) {
  const specs = [];
  const patterns = [
    /(?:^|[^.\w])(?:import|export)\s[^'"]*?from\s*['"]([^'"]+)['"]/g, // import/export ... from 'x'
    /(?:^|[^.\w])import\s*['"]([^'"]+)['"]/g, // bare side-effect import 'x'
    /(?:^|[^.\w])import\s*\(\s*['"]([^'"]+)['"]\s*\)/g, // dynamic import('x')
    /(?:^|[^.\w])require\s*\(\s*['"]([^'"]+)['"]\s*\)/g, // require('x')
  ];
  for (const re of patterns) {
    let m;
    while ((m = re.exec(code)) !== null) {
      specs.push(m[1]);
    }
  }
  return specs;
}

// Relative `new URL('...', import.meta.url)` targets (asset/worker references).
function relativeNewUrlTargets(code) {
  const out = [];
  const re = /new\s+URL\(\s*['"]([^'"]+)['"]\s*,\s*import\.meta\.url\s*\)/g;
  let m;
  while ((m = re.exec(code)) !== null) {
    if (m[1].startsWith('.')) {
      out.push(m[1]);
    }
  }
  return out;
}

function hasJsExt(spec) {
  return JS_EXTS.some((e) => spec.endsWith(e));
}

// Does a `.js`-style specifier resolve to a real emitted file? In a .d.ts the
// runtime `./x.js` specifier maps to the sibling `./x.d.ts` declaration.
function resolvesToFile(absNoQuery) {
  if (existsSync(absNoQuery)) {
    return true;
  }
  if (absNoQuery.endsWith('.js')) {
    const dts = `${absNoQuery.slice(0, -3)}.d.ts`;
    if (existsSync(dts)) {
      return true;
    }
  }
  return false;
}

function checkImportsAndAssets(pkg) {
  const esmDir = join(pkg.dir, 'dist', 'esm');
  const files = walk(esmDir, (n) => n.endsWith('.js') || n.endsWith('.d.ts'));
  const extensionless = [];
  const broken = [];
  const missingAssets = [];
  const extensionlessRuntimeSubpaths = [];

  for (const file of files) {
    const code = readFileSync(file, 'utf8');
    const rel = relative(pkg.dir, file);
    const specs = moduleSpecifiers(code);

    for (const spec of specs.filter((s) => s.startsWith('.'))) {
      const target = resolve(dirname(file), spec);
      if (!hasJsExt(spec)) {
        extensionless.push(`${rel}: '${spec}'`);
      } else if (!resolvesToFile(target)) {
        broken.push(`${rel}: '${spec}' -> not found`);
      }
    }

    if (file.endsWith('.js')) {
      for (const spec of specs) {
        if (
          NATIVE_NODE_EXTENSION_REQUIRED_PREFIXES.some((prefix) =>
            spec.startsWith(prefix)
          ) &&
          !hasJsExt(spec)
        ) {
          extensionlessRuntimeSubpaths.push(`${rel}: '${spec}'`);
        }
      }
    }

    for (const spec of relativeNewUrlTargets(code)) {
      const target = resolve(dirname(file), spec);
      if (!existsSync(target)) {
        missingAssets.push(`${rel}: new URL('${spec}') -> not found`);
      }
    }
  }

  return {
    fileCount: files.length,
    extensionless,
    broken,
    missingAssets,
    extensionlessRuntimeSubpaths,
  };
}

function checkEsmMarker(pkg) {
  const markerPath = join(pkg.dir, 'dist', 'esm', 'package.json');
  if (!existsSync(markerPath)) {
    return 'dist/esm/package.json missing';
  }
  const marker = JSON.parse(readFileSync(markerPath, 'utf8'));
  if (marker.type !== 'module') {
    return `dist/esm/package.json type is '${marker.type}', expected 'module'`;
  }
  return null;
}

async function checkPublint(pkg) {
  // Programmatic API for precise control: fail only on error-level messages.
  const { publint } = await import('publint');
  let formatMessage;
  try {
    ({ formatMessage } = await import('publint/utils'));
  } catch {
    formatMessage = null;
  }
  const { messages } = await publint({ pkgDir: pkg.dir, level: 'warning' });
  const errors = messages.filter((m) => m.type === 'error');
  return errors.map((m) => {
    if (formatMessage) {
      try {
        return formatMessage(m, pkg.json) || `${m.code}`;
      } catch {
        /* fall through */
      }
    }
    return `${m.code} ${JSON.stringify(m.args || {})}`;
  });
}

function checkAttw(pkg) {
  try {
    execFileSync(
      'pnpm',
      ['exec', 'attw', '--pack', pkg.dir, '--profile', 'esm-only'],
      { cwd: repoRoot, encoding: 'utf8', stdio: 'pipe' }
    );
    return null;
  } catch (err) {
    const out = `${err.stdout || ''}${err.stderr || ''}`.trim();
    return out || 'attw reported problems';
  }
}

function getPackageEntrypoint(pkg) {
  const rootExport = pkg.json.exports?.['.'];
  if (typeof rootExport === 'string') {
    return rootExport;
  }
  if (rootExport && typeof rootExport === 'object') {
    return rootExport.import || rootExport.default;
  }
  return null;
}

function checkNodeImport(pkg) {
  // Import the package root export in native Node ESM. This catches unresolved
  // external subpath imports that are invisible when only a dependency-free leaf
  // module is imported.
  const entrypoint = getPackageEntrypoint(pkg);
  if (!entrypoint) {
    return { skipped: true };
  }
  const entrypointFile = join(pkg.dir, entrypoint);
  if (!existsSync(entrypointFile)) {
    return {
      skipped: false,
      error: `${entrypoint} from exports["."] does not exist`,
    };
  }
  const url = pathToFileURL(entrypointFile).href;
  try {
    execFileSync(
      process.execPath,
      ['--input-type=module', '-e', `await import(${JSON.stringify(url)})`],
      { encoding: 'utf8', stdio: 'pipe' }
    );
    return { skipped: false, error: null };
  } catch (err) {
    return {
      skipped: false,
      error: formatNodeImportError(err),
    };
  }
}

function formatNodeImportError(err) {
  const out = `${err.stderr || err.message}`.trim();
  const lines = out
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean);
  return (
    lines.find((line) => /^Error \[/.test(line)) ||
    lines.find((line) =>
      /^(ReferenceError|TypeError|SyntaxError):/.test(line)
    ) ||
    lines[0] ||
    'native Node import failed'
  );
}

async function main() {
  let packages = listPublishedPackages();
  if (nameFilter.length) {
    packages = packages.filter((p) =>
      nameFilter.some((n) => p.name === n || p.name.endsWith(`/${n}`))
    );
  }

  if (!packages.length) {
    console.error('No built packages found. Run the build first.');
    process.exit(1);
  }

  console.log(
    `Validating ESM packaging for ${packages.length} package(s)${
      skipAttw ? ' (attw skipped)' : ''
    }\n`
  );

  const failed = [];

  for (const pkg of packages) {
    const problems = [];

    const markerError = checkEsmMarker(pkg);
    if (markerError) {
      problems.push(`ESM marker: ${markerError}`);
    }

    const {
      fileCount,
      extensionless,
      broken,
      missingAssets,
      extensionlessRuntimeSubpaths,
    } = checkImportsAndAssets(pkg);
    for (const e of extensionless) {
      problems.push(`extensionless import: ${e}`);
    }
    for (const b of broken) {
      problems.push(`unresolved import: ${b}`);
    }
    for (const a of missingAssets) {
      problems.push(`missing asset: ${a}`);
    }
    for (const s of extensionlessRuntimeSubpaths) {
      problems.push(`extensionless native-Node runtime import: ${s}`);
    }

    const publintErrors = await checkPublint(pkg);
    for (const p of publintErrors) {
      problems.push(`publint: ${p}`);
    }

    if (!skipAttw) {
      const attwError = checkAttw(pkg);
      if (attwError) {
        problems.push(`attw:\n${attwError}`);
      }
    }

    const nodeImport = checkNodeImport(pkg);
    if (nodeImport.error) {
      problems.push(`node import: ${nodeImport.error}`);
    }

    const importNote = nodeImport.skipped
      ? 'no root entrypoint'
      : 'node-import ok';
    if (problems.length) {
      failed.push(pkg.name);
      console.log(`FAIL ${pkg.name}  (${fileCount} files scanned)`);
      for (const p of problems) {
        console.log(`     - ${p}`);
      }
    } else {
      console.log(
        `PASS ${pkg.name}  (${fileCount} files scanned, ${importNote})`
      );
    }
  }

  console.log('');
  if (failed.length) {
    console.error(
      `Packaging validation FAILED for ${failed.length} package(s): ${failed.join(
        ', '
      )}`
    );
    process.exit(1);
  }
  console.log(
    `Packaging validation passed for all ${packages.length} package(s).`
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
