/**
 * This object supports loading of DICOM P10 dataset from a uri and caching it so it can be accessed
 * by the caller.  This allows a caller to access the datasets without having to go through cornerstone's
 * image loader mechanism.  One reason a caller may need to do this is to determine the number of frames
 * in a multiframe sop instance so it can create the imageId's correctly.
 */
(function (cornerstoneWADOImageLoader) {

  "use strict";

  var loadedDataSets = {};
  var promises = {};

  // returns true if the wadouri for the specified index has been loaded
  function isLoaded(uri) {
    return loadedDataSets[uri] !== undefined;
  }

  // loads the dicom dataset from the wadouri sp
  function load(uri, loadRequest) {

    // if already loaded return it right away
    if(loadedDataSets[uri]) {
      //console.log('using loaded dataset ' + uri);
      var alreadyLoadedpromise = $.Deferred();
      loadedDataSets[uri].cacheCount++;
      alreadyLoadedpromise.resolve(loadedDataSets[uri].dataSet);
      return alreadyLoadedpromise;
    }

    // if we are currently loading this uri, return its promise
    if(promises[uri]) {
      //console.log('returning existing load promise for ' + uri);
      return promises[uri];
    }

    //console.log('loading ' + uri);

    // This uri is not loaded or being loaded, load it via an xhrRequest
    var promise = loadRequest(uri);
    promises[uri] = promise;

    // handle success and failure of the XHR request load
    promise.then(function(dataSet) {
      loadedDataSets[uri] = {
        dataSet: dataSet,
        cacheCount: 1
      };
      // done loading, remove the promise
      delete promises[uri];
    }, function () {
    }).always(function() {
        // error thrown, remove the promise
        delete promises[uri];
      });
    return promise;
  }

  // remove the cached/loaded dicom dataset for the specified wadouri to free up memory
  function unload(uri) {
    //console.log('unload for ' + uri);
    if(loadedDataSets[uri]) {
      loadedDataSets[uri].cacheCount--;
      if(loadedDataSets[uri].cacheCount === 0) {
        //console.log('removing loaded dataset for ' + uri);
        delete loadedDataSets[uri];
      }
    }
  }

  // removes all cached datasets from memory
  function purge() {
    loadedDataSets = {};
    promises = {};
  }

  // module exports
  cornerstoneWADOImageLoader.dataSetCacheManager = {
    isLoaded: isLoaded,
    load: load,
    unload: unload,
    purge: purge
  };

}(cornerstoneWADOImageLoader));