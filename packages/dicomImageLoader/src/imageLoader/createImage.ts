import type { ByteArray } from 'dicom-parser';
import getMinMax from '../shared/getMinMax';
import getPixelDataTypeFromMinMax from '../shared/getPixelDataTypeFromMinMax';
import type { DICOMLoaderImageOptions, DICOMLoaderIImage } from '../types';
import type { Types } from '@cornerstonejs/core';
import {
  canRenderFloatTextures,
  Enums,
  metaData,
  utilities,
} from '@cornerstonejs/core';
import convertColorSpace from './convertColorSpace';
import isColorConversionRequired from './isColorConversionRequired';
import decodeImageFrame from './decodeImageFrame';
import getImageFrame from './getImageFrame';
import getScalingParameters from './getScalingParameters';
import { getOptions } from './internal/options';
import isColorImageFn from '../shared/isColorImage';

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
 * Helper function to set the right typed array.
 * This is needed because web workers can transfer array buffers but not typed arrays
 *
 * Here we are setting the pixel data to the right typed array based on the final
 * min and max values
 */
function setPixelDataType(imageFrame) {
  const minValue = imageFrame.smallestPixelValue;
  const maxValue = imageFrame.largestPixelValue;

  const TypedArray = getPixelDataTypeFromMinMax(minValue, maxValue);

  if (TypedArray) {
    // @ts-ignore
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
  pixelData: Types.PixelDataTypedArray,
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
): Promise<DICOMLoaderIImage | Types.IImageFrame> {
  // whether to use RGBA for color images, default true as cs-legacy uses RGBA
  // but we don't need RGBA in cs3d, and it's faster, and memory-efficient
  // in cs3d
  const useRGBA = options.useRGBA;

  // always preScale the pixel array unless it is asked not to
  options.preScale = {
    enabled:
      options.preScale && options.preScale.enabled !== undefined
        ? options.preScale.enabled
        : true,
  };

  if (!pixelData?.length) {
    return Promise.reject(new Error('The pixel data is missing'));
  }

  const { MetadataModules } = Enums;
  const canvas = document.createElement('canvas');
  const imageFrame = getImageFrame(imageId);
  imageFrame.decodeLevel = options.decodeLevel;

  options.allowFloatRendering = canRenderFloatTextures();

  // Get the scaling parameters from the metadata
  if (options.preScale.enabled) {
    const scalingParameters = getScalingParameters(metaData, imageId);

    if (scalingParameters) {
      options.preScale = {
        ...options.preScale,
        scalingParameters: scalingParameters as Types.ScalingParameters,
      };
    }
  }

  const { decodeConfig } = getOptions();

  // Remove any property of the `imageFrame` that cannot be transferred to the worker,
  // such as promises and functions.
  // This is necessary because the `imageFrame` object is passed to the worker.
  Object.keys(imageFrame).forEach((key) => {
    if (
      typeof imageFrame[key] === 'function' ||
      imageFrame[key] instanceof Promise
    ) {
      delete imageFrame[key];
    }
  });

  const decodePromise = decodeImageFrame(
    imageFrame,
    transferSyntax,
    pixelData,
    canvas,
    options,
    decodeConfig
  );

  const isColorImage = isColorImageFn(imageFrame.photometricInterpretation);

  return new Promise<DICOMLoaderIImage | Types.IImageFrame>(
    (resolve, reject) => {
      // eslint-disable-next-line complexity
      decodePromise.then(function (imageFrame: Types.IImageFrame) {
        // If we have a target buffer that was written to in the
        // Decode task, point the image to it here.
        let alreadyTyped = false;
        // We can safely render color image in 8 bit, so no need to convert
        if (
          options.targetBuffer &&
          options.targetBuffer.type &&
          !isColorImage
        ) {
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
            Uint16Array,
            Int16Array,
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

        const imagePlaneModule: Types.ImagePlaneModuleMetadata =
          metaData.get(MetadataModules.IMAGE_PLANE, imageId) || {};
        const voiLutModule =
          metaData.get(MetadataModules.VOI_LUT, imageId) || {};
        const modalityLutModule =
          metaData.get(MetadataModules.MODALITY_LUT, imageId) || {};
        const sopCommonModule: Types.SopCommonModuleMetadata =
          metaData.get(MetadataModules.SOP_COMMON, imageId) || {};
        const calibrationModule =
          metaData.get(MetadataModules.CALIBRATION, imageId) || {};
        const { rows, columns } = imageFrame;

        if (isColorImage) {
          if (isColorConversionRequired(imageFrame)) {
            canvas.height = imageFrame.rows;
            canvas.width = imageFrame.columns;
            const context = canvas.getContext('2d');
            let imageData = context.createImageData(
              imageFrame.columns,
              imageFrame.rows
            );
            if (!useRGBA) {
              // Use a hard coded 3 samples per pixel for the destination, as the
              // original samples per pixel may not be 3 for palette color
              imageData = {
                ...imageData,
                data: new Uint8ClampedArray(
                  3 * imageFrame.columns * imageFrame.rows
                ),
              };
            }
            convertColorSpace(imageFrame, imageData.data, useRGBA);
            imageFrame.imageData = imageData;
            imageFrame.pixelData = imageData.data;
            imageFrame.pixelDataLength = imageData.data.length;
          } else if (
            !useRGBA &&
            imageFrame.pixelDataLength === 4 * rows * columns
          ) {
            // This case is the case where we need RGB (that is !useRGBA), and
            // we have RGBA (that is 4 values per pixel, not 3).  For this case,
            // remove the A value.
            // Note: rendering libraries like vtk expect Uint8Array for RGB images
            // otherwise they will convert them to Float32Array which might be slow
            const colorBuffer = new Uint8Array(
              (imageFrame.pixelData.length / 4) * 3
            );

            // remove the A from the RGBA of the imageFrame
            imageFrame.pixelData = removeAFromRGBA(
              imageFrame.pixelData,
              colorBuffer
            );

            imageFrame.pixelDataLength = imageFrame.pixelData.length;
          }
          // else {
          // No need to do any conversion - already RGB
          // Consider RGB to RGBA conversion?

          /** @todo check as any */
          // calculate smallest and largest PixelValue of the converted pixelData
          const minMax = getMinMax(imageFrame.pixelData);

          imageFrame.smallestPixelValue = minMax.min;
          imageFrame.largestPixelValue = minMax.max;
        }

        const voxelManager = utilities.VoxelManager.createImageVoxelManager({
          scalarData: imageFrame.pixelData,
          width: imageFrame.columns,
          height: imageFrame.rows,
          numberOfComponents: imageFrame.samplesPerPixel,
        });

        const image: DICOMLoaderIImage = {
          imageId,
          dataType: imageFrame.pixelData.constructor
            .name as Types.PixelDataTypedArrayString,
          color: isColorImage,
          calibration: calibrationModule,
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
          voxelManager,
          rgba: isColorImage && useRGBA,
          getPixelData: () => imageFrame.pixelData,
          getCanvas: undefined,
          numberOfComponents: imageFrame.samplesPerPixel,
        };

        if (image.color) {
          image.getCanvas = function () {
            // the getCanvas function is used in the CPU rendering path
            // and it is used to use the canvas api to draw the image
            // instead of looping through the pixel data and drawing each pixel
            // to use the canvas api, we need to convert the pixel data to a
            // Uint8ClampedArray (which is what the canvas api expects)
            // and then we can use the putImageData api to draw the image
            // However, if the image already was loaded without the alpha channel
            // we need to add the alpha channel back in
            if (lastImageIdDrawn === imageId) {
              return canvas;
            }

            const width = image.columns;
            const height = image.rows;

            canvas.height = height;
            canvas.width = width;
            const ctx = canvas.getContext('2d');
            const imageData = ctx.createImageData(width, height);

            const arr = imageFrame.pixelData;

            if (arr.length === width * height * 4) {
              for (let i = 0; i < arr.length; i++) {
                imageData.data[i] = arr[i];
              }
            }
            // Set pixel data for RGB array
            else if (arr.length === width * height * 3) {
              let j = 0;
              for (let i = 0; i < arr.length; i += 3) {
                imageData.data[j++] = arr[i];
                imageData.data[j++] = arr[i + 1];
                imageData.data[j++] = arr[i + 2];
                imageData.data[j++] = 255;
              }
            }

            imageFrame.pixelData = imageData.data;
            imageFrame.pixelDataLength = imageData.data.length;

            imageFrame.imageData = imageData;
            ctx.putImageData(imageFrame.imageData, 0, 0);
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
          // Note that by the DICOM definition, the window width and center are
          // 256/128 for an identity transform.
          image.windowWidth = 256;
          image.windowCenter = 128;
        }

        // set the ww/wc to cover the dynamic range of the image if no values are supplied
        if (
          image.windowCenter === undefined ||
          image.windowWidth === undefined
        ) {
          const minVoi = image.imageFrame.smallestPixelValue;
          const maxVoi = image.imageFrame.largestPixelValue;

          image.windowWidth = maxVoi - minVoi;
          image.windowCenter = (maxVoi + minVoi) / 2;
        }
        resolve(image);
      }, reject);
    }
  );
}

export default createImage;
