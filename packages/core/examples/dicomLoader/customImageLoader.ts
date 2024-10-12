import type * as cornerstone from '@cornerstonejs/core';
import hardcodedMetaDataProvider from './hardcodedMetaDataProvider';
import type { AddLogFn } from './logArea';

const canvas = document.createElement('canvas');
let lastImageIdDrawn;

// Todo: this loader should exist in a separate package in the same monorepo

/**
 * creates a cornerstone Image object for the specified Image and imageId
 *
 * @param image - An Image
 * @param imageId - the imageId for this image
 * @returns Cornerstone Image Object
 */
function createImage(image: HTMLImageElement, imageId: string) {
  // extract the attributes we need
  const rows = image.naturalHeight;
  const columns = image.naturalWidth;

  function getPixelData(targetBuffer?: any) {
    const imageData = getImageData();

    let targetArray;

    // Check if targetBuffer is provided for volume viewports
    if (targetBuffer) {
      targetArray = new Uint8Array(
        targetBuffer.arrayBuffer,
        targetBuffer.offset,
        targetBuffer.length
      );
    } else {
      targetArray = new Uint8Array(imageData.width * imageData.height * 3);
    }

    // modify original image data and remove alpha channel (RGBA to RGB)
    convertImageDataToRGB(imageData, targetArray);

    return targetArray;
  }

  function convertImageDataToRGB(imageData, targetArray) {
    for (let i = 0, j = 0; i < imageData.data.length; i += 4, j += 3) {
      targetArray[j] = imageData.data[i];
      targetArray[j + 1] = imageData.data[i + 1];
      targetArray[j + 2] = imageData.data[i + 2];
    }
  }

  function getImageData() {
    let context;

    if (lastImageIdDrawn === imageId) {
      context = canvas.getContext('2d');
    } else {
      canvas.height = image.naturalHeight;
      canvas.width = image.naturalWidth;
      context = canvas.getContext('2d');
      context.drawImage(image, 0, 0);
      lastImageIdDrawn = imageId;
    }

    return context.getImageData(0, 0, image.naturalWidth, image.naturalHeight);
  }

  function getCanvas() {
    if (lastImageIdDrawn === imageId) {
      return canvas;
    }

    canvas.height = image.naturalHeight;
    canvas.width = image.naturalWidth;
    const context = canvas.getContext('2d');

    context!.drawImage(image, 0, 0);
    lastImageIdDrawn = imageId;

    return canvas;
  }

  // Extract the various attributes we need
  return {
    imageId,
    minPixelValue: 0,
    maxPixelValue: 255,
    slope: 1,
    intercept: 0,
    windowCenter: 128,
    windowWidth: 255,
    getPixelData,
    getCanvas,
    getImage: () => image,
    rows,
    columns,
    height: rows,
    width: columns,
    color: true,
    // we converted the canvas rgba already to rgb above
    rgba: false,
    columnPixelSpacing: 1, // for web it's always 1
    rowPixelSpacing: 1, // for web it's always 1
    invert: false,
    sizeInBytes: rows * columns * 3,
    numberOfComponents: 3,
  };
}

function arrayBufferToImage(
  arrayBuffer: ArrayBuffer
): Promise<HTMLImageElement> {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    const arrayBufferView = new Uint8Array(arrayBuffer);
    const blob = new Blob([arrayBufferView]);
    const urlCreator = window.URL || window.webkitURL;
    const imageUrl = urlCreator.createObjectURL(blob);

    image.src = imageUrl;
    image.onload = () => {
      resolve(image);
      urlCreator.revokeObjectURL(imageUrl);
    };

    image.onerror = (error) => {
      urlCreator.revokeObjectURL(imageUrl);
      reject(error);
    };
  });
}

function _loadImageIntoBuffer(
  imageId: string,
  options:
    | {
        targetBuffer?: {
          arrayBuffer: ArrayBuffer;
          offset: number;
          length: number;
        };
      }
    | undefined,
  logFn: AddLogFn,
  instanceToBytes: (instanceId: string) => Promise<ArrayBuffer>
): {
  promise: Promise<Record<string, unknown> | boolean>;
  cancelFn: () => void;
} {
  const sopInstanceUid = imageId.replace('custom:', '');
  logFn('Custom loader is starting to load image: ', sopInstanceUid);

  const promise = async () => {
    try {
      const buffer = await instanceToBytes(sopInstanceUid);
      const image = await arrayBufferToImage(buffer);
      const imageObject = createImage(image, imageId);

      if (
        !options?.targetBuffer ||
        !options.targetBuffer.length ||
        !options.targetBuffer.offset
      ) {
        return imageObject;
      }

      imageObject.getPixelData(options.targetBuffer);
      return true;
    } catch (e) {
      logFn('failed to load image ID', imageId, e);
      return false;
    }
  };

  return {
    promise: promise(),
    cancelFn: () => {},
  };
}

function createCustomImageLoader(
  logFn: AddLogFn,
  instanceToBytes: (instanceId: string) => Promise<ArrayBuffer>
) {
  return {
    imageLoadFunction: (imageId: string, options: never) => {
      return _loadImageIntoBuffer(imageId, options, logFn, instanceToBytes);
    },
    metadataProvider: hardcodedMetaDataProvider,
  };
}

export default createCustomImageLoader;
