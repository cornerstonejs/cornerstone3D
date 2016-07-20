(function ($, cornerstoneWADOImageLoader) {

  "use strict";

  var decodeTasks = [];

  var webWorkers = [];

  var config = {
    maxWebWorkers: 1,
    webWorkerPath : '../../dist/cornerstoneWADOImageLoaderWebWorker.js',
    codecsPath: '../dist/cornerstoneWADOImageLoaderCodecs.js'
  };

  var statistics = {
    numDecodeTasksCompleted: 0,
    totalDecodeTimeInMS: 0,
    totalTimeDelayedInMS: 0,
  };

  function startTaskOnWebWorker() {
    if(!decodeTasks.length) {
      return;
    }
    
    for(var i=0; i < webWorkers.length; i++) {
       {
        if(webWorkers[i].status === 'ready') {
          webWorkers[i].status = 'busy';

          var decodeTask = decodeTasks.shift();

          decodeTask.start = new Date().getTime();

          var end = new Date().getTime();
          var delayed = end - decodeTask.added;
          statistics.totalTimeDelayedInMS += delayed;

          webWorkers[i].decodeTask = decodeTask;
          webWorkers[i].worker.postMessage({
            message: 'decodeTask',
            workerIndex: i,
            decodeTask: {
              imageFrame : decodeTask.imageFrame,
              transferSyntax : decodeTask.transferSyntax,
              pixelData: decodeTask.pixelData,
            }
          });
          return;
        }
      }
    }
  }

  function setPixelDataType(imageFrame) {
    if(imageFrame.bitsAllocated === 16) {
      if(imageFrame.pixelRepresentation === 0) {
        imageFrame.pixelData = new Uint16Array(imageFrame.pixelData);
      } else {
        imageFrame.pixelData = new Int16Array(imageFrame.pixelData);
      }
    } else {
      imageFrame.pixelData = new Uint8Array(imageFrame.pixelData);
    }
  }

  function handleMessageFromWorker(msg) {
    //console.log('handleMessageFromWorker', msg.data);
    if(msg.data.message === 'initializeTaskCompleted') {
      webWorkers[msg.data.workerIndex].status = 'ready';
      startTaskOnWebWorker();
    } else if(msg.data.message === 'decodeTaskCompleted') {
      webWorkers[msg.data.workerIndex].status = 'ready';
      setPixelDataType(msg.data.imageFrame);

      statistics.numDecodeTasksCompleted++;
      statistics.totalDecodeTimeInMS += msg.data.imageFrame.decodeTimeInMS;

      var end = new Date().getTime();
      msg.data.imageFrame.webWorkerTimeInMS = end - webWorkers[msg.data.workerIndex].decodeTask.start;

      webWorkers[msg.data.workerIndex].decodeTask.deferred.resolve(msg.data.imageFrame);
      webWorkers[msg.data.workerIndex].decodeTask = undefined;
      startTaskOnWebWorker();
    }
  }

  function initialize(configObject) {
    if(configObject) {
      config = configObject;
    }

    for(var i=0; i < config.maxWebWorkers; i++) {
      var worker = new Worker(config.webWorkerPath);
      webWorkers.push({
        worker: worker,
        status: 'initializing'
      });
      worker.addEventListener('message', handleMessageFromWorker);
      worker.postMessage({
        message: 'initializeTask',
        workerIndex: webWorkers.length - 1,
        config: config
      });
    }
  }

  function addTask(imageFrame, transferSyntax, pixelData) {
    var deferred = $.Deferred();
    decodeTasks.push({
      status: 'ready',
      added : new Date().getTime(),
      imageFrame : imageFrame,
      transferSyntax : transferSyntax,
      pixelData: pixelData,
      deferred: deferred
    });

    startTaskOnWebWorker();

    return deferred.promise();
  }

  function getStatistics() {
    return statistics;
  }

  initialize();
  
  // module exports
  cornerstoneWADOImageLoader.webWorkerManager = {
    initialize : initialize,
    addTask : addTask,
    getStatistics: getStatistics
  };

}($, cornerstoneWADOImageLoader));