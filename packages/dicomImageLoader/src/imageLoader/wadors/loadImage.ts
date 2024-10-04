import {
  Enums,
  imageRetrievalPoolManager,
  utilities,
} from '@cornerstonejs/core';
import { Enums as csCoreEnums, type Types } from '@cornerstonejs/core';

import createImage from '../createImage';
import getPixelData from './getPixelData';
import type { DICOMLoaderIImage, DICOMLoaderImageOptions } from '../../types';

const { ProgressiveIterator } = utilities;
const { ImageQualityStatus } = Enums;
const streamableTransferSyntaxes = new Set<string>([
  // Private HTJ2K
  '3.2.840.10008.1.2.4.96',
  // Released HTJ2K - only the RPCL one is definitely streamable.
  '1.2.840.10008.1.2.4.202',
  // HTJ2K lossy might be streamable, so try it.  If it fails it is ok as it will
  // proceed and eventually work.
  '1.2.840.10008.1.2.4.203',
]);

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
  return imageRetrievalPoolManager;
}

export interface StreamingData {
  url: string;
  encodedData?: Uint8Array;
  // Some values used by instances of streaming data for range
  totalBytes?: number;
  chunkSize?: number;
  totalRanges?: number;
  rangesFetched?: number;
}

export interface CornerstoneWadoRsLoaderOptions
  extends DICOMLoaderImageOptions {
  requestType?: csCoreEnums.RequestType;
  additionalDetails?: {
    imageId: string;
  };
  priority?: number;
  addToBeginning?: boolean;
  retrieveType?: string;
  transferSyntaxUID?: string;
  // Retrieve options are stored to provide sub-options for nested calls
  retrieveOptions?: Types.RangeRetrieveOptions;
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
          imageQualityStatus = ImageQualityStatus.FULL_RESOLUTION,
          percentComplete,
          done = true,
          extractDone = true,
        } = result;
        const transferSyntax = getTransferSyntaxForContentType(
          result.contentType
        );
        if (!extractDone && !streamableTransferSyntaxes.has(transferSyntax)) {
          continue;
        }
        const decodeLevel =
          result.decodeLevel ??
          (imageQualityStatus === ImageQualityStatus.FULL_RESOLUTION
            ? 0
            : decodeLevelFromComplete(
                percentComplete,
                options.retrieveOptions?.decodeLevel
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
          const image = (await createImage(
            imageId,
            pixelData,
            transferSyntax,
            useOptions
          )) as DICOMLoaderIImage;

          // add the loadTimeInMS property
          const end = new Date().getTime();

          image.loadTimeInMS = end - start;
          image.transferSyntaxUID = transferSyntax;
          image.imageQualityStatus = imageQualityStatus;
          // The iteration is done even if the image itself isn't done yet
          it.add(image, done);
          lastDecodeLevel = decodeLevel;
        } catch (e) {
          if (extractDone) {
            console.warn("Couldn't decode", e);
            throw e;
          }
        }
      }
    });
  }

  const requestType =
    options.requestType || csCoreEnums.RequestType.INTERACTION;
  const additionalDetails = options.additionalDetails || { imageId };
  const priority = options.priority === undefined ? 5 : options.priority;
  const uri = imageId.substring(7);

  imageRetrievalPool.addRequest(
    sendXHR.bind(this, uri, imageId, mediaType),
    requestType,
    additionalDetails,
    priority
  );

  return {
    promise: uncompressedIterator.getDonePromise(),
    cancelFn: undefined,
  };
}

/** The decode level is based on how much of hte data is needed for
 * each level.  It is a square function, so
 * level 4 only needs 1/25 of the data (eg (4+1)^2).  Add 2% to ensure
 * there is enough space
 */
function decodeLevelFromComplete(percent: number, retrieveDecodeLevel = 4) {
  const testSize = percent / 100 - 0.02;
  if (testSize > 1 / 4) {
    return Math.min(retrieveDecodeLevel, 0);
  }
  if (testSize > 1 / 16) {
    return Math.min(retrieveDecodeLevel, 1);
  }
  if (testSize > 1 / 64) {
    return Math.min(retrieveDecodeLevel, 2);
  }
  return Math.min(retrieveDecodeLevel, 3);
}

export default loadImage;
