import * as cornerstone from '@cornerstonejs/core';
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
function createImage(image, imageId) {
  // extract the attributes we need
  const rows = image.naturalHeight;
  const columns = image.naturalWidth;

  function getPixelData(targetBuffer) {
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

    context.drawImage(image, 0, 0);
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
  };
}

function arrayBufferToImage(arrayBuffer) {
  return new Promise((resolve, reject) => {
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

//
// This is a cornerstone image loader for web images such as PNG and JPEG
//
const options = {
  // callback allowing customization of the xhr (e.g. adding custom auth headers, cors, etc)
  beforeSend: (xhr) => {
    // xhr
  },
};

// Loads an image given a url to an image
function loadImage(uri, imageId) {
  const xhr = new XMLHttpRequest();

  xhr.open('GET', uri, true);
  xhr.responseType = 'arraybuffer';
  options.beforeSend(xhr);

  xhr.onprogress = function (oProgress) {
    if (oProgress.lengthComputable) {
      // evt.loaded the bytes browser receive
      // evt.total the total bytes set by the header
      const loaded = oProgress.loaded;
      const total = oProgress.total;
      const percentComplete = Math.round((loaded / total) * 100);

      const eventDetail = {
        imageId,
        loaded,
        total,
        percentComplete,
      };

      cornerstone.triggerEvent(
        cornerstone.eventTarget,
        'cornerstoneimageloadprogress',
        eventDetail
      );
    }
  };

  const promise = new Promise((resolve, reject) => {
    xhr.onload = function () {
      const imagePromise = arrayBufferToImage(this.response);

      imagePromise
        .then((image) => {
          const imageObject = createImage(image, imageId);

          resolve(imageObject);
        }, reject)
        .catch((error) => {
          console.error(error);
        });
    };
    xhr.onerror = function (error) {
      reject(error);
    };

    xhr.send();
  });

  const cancelFn = () => {
    xhr.abort();
  };

  return {
    promise,
    cancelFn,
  };
}

function registerWebImageLoader(imageLoader): void {
  imageLoader.registerImageLoader('web', _loadImageIntoBuffer);
}

/**
 * Small stripped down loader from cornerstoneDICOMImageLoader
 * Which doesn't create cornerstone images that we don't need
 */
function _loadImageIntoBuffer(
  imageId: string,
  options?: Record<string, any>
): { promise: Promise<Record<string, any>>; cancelFn: () => void } {
  const uri = imageId.replace('web:', '');

  const promise = new Promise((resolve, reject) => {
    // get the pixel data from the server
    loadImage(uri, imageId)
      .promise.then(
        (image) => {
          if (
            !options ||
            !options.targetBuffer ||
            !options.targetBuffer.length ||
            !options.targetBuffer.offset
          ) {
            resolve(image);
            return;
          }

          // @ts-ignore
          image.getPixelData(options.targetBuffer);

          resolve(true);
        },
        (error) => {
          reject(error);
        }
      )
      .catch((error) => {
        reject(error);
      });
  });

  return {
    promise,
    cancelFn: undefined,
  };
}

export default registerWebImageLoader;
