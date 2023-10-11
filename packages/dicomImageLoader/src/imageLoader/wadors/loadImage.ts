import { Types, utilities } from '@cornerstonejs/core';
import external from '../../externalModules';
import createImage from '../createImage';
import getPixelData from './getPixelData';
import { DICOMLoaderIImage, DICOMLoaderImageOptions } from '../../types';
import { getOptions } from '../internal/options';
const { imageUtils, ProgressiveIterator } = utilities;

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

export interface CornerstoneWadoRsLoaderOptions
  extends DICOMLoaderImageOptions {
  requestType?: string;
  additionalDetails?: {
    imageId: string;
  };
  priority?: number;
  addToBeginning?: boolean;
  retrieveTypeId?: string;
  transferSyntaxUid?: string;
}

const optionsCache: { [key: string]: CornerstoneWadoRsLoaderOptions } = {};

// TODO: load bulk data items that we might need

// Uncomment this on to test jpegls codec in OHIF
// const mediaType = 'multipart/related; type="image/x-jls"';
// const mediaType = 'multipart/related; type="application/octet-stream"; transfer-syntax="image/x-jls"';
const mediaType =
  'multipart/related; type=application/octet-stream; transfer-syntax=*';
// const mediaType =
//   'multipart/related; type="image/jpeg"; transfer-syntax=1.2.840.10008.1.2.4.50';

function loadImage(
  imageId: string,
  options: CornerstoneWadoRsLoaderOptions = {}
): Types.IImageLoadObject {
  const imageRetrievalPool = getImageRetrievalPool();

  const start = new Date().getTime();

  const { retrieveTypeId, transferSyntaxUid } = options;
  const loaderOptions = getOptions();
  let retrieveOptions =
    loaderOptions.getRetrieveOptions(transferSyntaxUid, retrieveTypeId) || {};
  const uncompressedIterator = new ProgressiveIterator<DICOMLoaderIImage>(
    'decompress'
  );
  async function sendXHR(imageURI: string, imageId: string, mediaType: string) {
    uncompressedIterator.generate(async (it) => {
      // get the pixel data from the server
      const compressedIt = ProgressiveIterator.as(
        getPixelData(imageURI, imageId, mediaType, retrieveOptions)
      );
      let lastDecodeLevel = 10;
      for await (const result of compressedIt) {
        const { done } = compressedIt;
        const transferSyntax = getTransferSyntaxForContentType(
          result.contentType
        );
        retrieveOptions = loaderOptions.getRetrieveOptions(
          transferSyntax,
          retrieveTypeId
        );
        const { pixelData, isLossy = false, percentComplete } = result;
        const complete = done && !isLossy;
        if (!streamableTransferSyntaxes.has(transferSyntax) && !done) {
          continue;
        }
        const completeText = complete
          ? 'complete'
          : `${done ? 'done' : 'streaming'}${isLossy ? ' lossy' : ''}`;
        const decodeLevel =
          result.decodeLevel ??
          (done ? 0 : decodeLevelFromComplete(percentComplete));
        if (!done && lastDecodeLevel <= decodeLevel) {
          // No point trying again yet
          continue;
        }

        try {
          const useOptions = {
            ...options,
            decodeLevel: retrieveOptions?.decodeLevel ?? 0,
          };
          if (retrieveOptions?.needsScale) {
            delete useOptions.targetBuffer;
            useOptions.skipCreateImage = false;
          }
          console.log('Creating image', transferSyntax, useOptions);
          let image = await createImage(
            imageId,
            pixelData,
            transferSyntax,
            useOptions
          );

          if (retrieveOptions?.needsScale && options.targetBuffer.arrayBuffer) {
            image = scaleImage(image, options.targetBuffer);
          } else {
            console.log(
              'Wrote to target buffer',
              options.targetBuffer.offset / options.targetBuffer.length / 4
            );
          }

          // add the loadTimeInMS property
          const end = new Date().getTime();

          image.loadTimeInMS = end - start;
          image.complete = complete;
          image.isLossy = isLossy;
          image.stageId = retrieveOptions?.id;
          console.log(
            `loadImage:Received ${completeText} uncompressed data in`,
            end - start,
            'ms'
          );
          it.add(image, complete || true);
          lastDecodeLevel = decodeLevel;
        } catch (e) {
          console.warn("Couldn't decode" + completeText, e);
          if (complete) {
            throw e;
          }
        }
      }
      // Cache in the pool when done
      return uncompressedIterator.getDonePromise();
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
function decodeLevelFromComplete(percent: number) {
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

function createSrc(image) {
  const {
    rows,
    columns,
    pixelData,
    bitsPerPixel,
    pixelRepresentation,
    samplesPerPixel,
  } = image;
  let arrayConstructor = Float32Array;
  if (bitsPerPixel === 8) {
    arrayConstructor = pixelRepresentation ? Uint8Array : Int8Array;
  } else if (bitsPerPixel === 16) {
    arrayConstructor = pixelRepresentation ? Uint16Array : Int16Array;
  }
  return {
    data: new arrayConstructor(pixelData),
    rows,
    columns,
    samplesPerPixel,
  };
}

function createDest(targetBuffer) {
  const { rows, columns, arrayBuffer, offset, length } = targetBuffer;
  console.log('Scaling for buffer', offset / length / 2);
  return {
    data: new Float32Array(arrayBuffer, offset, length),
    rows,
    columns,
  };
}

// Replicate is faster, but bilinear is smoother
const scalingType = 'bilinear';

function scaleImage(image, targetBuffer) {
  const { arrayBuffer, rows, columns } = targetBuffer;
  if (!rows || !columns) {
    console.log('Not scaling, no rows/columns');
    return;
  }
  const src = createSrc(image);
  const dest = createDest(targetBuffer);
  if (!src || !dest) {
    console.log('Not scaling, no src/dest', src, dest);
    return;
  }
  if (image.samplesPerPixel > 1) {
    imageUtils.replicate(src, dest);
  } else {
    imageUtils[scalingType](src, dest);
  }
  return {
    ...image,
    rows,
    columns,
    arrayBuffer,
  };
}

export default loadImage;
