import { getOptions } from './options';
import type {
  LoaderXhrRequestError,
  LoaderXhrRequestParams,
  LoaderXhrRequestPromise,
} from '../../types';
import { triggerEvent, eventTarget } from '@cornerstonejs/core';

function xhrRequest(
  url: string,
  imageId: string,
  defaultHeaders: Record<string, string> = {},
  params: LoaderXhrRequestParams = {}
): LoaderXhrRequestPromise<ArrayBuffer> {
  const options = getOptions();

  const errorInterceptor = (xhr: XMLHttpRequest) => {
    if (typeof options.errorInterceptor === 'function') {
      const error = new Error('request failed') as LoaderXhrRequestError;

      error.request = xhr;
      error.response = xhr.response;
      error.status = xhr.status;
      options.errorInterceptor(error);
    }
  };

  const xhr = new XMLHttpRequest();

  // Make the request for the DICOM P10 SOP Instance
  const promise: LoaderXhrRequestPromise<ArrayBuffer> =
    new Promise<ArrayBuffer>((resolve, reject) => {
      options.open(xhr, url, defaultHeaders, params);
      const beforeSendHeaders = options.beforeSend(
        xhr,
        imageId,
        defaultHeaders,
        params
      );

      xhr.responseType = 'arraybuffer';

      const headers = Object.assign({}, defaultHeaders, beforeSendHeaders);

      Object.keys(headers).forEach(function (key) {
        if (headers[key] === null) {
          return;
        }
        if (key === 'Accept' && url.indexOf('accept=') !== -1) {
          return;
        }
        xhr.setRequestHeader(key, headers[key]);
      });

      params.deferred = {
        resolve,
        reject,
      };
      params.url = url;
      params.imageId = imageId;

      // Event triggered when downloading an image starts
      xhr.onloadstart = function (event) {
        // Action
        if (options.onloadstart) {
          options.onloadstart(event, params);
        }

        // Event
        const eventData = {
          url,
          imageId,
        };

        triggerEvent(eventTarget, 'cornerstoneimageloadstart', eventData);
      };

      // Event triggered when downloading an image ends
      xhr.onloadend = function (event) {
        // Action
        if (options.onloadend) {
          options.onloadend(event, params);
        }

        const eventData = {
          url,
          imageId,
        };

        // Event
        triggerEvent(eventTarget, 'cornerstoneimageloadend', eventData);
      };

      // handle response data
      xhr.onreadystatechange = function (event) {
        // Action
        if (options.onreadystatechange) {
          options.onreadystatechange(event, params);

          // This should not return, because if a hook is defined, that function
          // will be called but the image load promise will never resolve.
          // return;
        }

        // Default action
        // TODO: consider sending out progress messages here as we receive
        // the pixel data
        if (xhr.readyState === 4) {
          // Status OK (200) and partial content (206) are both handled
          if (xhr.status === 200 || xhr.status === 206) {
            options
              .beforeProcessing(xhr)
              .then(resolve)
              .catch(() => {
                errorInterceptor(xhr);
                // request failed, reject the Promise
                reject(xhr);
              });
          } else {
            errorInterceptor(xhr);
            // request failed, reject the Promise
            reject(xhr);
          }
        }
      };

      // Event triggered when downloading an image progresses
      xhr.onprogress = function (oProgress) {
        // console.log('progress:',oProgress)
        const loaded = oProgress.loaded; // evt.loaded the bytes browser receive

        let total: number;

        let percentComplete: number;

        if (oProgress.lengthComputable) {
          total = oProgress.total; // evt.total the total bytes seted by the header
          percentComplete = Math.round((loaded / total) * 100);
        }

        const eventData = {
          url,
          imageId,
          loaded,
          total,
          percentComplete,
        };

        triggerEvent(eventTarget, 'cornerstoneimageloadprogress', eventData);

        // Action
        if (options.onprogress) {
          options.onprogress(oProgress, params);
        }
      };
      xhr.onerror = function () {
        errorInterceptor(xhr);
        reject(xhr);
      };

      xhr.onabort = function () {
        errorInterceptor(xhr);
        reject(xhr);
      };
      xhr.send();
    });

  promise.xhr = xhr;

  return promise;
}

export default xhrRequest;
