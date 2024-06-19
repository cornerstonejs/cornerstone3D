import { WADORSMetaData } from '../../types';
import imageIdToURI from '../imageIdToURI';
import { combineFrameInstance } from './combineFrameInstance';
import multiframeMetadata from './retrieveMultiframeMetadata';

let metadataByImageURI = [];
let multiframeMetadataByImageURI = {};

function add(imageId: string, metadata: WADORSMetaData) {
  const imageURI = imageIdToURI(imageId);

  Object.defineProperty(metadata, 'isMultiframe', {
    value: multiframeMetadata.isMultiframe(metadata),
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
  const retrievedMetadata =
    multiframeMetadata._retrieveMultiframeMetadata(imageURI);

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

export { metadataByImageURI };

export default {
  add,
  get,
  remove,
  purge,
};
