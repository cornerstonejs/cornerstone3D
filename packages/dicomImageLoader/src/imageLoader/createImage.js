import external from '../externalModules.js';
import getImageFrame from './getImageFrame.js';
import decodeImageFrame from './decodeImageFrame.js';
import isColorImageFn from './isColorImage.js';
import convertColorSpace from './convertColorSpace.js';
import getMinMax from '../shared/getMinMax.js';
import isJPEGBaseline8BitColor from './isJPEGBaseline8BitColor.js';
import { getOptions } from './internal/options.js';

let lastImageIdDrawn = '';

function isModalityLUTForDisplay(sopClassUid) {
  // special case for XA and XRF
  // https://groups.google.com/forum/#!searchin/comp.protocols.dicom/Modality$20LUT$20XA/comp.protocols.dicom/UBxhOZ2anJ0/D0R_QP8V2wIJ
  return (
    sopClassUid !== '1.2.840.10008.5.1.4.1.1.12.1' && // XA
    sopClassUid !== '1.2.840.10008.5.1.4.1.1.12.2.1'
  ); // XRF
}

function convertToIntPixelData(floatPixelData) {
  const floatMinMax = getMinMax(floatPixelData);
  const floatRange = Math.abs(floatMinMax.max - floatMinMax.min);
  const intRange = 65535;
  const slope = floatRange / intRange;
  const intercept = floatMinMax.min;
  const numPixels = floatPixelData.length;
  const intPixelData = new Uint16Array(numPixels);

  let min = 65535;

  let max = 0;

  for (let i = 0; i < numPixels; i++) {
    const rescaledPixel = Math.floor((floatPixelData[i] - intercept) / slope);

    intPixelData[i] = rescaledPixel;
    min = Math.min(min, rescaledPixel);
    max = Math.max(max, rescaledPixel);
  }

  return {
    min,
    max,
    intPixelData,
    slope,
    intercept,
  };
}

/**
 * Helper function to set pixel data to the right typed array.  This is needed because web workers
 * can transfer array buffers but not typed arrays
 * @param imageFrame
 */
function setPixelDataType(imageFrame) {
  if (imageFrame.bitsAllocated === 32) {
    imageFrame.pixelData = new Float32Array(imageFrame.pixelData);
  } else if (imageFrame.bitsAllocated === 16) {
    if (imageFrame.pixelRepresentation === 0) {
      imageFrame.pixelData = new Uint16Array(imageFrame.pixelData);
    } else {
      imageFrame.pixelData = new Int16Array(imageFrame.pixelData);
    }
  } else {
    imageFrame.pixelData = new Uint8Array(imageFrame.pixelData);
  }
}

function createImage(imageId, pixelData, transferSyntax, options = {}) {
  if (!pixelData || !pixelData.length) {
    return Promise.reject(new Error('The file does not contain image data.'));
  }

  const { cornerstone } = external;
  const canvas = document.createElement('canvas');
  const imageFrame = getImageFrame(imageId);

  const decodePromise = decodeImageFrame(
    imageFrame,
    transferSyntax,
    pixelData,
    canvas,
    options
  );

  const { decodeConfig } = getOptions();
  const { convertFloatPixelDataToInt } = decodeConfig;

  return new Promise((resolve, reject) => {
    // eslint-disable-next-line complexity
    decodePromise.then(function (imageFrame) {
      // If we have a target buffer that was written to in the
      // Decode task, point the image to it here.
      // We can't have done it within the thread incase it was a SharedArrayBuffer.
      let alreadyTyped = false;

      if (options.targetBuffer) {
        let offset, length;
        // If we have a target buffer, write to that instead. This helps reduce memory duplication.

        ({ offset, length } = options.targetBuffer);
        const { arrayBuffer, type } = options.targetBuffer;

        let TypedArrayConstructor;

        if (length === null || length === undefined) {
          length = imageFrame.pixelDataLength;
        }

        if (offset === null || offset === undefined) {
          offset = 0;
        }

        switch (type) {
          case 'Uint8Array':
            TypedArrayConstructor = Uint8Array;
            break;
          case 'Uint16Array':
            TypedArrayConstructor = Uint16Array;
            break;
          case 'Float32Array':
            TypedArrayConstructor = Float32Array;
            break;
          default:
            throw new Error(
              'target array for image does not have a valid type.'
            );
        }

        if (length !== imageFrame.pixelDataLength) {
          throw new Error(
            'target array for image does not have the same length as the decoded image length.'
          );
        }

        // TypedArray.Set is api level and ~50x faster than copying elements even for
        // Arrays of different types, which aren't simply memcpy ops.
        let typedArray;

        if (arrayBuffer) {
          typedArray = new TypedArrayConstructor(arrayBuffer, offset, length);
        } else {
          typedArray = new TypedArrayConstructor(imageFrame.pixelData);
        }

        // If need to scale, need to scale correct array.
        imageFrame.pixelData = typedArray;
        alreadyTyped = true;
      }

      const imagePlaneModule =
        cornerstone.metaData.get('imagePlaneModule', imageId) || {};
      const voiLutModule =
        cornerstone.metaData.get('voiLutModule', imageId) || {};
      const modalityLutModule =
        cornerstone.metaData.get('modalityLutModule', imageId) || {};
      const sopCommonModule =
        cornerstone.metaData.get('sopCommonModule', imageId) || {};
      const isColorImage = isColorImageFn(imageFrame.photometricInterpretation);

      // JPEGBaseline (8 bits) is already returning the pixel data in the right format (rgba)
      // because it's using a canvas to load and decode images.
      if (!isJPEGBaseline8BitColor(imageFrame, transferSyntax)) {
        if (!alreadyTyped) {
          setPixelDataType(imageFrame);
        }

        // convert color space
        if (isColorImage) {
          // setup the canvas context
          canvas.height = imageFrame.rows;
          canvas.width = imageFrame.columns;

          const context = canvas.getContext('2d');
          const imageData = context.createImageData(
            imageFrame.columns,
            imageFrame.rows
          );

          convertColorSpace(imageFrame, imageData);
          imageFrame.imageData = imageData;
          imageFrame.pixelData = imageData.data;

          // calculate smallest and largest PixelValue of the converted pixelData
          const minMax = getMinMax(imageFrame.pixelData);

          imageFrame.smallestPixelValue = minMax.min;
          imageFrame.largestPixelValue = minMax.max;
        }
      }

      const image = {
        imageId,
        color: isColorImage,
        columnPixelSpacing: imagePlaneModule.columnPixelSpacing,
        columns: imageFrame.columns,
        height: imageFrame.rows,
        intercept: modalityLutModule.rescaleIntercept
          ? modalityLutModule.rescaleIntercept
          : 0,
        invert: imageFrame.photometricInterpretation === 'MONOCHROME1',
        minPixelValue: imageFrame.smallestPixelValue,
        maxPixelValue: imageFrame.largestPixelValue,
        rowPixelSpacing: imagePlaneModule.rowPixelSpacing,
        rows: imageFrame.rows,
        sizeInBytes: imageFrame.pixelData.byteLength,
        slope: modalityLutModule.rescaleSlope
          ? modalityLutModule.rescaleSlope
          : 1,
        width: imageFrame.columns,
        windowCenter: voiLutModule.windowCenter
          ? voiLutModule.windowCenter[0]
          : undefined,
        windowWidth: voiLutModule.windowWidth
          ? voiLutModule.windowWidth[0]
          : undefined,
        decodeTimeInMS: imageFrame.decodeTimeInMS,
        floatPixelData: undefined,
        imageFrame,
      };

      // If pixel data is intrinsically floating 32 array, we convert it to int for
      // display in cornerstone. For other cases when pixel data is typed as
      // Float32Array for scaling; this conversion is not needed.
      if (
        imageFrame.pixelData instanceof Float32Array &&
        convertFloatPixelDataToInt
      ) {
        const floatPixelData = imageFrame.pixelData;
        const results = convertToIntPixelData(floatPixelData);

        image.minPixelValue = results.min;
        image.maxPixelValue = results.max;
        image.slope = results.slope;
        image.intercept = results.intercept;
        image.floatPixelData = floatPixelData;
        image.getPixelData = () => results.intPixelData;
      } else {
        image.getPixelData = () => imageFrame.pixelData;
      }

      if (image.color) {
        image.getCanvas = function () {
          if (lastImageIdDrawn === imageId) {
            return canvas;
          }

          canvas.height = image.rows;
          canvas.width = image.columns;
          const context = canvas.getContext('2d');

          context.putImageData(imageFrame.imageData, 0, 0);
          lastImageIdDrawn = imageId;

          return canvas;
        };
      }

      // Modality LUT
      if (
        modalityLutModule.modalityLUTSequence &&
        modalityLutModule.modalityLUTSequence.length > 0 &&
        isModalityLUTForDisplay(sopCommonModule.sopClassUID)
      ) {
        image.modalityLUT = modalityLutModule.modalityLUTSequence[0];
      }

      // VOI LUT
      if (
        voiLutModule.voiLUTSequence &&
        voiLutModule.voiLUTSequence.length > 0
      ) {
        image.voiLUT = voiLutModule.voiLUTSequence[0];
      }

      if (image.color) {
        image.windowWidth = 255;
        image.windowCenter = 127;
      }

      // set the ww/wc to cover the dynamic range of the image if no values are supplied
      if (image.windowCenter === undefined || image.windowWidth === undefined) {
        const maxVoi = image.maxPixelValue * image.slope + image.intercept;
        const minVoi = image.minPixelValue * image.slope + image.intercept;

        image.windowWidth = maxVoi - minVoi;
        image.windowCenter = (maxVoi + minVoi) / 2;
      }
      resolve(image);
    }, reject);
  });
}

export default createImage;
