(function ($, cornerstone, cornerstoneWADOImageLoader) {

  "use strict";

  function xhrRequest(url, imageId) {

    var deferred = $.Deferred();

    // Make the request for the DICOM P10 SOP Instance
    var xhr = new XMLHttpRequest();
    xhr.responseType = "arraybuffer";
    xhr.open("get", url, true);
    cornerstoneWADOImageLoader.internal.options.beforeSend(xhr);
    xhr.onreadystatechange = function (oEvent) {
      // TODO: consider sending out progress messages here as we receive the pixel data
      if (xhr.readyState === 4) {
        if (xhr.status === 200) {
          // request succeeded, create an image object and resolve the deferred

          // Parse the DICOM File
          var dicomPart10AsArrayBuffer = xhr.response;
          var byteArray = new Uint8Array(dicomPart10AsArrayBuffer);
          var dataSet = dicomParser.parseDicom(byteArray);

          deferred.resolve(dataSet);
        }
        else {
          // request failed, reject the deferred
          deferred.reject(xhr.response);
        }
      }
    };
    xhr.onprogress = function (oProgress) {
      // console.log('progress:',oProgress)

      if (oProgress.lengthComputable) {  //evt.loaded the bytes browser receive
        //evt.total the total bytes seted by the header
        //
        var loaded = oProgress.loaded;
        var total = oProgress.total;
        var percentComplete = Math.round((loaded / total) * 100);

        $(cornerstone).trigger('CornerstoneImageLoadProgress', {
          imageId: imageId,
          loaded: loaded,
          total: total,
          percentComplete: percentComplete
        });
      }
    };

    xhr.send();

    return deferred;
  }

  cornerstoneWADOImageLoader.internal.xhrRequest = xhrRequest;
}($, cornerstone, cornerstoneWADOImageLoader));