import { ByteArray } from 'dicom-parser';
import external from '../externalModules';
import getMinMax from '../shared/getMinMax';
import getTypedArrayFromMinMax from '../shared/getTypedArrayFromMinMax';
import {
  DICOMLoaderImageOptions,
  MetadataImagePlaneModule,
  MetadataSopCommonModule,
  DICOMLoaderIImage,
  ImageFrame,
  PixelDataTypedArray,
} from '../types';
import convertColorSpace from './convertColorSpace';
import decodeImageFrame from './decodeImageFrame';
import getImageFrame from './getImageFrame';
import getScalingParameters from './getScalingParameters';
import { getOptions } from './internal/options';
import isColorImageFn from './isColorImage';
import isJPEGBaseline8BitColor from './isJPEGBaseline8BitColor';

let lastImageIdDrawn = '';

function isModalityLUTForDisplay(sopClassUid: string): boolean {
  // special case for XA and XRF
  // https://groups.google.com/forum/#!searchin/comp.protocols.dicom/Modality$20LUT$20XA/comp.protocols.dicom/UBxhOZ2anJ0/D0R_QP8V2wIJ
  return (
    sopClassUid !== '1.2.840.10008.5.1.4.1.1.12.1' && // XA
    sopClassUid !== '1.2.840.10008.5.1.4.1.1.12.2.1'
  ); // XRF
}

/**
 * Helper function to set pixel d2023-03-17-16-35-04.pngata to the right typed array.
 * This is needed because web workers can transfer array buffers but not typed arrays
 *
 * Here we are setting the pixel data to the right typed array based on the final
 * min and max values
 */
function setPixelDataType(imageFrame) {
  const minValue = imageFrame.smallestPixelValue;
  const maxValue = imageFrame.largestPixelValue;

  const TypedArray = getTypedArrayFromMinMax(minValue, maxValue);

  if (TypedArray) {
    const typedArray = new TypedArray(imageFrame.pixelData);
    imageFrame.pixelData = typedArray;
  } else {
    throw new Error('Could not apply a typed array to the pixel data');
  }
}

/**
 * Removes the A from RGBA to return RGB buffer, this is used when the
 * decoding happens with browser API which results in RGBA, but if useRGBA flag
 * is set to false, we want to return RGB
 *
 * @param pixelData - decoded image in RGBA
 * @param targetBuffer - target buffer to write to
 */
function removeAFromRGBA(
  pixelData: PixelDataTypedArray,
  targetBuffer: Uint8ClampedArray | Uint8Array
) {
  const numPixels = pixelData.length / 4;

  let rgbIndex = 0;

  let bufferIndex = 0;

  for (let i = 0; i < numPixels; i++) {
    targetBuffer[bufferIndex++] = pixelData[rgbIndex++]; // red
    targetBuffer[bufferIndex++] = pixelData[rgbIndex++]; // green
    targetBuffer[bufferIndex++] = pixelData[rgbIndex++]; // blue
    rgbIndex++; // skip alpha
  }

  return targetBuffer;
}

function createImage(
  imageId: string,
  pixelData: ByteArray,
  transferSyntax: string,
  options: DICOMLoaderImageOptions = {}
): Promise<DICOMLoaderIImage | ImageFrame> {
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

  const { use16BitDataType } = decodeConfig;

  return new Promise<DICOMLoaderIImage | ImageFrame>((resolve, reject) => {
    // eslint-disable-next-line complexity
    decodePromise.then(function (imageFrame: ImageFrame) {
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
        const {
          arrayBuffer,
          type,
          offset: rawOffset = 0,
          length: rawLength,
        } = options.targetBuffer;

        const imageFrameLength = imageFrame.pixelDataLength;

        const offset = rawOffset;
        const length =
          rawLength !== null && rawLength !== undefined
            ? rawLength
            : imageFrameLength - offset;

        const typedArrayConstructors = {
          Uint8Array,
          Uint16Array: use16BitDataType ? Uint16Array : undefined,
          Int16Array: use16BitDataType ? Int16Array : undefined,
          Float32Array,
        };

        if (length !== imageFrame.pixelDataLength) {
          throw new Error(
            `target array for image does not have the same length (${length}) as the decoded image length (${imageFrame.pixelDataLength}).`
          );
        }

        const TypedArrayConstructor = typedArrayConstructors[type];

        // TypedArray.Set is api level and ~50x faster than copying elements even for
        // Arrays of different types, which aren't simply memcpy ops.
        const typedArray = arrayBuffer
          ? new TypedArrayConstructor(arrayBuffer, offset, length)
          : new TypedArrayConstructor(imageFrame.pixelData);

        if (length !== imageFrame.pixelDataLength) {
          throw new Error(
            'target array for image does not have the same length as the decoded image length.'
          );
        }

        imageFrame.pixelData = typedArray;
        alreadyTyped = true;
      }

      if (!alreadyTyped) {
        setPixelDataType(imageFrame);
      }

      const imagePlaneModule: MetadataImagePlaneModule =
        cornerstone.metaData.get('imagePlaneModule', imageId) || {};
      const voiLutModule =
        cornerstone.metaData.get('voiLutModule', imageId) || {};
      const modalityLutModule =
        cornerstone.metaData.get('modalityLutModule', imageId) || {};
      const sopCommonModule: MetadataSopCommonModule =
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
          const colorBuffer = new Uint8Array(
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

          /** @todo check as any */
          const colorBuffer = new (imageData.data as any).constructor(
            (imageData.data.length / 4) * 3
          );

          // remove the A from the RGBA of the imageFrame
          imageFrame.pixelData = removeAFromRGBA(imageData.data, colorBuffer);
        }

        /** @todo check as any */
        // calculate smallest and largest PixelValue of the converted pixelData
        const minMax = getMinMax(imageFrame.pixelData as any);

        imageFrame.smallestPixelValue = minMax.min;
        imageFrame.largestPixelValue = minMax.max;
      }

      const image: DICOMLoaderIImage = {
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
        // use the first value for rendering, if other values
        // are needed later, it can be grabbed again from the voiLUtModule
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
        getPixelData: () => imageFrame.pixelData,
        getCanvas: undefined,
        numComps: undefined,
      };

      if (image.color) {
        image.getCanvas = function () {
          // get canvas is being used in the cpu pass for speed up only
          if (lastImageIdDrawn === imageId) {
            return canvas;
          }

          canvas.height = image.rows;
          canvas.width = image.columns;
          const context = canvas.getContext('2d');

          // Create an ImageData object from the Uint8ClampedArray
          const imageData = new ImageData(
            new Uint8ClampedArray(imageFrame.pixelData),
            image.columns,
            image.rows
          );

          imageFrame.imageData = imageData;
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
