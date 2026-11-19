import { spawnSync } from 'node:child_process';
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { dirname, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const registryRoot = resolve(packageRoot, 'registry');
const fixtureFolders = [
  ['typescript', 'typescript'],
  ['tsx', 'tsx'],
];

/**
 * Returns the directories under a folder that hold a codemod.yaml and a
 * tests folder.
 */
function findTestedPackages(directory, found = []) {
  for (const entry of readdirSync(directory)) {
    const entryPath = resolve(directory, entry);

    if (statSync(entryPath).isDirectory()) {
      findTestedPackages(entryPath, found);
    } else if (
      entry === 'codemod.yaml' &&
      existsSync(resolve(directory, 'tests'))
    ) {
      found.push(directory);
    }
  }

  return found;
}

/**
 * Returns the transform script that the workflow of a package runs.
 */
function transformScript(directory) {
  const workflow = readFileSync(resolve(directory, 'workflow.yaml'), 'utf8');
  const match = workflow.match(/js_file:\s*['"]?([^'"\s]+)/);

  if (!match) {
    throw new Error(
      `No js_file in ${relative(packageRoot, directory)}/workflow.yaml`
    );
  }

  return match[1];
}

/**
 * Runs the fixture tests of one folder with one grammar.
 */
function runTests(directory, script, language, testsPath) {
  console.log(`\n${relative(packageRoot, directory)}: ${language} fixtures`);

  const result = spawnSync(
    'npx',
    ['codemod', 'jssg', 'test', '-l', language, script, testsPath],
    { cwd: directory, stdio: 'inherit' }
  );

  return result.status === 0;
}

let failed = false;

for (const directory of findTestedPackages(registryRoot).sort()) {
  const script = transformScript(directory);
  const split = fixtureFolders.filter(([folder]) =>
    existsSync(resolve(directory, 'tests', folder))
  );

  if (!split.length) {
    failed = !runTests(directory, script, 'tsx', 'tests') || failed;
    continue;
  }

  for (const [folder, language] of split) {
    failed =
      !runTests(directory, script, language, `tests/${folder}`) || failed;
  }
}

if (failed) {
  process.exit(1);
}
