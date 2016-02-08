(function (cornerstoneWADOImageLoader) {

    "use strict";

    function getRescaleSlopeAndIntercept(dataSet)
    {
        // NOTE - we default these to an identity transform since modality LUT
        // module is not required for all SOP Classes
        var result = {
            intercept : 0.0,
            slope: 1.0
        };

        if(dataSet.elements.x00281052 && dataSet.elements.x00281053) {
          result.intercept = dataSet.floatString('x00281052') || result.intercept;
          result.slope = dataSet.floatString('x00281053') || result.slope;
        }

        return result;
    }

    // module exports
    cornerstoneWADOImageLoader.getRescaleSlopeAndIntercept = getRescaleSlopeAndIntercept;
}(cornerstoneWADOImageLoader));