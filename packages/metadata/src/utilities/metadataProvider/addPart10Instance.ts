import { getMetaData } from '../../metaData';
import { MetadataModules } from '../../enums';
import { ASYNC_NATURALIZED } from './naturalizedHandlers';

/**
 * Adds a DICOMweb JSON metadata instance to the NATURALIZED cache.
 *
 * Takes hex-tagged DICOMweb JSON (e.g. {"00080060": {vr:"CS", Value:["CT"]}})
 * and converts it to a naturalized instance via MetaDataIterator and
 * NaturalTagListener.createMetadataListener() (DicomMetadataListener + natural filter).
 *
 * @param imageId - The imageId to associate with this instance
 * @param metadata - DICOMweb JSON metadata object with hex-tagged entries
 * @returns The naturalized instance object
 */
export function addDicomwebInstance(
  imageId: string,
  metadata: Record<string, unknown>
) {
  return getMetaData(MetadataModules.NATURALIZED, imageId, {
    metadata,
  });
}

/**
 * Adds a binary DICOM Part 10 instance to the NATURALIZED cache.
 *
 * Parses the ArrayBuffer using dcmjs AsyncDicomReader with
 * NaturalTagListener.createMetadataListener() so that naturalized output
 * (including pixel data as array of frames of
 * ArrayBuffer fragments) is produced and listener.information is
 * populated for the reader.
 *
 * @param imageId - The imageId to associate with this instance
 * @param part10 - ArrayBuffer/Uint8Array or resolver function returning those values
 * @returns A promise that resolves to the naturalized instance object
 */
export async function addPart10Instance(
  imageId: string,
  part10:
    | ArrayBuffer
    | Uint8Array
    | (() => ArrayBuffer | Uint8Array | Promise<ArrayBuffer | Uint8Array>)
) {
  return getMetaData(ASYNC_NATURALIZED, imageId, { part10 });
}
