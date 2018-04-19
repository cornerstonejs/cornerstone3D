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
let webWorkerTaskPath = 'https://rawgit.com/cornerstonejs/cornerstoneWADOImageLoader/master/examples/customWebWorkerTask/convolveTask.js';

// If running with build completed and DIST folder present
if (UrlExists('../../dist/cornerstoneWADOImageLoaderWebWorker.min.js')) {
  webWorkerUrl = '../../dist/cornerstoneWADOImageLoaderWebWorker.min.js';
  webWorkerTaskPath = '../examples/customWebWorkerTask/convolveTask.js';
}
if (UrlExists('../../dist/cornerstoneWADOImageLoaderCodecs.js')) {
  codecsUrl = '../dist/cornerstoneWADOImageLoaderCodecs.js';
}

window.customWebWorkerConfig = {
  maxWebWorkers: navigator.hardwareConcurrency || 1,
  startWebWorkersOnDemand: true,
  webWorkerPath: webWorkerUrl,
  webWorkerTaskPaths: [webWorkerTaskPath],
  taskConfiguration: {
    decodeTask: {
      loadCodecsOnStartup: true,
      initializeCodecsOnStartup: false,
      codecsPath: codecsUrl,
      usePDFJS: false
    }
  }
};
