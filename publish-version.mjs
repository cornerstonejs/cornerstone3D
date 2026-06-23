import { execa } from 'execa';
import fs from 'fs/promises';
import { glob } from 'glob';
import path from 'path';
import os from 'os';

async function run() {
  const { stdout: branchName } = await execa('git', [
    'rev-parse',
    '--abbrev-ref',
    'HEAD',
  ]);
  console.log('Current branch:', branchName);
  const lernaJson = JSON.parse(await fs.readFile('lerna.json', 'utf-8'));

  // read the current version from ./version.txt
  const nextVersion = await fs.readFile('./version.txt', 'utf-8');
  const packages = lernaJson.packages;

  if (!packages) {
    throw new Error('Could not find packages in lerna.json');
  }

  // Get the npm package names for the packages we are publishing
  const npmPackageNames = [];
  for (const packagePathPattern of packages) {
    // Use glob to find all matching directories
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

  // for each package's package.json file, see if there is a peerdependency,
  // and for each peer dependency see if it includes a package that
  // starts with @ohif/, if so update the version to the
  // next version since lerna will not handle this for us

  // Iterate over each package path pattern
  for (const packagePathPattern of packages) {
    // Use glob to find all matching directories
    const matchingDirectories = glob.sync(packagePathPattern);

    for (const packageDirectory of matchingDirectories) {
      const packageJsonPath = path.join(packageDirectory, 'package.json');

      try {
        const packageJson = JSON.parse(
          await fs.readFile(packageJsonPath, 'utf-8')
        );

        // Iterate over peerDependencies, dependencies, and devDependencies
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

  // Todo: Do we really need to run the build command here?
  // Maybe we need to hook the netlify deploy preview
  // await execa('yarn', ['run', 'build']);

  console.log('Setting the version using lerna...');

  // Stage all changes (version.json, peer dependency updates, .npmrc deletion)
  // before lerna runs so they're included in lerna's commit
  await execa('git', ['add', '-A']);

  // Run lerna version without pushing
  // lerna will update package.json files and create a commit
  //
  // NOTE: the commit message intentionally does NOT include "[skip ci]". The GitHub
  // Release is now created by the .github/workflows/release.yml workflow, which triggers
  // on the pushed "v*" tag — and GitHub Actions honors "[skip ci]" on the tagged commit,
  // which would suppress that trigger and silently skip every release. The cost of dropping
  // "[skip ci]" is that this bump commit re-triggers the CircleCI publish workflow on main;
  // the NPM_PUBLISH job guards against that (and the resulting infinite re-publish loop,
  // since version.mjs always computes a new version) by halting on "chore(version)" commits.
  await execa('npx', [
    'lerna',
    'version',
    nextVersion,
    '--yes',
    '--exact',
    '--force-publish',
    '--message',
    `chore(version): Update package versions to ${nextVersion}`,
    '--conventional-commits',
    '--no-push',
    // The repo enforces frozenLockfile via pnpm-workspace.yaml, but lerna must
    // update the lockfile after bumping versions. Relax it for this one install.
    '--npm-client-args=--no-frozen-lockfile',
  ]);

  // Generate version files for each package
  for (const pkg of packages) {
    await execa('node', ['./scripts/generate-version.js', pkg]);
  }

  // Stage any files that need to be included in the amended commit. Lerna commits the package.json
  // files it modifies, but may not include other files that were staged before it ran (like
  // version.json or .npmrc deletion) or generated version files. Since we're amending the commit to
  // combine all version-related changes into a single commit, we need to ensure these files are included.
  await execa('git', ['add', '-A']);

  // Amend the last commit to include all changes. The commit message is already set by lerna
  // and is the same, so we use --no-edit to keep the existing message.
  // This combines the version.json commit and package version updates into one commit
  await execa('git', ['commit', '--amend', '--no-edit']);

  // Lerna created a local tag (e.g. v4.16.0) pointing to the pre-amend commit.
  // Move the tag to the amended commit so the release tag matches what we push.
  const tagName = `v${nextVersion}`;
  await execa('git', ['tag', '-f', tagName]);

  console.log('Pushing changes...');

  // Note: Force push is not necessary here because:
  // 1. Lerna is called with --no-push, so the commit created by lerna is never pushed to remote
  // 2. We amend the commit locally before pushing, so it's a new commit from the remote's perspective
  // 3. This script runs on a single branch locally, so there's no history rewrite on the remote
  // A regular push is sufficient since we're pushing a commit that doesn't exist on the remote yet
  await execa('git', ['push', 'origin', branchName]);

  console.log('Pushing tag...');
  await execa('git', ['push', 'origin', tagName]);

  // The GitHub Release for this tag is created by the GitHub Actions workflow at
  // .github/workflows/release.yml, which triggers on the "v*" tag we just pushed and
  // authenticates with the built-in GITHUB_TOKEN (contents: write).
  //
  // It used to be created here via the REST API + a GH_TOKEN PAT, but that PAT lived in
  // CircleCI's environment (separate from GitHub's secret store) and drifted out of sync,
  // causing 403 "Resource not accessible by personal access token" failures. Moving release
  // creation to Actions removes the cross-system token entirely.

  console.log('Version set using lerna');
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
