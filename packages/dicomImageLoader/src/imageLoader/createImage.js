/**
 */
(function ($, cornerstone, cornerstoneWADOImageLoader) {

  "use strict";

  var lastImageIdDrawn = "";

  function isModalityLUTForDisplay(sopClassUid) {
    // special case for XA and XRF
    // https://groups.google.com/forum/#!searchin/comp.protocols.dicom/Modality$20LUT$20XA/comp.protocols.dicom/UBxhOZ2anJ0/D0R_QP8V2wIJ
    return  sopClassUid !== '1.2.840.10008.5.1.4.1.1.12.1' && // XA
      sopClassUid !== '1.2.840.10008.5.1.4.1.1.12.2.1	'; // XRF
  }

  /**
   * Helper function to set pixel data to the right typed array.  This is needed because web workers
   * can transfer array buffers but not typed arrays
   * @param imageFrame
   */
  function setPixelDataType(imageFrame) {
    if(imageFrame.bitsAllocated === 16) {
      if(imageFrame.pixelRepresentation === 0) {
        imageFrame.pixelData = new Uint16Array(imageFrame.pixelData);
      } else {
        imageFrame.pixelData = new Int16Array(imageFrame.pixelData);
      }
    } else {
      imageFrame.pixelData = new Uint8Array(imageFrame.pixelData);
    }
  }

  function createImage(imageId, pixelData, transferSyntax, options) {
    var canvas = document.createElement('canvas');
    var deferred = $.Deferred();
    var imageFrame = cornerstoneWADOImageLoader.getImageFrame(imageId);
    var decodePromise = cornerstoneWADOImageLoader.decodeImageFrame(imageFrame, transferSyntax, pixelData, canvas, options);
    decodePromise.then(function(imageFrame) {      
      //var imagePixelModule = metaDataProvider('imagePixelModule', imageId);
      var imagePlaneModule = cornerstone.metaData.get('imagePlaneModule', imageId);
      var voiLutModule = cornerstone.metaData.get('voiLutModule', imageId);
      var modalityLutModule = cornerstone.metaData.get('modalityLutModule', imageId);
      var sopCommonModule = cornerstone.metaData.get('sopCommonModule', imageId);
      var isColorImage = cornerstoneWADOImageLoader.isColorImage(imageFrame.photometricInterpretation);

      // JPEGBaseline (8 bits) is already returning the pixel data in the right format (rgba)
      // because it's using a canvas to load and decode images.
      if(!cornerstoneWADOImageLoader.isJPEGBaseline8BitColor(imageFrame, transferSyntax)) {
        setPixelDataType(imageFrame);

        // convert color space
        if(isColorImage) {
          // setup the canvas context
          canvas.height = imageFrame.rows;
          canvas.width = imageFrame.columns;

          var context = canvas.getContext('2d');
          var imageData = context.createImageData(imageFrame.columns, imageFrame.rows);
          cornerstoneWADOImageLoader.convertColorSpace(imageFrame, imageData);
          imageFrame.imageData = imageData;
          imageFrame.pixelData = imageData.data;
        }
      }

      var image = {
        imageId: imageId,
        color: isColorImage,
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
        sizeInBytes: imageFrame.pixelData.length,
        slope: modalityLutModule.rescaleSlope ? modalityLutModule.rescaleSlope: 1,
        width: imageFrame.columns,
        windowCenter: voiLutModule.windowCenter ? voiLutModule.windowCenter[0] : undefined,
        windowWidth: voiLutModule.windowWidth ? voiLutModule.windowWidth[0] : undefined,
        decodeTimeInMS : imageFrame.decodeTimeInMS,
        webWorkerTimeInMS: imageFrame.webWorkerTimeInMS
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