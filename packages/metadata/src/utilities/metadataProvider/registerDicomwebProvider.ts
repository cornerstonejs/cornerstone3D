import { addTypedProvider } from '../../metaData';
import { MetadataModules } from '../../enums';
import { MetaDataIterator } from '../dicomStream';

/**
 * Registers a DICOMweb metadata provider.
 *
 * This creates a typed provider for DICOM_SOURCE that wraps DICOMweb JSON
 * metadata objects using MetaDataIterator, enabling the typed provider system
 * to extract metadata from DICOMweb metadata responses.
 *
 * @param lookupMetadata - A function that takes an imageId string
 *   and returns a DICOMweb JSON metadata object (with hex-tagged entries like
 *   "00080060"), or undefined if not available.
 * @param options - Optional provider options
 * @param options.priority - Provider priority (higher runs first)
 */
export function registerDicomwebProvider(
  lookupMetadata: (imageId: string) => unknown,
  options?: { priority?: number }
) {
  addTypedProvider(
    MetadataModules.DICOM_SOURCE,
    (next, imageId, data, providerOptions) => {
      const metadata = lookupMetadata(imageId);
      if (!metadata) {
        return next(imageId, data, providerOptions);
      }
      return new MetaDataIterator(metadata);
    },
    options
  );
}
