
(function ($, cornerstone, cornerstoneWADOImageLoader) {

  "use strict";

  // register dicomweb and wadouri image loader prefixes
  cornerstone.registerImageLoader('dicomweb', cornerstoneWADOImageLoader.internal.loadImage);
  cornerstone.registerImageLoader('wadouri', cornerstoneWADOImageLoader.internal.loadImage);

}($, cornerstone, cornerstoneWADOImageLoader));