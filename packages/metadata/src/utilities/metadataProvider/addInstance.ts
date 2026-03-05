import dcmjs from 'dcmjs';
import { MetadataModules } from '../../enums';
import { MetaDataIterator, NaturalTagListener } from '../dicomStream';
import { setCacheData } from './cacheData';

const { AsyncDicomReader } = dcmjs.async;

/**
 * Adds a DICOMweb JSON metadata instance to the NATURAL cache.
 *
 * Takes hex-tagged DICOMweb JSON (e.g. {"00080060": {vr:"CS", Value:["CT"]}})
 * and converts it to a naturalized instance via MetaDataIterator +
 * NaturalTagListener, then stores it in the NATURAL cache so that
 * subsequent metadata queries resolve from cache.
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
  const listener = new NaturalTagListener();
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
 * NaturalTagListener to produce a naturalized instance, then stores it
 * in the NATURAL cache.
 *
 * @param imageId - The imageId to associate with this instance
 * @param arrayBuffer - The DICOM Part 10 binary data
 * @returns A promise that resolves to the naturalized instance object
 */
export async function addBinaryDicomInstance(
  imageId: string,
  arrayBuffer: ArrayBuffer
) {
  const reader = new AsyncDicomReader();
  const listener = new NaturalTagListener();

  reader.stream.addBuffer(arrayBuffer);
  reader.stream.setComplete();
  await reader.readFile({ listener });

  const instance = reader.dict;
  setCacheData(MetadataModules.NATURAL, imageId, instance);
  return instance;
}
