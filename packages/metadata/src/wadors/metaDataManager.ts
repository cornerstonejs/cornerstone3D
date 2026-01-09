import type { WADORSMetaData } from '../types/WADORSMetaData';
import { imageIdToURI } from '../utilities/imageIdToURI';

let metadataByImageURI = [];

import getValue from './getValue';

function isMultiframe(metadata) {
  // test for presence of Shared Functional Groups Sequence or Per-Frame Functional Groups Sequence
  if (
    metadata['52009230'] !== undefined ||
    metadata['52009229'] !== undefined
  ) {
    return true;
  }
  // Checks if dicomTag NumberOf Frames exists and it is greater than one
  const numberOfFrames = getValue<number>(metadata['00280008']);

  return numberOfFrames > 1;
}

export function add(imageId: string, metadata: WADORSMetaData) {
  const imageURI = imageIdToURI(imageId);

  Object.defineProperty(metadata, 'isMultiframe', {
    value: isMultiframe(metadata),
    enumerable: false,
  });

  metadataByImageURI[imageURI] = metadata;
}

// multiframes images will have only one imageId returned by the dicomweb
// client and registered in metadataByImageURI for all the n frames. If an
// imageId does not have metadata, or it does not have at all, or the imageID
// belongs to a frame, not registered in metadataByImageURI
export function get(imageId: string): WADORSMetaData {
  const imageURI = imageIdToURI(imageId);

  // Check if the metadata is already available
  return metadataByImageURI[imageURI];
}

function remove(imageId) {
  const imageURI = imageIdToURI(imageId);

  delete metadataByImageURI[imageURI];
}

function purge() {
  metadataByImageURI = [];
}

export { metadataByImageURI, isMultiframe };

export default {
  add,
  get,
  remove,
  purge,
};
