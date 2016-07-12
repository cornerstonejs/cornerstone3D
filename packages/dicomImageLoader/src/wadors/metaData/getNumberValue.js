/**
 */
(function (cornerstoneWADOImageLoader) {

  "use strict";

  function getNumberValue(element, index) {
    var value = cornerstoneWADOImageLoader.wadors.getValue(element, index);
    if(value === undefined) {
      return;
    }
    return parseFloat(value);
  }


  // module exports
  cornerstoneWADOImageLoader.wadors.getNumberValue = getNumberValue

}(cornerstoneWADOImageLoader));