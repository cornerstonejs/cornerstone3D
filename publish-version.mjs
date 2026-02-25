import { execa } from 'execa';
import fs from 'fs/promises';
import { glob } from 'glob';
import path from 'path';
import os from 'os';

// Publishable packages (matches pnpm-workspace.yaml minus addOns and docs)
const PUBLISHABLE_PACKAGES = [
  'packages/core',
  'packages/tools',
  'packages/adapters',
  'packages/nifti-volume-loader',
  'packages/dicomImageLoader',
  'packages/ai',
  'packages/labelmap-interpolation',
  'packages/polymorphic-segmentation',
];

async function run() {
  const { stdout: branchName } = await execa('git', [
    'rev-parse',
    '--abbrev-ref',
    'HEAD',
  ]);
  console.log('Current branch:', branchName);

  // read the current version from ./version.txt
  const nextVersion = (await fs.readFile('./version.txt', 'utf-8')).trim();
  const packages = [...PUBLISHABLE_PACKAGES];

  // Get the npm package names for the packages we are publishing
  const npmPackageNames = [];
  for (const packagePathPattern of packages) {
    const matchingDirectories = glob.sync(packagePathPattern);

    for (const packageDirectory of matchingDirectories) {
      const packageJsonPath = path.join(packageDirectory, 'package.json');

      npmPackageNames.push(
        JSON.parse(await fs.readFile(packageJsonPath, 'utf-8')).name
      );
    }
  }

  // add packages/docs so that we can update the peer dependencies
  packages.push('packages/docs');

  // Update version in root package.json
  const rootPkgPath = 'package.json';
  const rootPkg = JSON.parse(await fs.readFile(rootPkgPath, 'utf-8'));
  rootPkg.version = nextVersion;
  await fs.writeFile(rootPkgPath, JSON.stringify(rootPkg, null, 2) + '\n');
  await execa('npx', ['prettier', '--write', rootPkgPath]);
  console.log(`Updated root package.json version to ${nextVersion}`);

  // For each package's package.json file, update the version and
  // cross-references to other @cornerstonejs packages
  for (const packagePathPattern of packages) {
    const matchingDirectories = glob.sync(packagePathPattern);

    for (const packageDirectory of matchingDirectories) {
      const packageJsonPath = path.join(packageDirectory, 'package.json');

      try {
        const packageJson = JSON.parse(
          await fs.readFile(packageJsonPath, 'utf-8')
        );

        // Update the package version itself (for publishable packages)
        if (PUBLISHABLE_PACKAGES.includes(packagePathPattern)) {
          packageJson.version = nextVersion;
        }

        // Update cross-references in peerDependencies, dependencies, and devDependencies
        for (const dependencyType of [
          'peerDependencies',
          'dependencies',
          'devDependencies',
        ]) {
          const dependencies = packageJson[dependencyType];

          if (!dependencies) {
            continue;
          }

          for (const dependency of Object.keys(dependencies)) {
            if (
              dependency.startsWith('@cornerstonejs/') &&
              npmPackageNames.includes(dependency)
            ) {
              dependencies[dependency] = `${nextVersion}`;

              console.log(
                `updating ${dependencyType} of ${dependency} to `,
                dependencies[dependency]
              );
            }
          }
        }

        await fs.writeFile(
          packageJsonPath,
          JSON.stringify(packageJson, null, 2) + '\n'
        );

        // run prettier on the package.json file
        await execa('npx', ['prettier', '--write', packageJsonPath]);

        console.log(`Updated ${packageJsonPath}`);
      } catch (err) {
        // This could be a directory without a package.json file. Ignore and continue.
        continue;
      }
    }
  }

  // remove the .npmrc to not accidentally publish to npm
  const localNpmrc = '.npmrc';
  const repoNpmrc = path.join(os.homedir(), 'repo/.npmrc');

  await unlinkFile(localNpmrc);
  await unlinkFile(repoNpmrc);

  console.log('Setting the version...');

  // Generate version files for each package
  for (const pkg of packages) {
    await execa('node', ['./scripts/generate-version.js', pkg]);
  }

  // Stage all changes
  await execa('git', ['add', '-A']);

  // Create the version commit
  const commitMessage = `chore(version): Update package versions to ${nextVersion} [skip ci]`;
  await execa('git', ['commit', '-m', commitMessage]);

  // Create the git tag
  const tagName = `v${nextVersion}`;
  await execa('git', ['tag', tagName]);

  console.log('Pushing changes...');
  await execa('git', ['push', 'origin', branchName]);

  console.log('Pushing tag...');
  await execa('git', ['push', 'origin', tagName]);

  // Create GitHub release
  console.log('Creating GitHub release...');
  try {
    await execa('gh', [
      'release',
      'create',
      tagName,
      '--generate-notes',
      '--title',
      tagName,
    ]);
    console.log(`GitHub release ${tagName} created`);
  } catch (err) {
    console.log(
      'Could not create GitHub release (gh CLI may not be available):',
      err.message
    );
  }

  console.log('Version set successfully');
}

async function unlinkFile(filePath) {
  try {
    await fs.access(filePath);
    await fs.unlink(filePath);
    console.log(`${filePath} has been deleted`);
  } catch (error) {
    console.log(`${filePath} does not exist or an error occurred:`, error);
  }
}

run().catch((err) => {
  console.error('Error encountered during version bump:', err);
  process.exit(1);
});
