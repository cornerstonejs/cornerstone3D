
cornerstoneWADOImageLoader = {};

function initializeTask(data) {
  //console.log('web worker initialize ', data.workerIndex);

  var config = data.config;

  //console.time('loadingCodecs');
  self.importScripts(config.codecsPath );
  //console.timeEnd('loadingCodecs');

  self.postMessage({
    message: 'initializeTaskCompleted',
    workerIndex: data.workerIndex
  });
}


function decodeTask(data) {
  var imageFrame = data.decodeTask.imageFrame;
  var pixelData = new Uint8Array(data.decodeTask.pixelData);
  var transferSyntax = data.decodeTask.transferSyntax;
  
  cornerstoneWADOImageLoader.decodeImageFrame(imageFrame, transferSyntax, pixelData);
  cornerstoneWADOImageLoader.calculateMinMax(imageFrame);

  imageFrame.pixelData = imageFrame.pixelData.buffer;

  self.postMessage({
    message: 'decodeTaskCompleted',
    imageFrame: imageFrame,
    workerIndex: data.workerIndex
  }, [imageFrame.pixelData]);
}


self.onmessage = function(msg) {
  //console.log('web worker onmessage', msg.data);
  if(msg.data.message === 'initializeTask') {
    initializeTask(msg.data);
  } else if(msg.data.message === 'decodeTask') {
    decodeTask(msg.data);
  }
};