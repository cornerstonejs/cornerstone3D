import $ from 'jquery';
import { getOptions } from './options';
// TODO: import cornerstone from 'cornerstone';

"use strict";

function xhrRequest(url, imageId, headers) {
  headers = headers || {};
  
  var deferred = $.Deferred();
  var options = getOptions();

  // Make the request for the DICOM P10 SOP Instance
  var xhr = new XMLHttpRequest();
  xhr.open("get", url, true);
  xhr.responseType = "arraybuffer";
  options.beforeSend(xhr);
  Object.keys(headers).forEach(function (key) {
    xhr.setRequestHeader(key, headers[key]);
  });
  
  // handle response data
  xhr.onreadystatechange = function () {
    // TODO: consider sending out progress messages here as we receive the pixel data
    if (xhr.readyState === 4) {
      if (xhr.status === 200) {
        deferred.resolve(xhr.response, xhr);
      }
      else {
        // request failed, reject the deferred
        deferred.reject(xhr);
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

  return deferred.promise();
}

export default xhrRequest;
