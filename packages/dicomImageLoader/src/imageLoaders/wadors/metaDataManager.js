/**
 */
(function (cornerstoneWADOImageLoader) {

  "use strict";

  var imageIds = [];

  function add(imageId, metadata) {
    imageIds[imageId] = metadata;
  }

  function get(imageId) {
    return imageIds[imageId];
  }

  function remove(imageId) {
    imageIds[imageId] = undefined;
  }

  function purge() {
    imageIds = [];
  }

  // module exports
  cornerstoneWADOImageLoader.wadors.metaDataManager = {
    add : add,
    get : get,
    remove:remove,
    purge: purge
  };

}(cornerstoneWADOImageLoader));