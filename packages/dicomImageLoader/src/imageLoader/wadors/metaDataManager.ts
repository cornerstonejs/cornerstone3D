import type { WADORSMetaData } from '../../types';
import imageIdToURI from '../imageIdToURI';
import { combineFrameInstance } from './combineFrameInstance';

let metadataByImageURI = [];
let multiframeMetadataByImageURI = {};

import getValue from './metaData/getValue';

// get metadata information for the first frame
function _retrieveMultiframeMetadata(imageURI) {
  const lastSlashIdx = imageURI.indexOf('/frames/') + 8;
  // imageid string without frame number
  const imageIdFrameless = imageURI.slice(0, lastSlashIdx);
  // calculating frame number
  const frame = parseInt(imageURI.slice(lastSlashIdx), 10);
  // retrieving the frame 1 that contains multiframe information

  const metadata = metadataByImageURI[`${imageIdFrameless}1`];

  return {
    metadata,
    frame,
  };
}

function retrieveMultiframeMetadata(imageId) {
  const imageURI = imageIdToURI(imageId);

  return _retrieveMultiframeMetadata(imageURI);
}

function isMultiframe(metadata) {
  // Checks if dicomTag NumberOf Frames exists and it is greater than one
  const numberOfFrames = getValue<number>(metadata['00280008']);

  return numberOfFrames && numberOfFrames > 1;
}

function add(imageId: string, metadata: WADORSMetaData) {
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
function get(imageId: string): WADORSMetaData {
  const imageURI = imageIdToURI(imageId);

  // Check if the metadata is already available
  const metadata = metadataByImageURI[imageURI];

  if (metadata && !metadata?.isMultiframe) {
    // Return the metadata for single-frame images
    return metadata;
  }

  const cachedMetadata = multiframeMetadataByImageURI[imageURI];

  if (cachedMetadata) {
    return cachedMetadata;
  }

  // Try to get the metadata for a specific frame of a multiframe image
  const retrievedMetadata = retrieveMultiframeMetadata(imageURI);

  if (!retrievedMetadata || !retrievedMetadata.metadata) {
    return;
  }

  const { metadata: firstFrameMetadata, frame } = retrievedMetadata;

  if (firstFrameMetadata) {
    // Combine the metadata from the first frame with the metadata from the specified frame
    const combined = combineFrameInstance(frame, firstFrameMetadata);

    multiframeMetadataByImageURI[imageURI] = combined;

    return combined;
  }
}

function remove(imageId) {
  const imageURI = imageIdToURI(imageId);

  metadataByImageURI[imageURI] = undefined;

  multiframeMetadataByImageURI[imageURI] = undefined;
}

function purge() {
  metadataByImageURI = [];
  multiframeMetadataByImageURI = {};
}

export { metadataByImageURI, isMultiframe, retrieveMultiframeMetadata };

export default {
  add,
  get,
  remove,
  purge,
};
