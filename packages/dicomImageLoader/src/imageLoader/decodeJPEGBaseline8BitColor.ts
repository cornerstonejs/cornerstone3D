import type { ByteArray } from 'dicom-parser';
import getMinMax from '../shared/getMinMax';
import type { Types } from '@cornerstonejs/core';

/**
 * Special decoder for 8 bit jpeg that leverages the browser's built in JPEG decoder for increased performance
 */

function arrayBufferToString(buffer: ArrayBuffer) {
  return binaryToString(
    String.fromCharCode.apply(
      null,
      Array.prototype.slice.apply(new Uint8Array(buffer))
    )
  );
}

function binaryToString(binary: string) {
  let error;

  try {
    return decodeURIComponent(escape(binary));
  } catch (_error) {
    error = _error;
    if (error instanceof URIError) {
      return binary;
    }
    throw error;
  }
}

function decodeJPEGBaseline8BitColor(
  imageFrame: Types.IImageFrame,
  pixelData: ByteArray,
  canvas: HTMLCanvasElement
): Promise<Types.IImageFrame> {
  const start = new Date().getTime();
  const imgBlob = new Blob([pixelData], { type: 'image/jpeg' });

  return new Promise((resolve, reject) => {
    const fileReader = new FileReader();

    if (fileReader.readAsBinaryString === undefined) {
      fileReader.readAsArrayBuffer(imgBlob);
    } else {
      fileReader.readAsBinaryString(imgBlob); // doesn't work on IE11
    }

    fileReader.onload = function () {
      const img = new Image();

      img.onload = function () {
        canvas.height = img.height;
        canvas.width = img.width;
        imageFrame.rows = img.height;
        imageFrame.columns = img.width;
        const context = canvas.getContext('2d');

        /**
         * @todo check this context
         */
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        context.drawImage(this as any, 0, 0);
        const imageData = context.getImageData(0, 0, img.width, img.height);
        const end = new Date().getTime();

        imageFrame.pixelData = new Uint8Array(imageData.data.buffer);
        imageFrame.imageData = imageData;
        imageFrame.decodeTimeInMS = end - start;

        // calculate smallest and largest PixelValue
        const minMax = getMinMax(imageFrame.pixelData);

        imageFrame.smallestPixelValue = minMax.min;
        imageFrame.largestPixelValue = minMax.max;
        imageFrame.pixelDataLength = imageFrame.pixelData.length;

        resolve(imageFrame);
      };

      img.onerror = function (error) {
        reject(error);
      };

      if (fileReader.readAsBinaryString === undefined) {
        img.src = `data:image/jpeg;base64,${window.btoa(
          arrayBufferToString(fileReader.result as ArrayBuffer)
        )}`;
      } else {
        img.src = `data:image/jpeg;base64,${window.btoa(
          fileReader.result as string
        )}`; // doesn't work on IE11
      }
    };

    fileReader.onerror = (e) => {
      reject(e);
    };
  });
}

export default decodeJPEGBaseline8BitColor;
