import { MetadataModules } from '../../enums';
import { addTypedProvider, typedProviderProvider } from '../../metaData';

export const instanceOrigToInstanceProvider = (next, query, data, options) => {
  return (
    typedProviderProvider(MetadataModules.INSTANCE_ORIG, query, options) ||
    next(query, data, options)
  );
};

export function registerInstanceFromListener() {
  addTypedProvider(MetadataModules.INSTANCE, instanceOrigToInstanceProvider);
}
