/**
 */
(function ($, cornerstone, cornerstoneWADOImageLoader) {

  "use strict";

  var canvas = document.createElement('canvas');
  console.log(canvas);
  var lastImageIdDrawn = "";

  function isModalityLUTForDisplay(sopClassUid) {
    // special case for XA and XRF
    // https://groups.google.com/forum/#!searchin/comp.protocols.dicom/Modality$20LUT$20XA/comp.protocols.dicom/UBxhOZ2anJ0/D0R_QP8V2wIJ
    return  sopClassUid !== '1.2.840.10008.5.1.4.1.1.12.1' && // XA
      sopClassUid !== '1.2.840.10008.5.1.4.1.1.12.2.1	'; // XRF
  }

  function getSizeInBytes(imageFrame) {
    var bytesPerPixel = Math.round(imageFrame.bitsAllocated);
    var sizeInBytes = imageFrame.rows * imageFrame.columns * bytesPerPixel * imageFrame.samplesPerPixel;
    return sizeInBytes;
  }

  function createImage(imageId, pixelData, transferSyntax, metaDataProvider) {
    var deferred = $.Deferred();
    var imageFrame = cornerstoneWADOImageLoader.getImageFrame(imageId, metaDataProvider);
    var decodePromise = cornerstoneWADOImageLoader.decodeImageFrame(imageFrame, transferSyntax, pixelData, canvas);
    decodePromise.then(function(imageFrame) {
      //var imagePixelModule = metaDataProvider('imagePixelModule', imageId);
      var imagePlaneModule = metaDataProvider('imagePlaneModule', imageId);
      var voiLutModule = metaDataProvider('voiLutModule', imageId);
      var modalityLutModule = metaDataProvider('modalityLutModule', imageId);
      var sopCommonModule = metaDataProvider('sopCommonModule', imageId);

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
        render: undefined, // set below
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
        image.render = cornerstone.renderColorImage;
        image.getCanvas = function() {
          if(lastImageIdDrawn === imageId) {
            return canvas;
          }

          canvas.height = image.rows;
          canvas.width = image.columns;
          var context = canvas.getContext('2d');
          context.putImageData(imageFrame.imageData, 0, 0 );
          lastImageIdDrawn = imageId;
          return canvas;
        };
      } else {
        image.render = cornerstone.renderGrayscaleImage;
      }

      // calculate min/max if not supplied
      if(image.minPixelValue === undefined || image.maxPixelValue === undefined) {
        var minMax = cornerstoneWADOImageLoader.getMinMax(imageFrame.pixelData);
        image.minPixelValue = minMax.min;
        image.maxPixelValue = minMax.max;
      }

      // Modality LUT
      if(modalityLutModule.modalityLUTSequence &&
        modalityLutModule.modalityLUTSequence.length > 0 &&
        isModalityLUTForDisplay(sopCommonModule.sopClassUID)) {
        image.modalityLUT = modalityLutModule.modalityLUTSequence[0];
      }

      // VOI LUT
      if(voiLutModule.voiLUTSequence &&
        voiLutModule.voiLUTSequence.length > 0) {
        image.voiLUT  = voiLutModule.voiLUTSequence[0];
      }

      // set the ww/wc to cover the dynamic range of the image if no values are supplied
      if(image.windowCenter === undefined || image.windowWidth === undefined) {
        if(image.color) {
          image.windowWidth = 255;
          image.windowCenter = 128;
        } else {
          var maxVoi = image.maxPixelValue * image.slope + image.intercept;
          var minVoi = image.minPixelValue * image.slope + image.intercept;
          image.windowWidth = maxVoi - minVoi;
          image.windowCenter = (maxVoi + minVoi) / 2;
        }
      }
      deferred.resolve(image);
    });
    return deferred.promise();
  }

  cornerstoneWADOImageLoader.createImage = createImage;
}($, cornerstone, cornerstoneWADOImageLoader));