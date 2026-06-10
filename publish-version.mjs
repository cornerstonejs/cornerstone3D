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
  // NOTE: --create-release github is intentionally NOT passed here. lerna only
  // creates the GitHub release when it pushes the tag itself, and we run with
  // --no-push (so the version bump + generated files land as a single amended
  // commit). The GitHub release is created explicitly after the tag is pushed,
  // below.
  await execa('npx', [
    'lerna',
    'version',
    nextVersion,
    '--yes',
    '--exact',
    '--force-publish',
    '--message',
    `chore(version): Update package versions to ${nextVersion} [skip ci]`,
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

  // Create the GitHub release for the tag we just pushed.
  //
  // Historically `lerna version --create-release github` created this release,
  // authenticating with the GH_TOKEN environment variable. When lerna switched
  // to --no-push (to land the version bump as a single amended commit) it stopped
  // creating releases, because lerna only creates a release when it pushes the
  // tag itself. As a result npm kept publishing while GitHub Releases froze.
  //
  // We now create the release explicitly, after pushing the tag, reusing the
  // same GH_TOKEN. This is best-effort: a missing token or an API error logs a
  // warning but never fails the build/release (the npm publish step is separate).
  await createGithubRelease(tagName, nextVersion.trim());

  console.log('Version set using lerna');
}

// Best-effort GitHub release creation for an already-pushed tag. Never throws;
// any failure is logged as a warning so it cannot fail the release.
async function createGithubRelease(tagName, version) {
  const ghToken = process.env.GH_TOKEN || process.env.GITHUB_TOKEN;

  if (!ghToken) {
    console.warn(
      `GH_TOKEN/GITHUB_TOKEN not set - skipping GitHub release creation for ${tagName}. ` +
        'Set GH_TOKEN in the CircleCI project/context environment to enable releases.'
    );
    return;
  }

  let owner;
  let repo;
  try {
    const { stdout: remoteUrl } = await execa('git', [
      'config',
      '--get',
      'remote.origin.url',
    ]);
    const match = remoteUrl
      .trim()
      .match(/github\.com[:/]+([^/]+)\/(.+?)(?:\.git)?\/?$/);
    if (!match) {
      console.warn(
        `Could not parse owner/repo from "${remoteUrl}" - skipping GitHub release for ${tagName}`
      );
      return;
    }
    [, owner, repo] = match;
  } catch (err) {
    console.warn(
      `Could not resolve remote origin URL (non-fatal): ${err.message}`
    );
    return;
  }

  try {
    const response = await fetch(
      `https://api.github.com/repos/${owner}/${repo}/releases`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${ghToken}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': `${repo}-release`,
        },
        body: JSON.stringify({
          tag_name: tagName,
          name: tagName,
          generate_release_notes: true,
          prerelease: version.includes('-'),
        }),
      }
    );

    if (response.ok) {
      console.log(`Created GitHub release ${tagName}`);
    } else {
      const detail = await response.text();
      console.warn(
        `GitHub release creation for ${tagName} failed (${response.status}, non-fatal): ${detail}`
      );
    }
  } catch (err) {
    console.warn(
      `GitHub release creation for ${tagName} errored (non-fatal): ${err.message}`
    );
  }
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
