import imageIdToURI from '../imageIdToURI.js';

let metadataByImageURI = [];

function add(imageId, metadata) {
  const imageURI = imageIdToURI(imageId);

  metadataByImageURI[imageURI] = metadata;
}

function get(imageId) {
  const imageURI = imageIdToURI(imageId);

  return metadataByImageURI[imageURI];
}

function remove(imageId) {
  const imageURI = imageIdToURI(imageId);

  metadataByImageURI[imageURI] = undefined;
}

function purge() {
  metadataByImageURI = [];
}

export default {
  add,
  get,
  remove,
  purge,
};
