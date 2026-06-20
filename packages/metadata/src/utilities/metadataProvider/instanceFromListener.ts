import { MetadataModules } from '../../enums';
import { addTypedProvider, metadataModuleProvider } from '../../metaData';

export const instanceOrigToInstanceProvider = (next, query, data, options) => {
  return (
    metadataModuleProvider(MetadataModules.NATURALIZED, query, options) ||
    next(query, data, options)
  );
};

export function registerInstanceFromListener() {
  addTypedProvider(MetadataModules.INSTANCE, instanceOrigToInstanceProvider);
}
