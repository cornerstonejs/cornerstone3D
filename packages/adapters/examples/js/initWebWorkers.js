$(document).ready(function() {
    // Inject the current cornerstone version into the
    // WADO Image Loader and Tools libraries
    cornerstone.external.$ = $;
    cornerstoneTools.external.$ = $;
    // cornerstoneTools.external.Hammer = Hammer;
    cornerstoneTools.external.cornerstone = cornerstone;
    cornerstoneWADOImageLoader.external.cornerstone = cornerstone;

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