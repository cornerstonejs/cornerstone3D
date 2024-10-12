import type { Types } from '@cornerstonejs/core';
//import cornerstoneDICOMImageLoader from '@cornerstonejs/dicom-image-loader';
import cornerstoneDICOMImageLoader from '../../../dicomImageLoader/src';
import dicomParser from 'dicom-parser';
import type { AddLogFn } from './logArea';
import { addToCache, dropFromCache, getFromCache } from './metadata';

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
): Types.IImageLoadObject {
  const sopInstanceUid = imageId.replace('custom:', '');
  logFn('Custom loader is starting to load image: ', sopInstanceUid);

  const promise = async () => {
    try {
      const buffer = await instanceToBytes(sopInstanceUid);
      const dataSet = dicomParser.parseDicom(new Uint8Array(buffer));
      // Add the dataSet to the cache immediately, since createImage()
      // already reads metadata.
      addToCache(imageId, dataSet);
      const pixelData =
        cornerstoneDICOMImageLoader.wadouri.getPixelData(dataSet);
      const transferSyntax = dataSet.string('x00020010');
      const image = await cornerstoneDICOMImageLoader.createImage(
        imageId,
        pixelData,
        transferSyntax,
        options as any
      );

      if (
        !options?.targetBuffer ||
        !options.targetBuffer.length ||
        !options.targetBuffer.offset
      ) {
        return image;
      }

      (image as any).getPixelData(options.targetBuffer);
      return true;
    } catch (e) {
      logFn('failed to load image ID', imageId, e);
      return false;
    }
  };

  return {
    promise: promise() as Promise<Types.IImage>,
    cancelFn: () => {
      dropFromCache(imageId);
    },
    decache: () => {
      dropFromCache(imageId);
    },
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
    metadataProvider: (type, imageId) => {
      const dataset = getFromCache(imageId);
      if (dataset) {
        return cornerstoneDICOMImageLoader.wadouri.metaData.metadataForDataset(
          type,
          imageId,
          dataset
        );
      }
    },
  };
}

export default createCustomImageLoader;
