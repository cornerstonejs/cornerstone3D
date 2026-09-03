import {
  Enums,
  imageRetrievalPoolManager,
  utilities,
} from '@cornerstonejs/core';
import { Enums as csCoreEnums, type Types } from '@cornerstonejs/core';

import createImage from '../createImage';
import getPixelData from './getPixelData';
import { loadImageFromCompressedFrameRegistry } from './loadImageFromRegistry';
import type { DICOMLoaderIImage, DICOMLoaderImageOptions } from '../../types';

const { ProgressiveIterator } = utilities;
const { ImageQualityStatus } = Enums;
/**
 * How much the retrieved codestream has to grow before an incomplete frame is
 * decoded again at full resolution. Half as much again is enough to be visible
 * while keeping the number of decodes logarithmic in the frame size rather than
 * linear in the number of network chunks.
 */
const REDECODE_GROWTH_FACTOR = 1.5;

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
  // If a full Part 10 instance was prefetched/registered into the NATURALIZED
  // metadata registry, serve this frame from there instead of a per-frame
  // /frames/N request. Returns undefined (and we fall through to the network)
  // when nothing is registered for this frame.
  const registryPromise = loadImageFromCompressedFrameRegistry(
    imageId,
    options
  );
  if (registryPromise) {
    return {
      // A registry frame the worker can't decode must not be terminal: fall
      // back to the network /frames/N path, whose transfer-syntax=*
      // negotiation lets the server transcode to a decodable syntax.
      promise: registryPromise.catch((error) => {
        console.warn(
          `Failed to decode registry frame data for ${imageId}; falling back to network retrieval`,
          error
        );
        return loadImageFromNetwork(imageId, options).promise;
      }) as Promise<Types.IImage>,
      cancelFn: undefined,
    };
  }

  return loadImageFromNetwork(imageId, options);
}

function loadImageFromNetwork(
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
      let lastDecodedLength = 0;
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
        const retrieveDecodeLevel = options.retrieveOptions?.decodeLevel;
        // An explicit decodeLevel of 0 means "always decode at full
        // resolution", even from a truncated codestream.  OpenJPH tolerates
        // the truncation, and a full resolution decode of a partial stream
        // loses far less than decoding a sub-resolution image and scaling it
        // back up afterwards.
        const decodeLevel =
          result.decodeLevel ??
          (retrieveDecodeLevel === 0 ||
          imageQualityStatus === ImageQualityStatus.FULL_RESOLUTION
            ? 0
            : decodeLevelFromComplete(percentComplete, retrieveDecodeLevel));
        if (
          !shouldDecodeAgain({
            done,
            decodeLevel,
            lastDecodeLevel,
            encodedLength: pixelData?.length ?? 0,
            lastDecodedLength,
          })
        ) {
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
          lastDecodedLength = pixelData?.length ?? 0;
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
    options.requestType || csCoreEnums.RequestType.Interaction;
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

/**
 * Decides whether an incomplete frame is worth decoding again.
 *
 * A sub-resolution decode is only worth repeating when the level itself
 * improves - decoding the same level twice produces the same image. At full
 * resolution the level never changes, so the brake has to be how much new
 * codestream has arrived instead. Without one, a large frame would decode once
 * per network chunk: an 8MB frame arriving in 128k reads is ~64 full frame
 * decodes and renders, each allocating a fresh buffer. Requiring the
 * codestream to grow by REDECODE_GROWTH_FACTOR each time makes that
 * logarithmic - ~10 decodes for the same frame - while keeping the refinement
 * that makes full resolution partial decoding worth doing.
 *
 * A finished frame is always decoded, whatever the growth.
 */
export function shouldDecodeAgain({
  done,
  decodeLevel,
  lastDecodeLevel,
  encodedLength,
  lastDecodedLength,
}: {
  done: boolean;
  decodeLevel: number;
  lastDecodeLevel: number;
  encodedLength: number;
  lastDecodedLength: number;
}): boolean {
  if (done) {
    return true;
  }
  if (decodeLevel < lastDecodeLevel) {
    return true;
  }
  return (
    decodeLevel === 0 &&
    encodedLength >= lastDecodedLength * REDECODE_GROWTH_FACTOR
  );
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
