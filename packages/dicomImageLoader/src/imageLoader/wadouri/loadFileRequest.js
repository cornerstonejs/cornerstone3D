(function ($, cornerstone, cornerstoneWADOImageLoader) {

  "use strict";

  function loadFileRequest(uri) {

    var parsedImageId = cornerstoneWADOImageLoader.wadouri.parseImageId(uri);
    var fileIndex = parseInt(parsedImageId.url);
    var file = cornerstoneWADOImageLoader.wadouri.fileManager.get(fileIndex);
    
    // create a deferred object
    var deferred = $.Deferred();

    var fileReader = new FileReader();
    fileReader.onload = function (e) {
      var dicomPart10AsArrayBuffer = e.target.result;
      deferred.resolve(dicomPart10AsArrayBuffer);
    };
    fileReader.readAsArrayBuffer(file);

    return deferred.promise();
  }
  cornerstoneWADOImageLoader.wadouri.loadFileRequest = loadFileRequest;
}($, cornerstone, cornerstoneWADOImageLoader));
