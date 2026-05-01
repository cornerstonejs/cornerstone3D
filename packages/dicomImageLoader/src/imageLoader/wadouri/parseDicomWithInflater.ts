import * as dicomParser from 'dicom-parser';
import pako from 'pako';

/**
 * Inflater callback for deflate transfer syntax (1.2.840.10008.1.2.1.99).
 * dicom-parser expects a global pako or this option; we pass it so deflate
 * works when pako is bundled and not on window.
 */
function inflater(byteArray: Uint8Array, position: number): Uint8Array {
  const deflated = byteArray.slice(position);
  const inflated = pako.inflateRaw(deflated);
  const fullByteArray = new Uint8Array(inflated.length + position);
  fullByteArray.set(byteArray.slice(0, position), 0);
  fullByteArray.set(inflated, position);
  return fullByteArray;
}

/**
 * Options to pass to dicomParser.parseDicom so that deflate transfer syntax
 * is supported (uses pako when not running in Node).
 */
export const parseDicomOptions = { inflater };

/**
 * Parse a DICOM P10 byte array with deflate support.
 */
export function parseDicom(
  byteArray: Uint8Array,
  options?: dicomParser.ParseDicomOptions
) {
  return dicomParser.parseDicom(byteArray, {
    ...parseDicomOptions,
    ...options,
  });
}
