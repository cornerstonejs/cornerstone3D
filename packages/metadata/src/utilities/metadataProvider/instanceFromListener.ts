import { MetadataModules } from '../../enums';
import { addTypedProvider, typedProviderProvider } from '../../metaData';

export const instanceOrigToInstanceProvider = (next, query, data, options) => {
  return (
    typedProviderProvider(MetadataModules.NATURAL, query, options) ||
    next(query, data, options)
  );
};

export function registerInstanceFromListener() {
  addTypedProvider(MetadataModules.INSTANCE, instanceOrigToInstanceProvider);
}
