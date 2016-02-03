
(function ($, cornerstone, cornerstoneWADOImageLoader) {

  "use strict";


  function loadImage(imageId) {
    var deferred = $.Deferred();
    var index = imageId.substring(7);
    var image = cornerstoneWADOImageLoader.imageManager.get(index);
    if(image === undefined) {
      deferred.reject('unknown imageId');
      return deferred;
    }

    var mediaType;// = 'image/dicom+jp2';

    cornerstoneWADOImageLoader.internal.getImageFrame(image.uri, mediaType).then(function(result) {
      //console.log(result);
      // TODO: add support for retrieving compressed pixel data
      var storedPixelData;
      if(image.instance.bitsAllocated === 16) {
        if(image.instance.pixelRepresentation === 0) {
          storedPixelData = new Uint16Array(result.arrayBuffer, result.offset, result.length / 2);
        } else {
          storedPixelData = new Int16Array(result.arrayBuffer, result.offset, result.length / 2);
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

    return deferred;
  }

  // registery dicomweb and wadouri image loader prefixes
  cornerstone.registerImageLoader('wadors', loadImage);

}($, cornerstone, cornerstoneWADOImageLoader));