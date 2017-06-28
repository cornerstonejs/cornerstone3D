$(document).ready(function() {
    var config = {
        maxWebWorkers: navigator.hardwareConcurrency || 1,
        startWebWorkersOnDemand: true,
        webWorkerPath : '../js/cornerstoneWADOImageLoaderWebWorker.min.js',
        taskConfiguration: {
            'decodeTask' : {
                loadCodecsOnStartup : true,
                initializeCodecsOnStartup: false,
                codecsPath: '../js/cornerstoneWADOImageLoaderCodecs.min.js',
            }
        }
    };
    cornerstoneWADOImageLoader.webWorkerManager.initialize(config);
});