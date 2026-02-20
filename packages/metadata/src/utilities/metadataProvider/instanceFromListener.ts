import { MetadataModules } from '../../enums';
import {
  addTypedProvider,
  getMetaData,
  typedProviderProvider,
} from '../../metaData';
import { NaturalTagListener } from '../dicomStream';

export function instanceFromListener(next, query, data, options) {
  data = getMetaData(
    MetadataModules.DICOM_SOURCE,
    query,
    options?.[MetadataModules.DICOM_SOURCE]
  );
  if (!data) {
    return next(query, data, options);
  }
  const listener = NaturalTagListener.newNaturalStreamListener();

  listener.startObject();
  data.syncIterator(listener);
  return listener.pop();
}

export const instanceOrigToInstanceProvider = (next, query, data, options) => {
  return (
    typedProviderProvider(MetadataModules.INSTANCE_ORIG, query, options) ||
    next(query, data, options)
  );
};

export function registerInstanceFromListener() {
  addTypedProvider(MetadataModules.INSTANCE_ORIG, instanceFromListener);
  addTypedProvider(MetadataModules.INSTANCE, instanceOrigToInstanceProvider);
}
