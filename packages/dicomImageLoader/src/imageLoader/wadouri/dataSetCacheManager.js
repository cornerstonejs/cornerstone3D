import { dicomParser } from '../../externalModules.js';
import { xhrRequest } from '../internal/index.js';

/**
 * This object supports loading of DICOM P10 dataset from a uri and caching it so it can be accessed
 * by the caller.  This allows a caller to access the datasets without having to go through cornerstone's
 * image loader mechanism.  One reason a caller may need to do this is to determine the number of frames
 * in a multiframe sop instance so it can create the imageId's correctly.
 */
let loadedDataSets = {};
let promises = {};

// returns true if the wadouri for the specified index has been loaded
function isLoaded (uri) {
  return loadedDataSets[uri] !== undefined;
}

function get (uri) {
  // if already loaded return it right away
  if (!loadedDataSets[uri]) {
    return;
  }

  return loadedDataSets[uri].dataSet;
}


// loads the dicom dataset from the wadouri sp
function load (uri, loadRequest = xhrRequest, imageId) {
  // if already loaded return it right away
  if (loadedDataSets[uri]) {
    // console.log('using loaded dataset ' + uri);
    return new Promise((resolve) => {
      loadedDataSets[uri].cacheCount++;
      resolve(loadedDataSets[uri].dataSet);
    });
  }

  // if we are currently loading this uri, return its promise
  if (promises[uri]) {
    // console.log('returning existing load promise for ' + uri);
    return promises[uri];
  }

  // This uri is not loaded or being loaded, load it via an xhrRequest
  const loadDICOMPromise = loadRequest(uri, imageId);

  // handle success and failure of the XHR request load
  const promise = new Promise((resolve, reject) => {
    loadDICOMPromise.then(function (dicomPart10AsArrayBuffer/* , xhr*/) {
      const byteArray = new Uint8Array(dicomPart10AsArrayBuffer);

      // Reject the promise if parsing the dicom file fails
      let dataSet;

      try {
        dataSet = dicomParser.parseDicom(byteArray);
      } catch (error) {
        return reject(error);
      }

      loadedDataSets[uri] = {
        dataSet,
        cacheCount: 1
      };

      resolve(dataSet);
    }, (error) => {
      reject(error);
    }).then(() => {
      // Remove the promise regardless of success or failure
      delete promises[uri];
    });
  });

  promises[uri] = promise;

  return promise;
}

// remove the cached/loaded dicom dataset for the specified wadouri to free up memory
function unload (uri) {
  // console.log('unload for ' + uri);
  if (loadedDataSets[uri]) {
    loadedDataSets[uri].cacheCount--;
    if (loadedDataSets[uri].cacheCount === 0) {
      // console.log('removing loaded dataset for ' + uri);
      delete loadedDataSets[uri];
    }
  }
}

// removes all cached datasets from memory
function purge () {
  loadedDataSets = {};
  promises = {};
}

export default {
  isLoaded,
  load,
  unload,
  purge,
  get
};
