import { utilities as csUtils } from '@cornerstonejs/core';

const scalingPerImageId = {};

function addInstance(imageId, scalingMetaData) {
  const imageURI = csUtils.idToURI(imageId);
  scalingPerImageId[imageURI] = scalingMetaData;
}

function get(type, imageId) {
  if (type === 'scalingModule') {
    const imageURI = csUtils.idToURI(imageId);
    return scalingPerImageId[imageURI];
  }
}

export default { addInstance, get };
