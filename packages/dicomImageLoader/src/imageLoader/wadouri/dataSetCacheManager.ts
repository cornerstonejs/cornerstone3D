import { DataSet } from 'dicom-parser';
import external from '../../externalModules';
import { xhrRequest } from '../internal/index';
import dataSetFromPartialContent from './dataset-from-partial-content';
import {
  LoadRequestFunction,
  DICOMLoaderDataSetWithFetchMore,
} from '../../types';
import { combineFrameInstanceDataset } from './combineFrameInstanceDataset';
import multiframeDataset from './retrieveMultiframeDataset';
import findIndexOfString from '../wadors/findIndexOfString';
import { findBoundary, uint8ArrayToString } from '../wadors/extractMultipart';

export interface CornerstoneWadoLoaderCacheManagerInfoResponse {
  cacheSizeInBytes: number;
  numberOfDataSetsCached: number;
}

export interface CornerstoneWadoLoaderCachedPromise
  extends Promise<DataSet | DICOMLoaderDataSetWithFetchMore> {
  cacheCount?: number;
}

/**
 * This object supports loading of DICOM P10 dataset from a uri and caching it so it can be accessed
 * by the caller.  This allows a caller to access the datasets without having to go through cornerstone's
 * image loader mechanism.  One reason a caller may need to do this is to determine the number of frames
 * in a multiframe sop instance so it can create the imageId's correctly.
 */
let cacheSizeInBytes = 0;

let loadedDataSets: Record<string, { dataSet: DataSet; cacheCount: number }> =
  {};

let promises: Record<string, CornerstoneWadoLoaderCachedPromise> = {};

// returns true if the wadouri for the specified index has been loaded
function isLoaded(uri: string): boolean {
  return loadedDataSets[uri] !== undefined;
}

function get(uri: string): DataSet {
  let dataSet;

  if (uri.includes('&frame=') || uri.includes('/frames/')) {
    const { frame, dataSet: multiframeDataSet } =
      multiframeDataset.retrieveMultiframeDataset(uri);

    dataSet = combineFrameInstanceDataset(frame, multiframeDataSet);
  } else if (loadedDataSets[uri]) {
    dataSet = loadedDataSets[uri].dataSet;
  }

  return dataSet;
}

function update(uri: string, dataSet: DataSet) {
  const loadedDataSet = loadedDataSets[uri];

  if (!loadedDataSet) {
    console.error(`No loaded dataSet for uri ${uri}`);

    return;
  }
  // Update dataset
  cacheSizeInBytes -= loadedDataSet.dataSet.byteArray.length;
  loadedDataSet.dataSet = dataSet;
  cacheSizeInBytes += dataSet.byteArray.length;

  external.cornerstone.triggerEvent(
    (external.cornerstone as any).events,
    'datasetscachechanged',
    {
      uri,
      action: 'updated',
      cacheInfo: getInfo(),
    }
  );
}

// loads the dicom dataset from the wadouri sp
function load(
  uri: string,
  loadRequest: LoadRequestFunction = xhrRequest,
  imageId: string
): CornerstoneWadoLoaderCachedPromise {
  const { cornerstone, dicomParser } = external;

  // if already loaded return it right away
  if (loadedDataSets[uri]) {
    // console.log('using loaded dataset ' + uri);
    return new Promise((resolve) => {
      loadedDataSets[uri].cacheCount++;
      resolve(loadedDataSets[uri].dataSet);
    });
  }

  // if we are currently loading this uri, increment the cacheCount and return its promise
  if (promises[uri]) {
    // console.log('returning existing load promise for ' + uri);
    promises[uri].cacheCount++;

    return promises[uri];
  }

  // This uri is not loaded or being loaded, load it via an xhrRequest
  const loadDICOMPromise = loadRequest(uri, imageId);

  // handle success and failure of the XHR request load
  const promise: CornerstoneWadoLoaderCachedPromise = new Promise(
    (resolve, reject) => {
      loadDICOMPromise
        .then(async function (dicomPart10AsArrayBuffer: any /* , xhr*/) {
          const partialContent = {
            isPartialContent: false,
            fileTotalLength: null,
          };

          // Allow passing extra data with the loader promise so as not to change
          // the API
          if (!(dicomPart10AsArrayBuffer instanceof ArrayBuffer)) {
            if (!dicomPart10AsArrayBuffer.arrayBuffer) {
              return reject(
                new Error(
                  'If not returning ArrayBuffer, must return object with `arrayBuffer` parameter'
                )
              );
            }
            partialContent.isPartialContent =
              dicomPart10AsArrayBuffer.flags.isPartialContent;
            partialContent.fileTotalLength =
              dicomPart10AsArrayBuffer.flags.fileTotalLength;
            dicomPart10AsArrayBuffer = dicomPart10AsArrayBuffer.arrayBuffer;
          }

          const byteArray = extractBoundedByteArray(dicomPart10AsArrayBuffer);

          // Reject the promise if parsing the dicom file fails
          let dataSet: DataSet | DICOMLoaderDataSetWithFetchMore;

          try {
            if (partialContent.isPartialContent) {
              // This dataSet object will include a fetchMore function,
              dataSet = await dataSetFromPartialContent(
                byteArray,
                loadRequest,
                {
                  uri,
                  imageId,
                  fileTotalLength: partialContent.fileTotalLength,
                }
              );
            } else {
              dataSet = dicomParser.parseDicom(byteArray);
            }
          } catch (error) {
            return reject(error);
          }

          loadedDataSets[uri] = {
            dataSet,
            cacheCount: promise.cacheCount,
          };
          cacheSizeInBytes += dataSet.byteArray.length;
          resolve(dataSet);

          cornerstone.triggerEvent(
            (cornerstone as any).events,
            'datasetscachechanged',
            {
              uri,
              action: 'loaded',
              cacheInfo: getInfo(),
            }
          );
        }, reject)
        .then(
          () => {
            // Remove the promise if success
            delete promises[uri];
          },
          () => {
            // Remove the promise if failure
            delete promises[uri];
          }
        );
    }
  );

  promise.cacheCount = 1;

  promises[uri] = promise;

  return promise;
}

// remove the cached/loaded dicom dataset for the specified wadouri to free up memory
function unload(uri: string): void {
  const { cornerstone } = external;

  // console.log('unload for ' + uri);
  if (loadedDataSets[uri]) {
    loadedDataSets[uri].cacheCount--;
    if (loadedDataSets[uri].cacheCount === 0) {
      // console.log('removing loaded dataset for ' + uri);
      cacheSizeInBytes -= loadedDataSets[uri].dataSet.byteArray.length;
      delete loadedDataSets[uri];

      cornerstone.triggerEvent(
        (cornerstone as any).events,
        'datasetscachechanged',
        {
          uri,
          action: 'unloaded',
          cacheInfo: getInfo(),
        }
      );
    }
  }
}

export function getInfo(): CornerstoneWadoLoaderCacheManagerInfoResponse {
  return {
    cacheSizeInBytes,
    numberOfDataSetsCached: Object.keys(loadedDataSets).length,
  };
}

// removes all cached datasets from memory
function purge(): void {
  loadedDataSets = {};
  promises = {};
  cacheSizeInBytes = 0;
}

/**
 * Converts Array Buffer to Uint8Array.
 * Checks whether it contains a boundary (as it's the case for multipart/related types).
 * If so, it extracts the data without the boundary.
 */
function extractBoundedByteArray(
  dicomPart10AsArrayBuffer: ArrayBuffer
): Uint8Array {
  const byteArray = new Uint8Array(dicomPart10AsArrayBuffer);
  const tokenIndex = findIndexOfString(byteArray, '\r\n\r\n');
  const header = uint8ArrayToString(byteArray, 0, tokenIndex).split('\r\n');
  const boundary = findBoundary(header);
  const offset = tokenIndex + 4; // skip over the \r\n\r\n

  if (boundary) {
    const endIndex = findIndexOfString(byteArray, boundary, offset);
    return byteArray.slice(offset, endIndex - 2); // Trim end boundary
  }

  return byteArray;
}

export default {
  isLoaded,
  load,
  unload,
  getInfo,
  purge,
  get,
  update,
};

export { loadedDataSets };
