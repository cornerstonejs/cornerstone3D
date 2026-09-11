import { execa } from 'execa';
import { getPublishablePackages } from './scripts/workspace-packages.mjs';

// Publishes each package that npm does not already hold at its current version.
//
// The npm CLI does the publish, and not a library, because the CLI is what
// exchanges the GitHub Actions OIDC token for npm credentials. npm trusted
// publishing needs npm 11.5.1 or later.

/** True when the registry already holds this exact version. */
async function isPublished(name, version) {
  try {
    await execa('npm', ['view', `${name}@${version}`, 'version']);
    return true;
  } catch {
    return false;
  }
}

async function run() {
  const { stdout: branchName } = await execa('git', [
    'rev-parse',
    '--abbrev-ref',
    'HEAD',
  ]);
  const distTag = branchName === 'main' ? 'latest' : 'beta';

  console.log(`Publishing from ${branchName} under the "${distTag}" tag`);

  const packages = await getPublishablePackages();
  const published = [];
  const skipped = [];
  const failures = [];

  for (const entry of packages) {
    const { name, dir, manifest } = entry;
    const { version } = manifest;

    if (await isPublished(name, version)) {
      console.log(`Skipping ${name}@${version}: the registry holds it already`);
      skipped.push(`${name}@${version}`);
      continue;
    }

    console.log(`Publishing ${name}@${version}...`);

    try {
      await execa(
        'npm',
        ['publish', '--provenance', '--access', 'public', '--tag', distTag],
        { cwd: dir, stdio: 'inherit' }
      );
      published.push(`${name}@${version}`);
    } catch (error) {
      // Every package is reported, so one broken package does not hide the
      // state of the others.
      console.error(`Failed to publish ${name}@${version}:`, error.shortMessage ?? error);
      failures.push(`${name}@${version}`);
    }
  }

  console.log(`Published: ${published.length ? published.join(', ') : 'none'}`);
  console.log(`Skipped: ${skipped.length ? skipped.join(', ') : 'none'}`);

  if (failures.length) {
    throw new Error(`Failed to publish: ${failures.join(', ')}`);
  }

  console.log('Finished');
}

run().catch((err) => {
  console.error('Error encountered during package publish:', err);
  process.exit(1);
});
