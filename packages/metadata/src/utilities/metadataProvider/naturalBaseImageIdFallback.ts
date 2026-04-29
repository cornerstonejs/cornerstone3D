import { MetadataModules } from '../../enums';
import { addTypedProvider } from '../../metaData';
import { getCacheData } from './cacheData';
import { getUriModule } from './uriModule';

/**
 * When NATURALIZED is requested with a frame-specific imageId (e.g. "wadouri:url?frame=1"),
 * the cache is keyed by the exact imageId used when storing (usually the base URL).
 * This provider looks up NATURALIZED by baseImageId when the query contains a frame
 * parameter so that frame-specific metadata (INSTANCE, imagePlaneModule, etc.)
 * can resolve from the same NATURALIZED instance.
 */
function naturalBaseImageIdFallbackProvider(
  next,
  query: string,
  data,
  options
) {
  const uri = getUriModule(query);
  if (uri?.baseImageId && uri.baseImageId !== query) {
    const natural = getCacheData(MetadataModules.NATURALIZED, uri.baseImageId);
    if (natural !== undefined) {
      return natural;
    }
  }
  return next(query, data, options);
}

const NATURAL_FALLBACK_PRIORITY = 40_000;

export function registerNaturalBaseImageIdFallback() {
  addTypedProvider(
    MetadataModules.NATURALIZED,
    naturalBaseImageIdFallbackProvider,
    { priority: NATURAL_FALLBACK_PRIORITY }
  );
}
