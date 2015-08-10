(function (cornerstoneWADOImageLoader) {

  "use strict";

  function configure(options) {
    cornerstoneWADOImageLoader.internal.options = options;
  }

  // module exports
  cornerstoneWADOImageLoader.configure = configure;

}(cornerstoneWADOImageLoader));