function getBlobUrl (url) {
  const baseUrl = window.URL || window.webkitURL;
  const blob = new Blob([`importScripts('${url}')`], { type: 'application/javascript' });

  return baseUrl.createObjectURL(blob);
}

function UrlExists (url) {
  const http = new XMLHttpRequest();

  http.open('HEAD', url, false);
  http.send();

  return http.status !== 404;
}

let webWorkerUrl = getBlobUrl('https://unpkg.com/cornerstone-wado-image-loader/dist/cornerstoneWADOImageLoaderWebWorker.min.js');
let codecsUrl = getBlobUrl('https://unpkg.com/cornerstone-wado-image-loader/dist/cornerstoneWADOImageLoaderCodecs.js');
const domain = window.location.origin;

if (UrlExists('../../dist/cornerstoneWADOImageLoaderWebWorker.min.js')) {
  webWorkerUrl = '../../dist/cornerstoneWADOImageLoaderWebWorker.min.js';
}

if (UrlExists('../../dist/cornerstoneWADOImageLoaderCodecs.js')) {
  codecsUrl = '../dist/cornerstoneWADOImageLoaderCodecs.js';
}

window.customWebWorkerConfig = {
  maxWebWorkers: navigator.hardwareConcurrency || 1,
  startWebWorkersOnDemand: true,
  webWorkerPath: webWorkerUrl,
  webWorkerTaskPaths: [`${domain}/examples/customWebWorkerTask/convolveTask.js`],
  taskConfiguration: {
    decodeTask: {
      loadCodecsOnStartup: true,
      initializeCodecsOnStartup: false,
      codecsPath: codecsUrl,
      usePDFJS: false
    }
  }
};
