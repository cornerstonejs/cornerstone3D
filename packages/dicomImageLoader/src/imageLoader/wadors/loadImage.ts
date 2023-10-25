import { Types, Enums, utilities } from '@cornerstonejs/core';
import external from '../../externalModules';
import createImage from '../createImage';
import getPixelData from './getPixelData';
import { DICOMLoaderIImage, DICOMLoaderImageOptions } from '../../types';
import { getOptions } from '../internal/options';
import { RetrieveOptions } from 'core/src/types';

const { ProgressiveIterator } = utilities;
const { ImageStatus } = Enums;
const streamableTransferSyntaxes = new Set<string>();
streamableTransferSyntaxes.add('3.2.840.10008.1.2.4.96'); // 'jphc'

/**
 * Helper method to extract the transfer-syntax from the response of the server.
 * @param {string} contentType The value of the content-type header as returned by the WADO-RS server.
 * @return The transfer-syntax as announced by the server, or Implicit Little Endian by default.
 */
export function getTransferSyntaxForContentType(contentType: string): string {
  const defaultTransferSyntax = '1.2.840.10008.1.2'; // Default is Implicit Little Endian.
  if (!contentType) {
    return defaultTransferSyntax;
  }

  // Browse through the content type parameters
  const parameters = contentType.split(';');
  const params: Record<string, string> = {};

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

export interface StreamingData {
  url: string;
  encodedData?: Uint8Array;
  // Some values used by instances of streaming data for range
  totalBytes?: number;
  initialBytes?: number;
  totalRanges?: number;
  rangesFetched?: number;
}

export interface CornerstoneWadoRsLoaderOptions
  extends DICOMLoaderImageOptions {
  requestType?: string;
  additionalDetails?: {
    imageId: string;
  };
  priority?: number;
  addToBeginning?: boolean;
  retrieveTypeId?: string;
  transferSyntaxUID?: string;
  // Retrieve options are stored to provide sub-options for nested calls
  retrieveOptions?: RetrieveOptions;
  // Streaming data adds information about already streamed results.
  streamingData?: StreamingData;
}

// TODO: load bulk data items that we might need

// Uncomment this on to test jpegls codec in OHIF
// const mediaType = 'multipart/related; type="image/x-jls"';
// const mediaType = 'multipart/related; type="application/octet-stream"; transfer-syntax="image/x-jls"';
const mediaType =
  'multipart/related; type=application/octet-stream; transfer-syntax=*';

function loadImage(
  imageId: string,
  options: CornerstoneWadoRsLoaderOptions = {}
): Types.IImageLoadObject {
  const imageRetrievalPool = getImageRetrievalPool();

  const start = new Date().getTime();

  const { retrieveTypeId, transferSyntaxUID } = options;
  const loaderOptions = getOptions();
  options.retrieveOptions =
    loaderOptions.getRetrieveOptions(transferSyntaxUID, retrieveTypeId) || {};
  const uncompressedIterator = new ProgressiveIterator<DICOMLoaderIImage>(
    'decompress'
  );
  async function sendXHR(imageURI: string, imageId: string, mediaType: string) {
    uncompressedIterator.generate(async (it) => {
      // get the pixel data from the server
      const compressedIt = ProgressiveIterator.as(
        getPixelData(imageURI, imageId, mediaType, options)
      );
      let lastDecodeLevel = 10;
      for await (const result of compressedIt) {
        const {
          pixelData,
          status = ImageStatus.DONE,
          percentComplete,
          done = true,
        } = result;
        const transferSyntax = getTransferSyntaxForContentType(
          result.contentType
        );
        options.retrieveOptions = loaderOptions.getRetrieveOptions(
          transferSyntax,
          retrieveTypeId
        );
        if (!done && !options.retrieveOptions?.streaming) {
          continue;
        }
        const decodeLevel =
          result.decodeLevel ??
          (status === ImageStatus.DONE
            ? 0
            : decodeLevelFromComplete(
                percentComplete,
                options.retrieveOptions.decodeLevel
              ));
        if (!done && lastDecodeLevel <= decodeLevel) {
          // No point trying again yet
          continue;
        }

        try {
          const useOptions = {
            ...options,
            decodeLevel,
          };
          const image = await createImage(
            imageId,
            pixelData,
            transferSyntax,
            useOptions
          );

          // add the loadTimeInMS property
          const end = new Date().getTime();

          image.loadTimeInMS = end - start;
          console.log('Adding result', status, done);
          image.status = status;
          it.add(image, done);
          lastDecodeLevel = decodeLevel;
        } catch (e) {
          console.warn("Couldn't decode", e);
          if (done) {
            throw e;
          }
        }
      }
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

  return {
    promise: uncompressedIterator.getNextPromise(),
    cancelFn: undefined,
  };
}

/** The decode level is based on how much of hte data is needed for
 * each level.  It is a square function, so
 * level 4 only needs 1/25 of the data (eg (4+1)^2).  Add 2% to ensure
 * there is enough space
 */
function decodeLevelFromComplete(
  percent: number,
  retrieveDecodeLevel?: number
) {
  if (retrieveDecodeLevel !== undefined) {
    return retrieveDecodeLevel;
  }
  if (percent < 8) {
    return 4;
  }
  if (percent < 13) {
    return 3;
  }
  if (percent < 27) {
    return 2;
  }
  return 1;
}

export default loadImage;
