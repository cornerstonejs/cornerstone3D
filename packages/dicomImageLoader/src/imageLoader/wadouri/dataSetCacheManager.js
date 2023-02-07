import external from '../../externalModules.js';
import { xhrRequest } from '../internal/index.js';
import { combineFrameInstanceDataset } from './combineFrameInstanceDataset.js';
import multiframeDataset from './retrieveMultiframeDataset.js';
import dataSetFromPartialContent from './dataset-from-partial-content.js';

/**
 * This object supports loading of DICOM P10 dataset from a uri and caching it so it can be accessed
 * by the caller.  This allows a caller to access the datasets without having to go through cornerstone's
 * image loader mechanism.  One reason a caller may need to do this is to determine the number of frames
 * in a multiframe sop instance so it can create the imageId's correctly.
 */
let cacheSizeInBytes = 0;

let loadedDataSets = {};

let promises = {};

// returns true if the wadouri for the specified index has been loaded
function isLoaded(uri) {
  return loadedDataSets[uri] !== undefined;
}

function get(uri) {
  let dataSet;

  if (uri.includes('&frame=')) {
    const { frame, dataSet: multiframeDataSet } =
      multiframeDataset.retrieveMultiframeDataset(uri);

    dataSet = combineFrameInstanceDataset(frame, multiframeDataSet);
  } else if (loadedDataSets[uri]) {
    dataSet = loadedDataSets[uri].dataSet;
  }

  return dataSet;
}

function update(uri, dataSet) {
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
    external.cornerstone.events,
    'datasetscachechanged',
    {
      uri,
      action: 'updated',
      cacheInfo: getInfo(),
    }
  );
}

// loads the dicom dataset from the wadouri sp
function load(uri, loadRequest = xhrRequest, imageId) {
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
  const promise = new Promise((resolve, reject) => {
    loadDICOMPromise
      .then(async function (dicomPart10AsArrayBuffer) {
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

        const byteArray = new Uint8Array(dicomPart10AsArrayBuffer);

        // Reject the promise if parsing the dicom file fails
        let dataSet;

        try {
          if (partialContent.isPartialContent) {
            // This dataSet object will include a fetchMore function,
            dataSet = await dataSetFromPartialContent(byteArray, loadRequest, {
              uri,
              imageId,
              fileTotalLength: partialContent.fileTotalLength,
            });
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

        cornerstone.triggerEvent(cornerstone.events, 'datasetscachechanged', {
          uri,
          action: 'loaded',
          cacheInfo: getInfo(),
        });
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
  });

  promise.cacheCount = 1;

  promises[uri] = promise;

  return promise;
}

// remove the cached/loaded dicom dataset for the specified wadouri to free up memory
function unload(uri) {
  const { cornerstone } = external;

  // console.log('unload for ' + uri);
  if (loadedDataSets[uri]) {
    loadedDataSets[uri].cacheCount--;
    if (loadedDataSets[uri].cacheCount === 0) {
      // console.log('removing loaded dataset for ' + uri);
      cacheSizeInBytes -= loadedDataSets[uri].dataSet.byteArray.length;
      delete loadedDataSets[uri];

      cornerstone.triggerEvent(cornerstone.events, 'datasetscachechanged', {
        uri,
        action: 'unloaded',
        cacheInfo: getInfo(),
      });
    }
  }
}

function getInfo() {
  return {
    cacheSizeInBytes,
    numberOfDataSetsCached: Object.keys(loadedDataSets).length,
  };
}

// removes all cached datasets from memory
function purge() {
  loadedDataSets = {};
  promises = {};
  cacheSizeInBytes = 0;
}

export { loadedDataSets };

export default {
  isLoaded,
  load,
  unload,
  getInfo,
  purge,
  get,
  update,
};
