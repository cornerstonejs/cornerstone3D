function getBlobUrl (url) {
  const baseUrl = window.URL || window.webkitURL;
  const blob = new Blob([`importScripts('${url}')`], { type: 'application/javascript' });

  return baseUrl.createObjectURL(blob);
}

const webWorkerUrl = getBlobUrl('https://unpkg.com/cornerstone-wado-image-loader/dist/cornerstoneWADOImageLoaderWebWorker.min.js');
const codecsUrl = getBlobUrl('https://unpkg.com/cornerstone-wado-image-loader/dist/cornerstoneWADOImageLoaderCodecs.js');
const domain = window.location.origin;

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
