import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const registryRoot = resolve(packageRoot, 'registry');
const registryPackageDirs = [];

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
