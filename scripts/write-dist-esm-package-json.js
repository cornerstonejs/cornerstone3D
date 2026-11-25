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
const ts = require('typescript');

const args = process.argv.slice(2);
const watchMode = args.includes('--watch');
const packagePath = args.find((arg) => !arg.startsWith('--')) || process.cwd();
const distEsmDir = path.join(packagePath, 'dist', 'esm');
const JS_EXT_RE = /\.(?:cjs|mjs|js|json)$/;
const MARKER_JSON = `${JSON.stringify({ type: 'module' }, null, 2)}\n`;

if (!finalizeDistEsm() && !watchMode) {
  process.exit(1);
}

if (watchMode) {
  watchDistEsm();
}

function finalizeDistEsm() {
  if (!fs.existsSync(distEsmDir)) {
    const message = `dist/esm not found at ${distEsmDir}; run the build before this step`;
    if (watchMode) {
      console.log(`Waiting: ${message}`);
      return false;
    }

    console.error(`Error: ${message}`);
    return false;
  }

  const target = path.join(distEsmDir, 'package.json');
  writeFileIfChanged(target, MARKER_JSON);
  console.log(`Wrote ${path.relative(packagePath, target)}`);

  const rewritten = rewriteRuntimeImports(distEsmDir, [
    packagePath,
    process.cwd(),
  ]);
  if (rewritten) {
    console.log(`Rewrote ${rewritten} native-Node runtime import specifier(s)`);
  }
  return true;
}

function watchDistEsm() {
  let watcher;
  let timeout;

  const schedule = () => {
    clearTimeout(timeout);
    timeout = setTimeout(finalizeDistEsm, 100);
  };

  const attach = () => {
    if (watcher || !fs.existsSync(distEsmDir)) {
      return;
    }

    try {
      watcher = fs.watch(distEsmDir, { recursive: true }, schedule);
      console.log(`Watching ${path.relative(packagePath, distEsmDir)}`);
    } catch (err) {
      console.warn(
        `Warning: fs.watch failed for ${distEsmDir}; falling back to polling. ${err.message}`
      );
    }
  };

  const interval = setInterval(() => {
    if (!fs.existsSync(distEsmDir)) {
      return;
    }
    attach();
    schedule();
  }, 1000);

  attach();
  process.on('SIGINT', () => {
    clearInterval(interval);
    watcher?.close();
    process.exit(0);
  });
  process.on('SIGTERM', () => {
    clearInterval(interval);
    watcher?.close();
    process.exit(0);
  });
}

function writeFileIfChanged(file, content) {
  if (fs.existsSync(file) && fs.readFileSync(file, 'utf8') === content) {
    return;
  }
  fs.writeFileSync(file, content);
}

function rewriteRuntimeImports(dir, paths) {
  let rewritten = 0;
  for (const file of walkJsFiles(dir)) {
    const original = fs.readFileSync(file, 'utf8');
    const replacements = runtimeModuleSpecifiers(original, file)
      .map(({ spec, start, end }) => ({
        start,
        end,
        spec,
        resolved: resolveRuntimeSpecifier(spec, paths),
      }))
      .filter(({ spec, resolved }) => resolved !== spec)
      .sort((a, b) => b.start - a.start);

    if (!replacements.length) {
      continue;
    }

    let next = original;
    for (const { start, end, resolved } of replacements) {
      next = `${next.slice(0, start)}${resolved}${next.slice(end)}`;
      rewritten += 1;
    }

    writeFileIfChanged(file, next);
  }
  return rewritten;
}

function isStringLiteralNode(node) {
  return ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node);
}

function runtimeModuleSpecifiers(code, file) {
  const sourceFile = ts.createSourceFile(
    file,
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.JS
  );
  const specs = [];

  function add(node) {
    if (node && isStringLiteralNode(node)) {
      specs.push({
        spec: node.text,
        start: node.getStart(sourceFile) + 1,
        end: node.getEnd() - 1,
      });
    }
  }

  function visit(node) {
    if (ts.isImportDeclaration(node) || ts.isExportDeclaration(node)) {
      add(node.moduleSpecifier);
    } else if (ts.isCallExpression(node)) {
      const [arg] = node.arguments;
      if (
        node.expression.kind === ts.SyntaxKind.ImportKeyword ||
        (ts.isIdentifier(node.expression) && node.expression.text === 'require')
      ) {
        add(arg);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);
  return specs;
}

function resolveRuntimeSpecifier(spec, paths) {
  if (
    spec.startsWith('.') ||
    spec.startsWith('/') ||
    spec.startsWith('node:') ||
    JS_EXT_RE.test(spec)
  ) {
    return spec;
  }

  const parsed = splitPackageSpecifier(spec);
  if (!parsed) {
    return spec;
  }

  const directCandidate = `${spec}.js`;
  if (canResolve(directCandidate, paths)) {
    return directCandidate;
  }

  const moduleDir = packageModuleDir(parsed.packageName, paths);
  if (!moduleDir || parsed.subpath.startsWith(`${moduleDir}/`)) {
    return spec;
  }

  const moduleCandidate = `${parsed.packageName}/${moduleDir}/${parsed.subpath}.js`;
  return canResolve(moduleCandidate, paths) ? moduleCandidate : spec;
}

function splitPackageSpecifier(spec) {
  if (spec.startsWith('@')) {
    const parts = spec.split('/');
    if (parts.length < 3) {
      return null;
    }
    return {
      packageName: `${parts[0]}/${parts[1]}`,
      subpath: parts.slice(2).join('/'),
    };
  }

  const [packageName, ...subpathParts] = spec.split('/');
  if (!packageName || !subpathParts.length) {
    return null;
  }
  return { packageName, subpath: subpathParts.join('/') };
}

function packageModuleDir(packageName, paths) {
  const packageJsonPath = resolvePath(`${packageName}/package.json`, paths);
  if (!packageJsonPath) {
    return null;
  }

  const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf8'));
  if (typeof packageJson.module !== 'string') {
    return null;
  }

  const modulePath = packageJson.module.replace(/^\.\//, '');
  const moduleDir = path.dirname(modulePath);
  return moduleDir === '.' ? '' : moduleDir;
}

function canResolve(spec, paths) {
  return Boolean(resolvePath(spec, paths));
}

function resolvePath(spec, paths) {
  try {
    return require.resolve(spec, { paths });
  } catch {
    return null;
  }
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
