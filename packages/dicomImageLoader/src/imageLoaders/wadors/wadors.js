
(function ($, cornerstone, cornerstoneWADOImageLoader) {

  "use strict";

  function loadImage(imageId) {
    var deferred = $.Deferred();
    var index = imageId.substring(7);
    var image = cornerstoneWADOImageLoader.imageManager.get(index);
    if(image === undefined) {
      deferred.reject('unknown imageId');
      return deferred.promise();
    }

    var mediaType;// = 'image/dicom+jp2';

    cornerstoneWADOImageLoader.internal.getImageFrame(image.uri, imageId, mediaType).then(function(result) {
      //console.log(result);
      // TODO: add support for retrieving compressed pixel data
      var storedPixelData;
      if(image.instance.bitsAllocated === 16) {
        var arrayBuffer = result.arrayBuffer;
        var offset = result.offset;

        // if pixel data is not aligned on even boundary, shift it so we can create the 16 bit array
        // buffers on it
        if(offset % 2) {
          arrayBuffer = result.arrayBuffer.slice(result.offset);
          offset = 0;
        }

        if(image.instance.pixelRepresentation === 0) {
          storedPixelData = new Uint16Array(arrayBuffer, offset, result.length / 2);
        } else {
          storedPixelData = new Int16Array(arrayBuffer, offset, result.length / 2);
        }
      } else if(image.instance.bitsAllocated === 8) {
        storedPixelData = new Uint8Array(result.arrayBuffer, result.offset, result.length);
      }

      // TODO: handle various color space conversions

      var minMax = cornerstoneWADOImageLoader.getMinMax(storedPixelData);
      image.imageId = imageId;
      image.minPixelValue = minMax.min;
      image.maxPixelValue = minMax.max;
      image.render = cornerstone.renderGrayscaleImage;
      image.getPixelData = function() {
        return storedPixelData;
      };
      //console.log(image);
      deferred.resolve(image);
    }).fail(function(reason) {
      deferred.reject(reason);
    });

    return deferred.promise();
  }

  // registery dicomweb and wadouri image loader prefixes
  cornerstone.registerImageLoader('wadors', loadImage);

}($, cornerstone, cornerstoneWADOImageLoader));