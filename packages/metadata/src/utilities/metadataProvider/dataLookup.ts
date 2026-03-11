import { MetadataModules } from '../../enums';
import { addTypedProvider, typedProviderProvider } from '../../metaData';

/**
 * Creates a function that looks up the given dataType and provides it as "data"
 */
export function dataLookup(dataType: string) {
  return (next, query, data, options) => {
    data ||= typedProviderProvider(dataType, query, options?.[dataType]);
    return next(query, data, options);
  };
}

/** The data lookup for the instance module */
export const instanceLookup = dataLookup(MetadataModules.INSTANCE);
export const naturalLookup = dataLookup(MetadataModules.NATURAL);

export const DATA_PRIORITY = { priority: 5000 };

export function registerDataLookup() {
  addTypedProvider(
    MetadataModules.INSTANCE,
    dataLookup(MetadataModules.NATURAL),
    DATA_PRIORITY
  );

  addTypedProvider(MetadataModules.IMAGE_PLANE, instanceLookup, DATA_PRIORITY);

  addTypedProvider(MetadataModules.CALIBRATION, instanceLookup, DATA_PRIORITY);

  addTypedProvider(
    MetadataModules.COMPRESSED_FRAME_DATA,
    naturalLookup,
    DATA_PRIORITY
  );

  // Scaling uses NATURAL (multiframe, no per-frame scaling); provider receives data from this lookup
  addTypedProvider(MetadataModules.SCALING, naturalLookup, DATA_PRIORITY);
}
