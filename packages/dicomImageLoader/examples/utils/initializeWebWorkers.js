// This script will load the WebWorkers and Codecs from unpkg url
try {
  window.cornerstoneDICOMImageLoader.webWorkerManager.initialize({
    maxWebWorkers: 4,
    startWebWorkersOnDemand: true,
    webWorkerTaskPaths: [],
    taskConfiguration: {
      decodeTask: {
        initializeCodecsOnStartup: true,
        strict: true,
      },
    },
  });
} catch (error) {
  throw new Error('cornerstoneDICOMImageLoader is not loaded');
}
