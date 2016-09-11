(function (cornerstoneWADOImageLoader) {

  "use strict";

  function findBoundary(header) {
    for(var i=0; i < header.length; i++) {
      if(header[i].substr(0,2) === '--') {
        return header[i];
      }
    }
    return undefined;
  }

  function findContentType(header) {
    for(var i=0; i < header.length; i++) {
      if(header[i].substr(0,13) === 'Content-Type:') {
        return header[i].substr(13).trim();
      }
    }
    return undefined;
  }

  function uint8ArrayToString(data, offset, length) {
    offset = offset || 0;
    length = length || data.length - offset;
    var str = "";
    for(var i=offset; i < offset + length; i++) {
      str += String.fromCharCode(data[i]);
    }
    return str;
  }

  cornerstoneWADOImageLoader.wadors.getPixelData = function(uri, imageId, mediaType) {
    mediaType = mediaType || 'application/octet-stream';
    var headers = {
      accept : mediaType
    };

    var deferred = $.Deferred();

    var loadPromise = cornerstoneWADOImageLoader.internal.xhrRequest(uri, imageId, headers);
    loadPromise.then(function(imageFrameAsArrayBuffer/*, xhr*/) {

      // request succeeded, Parse the multi-part mime response
      var response = new Uint8Array(imageFrameAsArrayBuffer);

      // First look for the multipart mime header
      var tokenIndex = cornerstoneWADOImageLoader.wadors.findIndexOfString(response, '\n\r\n');
      if(tokenIndex === -1) {
        deferred.reject('invalid response - no multipart mime header');
      }
      var header = uint8ArrayToString(response, 0, tokenIndex);
      // Now find the boundary  marker
      var split = header.split('\r\n');
      var boundary = findBoundary(split);
      if(!boundary) {
        deferred.reject('invalid response - no boundary marker')
      }
      var offset = tokenIndex + 3; // skip over the \n\r\n

      // find the terminal boundary marker
      var endIndex = cornerstoneWADOImageLoader.wadors.findIndexOfString(response, boundary, offset);
      if(endIndex === -1) {
        deferred.reject('invalid response - terminating boundary not found');
      }
      // return the info for this pixel data
      var length = endIndex - offset;
      deferred.resolve({
        contentType: findContentType(split),
        imageFrame: new Uint8Array(imageFrameAsArrayBuffer, offset, length)
      });
    });
    return deferred.promise();    

  };
}(cornerstoneWADOImageLoader));