
(function ($, cornerstone, cornerstoneWADOImageLoader) {

  "use strict";

  function loadImage(imageId) {
    // create a deferred object
    var deferred = $.Deferred();

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
      var dataSet = cornerstoneWADOImageLoader.internal.multiFrameCacheHack[url];
      var imagePromise = cornerstoneWADOImageLoader.createImageObject(dataSet, imageId, frame);
      imagePromise.then(function(image) {
        deferred.resolve(image);
      }, function(error) {
        deferred.reject(error);
      });
      return deferred;
    }

    var fileIndex = parseInt(url);
    var file = cornerstoneWADOImageLoader.fileManager.get(fileIndex);
    if(file === undefined) {
      deferred.reject('unknown file index ' + url);
      return deferred;
    }


    var fileReader = new FileReader();
    fileReader.onload = function(e) {
      // Parse the DICOM File
      var dicomPart10AsArrayBuffer = e.target.result;
      var byteArray = new Uint8Array(dicomPart10AsArrayBuffer);
      var dataSet = dicomParser.parseDicom(byteArray);

      // if multiframe, cache the parsed data set to speed up subsequent
      // requests for the other frames
      if(frame !== undefined) {
        var dataSet = cornerstoneWADOImageLoader.internal.multiFrameCacheHack[url];
        var imagePromise = cornerstoneWADOImageLoader.createImageObject(dataSet, imageId, frame);
        imagePromise.then(function(image) {
          deferred.resolve(image);
        }, function(error) {
          deferred.reject(error);
        });
        return deferred;
      }

      var imagePromise = cornerstoneWADOImageLoader.createImageObject(dataSet, imageId, frame);
      imagePromise.then(function(image) {
        deferred.resolve(image);
      }, function() {
        deferred.reject();
      });
    };
    fileReader.readAsArrayBuffer(file);

    return deferred;
  }

  // registery dicomweb and wadouri image loader prefixes
  cornerstone.registerImageLoader('dicomfile', loadImage);

}($, cornerstone, cornerstoneWADOImageLoader));