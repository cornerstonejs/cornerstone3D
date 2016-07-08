/**
 */
(function ($, cornerstone, cornerstoneWADOImageLoader) {

  "use strict";


  function getSizeInBytes(imageFrame) {
    var bytesPerPixel = Math.round(imageFrame.bitsAllocated);
    var sizeInBytes = imageFrame.rows * imageFrame.columns * bytesPerPixel * imageFrame.samplesPerPixel;
    return sizeInBytes;
  }

  function createImage(imageId, imageFrame) {
    var metaDataProvider = cornerstoneWADOImageLoader.wadors.metaDataProvider;

    //var imagePixelModule = metaDataProvider('imagePixelModule', imageId);
    var imagePlaneModule = metaDataProvider('imagePlaneModule', imageId);
    var voiLutModule = metaDataProvider('voiLutModule', imageId);
    var modalityLutModule = metaDataProvider('modalityLutModule', imageId);

    var image = {
      imageId: imageId,
      color: cornerstoneWADOImageLoader.isColorImage(imageFrame.photometricInterpretation),
      columnPixelSpacing: imagePlaneModule.pixelSpacing ? imagePlaneModule.pixelSpacing[1] : undefined,
      columns: imageFrame.columns,
      height: imageFrame.rows,
      intercept: modalityLutModule.rescaleIntercept ? modalityLutModule.rescaleIntercept: 0,
      invert: imageFrame.photometricInterpretation === "MONOCHROME1",
      minPixelValue : imageFrame.smallestPixelValue,
      maxPixelValue : imageFrame.largestPixelValue,
      render: cornerstone.renderGrayscaleImage,
      rowPixelSpacing: imagePlaneModule.pixelSpacing ? imagePlaneModule.pixelSpacing[0] : undefined,
      rows: imageFrame.rows,
      sizeInBytes: getSizeInBytes(imageFrame),
      slope: modalityLutModule.rescaleSlope ? modalityLutModule.rescaleSlope: 1,
      width: imageFrame.columns,
      windowCenter: voiLutModule.windowCenter ? voiLutModule.windowCenter[0] : undefined,
      windowWidth: voiLutModule.windowWidth ? voiLutModule.windowWidth[0] : undefined,
      decodeTimeInMS : imageFrame.decodeTimeInMS
    };

      // add function to return pixel data
    image.getPixelData = function() {
      return imageFrame.pixelData;
    };

    // Setup the renderer
    if(image.color) {
      image.renderer = cornerstone.renderColorImage;
    } else {
      image.renderer = cornerstone.renderGrayscaleImage;
    }

    // calculate min/max if not supplied
    if(image.minPixelValue === undefined || image.maxPixelValue === undefined) {
      var minMax = cornerstoneWADOImageLoader.getMinMax(imageFrame.pixelData);
      image.minPixelValue = minMax.min;
      image.maxPixelValue = minMax.max;
    }

    // set the ww/wc to cover the dynamic range of the image if no values are supplied
    if(image.windowCenter === undefined || image.windowWidth === undefined) {
      var maxVoi = image.maxPixelValue * image.slope + image.intercept;
      var minVoi = image.minPixelValue * image.slope + image.intercept;
      image.windowWidth = maxVoi - minVoi;
      image.windowCenter = (maxVoi + minVoi) / 2;
    }

    // TODO: VOILUT
    // TODO: ModalityLUT
    
    return image;
  }

  cornerstoneWADOImageLoader.wadors.createImage = createImage;
}($, cornerstone, cornerstoneWADOImageLoader));