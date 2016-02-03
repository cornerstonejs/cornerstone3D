/**
 */
(function (cornerstoneWADOImageLoader) {

  "use strict";

  var images = [];

  function add(image) {
    var fileIndex =  images.push(image);
    return 'wadors:' + (fileIndex - 1);
  }

  function get(index) {
    return images[index];
  }

  function remove(index) {
    images[index] = undefined;
  }

  function purge() {
    images = [];
  }

  // module exports
  cornerstoneWADOImageLoader.imageManager = {
    add : add,
    get : get,
    remove:remove,
    purge: purge
  };

}(cornerstoneWADOImageLoader));