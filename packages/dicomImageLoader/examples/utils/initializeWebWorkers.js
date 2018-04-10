// This script will load the WebWorkers and Codecs from unpkg url

function getBlobUrl (url) {
  const baseUrl = window.URL || window.webkitURL;
  const blob = new Blob([`importScripts('${url}')`], { type: 'application/javascript' });

  return baseUrl.createObjectURL(blob);
}

const webWorkerUrl = getBlobUrl('https://unpkg.com/cornerstone-wado-image-loader/dist/cornerstoneWADOImageLoaderWebWorker.min.js');
const codecsUrl = getBlobUrl('https://unpkg.com/cornerstone-wado-image-loader/dist/cornerstoneWADOImageLoaderCodecs.js');

try {
  window.cornerstoneWADOImageLoader.webWorkerManager.initialize({
    maxWebWorkers: 4,
    startWebWorkersOnDemand: true,
    webWorkerPath: webWorkerUrl,
    webWorkerTaskPaths: [],
    taskConfiguration: {
      decodeTask: {
        loadCodecsOnStartup: true,
        initializeCodecsOnStartup: false,
        codecsPath: codecsUrl,
        usePDFJS: false,
        strict: false
      }
    }
  });
} catch (error) {
  throw new Error('cornerstoneWADOImageLoader is not loaded');
}

