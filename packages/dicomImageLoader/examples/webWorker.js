console.log('web worker');

var openJPEG;

function decodeOpenJPEG(data, bytesPerPixel, signed) {
  var dataPtr = openJPEG._malloc(data.length);
  openJPEG.writeArrayToMemory(data, dataPtr);

  // create param outpout
  var imagePtrPtr=openJPEG._malloc(4);
  var imageSizePtr=openJPEG._malloc(4);
  var imageSizeXPtr=openJPEG._malloc(4);
  var imageSizeYPtr=openJPEG._malloc(4);
  var imageSizeCompPtr=openJPEG._malloc(4);

  var t0 = Date.now();
  var ret = openJPEG.ccall('jp2_decode','number', ['number', 'number', 'number', 'number', 'number', 'number', 'number'],
    [dataPtr, data.length, imagePtrPtr, imageSizePtr, imageSizeXPtr, imageSizeYPtr, imageSizeCompPtr]);
  // add num vomp..etc
  if(ret !== 0){
    console.log('[opj_decode] decoding failed!')
    openJPEG._free(dataPtr);
    openJPEG._free(openJPEG.getValue(imagePtrPtr, '*'));
    openJPEG._free(imageSizeXPtr);
    openJPEG._free(imageSizeYPtr);
    openJPEG._free(imageSizePtr);
    openJPEG._free(imageSizeCompPtr);
    return undefined;
  }

  var imagePtr = openJPEG.getValue(imagePtrPtr, '*')

  var image = {
    length : openJPEG.getValue(imageSizePtr,'i32'),
    sx :  openJPEG.getValue(imageSizeXPtr,'i32'),
    sy :  openJPEG.getValue(imageSizeYPtr,'i32'),
    nbChannels : openJPEG.getValue(imageSizeCompPtr,'i32'), // hard coded for now
    perf_timetodecode : undefined,
    pixelData : undefined
  };

  // Copy the data from the EMSCRIPTEN heap into the correct type array
  var length = image.sx*image.sy*image.nbChannels;
  var src32 = new Int32Array(openJPEG.HEAP32.buffer, imagePtr, length);
  if(bytesPerPixel === 1) {
    if(Uint8Array.from) {
      image.pixelData = Uint8Array.from(src32);
    } else {
      image.pixelData = new Uint8Array(length);
      for(var i=0; i < length; i++) {
        image.pixelData[i] = src32[i];
      }
    }
  } else {
    if (signed) {
      if(Int16Array.from) {
        image.pixelData = Int16Array.from(src32);
      } else {
        image.pixelData = new Int16Array(length);
        for(var i=0; i < length; i++) {
          image.pixelData[i] = src32[i];
        }
      }
    } else {
      if(Uint16Array.from) {
        image.pixelData = Uint16Array.from(src32);
      } else {
        image.pixelData = new Uint16Array(length);
        for(var i=0; i < length; i++) {
          image.pixelData[i] = src32[i];
        }
      }
    }
  }

  var t1 = Date.now();
  image.perf_timetodecode = t1-t0;

  // free
  openJPEG._free(dataPtr);
  openJPEG._free(imagePtrPtr);
  openJPEG._free(imagePtr);
  openJPEG._free(imageSizePtr);
  openJPEG._free(imageSizeXPtr);
  openJPEG._free(imageSizeYPtr);
  openJPEG._free(imageSizeCompPtr);

  return image;
}

function decodeOpenJpeg2000(imageFrame, pixelData) {
  var bytesPerPixel = imageFrame.bitsAllocated <= 8 ? 1 : 2;
  var signed = imageFrame.pixelRepresentation === 1;

  var image = decodeOpenJPEG(pixelData, bytesPerPixel, signed);

  imageFrame.columns = image.sx;
  imageFrame.rows = image.sy;
  imageFrame.pixelData = image.pixelData.buffer;
  if(image.nbChannels > 1) {
    imageFrame.photometricInterpretation = "RGB";
  }
  return imageFrame;
}

function initializeTask(data) {
  console.log('web worker initialize ', data.workerIndex);

  var config = data.config;

  console.time('openJPEG');
  self.importScripts(config.openJPEG2000Path);
  openJPEG = OpenJPEG();
  console.timeEnd('openJPEG');

  self.postMessage({
    message: 'initializeTaskCompleted',
    workerIndex: data.workerIndex
  });
}

function decodeTask(data) {
  var imageFrame = data.decodeTask.imageFrame;
  var pixelData = new Uint8Array(data.decodeTask.pixelData);
  imageFrame = decodeOpenJpeg2000(imageFrame, pixelData);
  self.postMessage({
    message: 'decodeTaskCompleted',
    imageFrame: imageFrame,
    workerIndex: data.workerIndex
  }, [imageFrame.pixelData]);
}


self.onmessage = function(msg) {
  console.log('web worker onmessage', msg.data);
  if(msg.data.message === 'initializeTask') {
    initializeTask(msg.data);
  } else if(msg.data.message === 'decodeTask') {
    decodeTask(msg.data);
  }
};