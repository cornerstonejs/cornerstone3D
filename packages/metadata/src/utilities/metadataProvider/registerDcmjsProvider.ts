import { addTypedProvider } from '../../metaData';
import { MetadataModules } from '../../enums';
import { DataSetIterator } from '../dicomStream';

/**
 * Registers a DICOM Part 10 metadata provider.
 *
 * This creates a typed provider for DICOM_SOURCE that wraps dicom-parser
 * DataSet objects using DataSetIterator, enabling the typed provider system
 * to extract metadata from DICOM Part 10 binary data.
 *
 * @param lookupDataSet - A function that takes an imageId string
 *   and returns a dicom-parser DataSet object, or undefined if not available.
 * @param options - Optional provider options
 * @param options.priority - Provider priority (higher runs first)
 */
export function registerDcmjsProvider(
  lookupDataSet: (imageId: string) => unknown,
  options?: { priority?: number }
) {
  addTypedProvider(
    MetadataModules.DICOM_SOURCE,
    (next, imageId, data, providerOptions) => {
      const dataSet = lookupDataSet(imageId);
      if (!dataSet) {
        return next(imageId, data, providerOptions);
      }
      return new DataSetIterator(dataSet);
    },
    options
  );
}
