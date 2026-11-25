import { spawnSync } from 'node:child_process';
import {
  copyFileSync,
  existsSync,
  mkdirSync,
  mkdtempSync,
  readdirSync,
  readFileSync,
  rmSync,
  statSync,
} from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join, relative, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parseArgs } from 'node:util';

const packageRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const registryRoot = resolve(packageRoot, 'registry');
const fixtureFolders = [
  ['typescript', 'typescript'],
  ['tsx', 'tsx'],
];
const selfTestScript = 'scripts/self-test.ts';

/**
 * The fixtures that the idempotency check leaves out, by their path under
 * `registry/`, each with the reason. A package run on its own `expected`
 * files changes nothing, except where this list says why.
 */
const idempotencySkips = {};

const { values: options } = parseArgs({
  options: {
    package: { type: 'string', multiple: true },
    filter: { type: 'string' },
    'no-idempotency': { type: 'boolean', default: false },
    'only-idempotency': { type: 'boolean', default: false },
  },
});

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
 * Tells whether a package is one that `--package` names: its path under
 * `registry/` ends with one of the given parts, such as `6/api-names`.
 */
function isSelected(directory) {
  if (!options.package?.length) {
    return true;
  }

  const path = relative(registryRoot, directory);

  return options.package.some(
    (part) => path === part || path.endsWith(`/${part}`)
  );
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
 * Returns the fixture suites of a package, each with its transform and its
 * grammar: the `typescript` and `tsx` folders of a 6.0 package, or `tests`
 * itself, run with the transform of the workflow; and the folders of
 * `tests/self-test`, run with `scripts/self-test.ts` where a package has one
 * (a transform that tests its helpers on made-up names).
 */
function testSuites(directory) {
  const script = transformScript(directory);
  const split = fixtureFolders.filter(([folder]) =>
    existsSync(resolve(directory, 'tests', folder))
  );
  const suites = split.length
    ? split.map(([folder, language]) => ({
        script,
        testsPath: `tests/${folder}`,
        language,
      }))
    : [{ script, testsPath: 'tests', language: 'tsx' }];

  if (existsSync(resolve(directory, selfTestScript))) {
    for (const [folder, language] of fixtureFolders) {
      if (existsSync(resolve(directory, 'tests/self-test', folder))) {
        suites.push({
          script: selfTestScript,
          testsPath: `tests/self-test/${folder}`,
          language,
        });
      }
    }
  }

  return suites;
}

/**
 * Runs the fixture tests of one folder with one grammar.
 */
function runTests(directory, script, language, testsPath, label) {
  console.log(`\n${relative(packageRoot, directory)}: ${label}`);

  const filter = options.filter ? ['--filter', options.filter] : [];
  const result = spawnSync(
    'npx',
    [
      'codemod',
      'jssg',
      'test',
      '--disable-analytics',
      '-l',
      language,
      ...filter,
      script,
      testsPath,
    ],
    { cwd: directory, stdio: 'inherit' }
  );

  return result.status === 0;
}

/**
 * Builds a fixture tree whose inputs are the `expected` files of a fixture
 * folder, and returns how many fixtures it holds. A fixture listed in
 * `idempotencySkips` stays out, with its reason printed.
 */
function idempotencyTree(directory, testsPath, target) {
  const source = resolve(directory, testsPath);
  let count = 0;

  for (const fixture of readdirSync(source).sort()) {
    const fixturePath = join(source, fixture);
    const expected = statSync(fixturePath).isDirectory()
      ? readdirSync(fixturePath).find((name) => /^expected\./.test(name))
      : undefined;

    if (!expected) {
      continue;
    }

    const key = relative(registryRoot, fixturePath);

    if (idempotencySkips[key]) {
      console.log(`  skipped ${key}: ${idempotencySkips[key]}`);
      continue;
    }

    const extension = expected.slice('expected'.length);

    mkdirSync(join(target, fixture), { recursive: true });
    copyFileSync(
      join(fixturePath, expected),
      join(target, fixture, `input${extension}`)
    );
    copyFileSync(join(fixturePath, expected), join(target, fixture, expected));
    count += 1;
  }

  return count;
}

/**
 * Runs a package on its own `expected` files and tells whether it changed
 * none of them.
 */
function runIdempotency(directory, script, language, testsPath) {
  const target = mkdtempSync(join(tmpdir(), 'codemod-idempotency-'));

  try {
    if (!idempotencyTree(directory, testsPath, target)) {
      return true;
    }

    return runTests(
      directory,
      script,
      language,
      target,
      `${testsPath} (${language}) run on its expected files`
    );
  } finally {
    rmSync(target, { recursive: true, force: true });
  }
}

let failed = false;
const packages = findTestedPackages(registryRoot).sort().filter(isSelected);

if (!packages.length) {
  console.error(`No registry package matches ${options.package.join(', ')}`);
  process.exit(1);
}

for (const directory of packages) {
  for (const { script, testsPath, language } of testSuites(directory)) {
    if (!options['only-idempotency']) {
      failed =
        !runTests(
          directory,
          script,
          language,
          testsPath,
          `${testsPath} (${language})`
        ) || failed;
    }

    if (!options['no-idempotency']) {
      failed =
        !runIdempotency(directory, script, language, testsPath) || failed;
    }
  }
}

if (failed) {
  process.exit(1);
}
