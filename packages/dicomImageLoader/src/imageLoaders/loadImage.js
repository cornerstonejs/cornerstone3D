
(function ($, cornerstone, cornerstoneWADOImageLoader) {

  "use strict";

  // add a decache callback function to clear out our dataSetCacheManager
  function addDecache(image) {
    image.decache = function() {
      //console.log('decache');
      var parsedImageId = cornerstoneWADOImageLoader.parseImageId(image.imageId);
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

  function getLoaderForScheme(scheme) {
    if(scheme === 'dicomweb' || scheme === 'wadouri') {
      return cornerstoneWADOImageLoader.internal.xhrRequest;
    }
    else if(scheme === 'dicomfile') {
      return cornerstoneWADOImageLoader.internal.loadFileRequest;
    }
  }

  function loadImage(imageId) {
    var parsedImageId = cornerstoneWADOImageLoader.parseImageId(imageId);

    var loader = getLoaderForScheme(parsedImageId.scheme);

    // if the dataset for this url is already loaded, use it
    if(cornerstoneWADOImageLoader.dataSetCacheManager.isLoaded(parsedImageId.url)) {
      return loadDataSetFromPromise(cornerstoneWADOImageLoader.dataSetCacheManager.load(parsedImageId.url, loader), imageId, parsedImageId.frame, parsedImageId.url);
    }

    // if multiframe, load the dataSet via the dataSetCacheManager to keep it in memory
    if(parsedImageId.frame !== undefined) {
      return loadDataSetFromPromise(cornerstoneWADOImageLoader.dataSetCacheManager.load(parsedImageId.url, loader), imageId, parsedImageId.frame, parsedImageId.url);
    }

    // not multiframe, load it directly and let cornerstone cache manager its lifetime
    var deferred = $.Deferred();
    var xhrRequestPromise =  loader(parsedImageId.url, imageId);
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

  // register dicomweb and wadouri image loader prefixes
  cornerstoneWADOImageLoader.internal.loadImage = loadImage;

}($, cornerstone, cornerstoneWADOImageLoader));