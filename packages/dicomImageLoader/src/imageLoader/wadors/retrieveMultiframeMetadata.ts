import getValue from './metaData/getValue.js';
import imageIdToURI from '../imageIdToURI.js';
import { metadataByImageURI } from './metaDataManager.js';

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
  const numberOfFrames = getValue(metadata['00280008']);

  return numberOfFrames && numberOfFrames > 1;
}

export default {
  _retrieveMultiframeMetadata,
  retrieveMultiframeMetadata,
  isMultiframe,
};
