import { $ } from '../../externalModules.js';
import metaDataManager from './metaDataManager.js';
import getPixelData from './getPixelData.js';
import createImage from '../createImage.js';

function getTransferSyntaxForContentType (/* contentType */) {
  return '1.2.840.10008.1.2'; // hard code to ILE for now
}

function loadImage (imageId, options) {
  const start = performance.now();
  const uri = imageId.substring(7);

  const deferred = $.Deferred();

  // check to make sure we have metadata for this imageId
  const metaData = metaDataManager.get(imageId);

  if (metaData === undefined) {
    deferred.reject(`no metadata for imageId ${imageId}`);

    return deferred.promise();
  }

  // TODO: load bulk data items that we might need
  const mediaType = 'multipart/related; type="application/octet-stream"'; // 'image/dicom+jp2';

  // get the pixel data from the server
  getPixelData(uri, imageId, mediaType).then(function (result) {

    const transferSyntax = getTransferSyntaxForContentType(result.contentType);
    const pixelData = result.imageFrame.pixelData;
    const imagePromise = createImage(imageId, pixelData, transferSyntax, options);

    imagePromise.then(function (image) {
      // add the loadTimeInMS property
      const end = performance.now();

      image.loadTimeInMS = end - start;
      deferred.resolve(image);
    }, function (reason) {
      deferred.reject(reason);
    });
  }, function (reason) {
    deferred.reject(reason);
  });

  return deferred;
}

export default loadImage;

