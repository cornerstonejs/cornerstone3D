(function (cornerstoneWADOImageLoader) {

  "use strict";

  function convertRGB(dataSet, decodedImageFrame, rgbaBuffer) {
    var planarConfiguration = dataSet.uint16('x00280006');
    if(planarConfiguration === 0) {
      cornerstoneWADOImageLoader.convertRGBColorByPixel(decodedImageFrame, rgbaBuffer);
    } else {
      cornerstoneWADOImageLoader.convertRGBColorByPlane(decodedImageFrame, rgbaBuffer);
    }
  }

  function convertColorSpace(canvas, dataSet, imageFrame) {
    // extract the fields we need
    var height = dataSet.uint16('x00280010');
    var width = dataSet.uint16('x00280011');
    var photometricInterpretation = dataSet.string('x00280004');

    // setup the canvas context
    canvas.height = height;
    canvas.width = width;
    var context = canvas.getContext('2d');
    var imageData = context.createImageData(width, height);


    // convert based on the photometric interpretation
    var deferred = $.Deferred();
    try {
      if (photometricInterpretation === "RGB" )
      {
        convertRGB(dataSet, imageFrame, imageData.data);
      }
      else if (photometricInterpretation === "YBR_RCT")
      {
        convertRGB(dataSet, imageFrame, imageData.data);
      }
      else if (photometricInterpretation === "YBR_ICT")
      {
        convertRGB(dataSet, imageFrame, imageData.data);
      }
      else if( photometricInterpretation === "PALETTE COLOR" )
      {
        cornerstoneWADOImageLoader.convertPALETTECOLOR(imageFrame, imageData.data, dataSet );
      }
      else if( photometricInterpretation === "YBR_FULL_422" )
      {
        cornerstoneWADOImageLoader.convertYBRFull(imageFrame, imageData.data);
      }
      else if(photometricInterpretation === "YBR_FULL" )
      {
        cornerstoneWADOImageLoader.convertYBRFull(imageFrame, imageData.data);
      }
      else
      {
        throw "no color space conversion for photometric interpretation " + photometricInterpretation;
      }
      deferred.resolve(imageData);
      return deferred.promise();
    } catch (error) {
      deferred.reject(error);
      return deferred.promise();
    }
  }

  // module exports
  cornerstoneWADOImageLoader.convertColorSpace = convertColorSpace;

}(cornerstoneWADOImageLoader));