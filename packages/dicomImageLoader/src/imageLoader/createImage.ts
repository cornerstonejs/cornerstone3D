import { ByteArray } from 'dicom-parser';
import external from '../externalModules';
import getMinMax from '../shared/getMinMax';
import getPixelDataTypeFromMinMax from '../shared/getPixelDataTypeFromMinMax';
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
import isColorImageFn from '../shared/isColorImage';

/**
 * When using typical decompressors to decompress compressed color images,
 * the resulting output is in RGB or RGBA format. Additionally, these images
 * are in planar configuration 0, meaning they are arranged by plane rather
 * than by color.  Consequently, the images only require a transformation from
 * RGBA to RGB without needing to use the photometric interpretation to convert
 * to RGB or adjust the planar configuration.
 */
const TRANSFER_SYNTAX_USING_PHOTOMETRIC_COLOR = {
  '1.2.840.10008.1.2.1': 'application/octet-stream',
  '1.2.840.10008.1.2': 'application/octet-stream',
  '1.2.840.10008.1.2.2': 'application/octet-stream',
  '1.2.840.10008.1.2.5': 'image/dicom-rle',
};

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

  const TypedArray = getPixelDataTypeFromMinMax(minValue, maxValue);

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
  const useRGBA = options.useRGBA;

  // always preScale the pixel array unless it is asked not to
  options.preScale = {
    enabled:
      options.preScale && options.preScale.enabled !== undefined
        ? options.preScale.enabled
        : false,
  };

  if (!pixelData?.length) {
    return Promise.reject(new Error('The pixel data is missing'));
  }

  const { cornerstone } = external;
  const { MetadataModules } = cornerstone.Enums;
  const canvas = document.createElement('canvas');
  const imageFrame = getImageFrame(imageId);
  imageFrame.decodeLevel = options.decodeLevel;

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

  // we need to identify if the target buffer is a SharedArrayBuffer
  // since inside the webworker we don't have access to the window
  // to say if it is a SharedArrayBuffer or not with instanceof
  options.isSharedArrayBuffer =
    options.targetBuffer?.arrayBuffer &&
    options.targetBuffer.arrayBuffer instanceof SharedArrayBuffer;

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
  const isColorImage = isColorImageFn(imageFrame.photometricInterpretation);

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
      // We can safely render color image in 8 bit, so no need to convert
      if (options.targetBuffer && options.targetBuffer.type && !isColorImage) {
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
        cornerstone.metaData.get(MetadataModules.IMAGE_PLANE, imageId) || {};
      const voiLutModule =
        cornerstone.metaData.get(MetadataModules.VOI_LUT, imageId) || {};
      const modalityLutModule =
        cornerstone.metaData.get(MetadataModules.MODALITY_LUT, imageId) || {};
      const sopCommonModule: MetadataSopCommonModule =
        cornerstone.metaData.get(MetadataModules.SOP_COMMON, imageId) || {};
      const calibrationModule =
        cornerstone.metaData.get(MetadataModules.CALIBRATION, imageId) || {};

      if (isColorImage) {
        const { rows, columns } = imageFrame;
        if (TRANSFER_SYNTAX_USING_PHOTOMETRIC_COLOR[transferSyntax]) {
          canvas.height = imageFrame.rows;
          canvas.width = imageFrame.columns;
          const context = canvas.getContext('2d');
          let imageData = context.createImageData(
            imageFrame.columns,
            imageFrame.rows
          );
          if (!useRGBA) {
            imageData = {
              ...imageData,
              data: new Uint8ClampedArray(
                imageFrame.samplesPerPixel *
                  imageFrame.columns *
                  imageFrame.rows
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
        const minMax = getMinMax(imageFrame.pixelData as any);

        imageFrame.smallestPixelValue = minMax.min;
        imageFrame.largestPixelValue = minMax.max;
      }

      const image: DICOMLoaderIImage = {
        imageId,
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
        rgba: isColorImage && useRGBA,
        getPixelData: () => imageFrame.pixelData,
        getCanvas: undefined,
        numComps: undefined,
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
      if (image.windowCenter === undefined || image.windowWidth === undefined) {
        const minVoi = image.imageFrame.minAfterScale;
        const maxVoi = image.imageFrame.maxAfterScale;

        image.windowWidth = maxVoi - minVoi;
        image.windowCenter = (maxVoi + minVoi) / 2;
      }
      resolve(image);
    }, reject);
  });
}

export default createImage;
