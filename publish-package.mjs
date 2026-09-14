import { execa } from 'execa';
import {
  getPublishablePackages,
  isPublished,
} from './scripts/workspace-packages.mjs';

// Publishes each package that npm does not already hold at its current version.
//
// The npm CLI does the publish, and not a library, because the CLI is what
// exchanges the GitHub Actions OIDC token for npm credentials. npm trusted
// publishing needs npm 11.5.1 or later.

async function run() {
  const { stdout: branchName } = await execa('git', [
    'rev-parse',
    '--abbrev-ref',
    'HEAD',
  ]);
  // `beta` is unreachable while the publish workflow runs for the branch main
  // only. The branch stays here, and the beta arm of version.mjs stays as well,
  // for the beta release that CircleCI also held ready but never ran.
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
    // The workflow pushes no tag after this, so the version that npm holds for
    // the published packages names no commit. A re-run publishes what is
    // missing and then pushes the tag, because the packages above are skipped
    // and the version is the same. That holds only while main carries no new
    // change: a merge gives the next run another version, and it leaves this
    // version without a tag.
    console.error(
      `::error::The publish stopped after ${published.length} of ` +
        `${packages.length} packages, and the workflow pushes no tag. ` +
        `Re-run this workflow before another change lands on main.`
    );
    throw new Error(`Failed to publish: ${failures.join(', ')}`);
  }

  console.log('Finished');
}

run().catch((err) => {
  console.error('Error encountered during package publish:', err);
  process.exit(1);
});
