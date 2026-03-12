import dcmjs from 'dcmjs';
import { MetadataModules } from '../../enums';
import { MetaDataIterator, NaturalTagListener } from '../dicomStream';
import { setCacheData } from './cacheData';

const { AsyncDicomReader } = dcmjs.async;

/**
 * Adds a DICOMweb JSON metadata instance to the NATURAL cache.
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
  const iterator = new MetaDataIterator(metadata);
  const listener = NaturalTagListener.createMetadataListener();
  listener.startObject();
  iterator.syncIterator(listener);
  const instance = listener.pop();
  setCacheData(MetadataModules.NATURAL, imageId, instance);
  return instance;
}

/**
 * Adds a binary DICOM Part 10 instance to the NATURAL cache.
 *
 * Parses the ArrayBuffer using dcmjs AsyncDicomReader with
 * NaturalTagListener.createMetadataListener() so that naturalized output
 * (including pixel data as array of frames of
 * ArrayBuffer fragments) is produced and listener.information is
 * populated for the reader.
 *
 * @param imageId - The imageId to associate with this instance
 * @param arrayBuffer - The DICOM Part 10 binary data
 * @returns A promise that resolves to the naturalized instance object
 */
export async function addPart10Instance(
  imageId: string,
  arrayBuffer: ArrayBuffer
) {
  const reader = new AsyncDicomReader();
  const listener = NaturalTagListener.createMetadataListener();

  reader.stream.addBuffer(arrayBuffer);
  reader.stream.setComplete();
  await reader.readFile({ listener });

  const natural = reader.dict;
  const transferSyntaxUid = reader.syntax;
  if (transferSyntaxUid) {
    natural.TransferSyntaxUID = Array.isArray(transferSyntaxUid)
      ? transferSyntaxUid[0]
      : transferSyntaxUid;
  }
  setCacheData(MetadataModules.NATURAL, imageId, natural);
  return natural;
}
