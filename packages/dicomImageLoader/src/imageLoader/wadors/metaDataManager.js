import imageIdToURI from '../imageIdToURI.js';
import { combineFrameInstance } from './combineFrameInstance.js';
import multiframeMetadata from './retrieveMultiframeMetadata.js';

let metadataByImageURI = [];

function add(imageId, metadata) {
  const imageURI = imageIdToURI(imageId);

  metadata.isMultiframe = multiframeMetadata.isMultiframe(metadata);

  metadataByImageURI[imageURI] = metadata;
}

// multiframes images will have only one imageid returned by the dicomweb
// client and registered in metadataByImageURI for all the n frames. If an
// iamgeid does not have metadata, or it does not have at all, or the imageid
// belongs to a frame, not registered in metadataByImageURI
function get(imageId) {
  const imageURI = imageIdToURI(imageId);

  // dealing first with the non multiframe information
  let metadata = metadataByImageURI[imageURI];

  if (metadata) {
    if (!metadata.isMultiframe) {
      return metadata;
    }
  }

  let frame = 1;

  if (!metadata) {
    // in this case it could indicate a multiframe imageid
    // Try to get the first frame metadata, where is stored the multiframe info
    const firstFrameInfo =
      multiframeMetadata._retrieveMultiframeMetadata(imageURI);

    metadata = firstFrameInfo.metadata;
    frame = firstFrameInfo.frame;
  }

  if (metadata) {
    metadata = combineFrameInstance(frame, metadata);
  }

  return metadata;
}

function remove(imageId) {
  const imageURI = imageIdToURI(imageId);

  metadataByImageURI[imageURI] = undefined;
}

function purge() {
  metadataByImageURI = [];
}

export { metadataByImageURI };

export default {
  add,
  get,
  remove,
  purge,
};
