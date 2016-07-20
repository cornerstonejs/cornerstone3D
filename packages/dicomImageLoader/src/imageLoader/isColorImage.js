(function (cornerstoneWADOImageLoader) {

  "use strict";

  var options = {
    // callback allowing customization of the xhr (e.g. adding custom auth headers, cors, etc)
    beforeSend : function(xhr) {}
  };

  function configure(opts) {
    options = opts;
  }

  function isColorImage(photoMetricInterpretation)
  {
    if(photoMetricInterpretation === "RGB" ||
      photoMetricInterpretation === "PALETTE COLOR" ||
      photoMetricInterpretation === "YBR_FULL" ||
      photoMetricInterpretation === "YBR_FULL_422" ||
      photoMetricInterpretation === "YBR_PARTIAL_422" ||
      photoMetricInterpretation === "YBR_PARTIAL_420" ||
      photoMetricInterpretation === "YBR_RCT" ||
      photoMetricInterpretation === "YBR_ICT")
    {
      return true;
    }
    else
    {
      return false;
    }
  }

  cornerstoneWADOImageLoader.isColorImage = isColorImage;

}(cornerstoneWADOImageLoader));