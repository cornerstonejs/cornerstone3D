import { execa } from 'execa';
import fs from 'fs/promises';
import { getAllPackages, isPublishable } from './scripts/workspace-packages.mjs';

// Sets every package to the version that version.mjs computed, then commits and
// tags that change locally.
//
// The push is deliberately not here. The publish workflow pushes the commit and
// the tag only after npm accepts the packages, so a failed publish leaves no tag
// for a version that npm does not hold.

async function run() {
  const nextVersion = (await fs.readFile('./version.txt', 'utf-8')).trim();

  if (!nextVersion) {
    throw new Error('version.txt is empty. Run version.mjs first.');
  }

  console.log('Next version:', nextVersion);

  // One read, then one filter. Two reads would answer two sets of objects, and
  // the version written below would not reach the manifests written later.
  const allPackages = await getAllPackages();
  const publishable = allPackages.filter(isPublishable);
  const publishableNames = new Set(publishable.map((entry) => entry.name));

  for (const entry of publishable) {
    entry.manifest.version = nextVersion;
  }

  // Each manifest pins its `@cornerstonejs` dependencies to an exact version, so
  // every range that names a package of this release moves with the release.
  for (const entry of allPackages) {
    for (const dependencyType of [
      'peerDependencies',
      'dependencies',
      'devDependencies',
    ]) {
      const dependencies = entry.manifest[dependencyType];

      if (!dependencies) {
        continue;
      }

      for (const dependency of Object.keys(dependencies)) {
        if (publishableNames.has(dependency)) {
          dependencies[dependency] = nextVersion;
          console.log(
            `${entry.name}: ${dependencyType} ${dependency} -> ${nextVersion}`
          );
        }
      }
    }
  }

  for (const entry of allPackages) {
    await fs.writeFile(
      entry.manifestPath,
      JSON.stringify(entry.manifest, null, 2) + '\n'
    );
    await execa('npx', ['prettier', '--write', entry.manifestPath]);
  }

  // The lockfile records the version of every workspace package, and the repo
  // installs with a frozen lockfile, so the lockfile moves with the versions.
  console.log('Updating the lockfile...');
  await execa('pnpm', [
    'install',
    '--lockfile-only',
    '--no-frozen-lockfile',
  ]);
  await execa('npx', ['prettier', '--write', 'pnpm-lock.yaml']);

  for (const entry of allPackages) {
    await execa('node', ['./scripts/generate-version.js', entry.dir]);
  }

  await execa('git', ['add', '-A']);
  await execa('git', [
    'commit',
    '-m',
    `chore(version): Update package versions to ${nextVersion}`,
  ]);
  // A lightweight tag, as every release tag of this repository is. `-c` keeps a
  // machine that signs its tags by default from asking for a tag message.
  await execa('git', ['-c', 'tag.gpgsign=false', 'tag', `v${nextVersion}`]);

  console.log(`Committed and tagged v${nextVersion}`);
}

run().catch((err) => {
  console.error('Error encountered during version bump:', err);
  process.exit(1);
});
