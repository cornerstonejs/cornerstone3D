
(function ($, cornerstone, cornerstoneWADOImageLoader) {

  "use strict";

  // register dicomfile image loader prefixes
  cornerstone.registerImageLoader('dicomfile', cornerstoneWADOImageLoader.internal.loadImage);

}($, cornerstone, cornerstoneWADOImageLoader));