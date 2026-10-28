// Imported from the module rather than the package barrel: `index.ts` exports
// this loader, so going through it would form a dependency cycle.
import * as metaData from '../../metaData';

/** Volume-id scheme handled by the brick loader, mirroring `nifti:`. */
export const BRICK_LOADER_SCHEME = 'brick';

/**
 * Metadata module carrying the brick-store manifest URI for an instance.
 *
 * A brick store is an alternate *encoding of an existing series*, not new
 * instances, so nothing in a series query reveals it — the only signal is a
 * private tag, `(0009,10E0) BrickManifestURI`, under PrivateCreator
 * `"RadicalImaging"` in the `(0009,0010)` block that static-dicomweb already
 * uses for Content-Location.
 *
 * Reading that tag needs the raw WADO-RS metadata (`metaDataManager` in
 * `dicomImageLoader`), which `core` must not depend on. So core defines the
 * module name and the wiring layer registers a provider for it:
 *
 * ```js
 * metaData.addProvider((type, imageId) => {
 *   if (type !== BRICK_MANIFEST_MODULE) return;
 *   const raw = wadors.metaDataManager.get(imageId);
 *   const uri = raw && getValue(raw['000910E0']);
 *   return uri ? { manifestUri: uri } : undefined;
 * });
 * ```
 */
export const BRICK_MANIFEST_MODULE = 'brickManifestModule';

export interface BrickManifestMetadata {
  manifestUri: string;
}

/** Manifest URI advertised for an instance, if any. */
export function getBrickManifestUri(imageId: string): string | undefined {
  const module = metaData.get(BRICK_MANIFEST_MODULE, imageId) as
    | BrickManifestMetadata
    | undefined;

  return module?.manifestUri;
}

/** Builds a `brick:` volume id from a store root. */
export function toBrickVolumeId(baseUrl: string): string {
  return `${BRICK_LOADER_SCHEME}:${baseUrl}`;
}

/** Extracts the store root from a `brick:` volume id. */
export function parseBrickVolumeId(volumeId: string): string {
  const prefix = `${BRICK_LOADER_SCHEME}:`;

  if (!volumeId.startsWith(prefix)) {
    throw new Error(
      `[brick] Volume id must start with "${prefix}", got "${volumeId}"`
    );
  }

  // Volume-loader dispatch splits on the first colon only, so the embedded
  // `https://` survives intact.
  return volumeId.slice(prefix.length);
}

/**
 * Upgrades an ordinary volume id to a `brick:` one when the series advertises a
 * brick store.
 *
 * Returns the original id unchanged when no manifest is advertised, so callers
 * can apply it unconditionally.
 *
 * @param volumeId - The volume id that would otherwise be used.
 * @param imageIds - Instances of the series, any of which may carry the tag.
 */
export function resolveBrickVolumeId(
  volumeId: string,
  imageIds: string[] = []
): string {
  if (volumeId.startsWith(`${BRICK_LOADER_SCHEME}:`)) {
    return volumeId;
  }

  for (const imageId of imageIds) {
    const manifestUri = getBrickManifestUri(imageId);

    if (manifestUri) {
      // The tag points at manifest.json; the loader wants the directory.
      return toBrickVolumeId(manifestUri.replace(/manifest\.json$/, ''));
    }
  }

  return volumeId;
}
