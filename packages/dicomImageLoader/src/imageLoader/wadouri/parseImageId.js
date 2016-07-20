(function (cornerstoneWADOImageLoader) {

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
      scheme: imageId.substr(0, firstColonIndex),
      url : url,
      frame: frame
    };
  }

  // module exports
  cornerstoneWADOImageLoader.wadouri.parseImageId = parseImageId;
  
}(cornerstoneWADOImageLoader));