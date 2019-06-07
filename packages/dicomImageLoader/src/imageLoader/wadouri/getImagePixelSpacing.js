import parseImageId from './parseImageId.js';
import dataSetCacheManager from './dataSetCacheManager.js';
import getNumberValues from './metaData/getNumberValues.js';

function getImagePixelSpacing (imageId) {
  const parsedImageId = parseImageId(imageId);
  const dataSet = dataSetCacheManager.get(parsedImageId.url);

  if (!dataSet) {
    return null;
  }
  const imagePixelSpacing = getNumberValues(dataSet, 'x00181164', 2);

  if (!imagePixelSpacing) {
    return null;
  }
  return {
    rowPixelSpacing: imagePixelSpacing[0],
    columnPixelSpacing: imagePixelSpacing[1]
  };
}

export default getImagePixelSpacing;

