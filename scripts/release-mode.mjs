import {
  findUnpublished,
  getPublishablePackages,
} from './workspace-packages.mjs';

// Writes `recover` or `release` to stdout.
//
// `release` takes a new version. `recover` publishes the version that main
// carries already, and it takes no new version.
//
// A release that failed at the publish leaves a version on main that npm does
// not hold. A new version on top of that one would leave the first version as a
// tag that npm never receives, and the next merge would do the same again, so a
// week of broken credentials would leave a week of such tags. This check stops
// that after the first one: while npm lacks the version that main carries, the
// only thing to do is to publish that version.

async function run() {
  const packages = await getPublishablePackages();
  const missing = await findUnpublished(packages);

  if (missing.length) {
    console.error(
      `npm lacks ${missing.length} of ${packages.length} packages of the ` +
        `version that main carries: ${missing.join(', ')}`
    );
    console.log('recover');
    return;
  }

  console.log('release');
}

run().catch((err) => {
  console.error('Error encountered while choosing the release mode:', err);
  process.exit(1);
});
