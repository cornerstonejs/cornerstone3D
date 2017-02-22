
(function ($, cornerstone, cornerstoneWADOImageLoader) {

  "use strict";

  // add a decache callback function to clear out our dataSetCacheManager
  function addDecache(image) {
    image.decache = function() {
      //console.log('decache');
      var parsedImageId = cornerstoneWADOImageLoader.wadouri.parseImageId(image.imageId);
      cornerstoneWADOImageLoader.wadouri.dataSetCacheManager.unload(parsedImageId.url);
    };
  }

  function getPixelData(dataSet, frameIndex) {
    var pixelDataElement = dataSet.elements.x7fe00010;

    if(pixelDataElement.encapsulatedPixelData) {
      return cornerstoneWADOImageLoader.wadouri.getEncapsulatedImageFrame(dataSet, frameIndex);
    } else {
      return cornerstoneWADOImageLoader.wadouri.getUncompressedImageFrame(dataSet, frameIndex);
    }
  }

  function loadDataSetFromPromise(xhrRequestPromise, imageId, frame, sharedCacheKey, options) {

    var start = new Date().getTime();
    frame = frame || 0;
    var deferred = $.Deferred();
    xhrRequestPromise.then(function(dataSet/*, xhr*/) {
      var pixelData = getPixelData(dataSet, frame);
      var transferSyntax =  dataSet.string('x00020010');
      var loadEnd = new Date().getTime();
      var imagePromise = cornerstoneWADOImageLoader.createImage(imageId, pixelData, transferSyntax, options);
      imagePromise.then(function(image) {
        image.data = dataSet;
        var end = new Date().getTime();
        image.loadTimeInMS = loadEnd - start;
        image.totalTimeInMS = end - start;
        addDecache(image);
        deferred.resolve(image);
      });
    }, function(error) {
      deferred.reject(error);
    });
    return deferred.promise();
  }

  function getLoaderForScheme(scheme) {
    if(scheme === 'dicomweb' || scheme === 'wadouri') {
      return cornerstoneWADOImageLoader.internal.xhrRequest;
    }
    else if(scheme === 'dicomfile') {
      return cornerstoneWADOImageLoader.wadouri.loadFileRequest;
    }
  }

  function loadImage(imageId, options) {
    var parsedImageId = cornerstoneWADOImageLoader.wadouri.parseImageId(imageId);

    var loader = getLoaderForScheme(parsedImageId.scheme);

    // if the dataset for this url is already loaded, use it
    if(cornerstoneWADOImageLoader.wadouri.dataSetCacheManager.isLoaded(parsedImageId.url)) {
      return loadDataSetFromPromise(cornerstoneWADOImageLoader.wadouri.dataSetCacheManager.load(parsedImageId.url, loader, imageId), imageId, parsedImageId.frame, parsedImageId.url, options);
    }

    // load the dataSet via the dataSetCacheManager
    return loadDataSetFromPromise(cornerstoneWADOImageLoader.wadouri.dataSetCacheManager.load(parsedImageId.url, loader, imageId), imageId, parsedImageId.frame, parsedImageId.url, options);
  }

  // register dicomweb and wadouri image loader prefixes
  cornerstone.registerImageLoader('dicomweb', loadImage);
  cornerstone.registerImageLoader('wadouri', loadImage);
  cornerstone.registerImageLoader('dicomfile', loadImage);
}($, cornerstone, cornerstoneWADOImageLoader));