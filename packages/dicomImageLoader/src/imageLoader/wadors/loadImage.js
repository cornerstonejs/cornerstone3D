import $ from 'jquery';
import * as cornerstone from 'cornerstone-core';
import metaDataManager from './metaDataManager';
import getPixelData from './getPixelData';
import createImage from '../createImage';

function getTransferSyntaxForContentType (/* contentType */) {
  return '1.2.840.10008.1.2'; // hard code to ILE for now
}

function loadImage (imageId, options) {
  const start = new Date().getTime();

  const deferred = $.Deferred();

  const uri = imageId.substring(7);

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
      const end = new Date().getTime();

      image.loadTimeInMS = end - start;
      deferred.resolve(image);
    });
  }).fail(function (reason) {
    deferred.reject(reason);
  });

  return deferred;
}

// register wadors scheme
cornerstone.registerImageLoader('wadors', loadImage);

export default loadImage;

