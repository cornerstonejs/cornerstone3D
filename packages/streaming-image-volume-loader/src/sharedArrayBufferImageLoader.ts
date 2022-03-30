import { Enums } from '@cornerstonejs/core';
import {
  getPixelData,
  decodeImageFrame,
  getImageFrame,
  external,
} from 'cornerstone-wado-image-loader/dist/dynamic-import/cornerstoneWADOImageLoader.min.js';

function getImageRetrievalPool() {
  return external.cornerstone.imageRetrievalPoolManager;
}

/**
 * Small stripped image loader from cornerstoneWADOImageLoader
 * Which doesn't create cornerstone images that we don't need. It it mainly
 * used (currently) by StreamingImageVolume to load each imageId and
 * insert the image into the volume at the correct location. Note: the reason
 * we don't use CornerstoneImageLoader (e.g., wadors image loader) is because
 * we don't need to create cornerstone image instance, since we treat a volume
 * as a whole which has one metadata and one 3D image.
 *
 * @param imageId - The imageId to load
 * @param options - options for loading
 *
 */
function sharedArrayBufferImageLoader(
  imageId: string,
  options?: Record<string, any>
): {
  promise: Promise<Record<string, any>>;
  cancelFn: () => void;
} {
  const imageRetrievalPool = getImageRetrievalPool();
  const uri = imageId.slice(imageId.indexOf(':') + 1);

  const promise = new Promise((resolve, reject) => {
    // TODO: load bulk data items that we might need
    const mediaType = 'multipart/related; type=application/octet-stream'; // 'image/dicom+jp2';

    // get the pixel data from the server
    function sendXHR(imageURI, imageId, mediaType) {
      return getPixelData(imageURI, imageId, mediaType)
        .then((result) => {
          const transferSyntax = getTransferSyntaxForContentType(
            result.contentType
          );

          const pixelData = result.imageFrame.pixelData;

          if (!pixelData || !pixelData.length) {
            reject(new Error('The file does not contain image data.'));
            return;
          }

          const canvas = document.createElement('canvas');
          const imageFrame = getImageFrame(imageId);
          const decodePromise = decodeImageFrame(
            imageFrame,
            transferSyntax,
            pixelData,
            canvas,
            options
          );

          decodePromise.then(() => {
            resolve(undefined);
          }, reject);
        })
        .catch((error) => {
          reject(error);
        });
    }

    // TODO: These probably need to be pulled from somewhere?
    // TODO: Make sure volume ID is also included?
    const requestType = options.requestType || Enums.RequestType.Interaction;
    const additionalDetails = options.additionalDetails || { imageId };
    const priority = options.priority === undefined ? 5 : options.priority;

    imageRetrievalPool.addRequest(
      sendXHR.bind(this, uri, imageId, mediaType),
      requestType,
      additionalDetails,
      priority
    );
  });

  return {
    promise,
    cancelFn: undefined,
  };
}

/**
 * Helper method to extract the transfer-syntax from the response of the server.
 *
 * @param contentType - The value of the content-type header as returned by a WADO-RS server.
 */
function getTransferSyntaxForContentType(contentType: string): string {
  const defaultTransferSyntax = '1.2.840.10008.1.2'; // Default is Implicit Little Endian.

  if (!contentType) {
    return defaultTransferSyntax;
  }

  // Browse through the content type parameters
  const parameters = contentType.split(';');
  const params: Record<string, any> = {};

  parameters.forEach((parameter) => {
    // Look for a transfer-syntax=XXXX pair
    const parameterValues = parameter.split('=');

    if (parameterValues.length !== 2) {
      return;
    }

    const value = parameterValues[1].trim().replace(/"/g, '');

    params[parameterValues[0].trim()] = value;
  });

  // This is useful if the PACS doesn't respond with a syntax
  // in the content type.
  // http://dicom.nema.org/medical/dicom/current/output/chtml/part18/chapter_6.html#table_6.1.1.8-3b
  const defaultTransferSyntaxByType = {
    'image/jpeg': '1.2.840.10008.1.2.4.70',
    'image/x-dicom-rle': '1.2.840.10008.1.2.5',
    'image/x-jls': '1.2.840.10008.1.2.4.80',
    'image/jp2': '1.2.840.10008.1.2.4.90',
    'image/jpx': '1.2.840.10008.1.2.4.92',
  };

  if (params['transfer-syntax']) {
    return params['transfer-syntax'];
  } else if (
    contentType &&
    !Object.keys(params).length &&
    defaultTransferSyntaxByType[contentType]
  ) {
    // dcm4che seems to be reporting the content type as just 'image/jp2'?
    return defaultTransferSyntaxByType[contentType];
  } else if (params.type && defaultTransferSyntaxByType[params.type]) {
    return defaultTransferSyntaxByType[params.type];
  }

  return defaultTransferSyntax;
}

export default sharedArrayBufferImageLoader;

export { getTransferSyntaxForContentType };
