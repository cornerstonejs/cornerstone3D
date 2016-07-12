(function (cornerstoneWADOImageLoader) {

  "use strict";

  function convertRGB(imageFrame, rgbaBuffer) {
    if(imageFrame.planarConfiguration === 0) {
      cornerstoneWADOImageLoader.convertRGBColorByPixel(imageFrame.pixelData, rgbaBuffer);
    } else {
      cornerstoneWADOImageLoader.convertRGBColorByPlane(imageFrame.pixelData, rgbaBuffer);
    }
  }

  function convertYBRFull(imageFrame, rgbaBuffer) {
    if(imageFrame.planarConfiguration === 0) {
      cornerstoneWADOImageLoader.convertYBRFullByPixel(imageFrame.pixelData, rgbaBuffer);
    } else {
      cornerstoneWADOImageLoader.convertYBRFullByPlane(imageFrame.pixelData, rgbaBuffer);
    }
  }

  function convertColorSpace(imageFrame, imageData) {
    var rgbaBuffer = imageData.data;

    // convert based on the photometric interpretation
    if (imageFrame.photometricInterpretation === "RGB" )
    {
      convertRGB(imageFrame, rgbaBuffer);
    }
    else if (imageFrame.photometricInterpretation === "YBR_RCT")
    {
      convertRGB(imageFrame, rgbaBuffer);
    }
    else if (imageFrame.photometricInterpretation === "YBR_ICT")
    {
      convertRGB(imageFrame, rgbaBuffer);
    }
    else if( imageFrame.photometricInterpretation === "PALETTE COLOR" )
    {
      cornerstoneWADOImageLoader.convertPALETTECOLOR(imageFrame, rgbaBuffer);
    }
    else if( imageFrame.photometricInterpretation === "YBR_FULL_422" )
    {
      convertRGB(imageFrame, rgbaBuffer);
    }
    else if(imageFrame.photometricInterpretation === "YBR_FULL" )
    {
      convertYBRFull(imageFrame, rgbaBuffer);
    }
    else
    {
      throw "no color space conversion for photometric interpretation " + imageFrame.photometricInterpretation;
    }
  }

  // module exports
  cornerstoneWADOImageLoader.convertColorSpace = convertColorSpace;

}(cornerstoneWADOImageLoader));