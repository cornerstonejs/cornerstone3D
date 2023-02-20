import external from '../../externalModules.js';
import getPixelData from './getPixelData.js';
import createImage from '../createImage.js';

/**
 * Helper method to extract the transfer-syntax from the response of the server.
 * @param {string} contentType The value of the content-type header as returned by the WADO-RS server.
 * @return The transfer-syntax as announced by the server, or Implicit Little Endian by default.
 */
export function getTransferSyntaxForContentType(contentType) {
  const defaultTransferSyntax = '1.2.840.10008.1.2'; // Default is Implicit Little Endian.

  if (!contentType) {
    return defaultTransferSyntax;
  }

  // Browse through the content type parameters
  const parameters = contentType.split(';');
  const params = {};

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
    'image/jpeg': '1.2.840.10008.1.2.4.50',
    'image/x-dicom-rle': '1.2.840.10008.1.2.5',
    'image/x-jls': '1.2.840.10008.1.2.4.80',
    'image/jls': '1.2.840.10008.1.2.4.80',
    'image/jll': '1.2.840.10008.1.2.4.70',
    'image/jp2': '1.2.840.10008.1.2.4.90',
    'image/jpx': '1.2.840.10008.1.2.4.92',
    // Temporary types, until ratified by DICOM committed - TODO
    'image/jphc': '3.2.840.10008.1.2.4.96',
    'image/jxl': '1.2.840.10008.1.2.4.140',
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
  } else if (defaultTransferSyntaxByType[contentType]) {
    return defaultTransferSyntaxByType[contentType];
  }

  return defaultTransferSyntax;
}

function getImageRetrievalPool() {
  return external.cornerstone.imageRetrievalPoolManager;
}

function loadImage(imageId, options = {}) {
  const imageRetrievalPool = getImageRetrievalPool();

  const start = new Date().getTime();

  const promise = new Promise((resolve, reject) => {
    // TODO: load bulk data items that we might need

    // Uncomment this on to test jpegls codec in OHIF
    // const mediaType = 'multipart/related; type="image/x-jls"';
    // const mediaType = 'multipart/related; type="application/octet-stream"; transfer-syntax="image/x-jls"';
    const mediaType =
      'multipart/related; type=application/octet-stream; transfer-syntax=*';
    // const mediaType =
    //   'multipart/related; type="image/jpeg"; transfer-syntax=1.2.840.10008.1.2.4.50';

    function sendXHR(imageURI, imageId, mediaType) {
      // get the pixel data from the server
      return getPixelData(imageURI, imageId, mediaType)
        .then((result) => {
          const transferSyntax = getTransferSyntaxForContentType(
            result.contentType
          );

          const pixelData = result.imageFrame.pixelData;
          const imagePromise = createImage(
            imageId,
            pixelData,
            transferSyntax,
            options
          );

          imagePromise.then((image) => {
            // add the loadTimeInMS property
            const end = new Date().getTime();

            image.loadTimeInMS = end - start;
            resolve(image);
          }, reject);
        }, reject)
        .catch((error) => {
          reject(error);
        });
    }

    const requestType = options.requestType || 'interaction';
    const additionalDetails = options.additionalDetails || { imageId };
    const priority = options.priority === undefined ? 5 : options.priority;
    const addToBeginning = options.addToBeginning || false;
    const uri = imageId.substring(7);

    imageRetrievalPool.addRequest(
      sendXHR.bind(this, uri, imageId, mediaType),
      requestType,
      additionalDetails,
      priority,
      addToBeginning
    );
  });

  return {
    promise,
    cancelFn: undefined,
  };
}

export default loadImage;
