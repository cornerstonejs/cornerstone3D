import $ from 'jquery';
import metaDataManager from './metaDataManager';
import getPixelData from './getPixelData';
import createImage from '../createImage';
// TODO: import cornerstone from 'cornerstone';

"use strict";

function getTransferSyntaxForContentType(contentType) {
  return '1.2.840.10008.1.2'; // hard code to ILE for now
}

function loadImage(imageId, options) {
  var start = new Date().getTime();

  var deferred = $.Deferred();
  
  var uri = imageId.substring(7);
  
  // check to make sure we have metadata for this imageId
  var metaData = metaDataManager.get(imageId);
  if(metaData === undefined) {
    deferred.reject('no metadata for imageId ' + imageId);
    return deferred.promise();
  }

  // TODO: load bulk data items that we might need

  var mediaType = 'multipart/related; type="application/octet-stream"'; // 'image/dicom+jp2';

  // get the pixel data from the server
  getPixelData(uri, imageId, mediaType).then(function(result) {

    var transferSyntax = getTransferSyntaxForContentType(result.contentType);
    var pixelData = result.imageFrame.pixelData;
    var imagePromise = createImage(imageId, pixelData, transferSyntax, options);
    imagePromise.then(function(image) {
      // add the loadTimeInMS property
      var end = new Date().getTime();
      image.loadTimeInMS = end - start;
      deferred.resolve(image);
    })
  }).fail(function(reason) {
    deferred.reject(reason);
  });

  return deferred;
}

// register wadors scheme
cornerstone.registerImageLoader('wadors', loadImage);

export default loadImage;

