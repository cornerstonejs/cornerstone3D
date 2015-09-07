
(function ($, cornerstone, cornerstoneWADOImageLoader) {

  "use strict";

  // Loads an image given an imageId
  // wado url example:
  // http://localhost:3333/wado?requestType=WADO&studyUID=1.3.6.1.4.1.25403.166563008443.5076.20120418075541.1&seriesUID=1.3.6.1.4.1.25403.166563008443.5076.20120418075541.2&objectUID=1.3.6.1.4.1.25403.166563008443.5076.20120418075557.1&contentType=application%2Fdicom&transferSyntax=1.2.840.10008.1.2.1
  // NOTE: supposedly the instance will be returned in Explicit Little Endian transfer syntax if you don't
  // specify a transferSyntax but Osirix doesn't do this and seems to return it with the transfer syntax it is
  // stored as.
  function loadImage(imageId) {
    // create a deferred object

    // build a url by parsing out the url scheme and frame index from the imageId
    var firstColonIndex = imageId.indexOf(':');
    var url = imageId.substring(firstColonIndex + 1);
    var frameIndex = url.indexOf('frame=');
    var frame;
    if(frameIndex !== -1) {
      var frameStr = url.substr(frameIndex + 6);
      frame = parseInt(frameStr);
      url = url.substr(0, frameIndex-1);
    }

    // if multiframe and cached, use the cached data set to extract the frame
    if(frame !== undefined &&
      cornerstoneWADOImageLoader.internal.multiFrameCacheHack.hasOwnProperty(url))
    {
      var deferred = $.Deferred();
      var dataSet = cornerstoneWADOImageLoader.internal.multiFrameCacheHack[url];
      var imagePromise = cornerstoneWADOImageLoader.createImageObject(dataSet, imageId, frame);
      imagePromise.then(function(image) {
        deferred.resolve(image);
      }, function(error) {
        deferred.reject(error);
      });
      return deferred;
    }

    return cornerstoneWADOImageLoader.internal.xhrRequest(imageId, frame, url);
  }

  // registery dicomweb and wadouri image loader prefixes
  cornerstone.registerImageLoader('dicomweb', loadImage);
  cornerstone.registerImageLoader('wadouri', loadImage);

}($, cornerstone, cornerstoneWADOImageLoader));