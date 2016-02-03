
(function ($, cornerstone, cornerstoneWADOImageLoader) {

  "use strict";

  function parseImageId(imageId) {
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
    return {
      url : url,
      frame: frame
    };
  }

  // add a decache callback function to clear out our dataSetCacheManager
  function addDecache(image) {
    image.decache = function() {
      //console.log('decache');
      var parsedImageId = parseImageId(image.imageId);
      cornerstoneWADOImageLoader.dataSetCacheManager.unload(parsedImageId.url);
    };
  }

  function loadDataSetFromPromise(xhrRequestPromise, imageId, frame, sharedCacheKey) {
    var deferred = $.Deferred();
    xhrRequestPromise.then(function(dataSet) {
      var imagePromise = cornerstoneWADOImageLoader.createImageObject(dataSet, imageId, frame, sharedCacheKey);
      imagePromise.then(function(image) {
        addDecache(image);
        deferred.resolve(image);
      }, function(error) {
        deferred.reject(error);
      });
    }, function(error) {
      deferred.reject(error);
    });
    return deferred;
  }

  // Loads an image given an imageId
  // wado url example:
  // http://localhost:3333/wado?requestType=WADO&studyUID=1.3.6.1.4.1.25403.166563008443.5076.20120418075541.1&seriesUID=1.3.6.1.4.1.25403.166563008443.5076.20120418075541.2&objectUID=1.3.6.1.4.1.25403.166563008443.5076.20120418075557.1&contentType=application%2Fdicom&transferSyntax=1.2.840.10008.1.2.1
  // NOTE: supposedly the instance will be returned in Explicit Little Endian transfer syntax if you don't
  // specify a transferSyntax but Osirix doesn't do this and seems to return it with the transfer syntax it is
  // stored as.
  function loadImage(imageId) {
    // create a deferred object

    // build a url by parsing out the url scheme and frame index from the imageId
    var parsedImageId = parseImageId(imageId);

    // if the dataset for this url is already loaded, use it
    if(cornerstoneWADOImageLoader.dataSetCacheManager.isLoaded(parsedImageId.url)) {
      return loadDataSetFromPromise(cornerstoneWADOImageLoader.dataSetCacheManager.load(parsedImageId.url), imageId, parsedImageId.frame, parsedImageId.url);
    }

    // if multiframe, load the dataSet via the dataSetCacheManager to keep it in memory
    if(parsedImageId.frame !== undefined) {
      return loadDataSetFromPromise(cornerstoneWADOImageLoader.dataSetCacheManager.load(parsedImageId.url), imageId, parsedImageId.frame, parsedImageId.url);
    }

    // not multiframe, load it directly and let cornerstone cache manager its lifetime
    var deferred = $.Deferred();
    var xhrRequestPromise =  cornerstoneWADOImageLoader.internal.xhrRequest(parsedImageId.url, imageId);
    xhrRequestPromise.then(function(dataSet) {
      var imagePromise = cornerstoneWADOImageLoader.createImageObject(dataSet, imageId, parsedImageId.frame);
      imagePromise.then(function(image) {
        addDecache(image);
        deferred.resolve(image);
      }, function(error) {
        deferred.reject(error);
      });
    }, function(error) {
      deferred.reject(error);
    });
    return deferred;
  }

  // registery dicomweb and wadouri image loader prefixes
  cornerstone.registerImageLoader('dicomweb', loadImage);
  cornerstone.registerImageLoader('wadouri', loadImage);

}($, cornerstone, cornerstoneWADOImageLoader));