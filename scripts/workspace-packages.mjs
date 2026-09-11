import fs from 'fs/promises';
import path from 'path';
import { glob } from 'glob';

// The release covers `packages/*` only. `addOns/*` are workspace members that
// this repository does not publish.
const RELEASE_GLOB = 'packages/*';

/** `glob` answers the separator of the platform. Paths stay POSIX here. */
const toPosix = (value) => value.split(path.sep).join('/');

async function readPackage(directory) {
  const dir = toPosix(directory);
  const manifestPath = `${dir}/package.json`;

  try {
    const manifest = JSON.parse(await fs.readFile(manifestPath, 'utf-8'));
    return { dir, manifestPath, manifest, name: manifest.name };
  } catch {
    // A directory without a package.json is not a package.
    return undefined;
  }
}

/**
 * Every package of the release, published or not.
 *
 * A private package still carries `@cornerstonejs` dependency ranges that name
 * a published package, and those ranges move with each release.
 */
export async function getAllPackages() {
  const directories = glob.sync(RELEASE_GLOB).sort();
  const packages = await Promise.all(directories.map(readPackage));

  return packages.filter(Boolean);
}

/**
 * True for a package that goes to npm.
 *
 * Use this to filter the result of one `getAllPackages` call when you also
 * change the manifests. Two calls answer two sets of objects, and a change to
 * one set does not reach the other.
 */
export function isPublishable(entry) {
  return !entry.manifest.private;
}

/**
 * The packages that go to npm. The order is alphabetical, because the registry
 * does not resolve dependencies when it accepts a package.
 */
export async function getPublishablePackages() {
  const packages = await getAllPackages();

  return packages.filter(isPublishable);
}
