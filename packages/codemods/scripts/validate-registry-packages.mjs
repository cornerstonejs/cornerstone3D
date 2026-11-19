import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { basename, dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const registryRoot = resolve(packageRoot, 'registry');
const registryPackageDirs = [];

/**
 * The copies of the helper file that each registry package of one migration
 * keeps, because each package is published on its own.
 */
const sharedHelperCopies = [];

function walk(directory) {
  for (const entry of readdirSync(directory)) {
    const entryPath = resolve(directory, entry);
    const stat = statSync(entryPath);

    if (stat.isDirectory()) {
      walk(entryPath);
      continue;
    }

    if (entry === 'codemod.yaml') {
      registryPackageDirs.push(dirname(entryPath));
    }

    if (entry === 'lib.ts' && basename(directory) === 'scripts') {
      sharedHelperCopies.push(entryPath);
    }
  }
}

walk(registryRoot);

if (!registryPackageDirs.length) {
  console.error('No codemod.yaml files found under packages/codemods/registry');
  process.exit(1);
}

for (const directory of registryPackageDirs.sort()) {
  const displayPath = relative(packageRoot, directory);
  console.log(`Validating ${displayPath}`);

  const result = spawnSync(
    'npx',
    ['codemod', 'workflow', 'validate', '-w', directory],
    {
      cwd: packageRoot,
      stdio: 'inherit',
    }
  );

  if (result.status !== 0) {
    process.exit(result.status || 1);
  }
}

const helperGroups = new Map();

for (const helper of sharedHelperCopies) {
  const migration = relative(registryRoot, helper)
    .split('/')
    .slice(0, 2)
    .join('/');

  helperGroups.set(migration, [...(helperGroups.get(migration) ?? []), helper]);
}

for (const [migration, copies] of helperGroups) {
  const reference = readFileSync(copies[0], 'utf8');
  const different = copies.filter(
    (copy) => readFileSync(copy, 'utf8') !== reference
  );

  if (different.length) {
    console.error(
      `The copies of scripts/lib.ts in ${migration} differ from ${relative(packageRoot, copies[0])}:\n${different
        .map((copy) => `  ${relative(packageRoot, copy)}`)
        .join('\n')}`
    );
    process.exit(1);
  }

  console.log(
    `The ${copies.length} copies of scripts/lib.ts in ${migration} are equal`
  );
}
