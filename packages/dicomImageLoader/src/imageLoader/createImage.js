import external from '../externalModules.js';
import getImageFrame from './getImageFrame.js';
import decodeImageFrame from './decodeImageFrame.js';
import isColorImageFn from './isColorImage.js';
import convertColorSpace from './convertColorSpace.js';
import getMinMax from '../shared/getMinMax.js';
import isJPEGBaseline8BitColor from './isJPEGBaseline8BitColor.js';
import { getOptions } from './internal/options.js';
import getScalingParameters from './getScalingParameters.js';

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

/**
 * Removes the A from RGBA to return RGB buffer, this is used when the
 * decoding happens with browser API which results in RGBA, but if useRGBA flag
 * is set to false, we want to return RGB
 *
 * @param imageFrame - decoded image in RGBA
 * @param targetBuffer - target buffer to write to
 */
function removeAFromRGBA(imageFrame, targetBuffer) {
  const numPixels = imageFrame.length / 4;

  let rgbIndex = 0;

  let bufferIndex = 0;

  for (let i = 0; i < numPixels; i++) {
    targetBuffer[bufferIndex++] = imageFrame[rgbIndex++]; // red
    targetBuffer[bufferIndex++] = imageFrame[rgbIndex++]; // green
    targetBuffer[bufferIndex++] = imageFrame[rgbIndex++]; // blue
    rgbIndex++; // skip alpha
  }

  return targetBuffer;
}

function createImage(imageId, pixelData, transferSyntax, options = {}) {
  // whether to use RGBA for color images, default true as cs-legacy uses RGBA
  // but we don't need RGBA in cs3d, and it's faster, and memory-efficient
  // in cs3d
  let useRGBA = true;

  if (options.useRGBA !== undefined) {
    useRGBA = options.useRGBA;
  }

  // always preScale the pixel array unless it is asked not to
  options.preScale = {
    enabled:
      options.preScale && options.preScale.enabled !== undefined
        ? options.preScale.enabled
        : false,
  };

  if (!pixelData || !pixelData.length) {
    return Promise.reject(new Error('The file does not contain image data.'));
  }

  const { cornerstone } = external;
  const canvas = document.createElement('canvas');
  const imageFrame = getImageFrame(imageId);

  // Get the scaling parameters from the metadata
  if (options.preScale.enabled) {
    const scalingParameters = getScalingParameters(
      cornerstone.metaData,
      imageId
    );

    if (scalingParameters) {
      options.preScale = {
        ...options.preScale,
        scalingParameters,
      };
    }
  }

  const { decodeConfig } = getOptions();

  const decodePromise = decodeImageFrame(
    imageFrame,
    transferSyntax,
    pixelData,
    canvas,
    options,
    decodeConfig
  );

  const { convertFloatPixelDataToInt, use16BitDataType } = decodeConfig;

  return new Promise((resolve, reject) => {
    // eslint-disable-next-line complexity
    decodePromise.then(function (imageFrame) {
      // if it is desired to skip creating image, return the imageFrame
      // after the decode. This might be useful for some applications
      // that only need the decoded pixel data and not the image object
      if (options.skipCreateImage) {
        return resolve(imageFrame);
      }
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
          case use16BitDataType && 'Uint16Array':
            TypedArrayConstructor = Uint16Array;
            break;
          case use16BitDataType && 'Int16Array':
            TypedArrayConstructor = Int16Array;
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

      if (!alreadyTyped) {
        setPixelDataType(imageFrame);
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

      if (isColorImage) {
        if (useRGBA) {
          // JPEGBaseline (8 bits) is already returning the pixel data in the right format (rgba)
          // because it's using a canvas to load and decode images.
          if (!isJPEGBaseline8BitColor(imageFrame, transferSyntax)) {
            canvas.height = imageFrame.rows;
            canvas.width = imageFrame.columns;

            const context = canvas.getContext('2d');

            const imageData = context.createImageData(
              imageFrame.columns,
              imageFrame.rows
            );

            convertColorSpace(imageFrame, imageData.data, useRGBA);

            imageFrame.imageData = imageData;
            imageFrame.pixelData = imageData.data;
          }
        } else if (isJPEGBaseline8BitColor(imageFrame, transferSyntax)) {
          // If we don't need the RGBA but the decoding is done with RGBA (the case
          // for JPEG Baseline 8 bit color), AND the option specifies to use RGB (no RGBA)
          // we need to remove the A channel from pixel data
          const colorBuffer = new Uint8ClampedArray(
            (imageFrame.pixelData.length / 4) * 3
          );

          // remove the A from the RGBA of the imageFrame
          imageFrame.pixelData = removeAFromRGBA(
            imageFrame.pixelData,
            colorBuffer
          );
        } else if (imageFrame.photometricInterpretation === 'PALETTE COLOR') {
          canvas.height = imageFrame.rows;
          canvas.width = imageFrame.columns;

          const context = canvas.getContext('2d');

          const imageData = context.createImageData(
            imageFrame.columns,
            imageFrame.rows
          );

          convertColorSpace(imageFrame, imageData.data, true);

          const colorBuffer = new imageData.data.constructor(
            (imageData.data.length / 4) * 3
          );

          // remove the A from the RGBA of the imageFrame
          imageFrame.pixelData = removeAFromRGBA(imageData.data, colorBuffer);
        }

        // calculate smallest and largest PixelValue of the converted pixelData
        const minMax = getMinMax(imageFrame.pixelData);

        imageFrame.smallestPixelValue = minMax.min;
        imageFrame.largestPixelValue = minMax.max;
      }

      const image = {
        imageId,
        color: isColorImage,
        columnPixelSpacing: imagePlaneModule.columnPixelSpacing,
        columns: imageFrame.columns,
        height: imageFrame.rows,
        preScale: imageFrame.preScale,
        intercept: modalityLutModule.rescaleIntercept
          ? modalityLutModule.rescaleIntercept
          : 0,
        slope: modalityLutModule.rescaleSlope
          ? modalityLutModule.rescaleSlope
          : 1,
        invert: imageFrame.photometricInterpretation === 'MONOCHROME1',
        minPixelValue: imageFrame.smallestPixelValue,
        maxPixelValue: imageFrame.largestPixelValue,
        rowPixelSpacing: imagePlaneModule.rowPixelSpacing,
        rows: imageFrame.rows,
        sizeInBytes: imageFrame.pixelData.byteLength,
        width: imageFrame.columns,
        windowCenter: voiLutModule.windowCenter
          ? voiLutModule.windowCenter[0]
          : undefined,
        windowWidth: voiLutModule.windowWidth
          ? voiLutModule.windowWidth[0]
          : undefined,
        voiLUTFunction: voiLutModule.voiLUTFunction
          ? voiLutModule.voiLUTFunction
          : undefined,
        decodeTimeInMS: imageFrame.decodeTimeInMS,
        floatPixelData: undefined,
        imageFrame,
        rgba: isColorImage && useRGBA,
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
