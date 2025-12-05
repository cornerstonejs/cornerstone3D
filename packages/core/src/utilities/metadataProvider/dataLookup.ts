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
export const instanceLookup = dataLookup(MetadataModules.INSTANCE_ORIG);

export const INSTANCE_PRIORITY = { priority: 5000 };

addTypedProvider(
  MetadataModules.IMAGE_PLANE,
  instanceLookup,
  INSTANCE_PRIORITY
);
